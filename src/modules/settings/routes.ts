import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { generateStateToken, verifyStateToken } from '../../utils/oauth-state.js';

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

// Helper to ensure Settings singleton exists
async function ensureSettings(fastify: FastifyInstance) {
  let settings = await fastify.prisma.settings.findUnique({
    where: { id: 'singleton' },
  });

  if (!settings) {
    settings = await fastify.prisma.settings.create({
      data: { id: 'singleton' },
    });
  }

  return settings;
}

// Helper to check admin status
const requireAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!request.user || !request.user.isAdmin) {
    return reply.code(403).send({
      error: 'Forbidden',
      message: 'Admin access required',
    });
  }
};

export default async function settingsRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /settings - Get global settings (connection status)
  fastify.get('/', async () => {
    const settings = await ensureSettings(fastify);

    return {
      traktConnected: !!settings.traktAccessToken,
      mdblistConnected: !!settings.mdblistApiKey,
    };
  });

  // GET /settings/trakt/authorize - Get Trakt OAuth URL (admin only)
  fastify.get('/trakt/authorize', {
    preHandler: [requireAdmin],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { trakt } = fastify.config.external;

    if (!trakt.clientId) {
      return reply.code(503).send({
        error: 'Service Unavailable',
        message: 'Trakt integration not configured',
      });
    }

    // Use user ID in state token for verification
    const stateToken = generateStateToken(request.user!.id);

    const authUrl = new URL('https://trakt.tv/oauth/authorize');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', trakt.clientId);
    authUrl.searchParams.set('redirect_uri', trakt.redirectUri);
    authUrl.searchParams.set('state', stateToken);

    return { authUrl: authUrl.toString() };
  });

  // GET /settings/trakt/callback - Handle Trakt OAuth callback
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

    // Verify the user is an admin
    const user = await fastify.prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    });

    if (!user?.isAdmin) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'Admin access required',
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

    // Store tokens in global Settings
    await fastify.prisma.settings.upsert({
      where: { id: 'singleton' },
      create: {
        id: 'singleton',
        traktAccessToken: tokens.access_token,
        traktRefreshToken: tokens.refresh_token,
        traktExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
      update: {
        traktAccessToken: tokens.access_token,
        traktRefreshToken: tokens.refresh_token,
        traktExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
    });

    return { success: true, message: 'Trakt connected successfully' };
  });

  // DELETE /settings/trakt - Disconnect Trakt (admin only)
  fastify.delete('/trakt', {
    preHandler: [requireAdmin],
  }, async () => {
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

  // PUT /settings/mdblist - Connect MDBList (admin only)
  fastify.put<{ Body: MdblistConnectBody }>('/mdblist', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { apiKey } = request.body;

    if (!apiKey) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'API key is required',
      });
    }

    await fastify.prisma.settings.upsert({
      where: { id: 'singleton' },
      create: {
        id: 'singleton',
        mdblistApiKey: apiKey,
      },
      update: {
        mdblistApiKey: apiKey,
      },
    });

    return { success: true };
  });

  // DELETE /settings/mdblist - Disconnect MDBList (admin only)
  fastify.delete('/mdblist', {
    preHandler: [requireAdmin],
  }, async () => {
    await fastify.prisma.settings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton' },
      update: {
        mdblistApiKey: null,
      },
    });

    return { success: true };
  });
}
