import Fastify from 'fastify';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildApp } from '../dist-server/app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

// Use test database
const testDbPath = path.join(projectRoot, 'prisma', 'test.db');
process.env.DATABASE_URL = `file:${testDbPath}`;

/**
 * Build a test instance of the app
 */
export async function buildTestApp() {
  const app = Fastify({
    logger: false,
  });

  await buildApp(app);
  await app.ready();

  return app;
}

/**
 * Create a test user and return auth token
 * @param {object} app - Fastify app instance
 * @param {string} email - User email
 * @param {string} password - User password
 * @param {boolean} isAdmin - Whether user should be admin
 */
export async function createTestUser(app, email = 'test@example.com', password = 'testpassword123', isAdmin = false) {
  // Try to register, or login if already exists
  let response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email, password },
  });

  if (response.statusCode === 409) {
    response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password },
    });
  }

  const data = JSON.parse(response.body);

  // If admin is requested, update the user in the database
  if (isAdmin && data.user) {
    await app.prisma.user.update({
      where: { id: data.user.id },
      data: { isAdmin: true },
    });
    data.user.isAdmin = true;
  }

  return {
    token: data.token,
    user: data.user,
    apiKey: data.user?.apiKey,
  };
}

/**
 * Create an admin test user
 */
export async function createAdminUser(app, email = 'admin@example.com', password = 'adminpassword123') {
  return createTestUser(app, email, password, true);
}

/**
 * Make an authenticated request
 */
export function authRequest(app, token) {
  return {
    get: (url) => app.inject({
      method: 'GET',
      url,
      headers: { Authorization: `Bearer ${token}` },
    }),
    post: (url, payload) => app.inject({
      method: 'POST',
      url,
      headers: { Authorization: `Bearer ${token}` },
      payload,
    }),
    patch: (url, payload) => app.inject({
      method: 'PATCH',
      url,
      headers: { Authorization: `Bearer ${token}` },
      payload,
    }),
    delete: (url) => app.inject({
      method: 'DELETE',
      url,
      headers: { Authorization: `Bearer ${token}` },
    }),
  };
}
