/**
 * MDBList Source Browser Routes
 * Allows users to search and browse MDBList lists
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createMDBListClient } from './client.js';
import type MDBListClient from './client.js';

interface SearchQuery {
  q?: string;
}

interface TopQuery {
  limit?: string;
}

interface ListParams {
  listId: string;
}

interface MediaSearchQuery {
  q?: string;
  type?: string;
}

export default async function mdblistRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication
  fastify.addHook('preHandler', fastify.authenticate);

  // Helper to get client for current user
  const getClient = async (request: FastifyRequest, reply: FastifyReply): Promise<MDBListClient | null> => {
    const settings = await fastify.prisma.settings.findUnique({
      where: { id: 'singleton' },
      select: { mdblistApiKey: true },
    });

    const apiKey = settings?.mdblistApiKey || fastify.config.external.mdblist.apiKey;

    if (!apiKey) {
      reply.code(400).send({
        error: 'Bad Request',
        message: 'MDBList API key not configured. Add your key in settings.',
      });
      return null;
    }

    return createMDBListClient(apiKey, fastify.config.external.mdblist.baseUrl);
  };

  // Search for lists
  fastify.get<{ Querystring: SearchQuery }>('/search', async (request, reply) => {
    const { q } = request.query;

    if (!q || q.length < 2) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Query must be at least 2 characters',
      });
    }

    const client = await getClient(request, reply);
    if (!client) return;

    try {
      const lists = await client.searchLists(q);
      return { lists };
    } catch (error) {
      return reply.code(502).send({
        error: 'External API Error',
        message: (error as Error).message,
      });
    }
  });

  // Get top/popular lists
  fastify.get<{ Querystring: TopQuery }>('/top', async (request, reply) => {
    const { limit = '20' } = request.query;

    const client = await getClient(request, reply);
    if (!client) return;

    try {
      const lists = await client.getTopLists(parseInt(limit, 10));
      return { lists };
    } catch (error) {
      return reply.code(502).send({
        error: 'External API Error',
        message: (error as Error).message,
      });
    }
  });

  // Get user's own lists
  fastify.get('/my-lists', async (request, reply) => {
    const client = await getClient(request, reply);
    if (!client) return;

    try {
      const lists = await client.getMyLists();
      return { lists };
    } catch (error) {
      return reply.code(502).send({
        error: 'External API Error',
        message: (error as Error).message,
      });
    }
  });

  // Get list info
  fastify.get<{ Params: ListParams }>('/lists/:listId', async (request, reply) => {
    const { listId } = request.params;

    const client = await getClient(request, reply);
    if (!client) return;

    try {
      const info = await client.getListInfo(listId);
      return info;
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

  // Get list items (preview)
  fastify.get<{ Params: ListParams }>('/lists/:listId/items', async (request, reply) => {
    const { listId } = request.params;

    const client = await getClient(request, reply);
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

  // Search media (movies/shows)
  fastify.get<{ Querystring: MediaSearchQuery }>('/media/search', async (request, reply) => {
    const { q, type } = request.query;

    if (!q || q.length < 2) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Query must be at least 2 characters',
      });
    }

    const client = await getClient(request, reply);
    if (!client) return;

    try {
      const results = await client.searchMedia(q, type as 'MOVIE' | 'SHOW' | undefined);
      return { results };
    } catch (error) {
      return reply.code(502).send({
        error: 'External API Error',
        message: (error as Error).message,
      });
    }
  });
}
