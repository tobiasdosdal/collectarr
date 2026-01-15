/**
 * Trakt API Client
 * Docs: https://trakt.docs.apiary.io/
 */

interface HttpError extends Error {
  status?: number;
  code?: string;
  originalError?: Error;
}

export interface TraktList {
  id: string | number | undefined;
  traktId: string | undefined;
  name: string;
  description: string | undefined;
  itemCount: number | undefined;
  likes: number | undefined;
  privacy: string | undefined;
  user: string | undefined;
  createdAt: string | undefined;
  updatedAt: string | undefined;
}

export interface TraktListItem {
  mediaType: 'MOVIE' | 'SHOW';
  title: string;
  year: number;
  imdbId: string | undefined;
  tmdbId: string | undefined;
  traktId: string | undefined;
  tvdbId: string | undefined;
  listedAt: string | undefined;
  rank: number | undefined;
}

export interface TraktMedia {
  title: string;
  year: number;
  imdbId: string | undefined;
  tmdbId: string | undefined;
  traktId: string | undefined;
  tvdbId: string | undefined;
}

export interface TraktSearchResult extends TraktMedia {
  mediaType: 'MOVIE' | 'SHOW';
  score: number;
}

export interface TraktTrendingItem extends TraktMedia {
  watchers: number;
  mediaType: 'MOVIE' | 'SHOW';
}

interface TraktApiList {
  ids?: {
    slug?: string;
    trakt?: number;
  };
  name: string;
  description?: string;
  item_count?: number;
  likes?: number;
  privacy?: string;
  user?: {
    username?: string;
  };
  created_at?: string;
  updated_at?: string;
}

interface TraktApiItem {
  movie?: {
    title: string;
    year: number;
    ids?: {
      imdb?: string;
      tmdb?: number;
      trakt?: number;
      tvdb?: number;
    };
  };
  show?: {
    title: string;
    year: number;
    ids?: {
      imdb?: string;
      tmdb?: number;
      trakt?: number;
      tvdb?: number;
    };
  };
  listed_at?: string;
  rank?: number;
  type?: string;
  score?: number;
  watchers?: number;
  list?: TraktApiList;
}

class TraktClient {
  private clientId: string;
  private accessToken: string | null;
  private baseUrl: string;

  constructor(clientId: string, accessToken: string | null = null, baseUrl = 'https://api.trakt.tv') {
    this.clientId = clientId;
    this.accessToken = accessToken;
    this.baseUrl = baseUrl;
  }

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'trakt-api-version': '2',
      'trakt-api-key': this.clientId,
      ...(options.headers as Record<string, string> || {}),
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const error = new Error(`Trakt API error: ${response.status}`) as HttpError;
        error.status = response.status;
        throw error;
      }

      return response.json() as Promise<T>;
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        const networkError = new Error(`Network error: Failed to connect to Trakt API at ${this.baseUrl}`) as HttpError;
        networkError.code = (error as NodeJS.ErrnoException).code || 'NETWORK_ERROR';
        networkError.originalError = error;
        throw networkError;
      }
      throw error;
    }
  }

  async getMyLists(): Promise<TraktList[]> {
    const lists = await this.request<TraktApiList[]>('/users/me/lists');
    return lists.map((list) => this.normalizeList(list));
  }

  async getList(listId: string): Promise<TraktList> {
    const list = await this.request<TraktApiList>(`/users/me/lists/${listId}`);
    return this.normalizeList(list);
  }

  async getListItems(listId: string): Promise<TraktListItem[]> {
    const items = await this.request<TraktApiItem[]>(`/users/me/lists/${listId}/items`);
    return items.map((item) => this.normalizeItem(item));
  }

  async getWatchlist(type: string | null = null): Promise<TraktListItem[]> {
    const endpoint = type
      ? `/users/me/watchlist/${type}`
      : '/users/me/watchlist';
    const items = await this.request<TraktApiItem[]>(endpoint);
    return items.map((item) => this.normalizeItem(item));
  }

  async getCollection(type = 'movies'): Promise<TraktListItem[]> {
    const items = await this.request<TraktApiItem[]>(`/users/me/collection/${type}`);
    return items.map((item) => this.normalizeItem(item));
  }

  async getPopularLists(limit = 20): Promise<TraktList[]> {
    const lists = await this.request<TraktApiItem[]>(`/lists/popular?limit=${limit}`);
    return lists.map((item) => this.normalizeList(item.list || item as unknown as TraktApiList));
  }

  async searchLists(query: string, limit = 20): Promise<TraktList[]> {
    const results = await this.request<Array<{ list: TraktApiList }>>(`/search/list?query=${encodeURIComponent(query)}&limit=${limit}`);
    return results.map((r) => this.normalizeList(r.list));
  }

  async search(query: string, type = 'movie,show', limit = 20): Promise<TraktSearchResult[]> {
    const results = await this.request<TraktApiItem[]>(`/search/${type}?query=${encodeURIComponent(query)}&limit=${limit}`);
    return results.map((r) => ({
      mediaType: r.movie ? 'MOVIE' : 'SHOW',
      score: r.score || 0,
      ...this.normalizeMedia(r.movie || r.show!),
    }));
  }

  async getTrendingMovies(limit = 20): Promise<TraktTrendingItem[]> {
    const results = await this.request<TraktApiItem[]>(`/movies/trending?limit=${limit}`);
    return results.map((r) => ({
      watchers: r.watchers || 0,
      ...this.normalizeMedia(r.movie!),
      mediaType: 'MOVIE' as const,
    }));
  }

  async getTrendingShows(limit = 20): Promise<TraktTrendingItem[]> {
    const results = await this.request<TraktApiItem[]>(`/shows/trending?limit=${limit}`);
    return results.map((r) => ({
      watchers: r.watchers || 0,
      ...this.normalizeMedia(r.show!),
      mediaType: 'SHOW' as const,
    }));
  }

  private normalizeList(list: TraktApiList): TraktList {
    return {
      id: list.ids?.slug || list.ids?.trakt,
      traktId: list.ids?.trakt?.toString(),
      name: list.name,
      description: list.description,
      itemCount: list.item_count,
      likes: list.likes,
      privacy: list.privacy,
      user: list.user?.username,
      createdAt: list.created_at,
      updatedAt: list.updated_at,
    };
  }

  private normalizeItem(item: TraktApiItem): TraktListItem {
    const media = item.movie || item.show;
    return {
      mediaType: item.movie ? 'MOVIE' : 'SHOW',
      title: media!.title,
      year: media!.year,
      imdbId: media?.ids?.imdb,
      tmdbId: media?.ids?.tmdb?.toString(),
      traktId: media?.ids?.trakt?.toString(),
      tvdbId: media?.ids?.tvdb?.toString(),
      listedAt: item.listed_at,
      rank: item.rank,
    };
  }

  private normalizeMedia(media: NonNullable<TraktApiItem['movie']>): TraktMedia {
    return {
      title: media.title,
      year: media.year,
      imdbId: media.ids?.imdb,
      tmdbId: media.ids?.tmdb?.toString(),
      traktId: media.ids?.trakt?.toString(),
      tvdbId: media.ids?.tvdb?.toString(),
    };
  }
}

export function createTraktClient(clientId: string | undefined, accessToken: string | null = null, baseUrl?: string): TraktClient | null {
  if (!clientId) {
    return null;
  }
  return new TraktClient(clientId, accessToken, baseUrl);
}

export default TraktClient;
