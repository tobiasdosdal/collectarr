import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Job } from '../jobs/job-types.js';
import type { JobQueue } from '../jobs/job-queue.js';
import { onJobQueueReady } from '../jobs/refresh-collections.js';

interface ProgressEvent {
  collectionId: string;
  pending: number;
  enriched: number;
  failed: number;
  total: number;
  percentComplete: number;
}

interface ItemEnrichedEvent {
  itemId: string;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  rating: number | null;
  ratingCount: number | null;
}

interface ItemFailedEvent {
  itemId: string;
  error: string | undefined;
  attempts: number;
}

const connections = new Map<string, Set<FastifyReply>>();

function broadcastToCollection(collectionId: string, event: string, data: unknown): void {
  const collectionConnections = connections.get(collectionId);
  if (!collectionConnections) return;

  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  for (const reply of collectionConnections) {
    try {
      reply.raw.write(message);
    } catch {
      // Silently ignore - connection cleanup happens on close event
    }
  }
}

async function getCollectionProgress(
  fastify: FastifyInstance,
  collectionId: string
): Promise<ProgressEvent | null> {
  try {
    const collection = await fastify.prisma.collection.findUnique({
      where: { id: collectionId },
    });

    if (!collection) return null;

    const [pending, enriched, failed] = await Promise.all([
      fastify.prisma.collectionItem.count({
        where: { collectionId, enrichmentStatus: 'PENDING' },
      }),
      fastify.prisma.collectionItem.count({
        where: { collectionId, enrichmentStatus: 'ENRICHED' },
      }),
      fastify.prisma.collectionItem.count({
        where: { collectionId, enrichmentStatus: 'FAILED' },
      }),
    ]);

    const total = pending + enriched + failed;

    return {
      collectionId,
      pending,
      enriched,
      failed,
      total,
      percentComplete: total > 0 ? Math.round((enriched / total) * 100 * 10) / 10 : 0,
    };
  } catch (err) {
    fastify.log?.error(`Failed to get collection progress: ${(err as Error).message}`);
    return null;
  }
}

async function getEnrichedItemData(
  fastify: FastifyInstance,
  itemId: string
): Promise<ItemEnrichedEvent | null> {
  try {
    const item = await fastify.prisma.collectionItem.findUnique({
      where: { id: itemId },
    });

    if (!item) return null;

    return {
      itemId: item.id,
      title: item.title,
      posterPath: item.posterPath,
      backdropPath: item.backdropPath,
      rating: item.rating,
      ratingCount: item.ratingCount,
    };
  } catch (err) {
    fastify.log?.error(`Failed to get item data: ${(err as Error).message}`);
    return null;
  }
}

export default async function collectionProgressRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.authenticate);

  interface ProgressParams {
    id: string;
  }

  fastify.get<{ Params: ProgressParams }>(
    '/:id/progress',
    async (request: FastifyRequest<{ Params: ProgressParams }>, reply: FastifyReply) => {
      const { id: collectionId } = request.params;

      const collection = await fastify.prisma.collection.findUnique({
        where: { id: collectionId },
      });

      if (!collection) {
        return reply.code(404).send({ error: 'Not Found', message: 'Collection not found' });
      }

      reply.header('Content-Type', 'text/event-stream');
      reply.header('Cache-Control', 'no-cache');
      reply.header('Connection', 'keep-alive');
      reply.header('X-Accel-Buffering', 'no');

      const collectionConnections = connections.get(collectionId) || new Set();
      collectionConnections.add(reply);
      connections.set(collectionId, collectionConnections);

      const initialProgress = await getCollectionProgress(fastify, collectionId);
      if (initialProgress) {
        const message = `event: progress\ndata: ${JSON.stringify(initialProgress)}\n\n`;
        reply.raw.write(message);
      }

      const heartbeatInterval = setInterval(() => {
        try {
          reply.raw.write(': heartbeat\n\n');
        } catch (err) {
          // Connection closed
        }
      }, 30000);

      await new Promise<void>((resolve) => {
        request.raw.on('close', () => {
          clearInterval(heartbeatInterval);
          collectionConnections.delete(reply);
          if (collectionConnections.size === 0) {
            connections.delete(collectionId);
          }
          resolve();
        });
      });
    }
  );

  const registerQueueListeners = (queue: JobQueue): (() => void) => {
    const onJobCompleted = async (job: Job) => {
      if (!job.type.includes('enrich')) return;

      const jobData = job.data as Partial<{ collectionId: string; itemId: string }>;
      if (!jobData?.collectionId || !jobData?.itemId) return;

      const { collectionId, itemId } = jobData;

      const itemData = await getEnrichedItemData(fastify, itemId);
      if (itemData) {
        broadcastToCollection(collectionId, 'item:enriched', itemData);
      }

      const progress = await getCollectionProgress(fastify, collectionId);
      if (progress) {
        broadcastToCollection(collectionId, 'progress', progress);
      }
    };

    const onJobFailed = async (job: Job) => {
      if (!job.type.includes('enrich')) return;

      const jobData = job.data as Partial<{ collectionId: string; itemId: string }>;
      if (!jobData?.collectionId || !jobData?.itemId) return;

      const { collectionId, itemId } = jobData;

      const failedEvent: ItemFailedEvent = {
        itemId,
        error: job.error,
        attempts: job.attempts,
      };
      broadcastToCollection(collectionId, 'item:failed', failedEvent);

      const progress = await getCollectionProgress(fastify, collectionId);
      if (progress) {
        broadcastToCollection(collectionId, 'progress', progress);
      }
    };

    queue.on('job:completed', onJobCompleted);
    queue.on('job:failed', onJobFailed);

    return () => {
      queue.off('job:completed', onJobCompleted);
      queue.off('job:failed', onJobFailed);
    };
  };

  let detachQueueListeners: (() => void) | null = null;
  const unsubscribeQueueReady = onJobQueueReady((queue) => {
    if (!detachQueueListeners) {
      detachQueueListeners = registerQueueListeners(queue);
    }
  });

  fastify.addHook('onClose', async () => {
    unsubscribeQueueReady();
    if (detachQueueListeners) {
      detachQueueListeners();
      detachQueueListeners = null;
    }
    connections.clear();
  });
}
