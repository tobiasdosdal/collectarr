import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import staticFiles from '@fastify/static';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import config from './config/index.js';
import prismaPlugin from './plugins/prisma.js';
import authPlugin from './plugins/auth.js';
import rateLimitPlugin from './plugins/rate-limit.js';
import jobsPlugin from './plugins/jobs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Module routes
import authRoutes from './modules/auth/routes.js';
import usersRoutes from './modules/users/routes.js';
import collectionsRoutes from './modules/collections/routes.js';
import syncRoutes from './modules/sync/routes.js';
import jobsRoutes from './modules/jobs/routes.js';

// External source routes
import mdblistRoutes from './modules/external/mdblist/routes.js';
import traktRoutes from './modules/external/trakt/routes.js';

// Emby integration
import embyRoutes from './modules/emby/routes.js';

// Images
import imageRoutes from './modules/images/routes.js';

export async function buildApp(fastify, opts) {
  // Decorate with config
  fastify.decorate('config', config);

  // Register CORS first to ensure it works properly with Helmet
  const allowedOrigins = process.env.CORS_ORIGINS?.split(',') || ['http://localhost:5173', 'http://localhost:3000'];
  await fastify.register(cors, {
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-ACDB-Key'],
    exposedHeaders: ['Content-Type', 'Authorization'],
    preflight: true,
    strictPreflight: false, // Allow preflight requests even if they don't match exactly
  });

  // Register core plugins
  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    crossOriginEmbedderPolicy: false, // Disable to work better with CORS
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow cross-origin requests
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  });

  await fastify.register(sensible);
  await fastify.register(multipart, {
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB max
    },
  });
  await fastify.register(rateLimitPlugin);
  await fastify.register(prismaPlugin);
  await fastify.register(authPlugin);
  await fastify.register(jobsPlugin);

  // Log all incoming requests (for debugging)
  fastify.addHook('onRequest', async (request, reply) => {
    // Fastify logger already logs requests, but we can add additional logging here if needed
    if (request.method !== 'OPTIONS') {
      fastify.log.debug({
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH' 
          ? request.body 
          : undefined,
      });
    }
  });

  // Global error handler to catch unhandled errors
  fastify.setErrorHandler((error, request, reply) => {
    fastify.log.error({
      error: {
        message: error.message,
        stack: error.stack,
        code: error.code,
        statusCode: error.statusCode,
      },
      request: {
        method: request.method,
        url: request.url,
      },
    });

    // Handle network errors
    if (error.code === 'NETWORK_ERROR' || (error instanceof TypeError && error.message.includes('fetch'))) {
      return reply.code(502).send({
        error: 'Network Error',
        message: error.message || 'Failed to connect to external service',
      });
    }

    // Handle validation errors
    if (error.validation) {
      return reply.code(400).send({
        error: 'Validation Error',
        details: error.validation,
      });
    }

    // Handle JWT errors
    if (error.statusCode === 401 || error.name === 'UnauthorizedError') {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: error.message || 'Authentication required',
      });
    }

    // Default error response
    const statusCode = error.statusCode || error.status || 500;
    return reply.code(statusCode).send({
      error: error.name || 'Internal Server Error',
      message: error.message || 'An unexpected error occurred',
    });
  });

  // Health check
  fastify.get('/health', async (request, reply) => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // API routes
  fastify.register(async function apiRoutes(api) {
    api.register(authRoutes, { prefix: '/auth' });
    api.register(usersRoutes, { prefix: '/users' });
    api.register(collectionsRoutes, { prefix: '/collections' });
    api.register(syncRoutes, { prefix: '/sync' });

    // External source browsers
    api.register(mdblistRoutes, { prefix: '/sources/mdblist' });
    api.register(traktRoutes, { prefix: '/sources/trakt' });

    // Emby server management and sync
    api.register(embyRoutes, { prefix: '/emby' });

    // Jobs management
    api.register(jobsRoutes, { prefix: '/jobs' });

    // Image serving
    api.register(imageRoutes, { prefix: '/images' });
  }, { prefix: '/api/v1' });

  // Serve static files in production
  if (config.server.env === 'production') {
    const distPath = join(__dirname, '..', 'dist');
    await fastify.register(staticFiles, {
      root: distPath,
      prefix: '/',
    });

    // SPA fallback - serve index.html for all non-API routes
    fastify.setNotFoundHandler((request, reply) => {
      // Don't serve index.html for API routes
      if (request.url.startsWith('/api/')) {
        return reply.code(404).send({ error: 'Not Found' });
      }
      // Serve index.html for all other routes (SPA routing)
      return reply.sendFile('index.html');
    });
  }
}

export default buildApp;
