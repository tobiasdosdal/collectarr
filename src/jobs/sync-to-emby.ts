/**
 * Sync to Emby Job
 * Syncs all enabled collections to configured Emby servers
 */

import { syncCollectionToEmby } from '../modules/emby/sync-service.js';
import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';

export interface SyncAllToEmbyResult {
  totalServers: number;
  totalCollections: number;
  totalSuccess: number;
  totalPartial: number;
  totalFailed: number;
  errors: Array<{ collectionId?: string; serverId?: string; error: string }>;
}

export async function syncAllToEmby(
  prisma: PrismaClient,
  logger?: FastifyBaseLogger
): Promise<SyncAllToEmbyResult> {
  logger?.info('Starting Emby sync job');

  // Get all global Emby servers
  const embyServers = await prisma.embyServer.findMany();

  logger?.info(`Found ${embyServers.length} Emby servers`);

  if (embyServers.length === 0) {
    logger?.info('No Emby servers configured, skipping sync');
    return {
      totalServers: 0,
      totalCollections: 0,
      totalSuccess: 0,
      totalPartial: 0,
      totalFailed: 0,
      errors: [],
    };
  }

  // Get all enabled collections (global)
  const collections = await prisma.collection.findMany({
    where: {
      isEnabled: true,
    },
    include: {
      items: true,
    },
  });

  logger?.info(`Found ${collections.length} enabled collections to sync`);

  const results: SyncAllToEmbyResult = {
    totalServers: embyServers.length,
    totalCollections: 0,
    totalSuccess: 0,
    totalPartial: 0,
    totalFailed: 0,
    errors: [],
  };

  // Sync each collection to each server
  for (const embyServer of embyServers) {
    for (const collection of collections) {
      try {
        logger?.info(`Syncing collection "${collection.name}" to server "${embyServer.name}"`);

        const syncResult = await syncCollectionToEmby({
          collection,
          embyServer,
          prisma,
          logger,
        });

        results.totalCollections++;
        if (syncResult.status === 'SUCCESS') {
          results.totalSuccess++;
        } else if (syncResult.status === 'PARTIAL') {
          results.totalPartial++;
        } else {
          results.totalFailed++;
        }

        // Update lastSyncAt on successful or partial sync
        if (syncResult.status !== 'FAILED') {
          await prisma.collection.update({
            where: { id: collection.id },
            data: { lastSyncAt: new Date() },
          });
        }
      } catch (error) {
        logger?.error(`Error syncing collection "${collection.name}" to server "${embyServer.name}": ${(error as Error).message}`);
        results.totalCollections++;
        results.totalFailed++;
        results.errors.push({
          collectionId: collection.id,
          serverId: embyServer.id,
          error: (error as Error).message,
        });
      }
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
