/**
 * Jobs Plugin
 * Initializes background job scheduler and registers jobs
 */

import fp from 'fastify-plugin';
import { getScheduler } from '../jobs/scheduler.js';
import { getCollectionScheduler, resetCollectionScheduler } from '../jobs/collection-scheduler.js';
import { initializeJobQueue } from '../jobs/refresh-collections.js';
import refreshCollectionsJob from '../jobs/refresh-collections.js';
import { syncAllToEmby } from '../jobs/sync-to-emby.js';
import cacheCleanupJob from '../jobs/cache-cleanup.js';
import imageCacheQueueJob from '../jobs/image-cache-queue.js';
import { stopCacheQueue } from '../utils/image-cache.js';
import { createCollectionService } from '../modules/collections/service.js';
import type { FastifyInstance } from 'fastify';

async function jobsPlugin(fastify: FastifyInstance): Promise<void> {
  const scheduler = getScheduler(fastify);
  const collectionScheduler = getCollectionScheduler(fastify);

  // Set up the refresh handler for individual collection schedules
  const collectionService = createCollectionService(fastify);
  collectionScheduler.setRefreshHandler(async (collectionId: string) => {
    const collection = await fastify.prisma.collection.findUnique({
      where: { id: collectionId },
    });

    if (!collection || !collection.isEnabled || collection.sourceType === 'MANUAL') {
      return;
    }

    // Check if it's time to refresh based on lastSyncAt (24 hour interval)
    if (collection.lastSyncAt) {
      const hoursSinceSync = (Date.now() - new Date(collection.lastSyncAt).getTime()) / (1000 * 60 * 60);
      if (hoursSinceSync < 22) {
        fastify.log.debug(`Skipping refresh for ${collection.name}, last synced ${hoursSinceSync.toFixed(1)} hours ago`);
        return;
      }
    }

    await collectionService.refreshCollection(
      collectionId,
      collection.sourceType,
      collection.sourceId || undefined
    );
  });

  // Keep the global refresh job as a fallback (runs hourly to catch any missed schedules)
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
  fastify.decorate('collectionScheduler', collectionScheduler);

  fastify.addHook('onReady', async () => {
    // Initialize job queue for background enrichment
    initializeJobQueue(fastify);
    fastify.log.info('Job queue initialized');

    scheduler.start();
    fastify.log.info('Job scheduler started');

    // Initialize individual collection schedules
    await collectionScheduler.initializeSchedules();
    fastify.log.info('Collection scheduler initialized');
  });

  fastify.addHook('onClose', async () => {
    stopCacheQueue();
    scheduler.stop();
    collectionScheduler.stop();
    resetCollectionScheduler();
  });
}

export default fp(jobsPlugin, {
  name: 'jobs',
  dependencies: ['prisma'],
});
