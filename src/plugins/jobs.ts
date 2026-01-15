/**
 * Jobs Plugin
 * Initializes background job scheduler and registers jobs
 */

import fp from 'fastify-plugin';
import { getScheduler } from '../jobs/scheduler.js';
import refreshCollectionsJob from '../jobs/refresh-collections.js';
import { syncAllToEmby } from '../jobs/sync-to-emby.js';
import cacheCleanupJob from '../jobs/cache-cleanup.js';
import imageCacheQueueJob from '../jobs/image-cache-queue.js';
import type { FastifyInstance } from 'fastify';

async function jobsPlugin(fastify: FastifyInstance): Promise<void> {
  const scheduler = getScheduler(fastify);

  scheduler.register(
    'refresh-collections',
    '0 * * * *',
    refreshCollectionsJob,
    {
      enabled: true,
      runOnStart: false,
    }
  );

  scheduler.register(
    'sync-to-emby',
    '0 */2 * * *',
    async (app) => syncAllToEmby(app.prisma, app.log),
    {
      enabled: true,
      runOnStart: false,
    }
  );

  scheduler.register(
    'cache-cleanup',
    '0 3 * * *',
    cacheCleanupJob,
    {
      enabled: true,
      runOnStart: false,
    }
  );

  scheduler.register(
    'image-cache-queue',
    '*/15 * * * *',
    imageCacheQueueJob,
    {
      enabled: true,
      runOnStart: true,
    }
  );

  fastify.decorate('scheduler', scheduler);

  fastify.addHook('onReady', async () => {
    scheduler.start();
    fastify.log.info('Job scheduler started');
  });

  fastify.addHook('onClose', async () => {
    scheduler.stop();
  });
}

export default fp(jobsPlugin, {
  name: 'jobs',
  dependencies: ['prisma'],
});
