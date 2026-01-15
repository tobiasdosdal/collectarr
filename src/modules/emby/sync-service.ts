/**
 * Emby Sync Service
 * Handles syncing ACdb collections to Emby servers
 */

import { createEmbyClient } from './client.js';
import { readFile, readdir } from 'fs/promises';
import type { PrismaClient, Collection, CollectionItem, EmbyServer } from '@prisma/client';

interface CollectionWithItems extends Collection {
  items: CollectionItem[];
}

interface MatchedItem {
  title: string;
  embyId: string;
  matchedBy: string;
}

interface SyncResult {
  collectionId: string;
  collectionName: string;
  embyServerId: string;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  itemsTotal: number;
  itemsMatched: number;
  itemsFailed: number;
  errors: string[];
  matchedItems: MatchedItem[];
}

interface SyncUserCollectionsOptions {
  userId: string;
  prisma: PrismaClient;
  collectionId?: string;
  embyServerId?: string;
}

interface SyncUserCollectionsResult {
  success: boolean;
  error?: string;
  totalCollections?: number;
  totalServers?: number;
  results: SyncResult[];
}

interface PosterData {
  buffer: Buffer;
  mimeType: string;
}

export async function syncCollectionToEmby({
  collection,
  embyServer,
  prisma,
}: {
  collection: CollectionWithItems;
  embyServer: EmbyServer;
  prisma: PrismaClient;
}): Promise<SyncResult> {
  const client = createEmbyClient(embyServer.url, embyServer.apiKey);

  if (!client) {
    throw new Error('Failed to create Emby client');
  }

  const result: SyncResult = {
    collectionId: collection.id,
    collectionName: collection.name,
    embyServerId: embyServer.id,
    status: 'SUCCESS',
    itemsTotal: collection.items?.length || 0,
    itemsMatched: 0,
    itemsFailed: 0,
    errors: [],
    matchedItems: [],
  };

  try {
    console.log(`Starting sync for collection "${collection.name}" with ${collection.items?.length || 0} items`);

    const matchedItemIds: string[] = [];
    const itemUpdates: Array<{ id: string; inEmby: boolean; embyItemId: string | null }> = [];

    for (const item of collection.items || []) {
      console.log(`Searching for: ${item.title} (IMDb: ${item.imdbId}, TMDb: ${item.tmdbId})`);

      try {
        const embyItem = await client.findItemByAnyProviderId({
          imdbId: item.imdbId,
          tmdbId: item.tmdbId,
          tvdbId: item.tvdbId,
          title: item.title,
          year: item.year,
          mediaType: item.mediaType,
        });

        if (embyItem) {
          console.log(`  ✓ Found: ${item.title} -> ${embyItem.Id}`);
          result.itemsMatched++;
          result.matchedItems.push({
            title: item.title,
            embyId: embyItem.Id,
            matchedBy: 'providerId',
          });
          matchedItemIds.push(embyItem.Id);
          itemUpdates.push({ id: item.id, inEmby: true, embyItemId: embyItem.Id });
        } else {
          console.log(`  ✗ Not found: ${item.title}`);
          result.itemsFailed++;
          result.errors.push(`No match found: ${item.title} (${item.year || 'unknown year'})`);
          itemUpdates.push({ id: item.id, inEmby: false, embyItemId: null });
        }
      } catch (error) {
        result.itemsFailed++;
        result.errors.push(`Error matching ${item.title}: ${(error as Error).message}`);
        itemUpdates.push({ id: item.id, inEmby: false, embyItemId: null });
      }
    }

    for (const update of itemUpdates) {
      try {
        await prisma.collectionItem.update({
          where: { id: update.id },
          data: { inEmby: update.inEmby, embyItemId: update.embyItemId },
        });
      } catch (updateError) {
        console.warn(`Failed to update item ${update.id}:`, (updateError as Error).message);
      }
    }

    if (matchedItemIds.length === 0) {
      result.status = 'FAILED';
      result.errors.push('No items from this collection exist in your Emby library');
    } else {
      let embyCollection = await client.getCollectionByName(collection.name);

      if (!embyCollection) {
        const created = await client.createCollection(collection.name, [matchedItemIds[0]!]);
        embyCollection = { Id: created.Id, Name: collection.name, Type: 'BoxSet' };

        if (matchedItemIds.length > 1) {
          await client.addItemsToCollection(embyCollection.Id, matchedItemIds.slice(1));
        }
      } else {
        const existingItems = await client.getCollectionItems(embyCollection.Id);
        const existingItemIds = new Set(existingItems.map(i => i.Id));

        const newItemIds = matchedItemIds.filter(id => !existingItemIds.has(id));
        if (newItemIds.length > 0) {
          await client.addItemsToCollection(embyCollection.Id, newItemIds);
        }
      }

      if (collection.posterPath && embyCollection?.Id) {
        try {
          const posterData = await getCollectionPosterData(collection.id);
          if (posterData) {
            await client.uploadItemImage(
              embyCollection.Id,
              'Primary',
              posterData.buffer,
              posterData.mimeType
            );
            console.log(`Synced poster for collection "${collection.name}" to Emby`);
          }
        } catch (posterError) {
          console.warn(`Failed to sync poster for "${collection.name}":`, (posterError as Error).message);
        }
      }
    }

    if (result.itemsFailed > 0 && result.itemsMatched > 0) {
      result.status = 'PARTIAL';
    } else if (result.itemsFailed === result.itemsTotal) {
      result.status = 'FAILED';
    }

    await prisma.syncLog.create({
      data: {
        userId: collection.userId,
        embyServerId: embyServer.id,
        collectionId: collection.id,
        status: result.status,
        itemsTotal: result.itemsTotal,
        itemsMatched: result.itemsMatched,
        itemsFailed: result.itemsFailed,
        errorMessage: result.errors.length > 0 ? result.errors.slice(0, 10).join('; ') : null,
        details: JSON.stringify({
          matchedItems: result.matchedItems.slice(0, 50),
          errors: result.errors.slice(0, 20),
        }),
        completedAt: new Date(),
      },
    });

  } catch (error) {
    result.status = 'FAILED';
    result.errors.push(`Sync error: ${(error as Error).message}`);

    await prisma.syncLog.create({
      data: {
        userId: collection.userId,
        embyServerId: embyServer.id,
        collectionId: collection.id,
        status: 'FAILED',
        itemsTotal: result.itemsTotal,
        itemsMatched: 0,
        itemsFailed: result.itemsTotal,
        errorMessage: (error as Error).message,
        completedAt: new Date(),
      },
    });
  }

  return result;
}

export async function syncUserCollections({
  userId,
  prisma,
  collectionId,
  embyServerId,
}: SyncUserCollectionsOptions): Promise<SyncUserCollectionsResult> {
  const serverQuery: { userId: string; id?: string } = { userId };
  if (embyServerId) {
    serverQuery.id = embyServerId;
  }
  const embyServers = await prisma.embyServer.findMany({ where: serverQuery });

  if (embyServers.length === 0) {
    return {
      success: false,
      error: 'No Emby servers configured',
      results: [],
    };
  }

  const collectionQuery: { userId: string; isEnabled: boolean; id?: string } = {
    userId,
    isEnabled: true,
  };
  if (collectionId) {
    collectionQuery.id = collectionId;
  }

  const collections = await prisma.collection.findMany({
    where: collectionQuery,
    include: {
      items: true,
    },
  });

  if (collections.length === 0) {
    return {
      success: false,
      error: 'No enabled collections to sync',
      results: [],
    };
  }

  const results: SyncResult[] = [];
  let hasErrors = false;

  for (const embyServer of embyServers) {
    for (const collection of collections) {
      const result = await syncCollectionToEmby({
        collection,
        embyServer,
        prisma,
      });
      results.push(result);

      if (result.status === 'FAILED') {
        hasErrors = true;
      }

      await prisma.collection.update({
        where: { id: collection.id },
        data: { lastSyncAt: new Date() },
      });
    }
  }

  return {
    success: !hasErrors,
    totalCollections: collections.length,
    totalServers: embyServers.length,
    results,
  };
}

export async function removeCollectionFromEmby({
  collectionName,
  embyServer,
}: {
  collectionName: string;
  embyServer: EmbyServer;
}): Promise<{ success: boolean; message: string }> {
  const client = createEmbyClient(embyServer.url, embyServer.apiKey);

  if (!client) {
    return { success: false, message: 'Failed to create Emby client' };
  }

  const embyCollection = await client.getCollectionByName(collectionName);
  if (embyCollection) {
    await client.deleteCollection(embyCollection.Id);
    return { success: true, message: `Collection "${collectionName}" removed from Emby` };
  }

  return { success: false, message: `Collection "${collectionName}" not found in Emby` };
}

async function getCollectionPosterData(collectionId: string): Promise<PosterData | null> {
  try {
    const files = await readdir('uploads/posters');
    const posterFile = files.find((f) => f.startsWith(collectionId));

    if (!posterFile) {
      return null;
    }

    const buffer = await readFile(`uploads/posters/${posterFile}`);
    const ext = posterFile.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
    };

    return {
      buffer,
      mimeType: ext ? mimeTypes[ext] || 'image/jpeg' : 'image/jpeg',
    };
  } catch (err) {
    console.warn('Failed to read poster file:', (err as Error).message);
    return null;
  }
}

export default {
  syncCollectionToEmby,
  syncUserCollections,
  removeCollectionFromEmby,
};
