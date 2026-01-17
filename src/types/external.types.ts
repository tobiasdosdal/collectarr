/**
 * External API Types
 * Types for MDBList, Trakt, and TMDB integrations
 */

// MDBList types
export interface MDBListItem {
  imdb_id?: string;
  imdbid?: string;
  poster?: string;
  mediatype?: string;
  media_type?: string;
  title?: string;
  name?: string;
  year?: number;
  release_year?: number;
  tmdb_id?: number;
  id?: number;
  trakt_id?: number;
  tvdb_id?: number;
}

export interface MDBListDetail {
  tmdbid?: number;
  traktid?: number;
  tvdbid?: number;
  year?: number;
  score?: number;
  imdbrating?: number;
  imdbvotes?: number;
  poster?: string;
  backdrop?: string;
}

export interface MDBListSearchResult {
  id: number;
  title: string;
  description?: string;
  mediatype?: string;
  item_count?: number;
  user?: {
    id: number;
    name: string;
  };
}

// Trakt types
export interface TraktIds {
  trakt: number;
  slug: string;
  imdb?: string;
  tmdb?: number;
  tvdb?: number;
}

export interface TraktMovie {
  title: string;
  year: number;
  ids: TraktIds;
  rating?: number;
  votes?: number;
}

export interface TraktShow {
  title: string;
  year: number;
  ids: TraktIds;
  rating?: number;
  votes?: number;
}

export interface TraktListItem {
  rank?: number;
  listed_at?: string;
  type: string;
  movie?: TraktMovie;
  show?: TraktShow;
}

export interface TraktList {
  name: string;
  description?: string;
  privacy?: string;
  type?: string;
  display_numbers?: boolean;
  allow_comments?: boolean;
  sort_by?: string;
  sort_how?: string;
  created_at?: string;
  updated_at?: string;
  item_count?: number;
  comment_count?: number;
  likes?: number;
  ids?: {
    trakt: number;
    slug: string;
  };
  user?: {
    username: string;
    private: boolean;
    name?: string;
    vip?: boolean;
    ids?: { slug: string };
  };
}

// TMDB types
export interface TmdbSearchResult {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string;
  backdrop_path?: string;
  vote_average?: number;
  vote_count?: number;
  media_type?: string;
}

export interface TmdbMovieDetails {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  poster_path?: string;
  backdrop_path?: string;
  release_date?: string;
  vote_average?: number;
  vote_count?: number;
  genres?: { id: number; name: string }[];
  runtime?: number;
  imdb_id?: string;
}

export interface TmdbShowDetails {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  poster_path?: string;
  backdrop_path?: string;
  first_air_date?: string;
  vote_average?: number;
  vote_count?: number;
  genres?: { id: number; name: string }[];
  episode_run_time?: number[];
  external_ids?: {
    imdb_id?: string;
    tvdb_id?: number;
  };
}

// Emby types
export interface EmbyItem {
  Id: string;
  Name: string;
  Type: string;
  ProductionYear?: number;
  Path?: string;
  ProviderIds?: {
    Imdb?: string;
    Tmdb?: string;
    Tvdb?: string;
  };
  ImageTags?: {
    Primary?: string;
    Backdrop?: string;
  };
}

export interface EmbyCollection {
  Id: string;
  Name: string;
  Type: string;
  ChildCount?: number;
}

export interface EmbySearchResult {
  Items: EmbyItem[];
  TotalRecordCount: number;
}

export interface EmbyServerInfo {
  ServerName: string;
  Version: string;
  Id: string;
}
