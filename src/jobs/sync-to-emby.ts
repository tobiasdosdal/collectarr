/**
 * Sync to Emby Job
 * Syncs all enabled collections to configured Emby servers
 */

import { syncUserCollections } from '../modules/emby/sync-service.js';
import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';

export interface SyncAllToEmbyResult {
  usersProcessed: number;
  totalCollections: number;
  totalSuccess: number;
  totalPartial: number;
  totalFailed: number;
  errors: Array<{ userId: string; error: string }>;
}

export async function syncAllToEmby(
  prisma: PrismaClient,
  logger?: FastifyBaseLogger
): Promise<SyncAllToEmbyResult> {
  logger?.info('Starting Emby sync job');

  const users = await prisma.user.findMany({
    where: {
      embyServers: {
        some: {},
      },
    },
    select: {
      id: true,
      email: true,
    },
  });

  logger?.info(`Found ${users.length} users with Emby servers`);

  const results: SyncAllToEmbyResult = {
    usersProcessed: 0,
    totalCollections: 0,
    totalSuccess: 0,
    totalPartial: 0,
    totalFailed: 0,
    errors: [],
  };

  for (const user of users) {
    try {
      logger?.info(`Syncing collections for user: ${user.email}`);

      const syncResult = await syncUserCollections({
        userId: user.id,
        prisma,
      });

      results.usersProcessed++;

      for (const result of syncResult.results) {
        results.totalCollections++;
        if (result.status === 'SUCCESS') {
          results.totalSuccess++;
        } else if (result.status === 'PARTIAL') {
          results.totalPartial++;
        } else {
          results.totalFailed++;
        }
      }
    } catch (error) {
      logger?.error(`Error syncing for user ${user.email}: ${(error as Error).message}`);
      results.errors.push({
        userId: user.id,
        error: (error as Error).message,
      });
    }
  }

  logger?.info(`Emby sync job completed: ${results.totalSuccess} success, ${results.totalPartial} partial, ${results.totalFailed} failed`);

  return results;
}

export function createSyncToEmbyJob(prisma: PrismaClient, logger?: FastifyBaseLogger) {
  return async () => {
    return syncAllToEmby(prisma, logger);
  };
}

export default {
  syncAllToEmby,
  createSyncToEmbyJob,
};
