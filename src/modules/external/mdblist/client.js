/**
 * MDBList API Client
 * Docs: https://mdblist.com/api-docs
 */

class MDBListClient {
  constructor(apiKey, baseUrl = 'https://api.mdblist.com') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async request(endpoint) {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    url.searchParams.set('apikey', this.apiKey);

    try {
      const response = await fetch(url.toString(), {
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        const error = new Error(`MDBList API error: ${response.status}`);
        error.status = response.status;
        throw error;
      }

      return response.json();
    } catch (error) {
      // Handle network errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        const networkError = new Error(`Network error: Failed to connect to MDBList API at ${this.baseUrl}`);
        networkError.code = error.code || 'NETWORK_ERROR';
        networkError.originalError = error;
        throw networkError;
      }
      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Search for lists by name
   */
  async searchLists(query) {
    return this.request(`/lists/search?query=${encodeURIComponent(query)}`);
  }

  /**
   * Get top/popular lists
   */
  async getTopLists(limit = 20) {
    return this.request(`/lists/top?limit=${limit}`);
  }

  /**
   * Get user's own lists
   */
  async getMyLists() {
    return this.request('/lists/user');
  }

  /**
   * Get list info/metadata
   */
  async getListInfo(listId) {
    return this.request(`/lists/${listId}`);
  }

  /**
   * Get list items
   */
  async getListItems(listId) {
    const data = await this.request(`/lists/${listId}/items`);

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

  /**
   * Search for a movie/show
   */
  async searchMedia(query, mediaType = null) {
    let endpoint = `/search?query=${encodeURIComponent(query)}`;
    if (mediaType) {
      endpoint += `&mediatype=${mediaType === 'MOVIE' ? 'movie' : 'show'}`;
    }
    return this.request(endpoint);
  }

  /**
   * Get movie/show info by ID
   */
  async getMediaById(id, idType = 'imdb') {
    // idType: imdb, tmdb, trakt, tvdb
    return this.request(`/${idType}/${id}`);
  }
}

export function createMDBListClient(apiKey, baseUrl) {
  if (!apiKey) {
    return null;
  }
  return new MDBListClient(apiKey, baseUrl);
}

export default MDBListClient;
