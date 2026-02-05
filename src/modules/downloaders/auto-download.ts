import type { PrismaClient } from '@prisma/client';
import { decryptApiKey } from '../../utils/api-key-crypto.js';
import { createRadarrClient } from '../radarr/client.js';
import { createSonarrClient } from '../sonarr/client.js';
import { createTMDbClient } from '../external/tmdb/client.js';
import type { AppConfig } from '../../types/index.js';

export interface AutoDownloadStats {
  added: number;
  skipped: number;
  alreadyExists: number;
  failed: number;
  missingIds: number;
}

export async function autoDownloadCollectionItems(
  prisma: PrismaClient,
  config: AppConfig,
  collectionId: string
): Promise<AutoDownloadStats> {
  const stats: AutoDownloadStats = {
    added: 0,
    skipped: 0,
    alreadyExists: 0,
    failed: 0,
    missingIds: 0,
  };

  const [collection, settings, radarrServer, sonarrServer] = await Promise.all([
    prisma.collection.findUnique({
      where: { id: collectionId },
      select: { id: true, name: true },
    }),
    prisma.settings.findUnique({
      where: { id: 'singleton' },
      select: { tmdbApiKey: true },
    }),
    prisma.radarrServer.findFirst({
      where: { isDefault: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.sonarrServer.findFirst({
      where: { isDefault: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  if (!collection) {
    return stats;
  }

  const radarr = radarrServer
    ? createRadarrClient(radarrServer.url, decryptApiKey(radarrServer.apiKey, radarrServer.apiKeyIv))
    : null;
  const sonarr = sonarrServer
    ? createSonarrClient(sonarrServer.url, decryptApiKey(sonarrServer.apiKey, sonarrServer.apiKeyIv))
    : null;

  const tmdbApiKey = settings?.tmdbApiKey || config.external.tmdb.apiKey;
  const tmdbClient = tmdbApiKey ? createTMDbClient(config, tmdbApiKey) : null;

  const items = await prisma.collectionItem.findMany({
    where: { collectionId, inEmby: false },
    select: {
      id: true,
      mediaType: true,
      title: true,
      year: true,
      tmdbId: true,
      tvdbId: true,
      imdbId: true,
    },
  });

  for (const item of items) {
    try {
      if (item.mediaType === 'MOVIE') {
        if (!radarr || !radarrServer) {
          stats.skipped += 1;
          continue;
        }

        const tmdbId = item.tmdbId ? parseInt(item.tmdbId, 10) : null;
        if (!tmdbId) {
          stats.missingIds += 1;
          continue;
        }

        const existing = await radarr.getMovieByTmdbId(tmdbId);
        if (existing) {
          stats.alreadyExists += 1;
          continue;
        }

        const profileId = radarrServer.qualityProfileId;
        const rootFolderPath = radarrServer.rootFolderPath;
        if (!profileId || !rootFolderPath) {
          stats.skipped += 1;
          continue;
        }

        const movieYear = item.year ?? 0;
        await radarr.addMovie({
          tmdbId,
          title: item.title,
          year: movieYear,
          qualityProfileId: profileId,
          rootFolderPath,
          addOptions: {
            searchForMovie: true,
            addMethod: 'manual',
            monitor: 'movieOnly',
          },
        });

        stats.added += 1;
        continue;
      }

      if (item.mediaType === 'SHOW') {
        if (!sonarr || !sonarrServer) {
          stats.skipped += 1;
          continue;
        }

        let tvdbId = item.tvdbId ? parseInt(item.tvdbId, 10) : null;
        if (!tvdbId && tmdbClient) {
          if (item.tmdbId) {
            const details = await tmdbClient.getShow(item.tmdbId);
            tvdbId = details.external_ids?.tvdb_id || null;
          } else if (item.imdbId) {
            const result = await tmdbClient.findByExternalId(item.imdbId, 'imdb_id');
            if (result.shows.length > 0) {
              const details = await tmdbClient.getShow(result.shows[0]!.id);
              tvdbId = details.external_ids?.tvdb_id || null;
            }
          }
        }

        if (!tvdbId) {
          stats.missingIds += 1;
          continue;
        }

        const existing = await sonarr.getSeriesByTvdbId(tvdbId);
        if (existing) {
          stats.alreadyExists += 1;
          continue;
        }

        const profileId = sonarrServer.qualityProfileId;
        const rootFolderPath = sonarrServer.rootFolderPath;
        if (!profileId || !rootFolderPath) {
          stats.skipped += 1;
          continue;
        }

        const seriesYear = item.year ?? 0;
        await sonarr.addSeries({
          tvdbId,
          title: item.title,
          year: seriesYear,
          qualityProfileId: profileId,
          rootFolderPath,
          monitored: true,
          seasonFolder: true,
          addOptions: {
            monitor: 'all',
            searchForMissingEpisodes: true,
            ignoreEpisodesWithFiles: false,
            ignoreEpisodesWithoutFiles: false,
            searchForCutoffUnmetEpisodes: false,
          },
        });

        stats.added += 1;
      }
    } catch {
      stats.failed += 1;
    }
  }

  return stats;
}
