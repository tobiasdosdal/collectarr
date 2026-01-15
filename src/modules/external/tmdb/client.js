/**
 * TMDb API Client
 * Primary use: ID translation between external providers
 */

class TMDbClient {
  constructor(apiKey, baseUrl = 'https://api.themoviedb.org/3') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async request(endpoint, options = {}) {
    const url = new URL(`${this.baseUrl}${endpoint}`);

    const headers = {
      'Accept': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
      ...options.headers,
    };

    try {
      const response = await fetch(url.toString(), {
        ...options,
        headers,
      });

      if (!response.ok) {
        const error = new Error(`TMDb API error: ${response.status}`);
        error.status = response.status;
        throw error;
      }

      return response.json();
    } catch (error) {
      // Handle network errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        const networkError = new Error(`Network error: Failed to connect to TMDb API at ${this.baseUrl}`);
        networkError.code = error.code || 'NETWORK_ERROR';
        networkError.originalError = error;
        throw networkError;
      }
      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Find media by external ID (IMDb, TVDB, etc.)
   * This is the key endpoint for ID translation
   */
  async findByExternalId(externalId, externalSource) {
    // externalSource: imdb_id, tvdb_id, freebase_mid, freebase_id, facebook_id, instagram_id, twitter_id
    const data = await this.request(`/find/${externalId}?external_source=${externalSource}`);

    return {
      movies: data.movie_results || [],
      shows: data.tv_results || [],
    };
  }

  /**
   * Get movie details by TMDb ID
   */
  async getMovie(tmdbId) {
    return this.request(`/movie/${tmdbId}?append_to_response=external_ids`);
  }

  /**
   * Get TV show details by TMDb ID
   */
  async getShow(tmdbId) {
    return this.request(`/tv/${tmdbId}?append_to_response=external_ids`);
  }

  /**
   * Search for movies
   */
  async searchMovies(query, year = null) {
    let endpoint = `/search/movie?query=${encodeURIComponent(query)}`;
    if (year) {
      endpoint += `&year=${year}`;
    }
    return this.request(endpoint);
  }

  /**
   * Search for TV shows
   */
  async searchShows(query, year = null) {
    let endpoint = `/search/tv?query=${encodeURIComponent(query)}`;
    if (year) {
      endpoint += `&first_air_date_year=${year}`;
    }
    return this.request(endpoint);
  }

  /**
   * Translate an external ID to all known IDs
   * Returns: { imdbId, tmdbId, tvdbId }
   */
  async translateId(externalId, sourceType, mediaType) {
    let result = null;

    // Try to find by the external ID
    if (sourceType === 'imdb') {
      const found = await this.findByExternalId(externalId, 'imdb_id');
      if (mediaType === 'MOVIE' && found.movies.length > 0) {
        result = found.movies[0];
      } else if (mediaType === 'SHOW' && found.shows.length > 0) {
        result = found.shows[0];
      }
    } else if (sourceType === 'tvdb') {
      const found = await this.findByExternalId(externalId, 'tvdb_id');
      if (found.shows.length > 0) {
        result = found.shows[0];
      }
    }

    if (!result) {
      return null;
    }

    // Get full details with external IDs
    let details;
    if (mediaType === 'MOVIE') {
      details = await this.getMovie(result.id);
    } else {
      details = await this.getShow(result.id);
    }

    return {
      tmdbId: details.id.toString(),
      imdbId: details.external_ids?.imdb_id || null,
      tvdbId: details.external_ids?.tvdb_id?.toString() || null,
      title: details.title || details.name,
      year: (details.release_date || details.first_air_date)?.slice(0, 4),
    };
  }
}

export function createTMDbClient(config) {
  if (!config?.external?.tmdb?.apiKey) {
    return null;
  }
  return new TMDbClient(config.external.tmdb.apiKey, config.external.tmdb.baseUrl);
}

export default TMDbClient;
