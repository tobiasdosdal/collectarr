import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';

async function rateLimitPlugin(fastify: FastifyInstance): Promise<void> {
  await fastify.register(rateLimit, {
    max: 100,
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
