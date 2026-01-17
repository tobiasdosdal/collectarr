/**
 * Sonarr Server Management Routes
 * Handles Sonarr server configuration and TV series requests
 * Uses the media-servers factory for common CRUD operations
 */

import type { FastifyInstance } from 'fastify';
import SonarrClient, { createSonarrClient } from './client.js';
import { registerServerRoutes } from '../media-servers/index.js';

interface ServerParams {
  id: string;
}

interface LookupQuery {
  term?: string;
  tvdbId?: string;
}

interface AddSeriesBody {
  tvdbId: number;
  title: string;
  year: number;
  qualityProfileId?: number;
  rootFolderPath?: string;
  searchForMissingEpisodes?: boolean;
  seriesType?: string;
}

// Wrapper to match the ClientFactory type signature
function createClient(url: string, apiKey: string): SonarrClient | null {
  return createSonarrClient(url, apiKey);
}

export default async function sonarrRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication
  fastify.addHook('onRequest', fastify.authenticate);

  // Register common server CRUD routes using the factory
  const service = registerServerRoutes(fastify, {
    serviceName: 'Sonarr',
    modelName: 'sonarrServer',
    supportsProfiles: true,
    supportsRootFolders: true,
  }, createClient);

  // =========================================================================
  // Sonarr-specific routes below
  // =========================================================================

  /**
   * GET /sonarr/servers/:id/lookup - Search for series
   */
  fastify.get<{ Params: ServerParams; Querystring: LookupQuery }>('/servers/:id/lookup', async (request, reply) => {
    const { client, error, statusCode } = await service.getClient(request.params.id);
    if (!client) {
      return reply.code(statusCode || 500).send({
        error: statusCode === 404 ? 'Not Found' : 'Internal Server Error',
        message: error,
      });
    }

    const { term, tvdbId } = request.query;

    if (tvdbId) {
      const series = await client.lookupSeriesByTvdbId(parseInt(tvdbId, 10));
      return series ? [series] : [];
    }

    if (term) {
      return client.lookupSeries(term);
    }

    return reply.code(400).send({
      error: 'Bad Request',
      message: 'Either term or tvdbId is required',
    });
  });

  /**
   * POST /sonarr/servers/:id/add - Add series to Sonarr
   */
  fastify.post<{ Params: ServerParams; Body: AddSeriesBody }>('/servers/:id/add', async (request, reply) => {
    const { client, server, error, statusCode } = await service.getClient(request.params.id);
    if (!client || !server) {
      return reply.code(statusCode || 500).send({
        error: statusCode === 404 ? 'Not Found' : 'Internal Server Error',
        message: error,
      });
    }

    const { tvdbId, title, year, qualityProfileId, rootFolderPath, searchForMissingEpisodes, seriesType } = request.body;

    if (!tvdbId || !title) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'tvdbId and title are required',
      });
    }

    // Use server defaults if not provided
    const profileId = qualityProfileId || server.qualityProfileId;
    const folderPath = rootFolderPath || server.rootFolderPath;

    if (!profileId || !folderPath) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'qualityProfileId and rootFolderPath are required (set defaults on server or provide in request)',
      });
    }

    // Check if already in library
    const existingSeries = await client.getSeriesByTvdbId(tvdbId);
    if (existingSeries) {
      return reply.code(409).send({
        error: 'Conflict',
        message: 'Series already exists in Sonarr',
        series: {
          id: existingSeries.id,
          title: existingSeries.title,
          statistics: existingSeries.statistics,
        },
      });
    }

    try {
      const series = await client.addSeries({
        tvdbId,
        title,
        year,
        qualityProfileId: profileId,
        rootFolderPath: folderPath,
        seriesType: seriesType || 'standard',
        addOptions: {
          ignoreEpisodesWithFiles: false,
          ignoreEpisodesWithoutFiles: false,
          monitor: 'all',
          searchForMissingEpisodes: searchForMissingEpisodes !== false,
          searchForCutoffUnmetEpisodes: false,
        },
      });

      return reply.code(201).send({
        success: true,
        series: {
          id: series.id,
          title: series.title,
          year: series.year,
          tvdbId: series.tvdbId,
          monitored: series.monitored,
        },
      });
    } catch (err) {
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: (err as Error).message,
      });
    }
  });

  /**
   * GET /sonarr/servers/:id/series - Get all series in Sonarr library
   */
  fastify.get<{ Params: ServerParams }>('/servers/:id/series', async (request, reply) => {
    const { client, error, statusCode } = await service.getClient(request.params.id);
    if (!client) {
      return reply.code(statusCode || 500).send({
        error: statusCode === 404 ? 'Not Found' : 'Internal Server Error',
        message: error,
      });
    }

    const series = await client.getSeries();
    return series.map(s => ({
      id: s.id,
      title: s.title,
      year: s.year,
      tvdbId: s.tvdbId,
      imdbId: s.imdbId,
    }));
  });

  /**
   * GET /sonarr/servers/:id/series/:tvdbId - Check if series exists in Sonarr
   */
  fastify.get<{ Params: ServerParams & { tvdbId: string } }>('/servers/:id/series/:tvdbId', async (request, reply) => {
    const { client, error, statusCode } = await service.getClient(request.params.id);
    if (!client) {
      return reply.code(statusCode || 500).send({
        error: statusCode === 404 ? 'Not Found' : 'Internal Server Error',
        message: error,
      });
    }

    const tvdbId = parseInt(request.params.tvdbId, 10);
    const series = await client.getSeriesByTvdbId(tvdbId);

    if (!series) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Series not found in Sonarr',
        inSonarr: false,
      });
    }

    return {
      inSonarr: true,
      series: {
        id: series.id,
        title: series.title,
        year: series.year,
        tvdbId: series.tvdbId,
        monitored: series.monitored,
        statistics: series.statistics,
      },
    };
  });
}
