import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';

async function rateLimitPlugin(fastify, opts) {
  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    errorResponseBuilder: function (request, context) {
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
