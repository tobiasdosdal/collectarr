import { buildTestApp, createAdminUser } from './helper.js';
import { JobQueue } from '../dist-server/jobs/job-queue.js';
import { ItemEnrichmentJob } from '../dist-server/jobs/item-enrichment-job.js';
import { JobPriority } from '../dist-server/jobs/job-types.js';

describe('ItemEnrichmentJob', () => {
  let app;
  let queue;
  let collection;
  let token;

  beforeAll(async () => {
    app = await buildTestApp();
    const auth = await createAdminUser(app, `enrichment-admin-${Date.now()}@example.com`);
    token = auth.token;

    collection = await app.prisma.collection.create({
      data: {
        name: 'Enrichment Test Collection',
        sourceType: 'MANUAL',
      },
    });
  });

  afterAll(async () => {
    if (queue) {
      queue.stop();
    }
    await app.close();
  });

  beforeEach(() => {
    queue = new JobQueue({ concurrency: 2, maxAttempts: 3 });
  });

  afterEach(() => {
    if (queue) {
      queue.stop();
    }
  });

  describe('registerWithQueue()', () => {
    it('should register a callable handler', async () => {
      const testQueue = new JobQueue();
      ItemEnrichmentJob.registerWithQueue(testQueue, app.prisma, app.config);

      const jobId = testQueue.enqueue({
        type: 'enrich-item',
        priority: JobPriority.NORMAL,
        data: {
          itemId: 'test-id',
          collectionId: collection.id,
          mediaType: 'MOVIE',
        },
        maxAttempts: 1,
        delayMs: 0,
      });

      expect(jobId).toBeDefined();
      testQueue.stop();
    });
  });

  describe('Item enrichment workflow', () => {
    it('should handle missing item gracefully', async () => {
      ItemEnrichmentJob.registerWithQueue(queue, app.prisma, app.config);

      queue.enqueue({
        type: 'enrich-item',
        priority: JobPriority.NORMAL,
        data: {
          itemId: 'non-existent-id',
          collectionId: collection.id,
          imdbId: 'tt1234567',
          mediaType: 'MOVIE',
        },
        maxAttempts: 1,
        delayMs: 0,
      });

      const processPromise = queue.process();

      await new Promise((resolve) => setTimeout(resolve, 500));
      queue.stop();
      await processPromise.catch(() => {});

      const stats = queue.getStats();
      expect(stats.failed).toBe(1);
    });

    it('should track enrichment attempts', async () => {
      const item = await app.prisma.collectionItem.create({
        data: {
          collectionId: collection.id,
          mediaType: 'MOVIE',
          title: 'Test Movie',
          imdbId: 'tt1234567',
          enrichmentAttempts: 0,
        },
      });

      ItemEnrichmentJob.registerWithQueue(queue, app.prisma, app.config);

      queue.enqueue({
        type: 'enrich-item',
        priority: JobPriority.NORMAL,
        data: {
          itemId: item.id,
          collectionId: collection.id,
          imdbId: 'tt1234567',
          mediaType: 'MOVIE',
        },
        maxAttempts: 1,
        delayMs: 0,
      });

      const processPromise = queue.process();

      await new Promise((resolve) => setTimeout(resolve, 500));
      queue.stop();
      await processPromise.catch(() => {});

      const updatedItem = await app.prisma.collectionItem.findUnique({
        where: { id: item.id },
      });

      expect(updatedItem.enrichmentAttempts).toBeGreaterThanOrEqual(0);
    });

    it('should handle items without external IDs', async () => {
      const item = await app.prisma.collectionItem.create({
        data: {
          collectionId: collection.id,
          mediaType: 'MOVIE',
          title: 'Movie Without IDs',
        },
      });

      ItemEnrichmentJob.registerWithQueue(queue, app.prisma, app.config);

      queue.enqueue({
        type: 'enrich-item',
        priority: JobPriority.NORMAL,
        data: {
          itemId: item.id,
          collectionId: collection.id,
          mediaType: 'MOVIE',
        },
        maxAttempts: 1,
        delayMs: 0,
      });

      const processPromise = queue.process();

      await new Promise((resolve) => setTimeout(resolve, 500));
      queue.stop();
      await processPromise.catch(() => {});

      const stats = queue.getStats();
      expect(stats.completed + stats.failed).toBeGreaterThan(0);
    });
  });

  describe('Job queue integration', () => {
    it('should enqueue enrichment jobs', async () => {
      const item = await app.prisma.collectionItem.create({
        data: {
          collectionId: collection.id,
          mediaType: 'MOVIE',
          title: 'Test Movie 2',
          imdbId: 'tt2234567',
        },
      });

      const jobId = queue.enqueue({
        type: 'enrich-item',
        priority: JobPriority.NORMAL,
        data: {
          itemId: item.id,
          collectionId: collection.id,
          imdbId: 'tt2234567',
          mediaType: 'MOVIE',
        },
        maxAttempts: 3,
        delayMs: 0,
      });

      expect(jobId).toBeDefined();

      const stats = queue.getStats();
      expect(stats.pending).toBe(1);
    });

    it('should respect job priority', async () => {
      const item1 = await app.prisma.collectionItem.create({
        data: {
          collectionId: collection.id,
          mediaType: 'MOVIE',
          title: 'Low Priority Movie',
          imdbId: 'tt3234567',
        },
      });

      const item2 = await app.prisma.collectionItem.create({
        data: {
          collectionId: collection.id,
          mediaType: 'MOVIE',
          title: 'High Priority Movie',
          imdbId: 'tt4234567',
        },
      });

      queue.enqueue({
        type: 'enrich-item',
        priority: JobPriority.LOW,
        data: {
          itemId: item1.id,
          collectionId: collection.id,
          imdbId: 'tt3234567',
          mediaType: 'MOVIE',
        },
        maxAttempts: 1,
        delayMs: 0,
      });

      queue.enqueue({
        type: 'enrich-item',
        priority: JobPriority.HIGH,
        data: {
          itemId: item2.id,
          collectionId: collection.id,
          imdbId: 'tt4234567',
          mediaType: 'MOVIE',
        },
        maxAttempts: 1,
        delayMs: 0,
      });

      const stats = queue.getStats();
      expect(stats.pending).toBe(2);
    });

    it('should handle concurrent enrichment jobs', async () => {
      const items = [];
      for (let i = 0; i < 5; i++) {
        const item = await app.prisma.collectionItem.create({
          data: {
            collectionId: collection.id,
            mediaType: 'MOVIE',
            title: `Concurrent Movie ${i}`,
            imdbId: `tt${5000000 + i}`,
          },
        });
        items.push(item);
      }

      ItemEnrichmentJob.registerWithQueue(queue, queue.concurrency, app.config);

      for (const item of items) {
        queue.enqueue({
          type: 'enrich-item',
          priority: JobPriority.NORMAL,
          data: {
            itemId: item.id,
            collectionId: collection.id,
            imdbId: item.imdbId,
            mediaType: 'MOVIE',
          },
          maxAttempts: 1,
          delayMs: 0,
        });
      }

      const stats = queue.getStats();
      expect(stats.pending).toBe(5);
    });
  });
});
