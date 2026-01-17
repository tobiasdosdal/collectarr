/**
 * Application Constants
 * Centralized configuration values and magic numbers
 */

export const TMDB_API_DELAY_MS = 300;

export const RATE_LIMIT_DELAY_MS = 600;

export const QUEUE_CONCURRENCY = 2;

export const MIN_FILE_SIZE_BYTES = 100;

export const SEARCH_RESULTS_LIMIT = 20;

export const REFRESH_PROGRESS_LOG_INTERVAL = 50;

export const COLLECTION_ITEM_FETCH_DELAY_MS = 50;

export const MIN_POLL_DURATION_MS = 120000;

export const MAX_CACHE_SIZE_MB_DEFAULT = 1000;

export const SYNC_LOG_ERROR_LIMIT = 10;

export const SYNC_LOG_MATCHED_ITEMS_LIMIT = 50;

export const REFRESH_INTERVAL_HOURS = {
  MIN: 1,
  MAX: 8760,
  DEFAULT: 24,
};
