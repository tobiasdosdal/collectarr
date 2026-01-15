import type { PrismaClient } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ScheduledTask } from 'node-cron';

// ============================================================================
// Config Types
// ============================================================================

export interface AppConfig {
  server: {
    port: number;
    host: string;
    env: string;
  };
  jwt: {
    secret: string;
    expiresIn: string;
  };
  external: {
    mdblist: {
      apiKey: string | undefined;
      baseUrl: string;
    };
    tmdb: {
      apiKey: string | undefined;
      baseUrl: string;
    };
    trakt: {
      clientId: string | undefined;
      clientSecret: string | undefined;
      baseUrl: string;
      redirectUri: string;
    };
  };
}

// ============================================================================
// Auth Types
// ============================================================================

export interface AuthUser {
  id: string;
  email: string;
  isAdmin: boolean;
}

export interface JwtPayload {
  id: string;
  email: string;
  iat?: number;
  exp?: number;
}

// ============================================================================
// Job Scheduler Types
// ============================================================================

export interface JobOptions {
  runOnStart?: boolean;
  enabled?: boolean;
}

export interface Job {
  name: string;
  cronExpression: string;
  handler: JobHandler;
  options: Required<JobOptions>;
  task: ScheduledTask | null;
  lastRun: Date | null;
  lastError: string | null;
  runCount: number;
  isRunning: boolean;
}

export interface JobStatus {
  name: string;
  cronExpression: string;
  enabled: boolean;
  isRunning: boolean;
  lastRun: Date | null;
  lastError: string | null;
  runCount: number;
}

export type JobHandler = (fastify: FastifyInstanceTyped) => Promise<unknown>;

export interface JobScheduler {
  register(name: string, cronExpression: string, handler: JobHandler, options?: JobOptions): void;
  start(): void;
  stop(): void;
  runJob(name: string): Promise<unknown>;
  getStatus(): JobStatus[];
  setEnabled(name: string, enabled: boolean): void;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiError {
  error: string;
  message?: string;
  details?: Record<string, string[]>;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

// ============================================================================
// Source Types
// ============================================================================

export type SourceType = 'MDBLIST' | 'TRAKT_LIST' | 'TRAKT_WATCHLIST' | 'TRAKT_COLLECTION' | 'MANUAL';

export type MediaType = 'movie' | 'show';

// ============================================================================
// External API Types
// ============================================================================

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

export interface TraktListItem {
  rank?: number;
  listed_at?: string;
  type: string;
  movie?: TraktMovie;
  show?: TraktShow;
}

export interface TraktMovie {
  title: string;
  year: number;
  ids: TraktIds;
}

export interface TraktShow {
  title: string;
  year: number;
  ids: TraktIds;
}

export interface TraktIds {
  trakt: number;
  slug: string;
  imdb?: string;
  tmdb?: number;
  tvdb?: number;
}

export interface MdblistItem {
  id: number;
  title: string;
  year: number;
  imdb_id?: string;
  tmdb_id?: number;
  tvdb_id?: number;
  mediatype: string;
  poster?: string;
  backdrop?: string;
  score?: number;
  score_count?: number;
}

export interface EmbyItem {
  Id: string;
  Name: string;
  Type: string;
  ProductionYear?: number;
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
}

// ============================================================================
// Fastify Type Augmentation
// ============================================================================

export type FastifyInstanceTyped = import('fastify').FastifyInstance & {
  prisma: PrismaClient;
  config: AppConfig;
  scheduler: JobScheduler;
  authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  authenticateJwt: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  authenticateApiKey: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
};

// Module augmentation for Fastify
declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    config: AppConfig;
    scheduler: JobScheduler;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateJwt: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateApiKey: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }

  interface FastifyRequest {
    user: AuthUser;
  }
}

// Module augmentation for @fastify/jwt
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: AuthUser;
  }
}
