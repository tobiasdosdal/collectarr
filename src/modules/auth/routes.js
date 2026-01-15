import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { registerSchema, loginSchema } from './schemas.js';

export default async function authRoutes(fastify, opts) {
  // Check if setup is needed (no users exist yet)
  fastify.get('/setup/status', async (request, reply) => {
    const userCount = await fastify.prisma.user.count();
    return {
      setupRequired: userCount === 0,
      userCount,
    };
  });

  // Setup: Create first admin user (only works if no users exist)
  fastify.post('/setup', async (request, reply) => {
    // Check if any users already exist
    const userCount = await fastify.prisma.user.count();
    if (userCount > 0) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'Setup already completed. Please use the login endpoint.',
      });
    }

    const validation = registerSchema.safeParse(request.body);
    if (!validation.success) {
      return reply.code(400).send({
        error: 'Validation Error',
        details: validation.error.flatten().fieldErrors,
      });
    }

    const { email, password } = validation.data;

    // Hash password and create first admin user
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
        apiKey: true,
        isAdmin: true,
        createdAt: true,
      },
    });

    // Generate JWT
    const token = fastify.jwt.sign({ id: user.id, email: user.email });

    fastify.log.info('First admin user created during setup', { email, userId: user.id });
    return reply.code(201).send({
      user,
      token,
      message: 'Admin account created successfully',
    });
  });

  // Register new user (disabled - only admins can create users via /users endpoint)
  fastify.post('/register', async (request, reply) => {
    // Check if any users exist
    const userCount = await fastify.prisma.user.count();
    
    if (userCount === 0) {
      // No users exist, redirect to setup
      return reply.code(400).send({
        error: 'Setup Required',
        message: 'No users found. Please complete the initial setup first.',
        setupRequired: true,
      });
    }

    // Public registration is disabled for self-hosted instances
    return reply.code(403).send({
      error: 'Forbidden',
      message: 'Public registration is disabled. Please contact an administrator to create an account.',
    });
  });

  // Login
  fastify.post('/login', async (request, reply) => {
    try {
      fastify.log.debug('Login attempt', { body: request.body });

      const validation = loginSchema.safeParse(request.body);
      if (!validation.success) {
        fastify.log.debug('Login validation failed', { errors: validation.error.flatten().fieldErrors });
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
        fastify.log.debug('Login failed: user not found', { email });
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'Invalid email or password',
        });
      }

      const validPassword = await bcrypt.compare(password, user.passwordHash);
      if (!validPassword) {
        fastify.log.debug('Login failed: invalid password', { email });
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'Invalid email or password',
        });
      }

      const token = fastify.jwt.sign({ id: user.id, email: user.email });

      fastify.log.debug('Login successful', { userId: user.id, email });
      return reply.code(200).send({
        user: {
          id: user.id,
          email: user.email,
          apiKey: user.apiKey,
        },
        token,
      });
    } catch (error) {
      fastify.log.error('Login error', { error: error.message, stack: error.stack });
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'An error occurred during login',
      });
    }
  });

  // Get current user
  fastify.get('/me', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = await fastify.prisma.user.findUnique({
      where: { id: request.user.id },
      select: {
        id: true,
        email: true,
        apiKey: true,
        isAdmin: true,
        traktAccessToken: true,
        mdblistApiKey: true,
        createdAt: true,
      },
    });

    return {
      ...user,
      traktConnected: !!user.traktAccessToken,
      mdblistConnected: !!user.mdblistApiKey,
    };
  });

  // Regenerate API key
  fastify.post('/api-key/regenerate', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const newApiKey = crypto.randomUUID();

    const user = await fastify.prisma.user.update({
      where: { id: request.user.id },
      data: { apiKey: newApiKey },
      select: { apiKey: true },
    });

    return { apiKey: user.apiKey };
  });

  // Trakt OAuth - Initiate
  fastify.get('/trakt/authorize', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { trakt } = fastify.config.external;

    if (!trakt.clientId) {
      return reply.code(503).send({
        error: 'Service Unavailable',
        message: 'Trakt integration not configured',
      });
    }

    const authUrl = new URL('https://trakt.tv/oauth/authorize');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', trakt.clientId);
    authUrl.searchParams.set('redirect_uri', trakt.redirectUri);
    authUrl.searchParams.set('state', request.user.id);

    return { authUrl: authUrl.toString() };
  });

  // Trakt OAuth - Callback
  fastify.get('/trakt/callback', async (request, reply) => {
    const { code, state: userId } = request.query;

    if (!code || !userId) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Missing code or state parameter',
      });
    }

    const { trakt } = fastify.config.external;

    // Exchange code for tokens
    let tokenResponse;
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
      // Handle network errors
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

    const tokens = await tokenResponse.json();

    // Store tokens
    await fastify.prisma.user.update({
      where: { id: userId },
      data: {
        traktAccessToken: tokens.access_token,
        traktRefreshToken: tokens.refresh_token,
        traktExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
    });

    // Redirect to frontend or return success
    return { success: true, message: 'Trakt connected successfully' };
  });

  // Disconnect Trakt
  fastify.post('/trakt/disconnect', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    await fastify.prisma.user.update({
      where: { id: request.user.id },
      data: {
        traktAccessToken: null,
        traktRefreshToken: null,
        traktExpiresAt: null,
      },
    });

    return { success: true };
  });

  // Save MDBList API key
  fastify.post('/mdblist/connect', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { apiKey } = request.body;

    if (!apiKey) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'API key is required',
      });
    }

    // Optionally validate the API key by making a test request
    await fastify.prisma.user.update({
      where: { id: request.user.id },
      data: { mdblistApiKey: apiKey },
    });

    return { success: true };
  });

  // Disconnect MDBList
  fastify.post('/mdblist/disconnect', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    await fastify.prisma.user.update({
      where: { id: request.user.id },
      data: { mdblistApiKey: null },
    });

    return { success: true };
  });
}
