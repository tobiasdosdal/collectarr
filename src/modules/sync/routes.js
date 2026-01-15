export default async function syncRoutes(fastify, opts) {
  // All sync routes use API key authentication (for plugin)
  fastify.addHook('preHandler', fastify.authenticateApiKey);

  // Get all enabled collections for sync
  fastify.get('/collections', async (request, reply) => {
    const collections = await fastify.prisma.collection.findMany({
      where: {
        userId: request.user.id,
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

  // Get collection items with all IDs for matching
  fastify.get('/collections/:id/items', async (request, reply) => {
    const { id } = request.params;

    const collection = await fastify.prisma.collection.findFirst({
      where: {
        id,
        userId: request.user.id,
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

  // Report sync results from plugin
  fastify.post('/report', async (request, reply) => {
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

    // Verify emby server belongs to user if provided
    if (embyServerId) {
      const server = await fastify.prisma.embyServer.findFirst({
        where: {
          id: embyServerId,
          userId: request.user.id,
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
        userId: request.user.id,
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

  // Get sync status/health check for plugin
  fastify.get('/status', async (request, reply) => {
    const [collectionsCount, lastSync] = await Promise.all([
      fastify.prisma.collection.count({
        where: { userId: request.user.id, isEnabled: true },
      }),
      fastify.prisma.syncLog.findFirst({
        where: { userId: request.user.id },
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
