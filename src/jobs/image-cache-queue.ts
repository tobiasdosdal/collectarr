/**
 * Image Cache Queue Job
 * Scans for missing images and queues them for caching from TMDB CDN
 */

import { queueMissingImages } from '../utils/image-cache.js';
import type { FastifyInstance } from 'fastify';

export default async function imageCacheQueueJob(fastify: FastifyInstance) {
  return queueMissingImages(fastify.prisma);
}
