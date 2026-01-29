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
    sourceId: string | undefined
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
        mdblistApiKey
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

      await syncCollections({
        prisma: this.prisma,
        collectionId,
      });

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
    apiKey: string | undefined
  ): Promise<number> {
    if (!apiKey) {
      throw new Error('MDBList API key not configured');
    }

    try {
      this.log.info(`MDBList: Starting optimized refresh for collection ${collectionId}`);
      
      const enrichedItems = await refreshFromMdblist(listId, apiKey, this.config);
      
      if (enrichedItems.length === 0) {
        this.log.warn(`MDBList: No items found for list ${listId}`);
        return 0;
      }

      this.log.info(`MDBList: Fetched ${enrichedItems.length} items, saving to database...`);

      let addedCount = 0;
      const seenTmdbIds = new Set<string>();

      for (let i = 0; i < enrichedItems.length; i++) {
        const enrichedItem = enrichedItems[i];
        if (!enrichedItem) continue;

        // Check if collection still exists every 50 items
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
            this.log.debug(`MDBList: Saved ${addedCount}/${enrichedItems.length} items to collection ${collectionId}`);
          }
        } catch (itemError) {
          const errorMsg = (itemError as Error).message;
          if (errorMsg.includes('Foreign key')) {
            this.log.info(`Collection ${collectionId} was deleted, stopping refresh`);
            return addedCount;
          }
          this.log.warn(`Failed to save item ${i + 1} to collection ${collectionId}: ${errorMsg}`);
        }
      }

      this.log.info(`MDBList: Successfully saved ${addedCount}/${enrichedItems.length} items to collection ${collectionId}`);
      
      if (addedCount > 0) {
        await this.prisma.collection.update({
          where: { id: collectionId },
          data: { lastItemAddedAt: new Date() },
        });
      }
      
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
