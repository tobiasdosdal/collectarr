/**
 * Radarr Server Management Routes
 * Handles Radarr server configuration and movie requests
 * Uses the media-servers factory for common CRUD operations
 */

import type { FastifyInstance } from 'fastify';
import RadarrClient, { createRadarrClient } from './client.js';
import { registerServerRoutes } from '../media-servers/index.js';
import { decryptApiKey } from '../../utils/api-key-crypto.js';

interface ServerParams {
  id: string;
}

interface LookupQuery {
  term?: string;
  tmdbId?: string;
}

interface AddMovieBody {
  tmdbId: number;
  title: string;
  year: number;
  qualityProfileId?: number;
  rootFolderPath?: string;
  searchForMovie?: boolean;
}

// Wrapper to match the ClientFactory type signature
function createClient(url: string, apiKey: string): RadarrClient | null {
  return createRadarrClient(url, apiKey);
}

export default async function radarrRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication
  fastify.addHook('onRequest', fastify.authenticate);

  // Register common server CRUD routes using the factory
  const service = registerServerRoutes(fastify, {
    serviceName: 'Radarr',
    modelName: 'radarrServer',
    supportsProfiles: true,
    supportsRootFolders: true,
  }, createClient);

  // =========================================================================
  // Radarr-specific routes below
  // =========================================================================

  /**
   * GET /radarr/servers/:id/lookup - Search for movies
   */
  fastify.get<{ Params: ServerParams; Querystring: LookupQuery }>('/servers/:id/lookup', async (request, reply) => {
    const { client, error, statusCode } = await service.getClient(request.params.id);
    if (!client) {
      return reply.code(statusCode || 500).send({
        error: statusCode === 404 ? 'Not Found' : 'Internal Server Error',
        message: error,
      });
    }

    const { term, tmdbId } = request.query;

    if (tmdbId) {
      const movie = await client.lookupMovieByTmdbId(parseInt(tmdbId, 10));
      return movie ? [movie] : [];
    }

    if (term) {
      return client.lookupMovie(term);
    }

    return reply.code(400).send({
      error: 'Bad Request',
      message: 'Either term or tmdbId is required',
    });
  });

  /**
   * POST /radarr/servers/:id/add - Add movie to Radarr
   */
  fastify.post<{ Params: ServerParams; Body: AddMovieBody }>('/servers/:id/add', async (request, reply) => {
    const { client, server, error, statusCode } = await service.getClient(request.params.id);
    if (!client || !server) {
      return reply.code(statusCode || 500).send({
        error: statusCode === 404 ? 'Not Found' : 'Internal Server Error',
        message: error,
      });
    }

    const { tmdbId, title, year, qualityProfileId, rootFolderPath, searchForMovie } = request.body;

    if (!tmdbId || !title) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'tmdbId and title are required',
      });
    }

    // Use server defaults if not provided
    const profileId = qualityProfileId || server.qualityProfileId;
    const folderPath = rootFolderPath || server.rootFolderPath;

    if (!profileId || !folderPath) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'qualityProfileId and rootFolderPath are required (set defaults on server or provide in request)',
      });
    }

    // Check if already in library
    const existingMovie = await client.getMovieByTmdbId(tmdbId);
    if (existingMovie) {
      return reply.code(409).send({
        error: 'Conflict',
        message: 'Movie already exists in Radarr',
        movie: {
          id: existingMovie.id,
          title: existingMovie.title,
          hasFile: existingMovie.hasFile,
        },
      });
    }

    try {
      const movie = await client.addMovie({
        tmdbId,
        title,
        year,
        qualityProfileId: profileId,
        rootFolderPath: folderPath,
        addOptions: {
          searchForMovie: searchForMovie !== false,
          addMethod: 'manual',
          monitor: 'movieOnly',
        },
      });

      return reply.code(201).send({
        success: true,
        movie: {
          id: movie.id,
          title: movie.title,
          year: movie.year,
          tmdbId: movie.tmdbId,
          monitored: movie.monitored,
        },
      });
    } catch (err) {
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: (err as Error).message,
      });
    }
  });

  /**
   * GET /radarr/servers/:id/movies - Get all movies in Radarr library
   */
  fastify.get<{ Params: ServerParams }>('/servers/:id/movies', async (request, reply) => {
    const { client, error, statusCode } = await service.getClient(request.params.id);
    if (!client) {
      return reply.code(statusCode || 500).send({
        error: statusCode === 404 ? 'Not Found' : 'Internal Server Error',
        message: error,
      });
    }

    const movies = await client.getMovies();
    return movies.map(m => ({
      id: m.id,
      title: m.title,
      year: m.year,
      tmdbId: m.tmdbId,
      imdbId: m.imdbId,
      hasFile: m.hasFile,
    }));
  });

  /**
   * GET /radarr/servers/:id/movies/:tmdbId - Check if movie exists in Radarr
   */
  fastify.get<{ Params: ServerParams & { tmdbId: string } }>('/servers/:id/movies/:tmdbId', async (request, reply) => {
    const { client, error, statusCode } = await service.getClient(request.params.id);
    if (!client) {
      return reply.code(statusCode || 500).send({
        error: statusCode === 404 ? 'Not Found' : 'Internal Server Error',
        message: error,
      });
    }

    const tmdbId = parseInt(request.params.tmdbId, 10);
    const movie = await client.getMovieByTmdbId(tmdbId);

    if (!movie) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Movie not found in Radarr',
        inRadarr: false,
      });
    }

    return {
      inRadarr: true,
      movie: {
        id: movie.id,
        title: movie.title,
        year: movie.year,
        tmdbId: movie.tmdbId,
        hasFile: movie.hasFile,
        monitored: movie.monitored,
      },
    };
  });
}
