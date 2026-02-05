/**
 * Jellyfin Server Management Routes
 * Handles Jellyfin server configuration and sync operations
 * Uses the media-servers factory for common CRUD operations
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import JellyfinClient, { createJellyfinClient } from './client.js';
import { syncCollections, removeCollectionFromJellyfin } from './sync-service.js';
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
  jellyfinServerId?: string;
}

function createClient(url: string, apiKey: string): JellyfinClient | null {
  return createJellyfinClient(url, apiKey);
}

export default async function jellyfinRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', fastify.authenticate);

  const service = registerServerRoutes(fastify, {
    serviceName: 'Jellyfin',
    modelName: 'jellyfinServer',
    supportsProfiles: false,
    supportsRootFolders: false,
  }, createClient);

  /**
   * GET /jellyfin/servers/:id/libraries - Get server libraries
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
   * GET /jellyfin/servers/:id/collections - Get collections on server
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
   * POST /jellyfin/sync - Sync all collections to all servers
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
   * POST /jellyfin/sync/collection/:collectionId - Sync specific collection
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
   * POST /jellyfin/sync/server/:serverId - Sync to specific server
   */
  fastify.post<{ Params: ServerIdParams }>('/sync/server/:serverId', async (request, reply) => {
    const server = await fastify.prisma.jellyfinServer.findUnique({
      where: { id: request.params.serverId },
    });

    if (!server) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Jellyfin server not found',
      });
    }

    const result = await syncCollections({
      userId: request.user?.id,
      prisma: fastify.prisma,
      jellyfinServerId: server.id,
      logger: fastify.log,
    });

    return result;
  });

  /**
   * GET /jellyfin/sync/logs - Get sync history
   */
  fastify.get<{ Querystring: SyncLogsQuery }>('/sync/logs', async (request) => {
    const { limit = '50', collectionId, jellyfinServerId } = request.query;

    const where: { collectionId?: string; jellyfinServerId?: string | { not: null } } = {
      jellyfinServerId: { not: null },
    };
    if (collectionId) where.collectionId = collectionId;
    if (jellyfinServerId) where.jellyfinServerId = jellyfinServerId;

    const logs = await fastify.prisma.syncLog.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: parseInt(limit, 10),
      include: {
        jellyfinServer: { select: { name: true } },
        collection: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return logs.map(log => ({
      id: log.id,
      collectionId: log.collectionId,
      collectionName: log.collection?.name,
      jellyfinServerId: log.jellyfinServerId,
      jellyfinServerName: log.jellyfinServer?.name,
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
   * DELETE /jellyfin/servers/:serverId/remove-collection - Remove collection from Jellyfin (admin only)
   */
  fastify.delete<{ Params: ServerIdParams; Body: RemoveCollectionBody }>(
    '/servers/:serverId/remove-collection',
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const server = await fastify.prisma.jellyfinServer.findUnique({
        where: { id: request.params.serverId },
      });

      if (!server) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Jellyfin server not found',
        });
      }

      const result = await removeCollectionFromJellyfin({
        collectionName: request.body.collectionName,
        jellyfinServer: server,
      });

      return result;
    }
  );

  /**
   * POST /jellyfin/servers/:serverId/search - Search for items on server
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
