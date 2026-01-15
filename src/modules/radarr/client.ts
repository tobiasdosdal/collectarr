/**
 * Radarr API Client
 * Handles direct communication with Radarr server REST API v3
 */

interface HttpError extends Error {
  status?: number;
  code?: string;
  originalError?: Error;
}

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

export interface TestConnectionResult {
  success: boolean;
  serverName?: string;
  version?: string;
  error?: string;
}

class RadarrClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(serverUrl: string, apiKey: string) {
    this.baseUrl = serverUrl.replace(/\/$/, '') + '/api/v3';
    this.apiKey = apiKey;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-Api-Key': this.apiKey,
          ...(options.headers as Record<string, string> || {}),
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Radarr API error: ${response.status} ${response.statusText}`;
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.message) {
            errorMessage = errorJson.message;
          }
        } catch {
          // Use default error message
        }
        const error = new Error(errorMessage) as HttpError;
        error.status = response.status;
        throw error;
      }

      const text = await response.text();
      return text ? JSON.parse(text) as T : null as T;
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        const networkError = new Error(`Network error: Failed to connect to Radarr server`) as HttpError;
        networkError.code = (error as NodeJS.ErrnoException).code || 'NETWORK_ERROR';
        networkError.originalError = error;
        throw networkError;
      }
      throw error;
    }
  }

  async testConnection(): Promise<TestConnectionResult> {
    try {
      const status = await this.request<RadarrSystemStatus>('/system/status');
      return {
        success: true,
        serverName: status.instanceName || status.appName,
        version: status.version,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  async getSystemStatus(): Promise<RadarrSystemStatus> {
    return this.request<RadarrSystemStatus>('/system/status');
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
    // First lookup the movie to get full details
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
