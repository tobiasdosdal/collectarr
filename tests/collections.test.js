import { buildTestApp, createTestUser, authRequest } from './helper.js';

describe('Collections API', () => {
  let app;
  let token;
  let client;

  beforeAll(async () => {
    app = await buildTestApp();
    const auth = await createTestUser(app, `collections-${Date.now()}@example.com`);
    token = auth.token;
    client = authRequest(app, token);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/collections', () => {
    it('should return empty array initially', async () => {
      const response = await client.get('/api/v1/collections');

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe('POST /api/v1/collections', () => {
    it('should create a manual collection', async () => {
      const response = await client.post('/api/v1/collections', {
        name: 'Test Collection',
        description: 'A test collection',
        sourceType: 'MANUAL',
      });

      expect(response.statusCode).toBe(201);
      const data = JSON.parse(response.body);
      expect(data.name).toBe('Test Collection');
      expect(data.sourceType).toBe('MANUAL');
      expect(data.id).toBeDefined();
    });

    it('should reject missing name', async () => {
      const response = await client.post('/api/v1/collections', {
        sourceType: 'MANUAL',
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject invalid sourceType', async () => {
      const response = await client.post('/api/v1/collections', {
        name: 'Test',
        sourceType: 'INVALID',
      });

      expect(response.statusCode).toBe(400);
    });

    it('should require sourceId for non-manual collections', async () => {
      const response = await client.post('/api/v1/collections', {
        name: 'MDB List',
        sourceType: 'MDBLIST',
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/v1/collections/:id', () => {
    it('should return collection with items', async () => {
      // Create collection
      const createRes = await client.post('/api/v1/collections', {
        name: 'Get Test Collection',
        sourceType: 'MANUAL',
      });
      const collection = JSON.parse(createRes.body);

      // Get collection
      const response = await client.get(`/api/v1/collections/${collection.id}`);

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.name).toBe('Get Test Collection');
      expect(data.items).toBeDefined();
      expect(Array.isArray(data.items)).toBe(true);
    });

    it('should return 404 for non-existent collection', async () => {
      const response = await client.get('/api/v1/collections/non-existent-id');

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PATCH /api/v1/collections/:id', () => {
    it('should update collection', async () => {
      // Create collection
      const createRes = await client.post('/api/v1/collections', {
        name: 'Original Name',
        sourceType: 'MANUAL',
      });
      const collection = JSON.parse(createRes.body);

      // Update collection
      const response = await client.patch(`/api/v1/collections/${collection.id}`, {
        name: 'Updated Name',
        isEnabled: false,
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.name).toBe('Updated Name');
      expect(data.isEnabled).toBe(false);
    });
  });

  describe('DELETE /api/v1/collections/:id', () => {
    it('should delete collection', async () => {
      // Create collection
      const createRes = await client.post('/api/v1/collections', {
        name: 'To Delete',
        sourceType: 'MANUAL',
      });
      const collection = JSON.parse(createRes.body);

      // Delete collection
      const response = await client.delete(`/api/v1/collections/${collection.id}`);

      expect(response.statusCode).toBe(204);

      // Verify deletion
      const getRes = await client.get(`/api/v1/collections/${collection.id}`);
      expect(getRes.statusCode).toBe(404);
    });
  });

  describe('POST /api/v1/collections/:id/items', () => {
    it('should add item to manual collection', async () => {
      // Create collection
      const createRes = await client.post('/api/v1/collections', {
        name: 'Items Test',
        sourceType: 'MANUAL',
      });
      const collection = JSON.parse(createRes.body);

      // Add item
      const response = await client.post(`/api/v1/collections/${collection.id}/items`, {
        mediaType: 'MOVIE',
        title: 'Test Movie',
        year: 2024,
        imdbId: 'tt1234567',
      });

      expect(response.statusCode).toBe(201);
      const data = JSON.parse(response.body);
      expect(data.title).toBe('Test Movie');
      expect(data.mediaType).toBe('MOVIE');
      expect(data.imdbId).toBe('tt1234567');
    });

    it('should reject item without title', async () => {
      // Create collection
      const createRes = await client.post('/api/v1/collections', {
        name: 'No Title Test',
        sourceType: 'MANUAL',
      });
      const collection = JSON.parse(createRes.body);

      // Add item without title
      const response = await client.post(`/api/v1/collections/${collection.id}/items`, {
        mediaType: 'MOVIE',
        year: 2024,
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
