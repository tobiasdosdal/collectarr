/**
 * Image Cache Queue Job
 * Scans for missing images and queues them for caching from TMDB CDN
 *
 * Note: No TMDB API key needed - images come from MDBList with TMDB CDN URLs
 */

import { queueMissingImages } from '../utils/image-cache.js';

export default async function imageCacheQueueJob(fastify) {
  return queueMissingImages(fastify.prisma);
}

