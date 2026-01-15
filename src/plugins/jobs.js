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

async function jobsPlugin(fastify, opts) {
  const scheduler = getScheduler(fastify);

  // Register collection refresh job
  // Runs every hour to check for collections needing refresh
  scheduler.register(
    'refresh-collections',
    '0 * * * *', // Every hour at minute 0
    refreshCollectionsJob,
    {
      enabled: true,
      runOnStart: false, // Don't run immediately on server start
    }
  );

  // Register Emby sync job
  // Runs every 2 hours to sync collections to Emby servers
  scheduler.register(
    'sync-to-emby',
    '0 */2 * * *', // Every 2 hours
    async (app) => syncAllToEmby(app.prisma, app.log),
    {
      enabled: true,
      runOnStart: false,
    }
  );

  // Register cache cleanup job
  // Runs daily at 3 AM to clean up old and excess cached images
  scheduler.register(
    'cache-cleanup',
    '0 3 * * *', // Daily at 3 AM
    cacheCleanupJob,
    {
      enabled: true,
      runOnStart: false, // Don't run on server start to avoid startup delay
    }
  );

  // Register image cache queue job
  // Runs every 15 minutes and on startup to queue missing images
  scheduler.register(
    'image-cache-queue',
    '*/15 * * * *', // Every 15 minutes
    imageCacheQueueJob,
    {
      enabled: true,
      runOnStart: true, // Run immediately on server start
    }
  );

  // Decorate fastify with scheduler
  fastify.decorate('scheduler', scheduler);

  // Start scheduler when server is ready
  fastify.addHook('onReady', async () => {
    scheduler.start();
    fastify.log.info('Job scheduler started');
  });

  // Stop scheduler on server close
  fastify.addHook('onClose', async () => {
    scheduler.stop();
  });
}

export default fp(jobsPlugin, {
  name: 'jobs',
  dependencies: ['prisma'],
});
