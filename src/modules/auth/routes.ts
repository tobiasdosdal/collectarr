import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { registerSchema, loginSchema } from './schemas.js';
import { generateStateToken, verifyStateToken } from '../../utils/oauth-state.js';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

interface TraktCallbackQuery {
  code?: string;
  state?: string;
}

interface MdblistConnectBody {
  apiKey?: string;
}

interface TraktTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export default async function authRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/register', async (request: FastifyRequest, reply: FastifyReply) => {
    const validation = registerSchema.safeParse(request.body);
    if (!validation.success) {
      return reply.code(400).send({
        error: 'Validation Error',
        details: validation.error.flatten().fieldErrors,
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
      fastify.log.debug({ body: request.body }, 'Login attempt');

      const validation = loginSchema.safeParse(request.body);
      if (!validation.success) {
        fastify.log.debug({ errors: validation.error.flatten().fieldErrors }, 'Login validation failed');
        return reply.code(400).send({
          error: 'Validation Error',
          details: validation.error.flatten().fieldErrors,
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
        traktAccessToken: true,
        mdblistApiKey: true,
        createdAt: true,
      },
    });

    return {
      ...user,
      traktConnected: !!user?.traktAccessToken,
      mdblistConnected: !!user?.mdblistApiKey,
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

  fastify.get('/trakt/authorize', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { trakt } = fastify.config.external;

    if (!trakt.clientId) {
      return reply.code(503).send({
        error: 'Service Unavailable',
        message: 'Trakt integration not configured',
      });
    }

    const stateToken = generateStateToken(request.user!.id);

    const authUrl = new URL('https://trakt.tv/oauth/authorize');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', trakt.clientId);
    authUrl.searchParams.set('redirect_uri', trakt.redirectUri);
    authUrl.searchParams.set('state', stateToken);

    return { authUrl: authUrl.toString() };
  });

  fastify.get<{ Querystring: TraktCallbackQuery }>('/trakt/callback', async (request, reply) => {
    const { code, state } = request.query;

    if (!code || !state) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Missing code or state parameter',
      });
    }

    // Verify state token to prevent CSRF attacks
    const userId = verifyStateToken(state);
    if (!userId) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Invalid or expired state token',
      });
    }

    const { trakt } = fastify.config.external;

    let tokenResponse: Response;
    try {
      tokenResponse = await fetch('https://api.trakt.tv/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          client_id: trakt.clientId,
          client_secret: trakt.clientSecret,
          redirect_uri: trakt.redirectUri,
          grant_type: 'authorization_code',
        }),
      });
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        return reply.code(502).send({
          error: 'Network Error',
          message: 'Failed to connect to Trakt API',
        });
      }
      throw error;
    }

    if (!tokenResponse.ok) {
      return reply.code(400).send({
        error: 'OAuth Error',
        message: 'Failed to exchange code for tokens',
      });
    }

    const tokens = await tokenResponse.json() as TraktTokenResponse;

    await fastify.prisma.user.update({
      where: { id: userId },
      data: {
        traktAccessToken: tokens.access_token,
        traktRefreshToken: tokens.refresh_token,
        traktExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
    });

    return { success: true, message: 'Trakt connected successfully' };
  });

  fastify.post('/trakt/disconnect', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest) => {
    await fastify.prisma.user.update({
      where: { id: request.user!.id },
      data: {
        traktAccessToken: null,
        traktRefreshToken: null,
        traktExpiresAt: null,
      },
    });

    return { success: true };
  });

  fastify.post<{ Body: MdblistConnectBody }>('/mdblist/connect', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { apiKey } = request.body;

    if (!apiKey) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'API key is required',
      });
    }

    await fastify.prisma.user.update({
      where: { id: request.user!.id },
      data: { mdblistApiKey: apiKey },
    });

    return { success: true };
  });

  fastify.post('/mdblist/disconnect', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest) => {
    await fastify.prisma.user.update({
      where: { id: request.user!.id },
      data: { mdblistApiKey: null },
    });

    return { success: true };
  });
}
