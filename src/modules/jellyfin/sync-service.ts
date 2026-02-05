/**
 * Jellyfin Sync Service
 * Handles syncing ACdb collections to Jellyfin servers
 * Collections and servers are now global (shared across all users)
 */

import { createJellyfinClient } from './client.js';
import { readFile, readdir } from 'fs/promises';
import path from 'path';
import { decryptApiKey } from '../../utils/api-key-crypto.js';
import { generateCollectionPoster } from '../../utils/collection-poster.js';
import { getPostersDir } from '../../utils/paths.js';
import { createLogger } from '../../utils/runtime-logger.js';
import { SEARCH_RESULTS_LIMIT, SYNC_LOG_ERROR_LIMIT, SYNC_LOG_MATCHED_ITEMS_LIMIT } from '../../config/constants.js';
import type { PrismaClient, Collection, CollectionItem, JellyfinServer } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';

const POSTERS_DIR = getPostersDir();

interface CollectionWithItems {
  id: string;
  name: string;
  description: string | null;
  sourceType: string;
  sourceId: string | null;
  sourceUrl: string | null;
  posterPath: string | null;
  isEnabled: boolean;
  lastSyncAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items: CollectionItem[];
  jellyfinServers?: Array<{ jellyfinServerId: string }>;
}

interface MatchedItem {
  title: string;
  jellyfinId: string;
  matchedBy: string;
}

export interface SyncResult {
  collectionId: string;
  collectionName: string;
  jellyfinServerId: string;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  itemsTotal: number;
  itemsMatched: number;
  itemsFailed: number;
  errors: string[];
  matchedItems: MatchedItem[];
}

interface SyncCollectionsOptions {
  userId?: string; // Optional - for audit trail
  prisma: PrismaClient;
  collectionId?: string;
  jellyfinServerId?: string;
  logger?: FastifyBaseLogger;
}

export interface SyncCollectionsResult {
  success: boolean;
  error?: string;
  totalCollections?: number;
  totalServers?: number;
  results: SyncResult[];
}

interface PosterData {
  buffer: Buffer;
  mimeType: string;
}

type LogContext = Record<string, unknown>;

interface SyncLogger {
  debug: (message: string, context?: LogContext) => void;
  info: (message: string, context?: LogContext) => void;
  warn: (message: string, context?: LogContext) => void;
  error: (message: string, context?: LogContext) => void;
}

const fallbackLogger = createLogger('jellyfin.sync');

function createSyncLogger(logger?: FastifyBaseLogger): SyncLogger {
  if (!logger) {
    return fallbackLogger;
  }

  return {
    debug: (message, context) => {
      if (context && Object.keys(context).length > 0) {
        logger.debug(context, message);
        return;
      }
      logger.debug(message);
    },
    info: (message, context) => {
      if (context && Object.keys(context).length > 0) {
        logger.info(context, message);
        return;
      }
      logger.info(message);
    },
    warn: (message, context) => {
      if (context && Object.keys(context).length > 0) {
        logger.warn(context, message);
        return;
      }
      logger.warn(message);
    },
    error: (message, context) => {
      if (context && Object.keys(context).length > 0) {
        logger.error(context, message);
        return;
      }
      logger.error(message);
    },
  };
}

export async function syncCollectionToJellyfin({
  collection,
  jellyfinServer,
  prisma,
  userId,
  logger,
}: {
  collection: CollectionWithItems;
  jellyfinServer: JellyfinServer;
  prisma: PrismaClient;
  userId?: string;
  logger?: FastifyBaseLogger;
}): Promise<SyncResult> {
  const log = createSyncLogger(logger);
  const decryptedApiKey = decryptApiKey(jellyfinServer.apiKey, jellyfinServer.apiKeyIv);
  const client = createJellyfinClient(jellyfinServer.url, decryptedApiKey);

  if (!client) {
    throw new Error('Failed to create Jellyfin client');
  }

  const result: SyncResult = {
    collectionId: collection.id,
    collectionName: collection.name,
    jellyfinServerId: jellyfinServer.id,
    status: 'SUCCESS',
    itemsTotal: collection.items?.length || 0,
    itemsMatched: 0,
    itemsFailed: 0,
    errors: [],
    matchedItems: [],
  };

  try {
    log.info('Starting collection sync', {
      collectionId: collection.id,
      collectionName: collection.name,
      serverId: jellyfinServer.id,
      serverName: jellyfinServer.name,
      itemsTotal: result.itemsTotal,
    });

    const matchedItemIds: string[] = [];
    const itemUpdates: Array<{ id: string; inJellyfin: boolean; jellyfinItemId: string | null }> = [];

    for (const item of collection.items || []) {
      log.debug('Searching for collection item', {
        itemId: item.id,
        title: item.title,
        imdbId: item.imdbId,
        tmdbId: item.tmdbId,
        tvdbId: item.tvdbId,
      });

      try {
        const jellyfinItem = await client.findItemByAnyProviderId({
          imdbId: item.imdbId,
          tmdbId: item.tmdbId,
          tvdbId: item.tvdbId,
          title: item.title,
          year: item.year,
          mediaType: item.mediaType,
        });

        if (jellyfinItem) {
          log.debug('Matched collection item in Jellyfin', {
            itemId: item.id,
            title: item.title,
            jellyfinItemId: jellyfinItem.Id,
          });
          result.itemsMatched++;
          result.matchedItems.push({
            title: item.title,
            jellyfinId: jellyfinItem.Id,
            matchedBy: 'providerId',
          });
          matchedItemIds.push(jellyfinItem.Id);
          itemUpdates.push({ id: item.id, inJellyfin: true, jellyfinItemId: jellyfinItem.Id });
        } else {
          log.debug('No Jellyfin match for collection item', {
            itemId: item.id,
            title: item.title,
            year: item.year,
          });
          result.itemsFailed++;
          result.errors.push(`No match found: ${item.title} (${item.year || 'unknown year'})`);
          itemUpdates.push({ id: item.id, inJellyfin: false, jellyfinItemId: null });
        }
      } catch (error) {
        log.warn('Error while matching collection item in Jellyfin', {
          itemId: item.id,
          title: item.title,
          error: (error as Error).message,
        });
        result.itemsFailed++;
        result.errors.push(`Error matching ${item.title}: ${(error as Error).message}`);
        itemUpdates.push({ id: item.id, inJellyfin: false, jellyfinItemId: null });
      }
    }

    for (const update of itemUpdates) {
      try {
        await prisma.collectionItem.update({
          where: { id: update.id },
          data: { inJellyfin: update.inJellyfin, jellyfinItemId: update.jellyfinItemId },
        });
      } catch (updateError) {
        log.warn('Failed to persist Jellyfin match state for collection item', {
          itemId: update.id,
          error: (updateError as Error).message,
        });
      }
    }

    if (matchedItemIds.length === 0) {
      result.status = 'FAILED';
      result.errors.push('No items from this collection exist in your Jellyfin library');
    } else {
      let jellyfinCollection = await client.getCollectionByName(collection.name);

      if (!jellyfinCollection) {
        const created = await client.createCollection(collection.name, [matchedItemIds[0]!]);
        jellyfinCollection = { Id: created.Id, Name: collection.name, Type: 'BoxSet' };

        if (matchedItemIds.length > 1) {
          await client.addItemsToCollection(jellyfinCollection.Id, matchedItemIds.slice(1));
        }
      } else {
        const existingItems = await client.getCollectionItems(jellyfinCollection.Id);
        const existingItemIds = new Set(existingItems.map(i => i.Id));

        const newItemIds = matchedItemIds.filter(id => !existingItemIds.has(id));
        if (newItemIds.length > 0) {
          await client.addItemsToCollection(jellyfinCollection.Id, newItemIds);
        }

        const itemsToRemove = existingItems
          .map(item => item.Id)
          .filter(id => !matchedItemIds.includes(id));

        if (itemsToRemove.length > 0) {
          await client.removeItemsFromCollection(jellyfinCollection.Id, itemsToRemove);
        }
      }

      log.debug('Evaluating poster sync', {
        collectionId: collection.id,
        hasPosterPath: Boolean(collection.posterPath),
        hasJellyfinCollectionId: Boolean(jellyfinCollection?.Id),
      });

      if (!collection.posterPath && jellyfinCollection?.Id) {
        log.info('Collection has no poster; generating one', {
          collectionId: collection.id,
          collectionName: collection.name,
        });
        try {
          const posterUrl = await generateCollectionPoster({
            collectionId: collection.id,
            collectionName: collection.name,
          });
          if (posterUrl) {
            await prisma.collection.update({
              where: { id: collection.id },
              data: { posterPath: posterUrl },
            });
            collection.posterPath = posterUrl;
            log.info('Auto-generated collection poster', {
              collectionId: collection.id,
              collectionName: collection.name,
              posterUrl,
            });
          }
        } catch (genError) {
          log.warn('Failed to auto-generate collection poster', {
            collectionId: collection.id,
            collectionName: collection.name,
            error: (genError as Error).message,
          });
        }
      }

      if (collection.posterPath && jellyfinCollection?.Id) {
        try {
          const posterData = await getCollectionPosterData(collection.id, collection.posterPath, log);
          if (posterData) {
            const uploadResult = await client.uploadItemImage(
              jellyfinCollection.Id,
              'Primary',
              posterData.buffer,
              posterData.mimeType
            );
            log.info('Synced poster to Jellyfin collection', {
              collectionId: collection.id,
              collectionName: collection.name,
              jellyfinCollectionId: jellyfinCollection.Id,
              uploadResult,
              bytes: posterData.buffer.length,
              mimeType: posterData.mimeType,
            });
          } else {
            log.warn('No poster data returned for collection', {
              collectionId: collection.id,
              collectionName: collection.name,
              posterPath: collection.posterPath,
            });
          }
        } catch (posterError) {
          log.warn('Failed to sync collection poster to Jellyfin', {
            collectionId: collection.id,
            collectionName: collection.name,
            jellyfinCollectionId: jellyfinCollection.Id,
            error: (posterError as Error).message,
          });
        }
      } else {
        log.debug('Skipping poster sync', {
          collectionId: collection.id,
          collectionName: collection.name,
          hasPosterPath: Boolean(collection.posterPath),
          hasJellyfinCollectionId: Boolean(jellyfinCollection?.Id),
        });
      }
    }

    if (result.itemsFailed > 0 && result.itemsMatched > 0) {
      result.status = 'PARTIAL';
    } else if (result.itemsFailed === result.itemsTotal) {
      result.status = 'FAILED';
    }

    try {
      await prisma.syncLog.create({
        data: {
          userId: userId ?? null,
          jellyfinServerId: jellyfinServer.id,
          collectionId: collection.id,
          status: result.status,
          itemsTotal: result.itemsTotal,
          itemsMatched: result.itemsMatched,
          itemsFailed: result.itemsFailed,
          errorMessage: result.errors.length > 0 ? result.errors.slice(0, SYNC_LOG_ERROR_LIMIT).join('; ') : null,
          details: JSON.stringify({
            matchedItems: result.matchedItems.slice(0, SYNC_LOG_MATCHED_ITEMS_LIMIT),
            errors: result.errors.slice(0, 20),
          }),
          completedAt: new Date(),
        },
      });
    } catch (logError) {
      log.error('Failed to create sync log entry', {
        collectionId: collection.id,
        serverId: jellyfinServer.id,
        error: (logError as Error).message,
      });
    }

  } catch (error) {
    result.status = 'FAILED';
    result.errors.push(`Sync error: ${(error as Error).message}`);

    try {
      await prisma.syncLog.create({
        data: {
          userId: userId ?? null,
          jellyfinServerId: jellyfinServer.id,
          collectionId: collection.id,
          status: 'FAILED',
          itemsTotal: result.itemsTotal,
          itemsMatched: 0,
          itemsFailed: result.itemsTotal,
          errorMessage: (error as Error).message,
          completedAt: new Date(),
        },
      });
    } catch (logError) {
      log.error('Failed to create failed-sync log entry', {
        collectionId: collection.id,
        serverId: jellyfinServer.id,
        error: (logError as Error).message,
      });
    }
  }

  log.info('Collection sync completed', {
    collectionId: collection.id,
    collectionName: collection.name,
    serverId: jellyfinServer.id,
    serverName: jellyfinServer.name,
    status: result.status,
    itemsMatched: result.itemsMatched,
    itemsFailed: result.itemsFailed,
    itemsTotal: result.itemsTotal,
  });

  return result;
}

export async function syncCollections({
  userId,
  prisma,
  collectionId,
  jellyfinServerId,
  logger,
}: SyncCollectionsOptions): Promise<SyncCollectionsResult> {
  const log = createSyncLogger(logger);
  const serverQuery: { id?: string } = {};
  if (jellyfinServerId) {
    serverQuery.id = jellyfinServerId;
  }
  const jellyfinServers = await prisma.jellyfinServer.findMany({ where: serverQuery });

  if (jellyfinServers.length === 0) {
    return {
      success: false,
      error: 'No Jellyfin servers configured',
      results: [],
    };
  }

  const collectionQuery: { isEnabled: boolean; id?: string } = {
    isEnabled: true,
  };
  if (collectionId) {
    collectionQuery.id = collectionId;
  }

  const collections = await prisma.collection.findMany({
    where: collectionQuery,
    include: {
      items: true,
      jellyfinServers: true,
    },
  });

  if (collections.length === 0) {
    return {
      success: false,
      error: 'No enabled collections to sync',
      results: [],
    };
  }

  const results: SyncResult[] = [];
  let hasErrors = false;

  log.info('Starting Jellyfin sync run', {
    collectionId: collectionId ?? null,
    jellyfinServerId: jellyfinServerId ?? null,
    collections: collections.length,
    servers: jellyfinServers.length,
  });

  for (const collection of collections) {
    const allowedServerIds = collection.jellyfinServers?.length
      ? new Set(collection.jellyfinServers.map((server) => server.jellyfinServerId))
      : null;

    for (const jellyfinServer of jellyfinServers) {
      if (allowedServerIds && !allowedServerIds.has(jellyfinServer.id)) {
        continue;
      }

      const result = await syncCollectionToJellyfin({
        collection,
        jellyfinServer,
        prisma,
        userId,
        logger,
      });
      results.push(result);

      if (result.status === 'FAILED') {
        hasErrors = true;
      }

      await prisma.collection.update({
        where: { id: collection.id },
        data: { lastSyncAt: new Date() },
      });
    }
  }

  return {
    success: !hasErrors,
    totalCollections: collections.length,
    totalServers: jellyfinServers.length,
    results,
  };
}

// Legacy alias for backwards compatibility
export const syncUserCollections = syncCollections;

export async function syncAllToJellyfin(prisma: PrismaClient, logger?: FastifyBaseLogger): Promise<SyncCollectionsResult> {
  return syncCollections({
    prisma,
    logger,
  });
}

export async function removeCollectionFromJellyfin({
  collectionName,
  jellyfinServer,
}: {
  collectionName: string;
  jellyfinServer: JellyfinServer;
}): Promise<{ success: boolean; message: string }> {
  const decryptedApiKey = decryptApiKey(jellyfinServer.apiKey, jellyfinServer.apiKeyIv);
  const client = createJellyfinClient(jellyfinServer.url, decryptedApiKey);

  if (!client) {
    return { success: false, message: 'Failed to create Jellyfin client' };
  }

  const jellyfinCollection = await client.getCollectionByName(collectionName);
  if (jellyfinCollection) {
    await client.deleteCollection(jellyfinCollection.Id);
    return { success: true, message: `Collection "${collectionName}" removed from Jellyfin` };
  }

  return { success: false, message: `Collection "${collectionName}" not found in Jellyfin` };
}

async function getCollectionPosterData(
  collectionId: string,
  posterPath: string | null,
  log: SyncLogger
): Promise<PosterData | null> {
  if (!posterPath) {
    log.debug('No poster path provided for collection', { collectionId });
    return null;
  }

  log.debug('Processing collection poster', {
    collectionId,
    posterPath,
  });

  try {
    if (posterPath.startsWith('http://') || posterPath.startsWith('https://')) {
      const response = await fetch(posterPath);
      if (!response.ok) {
        log.warn('Failed to fetch collection poster from URL', {
          collectionId,
          posterPath,
          status: response.status,
          statusText: response.statusText,
        });
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const contentType = response.headers.get('content-type');
      const mimeType = contentType || getMimeTypeFromUrl(posterPath);

      log.debug('Fetched collection poster from URL', {
        collectionId,
        bytes: buffer.length,
        mimeType,
      });
      return { buffer, mimeType };
    }

    const files = await readdir(POSTERS_DIR);
    log.debug('Scanning local poster directory', {
      collectionId,
      postersDirectory: POSTERS_DIR,
      files: files.length,
    });

    const generatedPosterName = `poster-${collectionId}.png`;
    const uploadedPosterPattern = new RegExp(`^${collectionId}\\.(jpg|jpeg|png|webp)$`, 'i');

    const posterFile = files.find((f) =>
      f === generatedPosterName || uploadedPosterPattern.test(f)
    );

    if (!posterFile) {
      log.warn('No local poster file found for collection', { collectionId });
      return null;
    }
    log.debug('Found local poster file for collection', {
      collectionId,
      posterFile,
    });

    const buffer = await readFile(path.join(POSTERS_DIR, posterFile));
    const ext = posterFile.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
    };

    return {
      buffer,
      mimeType: ext ? mimeTypes[ext] || 'image/jpeg' : 'image/jpeg',
    };
  } catch (err) {
    log.warn('Failed to read collection poster data', {
      collectionId,
      posterPath,
      error: (err as Error).message,
    });
    return null;
  }
}

function getMimeTypeFromUrl(url: string): string {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.endsWith('.png')) return 'image/png';
  if (lowerUrl.endsWith('.jpg') || lowerUrl.endsWith('.jpeg')) return 'image/jpeg';
  if (lowerUrl.endsWith('.webp')) return 'image/webp';
  if (lowerUrl.endsWith('.gif')) return 'image/gif';
  if (lowerUrl.includes('image.tmdb.org')) return 'image/jpeg';
  return 'image/jpeg';
}

export default {
  syncCollectionToJellyfin,
  syncCollections,
  syncUserCollections,
  syncAllToJellyfin,
  removeCollectionFromJellyfin,
};
