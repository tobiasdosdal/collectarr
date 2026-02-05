import type { PrismaClient } from '@prisma/client';
import type { JobQueue } from './job-queue.js';
import type { Job } from './job-types.js';
import { fetchTmdbPoster, fetchTmdbBackdrop, fetchTmdbRating } from '../utils/tmdb-api.js';
import { cacheImage } from '../utils/image-cache.js';
import { withRetry } from '../utils/retry.js';
import { handleNetworkError } from '../utils/error-handling.js';
import { createLogger } from '../utils/runtime-logger.js';
import type { AppConfig } from '../types/index.js';

export interface EnrichItemJobData {
  itemId: string;
  collectionId: string;
  imdbId?: string;
  tmdbId?: string;
  mediaType: string;
}

interface MDBListItemDetails {
  score?: number;
  imdbrating?: number;
  imdbvotes?: number;
  poster?: string;
  backdrop?: string;
}

const MAX_ENRICHMENT_ATTEMPTS = 3;
const API_CALL_DELAY_MS = 100;

export class ItemEnrichmentJob {
  private static readonly log = createLogger('jobs.enrichment');

  static registerWithQueue(
    queue: JobQueue,
    prisma: PrismaClient,
    config: AppConfig
  ): void {
    queue.registerHandler('enrich-item', async (job: Job) => {
      const data = job.data as EnrichItemJobData;
      await ItemEnrichmentJob.handleEnrichment(data, prisma, config);
    });
  }

  private static async handleEnrichment(
    data: EnrichItemJobData,
    prisma: PrismaClient,
    config: AppConfig
  ): Promise<void> {
    const { itemId, imdbId, tmdbId, mediaType } = data;

    try {
      const settings = await prisma.settings.findUnique({
        where: { id: 'singleton' },
        select: {
          mdblistApiKey: true,
          tmdbApiKey: true,
        },
      });

      const mdblistApiKey = settings?.mdblistApiKey || config.external.mdblist.apiKey;
      const tmdbApiKey = settings?.tmdbApiKey || config.external.tmdb.apiKey;

      const item = await prisma.collectionItem.findUnique({
        where: { id: itemId },
      });

      if (!item) {
        throw new Error(`Item not found: ${itemId}`);
      }

      const updateData: Record<string, unknown> = {
        enrichmentAttempts: item.enrichmentAttempts + 1,
      };

      if (imdbId) {
        try {
          const mdblistData = await ItemEnrichmentJob.fetchMDBListData(imdbId, mdblistApiKey);
          if (mdblistData) {
            Object.assign(updateData, mdblistData);
          }
        } catch (error) {
          ItemEnrichmentJob.log.warn('MDBList enrichment failed for item', {
            itemId,
            error: (error as Error).message,
          });
        }
      }

      if (tmdbId && (!updateData.posterPath || !updateData.backdropPath)) {
        try {
          const tmdbData = await ItemEnrichmentJob.fetchTMDBData(tmdbId, mediaType, tmdbApiKey);
          Object.assign(updateData, tmdbData);
        } catch (error) {
          ItemEnrichmentJob.log.warn('TMDB enrichment failed for item', {
            itemId,
            tmdbId,
            error: (error as Error).message,
          });
        }
      }

      if (updateData.posterPath && typeof updateData.posterPath === 'string') {
        try {
          await ItemEnrichmentJob.cacheImageWithDelay(updateData.posterPath);
        } catch (error) {
          ItemEnrichmentJob.log.warn('Failed to cache poster during enrichment', {
            itemId,
            error: (error as Error).message,
          });
        }
      }

      if (updateData.backdropPath && typeof updateData.backdropPath === 'string') {
        try {
          await ItemEnrichmentJob.cacheImageWithDelay(updateData.backdropPath);
        } catch (error) {
          ItemEnrichmentJob.log.warn('Failed to cache backdrop during enrichment', {
            itemId,
            error: (error as Error).message,
          });
        }
      }

      await prisma.collectionItem.update({
        where: { id: itemId },
        data: {
          ...updateData,
          enrichmentStatus: 'ENRICHED',
          enrichedAt: new Date(),
          lastEnrichmentError: null,
        },
      });

      ItemEnrichmentJob.log.debug('Successfully enriched item', { itemId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      const attempts = await prisma.collectionItem.findUnique({
        where: { id: data.itemId },
        select: { enrichmentAttempts: true },
      });

      const newAttempts = (attempts?.enrichmentAttempts ?? 0) + 1;
      const status = newAttempts >= MAX_ENRICHMENT_ATTEMPTS ? 'FAILED' : 'PENDING';

      await prisma.collectionItem.update({
        where: { id: data.itemId },
        data: {
          enrichmentAttempts: newAttempts,
          lastEnrichmentError: errorMessage,
          enrichmentStatus: status,
        },
      });

      if (status === 'FAILED') {
        ItemEnrichmentJob.log.error('Item enrichment failed after max attempts', {
          itemId: data.itemId,
          attempts: MAX_ENRICHMENT_ATTEMPTS,
          error: errorMessage,
        });
      }

      throw error;
    }
  }

  private static async fetchMDBListData(
    imdbId: string,
    apiKey: string | undefined
  ): Promise<Record<string, unknown> | null> {
    if (!apiKey) {
      return null;
    }

    try {
      const url = `https://mdblist.com/api/?apikey=${apiKey}&i=${imdbId}`;

      const data = await withRetry(
        async () => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
          
          try {
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!response.ok) {
              throw new Error(`MDBList API error: ${response.status} ${response.statusText}`);
            }

            return response.json() as Promise<MDBListItemDetails>;
          } catch (error) {
            clearTimeout(timeoutId);
            throw error;
          }
        },
        {
          maxRetries: 2,
          retryableStatusCodes: [408, 429, 500, 502, 503, 504],
        }
      );

      const enrichedData: Record<string, unknown> = {};

      if (data.poster) {
        enrichedData.posterPath = `https://image.tmdb.org/t/p/w500${data.poster}`;
      }

      if (data.backdrop) {
        enrichedData.backdropPath = `https://image.tmdb.org/t/p/w1280${data.backdrop}`;
      }

      if (data.imdbrating !== undefined) {
        enrichedData.rating = Math.round(data.imdbrating * 10);
      } else if (data.score !== undefined) {
        enrichedData.rating = Math.round(data.score * 10);
      }

      if (data.imdbvotes !== undefined) {
        enrichedData.ratingCount = data.imdbvotes;
      }

      return enrichedData;
    } catch (error) {
      handleNetworkError(error, 'MDBList', 'https://mdblist.com/api/');
      return null;
    }
  }

  private static async fetchTMDBData(
    tmdbId: string,
    mediaType: string,
    apiKey: string | undefined
  ): Promise<Record<string, unknown>> {
    const enrichedData: Record<string, unknown> = {};

    const poster = await ItemEnrichmentJob.fetchWithDelay(() =>
      fetchTmdbPoster(tmdbId, mediaType, apiKey)
    );
    if (poster) {
      enrichedData.posterPath = poster;
    }

    const backdrop = await ItemEnrichmentJob.fetchWithDelay(() =>
      fetchTmdbBackdrop(tmdbId, mediaType, apiKey)
    );
    if (backdrop) {
      enrichedData.backdropPath = backdrop;
    }

    const ratingData = await ItemEnrichmentJob.fetchWithDelay(() =>
      fetchTmdbRating(tmdbId, mediaType, apiKey)
    );
    if (ratingData.rating !== null) {
      enrichedData.rating = ratingData.rating;
    }
    if (ratingData.ratingCount !== null) {
      enrichedData.ratingCount = ratingData.ratingCount;
    }

    return enrichedData;
  }

  private static async fetchWithDelay<T>(
    fn: () => Promise<T>
  ): Promise<T> {
    await new Promise((resolve) => setTimeout(resolve, API_CALL_DELAY_MS));
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error('API call timeout after 15s')), 15000)
      ),
    ]);
  }

  private static async cacheImageWithDelay(url: string): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, API_CALL_DELAY_MS));
    await cacheImage(url);
  }
}

export default ItemEnrichmentJob;
