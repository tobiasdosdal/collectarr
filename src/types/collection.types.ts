/**
 * Collection Types
 * Types for collection management
 */

// Source types for collections
export type SourceType = 'MDBLIST' | 'TRAKT_LIST' | 'TRAKT_WATCHLIST' | 'TRAKT_COLLECTION' | 'MANUAL';

export type MediaType = 'MOVIE' | 'SHOW';

// Refreshed item from external source
export interface RefreshedItem {
  mediaType: string;
  title: string;
  year: number | null;
  imdbId: string | null;
  tmdbId: string | null;
  traktId: string | null;
  tvdbId: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  rating: number | null;
  ratingCount: number | null;
}

// Collection item for API requests
export interface AddItemBody {
  mediaType: string;
  title: string;
  year?: number;
  imdbId?: string;
  tmdbId?: string;
  traktId?: string;
  tvdbId?: string;
}

// Route params
export interface CollectionParams {
  id: string;
}

export interface ItemParams {
  id: string;
  itemId: string;
}

// Collection stats
export interface CollectionStats {
  total: number;
  inEmby: number;
  missing: number;
  percentInLibrary: number;
}

// Collection with cached images
export interface CollectionWithImages {
  id: string;
  name: string;
  description?: string | null;
  sourceType: string;
  sourceId?: string | null;
  sourceUrl?: string | null;
  posterPath?: string | null;
  isEnabled: boolean;
  refreshIntervalHours: number;
  syncToEmbyOnRefresh: boolean;
  removeFromEmby: boolean;
  lastSyncAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  itemCount: number;
  embyServerIds: string[];
}

// Collection item with cached images
export interface CollectionItemWithImages {
  id: string;
  collectionId: string;
  mediaType: string;
  title: string;
  year?: number | null;
  imdbId?: string | null;
  tmdbId?: string | null;
  traktId?: string | null;
  tvdbId?: string | null;
  posterPath?: string | null;
  backdropPath?: string | null;
  rating?: number | null;
  ratingCount?: number | null;
  inEmby: boolean;
  addedAt: Date;
}
