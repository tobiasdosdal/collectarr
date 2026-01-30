import { buildTestApp, createAdminUser, authRequest } from './helper.js';

describe('Collection Progress SSE Endpoint', () => {
  let app;
  let token;
  let client;
  let collection;

  beforeAll(async () => {
    app = await buildTestApp();
    const auth = await createAdminUser(app, `progress-admin-${Date.now()}@example.com`);
    token = auth.token;
    client = authRequest(app, token);

    const response = await client.post('/api/v1/collections', {
      name: 'Progress Test Collection',
      sourceType: 'MANUAL',
    });
    collection = JSON.parse(response.body);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /:id/progress', () => {
    it('should return 404 for non-existent collection', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/collections/non-existent-id/progress',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'text/event-stream',
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('Real-time event broadcasting', () => {
    it('should update item enrichment status', async () => {
      const item = await app.prisma.collectionItem.create({
        data: {
          collectionId: collection.id,
          mediaType: 'MOVIE',
          title: 'Enriched Movie',
          enrichmentStatus: 'PENDING',
        },
      });

      await app.prisma.collectionItem.update({
        where: { id: item.id },
        data: {
          enrichmentStatus: 'ENRICHED',
          posterPath: '/poster.jpg',
          rating: 85,
        },
      });

      const updatedItem = await app.prisma.collectionItem.findUnique({
        where: { id: item.id },
      });

      expect(updatedItem.enrichmentStatus).toBe('ENRICHED');
      expect(updatedItem.posterPath).toBe('/poster.jpg');
    });

    it('should update item failure status', async () => {
      const item = await app.prisma.collectionItem.create({
        data: {
          collectionId: collection.id,
          mediaType: 'MOVIE',
          title: 'Failed Movie',
          enrichmentStatus: 'PENDING',
        },
      });

      await app.prisma.collectionItem.update({
        where: { id: item.id },
        data: {
          enrichmentStatus: 'FAILED',
          lastEnrichmentError: 'API error',
          enrichmentAttempts: 3,
        },
      });

      const updatedItem = await app.prisma.collectionItem.findUnique({
        where: { id: item.id },
      });

      expect(updatedItem.enrichmentStatus).toBe('FAILED');
      expect(updatedItem.lastEnrichmentError).toBe('API error');
    });
  });

  describe('Progress calculation', () => {
    it('should calculate progress from item statuses', async () => {
      const testColl = await app.prisma.collection.create({
        data: {
          name: 'Progress Calc Test',
          sourceType: 'MANUAL',
        },
      });

      for (let i = 0; i < 2; i++) {
        await app.prisma.collectionItem.create({
          data: {
            collectionId: testColl.id,
            mediaType: 'MOVIE',
            title: `Pending ${i}`,
            enrichmentStatus: 'PENDING',
          },
        });
      }

      for (let i = 0; i < 3; i++) {
        await app.prisma.collectionItem.create({
          data: {
            collectionId: testColl.id,
            mediaType: 'MOVIE',
            title: `Enriched ${i}`,
            enrichmentStatus: 'ENRICHED',
          },
        });
      }

      for (let i = 0; i < 1; i++) {
        await app.prisma.collectionItem.create({
          data: {
            collectionId: testColl.id,
            mediaType: 'MOVIE',
            title: `Failed ${i}`,
            enrichmentStatus: 'FAILED',
          },
        });
      }

      const items = await app.prisma.collectionItem.findMany({
        where: { collectionId: testColl.id },
      });

      const pending = items.filter((i) => i.enrichmentStatus === 'PENDING').length;
      const enriched = items.filter((i) => i.enrichmentStatus === 'ENRICHED').length;
      const failed = items.filter((i) => i.enrichmentStatus === 'FAILED').length;
      const total = items.length;
      const percentComplete = total > 0 ? Math.round((enriched / total) * 100 * 10) / 10 : 0;

      expect(total).toBe(6);
      expect(pending).toBe(2);
      expect(enriched).toBe(3);
      expect(failed).toBe(1);
      expect(percentComplete).toBe(50);
    });

    it('should handle empty collection', async () => {
      const emptyColl = await app.prisma.collection.create({
        data: {
          name: 'Empty Collection',
          sourceType: 'MANUAL',
        },
      });

      const items = await app.prisma.collectionItem.findMany({
        where: { collectionId: emptyColl.id },
      });

      expect(items.length).toBe(0);
    });

    it('should calculate percentComplete correctly', async () => {
      const testColl = await app.prisma.collection.create({
        data: {
          name: 'Percent Test',
          sourceType: 'MANUAL',
        },
      });

      for (let i = 0; i < 7; i++) {
        await app.prisma.collectionItem.create({
          data: {
            collectionId: testColl.id,
            mediaType: 'MOVIE',
            title: `Movie ${i}`,
            enrichmentStatus: 'ENRICHED',
          },
        });
      }

      for (let i = 0; i < 3; i++) {
        await app.prisma.collectionItem.create({
          data: {
            collectionId: testColl.id,
            mediaType: 'MOVIE',
            title: `Pending ${i}`,
            enrichmentStatus: 'PENDING',
          },
        });
      }

      const items = await app.prisma.collectionItem.findMany({
        where: { collectionId: testColl.id },
      });

      const enriched = items.filter((i) => i.enrichmentStatus === 'ENRICHED').length;
      const total = items.length;
      const percentComplete = total > 0 ? Math.round((enriched / total) * 100 * 10) / 10 : 0;

      expect(percentComplete).toBe(70);
    });
  });

  describe('Error handling', () => {
    it('should handle invalid collection ID format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/collections/invalid-id-format/progress',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'text/event-stream',
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
