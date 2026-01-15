/**
 * Emby Server Management Routes
 * Handles Emby server configuration and sync operations
 * Servers are now global (shared across all users)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createEmbyClient } from './client.js';
import { syncCollections, removeCollectionFromEmby } from './sync-service.js';
import { encryptApiKey, decryptApiKey } from '../../utils/api-key-crypto.js';

interface ServerParams {
  id: string;
}

interface ServerIdParams {
  serverId: string;
}

interface CollectionIdParams {
  collectionId: string;
}

interface EmbyServerBody {
  name?: string;
  url?: string;
  apiKey?: string;
  isDefault?: boolean;
}

interface TestConnectionBody {
  url: string;
  apiKey: string;
}

interface RemoveCollectionBody {
  collectionName: string;
}

interface SearchBody {
  query?: string;
  imdbId?: string;
  tmdbId?: string;
  tvdbId?: string;
  mediaType?: 'MOVIE' | 'SHOW';
  year?: number;
}

interface SyncLogsQuery {
  limit?: string;
  collectionId?: string;
  embyServerId?: string;
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

export default async function embyRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication
  fastify.addHook('onRequest', fastify.authenticate);

  /**
   * GET /emby/servers - List all Emby servers (global)
   */
  fastify.get('/servers', async () => {
    const servers = await fastify.prisma.embyServer.findMany({
      orderBy: { createdAt: 'asc' },
    });

    return servers.map(s => ({
      id: s.id,
      name: s.name,
      url: s.url,
      isDefault: s.isDefault,
      createdAt: s.createdAt,
    }));
  });

  /**
   * POST /emby/servers - Add a new Emby server (admin only)
   */
  fastify.post<{ Body: EmbyServerBody }>('/servers', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { name, url, apiKey, isDefault } = request.body;

    if (!name || !url || !apiKey) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'name, url, and apiKey are required',
      });
    }

    // Test connection first
    const client = createEmbyClient(url, apiKey);
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
        message: `Failed to connect to Emby server: ${testResult.error}`,
      });
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await fastify.prisma.embyServer.updateMany({
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

    const server = await fastify.prisma.embyServer.create({
      data: {
        name,
        url: url.replace(/\/$/, ''), // Remove trailing slash
        apiKey: encryptedKey.apiKey,
        apiKeyIv: encryptedKey.apiKeyIv,
        isDefault: isDefault || false,
      },
    });

    return reply.code(201).send({
      id: server.id,
      name: server.name,
      url: server.url,
      isDefault: server.isDefault,
      serverName: testResult.serverName,
      serverVersion: testResult.version,
    });
  });

  /**
   * POST /emby/servers/test - Test Emby server connection
   */
  fastify.post<{ Body: TestConnectionBody }>('/servers/test', async (request, reply) => {
    const { url, apiKey } = request.body;
    const client = createEmbyClient(url, apiKey);
    if (!client) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Invalid url or apiKey provided',
      });
    }
    return client.testConnection();
  });

  /**
   * GET /emby/servers/:id - Get server details
   */
  fastify.get<{ Params: ServerParams }>('/servers/:id', async (request, reply) => {
    const server = await fastify.prisma.embyServer.findUnique({
      where: { id: request.params.id },
    });

    if (!server) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Emby server not found',
      });
    }

    // Decrypt API key and get server info
    const decryptedApiKey = decryptApiKey(server.apiKey, server.apiKeyIv);
    const client = createEmbyClient(server.url, decryptedApiKey);
    if (!client) {
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to create Emby client',
      });
    }
    const info = await client.testConnection();

    return {
      id: server.id,
      name: server.name,
      url: server.url,
      isDefault: server.isDefault,
      createdAt: server.createdAt,
      serverInfo: info.success ? {
        serverName: info.serverName,
        version: info.version,
      } : null,
    };
  });

  /**
   * PATCH /emby/servers/:id - Update server config (admin only)
   */
  fastify.patch<{ Params: ServerParams; Body: EmbyServerBody }>('/servers/:id', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { name, url, apiKey, isDefault } = request.body;

    const server = await fastify.prisma.embyServer.findUnique({
      where: { id: request.params.id },
    });

    if (!server) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Emby server not found',
      });
    }

    // Decrypt existing API key for connection test
    const existingApiKey = decryptApiKey(server.apiKey, server.apiKeyIv);

    // If updating URL or API key, test connection
    if (url || apiKey) {
      const client = createEmbyClient(url || server.url, apiKey || existingApiKey);
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
      await fastify.prisma.embyServer.updateMany({
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

    const updated = await fastify.prisma.embyServer.update({
      where: { id: server.id },
      data: {
        ...(name && { name }),
        ...(url && { url: url.replace(/\/$/, '') }),
        ...apiKeyData,
        ...(isDefault !== undefined && { isDefault }),
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      url: updated.url,
      isDefault: updated.isDefault,
    };
  });

  /**
   * DELETE /emby/servers/:id - Remove server (admin only)
   */
  fastify.delete<{ Params: ServerParams }>('/servers/:id', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const server = await fastify.prisma.embyServer.findUnique({
      where: { id: request.params.id },
    });

    if (!server) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Emby server not found',
      });
    }

    await fastify.prisma.embyServer.delete({
      where: { id: server.id },
    });

    return reply.code(204).send();
  });

  /**
   * GET /emby/servers/:id/libraries - Get server libraries
   */
  fastify.get<{ Params: ServerParams }>('/servers/:id/libraries', async (request, reply) => {
    const server = await fastify.prisma.embyServer.findUnique({
      where: { id: request.params.id },
    });

    if (!server) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Emby server not found',
      });
    }

    const decryptedApiKey = decryptApiKey(server.apiKey, server.apiKeyIv);
    const client = createEmbyClient(server.url, decryptedApiKey);
    if (!client) {
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to create Emby client',
      });
    }
    const libraries = await client.getLibraries();

    return libraries.map((lib: any) => ({
      name: lib.Name,
      type: lib.CollectionType,
      itemId: lib.ItemId,
      locations: lib.Locations,
    }));
  });

  /**
   * GET /emby/servers/:id/collections - Get collections on server
   */
  fastify.get<{ Params: ServerParams }>('/servers/:id/collections', async (request, reply) => {
    const server = await fastify.prisma.embyServer.findUnique({
      where: { id: request.params.id },
    });

    if (!server) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Emby server not found',
      });
    }

    const decryptedApiKey = decryptApiKey(server.apiKey, server.apiKeyIv);
    const client = createEmbyClient(server.url, decryptedApiKey);
    if (!client) {
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to create Emby client',
      });
    }
    const collections = await client.getCollections();

    return collections.map(col => ({
      id: col.Id,
      name: col.Name,
      itemCount: (col as any).ChildCount || 0,
    }));
  });

  /**
   * POST /emby/sync - Sync all collections to all servers
   */
  fastify.post('/sync', async (request: FastifyRequest) => {
    const result = await syncCollections({
      userId: request.user?.id,
      prisma: fastify.prisma,
    });

    return result;
  });

  /**
   * POST /emby/sync/collection/:collectionId - Sync specific collection
   */
  fastify.post<{ Params: CollectionIdParams }>('/sync/collection/:collectionId', async (request, reply) => {
    const collection = await fastify.prisma.collection.findUnique({
      where: { id: request.params.collectionId },
      include: { items: true },
    });

    if (!collection) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Collection not found',
      });
    }

    const result = await syncCollections({
      userId: request.user?.id,
      prisma: fastify.prisma,
      collectionId: collection.id,
    });

    return result;
  });

  /**
   * POST /emby/sync/server/:serverId - Sync to specific server
   */
  fastify.post<{ Params: ServerIdParams }>('/sync/server/:serverId', async (request, reply) => {
    const server = await fastify.prisma.embyServer.findUnique({
      where: { id: request.params.serverId },
    });

    if (!server) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Emby server not found',
      });
    }

    const result = await syncCollections({
      userId: request.user?.id,
      prisma: fastify.prisma,
      embyServerId: server.id,
    });

    return result;
  });

  /**
   * GET /emby/sync/logs - Get sync history
   */
  fastify.get<{ Querystring: SyncLogsQuery }>('/sync/logs', async (request) => {
    const { limit = '50', collectionId, embyServerId } = request.query;

    const where: { collectionId?: string; embyServerId?: string } = {};
    if (collectionId) where.collectionId = collectionId;
    if (embyServerId) where.embyServerId = embyServerId;

    const logs = await fastify.prisma.syncLog.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: parseInt(limit, 10),
      include: {
        embyServer: { select: { name: true } },
        collection: {
          select: {
            id: true,
            name: true
          }
        },
      },
    });

    return logs.map(log => ({
      id: log.id,
      collectionId: log.collectionId,
      collectionName: log.collection?.name,
      embyServerId: log.embyServerId,
      embyServerName: log.embyServer?.name,
      status: log.status,
      itemsTotal: log.itemsTotal,
      itemsMatched: log.itemsMatched,
      itemsFailed: log.itemsFailed,
      errorMessage: log.errorMessage,
      startedAt: log.startedAt,
      completedAt: log.completedAt,
    }));
  });

  /**
   * POST /emby/servers/:serverId/remove-collection - Remove collection from Emby (admin only)
   */
  fastify.post<{ Params: ServerIdParams; Body: RemoveCollectionBody }>(
    '/servers/:serverId/remove-collection',
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const server = await fastify.prisma.embyServer.findUnique({
        where: { id: request.params.serverId },
      });

      if (!server) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Emby server not found',
        });
      }

      const result = await removeCollectionFromEmby({
        collectionName: request.body.collectionName,
        embyServer: server,
      });

      return result;
    }
  );

  /**
   * POST /emby/servers/:serverId/search - Search for items on server
   */
  fastify.post<{ Params: ServerIdParams; Body: SearchBody }>(
    '/servers/:serverId/search',
    async (request, reply) => {
      const server = await fastify.prisma.embyServer.findUnique({
        where: { id: request.params.serverId },
      });

      if (!server) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Emby server not found',
        });
      }

      const decryptedApiKey = decryptApiKey(server.apiKey, server.apiKeyIv);
    const client = createEmbyClient(server.url, decryptedApiKey);
      if (!client) {
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to create Emby client',
        });
      }
      const { query, imdbId, tmdbId, tvdbId, mediaType, year } = request.body;

      // If provider IDs given, search by those
      if (imdbId || tmdbId || tvdbId) {
        const item = await client.findItemByAnyProviderId({
          imdbId,
          tmdbId,
          tvdbId,
          title: query,
          year,
          mediaType,
        });

        return item ? [item] : [];
      }

      // Otherwise search by title
      const itemType = mediaType === 'MOVIE' ? 'Movie' : mediaType === 'SHOW' ? 'Series' : 'Movie,Series';
      const result = await client.searchItems({
        searchTerm: query,
        includeItemTypes: itemType,
        years: year?.toString(),
        limit: 20,
        fields: 'ProviderIds,ProductionYear,Overview',
      });

      return result.Items || [];
    }
  );
}
