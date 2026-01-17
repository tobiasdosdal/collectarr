/**
 * Collection Management Routes
 * Handles collection CRUD and refresh operations
 */

import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { getCachedImageUrl, queueMissingImages } from '../../utils/image-cache.js';
import { syncCollections } from '../emby/sync-service.js';
import { requireAdmin } from '../../shared/middleware/index.js';
import { createCollectionService } from './service.js';

const createCollectionSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  sourceType: z.enum(['MDBLIST', 'TRAKT_LIST', 'TRAKT_WATCHLIST', 'TRAKT_COLLECTION', 'MANUAL']),
  sourceId: z.string().optional(),
  sourceUrl: z.string().optional(),
  refreshIntervalHours: z.number().min(1).max(8760).default(24).transform((value) => Math.floor(value)),
  syncToEmbyOnRefresh: z.boolean().default(true),
  removeFromEmby: z.boolean().default(true),
  embyServerIds: z.array(z.string()).optional(),
});

const updateCollectionSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  isEnabled: z.boolean().optional(),
  refreshIntervalHours: z.number().min(1).max(8760).optional(),
  syncToEmbyOnRefresh: z.boolean().optional(),
  removeFromEmby: z.boolean().optional(),
  embyServerIds: z.array(z.string()).optional(),
});

interface CollectionParams {
  id: string;
}

interface ItemParams {
  id: string;
  itemId: string;
}

interface AddItemBody {
  mediaType: string;
  title: string;
  year?: number;
  imdbId?: string;
  tmdbId?: string;
  traktId?: string;
  tvdbId?: string;
}

export default async function collectionsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.authenticate);

  const collectionService = createCollectionService(fastify);

  // List all collections
  fastify.get('/', async () => {
    const collections = await fastify.prisma.collection.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { items: true } },
        embyServers: true,
      },
    });

    return Promise.all(
      collections.map(async (c) => {
        const { _count, embyServers, ...collection } = c;
        let posterPath = collection.posterPath;
        if (posterPath && posterPath.startsWith('https://image.tmdb.org/')) {
          posterPath = await getCachedImageUrl(posterPath);
        }
        return {
          ...collection,
          itemCount: _count.items,
          posterPath,
          embyServerIds: embyServers.map(server => server.embyServerId),
        };
      })
    );
  });

  // Create collection (admin only)
  fastify.post('/', { preHandler: [requireAdmin] }, async (request, reply) => {
    const validation = createCollectionSchema.safeParse(request.body);
    if (!validation.success) {
      return reply.code(400).send({
        error: 'Validation Error',
        details: validation.error.flatten().fieldErrors,
      });
    }

    const { name, description, sourceType, sourceId, sourceUrl, refreshIntervalHours, syncToEmbyOnRefresh, removeFromEmby, embyServerIds } = validation.data;

    if (['MDBLIST', 'TRAKT_LIST'].includes(sourceType) && !sourceId) {
      return reply.code(400).send({
        error: 'Validation Error',
        message: 'sourceId is required for this collection type',
      });
    }

    if (sourceId) {
      const existing = await fastify.prisma.collection.findFirst({
        where: { sourceType, sourceId },
      });
      if (existing) {
        return reply.code(409).send({
          error: 'Conflict',
          message: 'This collection already exists',
        });
      }
    }

    const collection = await fastify.prisma.collection.create({
      data: {
        name, description, sourceType, sourceId, sourceUrl, refreshIntervalHours, syncToEmbyOnRefresh, removeFromEmby,
        ...(embyServerIds?.length ? {
          embyServers: { create: embyServerIds.map((embyServerId) => ({ embyServerId })) },
        } : {}),
      },
      include: { embyServers: true },
    });

    // Trigger background refresh for non-manual collections
    if (sourceType !== 'MANUAL') {
      setImmediate(() => {
        collectionService.refreshCollection(collection.id, sourceType, sourceId, syncToEmbyOnRefresh)
          .catch(err => fastify.log.warn(`Background refresh failed for collection ${collection.id}: ${(err as Error).message}`));
      });
    }

    return reply.code(201).send(collection);
  });

  // Get single collection with items
  fastify.get<{ Params: CollectionParams }>('/:id', async (request, reply) => {
    const collection = await fastify.prisma.collection.findUnique({
      where: { id: request.params.id },
      include: { items: { orderBy: { addedAt: 'desc' } }, embyServers: true },
    });

    if (!collection) {
      return reply.code(404).send({ error: 'Not Found', message: 'Collection not found' });
    }

    const itemsWithCachedImages = await Promise.all(
      collection.items.map(async (item) => ({
        ...item,
        posterPath: item.posterPath ? await getCachedImageUrl(item.posterPath) : null,
        backdropPath: item.backdropPath ? await getCachedImageUrl(item.backdropPath) : null,
      }))
    );

    queueMissingImages(fastify.prisma).catch(err => fastify.log.warn('Failed to queue missing images:', err.message));

    let posterPath = collection.posterPath;
    if (posterPath?.startsWith('https://image.tmdb.org/')) {
      posterPath = await getCachedImageUrl(posterPath);
    }

    return { ...collection, items: itemsWithCachedImages, posterPath };
  });

  // Update collection (admin only)
  fastify.patch<{ Params: CollectionParams }>('/:id', { preHandler: [requireAdmin] }, async (request, reply) => {
    const validation = updateCollectionSchema.safeParse(request.body);
    if (!validation.success) {
      return reply.code(400).send({ error: 'Validation Error', details: validation.error.flatten().fieldErrors });
    }

    const existing = await fastify.prisma.collection.findUnique({ where: { id: request.params.id } });
    if (!existing) {
      return reply.code(404).send({ error: 'Not Found', message: 'Collection not found' });
    }

    const collection = await fastify.prisma.collection.update({
      where: { id: request.params.id },
      data: {
        ...validation.data,
        ...(validation.data.embyServerIds ? {
          embyServers: {
            deleteMany: {},
            create: validation.data.embyServerIds.map((embyServerId) => ({ embyServerId })),
          },
        } : {}),
      },
      include: { embyServers: true },
    });

    return collection;
  });

  // Delete collection (admin only)
  fastify.delete<{ Params: CollectionParams }>('/:id', { preHandler: [requireAdmin] }, async (request, reply) => {
    const existing = await fastify.prisma.collection.findUnique({ where: { id: request.params.id } });
    if (!existing) {
      return reply.code(404).send({ error: 'Not Found', message: 'Collection not found' });
    }

    await fastify.prisma.collection.delete({ where: { id: request.params.id } });
    return reply.code(204).send();
  });

  // Force refresh collection from source
  fastify.post<{ Params: CollectionParams }>('/:id/refresh', async (request, reply) => {
    const collection = await fastify.prisma.collection.findUnique({ where: { id: request.params.id } });

    if (!collection) {
      return reply.code(404).send({ error: 'Not Found', message: 'Collection not found' });
    }

    if (collection.sourceType === 'MANUAL') {
      return reply.code(400).send({ error: 'Bad Request', message: 'Manual collections cannot be refreshed from source' });
    }

    // Delete existing items first
    await fastify.prisma.collectionItem.deleteMany({ where: { collectionId: request.params.id } });

    // Start background refresh
    setImmediate(() => {
      collectionService.refreshCollection(request.params.id, collection.sourceType, collection.sourceId || undefined, collection.syncToEmbyOnRefresh)
        .catch(err => fastify.log.error(`Refresh failed for collection ${request.params.id}: ${(err as Error).message}`));
    });

    return { success: true, message: 'Refresh started - items will be added progressively', lastSyncAt: new Date().toISOString() };
  });

  // Add item to manual collection (admin only)
  fastify.post<{ Params: CollectionParams; Body: AddItemBody }>('/:id/items', { preHandler: [requireAdmin] }, async (request, reply) => {
    const collection = await fastify.prisma.collection.findUnique({ where: { id: request.params.id } });
    if (!collection) {
      return reply.code(404).send({ error: 'Not Found', message: 'Collection not found' });
    }

    const { mediaType, title, year, imdbId, tmdbId, traktId, tvdbId } = request.body;
    if (!mediaType || !title) {
      return reply.code(400).send({ error: 'Validation Error', message: 'mediaType and title are required' });
    }

    const item = await fastify.prisma.collectionItem.create({
      data: { collectionId: request.params.id, mediaType, title, year, imdbId, tmdbId, traktId, tvdbId },
    });

    return reply.code(201).send(item);
  });

  // Remove item from collection (admin only)
  fastify.delete<{ Params: ItemParams }>('/:id/items/:itemId', { preHandler: [requireAdmin] }, async (request, reply) => {
    const collection = await fastify.prisma.collection.findUnique({ where: { id: request.params.id } });
    if (!collection) {
      return reply.code(404).send({ error: 'Not Found', message: 'Collection not found' });
    }

    await fastify.prisma.collectionItem.delete({ where: { id: request.params.itemId, collectionId: request.params.id } });
    return reply.code(204).send();
  });

  // Get collection stats
  fastify.get<{ Params: CollectionParams }>('/:id/stats', async (request, reply) => {
    const collection = await fastify.prisma.collection.findUnique({ where: { id: request.params.id } });
    if (!collection) {
      return reply.code(404).send({ error: 'Not Found', message: 'Collection not found' });
    }

    const [total, inEmby, missing] = await Promise.all([
      fastify.prisma.collectionItem.count({ where: { collectionId: request.params.id } }),
      fastify.prisma.collectionItem.count({ where: { collectionId: request.params.id, inEmby: true } }),
      fastify.prisma.collectionItem.count({ where: { collectionId: request.params.id, inEmby: false } }),
    ]);

    return { total, inEmby, missing, percentInLibrary: total > 0 ? Math.round((inEmby / total) * 100) : 0 };
  });

  // Get missing items
  fastify.get<{ Params: CollectionParams }>('/:id/missing', async (request, reply) => {
    const collection = await fastify.prisma.collection.findUnique({ where: { id: request.params.id } });
    if (!collection) {
      return reply.code(404).send({ error: 'Not Found', message: 'Collection not found' });
    }

    const items = await fastify.prisma.collectionItem.findMany({
      where: { collectionId: request.params.id, inEmby: false },
      orderBy: { rating: 'desc' },
    });

    const itemsWithCachedImages = await Promise.all(
      items.map(async (item) => ({
        ...item,
        posterPath: item.posterPath ? await getCachedImageUrl(item.posterPath) : null,
        backdropPath: item.backdropPath ? await getCachedImageUrl(item.backdropPath) : null,
      }))
    );

    return { items: itemsWithCachedImages, count: itemsWithCachedImages.length };
  });

  // Upload collection poster (admin only)
  fastify.post<{ Params: CollectionParams }>('/:id/poster', { preHandler: [requireAdmin] }, async (request, reply) => {
    const collection = await fastify.prisma.collection.findUnique({ where: { id: request.params.id } });
    if (!collection) {
      return reply.code(404).send({ error: 'Not Found', message: 'Collection not found' });
    }

    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ error: 'Bad Request', message: 'No file uploaded' });
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(data.mimetype)) {
      return reply.code(400).send({ error: 'Bad Request', message: 'Invalid file type. Only JPEG, PNG, and WebP are allowed.' });
    }

    const ext = data.mimetype.split('/')[1];
    const filename = `${request.params.id}.${ext}`;
    const filepath = `uploads/posters/${filename}`;

    const { pipeline } = await import('stream/promises');
    const { createWriteStream } = await import('fs');
    await pipeline(data.file, createWriteStream(filepath));

    const updated = await fastify.prisma.collection.update({
      where: { id: request.params.id },
      data: { posterPath: `/api/v1/collections/${request.params.id}/poster` },
    });

    return { success: true, posterPath: updated.posterPath };
  });

  // Get collection poster
  fastify.get<{ Params: CollectionParams }>('/:id/poster', async (request, reply) => {
    const collection = await fastify.prisma.collection.findUnique({ where: { id: request.params.id } });
    if (!collection?.posterPath) {
      return reply.code(404).send({ error: 'Not Found', message: 'Poster not found' });
    }

    const { readdir } = await import('fs/promises');
    const files = await readdir('uploads/posters');
    const posterFile = files.find((f) => f.startsWith(request.params.id));

    if (!posterFile) {
      return reply.code(404).send({ error: 'Not Found', message: 'Poster file not found' });
    }

    const { createReadStream } = await import('fs');
    const ext = posterFile.split('.').pop();
    const mimeTypes: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

    reply.header('Content-Type', mimeTypes[ext || ''] || 'image/jpeg');
    return reply.send(createReadStream(`uploads/posters/${posterFile}`));
  });

  // Delete collection poster (admin only)
  fastify.delete<{ Params: CollectionParams }>('/:id/poster', { preHandler: [requireAdmin] }, async (request, reply) => {
    const collection = await fastify.prisma.collection.findUnique({ where: { id: request.params.id } });
    if (!collection) {
      return reply.code(404).send({ error: 'Not Found', message: 'Collection not found' });
    }

    const { readdir, unlink } = await import('fs/promises');
    try {
      const files = await readdir('uploads/posters');
      const posterFile = files.find((f) => f.startsWith(request.params.id));
      if (posterFile) {
        await unlink(`uploads/posters/${posterFile}`);
      }
    } catch {
      // Ignore file not found errors
    }

    await fastify.prisma.collection.update({ where: { id: request.params.id }, data: { posterPath: null } });
    return reply.code(204).send();
  });
}
