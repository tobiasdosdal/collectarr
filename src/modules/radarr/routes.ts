/**
 * Radarr Server Management Routes
 * Handles Radarr server configuration and movie requests
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createRadarrClient } from './client.js';

interface ServerParams {
  id: string;
}

interface RadarrServerBody {
  name?: string;
  url?: string;
  apiKey?: string;
  isDefault?: boolean;
  qualityProfileId?: number;
  rootFolderPath?: string;
}

interface TestConnectionBody {
  url: string;
  apiKey: string;
}

interface AddMovieBody {
  tmdbId: number;
  title: string;
  year: number;
  qualityProfileId?: number;
  rootFolderPath?: string;
  searchForMovie?: boolean;
}

interface LookupQuery {
  term?: string;
  tmdbId?: string;
}

export default async function radarrRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication
  fastify.addHook('onRequest', fastify.authenticate);

  /**
   * GET /radarr/servers - List user's Radarr servers
   */
  fastify.get('/servers', async (request: FastifyRequest) => {
    const servers = await fastify.prisma.radarrServer.findMany({
      where: { userId: request.user!.id },
      orderBy: { createdAt: 'asc' },
    });

    return servers.map(s => ({
      id: s.id,
      name: s.name,
      url: s.url,
      isDefault: s.isDefault,
      qualityProfileId: s.qualityProfileId,
      rootFolderPath: s.rootFolderPath,
      createdAt: s.createdAt,
    }));
  });

  /**
   * POST /radarr/servers - Add a new Radarr server
   */
  fastify.post<{ Body: RadarrServerBody }>('/servers', async (request, reply) => {
    const { name, url, apiKey, isDefault, qualityProfileId, rootFolderPath } = request.body;

    if (!name || !url || !apiKey) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'name, url, and apiKey are required',
      });
    }

    // Test connection first
    const client = createRadarrClient(url, apiKey);
    if (!client) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Invalid url or apiKey provided',
      });
    }
    const testResult = await client.testConnection();

    if (!testResult.success) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: `Failed to connect to Radarr server: ${testResult.error}`,
      });
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await fastify.prisma.radarrServer.updateMany({
        where: { userId: request.user!.id },
        data: { isDefault: false },
      });
    }

    const server = await fastify.prisma.radarrServer.create({
      data: {
        userId: request.user!.id,
        name,
        url: url.replace(/\/$/, ''),
        apiKey,
        isDefault: isDefault || false,
        qualityProfileId: qualityProfileId || null,
        rootFolderPath: rootFolderPath || null,
      },
    });

    return reply.code(201).send({
      id: server.id,
      name: server.name,
      url: server.url,
      isDefault: server.isDefault,
      qualityProfileId: server.qualityProfileId,
      rootFolderPath: server.rootFolderPath,
      serverName: testResult.serverName,
      serverVersion: testResult.version,
    });
  });

  /**
   * POST /radarr/servers/test - Test Radarr server connection
   */
  fastify.post<{ Body: TestConnectionBody }>('/servers/test', async (request, reply) => {
    const { url, apiKey } = request.body;
    const client = createRadarrClient(url, apiKey);
    if (!client) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Invalid url or apiKey provided',
      });
    }
    return client.testConnection();
  });

  /**
   * GET /radarr/servers/:id - Get server details
   */
  fastify.get<{ Params: ServerParams }>('/servers/:id', async (request, reply) => {
    const server = await fastify.prisma.radarrServer.findFirst({
      where: {
        id: request.params.id,
        userId: request.user!.id,
      },
    });

    if (!server) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Radarr server not found',
      });
    }

    const client = createRadarrClient(server.url, server.apiKey);
    if (!client) {
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to create Radarr client',
      });
    }
    const info = await client.testConnection();

    return {
      id: server.id,
      name: server.name,
      url: server.url,
      isDefault: server.isDefault,
      qualityProfileId: server.qualityProfileId,
      rootFolderPath: server.rootFolderPath,
      createdAt: server.createdAt,
      serverInfo: info.success ? {
        serverName: info.serverName,
        version: info.version,
      } : null,
    };
  });

  /**
   * PATCH /radarr/servers/:id - Update server config
   */
  fastify.patch<{ Params: ServerParams; Body: RadarrServerBody }>('/servers/:id', async (request, reply) => {
    const { name, url, apiKey, isDefault, qualityProfileId, rootFolderPath } = request.body;

    const server = await fastify.prisma.radarrServer.findFirst({
      where: {
        id: request.params.id,
        userId: request.user!.id,
      },
    });

    if (!server) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Radarr server not found',
      });
    }

    // If updating URL or API key, test connection
    if (url || apiKey) {
      const client = createRadarrClient(url || server.url, apiKey || server.apiKey);
      if (!client) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Invalid url or apiKey provided',
        });
      }
      const testResult = await client.testConnection();
      if (!testResult.success) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: `Failed to connect: ${testResult.error}`,
        });
      }
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await fastify.prisma.radarrServer.updateMany({
        where: { userId: request.user!.id, id: { not: server.id } },
        data: { isDefault: false },
      });
    }

    const updated = await fastify.prisma.radarrServer.update({
      where: { id: server.id },
      data: {
        ...(name && { name }),
        ...(url && { url: url.replace(/\/$/, '') }),
        ...(apiKey && { apiKey }),
        ...(isDefault !== undefined && { isDefault }),
        ...(qualityProfileId !== undefined && { qualityProfileId }),
        ...(rootFolderPath !== undefined && { rootFolderPath }),
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      url: updated.url,
      isDefault: updated.isDefault,
      qualityProfileId: updated.qualityProfileId,
      rootFolderPath: updated.rootFolderPath,
    };
  });

  /**
   * DELETE /radarr/servers/:id - Remove server
   */
  fastify.delete<{ Params: ServerParams }>('/servers/:id', async (request, reply) => {
    const server = await fastify.prisma.radarrServer.findFirst({
      where: {
        id: request.params.id,
        userId: request.user!.id,
      },
    });

    if (!server) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Radarr server not found',
      });
    }

    await fastify.prisma.radarrServer.delete({
      where: { id: server.id },
    });

    return reply.code(204).send();
  });

  /**
   * GET /radarr/servers/:id/profiles - Get quality profiles
   */
  fastify.get<{ Params: ServerParams }>('/servers/:id/profiles', async (request, reply) => {
    const server = await fastify.prisma.radarrServer.findFirst({
      where: {
        id: request.params.id,
        userId: request.user!.id,
      },
    });

    if (!server) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Radarr server not found',
      });
    }

    const client = createRadarrClient(server.url, server.apiKey);
    if (!client) {
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to create Radarr client',
      });
    }

    const profiles = await client.getQualityProfiles();
    return profiles.map(p => ({
      id: p.id,
      name: p.name,
    }));
  });

  /**
   * GET /radarr/servers/:id/rootfolders - Get root folders
   */
  fastify.get<{ Params: ServerParams }>('/servers/:id/rootfolders', async (request, reply) => {
    const server = await fastify.prisma.radarrServer.findFirst({
      where: {
        id: request.params.id,
        userId: request.user!.id,
      },
    });

    if (!server) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Radarr server not found',
      });
    }

    const client = createRadarrClient(server.url, server.apiKey);
    if (!client) {
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to create Radarr client',
      });
    }

    const folders = await client.getRootFolders();
    return folders.map(f => ({
      id: f.id,
      path: f.path,
      freeSpace: f.freeSpace,
      accessible: f.accessible,
    }));
  });

  /**
   * GET /radarr/servers/:id/lookup - Search for movies
   */
  fastify.get<{ Params: ServerParams; Querystring: LookupQuery }>('/servers/:id/lookup', async (request, reply) => {
    const server = await fastify.prisma.radarrServer.findFirst({
      where: {
        id: request.params.id,
        userId: request.user!.id,
      },
    });

    if (!server) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Radarr server not found',
      });
    }

    const client = createRadarrClient(server.url, server.apiKey);
    if (!client) {
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to create Radarr client',
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
    const server = await fastify.prisma.radarrServer.findFirst({
      where: {
        id: request.params.id,
        userId: request.user!.id,
      },
    });

    if (!server) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Radarr server not found',
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

    const client = createRadarrClient(server.url, server.apiKey);
    if (!client) {
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to create Radarr client',
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
    } catch (error) {
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: (error as Error).message,
      });
    }
  });

  /**
   * GET /radarr/servers/:id/movies - Get all movies in Radarr library
   */
  fastify.get<{ Params: ServerParams }>('/servers/:id/movies', async (request, reply) => {
    const server = await fastify.prisma.radarrServer.findFirst({
      where: {
        id: request.params.id,
        userId: request.user!.id,
      },
    });

    if (!server) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Radarr server not found',
      });
    }

    const client = createRadarrClient(server.url, server.apiKey);
    if (!client) {
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to create Radarr client',
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
    const server = await fastify.prisma.radarrServer.findFirst({
      where: {
        id: request.params.id,
        userId: request.user!.id,
      },
    });

    if (!server) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Radarr server not found',
      });
    }

    const client = createRadarrClient(server.url, server.apiKey);
    if (!client) {
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to create Radarr client',
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
