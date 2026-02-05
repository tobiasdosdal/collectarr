/**
 * Sync to Jellyfin Job
 * Syncs all enabled collections to configured Jellyfin servers
 */

import { syncAllToJellyfin } from '../modules/jellyfin/sync-service.js';
import type { FastifyInstance } from 'fastify';

export async function syncToJellyfinJob(fastify: FastifyInstance) {
  return syncAllToJellyfin(fastify.prisma, fastify.log);
}

export default {
  syncToJellyfinJob,
};
