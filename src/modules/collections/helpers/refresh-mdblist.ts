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
import { createLogger } from '../../../utils/runtime-logger.js';
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

interface StatusError extends Error {
  status?: number;
}

// Rate limiter for MDBList API: 40 requests per 10 seconds (4 req/sec with safety margin)
const mdblistRateLimiter = new RateLimiter(35, 10000);

const BATCH_SIZE = 10;
const CONCURRENCY = 3; // Reduced from 5 to be more conservative
const ITEM_DELAY_MS = 200; // Increased from 100 to reduce API pressure
const MDBLIST_DETAIL_TIMEOUT_MS = 5000;
const MDBLIST_DETAIL_MAX_RETRIES = 1;
const MDBLIST_DETAIL_UNAVAILABLE_THRESHOLD = 3;
const MDBLIST_DETAIL_COOLDOWN_MS = 120000;
const MDBLIST_DETAIL_COOLDOWN_LOG_INTERVAL_MS = 30000;
const log = createLogger('collections.mdblist-refresh');

let mdblistDetailUnavailableConsecutive = 0;
let mdblistDetailCooldownUntil = 0;
let mdblistDetailNextCooldownLogAt = 0;

function getErrorStatus(error: unknown): number | null {
  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status?: unknown }).status === 'number'
  ) {
    return (error as { status: number }).status;
  }

  return null;
}

function shouldSkipMdblistDetailFetch(): boolean {
  return Date.now() < mdblistDetailCooldownUntil;
}

function maybeLogDetailCooldown(): void {
  const now = Date.now();
  if (now < mdblistDetailNextCooldownLogAt) {
    return;
  }

  const remainingSeconds = Math.ceil((mdblistDetailCooldownUntil - now) / 1000);
  log.warn('Skipping MDBList detail fetches during cooldown', {
    cooldownSecondsRemaining: Math.max(remainingSeconds, 0),
  });
  mdblistDetailNextCooldownLogAt = now + MDBLIST_DETAIL_COOLDOWN_LOG_INTERVAL_MS;
}

function recordDetailFetchSuccess(): void {
  mdblistDetailUnavailableConsecutive = 0;
}

function recordDetailFetchFailure(status: number | null, errorMessage: string): void {
  if (status === 502 || status === 503 || status === 504) {
    mdblistDetailUnavailableConsecutive++;

    if (mdblistDetailUnavailableConsecutive >= MDBLIST_DETAIL_UNAVAILABLE_THRESHOLD) {
      mdblistDetailCooldownUntil = Date.now() + MDBLIST_DETAIL_COOLDOWN_MS;
      mdblistDetailNextCooldownLogAt = 0;
      mdblistDetailUnavailableConsecutive = 0;

      log.warn('MDBList detail endpoint is unavailable; entering cooldown', {
        status,
        cooldownMs: MDBLIST_DETAIL_COOLDOWN_MS,
        error: errorMessage,
      });
      return;
    }
  } else {
    mdblistDetailUnavailableConsecutive = 0;
  }
}

export async function refreshFromMdblist(
  listId: string,
  apiKey: string | undefined,
  config: AppConfig,
  tmdbApiKeyOverride?: string
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
          return fetchMdblistItemDetailsOptimized(item, apiKey, config, tmdbApiKeyOverride);
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
  config: AppConfig,
  tmdbApiKeyOverride?: string
): Promise<RefreshedItem | null> {
  try {
    const tmdbApiKey = tmdbApiKeyOverride || config.external.tmdb.apiKey;
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
      if (shouldSkipMdblistDetailFetch()) {
        detailFetchFailed = true;
        maybeLogDetailCooldown();
      } else {
        try {
          const detail = await fetchItemDetail(imdbId, apiKey);
          recordDetailFetchSuccess();

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
          const status = getErrorStatus(err);
          const errorMessage = (err as Error).message;
          recordDetailFetchFailure(status, errorMessage);
          log.warn('MDBList detail fetch failed', {
            imdbId,
            status,
            error: errorMessage,
          });
        }
      }
    }

    // If we have imdbId but no tmdbId, try to translate using TMDB
    if (imdbId && !result.tmdbId) {
      try {
          const tmdbClient = createTMDbClient(config, tmdbApiKey);
          if (tmdbClient) {
            const found = await tmdbClient.findByExternalId(imdbId, 'imdb_id');
            if (result.mediaType === 'MOVIE' && found.movies.length > 0) {
            result.tmdbId = found.movies[0]!.id.toString();
            log.debug('Translated IMDb ID to TMDB ID', {
              imdbId,
              tmdbId: result.tmdbId,
              title: result.title,
              mediaType: result.mediaType,
            });
          } else if (result.mediaType === 'SHOW' && found.shows.length > 0) {
            result.tmdbId = found.shows[0]!.id.toString();
            log.debug('Translated IMDb ID to TMDB ID', {
              imdbId,
              tmdbId: result.tmdbId,
              title: result.title,
              mediaType: result.mediaType,
            });
          }
        }
      } catch (err) {
        log.warn('TMDB ID translation failed', {
          imdbId,
          error: (err as Error).message,
        });
      }
    }

    // Fallback to TMDB for rating if MDBList failed or returned no rating
    if (result.tmdbId && (!result.rating || detailFetchFailed)) {
      try {
        const tmdbRating = await fetchTmdbRating(result.tmdbId, result.mediaType, tmdbApiKey);
        if (tmdbRating.rating && !result.rating) {
          result.rating = tmdbRating.rating;
          result.ratingCount = tmdbRating.ratingCount;
          log.debug('Fetched TMDB fallback rating', {
            title: result.title,
            tmdbId: result.tmdbId,
            rating: result.rating,
          });
        }
      } catch (err) {
        log.warn('TMDB fallback rating fetch failed', {
          title: result.title,
          tmdbId: result.tmdbId,
          error: (err as Error).message,
        });
      }
    }

    // Fallback to TMDB if still missing poster
    if (!result.posterPath && result.tmdbId) {
      const tmdbPoster = await fetchTmdbPoster(result.tmdbId, result.mediaType, tmdbApiKey);
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
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), MDBLIST_DETAIL_TIMEOUT_MS);

        try {
          const response = await fetch(
            `https://mdblist.com/api/?apikey=${apiKey}&i=${imdbId}`,
            { signal: controller.signal }
          );

          if (response.ok) {
            return response.json() as Promise<MDBListDetail>;
          }

          if (response.status === 404) {
            return null;
          }

          const statusError = new Error(`MDBList detail API error: ${response.status}`) as StatusError;
          statusError.status = response.status;
          throw statusError;
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            const timeoutError = new Error(
              `MDBList detail API timeout after ${MDBLIST_DETAIL_TIMEOUT_MS}ms`
            ) as StatusError;
            timeoutError.status = 408;
            throw timeoutError;
          }
          throw error;
        } finally {
          clearTimeout(timeoutId);
        }
      },
      {
        maxRetries: MDBLIST_DETAIL_MAX_RETRIES,
        retryableStatusCodes: [408, 429, 500, 502, 503, 504],
      }
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
  config: AppConfig,
  tmdbApiKeyOverride?: string
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

  const result = await fetchMdblistItemDetailsOptimized(apiItem, apiKey, config, tmdbApiKeyOverride);
  
  if (!result) {
    throw new Error('Failed to fetch item details');
  }
  
  return result;
}
