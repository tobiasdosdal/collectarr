import { buildTestApp, createTestUser, authRequest } from './helper.js';

describe('Auth API', () => {
  let app;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user', async () => {
      const email = `test-${Date.now()}@example.com`;
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email,
          password: 'testpassword123',
        },
      });

      expect(response.statusCode).toBe(201);
      const data = JSON.parse(response.body);
      expect(data.user).toBeDefined();
      expect(data.user.email).toBe(email);
      expect(data.user.apiKey).toBeDefined();
      expect(data.token).toBeDefined();
    });

    it('should reject duplicate email', async () => {
      const email = `dupe-${Date.now()}@example.com`;

      // First registration
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: { email, password: 'testpassword123' },
      });

      // Second registration with same email
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: { email, password: 'testpassword123' },
      });

      expect(response.statusCode).toBe(409);
    });

    it('should reject invalid email', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'invalid-email',
          password: 'testpassword123',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject short password', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'short@example.com',
          password: '123',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should login with valid credentials', async () => {
      const email = `login-${Date.now()}@example.com`;
      const password = 'testpassword123';

      // Register first
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: { email, password },
      });

      // Login
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email, password },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.token).toBeDefined();
      expect(data.user.email).toBe(email);
    });

    it('should reject invalid credentials', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'nonexistent@example.com',
          password: 'wrongpassword',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return current user with valid token', async () => {
      const { token } = await createTestUser(app, `me-${Date.now()}@example.com`);
      const client = authRequest(app, token);

      const response = await client.get('/api/v1/auth/me');

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.email).toBeDefined();
      expect(data.apiKey).toBeDefined();
    });

    it('should reject without token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /api/v1/auth/api-key/regenerate', () => {
    it('should regenerate API key', async () => {
      const { token, user } = await createTestUser(app, `regen-${Date.now()}@example.com`);
      const client = authRequest(app, token);
      const oldApiKey = user.apiKey;

      const response = await client.post('/api/v1/auth/api-key/regenerate');

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.apiKey).toBeDefined();
      expect(data.apiKey).not.toBe(oldApiKey);
    });
  });
});
