/**
 * Image Routes
 * Serves cached images with ETag support and conditional requests
 */

import { getCachedImageWithStats, cacheImage, validateFilename, getMetadata, getCacheStats, getCachedImageUrl } from '../../utils/image-cache.js';
import fs from 'fs/promises';
import path from 'path';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

const CACHE_DIR = process.env.IMAGE_CACHE_DIR || './data/image-cache';

const contentTypes: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

export default async function imageRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/debug', async () => {
    const stats = await getCacheStats();

    const sampleItems = await fastify.prisma.collectionItem.findMany({
      take: 10,
      where: {
        posterPath: { not: null },
      },
      select: {
        id: true,
        title: true,
        posterPath: true,
        tmdbId: true,
      },
    });

    let filesOnDisk: string[] = [];
    try {
      const files = await fs.readdir(CACHE_DIR);
      filesOnDisk = files.filter(f => !f.startsWith('.') && !f.endsWith('.tmp')).slice(0, 10);
    } catch {
      filesOnDisk = [];
    }

    const conversions = await Promise.all(
      sampleItems.map(async (item) => {
        const dbUrl = item.posterPath;
        const convertedUrl = dbUrl ? await getCachedImageUrl(dbUrl) : null;

        let fileExists = false;
        if (convertedUrl?.startsWith('/api/v1/images/cache/')) {
          const filename = convertedUrl.split('/').pop();
          if (filename) {
            try {
              await fs.access(path.join(CACHE_DIR, filename));
              fileExists = true;
            } catch {
              fileExists = false;
            }
          }
        }

        return {
          title: item.title,
          dbUrl: dbUrl?.substring(0, 60) + '...',
          convertedUrl,
          fileExists,
          urlChanged: dbUrl !== convertedUrl,
        };
      })
    );

    return {
      cacheStats: stats,
      filesOnDiskCount: filesOnDisk.length,
      sampleFiles: filesOnDisk,
      conversions,
      summary: {
        totalItemsWithPoster: sampleItems.length,
        convertedToCachedUrl: conversions.filter(c => c.urlChanged).length,
        filesExist: conversions.filter(c => c.fileExists).length,
      },
    };
  });

  fastify.get<{ Params: { filename: string } }>('/cache/:filename', async (request, reply) => {
    const { filename } = request.params;

    if (!validateFilename(filename)) {
      return reply.code(400).send({ error: 'Invalid filename' });
    }

    let imageData = await getCachedImageWithStats(filename);

    if (!imageData) {
      const metadata = await getMetadata(filename);

      if (metadata?.url && metadata.url.startsWith('https://image.tmdb.org/')) {
        // Try to cache the image on-demand
        try {
          const cachedFilename = await cacheImage(metadata.url);
          if (cachedFilename === filename) {
            imageData = await getCachedImageWithStats(filename);
          }
        } catch (err) {
          fastify.log.warn({ filename, url: metadata.url, error: (err as Error).message }, 'Failed to cache image on-demand');
        }
      }
    }

    if (!imageData) {
      fastify.log.warn({ filename }, 'Image not found and could not be cached');
      return reply.code(404).send({ error: 'Image not found or not yet cached' });
    }

    const { buffer, etag, lastModified } = imageData;

    const ifNoneMatch = request.headers['if-none-match'];
    const ifModifiedSince = request.headers['if-modified-since'];

    if (ifNoneMatch && ifNoneMatch === etag) {
      return reply
        .code(304)
        .header('ETag', etag)
        .header('Last-Modified', lastModified)
        .header('Cache-Control', 'public, max-age=31536000, immutable')
        .send();
    }

    if (ifModifiedSince && !ifNoneMatch) {
      const modifiedSince = new Date(ifModifiedSince);
      const fileModified = new Date(lastModified);
      if (fileModified <= modifiedSince) {
        return reply
          .code(304)
          .header('ETag', etag)
          .header('Last-Modified', lastModified)
          .header('Cache-Control', 'public, max-age=31536000, immutable')
          .send();
      }
    }

    const ext = filename.split('.').pop()?.toLowerCase();

    return reply
      .code(200)
      .header('Content-Type', ext ? contentTypes[ext] || 'image/jpeg' : 'image/jpeg')
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .header('ETag', etag)
      .header('Last-Modified', lastModified)
      .header('Content-Length', buffer.length)
      .send(buffer);
  });

  fastify.get<{ Querystring: { url?: string } }>('/proxy', async (request, reply) => {
    const { url } = request.query;

    if (!url) {
      return reply.code(400).send({ error: 'URL is required' });
    }

    try {
      new URL(url);
    } catch {
      return reply.code(400).send({ error: 'Invalid URL format' });
    }

    if (!url.startsWith('https://image.tmdb.org/')) {
      return reply.code(400).send({ error: 'Only TMDb images are allowed' });
    }

    try {
      const filename = await cacheImage(url);
      if (!filename) {
        return reply.code(502).send({ error: 'Failed to fetch image' });
      }

      const imageData = await getCachedImageWithStats(filename);
      if (!imageData) {
        return reply.code(500).send({ error: 'Failed to read cached image' });
      }

      const { buffer, etag, lastModified } = imageData;

      const ifNoneMatch = request.headers['if-none-match'];
      const ifModifiedSince = request.headers['if-modified-since'];

      if (ifNoneMatch && ifNoneMatch === etag) {
        return reply
          .code(304)
          .header('ETag', etag)
          .header('Last-Modified', lastModified)
          .header('Cache-Control', 'public, max-age=2592000')
          .send();
      }

      if (ifModifiedSince && !ifNoneMatch) {
        const modifiedSince = new Date(ifModifiedSince);
        const fileModified = new Date(lastModified);
        if (fileModified <= modifiedSince) {
          return reply
            .code(304)
            .header('ETag', etag)
            .header('Last-Modified', lastModified)
            .header('Cache-Control', 'public, max-age=2592000')
            .send();
        }
      }

      const ext = filename.split('.').pop()?.toLowerCase();

      return reply
        .code(200)
        .header('Content-Type', ext ? contentTypes[ext] || 'image/jpeg' : 'image/jpeg')
        .header('Cache-Control', 'public, max-age=2592000')
        .header('ETag', etag)
        .header('Last-Modified', lastModified)
        .header('Content-Length', buffer.length)
        .send(buffer);
    } catch (error) {
      fastify.log.error({ error }, 'Error proxying image');
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });
}
