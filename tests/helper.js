import Fastify from 'fastify';
import { buildApp } from '../src/app.js';

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
 */
export async function createTestUser(app, email = 'test@example.com', password = 'testpassword123') {
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
  return {
    token: data.token,
    user: data.user,
    apiKey: data.user.apiKey,
  };
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
