/**
 * Sync to Emby Job
 * Syncs all enabled collections to configured Emby servers
 */

import { syncUserCollections } from '../modules/emby/sync-service.js';

/**
 * Run sync for all users with Emby servers configured
 */
export async function syncAllToEmby(prisma, logger) {
  logger?.info('Starting Emby sync job');

  // Get all users with Emby servers
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

  const results = {
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
      logger?.error(`Error syncing for user ${user.email}: ${error.message}`);
      results.errors.push({
        userId: user.id,
        error: error.message,
      });
    }
  }

  logger?.info(`Emby sync job completed: ${results.totalSuccess} success, ${results.totalPartial} partial, ${results.totalFailed} failed`);

  return results;
}

/**
 * Create the job handler for the scheduler
 */
export function createSyncToEmbyJob(prisma, logger) {
  return async () => {
    return syncAllToEmby(prisma, logger);
  };
}

export default {
  syncAllToEmby,
  createSyncToEmbyJob,
};
