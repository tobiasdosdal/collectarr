import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import staticFiles from '@fastify/static';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import type { FastifyInstance, FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import config from './config/index.js';
import prismaPlugin from './plugins/prisma.js';
import authPlugin from './plugins/auth.js';
import rateLimitPlugin from './plugins/rate-limit.js';
import jobsPlugin from './plugins/jobs.js';
import { NetworkError } from './modules/shared/errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Module routes
import authRoutes from './modules/auth/routes.js';
import usersRoutes from './modules/users/routes.js';
import collectionsRoutes from './modules/collections/routes.js';
import collectionProgressRoutes from './routes/collection-progress.js';
import syncRoutes from './modules/sync/routes.js';
import jobsRoutes from './modules/jobs/routes.js';

// External source routes
import mdblistRoutes from './modules/external/mdblist/routes.js';
import traktRoutes from './modules/external/trakt/routes.js';

// Emby integration
import embyRoutes from './modules/emby/routes.js';

// Radarr/Sonarr integration
import radarrRoutes from './modules/radarr/routes.js';
import sonarrRoutes from './modules/sonarr/routes.js';

// Images
import imageRoutes from './modules/images/routes.js';

// Global settings
import settingsRoutes from './modules/settings/routes.js';

// Sample collections
import samplesRoutes from './modules/samples/routes.js';

export async function buildApp(fastify: FastifyInstance): Promise<void> {
  fastify.decorate('config', config);

  const allowedOrigins = process.env.CORS_ORIGINS?.split(',') || ['http://localhost:5173', 'http://localhost:3000'];
  await fastify.register(cors, {
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-ACDB-Key'],
    exposedHeaders: ['Content-Type', 'Authorization'],
    preflight: true,
    strictPreflight: false,
  });

  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        scriptSrc: [
          "'self'",
          "'sha256-pkq1WG0fvNqhhPf9b8/++ANAA6tOhzwZ17RtfGFn3Ig='",
          "'sha256-DS97OS7uZmj3HONyxF0mkdle4qsonqV6aHwgjIrJ3V0='",
          "'sha256-ZswfTY7H35rbv8WC7NXBoiC7WNu86vSzCDChNWwZZDM='",
        ],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  });

  await fastify.register(sensible);
  await fastify.register(multipart, {
    limits: {
      fileSize: 5 * 1024 * 1024,
    },
  });
  await fastify.register(rateLimitPlugin);
  await fastify.register(prismaPlugin);
  await fastify.register(authPlugin);
  await fastify.register(jobsPlugin);

  fastify.addHook('onRequest', async (request) => {
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

  fastify.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    fastify.log.error({
      error: {
        message: error.message,
        stack: error.stack,
        code: (error as any).code,
        statusCode: error.statusCode,
      },
      request: {
        method: request.method,
        url: request.url,
      },
    });

    if ((error as any).code === 'NETWORK_ERROR' || (error instanceof TypeError && error.message.includes('fetch'))) {
      return reply.code(502).send({
        error: 'Network Error',
        message: error.message || 'Failed to connect to external service',
      });
    }

    const customError = error as any;
    if (customError.validation) {
      return reply.code(400).send({
        error: 'Validation Error',
        details: customError.validation,
      });
    }

    if (error.statusCode === 401 || error.name === 'UnauthorizedError') {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: error.message || 'Authentication required',
      });
    }

    const statusCode = error.statusCode || customError.status || 500;
    return reply.code(statusCode).send({
      error: error.name || 'Internal Server Error',
      message: error.message || 'An unexpected error occurred',
    });
  });

  fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  fastify.register(async function apiRoutes(api) {
    api.register(authRoutes, { prefix: '/auth' });
    api.register(usersRoutes, { prefix: '/users' });
    api.register(collectionsRoutes, { prefix: '/collections' });
    api.register(collectionProgressRoutes, { prefix: '/collections' });
    api.register(syncRoutes, { prefix: '/sync' });

    api.register(mdblistRoutes, { prefix: '/sources/mdblist' });
    api.register(traktRoutes, { prefix: '/sources/trakt' });

    api.register(embyRoutes, { prefix: '/emby' });
    api.register(radarrRoutes, { prefix: '/radarr' });
    api.register(sonarrRoutes, { prefix: '/sonarr' });

    api.register(jobsRoutes, { prefix: '/jobs' });

    api.register(imageRoutes, { prefix: '/images' });

    api.register(settingsRoutes, { prefix: '/settings' });

    api.register(samplesRoutes, { prefix: '/samples' });
  }, { prefix: '/api/v1' });

  // Serve static files and SPA fallback if dist folder exists
  const distPath = join(__dirname, '..', 'dist');
  if (existsSync(distPath)) {
    await fastify.register(staticFiles, {
      root: distPath,
      prefix: '/',
    });

    fastify.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
      if (request.url.startsWith('/api/')) {
        return reply.code(404).send({ error: 'Not Found' });
      }
      return reply.sendFile('index.html');
    });
  }
}

export default buildApp;
