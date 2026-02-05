import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { generateStateToken, verifyStateToken } from '../../utils/oauth-state.js';
import { writeAuditLog } from '../../utils/audit-log.js';
import { generateCollectionPoster } from '../../utils/collection-poster.js';
import { hasUploadedPoster } from '../../utils/poster-utils.js';
import { requireAdmin } from '../../shared/middleware/index.js';

interface TraktCallbackQuery {
  code?: string;
  state?: string;
}

interface MdblistConnectBody {
  apiKey?: string;
}

interface TmdbConnectBody {
  apiKey?: string;
}

interface TraktTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

interface TmdbTestBody {
  apiKey?: string;
}

interface MdblistTestBody {
  apiKey?: string;
}

interface PosterRegenerateBody {
  includeCustom?: boolean;
}

// Helper function to mask API keys for display
function maskApiKey(key: string | null | undefined): string | null {
  if (!key) return null;
  if (key.length <= 8) return '***';
  // Show first 4 and last 4 characters
  return `${key.slice(0, 4)}${'*'.repeat(Math.min(key.length - 8, 20))}${key.slice(-4)}`;
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

export default async function settingsRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /settings - Get global settings (connection status)
  fastify.get('/', async () => {
    const settings = await ensureSettings(fastify);

    return {
      traktConnected: !!settings.traktAccessToken,
      mdblistConnected: !!settings.mdblistApiKey,
      tmdbConnected: !!settings.tmdbApiKey,
      tmdbApiKeyMasked: maskApiKey(settings.tmdbApiKey),
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

    if (!tokens.access_token || !tokens.refresh_token || typeof tokens.expires_in !== 'number') {
      return reply.code(502).send({
        error: 'OAuth Error',
        message: 'Invalid token response from Trakt API',
      });
    }

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

    await writeAuditLog(fastify, request, {
      action: 'settings.trakt.connect',
      entity: 'settings',
    });

    return { success: true, message: 'Trakt connected successfully' };
  });

  // DELETE /settings/trakt - Disconnect Trakt (admin only)
  fastify.delete('/trakt', {
    preHandler: [requireAdmin],
  }, async (request) => {
    await fastify.prisma.settings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton' },
      update: {
        traktAccessToken: null,
        traktRefreshToken: null,
        traktExpiresAt: null,
      },
    });

    await writeAuditLog(fastify, request, {
      action: 'settings.trakt.disconnect',
      entity: 'settings',
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

    await writeAuditLog(fastify, request, {
      action: 'settings.mdblist.connect',
      entity: 'settings',
    });

    return { success: true };
  });

  // DELETE /settings/mdblist - Disconnect MDBList (admin only)
  fastify.delete('/mdblist', {
    preHandler: [requireAdmin],
  }, async (request) => {
    await fastify.prisma.settings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton' },
      update: {
        mdblistApiKey: null,
      },
    });

    await writeAuditLog(fastify, request, {
      action: 'settings.mdblist.disconnect',
      entity: 'settings',
    });

    return { success: true };
  });

  // PUT /settings/tmdb - Connect TMDB (admin only)
  fastify.put<{ Body: TmdbConnectBody }>('/tmdb', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { apiKey } = request.body;

    if (!apiKey) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'API key is required',
      });
    }

    // Validate API key by making a test request to TMDB
    try {
      const testResponse = await fetch('https://api.themoviedb.org/3/configuration', {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
      });

      if (!testResponse.ok) {
        const status = testResponse.status;
        if (status === 401) {
          return reply.code(400).send({
            error: 'Invalid API Key',
            message: 'The TMDB API key is invalid. Please check your key and try again.',
          });
        }
        return reply.code(400).send({
          error: 'API Key Validation Failed',
          message: `Failed to validate TMDB API key: HTTP ${status}`,
        });
      }
    } catch (error) {
      fastify.log.error({ error }, 'Failed to validate TMDB API key');
      return reply.code(500).send({
        error: 'Connection Error',
        message: 'Failed to connect to TMDB to validate the API key. Please try again.',
      });
    }

    await fastify.prisma.settings.upsert({
      where: { id: 'singleton' },
      create: {
        id: 'singleton',
        tmdbApiKey: apiKey,
      },
      update: {
        tmdbApiKey: apiKey,
      },
    });

    await writeAuditLog(fastify, request, {
      action: 'settings.tmdb.connect',
      entity: 'settings',
    });

    return { success: true };
  });

  // DELETE /settings/tmdb - Disconnect TMDB (admin only)
  fastify.delete('/tmdb', {
    preHandler: [requireAdmin],
  }, async (request) => {
    await fastify.prisma.settings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton' },
      update: {
        tmdbApiKey: null,
      },
    });

    await writeAuditLog(fastify, request, {
      action: 'settings.tmdb.disconnect',
      entity: 'settings',
    });

    return { success: true };
  });

  // POST /settings/posters/regenerate - Regenerate collection posters (admin only)
  fastify.post<{ Body: PosterRegenerateBody }>('/posters/regenerate', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const includeCustom = request.body?.includeCustom === true;

    const collections = await fastify.prisma.collection.findMany({
      select: { id: true, name: true },
    });

    let generated = 0;
    let failed = 0;
    let skipped = 0;

    for (const collection of collections) {
      const hasCustom = await hasUploadedPoster(collection.id);
      if (hasCustom && !includeCustom) {
        skipped++;
        continue;
      }

      try {
        const posterUrl = await generateCollectionPoster({
          collectionId: collection.id,
          collectionName: collection.name,
        });
        if (posterUrl) {
          await fastify.prisma.collection.update({
            where: { id: collection.id },
            data: { posterPath: posterUrl },
          });
          generated++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }

    await writeAuditLog(fastify, request, {
      action: 'settings.posters.regenerate',
      entity: 'settings',
      metadata: { includeCustom, generated, failed, skipped },
    });

    return reply.send({ success: true, generated, failed, skipped });
  });

  // POST /settings/tmdb/test - Test TMDB API key without saving (admin only)
  fastify.post<{ Body: TmdbTestBody }>('/tmdb/test', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { apiKey } = request.body;

    if (!apiKey) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'API key is required',
      });
    }

    // Validate TMDB API key format (v4 tokens start with 'eyJ')
    if (!apiKey.startsWith('eyJ') || apiKey.length < 100) {
      return reply.code(400).send({
        error: 'Invalid Format',
        message: 'Invalid TMDB API key format. Please use a v4 Read Access Token (starts with "eyJ").',
      });
    }

    // Test the API key by making a request to TMDB
    try {
      const testResponse = await fetch('https://api.themoviedb.org/3/configuration', {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
      });

      if (!testResponse.ok) {
        const status = testResponse.status;
        if (status === 401) {
          return reply.code(400).send({
            success: false,
            error: 'Invalid API Key',
            message: 'The TMDB API key is invalid or expired. Please check your key and try again.',
          });
        }
        return reply.code(400).send({
          success: false,
          error: 'API Key Validation Failed',
          message: `Failed to validate TMDB API key: HTTP ${status}`,
        });
      }

      return { success: true, message: 'TMDB API key is valid' };
    } catch (error) {
      fastify.log.error({ error }, 'Failed to test TMDB API key');
      return reply.code(500).send({
        success: false,
        error: 'Connection Error',
        message: 'Failed to connect to TMDB. Please check your network connection and try again.',
      });
    }
  });

  // POST /settings/mdblist/test - Test MDBList API key without saving (admin only)
  fastify.post<{ Body: MdblistTestBody }>('/mdblist/test', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { apiKey } = request.body;

    if (!apiKey) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'API key is required',
      });
    }

    // Test the API key by making a request to MDBList
    try {
      const testResponse = await fetch(`https://api.mdblist.com/lists/user?apikey=${encodeURIComponent(apiKey)}`, {
        headers: { 'Accept': 'application/json' },
      });

      if (!testResponse.ok) {
        const status = testResponse.status;
        if (status === 401 || status === 403) {
          return reply.code(400).send({
            success: false,
            error: 'Invalid API Key',
            message: 'The MDBList API key is invalid. Please check your key and try again.',
          });
        }
        return reply.code(400).send({
          success: false,
          error: 'API Key Validation Failed',
          message: `Failed to validate MDBList API key: HTTP ${status}`,
        });
      }

      return { success: true, message: 'MDBList API key is valid' };
    } catch (error) {
      fastify.log.error({ error }, 'Failed to test MDBList API key');
      return reply.code(500).send({
        success: false,
        error: 'Connection Error',
        message: 'Failed to connect to MDBList. Please check your network connection and try again.',
      });
    }
  });
}
