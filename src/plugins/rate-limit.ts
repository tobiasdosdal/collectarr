import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';

/**
 * Global rate limiter: 200 requests/minute
 *
 * SECURITY NOTE: Auth endpoints (/api/v1/auth/*) should implement
 * additional per-route rate limits (e.g., 5-10 req/min) to prevent
 * brute force attacks. This can be done by adding route-specific
 * rate limit config in auth/routes.ts.
 */
async function rateLimitPlugin(fastify: FastifyInstance): Promise<void> {
  await fastify.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
    errorResponseBuilder: function (_request, context) {
      return {
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${context.after}`,
        statusCode: 429,
      };
    },
  });
}

export default fp(rateLimitPlugin, {
  name: 'rate-limit',
});
