/**
 * Emby Server Management Routes
 * Handles Emby server configuration and sync operations
 * Uses the media-servers factory for common CRUD operations
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import EmbyClient, { createEmbyClient } from './client.js';
import { syncCollections, removeCollectionFromEmby } from './sync-service.js';
import { registerServerRoutes } from '../media-servers/index.js';
import { requireAdmin } from '../../shared/middleware/index.js';

interface ServerParams {
  id: string;
}

interface ServerIdParams {
  serverId: string;
}

interface CollectionIdParams {
  collectionId: string;
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

// Wrapper to match the ClientFactory type signature
function createClient(url: string, apiKey: string): EmbyClient | null {
  return createEmbyClient(url, apiKey);
}

export default async function embyRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication
  fastify.addHook('onRequest', fastify.authenticate);

  // Register common server CRUD routes using the factory
  const service = registerServerRoutes(fastify, {
    serviceName: 'Emby',
    modelName: 'embyServer',
    supportsProfiles: false,
    supportsRootFolders: false,
  }, createClient);

  // =========================================================================
  // Emby-specific routes below
  // =========================================================================

  /**
   * GET /emby/servers/:id/libraries - Get server libraries
   */
  fastify.get<{ Params: ServerParams }>('/servers/:id/libraries', async (request, reply) => {
    const { client, error, statusCode } = await service.getClient(request.params.id);
    if (!client) {
      return reply.code(statusCode || 500).send({
        error: statusCode === 404 ? 'Not Found' : 'Internal Server Error',
        message: error,
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
    const { client, error, statusCode } = await service.getClient(request.params.id);
    if (!client) {
      return reply.code(statusCode || 500).send({
        error: statusCode === 404 ? 'Not Found' : 'Internal Server Error',
        message: error,
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
      logger: fastify.log,
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
      logger: fastify.log,
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
      logger: fastify.log,
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
      const { client, error, statusCode } = await service.getClient(request.params.serverId);
      if (!client) {
        return reply.code(statusCode || 500).send({
          error: statusCode === 404 ? 'Not Found' : 'Internal Server Error',
          message: error,
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
