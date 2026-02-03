/**
 * Collection Service
 * Business logic for collection management
 */

import fs from 'fs/promises';
import path from 'path';
import type { FastifyInstance, FastifyBaseLogger } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig, RefreshedItem, MDBListItem } from '../../types/index.js';
import { cacheImage } from '../../utils/image-cache.js';
import { syncCollections } from '../emby/sync-service.js';
import { refreshFromMdblist, fetchMdblistItemDetails } from './helpers/refresh-mdblist.js';
import { refreshFromTrakt } from './helpers/refresh-trakt.js';
import { generateCollectionPoster } from '../../utils/collection-poster.js';

const POSTERS_DIR = path.resolve(process.cwd(), 'uploads/posters');

async function hasUploadedPoster(collectionId: string): Promise<boolean> {
  try {
    const files = await fs.readdir(POSTERS_DIR);
    return files.some((file) => file.startsWith(collectionId));
  } catch {
    return false;
  }
}

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
    const tmdbApiKey = settings?.tmdbApiKey || this.config.external.tmdb.apiKey;

    let totalItems = 0;

    if (sourceType === 'MDBLIST') {
      totalItems = await this.refreshMdblistProgressive(
        collectionId,
        sourceId!,
        mdblistApiKey,
        tmdbApiKey
      );
    } else if (['TRAKT_LIST', 'TRAKT_WATCHLIST', 'TRAKT_COLLECTION'].includes(sourceType)) {
      const collection = await this.prisma.collection.findUnique({
        where: { id: collectionId },
      });
      if (collection) {
        const items = await refreshFromTrakt(collection, settings, this.config);
        const seenTmdbIds = new Set<string>();
        const dedupedItems = items.filter((item) => {
          if (item.tmdbId) {
            if (seenTmdbIds.has(item.tmdbId)) {
              return false;
            }
            seenTmdbIds.add(item.tmdbId);
          }
          return true;
        });

        if (dedupedItems.length === 0) {
          await this.prisma.collectionItem.deleteMany({
            where: { collectionId },
          });
          totalItems = 0;
        } else {
          const existingItems = await this.prisma.collectionItem.findMany({
            where: { collectionId },
            select: {
              imdbId: true,
              tmdbId: true,
              tvdbId: true,
              inEmby: true,
              embyItemId: true,
            },
          });

          const existingByImdb = new Map(existingItems.filter(item => item.imdbId).map(item => [item.imdbId!, item]));
          const existingByTmdb = new Map(existingItems.filter(item => item.tmdbId).map(item => [item.tmdbId!, item]));
          const existingByTvdb = new Map(existingItems.filter(item => item.tvdbId).map(item => [item.tvdbId!, item]));

          await this.prisma.$transaction([
            this.prisma.collectionItem.deleteMany({
              where: { collectionId },
            }),
            this.prisma.collectionItem.createMany({
              data: dedupedItems.map((item) => {
                const existingByImdbItem = item.imdbId ? existingByImdb.get(item.imdbId) : undefined;
                const existingByTmdbItem = item.tmdbId ? existingByTmdb.get(item.tmdbId) : undefined;
                const existingByTvdbItem = item.tvdbId ? existingByTvdb.get(item.tvdbId) : undefined;
                const existing = existingByImdbItem || existingByTmdbItem || existingByTvdbItem;

                return {
                  collectionId,
                  ...item,
                  inEmby: existing?.inEmby ?? false,
                  embyItemId: existing?.embyItemId ?? null,
                };
              }),
            }),
          ]);

          totalItems = dedupedItems.length;
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
    apiKey: string | undefined,
    tmdbApiKey: string | undefined
  ): Promise<number> {
    if (!apiKey) {
      throw new Error('MDBList API key not configured');
    }

    try {
      this.log.info(`MDBList: Starting optimized refresh for collection ${collectionId}`);
      
      const enrichedItems = await refreshFromMdblist(listId, apiKey, this.config, tmdbApiKey);
      
      if (enrichedItems.length === 0) {
        this.log.warn(`MDBList: No items found for list ${listId}`);
        await this.removeStaleItems(collectionId, enrichedItems);
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
        
        const collection = await this.prisma.collection.findUnique({
          where: { id: collectionId },
          select: { name: true, posterPath: true },
        });
        
        if (collection) {
          const customPosterPath = `/api/v1/collections/${collectionId}/poster`;
          const uploadedPosterExists = await hasUploadedPoster(collectionId);

          if (uploadedPosterExists) {
            if (collection.posterPath !== customPosterPath) {
              await this.prisma.collection.update({
                where: { id: collectionId },
                data: { posterPath: customPosterPath },
              });
            }
            this.log.info(`Custom poster detected for collection ${collectionId}, skipping auto-generation`);
          } else {
            generateCollectionPoster({
              collectionId,
              collectionName: collection.name,
            }).then(async (posterUrl) => {
              if (posterUrl) {
                await this.prisma.collection.update({
                  where: { id: collectionId },
                  data: { posterPath: posterUrl },
                });
                this.log.info(`Generated poster for collection ${collectionId}`);
              }
            }).catch(err => {
              this.log.warn(`Failed to generate poster for collection ${collectionId}: ${err.message}`);
            });
          }
        }
      }
      
      const removedCount = await this.removeStaleItems(collectionId, enrichedItems);
      if (removedCount > 0) {
        this.log.info(`MDBList: Removed ${removedCount} stale items from collection ${collectionId}`);
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

  private async removeStaleItems(collectionId: string, refreshedItems: RefreshedItem[]): Promise<number> {
    const tmdbIds = new Set<string>();
    const imdbIds = new Set<string>();
    const tvdbIds = new Set<string>();

    for (const item of refreshedItems) {
      if (item.tmdbId) tmdbIds.add(item.tmdbId);
      if (item.imdbId) imdbIds.add(item.imdbId);
      if (item.tvdbId) tvdbIds.add(item.tvdbId);
    }

    const existingItems = await this.prisma.collectionItem.findMany({
      where: { collectionId },
      select: {
        id: true,
        tmdbId: true,
        imdbId: true,
        tvdbId: true,
      },
    });

    const toDelete: string[] = [];
    for (const item of existingItems) {
      if (item.tmdbId) {
        if (!tmdbIds.has(item.tmdbId)) {
          toDelete.push(item.id);
        }
        continue;
      }

      if (item.imdbId) {
        if (!imdbIds.has(item.imdbId)) {
          toDelete.push(item.id);
        }
        continue;
      }

      if (item.tvdbId && !tvdbIds.has(item.tvdbId)) {
        toDelete.push(item.id);
      }
    }

    if (toDelete.length === 0) {
      return 0;
    }

    const chunkSize = 200;
    let deleted = 0;
    for (let i = 0; i < toDelete.length; i += chunkSize) {
      const chunk = toDelete.slice(i, i + chunkSize);
      const result = await this.prisma.collectionItem.deleteMany({
        where: { id: { in: chunk } },
      });
      deleted += result.count;
    }

    return deleted;
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
