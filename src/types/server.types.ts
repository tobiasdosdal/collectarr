/**
 * Server Types
 * Types for Radarr, Sonarr, and Emby server management
 */

// Common server params used in routes
export interface ServerParams {
  id: string;
}

export interface ServerIdParams {
  serverId: string;
}

// Quality profile (shared between Radarr and Sonarr)
export interface QualityProfile {
  id: number;
  name: string;
  upgradeAllowed?: boolean;
  cutoff?: number;
  items?: unknown[];
}

// Root folder (shared between Radarr and Sonarr)
export interface RootFolder {
  id: number;
  path: string;
  accessible: boolean;
  freeSpace: number;
  unmappedFolders?: unknown[];
}

// Server body types for create/update
export interface MediaServerBody {
  name?: string;
  url?: string;
  apiKey?: string;
  isDefault?: boolean;
  qualityProfileId?: number;
  rootFolderPath?: string;
}

export interface TestConnectionBody {
  url: string;
  apiKey: string;
}

// Server response types (sanitized - no API key)
export interface MediaServerResponse {
  id: string;
  name: string;
  url: string;
  isDefault: boolean;
  qualityProfileId?: number | null;
  rootFolderPath?: string | null;
  createdAt: Date;
  serverName?: string;
  version?: string;
}

// Database server records (with encrypted API key)
export interface StoredServerRecord {
  id: string;
  name: string;
  url: string;
  apiKey: string;
  apiKeyIv: string;
  isDefault: boolean;
  qualityProfileId?: number | null;
  rootFolderPath?: string | null;
  createdAt: Date;
}
