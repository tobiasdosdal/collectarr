/**
 * Trakt API Client
 * Docs: https://trakt.docs.apiary.io/
 */

class TraktClient {
  constructor(clientId, accessToken = null, baseUrl = 'https://api.trakt.tv') {
    this.clientId = clientId;
    this.accessToken = accessToken;
    this.baseUrl = baseUrl;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;

    const headers = {
      'Content-Type': 'application/json',
      'trakt-api-version': '2',
      'trakt-api-key': this.clientId,
      ...options.headers,
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
        const error = new Error(`Trakt API error: ${response.status}`);
        error.status = response.status;
        throw error;
      }

      return response.json();
    } catch (error) {
      // Handle network errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        const networkError = new Error(`Network error: Failed to connect to Trakt API at ${this.baseUrl}`);
        networkError.code = error.code || 'NETWORK_ERROR';
        networkError.originalError = error;
        throw networkError;
      }
      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Get user's custom lists
   */
  async getMyLists() {
    const lists = await this.request('/users/me/lists');
    return lists.map(this.normalizeList);
  }

  /**
   * Get a specific list
   */
  async getList(listId) {
    const list = await this.request(`/users/me/lists/${listId}`);
    return this.normalizeList(list);
  }

  /**
   * Get items in a list
   */
  async getListItems(listId) {
    const items = await this.request(`/users/me/lists/${listId}/items`);
    return items.map(this.normalizeItem);
  }

  /**
   * Get user's watchlist
   */
  async getWatchlist(type = null) {
    const endpoint = type
      ? `/users/me/watchlist/${type}`
      : '/users/me/watchlist';
    const items = await this.request(endpoint);
    return items.map(this.normalizeItem);
  }

  /**
   * Get user's collection
   */
  async getCollection(type = 'movies') {
    const items = await this.request(`/users/me/collection/${type}`);
    return items.map(this.normalizeItem);
  }

  /**
   * Get popular lists (public, no auth needed)
   */
  async getPopularLists(limit = 20) {
    const lists = await this.request(`/lists/popular?limit=${limit}`);
    return lists.map((item) => this.normalizeList(item.list || item));
  }

  /**
   * Search for lists (public)
   */
  async searchLists(query, limit = 20) {
    const results = await this.request(`/search/list?query=${encodeURIComponent(query)}&limit=${limit}`);
    return results.map((r) => this.normalizeList(r.list));
  }

  /**
   * Search for movies/shows
   */
  async search(query, type = 'movie,show', limit = 20) {
    const results = await this.request(`/search/${type}?query=${encodeURIComponent(query)}&limit=${limit}`);
    return results.map((r) => ({
      mediaType: r.type === 'movie' ? 'MOVIE' : 'SHOW',
      score: r.score,
      ...this.normalizeMedia(r.movie || r.show),
    }));
  }

  /**
   * Get trending movies
   */
  async getTrendingMovies(limit = 20) {
    const results = await this.request(`/movies/trending?limit=${limit}`);
    return results.map((r) => ({
      watchers: r.watchers,
      ...this.normalizeMedia(r.movie),
      mediaType: 'MOVIE',
    }));
  }

  /**
   * Get trending shows
   */
  async getTrendingShows(limit = 20) {
    const results = await this.request(`/shows/trending?limit=${limit}`);
    return results.map((r) => ({
      watchers: r.watchers,
      ...this.normalizeMedia(r.show),
      mediaType: 'SHOW',
    }));
  }

  // Helper to normalize list structure
  normalizeList(list) {
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

  // Helper to normalize item structure
  normalizeItem(item) {
    const media = item.movie || item.show;
    return {
      mediaType: item.movie ? 'MOVIE' : 'SHOW',
      title: media.title,
      year: media.year,
      imdbId: media.ids?.imdb,
      tmdbId: media.ids?.tmdb?.toString(),
      traktId: media.ids?.trakt?.toString(),
      tvdbId: media.ids?.tvdb?.toString(),
      listedAt: item.listed_at,
      rank: item.rank,
    };
  }

  // Helper to normalize media
  normalizeMedia(media) {
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

export function createTraktClient(clientId, accessToken = null, baseUrl) {
  if (!clientId) {
    return null;
  }
  return new TraktClient(clientId, accessToken, baseUrl);
}

export default TraktClient;
