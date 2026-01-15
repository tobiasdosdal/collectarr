/**
 * Image Routes
 * Serves cached images with ETag support and conditional requests
 */

import { getCachedImage, getCachedImageWithStats, cacheImage, validateFilename, getMetadata, getCacheStats, getCachedImageUrl } from '../../utils/image-cache.js';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const CACHE_DIR = process.env.IMAGE_CACHE_DIR || './data/image-cache';

export default async function imageRoutes(fastify, opts) {
  // Diagnostic endpoint to check cache status
  fastify.get('/debug', async (request, reply) => {
    const stats = await getCacheStats();
    
    // Get a sample of collection items to check their posterPath values
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
    
    // Check if cache files actually exist
    let filesOnDisk = [];
    try {
      const files = await fs.readdir(CACHE_DIR);
      filesOnDisk = files.filter(f => !f.startsWith('.') && !f.endsWith('.tmp')).slice(0, 10);
    } catch (e) {
      filesOnDisk = [];
    }
    
    // Test getCachedImageUrl conversion for each sample item
    const conversions = await Promise.all(
      sampleItems.map(async (item) => {
        const dbUrl = item.posterPath;
        const convertedUrl = await getCachedImageUrl(dbUrl);
        
        // Check if the cached file exists
        let fileExists = false;
        if (convertedUrl?.startsWith('/api/v1/images/cache/')) {
          const filename = convertedUrl.split('/').pop();
          try {
            await fs.access(path.join(CACHE_DIR, filename));
            fileExists = true;
          } catch {
            fileExists = false;
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
  // Serve cached image by filename with conditional request support
  fastify.get('/cache/:filename', async (request, reply) => {
    const { filename } = request.params;

    // Validate filename to prevent path traversal attacks
    if (!validateFilename(filename)) {
      return reply.code(400).send({ error: 'Invalid filename' });
    }

    // Get image with stats for ETag generation
    let imageData = await getCachedImageWithStats(filename);
    
    // If image not found, try to find the original URL from metadata and cache it synchronously
    if (!imageData) {
      const metadata = await getMetadata(filename);
      
      if (metadata?.url && metadata.url.startsWith('https://image.tmdb.org/')) {
        // Try to cache it synchronously (might be in queue or failed before)
        const cachedFilename = await cacheImage(metadata.url);
        if (cachedFilename === filename) {
          imageData = await getCachedImageWithStats(filename);
        }
      }
    }
    
    if (!imageData) {
      return reply.code(404).send({ error: 'Image not found or not yet cached' });
    }

    const { buffer, etag, lastModified } = imageData;

    // Check conditional request headers
    const ifNoneMatch = request.headers['if-none-match'];
    const ifModifiedSince = request.headers['if-modified-since'];

    // If ETag matches, return 304 Not Modified
    if (ifNoneMatch && ifNoneMatch === etag) {
      return reply
        .code(304)
        .header('ETag', etag)
        .header('Last-Modified', lastModified)
        .header('Cache-Control', 'public, max-age=31536000, immutable')
        .send();
    }

    // If not modified since specified date, return 304
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

    // Determine content type from extension
    const ext = filename.split('.').pop()?.toLowerCase();
    const contentTypes = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      gif: 'image/gif',
    };

    // Send full response with cache headers
    return reply
      .code(200)
      .header('Content-Type', contentTypes[ext] || 'image/jpeg')
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .header('ETag', etag)
      .header('Last-Modified', lastModified)
      .header('Content-Length', buffer.length)
      .send(buffer);
  });

  // Proxy and cache external image with enhanced caching
  fastify.get('/proxy', async (request, reply) => {
    const { url } = request.query;

    if (!url) {
      return reply.code(400).send({ error: 'URL is required' });
    }

    // Validate URL format
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch (error) {
      return reply.code(400).send({ error: 'Invalid URL format' });
    }

    // Only allow TMDb images (security measure)
    if (!url.startsWith('https://image.tmdb.org/')) {
      return reply.code(400).send({ error: 'Only TMDb images are allowed' });
    }

    try {
      // Cache the image (will reuse existing if valid)
      const filename = await cacheImage(url);
      if (!filename) {
        return reply.code(502).send({ error: 'Failed to fetch image' });
      }

      // Get image with stats for proper caching headers
      const imageData = await getCachedImageWithStats(filename);
      if (!imageData) {
        return reply.code(500).send({ error: 'Failed to read cached image' });
      }

      const { buffer, etag, lastModified } = imageData;

      // Check conditional request headers
      const ifNoneMatch = request.headers['if-none-match'];
      const ifModifiedSince = request.headers['if-modified-since'];

      // If ETag matches, return 304 Not Modified
      if (ifNoneMatch && ifNoneMatch === etag) {
        return reply
          .code(304)
          .header('ETag', etag)
          .header('Last-Modified', lastModified)
          .header('Cache-Control', 'public, max-age=2592000') // 30 days for proxied images
          .send();
      }

      // If not modified since specified date, return 304
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

      // Determine content type from extension
      const ext = filename.split('.').pop()?.toLowerCase();
      const contentTypes = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
        gif: 'image/gif',
      };

      // Send full response with cache headers
      // Note: shorter cache time than direct cache access since proxied images might change
      return reply
        .code(200)
        .header('Content-Type', contentTypes[ext] || 'image/jpeg')
        .header('Cache-Control', 'public, max-age=2592000') // 30 days
        .header('ETag', etag)
        .header('Last-Modified', lastModified)
        .header('Content-Length', buffer.length)
        .send(buffer);
    } catch (error) {
      fastify.log.error('Error proxying image:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });
}
