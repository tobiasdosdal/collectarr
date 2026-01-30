/**
 * MDBList Refresh Helper - Optimized Version
 * Handles refreshing collections from MDBList source with batch processing
 */

import type { AppConfig } from '../../../types/index.js';
import type { RefreshedItem } from '../../../types/collection.types.js';
import type { MDBListItem } from '../../../types/external.types.js';
import { cacheImage } from '../../../utils/image-cache.js';
import { fetchTmdbPoster, fetchTmdbBackdrop, fetchTmdbRating } from '../../../utils/tmdb-api.js';
import { createTMDbClient } from '../../../modules/external/tmdb/client.js';
import { withRetry, RateLimiter } from '../../../utils/retry.js';

interface MDBListDetail {
  score?: number;
  imdbrating?: number;
  imdbvotes?: number;
  poster?: string;
  backdrop?: string;
  tmdbid?: number;
  traktid?: number;
  tvdbid?: number;
  year?: number;
}

interface MDBListApiItem {
  mediatype?: string;
  title?: string;
  year?: number;
  imdb_id?: string;
  tmdb_id?: number;
  trakt_id?: number;
  tvdb_id?: number;
  poster?: string;
  backdrop?: string;
  score?: number;
  imdbvotes?: number;
}

// Rate limiter for MDBList API: 40 requests per 10 seconds (4 req/sec with safety margin)
const mdblistRateLimiter = new RateLimiter(35, 10000);

const BATCH_SIZE = 10;
const CONCURRENCY = 3; // Reduced from 5 to be more conservative
const ITEM_DELAY_MS = 200; // Increased from 100 to reduce API pressure

export async function refreshFromMdblist(
  listId: string,
  apiKey: string | undefined,
  config: AppConfig
): Promise<RefreshedItem[]> {
  if (!apiKey) {
    throw new Error('MDBList API key is required');
  }

  try {
    const items = await fetchListItems(listId, apiKey, config);
    
    const enrichedItems: RefreshedItem[] = [];
    
    // Process in batches for better performance
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      
      const batchResults = await Promise.all(
        batch.map(async (item, idx) => {
          await new Promise(r => setTimeout(r, idx * ITEM_DELAY_MS));
          return fetchMdblistItemDetailsOptimized(item, apiKey, config);
        })
      );
      
      enrichedItems.push(...batchResults.filter(Boolean) as RefreshedItem[]);
    }

    return enrichedItems;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(
        `Network error: Failed to connect to MDBList API at ${config.external.mdblist.baseUrl}`
      );
    }
    throw error;
  }
}

async function fetchListItems(
  listId: string,
  apiKey: string,
  config: AppConfig
): Promise<MDBListApiItem[]> {
  return withRetry(
    async () => {
      const response = await fetch(
        `${config.external.mdblist.baseUrl}/lists/${listId}/items?apikey=${apiKey}`
      );

      if (!response.ok) {
        throw new Error(`MDBList API error: ${response.status}`);
      }

      const data = await response.json();

      if (Array.isArray(data)) {
        return data;
      } else if (data.items && Array.isArray(data.items)) {
        return data.items;
      } else if (data.movies || data.shows) {
        const movies = Array.isArray(data.movies) ? data.movies : [];
        const shows = Array.isArray(data.shows) ? data.shows : [];
        return [...movies, ...shows];
      } else {
        throw new Error(`MDBList API returned unexpected format`);
      }
    },
    { maxRetries: 3, retryableStatusCodes: [429, 500, 502, 503, 504] }
  );
}

async function fetchMdblistItemDetailsOptimized(
  item: MDBListApiItem,
  apiKey: string,
  config: AppConfig
): Promise<RefreshedItem | null> {
  try {
    const imdbId = item.imdb_id;
    
    // Build result from basic data first
    const result: RefreshedItem = {
      mediaType: item.mediatype === 'movie' ? 'MOVIE' : 'SHOW',
      title: item.title || '',
      year: item.year || null,
      imdbId: imdbId || null,
      tmdbId: item.tmdb_id?.toString() || null,
      traktId: item.trakt_id?.toString() || null,
      tvdbId: item.tvdb_id?.toString() || null,
      posterPath: buildPosterUrl(item.poster),
      backdropPath: buildBackdropUrl(item.backdrop),
      rating: item.score || null,
      ratingCount: item.imdbvotes || null,
    };

    // Only fetch details if we have IMDb ID and missing data
    let detailFetchFailed = false;
    if (imdbId && needsDetailFetch(result)) {
      try {
        const detail = await fetchItemDetail(imdbId, apiKey);

        if (detail) {
          // Merge detail data (detail takes precedence)
          result.tmdbId = detail.tmdbid?.toString() || result.tmdbId;
          result.traktId = detail.traktid?.toString() || result.traktId;
          result.tvdbId = detail.tvdbid?.toString() || result.tvdbId;
          result.year = detail.year || result.year;
          result.rating = detail.score || detail.imdbrating || result.rating;
          result.ratingCount = detail.imdbvotes || result.ratingCount;

          if (detail.poster) {
            result.posterPath = buildPosterUrl(detail.poster);
          }
          if (detail.backdrop) {
            result.backdropPath = buildBackdropUrl(detail.backdrop);
          }
        }
      } catch (err) {
        detailFetchFailed = true;
        console.warn(`MDBList detail fetch failed for ${imdbId}:`, (err as Error).message);
      }
    }

    // If we have imdbId but no tmdbId, try to translate using TMDB
    if (imdbId && !result.tmdbId) {
      try {
        const tmdbClient = createTMDbClient(config);
        if (tmdbClient) {
          const found = await tmdbClient.findByExternalId(imdbId, 'imdb_id');
          if (result.mediaType === 'MOVIE' && found.movies.length > 0) {
            result.tmdbId = found.movies[0]!.id.toString();
            console.log(`TMDB ID translation: ${imdbId} -> ${result.tmdbId} for "${result.title}"`);
          } else if (result.mediaType === 'SHOW' && found.shows.length > 0) {
            result.tmdbId = found.shows[0]!.id.toString();
            console.log(`TMDB ID translation: ${imdbId} -> ${result.tmdbId} for "${result.title}"`);
          }
        }
      } catch (err) {
        console.warn(`TMDB ID translation failed for ${imdbId}:`, (err as Error).message);
      }
    }

    // Fallback to TMDB for rating if MDBList failed or returned no rating
    if (result.tmdbId && (!result.rating || detailFetchFailed)) {
      try {
        const tmdbRating = await fetchTmdbRating(result.tmdbId, result.mediaType);
        if (tmdbRating.rating && !result.rating) {
          result.rating = tmdbRating.rating;
          result.ratingCount = tmdbRating.ratingCount;
          console.log(`TMDB fallback: fetched rating for "${result.title}": ${result.rating}`);
        }
      } catch (err) {
        console.warn(`TMDB rating fetch failed for "${result.title}" (tmdbId: ${result.tmdbId}):`, (err as Error).message);
      }
    }

    // Fallback to TMDB if still missing poster
    if (!result.posterPath && result.tmdbId) {
      const tmdbPoster = await fetchTmdbPoster(result.tmdbId, result.mediaType);
      if (tmdbPoster) {
        result.posterPath = tmdbPoster;
      }
    }

    // Cache images
    if (result.posterPath) {
      cacheImage(result.posterPath).catch(() => {});
    }
    if (result.backdropPath) {
      cacheImage(result.backdropPath).catch(() => {});
    }

    return result;
  } catch (err) {
    return null;
  }
}

function needsDetailFetch(item: RefreshedItem): boolean {
  // Fetch details if missing any of these fields, OR if we don't have tmdbId (needed for TMDB fallback)
  return !item.rating || !item.backdropPath || !item.posterPath || !item.tmdbId;
}

async function fetchItemDetail(imdbId: string, apiKey: string): Promise<MDBListDetail | null> {
  return mdblistRateLimiter.execute(async () => {
    return withRetry(
      async () => {
        const response = await fetch(`https://mdblist.com/api/?apikey=${apiKey}&i=${imdbId}`);

        if (response.ok) {
          return response.json() as Promise<MDBListDetail>;
        }

        if (response.status === 404) {
          return null;
        }

        throw new Error(`MDBList detail API error: ${response.status}`);
      },
      { maxRetries: 3, retryableStatusCodes: [429, 500, 502, 503, 504] }
    );
  });
}

function buildPosterUrl(poster: string | undefined): string | null {
  if (!poster) return null;
  
  if (poster.startsWith('http')) {
    return poster.replace('/original/', '/w500/');
  }
  
  return `https://image.tmdb.org/t/p/w500${poster}`;
}

function buildBackdropUrl(backdrop: string | undefined): string | null {
  if (!backdrop) return null;
  
  if (backdrop.startsWith('http')) {
    return backdrop;
  }
  
  return `https://image.tmdb.org/t/p/w1280${backdrop}`;
}

export async function fetchMdblistItemDetails(
  item: MDBListItem,
  apiKey: string,
  config: AppConfig
): Promise<RefreshedItem> {
  const apiItem: MDBListApiItem = {
    mediatype: (item.mediatype || item.media_type) === 'movie' ? 'movie' : 'show',
    title: item.title || item.name || '',
    year: item.year || item.release_year || 0,
    imdb_id: item.imdb_id || item.imdbid,
    tmdb_id: item.tmdb_id || item.id,
    trakt_id: item.trakt_id,
    tvdb_id: item.tvdb_id,
    poster: item.poster,
  };

  const result = await fetchMdblistItemDetailsOptimized(apiItem, apiKey, config);
  
  if (!result) {
    throw new Error('Failed to fetch item details');
  }
  
  return result;
}
