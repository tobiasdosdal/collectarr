/**
 * Trakt Refresh Helper
 * Handles refreshing collections from Trakt sources
 */

import type { AppConfig, RefreshedItem } from '../../../types/index.js';
import { createTraktClient } from '../../external/trakt/client.js';

interface CollectionSource {
  sourceType: string;
  sourceId: string | null;
}

export async function refreshFromTrakt(
  collection: CollectionSource,
  accessToken: string,
  config: AppConfig
): Promise<RefreshedItem[]> {
  const client = createTraktClient(
    config.external.trakt.clientId,
    accessToken,
    config.external.trakt.baseUrl
  );

  if (!client) {
    throw new Error('Failed to create Trakt client - missing client ID');
  }

  let endpoint: string;
  switch (collection.sourceType) {
    case 'TRAKT_LIST':
      endpoint = `/users/me/lists/${collection.sourceId}/items`;
      break;
    case 'TRAKT_WATCHLIST':
      endpoint = '/users/me/watchlist';
      break;
    case 'TRAKT_COLLECTION':
      endpoint = '/users/me/collection';
      break;
    default:
      throw new Error(`Unknown source type: ${collection.sourceType}`);
  }

  const data = await client.request<any[]>(endpoint);

  if (!Array.isArray(data)) {
    throw new Error(`Trakt API returned unexpected data type: ${typeof data}. Expected array.`);
  }

  return data.map((item: any) => {
    const media = item.movie || item.show;

    return {
      mediaType: item.movie ? 'MOVIE' : 'SHOW',
      title: media?.title || '',
      year: media?.year || null,
      imdbId: media?.ids?.imdb || null,
      tmdbId: media?.ids?.tmdb?.toString() || null,
      traktId: media?.ids?.trakt?.toString() || null,
      tvdbId: media?.ids?.tvdb?.toString() || null,
      posterPath: null,
      backdropPath: null,
      rating: media?.rating || null,
      ratingCount: media?.votes || null,
    };
  });
}
