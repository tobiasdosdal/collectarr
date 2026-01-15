import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

interface SyncReportBody {
  embyServerId?: string;
  collectionId?: string;
  status?: string;
  itemsTotal?: number;
  itemsMatched?: number;
  itemsFailed?: number;
  errorMessage?: string;
  details?: unknown;
}

export default async function syncRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.authenticateApiKey);

  fastify.get('/collections', async (request: FastifyRequest) => {
    const collections = await fastify.prisma.collection.findMany({
      where: {
        userId: request.user!.id,
        isEnabled: true,
      },
      select: {
        id: true,
        name: true,
        sourceType: true,
        lastSyncAt: true,
        _count: {
          select: { items: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return collections.map((c) => ({
      id: c.id,
      name: c.name,
      sourceType: c.sourceType,
      lastSyncAt: c.lastSyncAt,
      itemCount: c._count.items,
    }));
  });

  fastify.get<{ Params: { id: string } }>('/collections/:id/items', async (request, reply) => {
    const { id } = request.params;

    const collection = await fastify.prisma.collection.findFirst({
      where: {
        id,
        userId: request.user!.id,
      },
      include: {
        items: {
          select: {
            id: true,
            mediaType: true,
            title: true,
            year: true,
            imdbId: true,
            tmdbId: true,
            traktId: true,
            tvdbId: true,
          },
        },
      },
    });

    if (!collection) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Collection not found',
      });
    }

    return {
      id: collection.id,
      name: collection.name,
      items: collection.items,
    };
  });

  fastify.post<{ Body: SyncReportBody }>('/report', async (request, reply) => {
    const {
      embyServerId,
      collectionId,
      status,
      itemsTotal,
      itemsMatched,
      itemsFailed,
      errorMessage,
      details,
    } = request.body;

    if (embyServerId) {
      const server = await fastify.prisma.embyServer.findFirst({
        where: {
          id: embyServerId,
          userId: request.user!.id,
        },
      });

      if (!server) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Invalid Emby server ID',
        });
      }
    }

    const log = await fastify.prisma.syncLog.create({
      data: {
        userId: request.user!.id,
        embyServerId,
        collectionId,
        status: status || 'SUCCESS',
        itemsTotal: itemsTotal || 0,
        itemsMatched: itemsMatched || 0,
        itemsFailed: itemsFailed || 0,
        errorMessage,
        details: details ? JSON.stringify(details) : null,
        completedAt: new Date(),
      },
    });

    return { logId: log.id };
  });

  fastify.get('/status', async (request: FastifyRequest) => {
    const [collectionsCount, lastSync] = await Promise.all([
      fastify.prisma.collection.count({
        where: { userId: request.user!.id, isEnabled: true },
      }),
      fastify.prisma.syncLog.findFirst({
        where: { userId: request.user!.id },
        orderBy: { startedAt: 'desc' },
        select: {
          status: true,
          startedAt: true,
          completedAt: true,
        },
      }),
    ]);

    return {
      collectionsCount,
      lastSync,
      serverTime: new Date().toISOString(),
    };
  });
}
