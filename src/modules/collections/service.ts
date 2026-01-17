/**
 * Collection Service
 * Business logic for collection management
 */

import type { FastifyInstance, FastifyBaseLogger } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig, RefreshedItem, MDBListItem } from '../../types/index.js';
import { cacheImage } from '../../utils/image-cache.js';
import { syncCollections } from '../emby/sync-service.js';
import { refreshFromMdblist, fetchMdblistItemDetails } from './helpers/refresh-mdblist.js';
import { refreshFromTrakt } from './helpers/refresh-trakt.js';

export interface CollectionServiceOptions {
  prisma: PrismaClient;
  config: AppConfig;
  log: FastifyBaseLogger;
}

export class CollectionService {
  private prisma: PrismaClient;
  private config: AppConfig;
  private log: FastifyBaseLogger;

  constructor(options: CollectionServiceOptions) {
    this.prisma = options.prisma;
    this.config = options.config;
    this.log = options.log;
  }

  /**
   * Refresh a collection from its source
   */
  async refreshCollection(
    collectionId: string,
    sourceType: string,
    sourceId: string | undefined,
    syncToEmbyOnRefresh: boolean
  ): Promise<number> {
    const settings = await this.prisma.settings.findUnique({
      where: { id: 'singleton' },
    });
    const mdblistApiKey = settings?.mdblistApiKey || this.config.external.mdblist.apiKey;

    let totalItems = 0;

    if (sourceType === 'MDBLIST') {
      totalItems = await this.refreshMdblistProgressive(
        collectionId,
        sourceId!,
        mdblistApiKey,
        syncToEmbyOnRefresh
      );
    } else if (['TRAKT_LIST', 'TRAKT_WATCHLIST', 'TRAKT_COLLECTION'].includes(sourceType)) {
      const collection = await this.prisma.collection.findUnique({
        where: { id: collectionId },
      });
      if (collection) {
        const items = await refreshFromTrakt(collection, settings, this.config);
        if (items.length > 0) {
          await this.prisma.collectionItem.createMany({
            data: items.map((item) => ({
              collectionId,
              ...item,
            })),
          });
          totalItems = items.length;
        }
      }
    }

    if (totalItems > 0) {
      await this.prisma.collection.update({
        where: { id: collectionId },
        data: { lastSyncAt: new Date() },
      });

      if (syncToEmbyOnRefresh) {
        await syncCollections({
          prisma: this.prisma,
          collectionId,
        });
      }

      this.log.info(`Refresh completed for collection ${collectionId}: ${totalItems} items`);
    }

    return totalItems;
  }

  /**
   * Progressive refresh for MDBList - adds items one by one for real-time UI updates
   */
  private async refreshMdblistProgressive(
    collectionId: string,
    listId: string,
    apiKey: string | undefined,
    syncToEmbyOnRefresh: boolean
  ): Promise<number> {
    if (!apiKey) {
      throw new Error('MDBList API key not configured');
    }

    try {
      const response = await fetch(
        `${this.config.external.mdblist.baseUrl}/lists/${listId}/items?apikey=${apiKey}`
      );

      if (!response.ok) {
        throw new Error(`MDBList API error: ${response.status}`);
      }

      const data = await response.json();

      let items: MDBListItem[];
      if (Array.isArray(data)) {
        items = data;
      } else if (data.items && Array.isArray(data.items)) {
        items = data.items;
      } else if (data.movies && Array.isArray(data.movies)) {
        items = data.movies;
      } else if (data.shows && Array.isArray(data.shows)) {
        items = data.shows;
      } else {
        throw new Error(`MDBList API returned unexpected format`);
      }

      this.log.info(`MDBList: Starting progressive fetch of ${items.length} items for collection ${collectionId}`);

      let addedCount = 0;
      const seenTmdbIds = new Set<string>();

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item) continue;

        // Check if collection still exists (might have been deleted)
        if (i % 50 === 0) {
          const collectionExists = await this.prisma.collection.findUnique({
            where: { id: collectionId },
            select: { id: true },
          });
          if (!collectionExists) {
            this.log.info(`Collection ${collectionId} was deleted, stopping refresh`);
            return addedCount;
          }
        }

        try {
          const enrichedItem = await fetchMdblistItemDetails(item, apiKey, this.config);

          // Skip duplicates
          if (enrichedItem.tmdbId && seenTmdbIds.has(enrichedItem.tmdbId)) {
            continue;
          }
          if (enrichedItem.tmdbId) {
            seenTmdbIds.add(enrichedItem.tmdbId);
          }

          if (enrichedItem.tmdbId) {
            await this.prisma.collectionItem.upsert({
              where: {
                collectionId_tmdbId: {
                  collectionId,
                  tmdbId: enrichedItem.tmdbId,
                },
              },
              create: {
                collectionId,
                ...enrichedItem,
              },
              update: {
                ...enrichedItem,
              },
            });
          } else {
            await this.prisma.collectionItem.create({
              data: {
                collectionId,
                ...enrichedItem,
              },
            });
          }

          addedCount++;

          if (addedCount % 10 === 0) {
            this.log.debug(`MDBList: Added ${addedCount}/${items.length} items to collection ${collectionId}`);
          }

          if (i < items.length - 1) {
            await new Promise(r => setTimeout(r, 50));
          }
        } catch (itemError) {
          const errorMsg = (itemError as Error).message;
          if (errorMsg.includes('Foreign key')) {
            this.log.info(`Collection ${collectionId} was deleted, stopping refresh`);
            return addedCount;
          }
          this.log.warn(`Failed to add item ${i + 1} to collection ${collectionId}: ${errorMsg}`);
        }
      }

      this.log.info(`MDBList: Successfully added ${addedCount}/${items.length} items to collection ${collectionId}`);
      return addedCount;
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error(
          `Network error: Failed to connect to MDBList API at ${this.config.external.mdblist.baseUrl}`
        );
      }
      throw error;
    }
  }
}

/**
 * Create a collection service instance from Fastify context
 */
export function createCollectionService(fastify: FastifyInstance): CollectionService {
  return new CollectionService({
    prisma: fastify.prisma,
    config: fastify.config,
    log: fastify.log,
  });
}
