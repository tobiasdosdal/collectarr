/**
 * Sonarr Server Management Routes
 * Handles Sonarr server configuration and TV series requests
 * Servers are now global (shared across all users)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createSonarrClient } from './client.js';
import { encryptApiKey, decryptApiKey } from '../../utils/api-key-crypto.js';

interface ServerParams {
  id: string;
}

interface SonarrServerBody {
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

interface AddSeriesBody {
  tvdbId: number;
  title: string;
  year: number;
  qualityProfileId?: number;
  rootFolderPath?: string;
  searchForMissingEpisodes?: boolean;
  seriesType?: string;
}

interface LookupQuery {
  term?: string;
  tvdbId?: string;
}

// Helper to check admin status for write operations
const requireAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!request.user || !request.user.isAdmin) {
    return reply.code(403).send({
      error: 'Forbidden',
      message: 'Admin access required',
    });
  }
};

export default async function sonarrRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication
  fastify.addHook('onRequest', fastify.authenticate);

  /**
   * GET /sonarr/servers - List all Sonarr servers (global)
   */
  fastify.get('/servers', async () => {
    const servers = await fastify.prisma.sonarrServer.findMany({
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
   * POST /sonarr/servers - Add a new Sonarr server (admin only)
   */
  fastify.post<{ Body: SonarrServerBody }>('/servers', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { name, url, apiKey, isDefault, qualityProfileId, rootFolderPath } = request.body;

    if (!name || !url || !apiKey) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'name, url, and apiKey are required',
      });
    }

    // Test connection first
    const client = createSonarrClient(url, apiKey);
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
        message: `Failed to connect to Sonarr server: ${testResult.error}`,
      });
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await fastify.prisma.sonarrServer.updateMany({
        data: { isDefault: false },
      });
    }

    // Encrypt API key before storage
    const encryptedKey = encryptApiKey(apiKey);
    if (!encryptedKey) {
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to encrypt API key',
      });
    }

    const server = await fastify.prisma.sonarrServer.create({
      data: {
        name,
        url: url.replace(/\/$/, ''),
        apiKey: encryptedKey.apiKey,
        apiKeyIv: encryptedKey.apiKeyIv,
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
   * POST /sonarr/servers/test - Test Sonarr server connection
   */
  fastify.post<{ Body: TestConnectionBody }>('/servers/test', async (request, reply) => {
    const { url, apiKey } = request.body;
    const client = createSonarrClient(url, apiKey);
    if (!client) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Invalid url or apiKey provided',
      });
    }
    return client.testConnection();
  });

  /**
   * GET /sonarr/servers/:id - Get server details
   */
  fastify.get<{ Params: ServerParams }>('/servers/:id', async (request, reply) => {
    const server = await fastify.prisma.sonarrServer.findUnique({
      where: { id: request.params.id },
    });

    if (!server) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Sonarr server not found',
      });
    }

    const decryptedApiKey = decryptApiKey(server.apiKey, server.apiKeyIv);
    const client = createSonarrClient(server.url, decryptedApiKey);
    if (!client) {
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to create Sonarr client',
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
   * PATCH /sonarr/servers/:id - Update server config (admin only)
   */
  fastify.patch<{ Params: ServerParams; Body: SonarrServerBody }>('/servers/:id', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { name, url, apiKey, isDefault, qualityProfileId, rootFolderPath } = request.body;

    const server = await fastify.prisma.sonarrServer.findUnique({
      where: { id: request.params.id },
    });

    if (!server) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Sonarr server not found',
      });
    }

    // Decrypt existing API key for connection test
    const existingApiKey = decryptApiKey(server.apiKey, server.apiKeyIv);

    // If updating URL or API key, test connection
    if (url || apiKey) {
      const client = createSonarrClient(url || server.url, apiKey || existingApiKey);
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
      await fastify.prisma.sonarrServer.updateMany({
        where: { id: { not: server.id } },
        data: { isDefault: false },
      });
    }

    // Encrypt new API key if provided
    let apiKeyData = {};
    if (apiKey) {
      const encryptedKey = encryptApiKey(apiKey);
      if (!encryptedKey) {
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to encrypt API key',
        });
      }
      apiKeyData = { apiKey: encryptedKey.apiKey, apiKeyIv: encryptedKey.apiKeyIv };
    }

    const updated = await fastify.prisma.sonarrServer.update({
      where: { id: server.id },
      data: {
        ...(name && { name }),
        ...(url && { url: url.replace(/\/$/, '') }),
        ...apiKeyData,
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
   * DELETE /sonarr/servers/:id - Remove server (admin only)
   */
  fastify.delete<{ Params: ServerParams }>('/servers/:id', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const server = await fastify.prisma.sonarrServer.findUnique({
      where: { id: request.params.id },
    });

    if (!server) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Sonarr server not found',
      });
    }

    await fastify.prisma.sonarrServer.delete({
      where: { id: server.id },
    });

    return reply.code(204).send();
  });

  /**
   * GET /sonarr/servers/:id/profiles - Get quality profiles
   */
  fastify.get<{ Params: ServerParams }>('/servers/:id/profiles', async (request, reply) => {
    const server = await fastify.prisma.sonarrServer.findUnique({
      where: { id: request.params.id },
    });

    if (!server) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Sonarr server not found',
      });
    }

    const decryptedApiKey = decryptApiKey(server.apiKey, server.apiKeyIv);
    const client = createSonarrClient(server.url, decryptedApiKey);
    if (!client) {
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to create Sonarr client',
      });
    }

    const profiles = await client.getQualityProfiles();
    return profiles.map(p => ({
      id: p.id,
      name: p.name,
    }));
  });

  /**
   * GET /sonarr/servers/:id/rootfolders - Get root folders
   */
  fastify.get<{ Params: ServerParams }>('/servers/:id/rootfolders', async (request, reply) => {
    const server = await fastify.prisma.sonarrServer.findUnique({
      where: { id: request.params.id },
    });

    if (!server) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Sonarr server not found',
      });
    }

    const decryptedApiKey = decryptApiKey(server.apiKey, server.apiKeyIv);
    const client = createSonarrClient(server.url, decryptedApiKey);
    if (!client) {
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to create Sonarr client',
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
   * GET /sonarr/servers/:id/lookup - Search for series
   */
  fastify.get<{ Params: ServerParams; Querystring: LookupQuery }>('/servers/:id/lookup', async (request, reply) => {
    const server = await fastify.prisma.sonarrServer.findUnique({
      where: { id: request.params.id },
    });

    if (!server) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Sonarr server not found',
      });
    }

    const decryptedApiKey = decryptApiKey(server.apiKey, server.apiKeyIv);
    const client = createSonarrClient(server.url, decryptedApiKey);
    if (!client) {
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to create Sonarr client',
      });
    }

    const { term, tvdbId } = request.query;

    if (tvdbId) {
      const series = await client.lookupSeriesByTvdbId(parseInt(tvdbId, 10));
      return series ? [series] : [];
    }

    if (term) {
      return client.lookupSeries(term);
    }

    return reply.code(400).send({
      error: 'Bad Request',
      message: 'Either term or tvdbId is required',
    });
  });

  /**
   * POST /sonarr/servers/:id/add - Add series to Sonarr
   */
  fastify.post<{ Params: ServerParams; Body: AddSeriesBody }>('/servers/:id/add', async (request, reply) => {
    const server = await fastify.prisma.sonarrServer.findUnique({
      where: { id: request.params.id },
    });

    if (!server) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Sonarr server not found',
      });
    }

    const { tvdbId, title, year, qualityProfileId, rootFolderPath, searchForMissingEpisodes, seriesType } = request.body;

    if (!tvdbId || !title) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'tvdbId and title are required',
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

    const decryptedApiKey = decryptApiKey(server.apiKey, server.apiKeyIv);
    const client = createSonarrClient(server.url, decryptedApiKey);
    if (!client) {
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to create Sonarr client',
      });
    }

    // Check if already in library
    const existingSeries = await client.getSeriesByTvdbId(tvdbId);
    if (existingSeries) {
      return reply.code(409).send({
        error: 'Conflict',
        message: 'Series already exists in Sonarr',
        series: {
          id: existingSeries.id,
          title: existingSeries.title,
          statistics: existingSeries.statistics,
        },
      });
    }

    try {
      const series = await client.addSeries({
        tvdbId,
        title,
        year,
        qualityProfileId: profileId,
        rootFolderPath: folderPath,
        seriesType: seriesType || 'standard',
        addOptions: {
          ignoreEpisodesWithFiles: false,
          ignoreEpisodesWithoutFiles: false,
          monitor: 'all',
          searchForMissingEpisodes: searchForMissingEpisodes !== false,
          searchForCutoffUnmetEpisodes: false,
        },
      });

      return reply.code(201).send({
        success: true,
        series: {
          id: series.id,
          title: series.title,
          year: series.year,
          tvdbId: series.tvdbId,
          monitored: series.monitored,
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
   * GET /sonarr/servers/:id/series - Get all series in Sonarr library
   */
  fastify.get<{ Params: ServerParams }>('/servers/:id/series', async (request, reply) => {
    const server = await fastify.prisma.sonarrServer.findUnique({
      where: { id: request.params.id },
    });

    if (!server) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Sonarr server not found',
      });
    }

    const decryptedApiKey = decryptApiKey(server.apiKey, server.apiKeyIv);
    const client = createSonarrClient(server.url, decryptedApiKey);
    if (!client) {
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to create Sonarr client',
      });
    }

    const series = await client.getSeries();
    return series.map(s => ({
      id: s.id,
      title: s.title,
      year: s.year,
      tvdbId: s.tvdbId,
      imdbId: s.imdbId,
    }));
  });

  /**
   * GET /sonarr/servers/:id/series/:tvdbId - Check if series exists in Sonarr
   */
  fastify.get<{ Params: ServerParams & { tvdbId: string } }>('/servers/:id/series/:tvdbId', async (request, reply) => {
    const server = await fastify.prisma.sonarrServer.findUnique({
      where: { id: request.params.id },
    });

    if (!server) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Sonarr server not found',
      });
    }

    const decryptedApiKey = decryptApiKey(server.apiKey, server.apiKeyIv);
    const client = createSonarrClient(server.url, decryptedApiKey);
    if (!client) {
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to create Sonarr client',
      });
    }

    const tvdbId = parseInt(request.params.tvdbId, 10);
    const series = await client.getSeriesByTvdbId(tvdbId);

    if (!series) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Series not found in Sonarr',
        inSonarr: false,
      });
    }

    return {
      inSonarr: true,
      series: {
        id: series.id,
        title: series.title,
        year: series.year,
        tvdbId: series.tvdbId,
        monitored: series.monitored,
        statistics: series.statistics,
      },
    };
  });
}
