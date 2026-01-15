/**
 * ID Translator Utility
 * Uses TMDb as the translation hub to convert between IMDb, TMDb, TVDB, and Trakt IDs
 */

import { createTMDbClient } from '../modules/external/tmdb/client.js';
import type { AppConfig } from '../types/index.js';
import type TMDbClient from '../modules/external/tmdb/client.js';

export interface MediaItem {
  mediaType: string;
  title?: string;
  year?: number | null;
  imdbId?: string | null;
  tmdbId?: string | null;
  traktId?: string | null;
  tvdbId?: string | null;
}

export interface TranslatedItem extends MediaItem {
  imdbId: string | null;
  tmdbId: string | null;
  traktId: string | null;
  tvdbId: string | null;
}

interface CacheEntry {
  data: TranslatedItem;
  timestamp: number;
}

class IdTranslator {
  private tmdbClient: TMDbClient | null;
  private cache: Map<string, CacheEntry> = new Map();
  private cacheTimeout = 1000 * 60 * 60; // 1 hour

  constructor(config: AppConfig) {
    this.tmdbClient = createTMDbClient(config);
  }

  private getCacheKey(id: string, idType: string): string {
    return `${idType}:${id}`;
  }

  private getCached(id: string, idType: string): TranslatedItem | null {
    const key = this.getCacheKey(id, idType);
    const cached = this.cache.get(key);

    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    return null;
  }

  private setCache(data: TranslatedItem): void {
    const timestamp = Date.now();

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

  async translateIds(item: MediaItem): Promise<TranslatedItem> {
    if (!this.tmdbClient) {
      return {
        ...item,
        imdbId: item.imdbId || null,
        tmdbId: item.tmdbId || null,
        traktId: item.traktId || null,
        tvdbId: item.tvdbId || null,
      };
    }

    const idChecks: Array<[string, string | null | undefined]> = [
      ['imdb', item.imdbId],
      ['tmdb', item.tmdbId],
      ['tvdb', item.tvdbId],
      ['trakt', item.traktId],
    ];

    for (const [idType, idValue] of idChecks) {
      if (idValue) {
        const cached = this.getCached(idValue, idType);
        if (cached) {
          return { ...item, ...cached };
        }
      }
    }

    let translated: {
      tmdbId: string;
      imdbId: string | null;
      tvdbId: string | null;
      title: string;
      year: number | null;
    } | null = null;

    try {
      if (item.imdbId) {
        translated = await this.tmdbClient.translateId(item.imdbId, 'imdb', item.mediaType) as typeof translated;
      } else if (item.tvdbId && item.mediaType === 'SHOW') {
        translated = await this.tmdbClient.translateId(item.tvdbId, 'tvdb', item.mediaType) as typeof translated;
      } else if (item.tmdbId) {
        const details = item.mediaType === 'MOVIE'
          ? await this.tmdbClient.getMovie(item.tmdbId)
          : await this.tmdbClient.getShow(item.tmdbId);

        const title = 'title' in details ? details.title : details.name;
        const releaseDate = 'title' in details ? details.release_date : ('first_air_date' in details ? details.first_air_date : undefined);

        translated = {
          tmdbId: details.id.toString(),
          imdbId: details.external_ids?.imdb_id || null,
          tvdbId: details.external_ids?.tvdb_id?.toString() || null,
          title,
          year: releaseDate ? parseInt(releaseDate.slice(0, 4), 10) : null,
        };
      } else if (item.title) {
        const searchResults = item.mediaType === 'MOVIE'
          ? await this.tmdbClient.searchMovies(item.title, item.year)
          : await this.tmdbClient.searchShows(item.title, item.year);

        if (searchResults.results?.length > 0) {
          const match = searchResults.results[0]!;
          const matchId = 'id' in match ? match.id : (match as { id: number }).id;

          const details = item.mediaType === 'MOVIE'
            ? await this.tmdbClient.getMovie(matchId)
            : await this.tmdbClient.getShow(matchId);

          const title = 'title' in details ? details.title : details.name;
          const releaseDate = 'title' in details ? details.release_date : ('first_air_date' in details ? details.first_air_date : undefined);

          translated = {
            tmdbId: details.id.toString(),
            imdbId: details.external_ids?.imdb_id || null,
            tvdbId: details.external_ids?.tvdb_id?.toString() || null,
            title,
            year: releaseDate ? parseInt(releaseDate.slice(0, 4), 10) : null,
          };
        }
      }
    } catch (error) {
      console.error(`ID translation failed for ${item.title}:`, (error as Error).message);
    }

    if (translated) {
      const result: TranslatedItem = {
        ...item,
        ...translated,
        traktId: item.traktId || null,
      };

      this.setCache(result);
      return result;
    }

    return {
      ...item,
      imdbId: item.imdbId || null,
      tmdbId: item.tmdbId || null,
      traktId: item.traktId || null,
      tvdbId: item.tvdbId || null,
    };
  }

  async translateBatch(
    items: MediaItem[],
    options: { concurrency?: number; delayMs?: number } = {}
  ): Promise<TranslatedItem[]> {
    const { concurrency = 5, delayMs = 100 } = options;
    const results: TranslatedItem[] = [];

    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);
      const translated = await Promise.all(batch.map((item) => this.translateIds(item)));
      results.push(...translated);

      if (i + concurrency < items.length) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return results;
  }

  clearCache(): void {
    this.cache.clear();
  }
}

let translatorInstance: IdTranslator | null = null;

export function getIdTranslator(config: AppConfig): IdTranslator {
  if (!translatorInstance) {
    translatorInstance = new IdTranslator(config);
  }
  return translatorInstance;
}

export default IdTranslator;
