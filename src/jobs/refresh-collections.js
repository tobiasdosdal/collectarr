/**
 * Collection Refresh Job
 * Periodically refreshes collections from their external sources
 */

import { createMDBListClient } from '../modules/external/mdblist/client.js';
import { createTraktClient } from '../modules/external/trakt/client.js';
import { ensureValidTraktTokens } from '../utils/trakt-auth.js';
import { withRetry } from '../utils/retry.js';
import { cacheImage } from '../utils/image-cache.js';

/**
 * Refresh collections that are due for update
 */
export async function refreshCollectionsJob(fastify) {
  const { prisma, config, log } = fastify;

  // Find collections due for refresh
  const now = new Date();
  const collections = await prisma.collection.findMany({
    where: {
      isEnabled: true,
      sourceType: { not: 'MANUAL' },
    },
    include: {
      user: {
        select: {
          id: true,
          mdblistApiKey: true,
          traktAccessToken: true,
          traktRefreshToken: true,
          traktExpiresAt: true,
        },
      },
    },
  });

  let refreshed = 0;
  let failed = 0;
  let skipped = 0;

  for (const collection of collections) {
    // Check if due for refresh
    if (collection.lastSyncAt) {
      const hoursSinceSync = (now - new Date(collection.lastSyncAt)) / (1000 * 60 * 60);
      if (hoursSinceSync < collection.syncInterval) {
        skipped++;
        continue;
      }
    }

    try {
      await refreshCollection(fastify, collection);
      refreshed++;
    } catch (error) {
      log.error(`Failed to refresh collection ${collection.name}: ${error.message}`);
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

/**
 * Refresh a single collection from its source
 */
async function refreshCollection(fastify, collection) {
  const { prisma, config, log } = fastify;

  log.info(`Refreshing collection: ${collection.name} (${collection.sourceType})`);

  let items = [];

  try {
    switch (collection.sourceType) {
      case 'MDBLIST':
        items = await refreshFromMdblist(collection, config);
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
    // Log error and create sync log
    await prisma.syncLog.create({
      data: {
        userId: collection.userId,
        collectionId: collection.id,
        status: 'FAILED',
        errorMessage: error.message,
        completedAt: new Date(),
      },
    });
    throw error;
  }

  // Update items in database
  const previousCount = await prisma.collectionItem.count({
    where: { collectionId: collection.id },
  });

  await prisma.$transaction([
    // Delete existing items
    prisma.collectionItem.deleteMany({
      where: { collectionId: collection.id },
    }),
    // Insert new items
    prisma.collectionItem.createMany({
      data: items.map((item) => ({
        collectionId: collection.id,
        ...item,
      })),
      skipDuplicates: true,
    }),
    // Update collection lastSyncAt
    prisma.collection.update({
      where: { id: collection.id },
      data: { lastSyncAt: new Date() },
    }),
  ]);

  // Log sync result
  await prisma.syncLog.create({
    data: {
      userId: collection.userId,
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

/**
 * Fetch items from MDBList with detailed enrichment (posters, ratings)
 */
async function refreshFromMdblist(collection, config) {
  const apiKey = collection.user.mdblistApiKey || config.external.mdblist.apiKey;

  if (!apiKey) {
    throw new Error('MDBList API key not configured');
  }

  const client = createMDBListClient(apiKey, config.external.mdblist.baseUrl);

  // Get basic list items first
  const basicItems = await withRetry(
    () => client.getListItems(collection.sourceId),
    { maxRetries: 3 }
  );

  // Enrich items with detailed info (posters, ratings) in batches
  const enrichedItems = [];
  const batchSize = 5;

  for (let i = 0; i < basicItems.length; i += batchSize) {
    const batch = basicItems.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(item => fetchItemDetails(item, apiKey))
    );
    enrichedItems.push(...batchResults);

    // Small delay between batches to avoid rate limiting
    if (i + batchSize < basicItems.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  return enrichedItems;
}

/**
 * Fetch detailed info for a single item from MDBList
 */
async function fetchItemDetails(item, apiKey) {
  // Start with basic item data
  const result = { ...item };

  // Only fetch details if we have an IMDb ID
  if (!item.imdbId) {
    // Try TMDB directly if no IMDb ID but have tmdbId
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
      const detail = await response.json();

      // Update with detailed info
      result.rating = detail.score || detail.imdbrating || null;
      result.ratingCount = detail.imdbvotes || null;

      // Poster from MDBList detail response
      if (detail.poster) {
        const posterUrl = detail.poster.startsWith('http')
          ? detail.poster
          : `https://image.tmdb.org/t/p/w500${detail.poster}`;
        result.posterPath = posterUrl;

        // Cache the image in background
        cacheImage(posterUrl).catch(() => {});
      }

      // Backdrop if available
      if (detail.backdrop) {
        const backdropUrl = detail.backdrop.startsWith('http')
          ? detail.backdrop
          : `https://image.tmdb.org/t/p/w1280${detail.backdrop}`;
        result.backdropPath = backdropUrl;

        // Cache the backdrop in background
        cacheImage(backdropUrl).catch(() => {});
      }
    }
  } catch (err) {
    // Ignore errors for individual items, use basic data
    console.warn(`Failed to fetch details for ${item.imdbId}:`, err.message);
  }

  // Fallback to TMDB if still no poster
  if (!result.posterPath && result.tmdbId) {
    const tmdbPoster = await fetchTmdbPoster(result.tmdbId, result.mediaType);
    if (tmdbPoster) {
      result.posterPath = tmdbPoster;
      cacheImage(tmdbPoster).catch(() => {});
    }
  }

  return result;
}

/**
 * Fetch poster from TMDB API as fallback
 */
async function fetchTmdbPoster(tmdbId, mediaType) {
  const tmdbApiKey = process.env.TMDB_API_KEY;
  if (!tmdbApiKey) {
    return null;
  }

  try {
    const type = mediaType === 'SHOW' ? 'tv' : 'movie';
    const response = await fetch(
      `https://api.themoviedb.org/3/${type}/${tmdbId}`,
      {
        headers: {
          'Authorization': `Bearer ${tmdbApiKey}`,
          'Accept': 'application/json',
        },
      }
    );

    if (response.ok) {
      const data = await response.json();
      if (data.poster_path) {
        return `https://image.tmdb.org/t/p/w500${data.poster_path}`;
      }
    }
  } catch (err) {
    // Silently fail - TMDB is just a fallback
  }

  return null;
}

/**
 * Fetch items from Trakt
 */
async function refreshFromTrakt(collection, config, prisma) {
  // Ensure we have valid tokens (will auto-refresh if needed)
  const accessToken = await ensureValidTraktTokens(prisma, collection.userId, config);

  const client = createTraktClient(
    config.external.trakt.clientId,
    accessToken,
    config.external.trakt.baseUrl
  );

  let items;

  switch (collection.sourceType) {
    case 'TRAKT_WATCHLIST':
      items = await client.getWatchlist();
      break;

    case 'TRAKT_COLLECTION':
      // Get both movies and shows
      const movies = await client.getCollection('movies');
      const shows = await client.getCollection('shows');
      items = [...movies, ...shows];
      break;

    case 'TRAKT_LIST':
      items = await client.getListItems(collection.sourceId);
      break;

    default:
      throw new Error(`Unknown Trakt source type: ${collection.sourceType}`);
  }

  // Normalize items to our format
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
