/**
 * Trakt Source Browser Routes
 * Allows users to browse their Trakt lists, watchlist, and collection
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createTraktClient } from './client.js';
import type TraktClient from './client.js';

interface ListParams {
  listId: string;
}

interface LimitQuery {
  limit?: string;
}

interface TypeQuery {
  type?: string;
}

interface SearchQuery {
  q?: string;
  type?: string;
  limit?: string;
}

export default async function traktRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication
  fastify.addHook('preHandler', fastify.authenticate);

  // Helper to get client for current user
  const getClient = async (
    request: FastifyRequest,
    reply: FastifyReply,
    requireAuth = false
  ): Promise<TraktClient | null> => {
    const { trakt } = fastify.config.external;

    if (!trakt.clientId) {
      reply.code(503).send({
        error: 'Service Unavailable',
        message: 'Trakt integration not configured',
      });
      return null;
    }

    let accessToken: string | undefined;

    if (requireAuth) {
      const user = await fastify.prisma.user.findUnique({
        where: { id: request.user!.id },
        select: { traktAccessToken: true, traktExpiresAt: true },
      });

      if (!user?.traktAccessToken) {
        reply.code(400).send({
          error: 'Bad Request',
          message: 'Trakt account not connected. Please authorize in settings.',
        });
        return null;
      }

      // TODO: Check expiration and refresh if needed
      accessToken = user.traktAccessToken;
    }

    return createTraktClient(trakt.clientId, accessToken, trakt.baseUrl);
  };

  // Get user's lists (requires Trakt auth)
  fastify.get('/lists', async (request, reply) => {
    const client = await getClient(request, reply, true);
    if (!client) return;

    try {
      const lists = await client.getMyLists();
      return { lists };
    } catch (error) {
      const err = error as Error & { status?: number };
      if (err.status === 401) {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'Trakt token expired. Please reconnect your account.',
        });
      }
      return reply.code(502).send({
        error: 'External API Error',
        message: err.message,
      });
    }
  });

  // Get items in a user list
  fastify.get<{ Params: ListParams }>('/lists/:listId/items', async (request, reply) => {
    const { listId } = request.params;

    const client = await getClient(request, reply, true);
    if (!client) return;

    try {
      const items = await client.getListItems(listId);
      return { items, count: items.length };
    } catch (error) {
      const err = error as Error & { status?: number };
      if (err.status === 404) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'List not found',
        });
      }
      return reply.code(502).send({
        error: 'External API Error',
        message: err.message,
      });
    }
  });

  // Get user's watchlist
  fastify.get<{ Querystring: TypeQuery }>('/watchlist', async (request, reply) => {
    const { type } = request.query; // movies, shows, or null for all

    const client = await getClient(request, reply, true);
    if (!client) return;

    try {
      const items = await client.getWatchlist(type);
      return { items, count: items.length };
    } catch (error) {
      return reply.code(502).send({
        error: 'External API Error',
        message: (error as Error).message,
      });
    }
  });

  // Get user's collection
  fastify.get<{ Querystring: TypeQuery }>('/collection', async (request, reply) => {
    const { type = 'movies' } = request.query; // movies or shows

    const client = await getClient(request, reply, true);
    if (!client) return;

    try {
      const items = await client.getCollection(type);
      return { items, count: items.length };
    } catch (error) {
      return reply.code(502).send({
        error: 'External API Error',
        message: (error as Error).message,
      });
    }
  });

  // Get popular lists (public, no Trakt auth needed)
  fastify.get<{ Querystring: LimitQuery }>('/popular-lists', async (request, reply) => {
    const { limit = '20' } = request.query;

    const client = await getClient(request, reply, false);
    if (!client) return;

    try {
      const lists = await client.getPopularLists(parseInt(limit, 10));
      return { lists };
    } catch (error) {
      return reply.code(502).send({
        error: 'External API Error',
        message: (error as Error).message,
      });
    }
  });

  // Search lists (public)
  fastify.get<{ Querystring: SearchQuery }>('/search-lists', async (request, reply) => {
    const { q, limit = '20' } = request.query;

    if (!q || q.length < 2) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Query must be at least 2 characters',
      });
    }

    const client = await getClient(request, reply, false);
    if (!client) return;

    try {
      const lists = await client.searchLists(q, parseInt(limit, 10));
      return { lists };
    } catch (error) {
      return reply.code(502).send({
        error: 'External API Error',
        message: (error as Error).message,
      });
    }
  });

  // Search movies/shows
  fastify.get<{ Querystring: SearchQuery }>('/search', async (request, reply) => {
    const { q, type = 'movie,show', limit = '20' } = request.query;

    if (!q || q.length < 2) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Query must be at least 2 characters',
      });
    }

    const client = await getClient(request, reply, false);
    if (!client) return;

    try {
      const results = await client.search(q, type, parseInt(limit, 10));
      return { results };
    } catch (error) {
      return reply.code(502).send({
        error: 'External API Error',
        message: (error as Error).message,
      });
    }
  });

  // Get trending movies
  fastify.get<{ Querystring: LimitQuery }>('/trending/movies', async (request, reply) => {
    const { limit = '20' } = request.query;

    const client = await getClient(request, reply, false);
    if (!client) return;

    try {
      const movies = await client.getTrendingMovies(parseInt(limit, 10));
      return { movies };
    } catch (error) {
      return reply.code(502).send({
        error: 'External API Error',
        message: (error as Error).message,
      });
    }
  });

  // Get trending shows
  fastify.get<{ Querystring: LimitQuery }>('/trending/shows', async (request, reply) => {
    const { limit = '20' } = request.query;

    const client = await getClient(request, reply, false);
    if (!client) return;

    try {
      const shows = await client.getTrendingShows(parseInt(limit, 10));
      return { shows };
    } catch (error) {
      return reply.code(502).send({
        error: 'External API Error',
        message: (error as Error).message,
      });
    }
  });
}
