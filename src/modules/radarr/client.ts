/**
 * Radarr API Client
 * Handles direct communication with Radarr server REST API v3
 */

import { BaseApiClient, type HttpError, type TestConnectionResult } from '../../shared/http/index.js';

export interface RadarrSystemStatus {
  appName: string;
  instanceName: string;
  version: string;
  buildTime: string;
  isDebug: boolean;
  isProduction: boolean;
  isAdmin: boolean;
  isUserInteractive: boolean;
  startupPath: string;
  appData: string;
  osName: string;
  osVersion: string;
  isNetCore: boolean;
  isLinux: boolean;
  isOsx: boolean;
  isWindows: boolean;
  isDocker: boolean;
  mode: string;
  branch: string;
  authentication: string;
  sqliteVersion: string;
  migrationVersion: number;
  urlBase: string;
  runtimeVersion: string;
  runtimeName: string;
  startTime: string;
  packageVersion: string;
  packageAuthor: string;
  packageUpdateMechanism: string;
}

export interface QualityProfile {
  id: number;
  name: string;
  upgradeAllowed: boolean;
  cutoff: number;
  items: unknown[];
}

export interface RootFolder {
  id: number;
  path: string;
  accessible: boolean;
  freeSpace: number;
  unmappedFolders: unknown[];
}

export interface RadarrMovie {
  id?: number;
  title: string;
  originalTitle?: string;
  originalLanguage?: { id: number; name: string };
  alternateTitles?: unknown[];
  sortTitle?: string;
  status?: string;
  overview?: string;
  inCinemas?: string;
  physicalRelease?: string;
  digitalRelease?: string;
  images?: unknown[];
  website?: string;
  year: number;
  hasFile?: boolean;
  youTubeTrailerId?: string;
  studio?: string;
  path?: string;
  qualityProfileId?: number;
  monitored?: boolean;
  minimumAvailability?: string;
  isAvailable?: boolean;
  folderName?: string;
  runtime?: number;
  cleanTitle?: string;
  imdbId?: string;
  tmdbId: number;
  titleSlug?: string;
  rootFolderPath?: string;
  folder?: string;
  certification?: string;
  genres?: string[];
  tags?: number[];
  added?: string;
  ratings?: {
    imdb?: { votes: number; value: number; type: string };
    tmdb?: { votes: number; value: number; type: string };
  };
  movieFile?: unknown;
  popularity?: number;
  addOptions?: {
    searchForMovie?: boolean;
    addMethod?: string;
    monitor?: string;
  };
}

export interface AddMovieOptions {
  tmdbId: number;
  title: string;
  year: number;
  qualityProfileId: number;
  rootFolderPath: string;
  monitored?: boolean;
  minimumAvailability?: string;
  addOptions?: {
    searchForMovie?: boolean;
    addMethod?: string;
    monitor?: string;
  };
}

export interface RadarrTestConnectionResult extends TestConnectionResult {}

class RadarrClient extends BaseApiClient {
  constructor(serverUrl: string, apiKey: string) {
    super(serverUrl, apiKey, 'Radarr', {
      apiKeyHeaderName: 'X-Api-Key',
      apiVersion: 'v3',
    });
  }

  async getSystemStatus(): Promise<{ appName: string; instanceName: string; version: string }> {
    const status = await this.request<{ appName: string; instanceName: string; version: string }>('/system/status');
    return {
      appName: status.appName,
      instanceName: status.instanceName,
      version: status.version,
    };
  }

  async getQualityProfiles(): Promise<QualityProfile[]> {
    return this.request<QualityProfile[]>('/qualityprofile');
  }

  async getRootFolders(): Promise<RootFolder[]> {
    return this.request<RootFolder[]>('/rootfolder');
  }

  async getMovies(): Promise<RadarrMovie[]> {
    return this.request<RadarrMovie[]>('/movie');
  }

  async getMovieByTmdbId(tmdbId: number): Promise<RadarrMovie | null> {
    const movies = await this.request<RadarrMovie[]>(`/movie?tmdbId=${tmdbId}`);
    return movies.length > 0 ? movies[0]! : null;
  }

  async lookupMovieByTmdbId(tmdbId: number): Promise<RadarrMovie | null> {
    const movies = await this.request<RadarrMovie[]>(`/movie/lookup?term=tmdb:${tmdbId}`);
    return movies.length > 0 ? movies[0]! : null;
  }

  async lookupMovie(term: string): Promise<RadarrMovie[]> {
    return this.request<RadarrMovie[]>(`/movie/lookup?term=${encodeURIComponent(term)}`);
  }

  async addMovie(options: AddMovieOptions): Promise<RadarrMovie> {
    const lookupResult = await this.lookupMovieByTmdbId(options.tmdbId);
    if (!lookupResult) {
      throw new Error(`Movie with TMDb ID ${options.tmdbId} not found`);
    }

    const movie: RadarrMovie = {
      ...lookupResult,
      qualityProfileId: options.qualityProfileId,
      rootFolderPath: options.rootFolderPath,
      monitored: options.monitored ?? true,
      minimumAvailability: options.minimumAvailability ?? 'announced',
      addOptions: options.addOptions ?? {
        searchForMovie: true,
        addMethod: 'manual',
        monitor: 'movieOnly',
      },
    };

    return this.request<RadarrMovie>('/movie', {
      method: 'POST',
      body: JSON.stringify(movie),
    });
  }

  async isMovieInLibrary(tmdbId: number): Promise<boolean> {
    const movie = await this.getMovieByTmdbId(tmdbId);
    return movie !== null;
  }
}

export function createRadarrClient(serverUrl: string | undefined, apiKey: string | undefined): RadarrClient | null {
  if (!serverUrl || !apiKey) {
    return null;
  }
  return new RadarrClient(serverUrl, apiKey);
}

export default RadarrClient;
