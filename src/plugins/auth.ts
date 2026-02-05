import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

const DEFAULT_AUTH_DISABLED_USER = {
  id: 'auth-disabled-user',
  email: 'admin@localhost',
  isAdmin: true,
};

async function authPlugin(fastify: FastifyInstance): Promise<void> {
  const authDisabled = fastify.config.auth.disabled;

  if (authDisabled) {
    fastify.log.warn('Authentication is disabled via DISABLE_AUTH=true. All requests will be treated as authenticated admin.');
  }

  await fastify.register(jwt, {
    secret: fastify.config.jwt.secret,
    sign: {
      expiresIn: fastify.config.jwt.expiresIn,
    },
  });

  fastify.decorate('authenticateJwt', async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (authDisabled) {
      request.user = DEFAULT_AUTH_DISABLED_USER;
      return;
    }
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or expired token' });
    }
  });

  fastify.decorate('authenticateApiKey', async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (authDisabled) {
      request.user = DEFAULT_AUTH_DISABLED_USER;
      return;
    }

    const apiKey = request.headers['x-acdb-key'] as string | undefined;

    if (!apiKey) {
      reply.code(401).send({ error: 'Unauthorized', message: 'API key required' });
      return;
    }

    const user = await fastify.prisma.user.findUnique({
      where: { apiKey },
      select: { id: true, email: true, isAdmin: true },
    });

    if (!user) {
      reply.code(401).send({ error: 'Unauthorized', message: 'Invalid API key' });
      return;
    }

    request.user = user;
  });

  fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (authDisabled) {
      request.user = DEFAULT_AUTH_DISABLED_USER;
      return;
    }

    const apiKey = request.headers['x-acdb-key'] as string | undefined;
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

    try {
      await request.jwtVerify();

      // Fetch full user from database to get isAdmin
      const jwtPayload = request.user as { id: string; email: string };
      const user = await fastify.prisma.user.findUnique({
        where: { id: jwtPayload.id },
        select: { id: true, email: true, isAdmin: true },
      });

      if (!user) {
        reply.code(401).send({ error: 'Unauthorized', message: 'User not found' });
        return;
      }

      request.user = user;
    } catch {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Authentication required' });
    }
  });
}

export default fp(authPlugin, {
  name: 'auth',
  dependencies: ['prisma'],
});
