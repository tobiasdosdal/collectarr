/**
 * Sample Collections Routes
 * Provides pre-configured sample collections for new users to explore
 */

import type { FastifyInstance } from 'fastify';
import { SAMPLE_COLLECTIONS } from './data.js';
import { getCachedImageUrl } from '../../utils/image-cache.js';
import { requireAdmin } from '../../shared/middleware/index.js';

interface SampleParams {
  sampleId: string;
}

export default async function samplesRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.authenticate);

  // List all available sample collections
  fastify.get('/', async () => {
    const samples = await Promise.all(
      SAMPLE_COLLECTIONS.map(async (sample) => {
        let posterPath = sample.posterPath;
        if (posterPath && posterPath.startsWith('https://image.tmdb.org/')) {
          posterPath = await getCachedImageUrl(posterPath);
        }
        return {
          id: sample.id,
          name: sample.name,
          description: sample.description,
          posterPath,
          itemCount: sample.items.length,
        };
      })
    );
    return samples;
  });

  // Get details of a specific sample collection
  fastify.get<{ Params: SampleParams }>('/:sampleId', async (request, reply) => {
    const sample = SAMPLE_COLLECTIONS.find((s) => s.id === request.params.sampleId);
    if (!sample) {
      return reply.code(404).send({ error: 'Not Found', message: 'Sample collection not found' });
    }

    let posterPath = sample.posterPath;
    if (posterPath && posterPath.startsWith('https://image.tmdb.org/')) {
      posterPath = await getCachedImageUrl(posterPath);
    }

    const itemsWithCachedImages = await Promise.all(
      sample.items.map(async (item) => ({
        ...item,
        posterPath: item.posterPath ? await getCachedImageUrl(item.posterPath) : null,
      }))
    );

    return {
      ...sample,
      posterPath,
      items: itemsWithCachedImages,
    };
  });

  // Apply a sample collection (create it as a real collection)
  fastify.post<{ Params: SampleParams }>('/:sampleId/apply', { preHandler: [requireAdmin] }, async (request, reply) => {
    const sample = SAMPLE_COLLECTIONS.find((s) => s.id === request.params.sampleId);
    if (!sample) {
      return reply.code(404).send({ error: 'Not Found', message: 'Sample collection not found' });
    }

    // Check if this sample collection already exists
    const existing = await fastify.prisma.collection.findFirst({
      where: { sourceType: 'SAMPLE', sourceId: sample.id },
    });

    if (existing) {
      return reply.code(409).send({
        error: 'Conflict',
        message: 'This sample collection has already been added',
      });
    }

    const collection = await fastify.prisma.collection.create({
      data: {
        name: sample.name,
        description: sample.description,
        sourceType: 'SAMPLE',
        sourceId: sample.id,
        posterPath: sample.posterPath,
      },
    });

    // Add all items to the collection
    const itemsData = sample.items.map((item) => ({
      collectionId: collection.id,
      mediaType: item.mediaType,
      title: item.title,
      year: item.year,
      imdbId: item.imdbId,
      tmdbId: item.tmdbId,
      posterPath: item.posterPath,
      rating: item.rating,
      ratingCount: item.ratingCount,
    }));

    await fastify.prisma.collectionItem.createMany({
      data: itemsData,
    });

    // Get the collection with items for the response
    const fullCollection = await fastify.prisma.collection.findUnique({
      where: { id: collection.id },
      include: {
        _count: { select: { items: true } },
      },
    });

    let posterPath = fullCollection?.posterPath;
    if (posterPath && posterPath.startsWith('https://image.tmdb.org/')) {
      posterPath = await getCachedImageUrl(posterPath);
    }

    return reply.code(201).send({
      ...fullCollection,
      itemCount: fullCollection?._count.items || 0,
      posterPath,
    });
  });
}
