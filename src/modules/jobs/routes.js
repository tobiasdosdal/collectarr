/**
 * Jobs Management Routes
 * Admin endpoints for managing background jobs
 */

export default async function jobsRoutes(fastify, opts) {
  // All routes require authentication
  fastify.addHook('preHandler', fastify.authenticate);

  // Get job status
  fastify.get('/status', async (request, reply) => {
    const status = fastify.scheduler.getStatus();
    return { jobs: status };
  });

  // Trigger a job manually
  fastify.post('/:jobName/run', async (request, reply) => {
    const { jobName } = request.params;

    try {
      const result = await fastify.scheduler.runJob(jobName);
      return {
        success: true,
        jobName,
        result,
      };
    } catch (error) {
      return reply.code(400).send({
        error: 'Job Error',
        message: error.message,
      });
    }
  });

  // Enable/disable a job
  fastify.patch('/:jobName', async (request, reply) => {
    const { jobName } = request.params;
    const { enabled } = request.body;

    if (typeof enabled !== 'boolean') {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'enabled must be a boolean',
      });
    }

    try {
      fastify.scheduler.setEnabled(jobName, enabled);
      return {
        success: true,
        jobName,
        enabled,
      };
    } catch (error) {
      return reply.code(400).send({
        error: 'Job Error',
        message: error.message,
      });
    }
  });

  // Force refresh a specific collection
  fastify.post('/refresh-collection/:collectionId', async (request, reply) => {
    const { collectionId } = request.params;

    // Verify collection belongs to user
    const collection = await fastify.prisma.collection.findFirst({
      where: {
        id: collectionId,
        userId: request.user.id,
      },
    });

    if (!collection) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Collection not found',
      });
    }

    if (collection.sourceType === 'MANUAL') {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Manual collections cannot be refreshed',
      });
    }

    // Trigger immediate refresh by updating lastSyncAt to old date
    await fastify.prisma.collection.update({
      where: { id: collectionId },
      data: { lastSyncAt: new Date(0) },
    });

    // Run the refresh job
    try {
      await fastify.scheduler.runJob('refresh-collections');
      return {
        success: true,
        message: 'Collection refresh triggered',
      };
    } catch (error) {
      return reply.code(500).send({
        error: 'Refresh Error',
        message: error.message,
      });
    }
  });
}
