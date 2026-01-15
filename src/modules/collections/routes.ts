import { z } from 'zod';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getCachedImageUrl, cacheImage, queueMissingImages } from '../../utils/image-cache.js';
import type { AppConfig } from '../../types/index.js';

const createCollectionSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  sourceType: z.enum(['MDBLIST', 'TRAKT_LIST', 'TRAKT_WATCHLIST', 'TRAKT_COLLECTION', 'MANUAL']),
  sourceId: z.string().optional(),
  sourceUrl: z.string().optional(),
  syncInterval: z.number().min(1).max(168).default(24),
});

const updateCollectionSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  isEnabled: z.boolean().optional(),
  syncInterval: z.number().min(1).max(168).optional(),
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
      },
    });

    const collectionsWithCachedPosters = await Promise.all(
      collections.map(async (c) => {
        let posterPath = c.posterPath;
        if (posterPath && posterPath.startsWith('https://image.tmdb.org/')) {
          posterPath = await getCachedImageUrl(posterPath);
        }
        return {
          ...c,
          itemCount: c._count.items,
          posterPath,
          _count: undefined,
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

    const { name, description, sourceType, sourceId, sourceUrl, syncInterval } = validation.data;

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
        syncInterval,
      },
    });

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
      data: validation.data,
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

  // Force refresh collection from source
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

    // Get API keys from global Settings
    const settings = await fastify.prisma.settings.findUnique({
      where: { id: 'singleton' },
    });

    let items: RefreshedItem[] = [];
    const mdblistApiKey = settings?.mdblistApiKey || fastify.config.external.mdblist.apiKey;

    try {
      switch (collection.sourceType) {
        case 'MDBLIST':
          items = await refreshFromMdblist(collection.sourceId!, mdblistApiKey, fastify.config);
          break;
        case 'TRAKT_LIST':
        case 'TRAKT_WATCHLIST':
        case 'TRAKT_COLLECTION':
          items = await refreshFromTrakt(collection, settings, fastify.config);
          break;
      }
    } catch (error) {
      return reply.code(502).send({
        error: 'External API Error',
        message: (error as Error).message,
      });
    }

    if (items.length > 0) {
      await fastify.prisma.$transaction([
        fastify.prisma.collectionItem.deleteMany({
          where: { collectionId: id },
        }),
        fastify.prisma.collectionItem.createMany({
          data: items.map((item) => ({
            collectionId: id,
            ...item,
          })),
        }),
        fastify.prisma.collection.update({
          where: { id },
          data: { lastSyncAt: new Date() },
        }),
      ]);
    }

    return {
      success: true,
      itemCount: items.length,
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

    console.log(`MDBList: Got ${items.length} items, fetching details...`);

    const enrichedItems: RefreshedItem[] = [];
    const batchSize = 2;

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(item => fetchMdblistItemDetails(item, apiKey, config))
      );
      enrichedItems.push(...batchResults);

      if (i + batchSize < items.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    const withPosters = enrichedItems.filter(item => item.posterPath);
    const withoutPosters = enrichedItems.filter(item => !item.posterPath);
    console.log(`MDBList: Enriched ${enrichedItems.length} items (${withPosters.length} with posters, ${withoutPosters.length} without)`);
    if (withoutPosters.length > 0 && withoutPosters.length <= 10) {
      console.log('Items without posters:', withoutPosters.map(i => ({ title: i.title, tmdbId: i.tmdbId, imdbId: i.imdbId })));
    }
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
