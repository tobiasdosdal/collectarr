/**
 * Media Server Types
 * Generic types for server management factory
 */

import type { FastifyInstance } from 'fastify';

// Server configuration for the factory
export interface ServerConfig {
  // The name of the service (e.g., 'Radarr', 'Sonarr', 'Emby')
  serviceName: string;

  // Prisma model name (e.g., 'radarrServer', 'sonarrServer', 'embyServer', 'jellyfinServer')
  modelName: 'radarrServer' | 'sonarrServer' | 'embyServer' | 'jellyfinServer';

  // Whether the server supports quality profiles
  supportsProfiles: boolean;

  // Whether the server supports root folders
  supportsRootFolders: boolean;
}

// Common server body for create/update operations
export interface ServerBody {
  name?: string;
  url?: string;
  apiKey?: string;
  isDefault?: boolean;
  qualityProfileId?: number;
  rootFolderPath?: string;
}

// Test connection body
export interface TestConnectionBody {
  url: string;
  apiKey: string;
}

// Server params
export interface ServerParams {
  id: string;
}

// Server response (sanitized without API key)
export interface ServerResponse {
  id: string;
  name: string;
  url: string;
  isDefault: boolean;
  qualityProfileId?: number | null;
  rootFolderPath?: string | null;
  createdAt: Date;
  serverName?: string;
  serverVersion?: string;
}

// Quality profile response
export interface ProfileResponse {
  id: number;
  name: string;
}

// Root folder response
export interface RootFolderResponse {
  id: number;
  path: string;
  freeSpace?: number;
  accessible?: boolean;
}

// Test connection result
export interface TestConnectionResult {
  success: boolean;
  serverName?: string;
  version?: string;
  error?: string;
}

// Client interface that all API clients should implement
export interface ServerClient {
  testConnection(): Promise<TestConnectionResult>;
  getQualityProfiles?(): Promise<{ id: number; name: string }[]>;
  getRootFolders?(): Promise<{ id: number; path: string; freeSpace?: number; accessible?: boolean }[]>;
}

// Client factory function type
export type ClientFactory<T extends ServerClient> = (url: string, apiKey: string) => T | null;

// Repository interface for database operations
export interface ServerRepository {
  findMany(orderBy: { createdAt: 'asc' | 'desc' }): Promise<StoredServer[]>;
  findUnique(where: { id: string }): Promise<StoredServer | null>;
  create(data: ServerCreateData): Promise<StoredServer>;
  update(where: { id: string }, data: ServerUpdateData): Promise<StoredServer>;
  delete(where: { id: string }): Promise<void>;
  updateMany(where: Record<string, unknown>, data: Record<string, unknown>): Promise<void>;
}

// Stored server record (with encrypted API key)
export interface StoredServer {
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

// Server create data
export interface ServerCreateData {
  name: string;
  url: string;
  apiKey: string;
  apiKeyIv: string;
  isDefault: boolean;
  qualityProfileId?: number | null;
  rootFolderPath?: string | null;
}

// Server update data
export interface ServerUpdateData {
  name?: string;
  url?: string;
  apiKey?: string;
  apiKeyIv?: string;
  isDefault?: boolean;
  qualityProfileId?: number | null;
  rootFolderPath?: string | null;
}
