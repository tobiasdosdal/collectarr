/**
 * MDBList Refresh Helper
 * Handles refreshing collections from MDBList source
 */

import type { AppConfig, RefreshedItem, MDBListItem, MDBListDetail } from '../../../types/index.js';
import { cacheImage } from '../../../utils/image-cache.js';
import { fetchTmdbPoster, searchTmdbByTitle } from '../../../utils/tmdb-api.js';

export async function refreshFromMdblist(
  listId: string,
  apiKey: string | undefined,
  config: AppConfig
): Promise<RefreshedItem[]> {
  if (!apiKey) {
    throw new Error('MDBList API key is required');
  }

  try {
    const response = await fetch(
      `${config.external.mdblist.baseUrl}/lists/${listId}/items?apikey=${apiKey}`
    );

    if (!response.ok) {
      throw new Error(`MDBList API error: ${response.status}`);
    }

    const data = await response.json();

    let items: MDBListItem[];
    if (Array.isArray(data)) {
      items = data;
    } else if (data.items && Array.isArray(data.items)) {
      items = data.items;
    } else if (data.movies || data.shows) {
      // Combine movies and shows if both exist
      const movies = Array.isArray(data.movies) ? data.movies : [];
      const shows = Array.isArray(data.shows) ? data.shows : [];
      items = [...movies, ...shows];
    } else {
      throw new Error(`MDBList API returned unexpected format`);
    }

    const enrichedItems: RefreshedItem[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item) continue;

      try {
        const enrichedItem = await fetchMdblistItemDetails(item, apiKey, config);
        enrichedItems.push(enrichedItem);

        if (i < items.length - 1) {
          await new Promise(r => setTimeout(r, 50));
        }
      } catch (err) {
        // Continue with next item
      }
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

export async function fetchMdblistItemDetails(
  item: MDBListItem,
  apiKey: string,
  config: AppConfig
): Promise<RefreshedItem> {
  const imdbId = item.imdb_id || item.imdbid;

  let basicPosterPath: string | null = null;
  if (item.poster) {
    if (item.poster.startsWith('http')) {
      basicPosterPath = item.poster.replace('/original/', '/w500/').replace('/w500/', '/w500/');
    } else {
      basicPosterPath = `https://image.tmdb.org/t/p/w500${item.poster}`;
    }
  }

  const result: RefreshedItem = {
    mediaType: (item.mediatype || item.media_type) === 'movie' ? 'MOVIE' : 'SHOW',
    title: item.title || item.name || '',
    year: item.year || item.release_year || null,
    imdbId: imdbId || null,
    tmdbId: (item.tmdb_id || item.id)?.toString() || null,
    traktId: item.trakt_id?.toString() || null,
    tvdbId: item.tvdb_id?.toString() || null,
    posterPath: basicPosterPath,
    backdropPath: null,
    rating: null,
    ratingCount: null,
  };

  if (imdbId) {
    try {
      const detailResponse = await fetch(`https://mdblist.com/api/?apikey=${apiKey}&i=${imdbId}`);

      if (detailResponse.ok) {
        const detail = (await detailResponse.json()) as MDBListDetail;

        result.tmdbId = detail.tmdbid?.toString() || result.tmdbId;
        result.traktId = detail.traktid?.toString() || result.traktId;
        result.tvdbId = detail.tvdbid?.toString() || result.tvdbId;
        result.year = detail.year || result.year;
        result.rating = detail.score || detail.imdbrating || null;
        result.ratingCount = detail.imdbvotes || null;

        if (detail.poster) {
          const tmdbPosterUrl = detail.poster.startsWith('http')
            ? detail.poster.replace('/original/', '/w500/').replace('/w500/', '/w500/')
            : `https://image.tmdb.org/t/p/w500${detail.poster}`;
          result.posterPath = tmdbPosterUrl;
          cacheImage(tmdbPosterUrl).catch(() => {});
        }

        if (detail.backdrop) {
          const tmdbBackdropUrl = detail.backdrop.startsWith('http')
            ? detail.backdrop
            : `https://image.tmdb.org/t/p/w1280${detail.backdrop}`;
          result.backdropPath = tmdbBackdropUrl;
          cacheImage(tmdbBackdropUrl).catch(() => {});
        }
      }
    } catch (err) {
      // Continue without details
    }
  }

  if (!result.posterPath && result.tmdbId) {
    const tmdbPoster = await fetchTmdbPoster(result.tmdbId, result.mediaType);
    if (tmdbPoster) {
      result.posterPath = tmdbPoster;
    }
  }

  if (!result.posterPath && result.title) {
    const tmdbPoster = await searchTmdbByTitle(result.title, result.mediaType, result.year);
    if (tmdbPoster) {
      result.posterPath = tmdbPoster;
      result.tmdbId = tmdbPoster.split('/').pop()?.split('-')[0] || result.tmdbId;
    }
  }

  if (result.posterPath) {
    cacheImage(result.posterPath).catch(() => {});
  }

  return result;
}
