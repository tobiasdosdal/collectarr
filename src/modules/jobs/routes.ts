/**
 * Jobs Management Routes
 * Admin endpoints for managing background jobs
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

interface JobEnabledBody {
  enabled?: boolean;
}

export default async function jobsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/status', async () => {
    const status = fastify.scheduler.getStatus();
    return { jobs: status };
  });

  fastify.post<{ Params: { jobName: string } }>('/:jobName/run', async (request, reply) => {
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
        message: (error as Error).message,
      });
    }
  });

  fastify.patch<{ Params: { jobName: string }; Body: JobEnabledBody }>('/:jobName', async (request, reply) => {
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
        message: (error as Error).message,
      });
    }
  });

  fastify.post<{ Params: { collectionId: string } }>('/refresh-collection/:collectionId', async (request, reply) => {
    const { collectionId } = request.params;

    const collection = await fastify.prisma.collection.findFirst({
      where: {
        id: collectionId,
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

    await fastify.prisma.collection.update({
      where: { id: collectionId },
      data: { lastSyncAt: new Date(0) },
    });

    try {
      await fastify.scheduler.runJob('refresh-collections');
      return {
        success: true,
        message: 'Collection refresh triggered',
      };
    } catch (error) {
      return reply.code(500).send({
        error: 'Refresh Error',
        message: (error as Error).message,
      });
    }
  });
}
