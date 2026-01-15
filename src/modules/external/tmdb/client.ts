/**
 * TMDb API Client
 * Primary use: ID translation between external providers
 */

import type { AppConfig } from '../../../types/index.js';

interface HttpError extends Error {
  status?: number;
  code?: string;
  originalError?: Error;
}

export interface TMDbMovie {
  id: number;
  title: string;
  release_date?: string;
  external_ids?: {
    imdb_id?: string;
    tvdb_id?: number;
  };
}

export interface TMDbShow {
  id: number;
  name: string;
  first_air_date?: string;
  external_ids?: {
    imdb_id?: string;
    tvdb_id?: number;
  };
}

export interface TMDbFindResult {
  movies: TMDbMovie[];
  shows: TMDbShow[];
}

export interface TMDbSearchResult {
  page: number;
  results: Array<TMDbMovie | TMDbShow>;
  total_pages: number;
  total_results: number;
}

export interface TranslatedIds {
  tmdbId: string;
  imdbId: string | null;
  tvdbId: string | null;
  title: string;
  year: string | undefined;
}

class TMDbClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl = 'https://api.themoviedb.org/3') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`);

    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
      ...(options.headers as Record<string, string> || {}),
    };

    try {
      const response = await fetch(url.toString(), {
        ...options,
        headers,
      });

      if (!response.ok) {
        const error = new Error(`TMDb API error: ${response.status}`) as HttpError;
        error.status = response.status;
        throw error;
      }

      return response.json() as Promise<T>;
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        const networkError = new Error(`Network error: Failed to connect to TMDb API at ${this.baseUrl}`) as HttpError;
        networkError.code = (error as NodeJS.ErrnoException).code || 'NETWORK_ERROR';
        networkError.originalError = error;
        throw networkError;
      }
      throw error;
    }
  }

  async findByExternalId(externalId: string, externalSource: string): Promise<TMDbFindResult> {
    const data = await this.request<{
      movie_results?: TMDbMovie[];
      tv_results?: TMDbShow[];
    }>(`/find/${externalId}?external_source=${externalSource}`);

    return {
      movies: data.movie_results || [],
      shows: data.tv_results || [],
    };
  }

  async getMovie(tmdbId: number | string): Promise<TMDbMovie> {
    return this.request<TMDbMovie>(`/movie/${tmdbId}?append_to_response=external_ids`);
  }

  async getShow(tmdbId: number | string): Promise<TMDbShow> {
    return this.request<TMDbShow>(`/tv/${tmdbId}?append_to_response=external_ids`);
  }

  async searchMovies(query: string, year: number | null = null): Promise<TMDbSearchResult> {
    let endpoint = `/search/movie?query=${encodeURIComponent(query)}`;
    if (year) {
      endpoint += `&year=${year}`;
    }
    return this.request<TMDbSearchResult>(endpoint);
  }

  async searchShows(query: string, year: number | null = null): Promise<TMDbSearchResult> {
    let endpoint = `/search/tv?query=${encodeURIComponent(query)}`;
    if (year) {
      endpoint += `&first_air_date_year=${year}`;
    }
    return this.request<TMDbSearchResult>(endpoint);
  }

  async translateId(externalId: string, sourceType: string, mediaType: string): Promise<TranslatedIds | null> {
    let result: TMDbMovie | TMDbShow | null = null;

    if (sourceType === 'imdb') {
      const found = await this.findByExternalId(externalId, 'imdb_id');
      if (mediaType === 'MOVIE' && found.movies.length > 0) {
        result = found.movies[0]!;
      } else if (mediaType === 'SHOW' && found.shows.length > 0) {
        result = found.shows[0]!;
      }
    } else if (sourceType === 'tvdb') {
      const found = await this.findByExternalId(externalId, 'tvdb_id');
      if (found.shows.length > 0) {
        result = found.shows[0]!;
      }
    }

    if (!result) {
      return null;
    }

    let details: TMDbMovie | TMDbShow;
    if (mediaType === 'MOVIE') {
      details = await this.getMovie(result.id);
    } else {
      details = await this.getShow(result.id);
    }

    const title = 'title' in details ? details.title : details.name;
    const releaseDate = 'title' in details ? details.release_date : ('first_air_date' in details ? details.first_air_date : undefined);

    return {
      tmdbId: details.id.toString(),
      imdbId: details.external_ids?.imdb_id || null,
      tvdbId: details.external_ids?.tvdb_id?.toString() || null,
      title,
      year: releaseDate?.slice(0, 4),
    };
  }
}

export function createTMDbClient(config: AppConfig): TMDbClient | null {
  if (!config?.external?.tmdb?.apiKey) {
    return null;
  }
  return new TMDbClient(config.external.tmdb.apiKey, config.external.tmdb.baseUrl);
}

export default TMDbClient;
