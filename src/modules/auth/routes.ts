import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { z } from 'zod';
import { registerSchema, loginSchema } from './schemas.js';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

const setupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export default async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // Setup status - check if initial setup is needed
  fastify.get('/setup/status', async () => {
    const authDisabled = fastify.config.auth.disabled;
    const userCount = await fastify.prisma.user.count();
    return {
      setupRequired: userCount === 0 && !authDisabled,
      hasAdmin: userCount > 0,
      authDisabled,
    };
  });

  // Initial setup - create first admin user
  fastify.post<{ Body: z.infer<typeof setupSchema> }>('/setup', async (request, reply) => {
    // Check if setup is already done
    const userCount = await fastify.prisma.user.count();
    if (userCount > 0) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Setup already completed. Use login instead.',
      });
    }

    const validation = setupSchema.safeParse(request.body);
    if (!validation.success) {
      return reply.code(400).send({
        error: 'Validation Error',
        details: z.flattenError(validation.error).fieldErrors,
      });
    }

    const { email, password } = validation.data;

    // Create the first admin user
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await fastify.prisma.user.create({
      data: {
        email,
        passwordHash,
        isAdmin: true, // First user is always admin
      },
      select: {
        id: true,
        email: true,
        isAdmin: true,
        apiKey: true,
        createdAt: true,
      },
    });

    const token = fastify.jwt.sign({ id: user.id, email: user.email });

    fastify.log.info({ email }, 'Initial admin user created');

    return reply.code(201).send({
      user,
      token,
    });
  });

  fastify.post('/register', async (request: FastifyRequest, reply: FastifyReply) => {
    const validation = registerSchema.safeParse(request.body);
    if (!validation.success) {
      return reply.code(400).send({
        error: 'Validation Error',
        details: z.flattenError(validation.error).fieldErrors,
      });
    }

    const { email, password } = validation.data;

    const existing = await fastify.prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      return reply.code(409).send({
        error: 'Conflict',
        message: 'Email already registered',
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await fastify.prisma.user.create({
      data: {
        email,
        passwordHash,
      },
      select: {
        id: true,
        email: true,
        apiKey: true,
        createdAt: true,
      },
    });

    const token = fastify.jwt.sign({ id: user.id, email: user.email });

    return reply.code(201).send({
      user,
      token,
    });
  });

  fastify.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { email?: string } | undefined;
      fastify.log.debug({ email: body?.email }, 'Login attempt');

      const validation = loginSchema.safeParse(request.body);
      if (!validation.success) {
        fastify.log.debug({ errors: z.flattenError(validation.error).fieldErrors }, 'Login validation failed');
        return reply.code(400).send({
          error: 'Validation Error',
          details: z.flattenError(validation.error).fieldErrors,
        });
      }

      const { email, password } = validation.data;

      const user = await fastify.prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        fastify.log.debug({ email }, 'Login failed: user not found');
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'Invalid email or password',
        });
      }

      const validPassword = await bcrypt.compare(password, user.passwordHash);
      if (!validPassword) {
        fastify.log.debug({ email }, 'Login failed: invalid password');
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'Invalid email or password',
        });
      }

      const token = fastify.jwt.sign({ id: user.id, email: user.email });

      fastify.log.debug({ userId: user.id, email }, 'Login successful');
      return reply.code(200).send({
        user: {
          id: user.id,
          email: user.email,
          apiKey: user.apiKey,
        },
        token,
      });
    } catch (error) {
      fastify.log.error({ error: (error as Error).message, stack: (error as Error).stack }, 'Login error');
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'An error occurred during login',
      });
    }
  });

  fastify.get('/me', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest) => {
    const user = await fastify.prisma.user.findUnique({
      where: { id: request.user!.id },
      select: {
        id: true,
        email: true,
        apiKey: true,
        isAdmin: true,
        createdAt: true,
      },
    });

    // Get connection status from global Settings
    const settings = await fastify.prisma.settings.findUnique({
      where: { id: 'singleton' },
      select: {
        traktAccessToken: true,
        mdblistApiKey: true,
        tmdbApiKey: true,
      },
    });

    return {
      ...user,
      traktConnected: !!settings?.traktAccessToken,
      mdblistConnected: !!settings?.mdblistApiKey,
      tmdbConnected: !!settings?.tmdbApiKey,
    };
  });

  fastify.post('/api-key/regenerate', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest) => {
    const newApiKey = crypto.randomUUID();

    const user = await fastify.prisma.user.update({
      where: { id: request.user!.id },
      data: { apiKey: newApiKey },
      select: { apiKey: true },
    });

    return { apiKey: user.apiKey };
  });

  // Legacy endpoints - redirect to settings routes
  // These are kept for backwards compatibility but point users to the new endpoints

  fastify.get('/trakt/authorize', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    // Redirect to settings endpoint
    return reply.redirect('/api/v1/settings/trakt/authorize');
  });

  fastify.get('/trakt/callback', async (request: FastifyRequest, reply: FastifyReply) => {
    // Redirect to settings endpoint with query params
    const url = new URL(request.url, 'http://localhost');
    return reply.redirect(`/api/v1/settings/trakt/callback${url.search}`);
  });

  fastify.post('/trakt/disconnect', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user?.isAdmin) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'Admin access required to disconnect Trakt',
      });
    }
    // Forward to settings route logic
    await fastify.prisma.settings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton' },
      update: {
        traktAccessToken: null,
        traktRefreshToken: null,
        traktExpiresAt: null,
      },
    });
    return { success: true };
  });

  fastify.post<{ Body: { apiKey?: string } }>('/mdblist/connect', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (!request.user?.isAdmin) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'Admin access required to connect MDBList',
      });
    }

    const { apiKey } = request.body;
    if (!apiKey) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'API key is required',
      });
    }

    await fastify.prisma.settings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', mdblistApiKey: apiKey },
      update: { mdblistApiKey: apiKey },
    });

    return { success: true };
  });

  fastify.post('/mdblist/disconnect', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user?.isAdmin) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'Admin access required to disconnect MDBList',
      });
    }

    await fastify.prisma.settings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton' },
      update: { mdblistApiKey: null },
    });

    return { success: true };
  });
}
