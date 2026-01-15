/**
 * ID Translator Utility
 * Uses TMDb as the translation hub to convert between IMDb, TMDb, TVDB, and Trakt IDs
 */

import { createTMDbClient } from '../modules/external/tmdb/client.js';

class IdTranslator {
  constructor(config) {
    this.tmdbClient = createTMDbClient(config);
    this.cache = new Map(); // Simple in-memory cache
    this.cacheTimeout = 1000 * 60 * 60; // 1 hour
  }

  /**
   * Generate a cache key from an ID
   */
  getCacheKey(id, idType) {
    return `${idType}:${id}`;
  }

  /**
   * Get cached result if valid
   */
  getCached(id, idType) {
    const key = this.getCacheKey(id, idType);
    const cached = this.cache.get(key);

    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    return null;
  }

  /**
   * Store result in cache
   */
  setCache(data) {
    const timestamp = Date.now();

    // Cache by all known IDs
    if (data.imdbId) {
      this.cache.set(this.getCacheKey(data.imdbId, 'imdb'), { data, timestamp });
    }
    if (data.tmdbId) {
      this.cache.set(this.getCacheKey(data.tmdbId, 'tmdb'), { data, timestamp });
    }
    if (data.tvdbId) {
      this.cache.set(this.getCacheKey(data.tvdbId, 'tvdb'), { data, timestamp });
    }
    if (data.traktId) {
      this.cache.set(this.getCacheKey(data.traktId, 'trakt'), { data, timestamp });
    }
  }

  /**
   * Translate a media item to include all available IDs
   * Input: { mediaType, title?, year?, imdbId?, tmdbId?, traktId?, tvdbId? }
   * Output: { mediaType, title, year, imdbId, tmdbId, traktId, tvdbId }
   */
  async translateIds(item) {
    if (!this.tmdbClient) {
      // Without TMDb API, return item as-is
      return item;
    }

    // Check cache first with any available ID
    for (const [idType, idValue] of [
      ['imdb', item.imdbId],
      ['tmdb', item.tmdbId],
      ['tvdb', item.tvdbId],
      ['trakt', item.traktId],
    ]) {
      if (idValue) {
        const cached = this.getCached(idValue, idType);
        if (cached) {
          return { ...item, ...cached };
        }
      }
    }

    // Try to translate via TMDb
    let translated = null;

    try {
      if (item.imdbId) {
        translated = await this.tmdbClient.translateId(item.imdbId, 'imdb', item.mediaType);
      } else if (item.tvdbId && item.mediaType === 'SHOW') {
        translated = await this.tmdbClient.translateId(item.tvdbId, 'tvdb', item.mediaType);
      } else if (item.tmdbId) {
        // Fetch details directly
        const details = item.mediaType === 'MOVIE'
          ? await this.tmdbClient.getMovie(item.tmdbId)
          : await this.tmdbClient.getShow(item.tmdbId);

        translated = {
          tmdbId: details.id.toString(),
          imdbId: details.external_ids?.imdb_id || null,
          tvdbId: details.external_ids?.tvdb_id?.toString() || null,
          title: details.title || details.name,
          year: parseInt((details.release_date || details.first_air_date)?.slice(0, 4), 10) || null,
        };
      } else if (item.title) {
        // Last resort: search by title
        const searchResults = item.mediaType === 'MOVIE'
          ? await this.tmdbClient.searchMovies(item.title, item.year)
          : await this.tmdbClient.searchShows(item.title, item.year);

        if (searchResults.results?.length > 0) {
          const match = searchResults.results[0];
          const details = item.mediaType === 'MOVIE'
            ? await this.tmdbClient.getMovie(match.id)
            : await this.tmdbClient.getShow(match.id);

          translated = {
            tmdbId: details.id.toString(),
            imdbId: details.external_ids?.imdb_id || null,
            tvdbId: details.external_ids?.tvdb_id?.toString() || null,
            title: details.title || details.name,
            year: parseInt((details.release_date || details.first_air_date)?.slice(0, 4), 10) || null,
          };
        }
      }
    } catch (error) {
      // Log but don't fail - return original item
      console.error(`ID translation failed for ${item.title}:`, error.message);
    }

    if (translated) {
      // Merge with original data (keep traktId from original)
      const result = {
        ...item,
        ...translated,
        traktId: item.traktId || null,
      };

      this.setCache(result);
      return result;
    }

    return item;
  }

  /**
   * Batch translate multiple items (with rate limiting)
   */
  async translateBatch(items, options = {}) {
    const { concurrency = 5, delayMs = 100 } = options;
    const results = [];

    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);
      const translated = await Promise.all(batch.map((item) => this.translateIds(item)));
      results.push(...translated);

      // Rate limit delay between batches
      if (i + concurrency < items.length) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return results;
  }

  /**
   * Clear the cache
   */
  clearCache() {
    this.cache.clear();
  }
}

// Singleton instance
let translatorInstance = null;

export function getIdTranslator(config) {
  if (!translatorInstance) {
    translatorInstance = new IdTranslator(config);
  }
  return translatorInstance;
}

export default IdTranslator;
