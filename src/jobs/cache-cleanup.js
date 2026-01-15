/**
 * Cache Cleanup Job
 * Automatically maintains image cache by removing old and corrupted files
 */

import { clearOldCache, evictOldFiles, getCacheStats } from '../utils/image-cache.js';

/**
 * Cache cleanup job handler
 * Runs periodically to maintain cache health
 */
export default async function cacheCleanupJob(fastify) {
  const startTime = Date.now();
  fastify.log.info('Starting cache cleanup job...');

  try {
    // Get initial cache stats
    const initialStats = await getCacheStats();
    if (initialStats) {
      fastify.log.info(`Cache stats before cleanup: ${initialStats.totalFiles} files, ${initialStats.totalSizeMB}MB (${initialStats.usagePercent}% of max)`);
    }

    // Clear old cache entries (older than 60 days)
    const maxAgeDays = parseInt(process.env.CACHE_MAX_AGE_DAYS || '60', 10);
    const clearedCount = await clearOldCache(maxAgeDays);

    if (clearedCount > 0) {
      fastify.log.info(`Removed ${clearedCount} old cache entries (older than ${maxAgeDays} days)`);
    }

    // Evict files if cache size exceeds limit
    const evictionResult = await evictOldFiles();
    if (evictionResult.evicted > 0) {
      fastify.log.info(`Evicted ${evictionResult.evicted} files to free ${(evictionResult.freedBytes / 1024 / 1024).toFixed(2)}MB`);
    }

    // Get final cache stats
    const finalStats = await getCacheStats();
    if (finalStats) {
      fastify.log.info(`Cache stats after cleanup: ${finalStats.totalFiles} files, ${finalStats.totalSizeMB}MB (${finalStats.usagePercent}% of max)`);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    fastify.log.info(`Cache cleanup completed in ${duration}s`);

    return {
      success: true,
      duration: `${duration}s`,
      clearedOldFiles: clearedCount,
      evictedFiles: evictionResult.evicted,
      freedBytes: evictionResult.freedBytes,
      initialStats,
      finalStats,
    };
  } catch (error) {
    fastify.log.error('Cache cleanup job failed:', error);
    throw error;
  }
}
