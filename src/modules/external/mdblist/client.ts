import { withRetry } from '../../../utils/retry.js';
import { handleNetworkError } from '../../../utils/error-handling.js';
import type { HttpError } from '../../../shared/http/http-error.js';

export interface MDBListItem {
  mediaType: 'MOVIE' | 'SHOW';
  title: string;
  year: number;
  imdbId: string | undefined;
  tmdbId: string | undefined;
  traktId: string | undefined;
  tvdbId: string | undefined;
  posterPath: string | null;
}

export interface MDBListApiItem {
  mediatype: string;
  title: string;
  year: number;
  imdb_id?: string;
  tmdb_id?: number;
  trakt_id?: number;
  tvdb_id?: number;
  poster?: string;
}

export interface MDBListInfo {
  id: number;
  name: string;
  description?: string;
  item_count?: number;
  likes?: number;
  user_name?: string;
}

export interface MDBListSearchResult {
  id: number;
  title: string;
  year: number;
  mediatype: string;
  imdb_id?: string;
  tmdb_id?: number;
}

class MDBListClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl = 'https://api.mdblist.com') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async request<T>(endpoint: string): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    url.searchParams.set('apikey', this.apiKey);

    try {
      const response = await fetch(url.toString(), {
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        const error = new Error(`MDBList API error: ${response.status}`) as HttpError;
        error.status = response.status;
        throw error;
      }

      return response.json() as Promise<T>;
    } catch (error) {
      handleNetworkError(error, 'MDBList', this.baseUrl);
    }
  }

  async requestWithRetry<T>(endpoint: string): Promise<T> {
    return withRetry(
      () => this.request<T>(endpoint),
      {
        maxRetries: 3,
        retryableStatusCodes: [408, 429, 500, 502, 503, 504],
      }
    );
  }

  async searchLists(query: string): Promise<MDBListInfo[]> {
    return this.request<MDBListInfo[]>(`/lists/search?query=${encodeURIComponent(query)}`);
  }

  async getTopLists(limit = 20): Promise<MDBListInfo[]> {
    return this.request<MDBListInfo[]>(`/lists/top?limit=${limit}`);
  }

  async getMyLists(): Promise<MDBListInfo[]> {
    return this.request<MDBListInfo[]>('/lists/user');
  }

  async getListInfo(listId: string | number): Promise<MDBListInfo> {
    return this.request<MDBListInfo>(`/lists/${listId}`);
  }

  async getListItems(listId: string | number): Promise<MDBListItem[]> {
    const data = await this.request<MDBListApiItem[]>(`/lists/${listId}/items`);

    if (!Array.isArray(data)) {
      throw new Error(`MDBList API returned unexpected data type: ${typeof data}. Expected array.`);
    }

    return data.map((item) => ({
      mediaType: item.mediatype === 'movie' ? 'MOVIE' : 'SHOW',
      title: item.title,
      year: item.year,
      imdbId: item.imdb_id,
      tmdbId: item.tmdb_id?.toString(),
      traktId: item.trakt_id?.toString(),
      tvdbId: item.tvdb_id?.toString(),
      posterPath: item.poster ? `https://image.tmdb.org/t/p/w500${item.poster}` : null,
    }));
  }

  async searchMedia(query: string, mediaType: 'MOVIE' | 'SHOW' | null = null): Promise<MDBListSearchResult[]> {
    let endpoint = `/search?query=${encodeURIComponent(query)}`;
    if (mediaType) {
      endpoint += `&mediatype=${mediaType === 'MOVIE' ? 'movie' : 'show'}`;
    }
    return this.request<MDBListSearchResult[]>(endpoint);
  }

  async getMediaById(id: string, idType = 'imdb'): Promise<MDBListSearchResult> {
    return this.request<MDBListSearchResult>(`/${idType}/${id}`);
  }
}

export function createMDBListClient(apiKey: string | undefined, baseUrl?: string): MDBListClient | null {
  if (!apiKey) {
    return null;
  }
  return new MDBListClient(apiKey, baseUrl);
}

export default MDBListClient;
