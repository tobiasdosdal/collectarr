/**
 * Collection Refresh Job
 * Periodically refreshes collections from their external sources
 */

import { createMDBListClient } from '../modules/external/mdblist/client.js';
import { createTraktClient } from '../modules/external/trakt/client.js';
import { syncCollections } from '../modules/emby/sync-service.js';
import { ensureValidTraktTokens } from '../utils/trakt-auth.js';
import { withRetry } from '../utils/retry.js';
import { cacheImage } from '../utils/image-cache.js';
import { fetchTmdbPoster, fetchTmdbBackdrop } from '../utils/tmdb-api.js';
import { createLogger } from '../utils/runtime-logger.js';
import { COLLECTION_ITEM_FETCH_DELAY_MS } from '../config/constants.js';
import { JobQueue } from './job-queue.js';
import { JobPriority } from './job-types.js';
import { ItemEnrichmentJob } from './item-enrichment-job.js';
import { EventEmitter } from 'events';
import type { EnrichItemJobData } from './item-enrichment-job.js';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient, Collection, Settings } from '@prisma/client';
import type { AppConfig } from '../types/index.js';
import type { MDBListItem } from '../modules/external/mdblist/client.js';
import { autoDownloadCollectionItems } from '../modules/downloaders/auto-download.js';

// Type alias for collection data used in refresh operations
type RefreshableCollection = Collection;

interface RefreshResult {
  total: number;
  refreshed: number;
  failed: number;
  skipped: number;
}

interface CollectionItem {
  mediaType: string;
  title: string;
  year: number | null;
  imdbId?: string;
  tmdbId?: string;
  traktId?: string;
  tvdbId?: string;
  posterPath?: string;
  backdropPath?: string;
  rating?: number;
  ratingCount?: number;
}

// Global job queue instance
let jobQueueInstance: JobQueue | null = null;
const jobQueueEvents = new EventEmitter();
const refreshLog = createLogger('jobs.refresh-collections');

/**
 * Initialize the job queue on server start
 */
export function initializeJobQueue(fastify: FastifyInstance): JobQueue {
  if (jobQueueInstance) {
    return jobQueueInstance;
  }

  const queue = new JobQueue({ concurrency: 3, maxAttempts: 5 });
  ItemEnrichmentJob.registerWithQueue(queue, fastify.prisma, fastify.config);
  
  // Start processing jobs in the background
  queue.process().catch((error) => {
    fastify.log.error('Job queue processing error:', error);
  });

  jobQueueInstance = queue;
  jobQueueEvents.emit('ready', queue);
  fastify.log.info('Job queue initialized');
  return queue;
}

/**
 * Get the global job queue instance
 */
export function getJobQueue(): JobQueue | null {
  return jobQueueInstance;
}

export function onJobQueueReady(listener: (queue: JobQueue) => void): () => void {
  if (jobQueueInstance) {
    listener(jobQueueInstance);
  }

  jobQueueEvents.on('ready', listener);
  return () => {
    jobQueueEvents.off('ready', listener);
  };
}

export function stopJobQueue(): void {
  if (!jobQueueInstance) {
    return;
  }

  jobQueueInstance.stop();
  jobQueueInstance.removeAllListeners();
  jobQueueInstance = null;
}

export async function refreshCollectionsJob(fastify: FastifyInstance): Promise<RefreshResult> {
  const { prisma, config, log } = fastify;

  const now = new Date();
  const collections = await prisma.collection.findMany({
    where: {
      isEnabled: true,
      sourceType: { not: 'MANUAL' },
    },
  });

  let refreshed = 0;
  let failed = 0;
  let skipped = 0;

  for (const collection of collections) {
    if (collection.lastSyncAt) {
      const hoursSinceSync = (now.getTime() - new Date(collection.lastSyncAt).getTime()) / (1000 * 60 * 60);
      if (hoursSinceSync < 24) {
        skipped++;
        continue;
      }
    }

    try {
      await refreshCollection(fastify, collection);
      refreshed++;
    } catch (error) {
      log.error(`Failed to refresh collection ${collection.name}: ${(error as Error).message}`);
      failed++;
    }
  }

  return {
    total: collections.length,
    refreshed,
    failed,
    skipped,
  };
}

async function refreshCollection(fastify: FastifyInstance, collection: RefreshableCollection): Promise<void> {
  const { prisma, config, log } = fastify;

  log.info(`Refreshing collection: ${collection.name} (${collection.sourceType})`);

  // Get settings for API tokens
  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
  });

  let items: CollectionItem[] = [];

  try {
    switch (collection.sourceType) {
      case 'MDBLIST':
        items = await refreshFromMdblist(collection, config, settings);
        break;

      case 'TRAKT_LIST':
      case 'TRAKT_WATCHLIST':
      case 'TRAKT_COLLECTION':
        items = await refreshFromTrakt(collection, config, prisma);
        break;

      default:
        log.warn(`Unknown source type: ${collection.sourceType}`);
        return;
    }
  } catch (error) {
    await prisma.syncLog.create({
      data: {
        userId: null,
        collectionId: collection.id,
        status: 'FAILED',
        errorMessage: (error as Error).message,
        completedAt: new Date(),
      },
    });
    throw error;
  }

  const existingItems = await prisma.collectionItem.findMany({
    where: { collectionId: collection.id },
    select: {
      id: true,
      imdbId: true,
      tmdbId: true,
      tvdbId: true,
      inEmby: true,
      embyItemId: true,
    },
  });

  const seenTmdbIds = new Set<string>();
  const dedupedItems: CollectionItem[] = [];
  for (const item of items) {
    if (item.tmdbId) {
      if (seenTmdbIds.has(item.tmdbId)) {
        continue;
      }
      seenTmdbIds.add(item.tmdbId);
    }
    dedupedItems.push(item);
  }

  const previousCount = existingItems.length;
  const existingByImdb = new Map(existingItems.filter(item => item.imdbId).map(item => [item.imdbId!, item]));
  const existingByTmdb = new Map(existingItems.filter(item => item.tmdbId).map(item => [item.tmdbId!, item]));
  const existingByTvdb = new Map(existingItems.filter(item => item.tvdbId).map(item => [item.tvdbId!, item]));

  // Save items immediately with basic data and enrichmentStatus = 'PENDING'
  const transactionSteps = [
    prisma.collectionItem.deleteMany({
      where: { collectionId: collection.id },
    }),
    prisma.collection.update({
      where: { id: collection.id },
      data: { lastSyncAt: new Date() },
    }),
  ];

  if (dedupedItems.length > 0) {
    transactionSteps.splice(1, 0, prisma.collectionItem.createMany({
      data: dedupedItems.map((item) => {
        const existingByImdbItem = item.imdbId ? existingByImdb.get(item.imdbId) : undefined;
        const existingByTmdbItem = item.tmdbId ? existingByTmdb.get(item.tmdbId) : undefined;
        const existingByTvdbItem = item.tvdbId ? existingByTvdb.get(item.tvdbId) : undefined;
        const existing = existingByImdbItem || existingByTmdbItem || existingByTvdbItem;

        return {
          collectionId: collection.id,
          mediaType: item.mediaType,
          title: item.title,
          year: item.year,
          imdbId: item.imdbId ?? undefined,
          tmdbId: item.tmdbId ?? undefined,
          traktId: item.traktId ?? undefined,
          tvdbId: item.tvdbId ?? undefined,
          posterPath: item.posterPath ?? undefined,
          backdropPath: item.backdropPath ?? undefined,
          rating: item.rating ?? undefined,
          ratingCount: item.ratingCount ?? undefined,
          inEmby: existing?.inEmby ?? false,
          embyItemId: existing?.embyItemId ?? null,
          enrichmentStatus: 'PENDING',
          enrichmentAttempts: 0,
        };
      }),
    }));
  }

  await prisma.$transaction(transactionSteps);

  await prisma.syncLog.create({
    data: {
      userId: null,
      collectionId: collection.id,
      status: 'SUCCESS',
      itemsTotal: dedupedItems.length,
      itemsMatched: dedupedItems.length,
      details: JSON.stringify({
        previousCount,
        newCount: dedupedItems.length,
        added: Math.max(0, dedupedItems.length - previousCount),
        removed: Math.max(0, previousCount - dedupedItems.length),
      }),
      completedAt: new Date(),
    },
  });

  // Get the newly created items to queue enrichment jobs
  const newItems = await prisma.collectionItem.findMany({
    where: { collectionId: collection.id },
    select: {
      id: true,
      imdbId: true,
      tmdbId: true,
      mediaType: true,
    },
  });

  // Queue enrichment jobs for each item
  const queue = getJobQueue();
  if (queue) {
    for (const item of newItems) {
      const jobData: EnrichItemJobData = {
        itemId: item.id,
        collectionId: collection.id,
        imdbId: item.imdbId ?? undefined,
        tmdbId: item.tmdbId ?? undefined,
        mediaType: item.mediaType,
      };

      queue.enqueue({
        type: 'enrich-item',
        priority: JobPriority.NORMAL,
        data: jobData,
        maxAttempts: 5,
        delayMs: 0,
      });
    }
    log.info(`Queued ${newItems.length} enrichment jobs for collection ${collection.name}`);
  }

  await syncCollections({
    prisma,
    collectionId: collection.id,
    logger: log,
  });

  if (collection.autoDownload) {
    autoDownloadCollectionItems(prisma, config, collection.id).catch((error) => {
      log.warn(`Auto-download failed for collection ${collection.id}: ${(error as Error).message}`);
    });
  }

  log.info(`Refreshed ${collection.name}: ${dedupedItems.length} items (enrichment queued)`);
}

async function refreshFromMdblist(
  collection: RefreshableCollection,
  config: AppConfig,
  settings: Settings | null
): Promise<CollectionItem[]> {
  const apiKey = settings?.mdblistApiKey || config.external.mdblist.apiKey;

  if (!apiKey) {
    throw new Error('MDBList API key not configured');
  }

  const client = createMDBListClient(apiKey, config.external.mdblist.baseUrl);
  if (!client) {
    throw new Error('Failed to create MDBList client');
  }

  const basicItems = await withRetry(
    () => client.getListItems(collection.sourceId!),
    { maxRetries: 3 }
  );

  // Return basic items without enrichment - enrichment happens in background
  return basicItems.map((item) => ({
    mediaType: item.mediaType,
    title: item.title,
    year: item.year,
    imdbId: item.imdbId ?? undefined,
    tmdbId: item.tmdbId ?? undefined,
    traktId: item.traktId ?? undefined,
    tvdbId: item.tvdbId ?? undefined,
    posterPath: item.posterPath ?? undefined,
  }));
}

async function fetchItemDetails(item: MDBListItem, apiKey: string): Promise<CollectionItem> {
  const result: CollectionItem = {
    mediaType: item.mediaType,
    title: item.title,
    year: item.year,
    imdbId: item.imdbId ?? undefined,
    tmdbId: item.tmdbId ?? undefined,
    traktId: item.traktId ?? undefined,
    tvdbId: item.tvdbId ?? undefined,
    posterPath: item.posterPath ?? undefined,
  };

  if (!item.imdbId) {
    if (result.tmdbId && !result.posterPath) {
      const tmdbPoster = await fetchTmdbPoster(result.tmdbId, result.mediaType);
      if (tmdbPoster) {
        result.posterPath = tmdbPoster;
        cacheImage(tmdbPoster).catch(() => {});
      }
    }
    return result;
  }

  try {
    const response = await fetch(
      `https://mdblist.com/api/?apikey=${apiKey}&i=${item.imdbId}`
    );

    if (response.ok) {
      const detail = await response.json() as {
        score?: number;
        imdbrating?: number;
        imdbvotes?: number;
        poster?: string;
        backdrop?: string;
      };

      result.rating = detail.score || detail.imdbrating;
      result.ratingCount = detail.imdbvotes;

      if (detail.poster) {
        const posterUrl = detail.poster.startsWith('http')
          ? detail.poster
          : `https://image.tmdb.org/t/p/w500${detail.poster}`;
        result.posterPath = posterUrl;
        cacheImage(posterUrl).catch(() => {});
      }

      if (detail.backdrop) {
        const backdropUrl = detail.backdrop.startsWith('http')
          ? detail.backdrop
          : `https://image.tmdb.org/t/p/w1280${detail.backdrop}`;
        result.backdropPath = backdropUrl;
        cacheImage(backdropUrl).catch(() => {});
      }
    }
  } catch (err) {
    refreshLog.warn('Failed to fetch MDBList details for item', {
      imdbId: item.imdbId,
      error: (err as Error).message,
    });
  }

  if (!result.posterPath && result.tmdbId) {
    const tmdbPoster = await fetchTmdbPoster(result.tmdbId, result.mediaType);
    if (tmdbPoster) {
      result.posterPath = tmdbPoster;
      cacheImage(tmdbPoster).catch(() => {});
    }
  }

  return result;
}

async function refreshFromTrakt(
  collection: RefreshableCollection,
  config: AppConfig,
  prisma: PrismaClient
): Promise<CollectionItem[]> {
  const accessToken = await ensureValidTraktTokens(prisma, config);

  const client = createTraktClient(
    config.external.trakt.clientId,
    accessToken,
    config.external.trakt.baseUrl
  );

  if (!client) {
    throw new Error('Failed to create Trakt client');
  }

  let items;

  switch (collection.sourceType) {
    case 'TRAKT_WATCHLIST':
      items = await client.getWatchlist();
      break;

    case 'TRAKT_COLLECTION': {
      const movies = await client.getCollection('movies');
      const shows = await client.getCollection('shows');
      items = [...movies, ...shows];
      break;
    }

    case 'TRAKT_LIST':
      items = await client.getListItems(collection.sourceId!);
      break;

    default:
      throw new Error(`Unknown Trakt source type: ${collection.sourceType}`);
  }

  return items.map((item) => ({
    mediaType: item.mediaType,
    title: item.title,
    year: item.year,
    imdbId: item.imdbId ?? undefined,
    tmdbId: item.tmdbId ?? undefined,
    traktId: item.traktId ?? undefined,
    tvdbId: item.tvdbId ?? undefined,
  }));
}

export default refreshCollectionsJob;
