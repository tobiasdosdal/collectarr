/**
 * Media Server Routes Factory
 * Generates standard CRUD routes for media servers
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { requireAdmin } from '../../shared/middleware/index.js';
import { MediaServerService } from './service.js';
import type {
  ServerConfig,
  ServerBody,
  TestConnectionBody,
  ServerParams,
  ServerClient,
  ClientFactory,
} from './types.js';

/**
 * Register standard server CRUD routes
 */
export function registerServerRoutes<T extends ServerClient>(
  fastify: FastifyInstance,
  config: ServerConfig,
  createClient: ClientFactory<T>
): MediaServerService<T> {
  const service = new MediaServerService(fastify, config, createClient);

  // GET /servers - List all servers
  fastify.get('/servers', async () => {
    return service.listServers();
  });

  // GET /servers/:id - Get server details
  fastify.get<{ Params: ServerParams }>('/servers/:id', async (request, reply) => {
    const result = await service.getServer(request.params.id);
    if (!result) {
      return reply.code(404).send({
        error: 'Not Found',
        message: `${config.serviceName} server not found`,
      });
    }
    return result;
  });

  // POST /servers - Add a new server (admin only)
  fastify.post<{ Body: ServerBody }>('/servers', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const result = await service.createServer(request.body);
    if (!result.success) {
      return reply.code(result.statusCode || 400).send({
        error: result.statusCode === 500 ? 'Internal Server Error' : 'Bad Request',
        message: result.error,
      });
    }
    return reply.code(201).send(result.server);
  });

  // POST /servers/test - Test server connection
  fastify.post<{ Body: TestConnectionBody }>('/servers/test', async (request, reply) => {
    const { url, apiKey } = request.body;
    if (!url || !apiKey) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'url and apiKey are required',
      });
    }
    return service.testConnection(url, apiKey);
  });

  // PATCH /servers/:id - Update server config (admin only)
  fastify.patch<{ Params: ServerParams; Body: ServerBody }>('/servers/:id', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const result = await service.updateServer(request.params.id, request.body);
    if (!result.success) {
      return reply.code(result.statusCode || 400).send({
        error: result.statusCode === 404 ? 'Not Found' :
               result.statusCode === 500 ? 'Internal Server Error' : 'Bad Request',
        message: result.error,
      });
    }
    return result.server;
  });

  // DELETE /servers/:id - Remove server (admin only)
  fastify.delete<{ Params: ServerParams }>('/servers/:id', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const result = await service.deleteServer(request.params.id);
    if (!result.success) {
      return reply.code(result.statusCode || 400).send({
        error: 'Not Found',
        message: result.error,
      });
    }
    return reply.code(204).send();
  });

  // GET /servers/:id/profiles - Get quality profiles (if supported)
  if (config.supportsProfiles) {
    fastify.get<{ Params: ServerParams }>('/servers/:id/profiles', async (request, reply) => {
      const result = await service.getProfiles(request.params.id);
      if (!result.success) {
        return reply.code(result.statusCode || 400).send({
          error: result.statusCode === 404 ? 'Not Found' :
                 result.statusCode === 502 ? 'Bad Gateway' : 'Internal Server Error',
          message: result.error,
        });
      }
      return result.profiles;
    });
  }

  // GET /servers/:id/rootfolders - Get root folders (if supported)
  if (config.supportsRootFolders) {
    fastify.get<{ Params: ServerParams }>('/servers/:id/rootfolders', async (request, reply) => {
      const result = await service.getRootFolders(request.params.id);
      if (!result.success) {
        return reply.code(result.statusCode || 400).send({
          error: result.statusCode === 404 ? 'Not Found' :
                 result.statusCode === 502 ? 'Bad Gateway' : 'Internal Server Error',
          message: result.error,
        });
      }
      return result.folders;
    });
  }

  return service;
}
