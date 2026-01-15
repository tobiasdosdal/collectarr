/**
 * Emby Sync Service
 * Handles syncing ACdb collections to Emby servers
 */

import { createEmbyClient } from './client.js';
import { readFile, readdir } from 'fs/promises';

/**
 * Sync a single collection to an Emby server
 * @param {Object} options
 * @param {Object} options.collection - Collection with items
 * @param {Object} options.embyServer - Emby server config
 * @param {Object} options.prisma - Prisma client
 * @returns {Object} Sync result
 */
export async function syncCollectionToEmby({ collection, embyServer, prisma }) {
  const client = createEmbyClient(embyServer.url, embyServer.apiKey);

  const result = {
    collectionId: collection.id,
    collectionName: collection.name,
    embyServerId: embyServer.id,
    status: 'SUCCESS',
    itemsTotal: collection.items?.length || 0,
    itemsMatched: 0,
    itemsFailed: 0,
    errors: [],
    matchedItems: [],
    itemsAdded: 0,
    itemsRemoved: 0,
  };

  try {
    // Validate client creation
    if (!client) {
      throw new Error('Failed to create Emby client: Invalid server URL or API key');
    }

    // Validate collection has items
    if (!collection.items || collection.items.length === 0) {
      result.status = 'FAILED';
      result.errors.push('Collection has no items to sync');
      return result;
    }

    console.log(`Starting sync for collection "${collection.name}" with ${collection.items.length} items`);

    // First, match all items to find what exists in Emby
    const matchedItemIdsMap = new Map(); // Use Map to track item ID -> collection item (prevents duplicates)
    const itemUpdates = []; // Track updates for each item

    for (const item of collection.items) {
      console.log(`Searching for: "${item.title}" (${item.year || 'no year'}) - IMDb: ${item.imdbId || 'none'}, TMDb: ${item.tmdbId || 'none'}`);

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
          const embyTitle = embyItem.Name || 'Unknown';
          const embyYear = embyItem.ProductionYear || 'unknown year';
          const matchedBy = embyItem.matchedBy || 'unknown';
          
          // Warn if title doesn't match (could be wrong match or Emby metadata issue)
          const titleMismatch = embyTitle.toLowerCase() !== item.title.toLowerCase();
          if (titleMismatch || embyItem.titleMismatch) {
            const warningMsg = `⚠ Title mismatch detected: "${item.title}" matched to "${embyTitle}" (${embyYear}) via ${matchedBy}. `;
            const detailMsg = embyItem.titleMismatch 
              ? `Provider ID matches but Emby title differs. Verify Emby metadata is correct.`
              : `This may indicate a metadata issue in Emby.`;
            console.warn(warningMsg + detailMsg);
            result.errors.push(`Title mismatch: "${item.title}" matched to "${embyTitle}" (via ${matchedBy})`);
          } else {
            console.log(`  ✓ Found: "${item.title}" -> "${embyTitle}" (${embyYear}) via ${matchedBy}`);
          }
          
          // Only add if we haven't already matched this Emby item ID (prevent duplicates)
          if (!matchedItemIdsMap.has(embyItem.Id)) {
            result.itemsMatched++;
            result.matchedItems.push({
              title: item.title,
              embyTitle: embyTitle,
              embyId: embyItem.Id,
              matchedBy: matchedBy,
              yearMatch: embyYear === item.year,
            });
            matchedItemIdsMap.set(embyItem.Id, true);
          } else {
            // Duplicate match - log but don't fail
            console.warn(`  ⚠ Duplicate match: "${item.title}" matched to Emby item ${embyItem.Id} which was already matched by another collection item`);
            result.errors.push(`Duplicate match: "${item.title}" - this Emby item is already in the collection`);
          }
          itemUpdates.push({ id: item.id, inEmby: true, embyItemId: embyItem.Id });
        } else {
          console.log(`  ✗ Not found: "${item.title}" (${item.year || 'unknown year'})`);
          result.itemsFailed++;
          result.errors.push(`No match found: ${item.title} (${item.year || 'unknown year'})`);
          itemUpdates.push({ id: item.id, inEmby: false, embyItemId: null });
        }
      } catch (error) {
        result.itemsFailed++;
        result.errors.push(`Error matching ${item.title}: ${error.message}`);
        itemUpdates.push({ id: item.id, inEmby: false, embyItemId: null });
      }
    }

    // Convert matched items map to array (removes duplicates)
    const matchedItemIds = Array.from(matchedItemIdsMap.keys());

    // Batch update all items with their Emby match status
    const updatePromises = itemUpdates.map(update =>
      prisma.collectionItem.update({
        where: { id: update.id },
        data: { inEmby: update.inEmby, embyItemId: update.embyItemId },
      }).catch(error => {
        // Item may have been deleted/recreated during refresh, log but don't fail
        console.warn(`Failed to update item ${update.id}:`, error.message);
        return null;
      })
    );
    
    await Promise.allSettled(updatePromises);

    // Only proceed if we have matched items
    if (matchedItemIds.length === 0) {
      result.status = 'FAILED';
      result.errors.push('No items from this collection exist in your Emby library');
    } else {
      // Find or create the Emby collection
      let embyCollection = await client.getCollectionByName(collection.name);

      if (!embyCollection) {
        // Create new collection with first matched item (Emby requires at least one item)
        try {
          if (matchedItemIds.length === 0) {
            throw new Error('Cannot create collection: No items to add');
          }

          const created = await client.createCollection(collection.name, matchedItemIds);
          if (!created || !created.Id) {
            throw new Error('Failed to create collection: Invalid response from Emby');
          }
          embyCollection = { Id: created.Id };

          // Add remaining items if any (first item was already added during creation)
          if (matchedItemIds.length > 1) {
            await client.addItemsToCollection(embyCollection.Id, matchedItemIds.slice(1));
          }
          result.itemsAdded = matchedItemIds.length;
          console.log(`  ✓ Created Emby collection "${collection.name}" with ${matchedItemIds.length} items`);
        } catch (createError) {
          const errorMsg = `Failed to create Emby collection: ${createError.message}`;
          console.error(`  ✗ ${errorMsg}`);
          throw new Error(errorMsg);
        }
      } else {
        // Get current items in the Emby collection
        const existingItems = await client.getCollectionItems(embyCollection.Id);
        const existingItemIds = new Set(existingItems.map(i => i.Id));
        const matchedItemIdsSet = new Set(matchedItemIds);

        // Add only new items (items in Collectarr but not in Emby)
        const newItemIds = matchedItemIds.filter(id => !existingItemIds.has(id));
        if (newItemIds.length > 0) {
          try {
            await client.addItemsToCollection(embyCollection.Id, newItemIds);
            result.itemsAdded = newItemIds.length;
            console.log(`  ✓ Added ${newItemIds.length} new items to Emby collection`);
          } catch (addError) {
            result.errors.push(`Failed to add items to collection: ${addError.message}`);
            console.error(`  ✗ Failed to add items:`, addError.message);
          }
        }

        // Remove items that are in Emby but no longer in Collectarr collection
        const itemsToRemove = Array.from(existingItemIds).filter(id => !matchedItemIdsSet.has(id));
        if (itemsToRemove.length > 0) {
          // Safety check: Don't remove all items if collection would become empty
          // (Emby may not support empty collections)
          const wouldBeEmpty = matchedItemIds.length === 0;
          if (wouldBeEmpty) {
            console.warn(`  ⚠ Would remove all items from Emby collection "${collection.name}", keeping collection as-is`);
            result.errors.push('Cannot remove all items: Collection would become empty. Keeping existing items.');
          } else {
            try {
              await client.removeItemsFromCollection(embyCollection.Id, itemsToRemove);
              result.itemsRemoved = itemsToRemove.length;
              console.log(`  ✓ Removed ${itemsToRemove.length} items from Emby collection (no longer in Collectarr)`);
            } catch (removeError) {
              result.errors.push(`Failed to remove items from collection: ${removeError.message}`);
              console.error(`  ✗ Failed to remove items:`, removeError.message);
            }
          }
        }

        if (newItemIds.length === 0 && itemsToRemove.length === 0) {
          console.log(`  ✓ Emby collection is already up to date`);
        }
      }

      // Sync collection poster if available
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
            console.log(`  ✓ Synced poster for collection "${collection.name}" to Emby`);
          } else {
            console.log(`  ℹ No poster file found for collection "${collection.name}"`);
          }
        } catch (posterError) {
          console.warn(`  ⚠ Failed to sync poster for "${collection.name}":`, posterError.message);
          result.errors.push(`Poster sync failed: ${posterError.message}`);
          // Don't fail the whole sync for a poster error
        }
      } else if (!collection.posterPath) {
        console.log(`  ℹ No poster configured for collection "${collection.name}"`);
      }
    }

    // Determine final status
    if (result.itemsFailed > 0 && result.itemsMatched > 0) {
      result.status = 'PARTIAL';
    } else if (result.itemsFailed === result.itemsTotal) {
      result.status = 'FAILED';
    }

    // Log the sync
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
          itemsAdded: result.itemsAdded || 0,
          itemsRemoved: result.itemsRemoved || 0,
        }),
        completedAt: new Date(),
      },
    });

  } catch (error) {
    result.status = 'FAILED';
    const errorMessage = error.message || 'Unknown error occurred';
    result.errors.push(`Sync error: ${errorMessage}`);
    
    console.error(`Sync failed for collection "${collection.name}":`, errorMessage);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }

    // Log the failure
    try {
      await prisma.syncLog.create({
        data: {
          userId: collection.userId,
          embyServerId: embyServer.id,
          collectionId: collection.id,
          status: 'FAILED',
          itemsTotal: result.itemsTotal,
          itemsMatched: result.itemsMatched || 0,
          itemsFailed: result.itemsTotal - (result.itemsMatched || 0),
          errorMessage: errorMessage,
          details: JSON.stringify({
            errors: result.errors,
            matchedItems: result.matchedItems || [],
          }),
          completedAt: new Date(),
        },
      });
    } catch (logError) {
      // If we can't log the failure, at least log to console
      console.error('Failed to create sync log:', logError.message);
    }
  }

  return result;
}

/**
 * Sync all collections for a user to their Emby servers
 * @param {Object} options
 * @param {string} options.userId - User ID
 * @param {Object} options.prisma - Prisma client
 * @param {string} [options.collectionId] - Optional specific collection
 * @param {string} [options.embyServerId] - Optional specific server
 * @returns {Object} Overall sync result
 */
export async function syncUserCollections({ userId, prisma, collectionId, embyServerId }) {
  // Get user's Emby servers
  const serverQuery = { userId };
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

  // Get collections to sync
  const collectionQuery = {
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

  // Sync each collection to each server
  const results = [];
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

      // Only update lastSyncAt on successful or partial sync (not on complete failure)
      if (result.status !== 'FAILED') {
        await prisma.collection.update({
          where: { id: collection.id },
          data: { lastSyncAt: new Date() },
        });
      }
    }
  }

  return {
    success: !hasErrors,
    totalCollections: collections.length,
    totalServers: embyServers.length,
    results,
  };
}

/**
 * Remove a collection from Emby
 * @param {Object} options
 * @param {string} options.collectionName - Name of collection to remove
 * @param {Object} options.embyServer - Emby server config
 */
export async function removeCollectionFromEmby({ collectionName, embyServer }) {
  const client = createEmbyClient(embyServer.url, embyServer.apiKey);

  const embyCollection = await client.getCollectionByName(collectionName);
  if (embyCollection) {
    await client.deleteCollection(embyCollection.Id);
    return { success: true, message: `Collection "${collectionName}" removed from Emby` };
  }

  return { success: false, message: `Collection "${collectionName}" not found in Emby` };
}

/**
 * Helper function to get collection poster data from the filesystem
 */
async function getCollectionPosterData(collectionId) {
  if (!collectionId) {
    return null;
  }

  try {
    // Check if uploads/posters directory exists
    let files;
    try {
      files = await readdir('uploads/posters');
    } catch (dirError) {
      // Directory doesn't exist or can't be read
      if (dirError.code === 'ENOENT') {
        return null;
      }
      throw dirError;
    }

    const posterFile = files.find((f) => f.startsWith(collectionId));

    if (!posterFile) {
      return null;
    }

    const filePath = `uploads/posters/${posterFile}`;
    const buffer = await readFile(filePath);
    
    if (!buffer || buffer.length === 0) {
      console.warn(`Poster file ${posterFile} is empty`);
      return null;
    }

    const ext = posterFile.split('.').pop()?.toLowerCase() || 'jpg';
    const mimeTypes = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
    };

    return {
      buffer,
      mimeType: mimeTypes[ext] || 'image/jpeg',
    };
  } catch (err) {
    if (err.code === 'ENOENT') {
      // File not found - not an error, just no poster
      return null;
    }
    console.warn(`Failed to read poster file for collection ${collectionId}:`, err.message);
    return null;
  }
}

export default {
  syncCollectionToEmby,
  syncUserCollections,
  removeCollectionFromEmby,
};
