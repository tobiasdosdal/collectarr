/**
 * Sonarr API Client
 * Handles direct communication with Sonarr server REST API v3
 */

import { BaseApiClient, type HttpError, type TestConnectionResult } from '../../shared/http/index.js';

export interface SonarrSystemStatus {
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

export interface SonarrSeries {
  id?: number;
  title: string;
  alternateTitles?: unknown[];
  sortTitle?: string;
  status?: string;
  ended?: boolean;
  overview?: string;
  previousAiring?: string;
  network?: string;
  airTime?: string;
  images?: unknown[];
  originalLanguage?: { id: number; name: string };
  seasons?: {
    seasonNumber: number;
    monitored: boolean;
    statistics?: {
      episodeFileCount: number;
      episodeCount: number;
      totalEpisodeCount: number;
      sizeOnDisk: number;
      percentOfEpisodes: number;
    };
  }[];
  year: number;
  path?: string;
  qualityProfileId?: number;
  seasonFolder?: boolean;
  monitored?: boolean;
  monitorNewItems?: string;
  useSceneNumbering?: boolean;
  runtime?: number;
  tvdbId: number;
  tvRageId?: number;
  tvMazeId?: number;
  imdbId?: string;
  firstAired?: string;
  seriesType?: string;
  cleanTitle?: string;
  titleSlug?: string;
  rootFolderPath?: string;
  folder?: string;
  certification?: string;
  genres?: string[];
  tags?: number[];
  added?: string;
  ratings?: {
    votes: number;
    value: number;
  };
  statistics?: {
    seasonCount: number;
    episodeFileCount: number;
    episodeCount: number;
    totalEpisodeCount: number;
    sizeOnDisk: number;
    percentOfEpisodes: number;
  };
  languageProfileId?: number;
  addOptions?: {
    ignoreEpisodesWithFiles?: boolean;
    ignoreEpisodesWithoutFiles?: boolean;
    monitor?: string;
    searchForMissingEpisodes?: boolean;
    searchForCutoffUnmetEpisodes?: boolean;
  };
}

export interface AddSeriesOptions {
  tvdbId: number;
  title: string;
  year: number;
  qualityProfileId: number;
  rootFolderPath: string;
  monitored?: boolean;
  seasonFolder?: boolean;
  seriesType?: string;
  addOptions?: {
    ignoreEpisodesWithFiles?: boolean;
    ignoreEpisodesWithoutFiles?: boolean;
    monitor?: string;
    searchForMissingEpisodes?: boolean;
    searchForCutoffUnmetEpisodes?: boolean;
  };
}

export interface SonarrTestConnectionResult extends TestConnectionResult {}

class SonarrClient extends BaseApiClient {
  constructor(serverUrl: string, apiKey: string) {
    super(serverUrl, apiKey, 'Sonarr', {
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

  async getSeries(): Promise<SonarrSeries[]> {
    return this.request<SonarrSeries[]>('/series');
  }

  async getSeriesByTvdbId(tvdbId: number): Promise<SonarrSeries | null> {
    const series = await this.request<SonarrSeries[]>(`/series?tvdbId=${tvdbId}`);
    return series.length > 0 ? series[0]! : null;
  }

  async lookupSeriesByTvdbId(tvdbId: number): Promise<SonarrSeries | null> {
    const series = await this.request<SonarrSeries[]>(`/series/lookup?term=tvdb:${tvdbId}`);
    return series.length > 0 ? series[0]! : null;
  }

  async lookupSeries(term: string): Promise<SonarrSeries[]> {
    return this.request<SonarrSeries[]>(`/series/lookup?term=${encodeURIComponent(term)}`);
  }

  async addSeries(options: AddSeriesOptions): Promise<SonarrSeries> {
    const lookupResult = await this.lookupSeriesByTvdbId(options.tvdbId);
    if (!lookupResult) {
      throw new Error(`Series with TVDb ID ${options.tvdbId} not found`);
    }

    const series: SonarrSeries = {
      ...lookupResult,
      qualityProfileId: options.qualityProfileId,
      rootFolderPath: options.rootFolderPath,
      monitored: options.monitored ?? true,
      seasonFolder: options.seasonFolder ?? true,
      seriesType: options.seriesType ?? 'standard',
      addOptions: options.addOptions ?? {
        ignoreEpisodesWithFiles: false,
        ignoreEpisodesWithoutFiles: false,
        monitor: 'all',
        searchForMissingEpisodes: true,
        searchForCutoffUnmetEpisodes: false,
      },
    };

    return this.request<SonarrSeries>('/series', {
      method: 'POST',
      body: JSON.stringify(series),
    });
  }

  async isSeriesInLibrary(tvdbId: number): Promise<boolean> {
    const series = await this.getSeriesByTvdbId(tvdbId);
    return series !== null;
  }
}

export function createSonarrClient(serverUrl: string | undefined, apiKey: string | undefined): SonarrClient | null {
  if (!serverUrl || !apiKey) {
    return null;
  }
  return new SonarrClient(serverUrl, apiKey);
}

export default SonarrClient;
