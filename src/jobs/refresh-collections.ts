/**
 * Collection Refresh Job
 * Periodically refreshes collections from their external sources
 */

import { createMDBListClient } from '../modules/external/mdblist/client.js';
import { createTraktClient } from '../modules/external/trakt/client.js';
import { ensureValidTraktTokens } from '../utils/trakt-auth.js';
import { withRetry } from '../utils/retry.js';
import { cacheImage } from '../utils/image-cache.js';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient, Collection, Settings } from '@prisma/client';
import type { AppConfig } from '../types/index.js';
import type { MDBListItem } from '../modules/external/mdblist/client.js';

// Type alias for collection data used in refresh operations
type RefreshableCollection = Collection;

interface RefreshResult {
  total: number;
  refreshed: number;
  failed: number;
  skipped: number;
}

// Rate limiting for TMDB API
let lastTmdbApiCallTime = 0;
const TMDB_API_DELAY_MS = 300;

interface CollectionItem {
  mediaType: string;
  title: string;
  year: number | null;
  imdbId?: string | null;
  tmdbId?: string | null;
  traktId?: string | null;
  tvdbId?: string | null;
  posterPath?: string | null;
  backdropPath?: string | null;
  rating?: number | null;
  ratingCount?: number | null;
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
      if (hoursSinceSync < collection.syncInterval) {
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

  const previousCount = await prisma.collectionItem.count({
    where: { collectionId: collection.id },
  });

  await prisma.$transaction([
    prisma.collectionItem.deleteMany({
      where: { collectionId: collection.id },
    }),
    prisma.collectionItem.createMany({
      data: items.map((item) => ({
        collectionId: collection.id,
        mediaType: item.mediaType,
        title: item.title,
        year: item.year,
        imdbId: item.imdbId,
        tmdbId: item.tmdbId,
        traktId: item.traktId,
        tvdbId: item.tvdbId,
        posterPath: item.posterPath,
        backdropPath: item.backdropPath,
        rating: item.rating,
        ratingCount: item.ratingCount,
      })),
    }),
    prisma.collection.update({
      where: { id: collection.id },
      data: { lastSyncAt: new Date() },
    }),
  ]);

  await prisma.syncLog.create({
    data: {
      userId: null,
      collectionId: collection.id,
      status: 'SUCCESS',
      itemsTotal: items.length,
      itemsMatched: items.length,
      details: JSON.stringify({
        previousCount,
        newCount: items.length,
        added: Math.max(0, items.length - previousCount),
        removed: Math.max(0, previousCount - items.length),
      }),
      completedAt: new Date(),
    },
  });

  log.info(`Refreshed ${collection.name}: ${items.length} items`);
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

  const enrichedItems: CollectionItem[] = [];
  const batchSize = 2; // Reduced to minimize TMDB rate limiting

  for (let i = 0; i < basicItems.length; i += batchSize) {
    const batch = basicItems.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(item => fetchItemDetails(item, apiKey))
    );
    enrichedItems.push(...batchResults);

    if (i + batchSize < basicItems.length) {
      await new Promise(r => setTimeout(r, 500)); // Increased delay for rate limiting
    }
  }

  return enrichedItems;
}

async function fetchItemDetails(item: MDBListItem, apiKey: string): Promise<CollectionItem> {
  const result: CollectionItem = {
    mediaType: item.mediaType,
    title: item.title,
    year: item.year,
    imdbId: item.imdbId,
    tmdbId: item.tmdbId,
    traktId: item.traktId,
    tvdbId: item.tvdbId,
    posterPath: item.posterPath,
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

      result.rating = detail.score || detail.imdbrating || null;
      result.ratingCount = detail.imdbvotes || null;

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
    console.warn(`Failed to fetch details for ${item.imdbId}:`, (err as Error).message);
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

async function waitForTmdbRateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastCall = now - lastTmdbApiCallTime;
  if (timeSinceLastCall < TMDB_API_DELAY_MS) {
    await new Promise(resolve => setTimeout(resolve, TMDB_API_DELAY_MS - timeSinceLastCall));
  }
  lastTmdbApiCallTime = Date.now();
}

async function fetchTmdbPoster(tmdbId: string, mediaType: string): Promise<string | null> {
  const tmdbApiKey = process.env.TMDB_API_KEY;
  if (!tmdbApiKey) {
    return null;
  }

  try {
    await waitForTmdbRateLimit();
    const type = mediaType === 'SHOW' ? 'tv' : 'movie';
    const response = await fetch(
      `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${tmdbApiKey}`
    );

    if (response.ok) {
      const data = await response.json() as { poster_path?: string };
      if (data.poster_path) {
        return `https://image.tmdb.org/t/p/w500${data.poster_path}`;
      }
    }
  } catch {
    // Silently fail - TMDB is just a fallback
  }

  return null;
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
    imdbId: item.imdbId,
    tmdbId: item.tmdbId,
    traktId: item.traktId,
    tvdbId: item.tvdbId,
  }));
}

export default refreshCollectionsJob;
