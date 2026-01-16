import { z } from 'zod';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getCachedImageUrl, cacheImage, queueMissingImages } from '../../utils/image-cache.js';
import { syncCollections } from '../emby/sync-service.js';
import type { AppConfig } from '../../types/index.js';

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

// Types for helper functions
interface RefreshedItem {
  mediaType: string;
  title: string;
  year: number | null;
  imdbId: string | null;
  tmdbId: string | null;
  traktId: string | null;
  tvdbId: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  rating: number | null;
  ratingCount: number | null;
}

interface MDBListItem {
  imdb_id?: string;
  imdbid?: string;
  poster?: string;
  mediatype?: string;
  media_type?: string;
  title?: string;
  name?: string;
  year?: number;
  release_year?: number;
  tmdb_id?: number;
  id?: number;
  trakt_id?: number;
  tvdb_id?: number;
}

interface MDBListDetail {
  tmdbid?: number;
  traktid?: number;
  year?: number;
  score?: number;
  imdbrating?: number;
  imdbvotes?: number;
  poster?: string;
  backdrop?: string;
}

interface TraktItem {
  movie?: { title: string; year: number; ids: { imdb: string; tmdb: number; trakt: number; tvdb: number }; rating?: number; votes?: number };
  show?: { title: string; year: number; ids: { imdb: string; tmdb: number; trakt: number; tvdb: number }; rating?: number; votes?: number };
}

// Helper to check admin status for write operations
const requireAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!request.user || !request.user.isAdmin) {
    return reply.code(403).send({
      error: 'Forbidden',
      message: 'Admin access required',
    });
  }
};

export default async function collectionsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.authenticate);

  // List all collections (global)
  fastify.get('/', async () => {
    const collections = await fastify.prisma.collection.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { items: true },
        },
        embyServers: true,
      },
    });

    const collectionsWithCachedPosters = await Promise.all(
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

    return collectionsWithCachedPosters;
  });

  // Create collection (admin only)
  fastify.post('/', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const validation = createCollectionSchema.safeParse(request.body);
    if (!validation.success) {
      return reply.code(400).send({
        error: 'Validation Error',
        details: validation.error.flatten().fieldErrors,
      });
    }

    const {
      name,
      description,
      sourceType,
      sourceId,
      sourceUrl,
      refreshIntervalHours,
      syncToEmbyOnRefresh,
      removeFromEmby,
      embyServerIds,
    } = validation.data;

    const requiresSourceId = ['MDBLIST', 'TRAKT_LIST'].includes(sourceType);
    if (requiresSourceId && !sourceId) {
      return reply.code(400).send({
        error: 'Validation Error',
        message: 'sourceId is required for this collection type',
      });
    }

    if (sourceId) {
      const existing = await fastify.prisma.collection.findFirst({
        where: {
          sourceType,
          sourceId,
        },
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
        name,
        description,
        sourceType,
        sourceId,
        sourceUrl,
        refreshIntervalHours,
        syncToEmbyOnRefresh,
        removeFromEmby,
        ...(embyServerIds && embyServerIds.length > 0 ? {
          embyServers: {
            create: embyServerIds.map((embyServerId) => ({ embyServerId })),
          },
        } : {}),
      },
      include: {
        embyServers: true,
      },
    });

    // Trigger background refresh for non-manual collections (don't await)
    if (sourceType !== 'MANUAL') {
      setImmediate(() => {
        refreshCollectionInBackground(fastify, collection.id, sourceType, sourceId, syncToEmbyOnRefresh)
          .catch(err => fastify.log.warn(`Background refresh failed for collection ${collection.id}: ${(err as Error).message}`));
      });
    }

    return reply.code(201).send(collection);
  });

  // Get single collection with items
  fastify.get<{ Params: CollectionParams }>('/:id', async (request, reply) => {
    const { id } = request.params;

    const collection = await fastify.prisma.collection.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: { addedAt: 'desc' },
        },
        embyServers: true,
      },
    });

    if (!collection) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Collection not found',
      });
    }

    const itemsWithCachedImages = await Promise.all(
      collection.items.map(async (item) => {
        const posterPath = item.posterPath ? await getCachedImageUrl(item.posterPath) : null;
        const backdropPath = item.backdropPath ? await getCachedImageUrl(item.backdropPath) : null;
        return {
          ...item,
          posterPath,
          backdropPath,
        };
      })
    );

    queueMissingImages(fastify.prisma).catch(err =>
      fastify.log.warn('Failed to queue missing images:', err.message)
    );

    let posterPath = collection.posterPath;
    if (posterPath && posterPath.startsWith('https://image.tmdb.org/')) {
      posterPath = await getCachedImageUrl(posterPath);
    }

    return {
      ...collection,
      items: itemsWithCachedImages,
      posterPath,
    };
  });

  // Update collection (admin only)
  fastify.patch<{ Params: CollectionParams }>('/:id', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params;

    const validation = updateCollectionSchema.safeParse(request.body);
    if (!validation.success) {
      return reply.code(400).send({
        error: 'Validation Error',
        details: validation.error.flatten().fieldErrors,
      });
    }

    const existing = await fastify.prisma.collection.findUnique({
      where: { id },
    });

    if (!existing) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Collection not found',
      });
    }

    const collection = await fastify.prisma.collection.update({
      where: { id },
      data: {
        ...validation.data,
        ...(validation.data.embyServerIds ? {
          embyServers: {
            deleteMany: {},
            create: validation.data.embyServerIds.map((embyServerId) => ({ embyServerId })),
          },
        } : {}),
      },
      include: {
        embyServers: true,
      },
    });

    return collection;
  });

  // Delete collection (admin only)
  fastify.delete<{ Params: CollectionParams }>('/:id', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params;

    const existing = await fastify.prisma.collection.findUnique({
      where: { id },
    });

    if (!existing) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Collection not found',
      });
    }

    await fastify.prisma.collection.delete({
      where: { id },
    });

    return reply.code(204).send();
  });

  // Force refresh collection from source (runs in background for real-time updates)
  fastify.post<{ Params: CollectionParams }>('/:id/refresh', async (request, reply) => {
    const { id } = request.params;

    const collection = await fastify.prisma.collection.findUnique({
      where: { id },
    });

    if (!collection) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Collection not found',
      });
    }

    if (collection.sourceType === 'MANUAL') {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Manual collections cannot be refreshed from source',
      });
    }

    // Delete existing items first so frontend sees the refresh starting
    await fastify.prisma.collectionItem.deleteMany({
      where: { collectionId: id },
    });

    // Start background refresh and return immediately for real-time UI updates
    setImmediate(() => {
      refreshCollectionInBackground(
        fastify,
        id,
        collection.sourceType,
        collection.sourceId || undefined,
        collection.syncToEmbyOnRefresh
      ).catch(err => fastify.log.error(`Refresh failed for collection ${id}: ${(err as Error).message}`));
    });

    return {
      success: true,
      message: 'Refresh started - items will be added progressively',
      lastSyncAt: new Date().toISOString(),
    };
  });

  // Add item to manual collection (admin only)
  fastify.post<{ Params: CollectionParams; Body: AddItemBody }>('/:id/items', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params;
    const { mediaType, title, year, imdbId, tmdbId, traktId, tvdbId } = request.body;

    const collection = await fastify.prisma.collection.findUnique({
      where: { id },
    });

    if (!collection) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Collection not found',
      });
    }

    if (!mediaType || !title) {
      return reply.code(400).send({
        error: 'Validation Error',
        message: 'mediaType and title are required',
      });
    }

    const item = await fastify.prisma.collectionItem.create({
      data: {
        collectionId: id,
        mediaType,
        title,
        year,
        imdbId,
        tmdbId,
        traktId,
        tvdbId,
      },
    });

    return reply.code(201).send(item);
  });

  // Remove item from collection (admin only)
  fastify.delete<{ Params: ItemParams }>('/:id/items/:itemId', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { id, itemId } = request.params;

    const collection = await fastify.prisma.collection.findUnique({
      where: { id },
    });

    if (!collection) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Collection not found',
      });
    }

    await fastify.prisma.collectionItem.delete({
      where: { id: itemId, collectionId: id },
    });

    return reply.code(204).send();
  });

  // Get collection stats
  fastify.get<{ Params: CollectionParams }>('/:id/stats', async (request, reply) => {
    const { id } = request.params;

    const collection = await fastify.prisma.collection.findUnique({
      where: { id },
    });

    if (!collection) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Collection not found',
      });
    }

    const [total, inEmby, missing] = await Promise.all([
      fastify.prisma.collectionItem.count({ where: { collectionId: id } }),
      fastify.prisma.collectionItem.count({ where: { collectionId: id, inEmby: true } }),
      fastify.prisma.collectionItem.count({ where: { collectionId: id, inEmby: false } }),
    ]);

    return {
      total,
      inEmby,
      missing,
      percentInLibrary: total > 0 ? Math.round((inEmby / total) * 100) : 0,
    };
  });

  // Get missing items
  fastify.get<{ Params: CollectionParams }>('/:id/missing', async (request, reply) => {
    const { id } = request.params;

    const collection = await fastify.prisma.collection.findUnique({
      where: { id },
    });

    if (!collection) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Collection not found',
      });
    }

    const items = await fastify.prisma.collectionItem.findMany({
      where: { collectionId: id, inEmby: false },
      orderBy: { rating: 'desc' },
    });

    const itemsWithCachedImages = await Promise.all(
      items.map(async (item) => {
        const posterPath = item.posterPath ? await getCachedImageUrl(item.posterPath) : null;
        const backdropPath = item.backdropPath ? await getCachedImageUrl(item.backdropPath) : null;
        return {
          ...item,
          posterPath,
          backdropPath,
        };
      })
    );

    return { items: itemsWithCachedImages, count: itemsWithCachedImages.length };
  });

  // Upload collection poster (admin only)
  fastify.post<{ Params: CollectionParams }>('/:id/poster', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params;

    const collection = await fastify.prisma.collection.findUnique({
      where: { id },
    });

    if (!collection) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Collection not found',
      });
    }

    const data = await request.file();
    if (!data) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'No file uploaded',
      });
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(data.mimetype)) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Invalid file type. Only JPEG, PNG, and WebP are allowed.',
      });
    }

    const ext = data.mimetype.split('/')[1];
    const filename = `${id}.${ext}`;
    const filepath = `uploads/posters/${filename}`;

    const { pipeline } = await import('stream/promises');
    const { createWriteStream } = await import('fs');
    await pipeline(data.file, createWriteStream(filepath));

    const updated = await fastify.prisma.collection.update({
      where: { id },
      data: { posterPath: `/api/v1/collections/${id}/poster` },
    });

    return {
      success: true,
      posterPath: updated.posterPath,
    };
  });

  // Get collection poster
  fastify.get<{ Params: CollectionParams }>('/:id/poster', async (request, reply) => {
    const { id } = request.params;

    const collection = await fastify.prisma.collection.findUnique({
      where: { id },
    });

    if (!collection || !collection.posterPath) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Poster not found',
      });
    }

    const { readdir } = await import('fs/promises');
    const files = await readdir('uploads/posters');
    const posterFile = files.find((f) => f.startsWith(id));

    if (!posterFile) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Poster file not found',
      });
    }

    const { createReadStream } = await import('fs');
    const ext = posterFile.split('.').pop();
    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
    };

    reply.header('Content-Type', mimeTypes[ext || ''] || 'image/jpeg');
    return reply.send(createReadStream(`uploads/posters/${posterFile}`));
  });

  // Delete collection poster (admin only)
  fastify.delete<{ Params: CollectionParams }>('/:id/poster', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params;

    const collection = await fastify.prisma.collection.findUnique({
      where: { id },
    });

    if (!collection) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Collection not found',
      });
    }

    const { readdir, unlink } = await import('fs/promises');
    try {
      const files = await readdir('uploads/posters');
      const posterFile = files.find((f) => f.startsWith(id));
      if (posterFile) {
        await unlink(`uploads/posters/${posterFile}`);
      }
    } catch (err) {
      // Ignore file not found errors
    }

    await fastify.prisma.collection.update({
      where: { id },
      data: { posterPath: null },
    });

    return reply.code(204).send();
  });
}

// Helper functions for refreshing from external sources
async function refreshFromMdblist(
  listId: string,
  apiKey: string | undefined,
  config: AppConfig
): Promise<RefreshedItem[]> {
  if (!apiKey) {
    throw new Error('MDBList API key not configured');
  }

  try {
    const response = await fetch(
      `${config.external.mdblist.baseUrl}/lists/${listId}/items?apikey=${apiKey}`
    );

    if (!response.ok) {
      throw new Error(`MDBList API error: ${response.status}`);
    }

    const data = await response.json();

    let items: MDBListItem[];
    if (Array.isArray(data)) {
      items = data;
    } else if (data.items && Array.isArray(data.items)) {
      items = data.items;
    } else if (data.movies && Array.isArray(data.movies)) {
      items = data.movies;
    } else if (data.shows && Array.isArray(data.shows)) {
      items = data.shows;
    } else {
      console.error('MDBList unexpected response:', JSON.stringify(data).slice(0, 500));
      throw new Error(`MDBList API returned unexpected format`);
    }

    console.log(`MDBList: Got ${items.length} items, fetching details one-by-one...`);

    const enrichedItems: RefreshedItem[] = [];

    // Fetch items one-by-one instead of in batches
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item) continue;

      try {
        const enrichedItem = await fetchMdblistItemDetails(item, apiKey, config);
        enrichedItems.push(enrichedItem);

        // Log progress every 50 items
        if (enrichedItems.length % 50 === 0) {
          console.log(`MDBList: Enriched ${enrichedItems.length}/${items.length} items`);
        }

        // Small delay between items to avoid overwhelming the API
        if (i < items.length - 1) {
          await new Promise(r => setTimeout(r, 50));
        }
      } catch (err) {
        console.warn(`Failed to enrich item ${i}:`, (err as Error).message);
        // Continue with next item instead of failing
      }
    }

    const withPosters = enrichedItems.filter(item => item.posterPath);
    const withoutPosters = enrichedItems.filter(item => !item.posterPath);
    console.log(`MDBList: Successfully enriched ${enrichedItems.length} items (${withPosters.length} with posters, ${withoutPosters.length} without)`);
    return enrichedItems;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      const networkError = new Error(
        `Network error: Failed to connect to MDBList API at ${config.external.mdblist.baseUrl}`
      );
      throw networkError;
    }
    throw error;
  }
}

async function fetchMdblistItemDetails(
  item: MDBListItem,
  apiKey: string,
  config: AppConfig
): Promise<RefreshedItem> {
  const imdbId = item.imdb_id || item.imdbid;

  let basicPosterPath: string | null = null;
  if (item.poster) {
    if (item.poster.startsWith('http')) {
      basicPosterPath = item.poster.replace('/original/', '/w500/').replace('/w500/', '/w500/');
    } else {
      basicPosterPath = `https://image.tmdb.org/t/p/w500${item.poster}`;
    }
  }

  const result: RefreshedItem = {
    mediaType: (item.mediatype || item.media_type) === 'movie' ? 'MOVIE' : 'SHOW',
    title: item.title || item.name || '',
    year: item.year || item.release_year || null,
    imdbId: imdbId || null,
    tmdbId: (item.tmdb_id || item.id)?.toString() || null,
    traktId: item.trakt_id?.toString() || null,
    tvdbId: item.tvdb_id?.toString() || null,
    posterPath: basicPosterPath,
    backdropPath: null,
    rating: null,
    ratingCount: null,
  };

  if (imdbId) {
    try {
      let detailResponse: Response;
      try {
        detailResponse = await fetch(`https://mdblist.com/api/?apikey=${apiKey}&i=${imdbId}`);
      } catch (fetchError) {
        if (fetchError instanceof TypeError && fetchError.message.includes('fetch')) {
          console.warn(`Network error fetching details for ${imdbId}:`, (fetchError as Error).message);
          return result;
        }
        throw fetchError;
      }

      if (detailResponse.ok) {
        const detail = (await detailResponse.json()) as MDBListDetail;

        result.tmdbId = detail.tmdbid?.toString() || result.tmdbId;
        result.traktId = detail.traktid?.toString() || result.traktId;
        result.year = detail.year || result.year;
        result.rating = detail.score || detail.imdbrating || null;
        result.ratingCount = detail.imdbvotes || null;

        if (detail.poster) {
          const tmdbPosterUrl = detail.poster.startsWith('http')
            ? detail.poster.replace('/original/', '/w500/').replace('/w500/', '/w500/')
            : `https://image.tmdb.org/t/p/w500${detail.poster}`;
          result.posterPath = tmdbPosterUrl;
          cacheImage(tmdbPosterUrl).catch(() => {});
        }

        if (detail.backdrop) {
          const tmdbBackdropUrl = detail.backdrop.startsWith('http')
            ? detail.backdrop
            : `https://image.tmdb.org/t/p/w1280${detail.backdrop}`;
          result.backdropPath = tmdbBackdropUrl;
          cacheImage(tmdbBackdropUrl).catch(err =>
            console.warn(`Failed to cache backdrop ${tmdbBackdropUrl}:`, err.message)
          );
        }
      }
    } catch (err) {
      console.warn(`Failed to fetch details for ${imdbId}:`, (err as Error).message);
    }
  }

  if (!result.posterPath && result.tmdbId) {
    const tmdbPoster = await fetchTmdbPoster(result.tmdbId, result.mediaType);
    if (tmdbPoster) {
      result.posterPath = tmdbPoster;
    }
  }

  if (!result.posterPath && result.title) {
    const tmdbPoster = await searchTmdbByTitle(result.title, result.mediaType, result.year);
    if (tmdbPoster) {
      result.posterPath = tmdbPoster;
      result.tmdbId = tmdbPoster.split('/').pop()?.split('-')[0] || result.tmdbId;
    }
  }

  if (result.posterPath) {
    cacheImage(result.posterPath).catch(() => {});
  }

  return result;
}

let lastTmdbApiCallTime = 0;
const TMDB_API_DELAY_MS = 300;

async function waitForTmdbRateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastCall = now - lastTmdbApiCallTime;
  if (timeSinceLastCall < TMDB_API_DELAY_MS) {
    await new Promise(resolve => setTimeout(resolve, TMDB_API_DELAY_MS - timeSinceLastCall));
  }
  lastTmdbApiCallTime = Date.now();
}

async function fetchTmdbPoster(tmdbId: string, mediaType: string): Promise<string | null> {
  const tmdbApiKey = process.env.TMDB_API_KEY;
  if (!tmdbApiKey) {
    return null;
  }

  try {
    await waitForTmdbRateLimit();
    const type = mediaType === 'SHOW' ? 'tv' : 'movie';
    const response = await fetch(
      `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${tmdbApiKey}`
    );

    if (response.ok) {
      const data = (await response.json()) as { poster_path?: string };
      if (data.poster_path) {
        return `https://image.tmdb.org/t/p/w500${data.poster_path}`;
      }
    }
  } catch (err) {
    console.warn(`TMDB API error for ${tmdbId}:`, (err as Error).message);
  }

  return null;
}

async function searchTmdbByTitle(title: string, mediaType: string, year: number | null): Promise<string | null> {
  const tmdbApiKey = process.env.TMDB_API_KEY;
  if (!tmdbApiKey) {
    console.warn('TMDB_API_KEY not configured, cannot search by title');
    return null;
  }

  try {
    await waitForTmdbRateLimit();
    const type = mediaType === 'SHOW' ? 'tv' : 'movie';
    let searchUrl = `https://api.themoviedb.org/3/search/${type}?api_key=${tmdbApiKey}&query=${encodeURIComponent(title)}`;
    if (year) {
      searchUrl += `&year=${year}`;
    }

    const response = await fetch(searchUrl);

    if (response.ok) {
      const data = (await response.json()) as { results?: Array<{ poster_path?: string; id?: number; title?: string }> };
      const results = data.results;

      if (results && results.length > 0) {
        for (const result of results) {
          if (result.poster_path) {
            const posterUrl = `https://image.tmdb.org/t/p/w500${result.poster_path}`;
            console.log(`TMDB search found poster for "${title}": ${result.title || 'unknown'}`);
            return posterUrl;
          }
        }
        if (results.length > 0) {
          console.warn(`TMDB search found ${results.length} results for "${title}" but none had posters`);
        }
      } else {
        console.warn(`TMDB search found no results for "${title}"`);
      }
    } else {
      console.warn(`TMDB search failed for "${title}": ${response.status} ${response.statusText}`);
    }
  } catch (err) {
    console.warn(`TMDB search error for "${title}":`, (err as Error).message);
  }

  return null;
}

async function refreshFromTrakt(
  collection: { sourceType: string; sourceId: string | null },
  settings: { traktAccessToken: string | null } | null,
  config: AppConfig
): Promise<RefreshedItem[]> {
  if (!settings?.traktAccessToken) {
    throw new Error('Trakt not connected. Admin must authorize in settings.');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'trakt-api-version': '2',
    'trakt-api-key': config.external.trakt.clientId || '',
    'Authorization': `Bearer ${settings.traktAccessToken}`,
  };

  let endpoint: string;
  switch (collection.sourceType) {
    case 'TRAKT_WATCHLIST':
      endpoint = '/users/me/watchlist';
      break;
    case 'TRAKT_COLLECTION':
      endpoint = '/users/me/collection';
      break;
    case 'TRAKT_LIST':
      endpoint = `/users/me/lists/${collection.sourceId}/items`;
      break;
    default:
      throw new Error(`Unknown source type: ${collection.sourceType}`);
  }

  let response: Response;
  try {
    response = await fetch(`${config.external.trakt.baseUrl}${endpoint}`, { headers });
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(
        `Network error: Failed to connect to Trakt API at ${config.external.trakt.baseUrl}`
      );
    }
    throw error;
  }

  if (!response.ok) {
    throw new Error(`Trakt API error: ${response.status}`);
  }

  const data = (await response.json()) as TraktItem[];

  if (!Array.isArray(data)) {
    throw new Error(`Trakt API returned unexpected data type: ${typeof data}. Expected array.`);
  }

  return data.map((item) => {
    const media = item.movie || item.show;
    const tmdbId = media?.ids?.tmdb?.toString();

    return {
      mediaType: item.movie ? 'MOVIE' : 'SHOW',
      title: media?.title || '',
      year: media?.year || null,
      imdbId: media?.ids?.imdb || null,
      tmdbId: tmdbId || null,
      traktId: media?.ids?.trakt?.toString() || null,
      tvdbId: media?.ids?.tvdb?.toString() || null,
      posterPath: null,
      backdropPath: null,
      rating: media?.rating || null,
      ratingCount: media?.votes || null,
    };
  });
}

// Background refresh helper - runs async without blocking request
async function refreshCollectionInBackground(
  fastify: FastifyInstance,
  collectionId: string,
  sourceType: string,
  sourceId: string | undefined,
  syncToEmbyOnRefresh: boolean
): Promise<void> {
  try {
    const settings = await fastify.prisma.settings.findUnique({
      where: { id: 'singleton' },
    });
    const mdblistApiKey = settings?.mdblistApiKey || fastify.config.external.mdblist.apiKey;

    let totalItems = 0;

    // For MDBList, fetch items one-by-one for progressive population
    if (sourceType === 'MDBLIST') {
      totalItems = await refreshMdblistProgressive(
        fastify,
        collectionId,
        sourceId!,
        mdblistApiKey,
        syncToEmbyOnRefresh
      );
    } else if (['TRAKT_LIST', 'TRAKT_WATCHLIST', 'TRAKT_COLLECTION'].includes(sourceType)) {
      const collection = await fastify.prisma.collection.findUnique({
        where: { id: collectionId },
      });
      if (collection) {
        const items = await refreshFromTrakt(collection, settings, fastify.config);
        if (items.length > 0) {
          await fastify.prisma.collectionItem.createMany({
            data: items.map((item) => ({
              collectionId,
              ...item,
            })),
          });
          totalItems = items.length;
        }
      }
    }

    if (totalItems > 0) {
      await fastify.prisma.collection.update({
        where: { id: collectionId },
        data: { lastSyncAt: new Date() },
      });

      if (syncToEmbyOnRefresh) {
        await syncCollections({
          prisma: fastify.prisma,
          collectionId,
        });
      }

      fastify.log.info(`Background refresh completed for collection ${collectionId}: ${totalItems} items`);
    }
  } catch (error) {
    fastify.log.error(`Background refresh failed for collection ${collectionId}: ${(error as Error).message}`);
  }
}

// Progressive refresh for MDBList - adds items one by one
async function refreshMdblistProgressive(
  fastify: FastifyInstance,
  collectionId: string,
  listId: string,
  apiKey: string | undefined,
  syncToEmbyOnRefresh: boolean
): Promise<number> {
  if (!apiKey) {
    throw new Error('MDBList API key not configured');
  }

  try {
    const response = await fetch(
      `${fastify.config.external.mdblist.baseUrl}/lists/${listId}/items?apikey=${apiKey}`
    );

    if (!response.ok) {
      throw new Error(`MDBList API error: ${response.status}`);
    }

    const data = await response.json();

    let items: MDBListItem[];
    if (Array.isArray(data)) {
      items = data;
    } else if (data.items && Array.isArray(data.items)) {
      items = data.items;
    } else if (data.movies && Array.isArray(data.movies)) {
      items = data.movies;
    } else if (data.shows && Array.isArray(data.shows)) {
      items = data.shows;
    } else {
      throw new Error(`MDBList API returned unexpected format`);
    }

    fastify.log.info(`MDBList: Starting progressive fetch of ${items.length} items for collection ${collectionId}`);

    let addedCount = 0;
    const seenTmdbIds = new Set<string>();

    // Process items one by one
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item) continue;

      // Check if collection still exists (might have been deleted)
      if (i % 50 === 0) {
        const collectionExists = await fastify.prisma.collection.findUnique({
          where: { id: collectionId },
          select: { id: true },
        });
        if (!collectionExists) {
          fastify.log.info(`Collection ${collectionId} was deleted, stopping refresh`);
          return addedCount;
        }
      }

      try {
        const enrichedItem = await fetchMdblistItemDetails(item, apiKey, fastify.config);

        // Skip duplicates (same tmdbId in the list)
        if (enrichedItem.tmdbId && seenTmdbIds.has(enrichedItem.tmdbId)) {
          continue;
        }
        if (enrichedItem.tmdbId) {
          seenTmdbIds.add(enrichedItem.tmdbId);
        }

        // For items with tmdbId, use upsert to handle duplicates
        // For items without tmdbId, use create (they can't be duplicates by tmdbId)
        if (enrichedItem.tmdbId) {
          await fastify.prisma.collectionItem.upsert({
            where: {
              collectionId_tmdbId: {
                collectionId,
                tmdbId: enrichedItem.tmdbId,
              },
            },
            create: {
              collectionId,
              ...enrichedItem,
            },
            update: {
              ...enrichedItem,
            },
          });
        } else {
          await fastify.prisma.collectionItem.create({
            data: {
              collectionId,
              ...enrichedItem,
            },
          });
        }

        addedCount++;

        // Log progress every 10 items
        if (addedCount % 10 === 0) {
          fastify.log.debug(`MDBList: Added ${addedCount}/${items.length} items to collection ${collectionId}`);
        }

        // Small delay between items to avoid overwhelming the API/database
        if (i < items.length - 1) {
          await new Promise(r => setTimeout(r, 50));
        }
      } catch (itemError) {
        const errorMsg = (itemError as Error).message;
        // Only log if it's not a foreign key error (collection deleted)
        if (!errorMsg.includes('Foreign key')) {
          fastify.log.warn(`Failed to add item ${i + 1} to collection ${collectionId}: ${errorMsg}`);
        } else {
          fastify.log.info(`Collection ${collectionId} was deleted, stopping refresh`);
          return addedCount;
        }
      }
    }

    fastify.log.info(`MDBList: Successfully added ${addedCount}/${items.length} items to collection ${collectionId}`);
    return addedCount;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      const networkError = new Error(
        `Network error: Failed to connect to MDBList API at ${fastify.config.external.mdblist.baseUrl}`
      );
      throw networkError;
    }
    throw error;
  }
}
