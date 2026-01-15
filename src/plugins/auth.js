import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';

async function authPlugin(fastify, opts) {
  // Register JWT
  await fastify.register(jwt, {
    secret: fastify.config.jwt.secret,
    sign: {
      expiresIn: fastify.config.jwt.expiresIn,
    },
  });

  // Authenticate via JWT token
  fastify.decorate('authenticateJwt', async function (request, reply) {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or expired token' });
    }
  });

  // Authenticate via API key (for plugin)
  fastify.decorate('authenticateApiKey', async function (request, reply) {
    const apiKey = request.headers['x-acdb-key'];

    if (!apiKey) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'API key required' });
    }

    const user = await fastify.prisma.user.findUnique({
      where: { apiKey },
      select: { id: true, email: true },
    });

    if (!user) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid API key' });
    }

    request.user = user;
  });

  // Authenticate via either JWT or API key
  fastify.decorate('authenticate', async function (request, reply) {
    // Check for API key first (plugin auth)
    const apiKey = request.headers['x-acdb-key'];
    if (apiKey) {
      const user = await fastify.prisma.user.findUnique({
        where: { apiKey },
        select: { id: true, email: true, isAdmin: true },
      });

      if (user) {
        request.user = user;
        return;
      }
    }

    // Fall back to JWT
    try {
      await request.jwtVerify();
      // Load full user data including isAdmin
      const user = await fastify.prisma.user.findUnique({
        where: { id: request.user.id },
        select: { id: true, email: true, isAdmin: true },
      });
      if (user) {
        request.user = user;
      }
    } catch (err) {
      reply.code(401).send({ error: 'Unauthorized', message: 'Authentication required' });
    }
  });

  // Require admin authentication (use as preHandler after authenticate)
  fastify.decorate('requireAdmin', async function (request, reply) {
    // This assumes authenticate has already been called as a previous preHandler
    // Just check if user is admin
    if (!request.user || !request.user.isAdmin) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'Admin access required',
      });
    }
  });
}

export default fp(authPlugin, {
  name: 'auth',
  dependencies: ['prisma'],
});
