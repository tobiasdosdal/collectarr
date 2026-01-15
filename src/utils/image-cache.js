/**
 * Image Caching Utility
 * Downloads and caches images locally from TMDB CDN
 *
 * Flow: MDBList provides TMDB image URLs -> we cache them locally
 * Note: TMDB image CDN is public (no API key needed), only TMDB API requires a key
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const CACHE_DIR = process.env.IMAGE_CACHE_DIR || './data/image-cache';
const METADATA_DIR = path.join(CACHE_DIR, '.metadata');
const MAX_CACHE_SIZE_MB = parseInt(process.env.MAX_CACHE_SIZE_MB || '1000', 10); // 1GB default
const MIN_FILE_SIZE = 100; // Minimum valid file size in bytes

// Background queue for caching images
const cacheQueue = new Set();
const processingQueue = new Set();
let queueProcessorRunning = false;
const QUEUE_CONCURRENCY = 5; // Process 5 images concurrently

// Ensure cache directory exists
async function ensureCacheDir() {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.mkdir(METADATA_DIR, { recursive: true });
  } catch (err) {
    // Ignore if exists
  }
}

/**
 * Clean up any orphaned temporary files
 */
async function cleanupTempFiles() {
  try {
    const files = await fs.readdir(CACHE_DIR);
    for (const file of files) {
      if (file.endsWith('.tmp')) {
        const filepath = path.join(CACHE_DIR, file);
        try {
          await fs.unlink(filepath);
        } catch (err) {
          // Ignore if file doesn't exist
          if (err.code !== 'ENOENT') {
            console.warn(`Failed to remove temp file ${file}:`, err.message);
          }
        }
      }
    }
  } catch (error) {
    // Ignore errors during cleanup
  }
}

// Clean up temp files on module load
ensureCacheDir().then(() => cleanupTempFiles());

/**
 * Process the cache queue in the background
 */
async function processCacheQueue() {
  if (queueProcessorRunning) {
    // Already running, just return
    return;
  }
  
  queueProcessorRunning = true;
  let processedCount = 0;
  let failedCount = 0;

  try {
    console.log(`Starting cache queue processor. Queue size: ${cacheQueue.size}`);
    
    while (cacheQueue.size > 0 || processingQueue.size > 0) {
      // Get URLs to process (up to concurrency limit)
      const urlsToProcess = [];
      for (const url of cacheQueue) {
        if (urlsToProcess.length >= QUEUE_CONCURRENCY) break;
        if (!processingQueue.has(url)) {
          urlsToProcess.push(url);
          cacheQueue.delete(url);
          processingQueue.add(url);
        }
      }

      if (urlsToProcess.length === 0) {
        // No URLs to process right now, wait a bit before checking again
        await new Promise(resolve => setTimeout(resolve, 500));
        continue;
      }

      // Process URLs concurrently
      const results = await Promise.allSettled(
        urlsToProcess.map(async (url) => {
          try {
            const filename = await cacheImage(url);
            if (filename) {
              processedCount++;
              return { url, filename, success: true };
            } else {
              failedCount++;
              return { url, success: false, error: 'cacheImage returned null' };
            }
          } catch (error) {
            failedCount++;
            return { url, success: false, error: error.message };
          } finally {
            processingQueue.delete(url);
          }
        })
      );

      // Log batch progress every 10 items
      if ((processedCount + failedCount) % 10 === 0) {
        console.log(`Cache queue progress: ${processedCount} cached, ${failedCount} failed, ${cacheQueue.size} remaining`);
      }
    }

    console.log(`Cache queue processor finished. Total: ${processedCount} cached, ${failedCount} failed`);
  } catch (error) {
    console.error('Error in cache queue processor:', error.message);
  } finally {
    queueProcessorRunning = false;
  }
}

/**
 * Add image URL to cache queue
 * Returns true if queued, false if already cached or in queue
 */
async function queueImageForCaching(url) {
  if (!url || !url.startsWith('https://image.tmdb.org/')) {
    return false;
  }

  // Don't queue if already in queue or processing
  if (cacheQueue.has(url) || processingQueue.has(url)) {
    return false;
  }

  const filename = getCacheFilename(url);
  const filepath = path.join(CACHE_DIR, filename);
  
  // Check if file exists and is valid
  try {
    await fs.access(filepath);
    // File exists, check if valid
    const isValid = await validateImageFile(filepath);
    if (isValid) {
      // File exists and is valid, don't queue
      return false;
    } else {
      // Corrupted file, remove it
      await fs.unlink(filepath).catch(() => {});
    }
  } catch {
    // File doesn't exist - this is what we want to queue
  }

  // Double-check we're not already queued (race condition protection)
  if (cacheQueue.has(url) || processingQueue.has(url)) {
    return false;
  }

  // Store metadata with URL so we can track it
  const metadataPath = path.join(METADATA_DIR, `${filename}.json`);
  try {
    await fs.writeFile(metadataPath, JSON.stringify({
      url,
      queuedAt: new Date().toISOString(),
      status: 'queued',
    }, null, 2));
  } catch (err) {
    // Ignore metadata write errors
  }

  // Add to queue
  cacheQueue.add(url);
  
  // Start processing if not already running (non-blocking)
  // Use setImmediate to ensure it doesn't block the current operation
  setImmediate(() => {
    processCacheQueue().catch(err => 
      console.error('Error processing cache queue:', err.message)
    );
  });
  
  return true;
}

/**
 * Get cache filename from URL
 */
function getCacheFilename(url) {
  const hash = crypto.createHash('md5').update(url).digest('hex');
  const ext = path.extname(new URL(url).pathname) || '.jpg';
  return `${hash}${ext}`;
}

/**
 * Extract cached filename from a cached image URL
 */
function getFilenameFromCachedUrl(url) {
  if (!url || typeof url !== 'string') return null;

  const cachePrefix = '/api/v1/images/cache/';
  let pathname = url;

  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      pathname = new URL(url).pathname;
    } catch {
      return null;
    }
  }

  if (!pathname.startsWith(cachePrefix)) return null;

  const filename = pathname.slice(cachePrefix.length);
  if (!validateFilename(filename)) return null;
  return filename;
}

/**
 * Validate filename to prevent path traversal attacks
 */
function validateFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    return false;
  }

  // Check for path traversal patterns
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return false;
  }

  // Check for valid filename pattern (hash + extension)
  const validPattern = /^[a-f0-9]{32}\.(jpg|jpeg|png|webp|gif)$/i;
  return validPattern.test(filename);
}

/**
 * Generate ETag from file stats (faster than content hash)
 */
function generateETag(stats) {
  const hash = crypto
    .createHash('md5')
    .update(`${stats.size}-${stats.mtimeMs}`)
    .digest('hex');
  return `"${hash}"`;
}

/**
 * Validate image file integrity
 */
async function validateImageFile(filepath) {
  try {
    const stats = await fs.stat(filepath);

    // Check minimum file size
    if (stats.size < MIN_FILE_SIZE) {
      console.warn(`Image file too small: ${filepath} (${stats.size} bytes)`);
      return false;
    }

    // Read first few bytes to check magic numbers
    const buffer = Buffer.alloc(12);
    const fd = await fs.open(filepath, 'r');
    await fd.read(buffer, 0, 12, 0);
    await fd.close();

    // Check for valid image signatures
    const isPNG = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
    const isJPEG = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
    const isWebP = buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
    const isGIF = buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46;

    if (!isPNG && !isJPEG && !isWebP && !isGIF) {
      console.warn(`Invalid image format: ${filepath}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`Error validating image file: ${filepath}`, error.message);
    return false;
  }
}

/**
 * Get or create metadata for a cached image
 */
export async function getMetadata(filename) {
  const metadataPath = path.join(METADATA_DIR, `${filename}.json`);
  try {
    const data = await fs.readFile(metadataPath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Save metadata for a cached image
 */
async function saveMetadata(filename, metadata) {
  const metadataPath = path.join(METADATA_DIR, `${filename}.json`);
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
}

/**
 * Get total cache size in bytes
 */
async function getCacheSize() {
  await ensureCacheDir();
  let totalSize = 0;

  try {
    const files = await fs.readdir(CACHE_DIR);
    for (const file of files) {
      // Skip metadata directory and temporary files
      if (file === '.metadata' || file.endsWith('.tmp')) continue;

      const filepath = path.join(CACHE_DIR, file);
      try {
        const stats = await fs.stat(filepath);
        if (stats.isFile()) {
          totalSize += stats.size;
        }
      } catch (statError) {
        // File might have been deleted between readdir and stat (race condition)
        // Ignore ENOENT errors for individual files
        if (statError.code !== 'ENOENT') {
          console.warn(`Error statting file ${file}:`, statError.message);
        }
      }
    }
  } catch (error) {
    console.error('Error calculating cache size:', error.message);
  }

  return totalSize;
}

/**
 * Get all cached files with metadata (sorted by access time)
 */
async function getCachedFiles() {
  await ensureCacheDir();
  const files = [];

  try {
    const entries = await fs.readdir(CACHE_DIR);
    for (const entry of entries) {
      // Skip metadata directory and temporary files
      if (entry === '.metadata' || entry.endsWith('.tmp')) continue;

      const filepath = path.join(CACHE_DIR, entry);
      try {
        const stats = await fs.stat(filepath);

        if (stats.isFile()) {
          const metadata = await getMetadata(entry);
          files.push({
            filename: entry,
            filepath,
            size: stats.size,
            mtime: stats.mtime,
            atime: stats.atime,
            accessCount: metadata?.accessCount || 0,
            lastAccess: metadata?.lastAccess || stats.atime.toISOString(),
          });
        }
      } catch (statError) {
        // File might have been deleted between readdir and stat (race condition)
        // Ignore ENOENT errors for individual files
        if (statError.code !== 'ENOENT') {
          console.warn(`Error statting file ${entry}:`, statError.message);
        }
      }
    }
  } catch (error) {
    console.error('Error getting cached files:', error.message);
  }

  // Sort by last access time (LRU)
  return files.sort((a, b) => new Date(a.lastAccess) - new Date(b.lastAccess));
}

/**
 * Evict old files to meet cache size limit
 */
async function evictOldFiles() {
  const maxSizeBytes = MAX_CACHE_SIZE_MB * 1024 * 1024;
  const currentSize = await getCacheSize();

  if (currentSize <= maxSizeBytes) {
    return { evicted: 0, freedBytes: 0 };
  }

  console.log(`Cache size ${(currentSize / 1024 / 1024).toFixed(2)}MB exceeds limit ${MAX_CACHE_SIZE_MB}MB, evicting old files...`);

  const files = await getCachedFiles();
  let freedBytes = 0;
  let evicted = 0;
  let totalSize = currentSize;

  // Remove files until we're under 80% of max size (to avoid constant eviction)
  const targetSize = maxSizeBytes * 0.8;

  for (const file of files) {
    if (totalSize <= targetSize) break;

    try {
      await fs.unlink(file.filepath);

      // Also remove metadata
      const metadataPath = path.join(METADATA_DIR, `${file.filename}.json`);
      try {
        await fs.unlink(metadataPath);
      } catch {
        // Ignore if metadata doesn't exist
      }

      freedBytes += file.size;
      totalSize -= file.size;
      evicted++;

      console.log(`Evicted: ${file.filename} (${(file.size / 1024).toFixed(2)}KB)`);
    } catch (error) {
      console.error(`Failed to evict file: ${file.filename}`, error.message);
    }
  }

  console.log(`Eviction complete: removed ${evicted} files, freed ${(freedBytes / 1024 / 1024).toFixed(2)}MB`);

  return { evicted, freedBytes };
}

/**
 * Check if image is cached and valid
 */
export async function isCached(url) {
  if (!url) return false;
  await ensureCacheDir();
  const filename = getCacheFilename(url);
  const filepath = path.join(CACHE_DIR, filename);
  try {
    await fs.access(filepath);
    // Validate the file is not corrupted
    const isValid = await validateImageFile(filepath);
    if (!isValid) {
      // Remove corrupted file
      await fs.unlink(filepath).catch(() => {});
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Get cached image path (or null if not cached)
 */
export async function getCachedPath(url) {
  if (!url) return null;
  const filename = getCacheFilename(url);
  const filepath = path.join(CACHE_DIR, filename);
  try {
    await fs.access(filepath);
    // Validate the file is not corrupted
    const isValid = await validateImageFile(filepath);
    if (!isValid) {
      // Remove corrupted file
      await fs.unlink(filepath).catch(() => {});
      return null;
    }
    return filepath;
  } catch {
    return null;
  }
}

/**
 * Download and cache an image with atomic writes and validation
 */
export async function cacheImage(url) {
  if (!url) return null;

  await ensureCacheDir();
  const filename = getCacheFilename(url);
  const filepath = path.join(CACHE_DIR, filename);

  // Check if already cached and valid
  try {
    await fs.access(filepath);
    const isValid = await validateImageFile(filepath);
    if (isValid) {
      // Update access metadata
      const metadata = await getMetadata(filename);
      await saveMetadata(filename, {
        ...metadata,
        accessCount: (metadata?.accessCount || 0) + 1,
        lastAccess: new Date().toISOString(),
      });
      return filename;
    } else {
      // Remove corrupted file
      await fs.unlink(filepath).catch(() => {});
    }
  } catch {
    // Not cached, download it
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ACdb/1.0)',
      },
    });
    if (!response.ok) {
      console.error(`Failed to download image: ${url} - ${response.status} ${response.statusText}`);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    
    // Check if buffer is empty
    if (buffer.length === 0) {
      console.error(`Downloaded image is empty: ${url}`);
      return null;
    }

    // Atomic write: write to temp file first, then rename
    const tempPath = `${filepath}.tmp`;
    await fs.writeFile(tempPath, buffer);

    // Validate before finalizing
    const isValid = await validateImageFile(tempPath);
    if (!isValid) {
      await fs.unlink(tempPath).catch(() => {});
      console.error(`Downloaded image failed validation: ${url}`);
      return null;
    }

    // Rename temp file to final location (atomic operation)
    await fs.rename(tempPath, filepath);

    // Save initial metadata
    await saveMetadata(filename, {
      url,
      cachedAt: new Date().toISOString(),
      lastAccess: new Date().toISOString(),
      accessCount: 1,
      size: buffer.length,
    });

    // Check if we need to evict old files
    await evictOldFiles();

    return filename;
  } catch (error) {
    console.error(`Error caching image: ${url}`, error.message);
    return null;
  }
}

/**
 * Cache multiple images concurrently
 */
export async function cacheImages(urls, concurrency = 5) {
  const results = {};
  const validUrls = urls.filter(Boolean);

  // Process in batches
  for (let i = 0; i < validUrls.length; i += concurrency) {
    const batch = validUrls.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(cacheImage));
    batch.forEach((url, idx) => {
      results[url] = batchResults[idx];
    });
  }

  return results;
}

/**
 * Get cached image buffer with stats for ETag generation
 */
export async function getCachedImage(filename) {
  // Validate filename to prevent path traversal
  if (!validateFilename(filename)) {
    console.warn(`Invalid filename rejected: ${filename}`);
    return null;
  }

  const filepath = path.join(CACHE_DIR, filename);
  try {
    // Validate file integrity
    const isValid = await validateImageFile(filepath);
    if (!isValid) {
      await fs.unlink(filepath).catch(() => {});
      return null;
    }

    // Update access metadata (non-blocking)
    const metadata = await getMetadata(filename);
    saveMetadata(filename, {
      ...metadata,
      accessCount: (metadata?.accessCount || 0) + 1,
      lastAccess: new Date().toISOString(),
    }).catch(err => console.error('Failed to update metadata:', err.message));

    return await fs.readFile(filepath);
  } catch {
    return null;
  }
}

/**
 * Get cached image with file stats (for ETag and Last-Modified headers)
 */
export async function getCachedImageWithStats(filename) {
  // Validate filename to prevent path traversal
  if (!validateFilename(filename)) {
    console.warn(`Invalid filename rejected: ${filename}`);
    return null;
  }

  const filepath = path.join(CACHE_DIR, filename);
  try {
    // Validate file integrity
    const isValid = await validateImageFile(filepath);
    if (!isValid) {
      await fs.unlink(filepath).catch(() => {});
      return null;
    }

    const [buffer, stats] = await Promise.all([
      fs.readFile(filepath),
      fs.stat(filepath),
    ]);

    // Update access metadata (non-blocking)
    const metadata = await getMetadata(filename);
    saveMetadata(filename, {
      ...metadata,
      accessCount: (metadata?.accessCount || 0) + 1,
      lastAccess: new Date().toISOString(),
    }).catch(err => console.error('Failed to update metadata:', err.message));

    return {
      buffer,
      stats,
      etag: generateETag(stats),
      lastModified: stats.mtime.toUTCString(),
    };
  } catch {
    return null;
  }
}

/**
 * Clear old cache entries (older than maxAge in days)
 */
export async function clearOldCache(maxAgeDays = 30) {
  await ensureCacheDir();
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  const now = Date.now();

  try {
    const files = await fs.readdir(CACHE_DIR);
    let cleared = 0;

    for (const file of files) {
      // Skip metadata directory and temporary files
      if (file === '.metadata' || file.endsWith('.tmp')) continue;

      const filepath = path.join(CACHE_DIR, file);
      try {
        const stats = await fs.stat(filepath);
        if (now - stats.mtimeMs > maxAgeMs) {
          await fs.unlink(filepath);

          // Also remove metadata
          const metadataPath = path.join(METADATA_DIR, `${file}.json`);
          try {
            await fs.unlink(metadataPath);
          } catch {
            // Ignore if metadata doesn't exist
          }

          cleared++;
        }
      } catch (statError) {
        // File might have been deleted between readdir and stat (race condition)
        // Ignore ENOENT errors for individual files
        if (statError.code !== 'ENOENT') {
          console.warn(`Error statting file ${file} during cache clear:`, statError.message);
        }
      }
    }

    return cleared;
  } catch (error) {
    console.error('Error clearing cache:', error.message);
    return 0;
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats() {
  await ensureCacheDir();

  try {
    const files = await getCachedFiles();
    const totalSize = await getCacheSize();
    const maxSizeBytes = MAX_CACHE_SIZE_MB * 1024 * 1024;

    return {
      totalFiles: files.length,
      totalSize,
      totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
      maxSizeMB: MAX_CACHE_SIZE_MB,
      usagePercent: ((totalSize / maxSizeBytes) * 100).toFixed(2),
      oldestFile: files.length > 0 ? files[0] : null,
      newestFile: files.length > 0 ? files[files.length - 1] : null,
    };
  } catch (error) {
    console.error('Error getting cache stats:', error.message);
    return null;
  }
}

// Export additional functions that are not marked as export
export { validateFilename, evictOldFiles };

/**
 * Convert TMDB image URL to cached URL
 * Returns cached URL if available, otherwise queues for caching and returns expected URL
 */
export async function getCachedImageUrl(tmdbUrl) {
  if (!tmdbUrl) {
    return tmdbUrl;
  }

  // If this is already a cached URL, verify it exists and queue if missing
  const cachedFilename = getFilenameFromCachedUrl(tmdbUrl);
  if (cachedFilename) {
    const cachedPath = path.join(CACHE_DIR, cachedFilename);
    try {
      await fs.access(cachedPath);
      const isValid = await validateImageFile(cachedPath);
      if (isValid) {
        return tmdbUrl;
      }
      await fs.unlink(cachedPath).catch(() => {});
    } catch {
      // File doesn't exist
    }

    const metadata = await getMetadata(cachedFilename);
    if (metadata?.url && metadata.url.startsWith('https://image.tmdb.org/')) {
      queueImageForCaching(metadata.url).catch(err =>
        console.warn(`Failed to queue missing cached image: ${metadata.url}`, err.message)
      );
    }
    return tmdbUrl;
  }

  if (!tmdbUrl.startsWith('https://image.tmdb.org/')) {
    return tmdbUrl;
  }

  const filename = getCacheFilename(tmdbUrl);
  const filepath = path.join(CACHE_DIR, filename);

  // Check if already cached
  try {
    await fs.access(filepath);
    // File exists, validate it
    const isValid = await validateImageFile(filepath);
    if (isValid) {
      // Update access metadata (non-blocking)
      const metadata = await getMetadata(filename);
      saveMetadata(filename, {
        ...metadata,
        url: tmdbUrl, // Ensure URL is stored
        accessCount: (metadata?.accessCount || 0) + 1,
        lastAccess: new Date().toISOString(),
      }).catch(() => {});
      
      // Return cached URL
      return `/api/v1/images/cache/${filename}`;
    } else {
      // Corrupted file, remove it and queue for re-caching
      await fs.unlink(filepath).catch(() => {});
    }
  } catch {
    // File doesn't exist
  }

  // Image not cached, add to queue for background caching (non-blocking)
  queueImageForCaching(tmdbUrl).catch(err => 
    console.warn(`Failed to queue image for caching: ${tmdbUrl}`, err.message)
  );

  // Return the expected cached URL (will work once queued image is cached)
  // The cache endpoint will handle requests for images still being cached
  return `/api/v1/images/cache/${filename}`;
}

/**
 * Convert multiple TMDB image URLs to cached URLs
 */
export async function getCachedImageUrls(urls) {
  const results = {};
  const validUrls = urls.filter(Boolean);

  // Process in batches to avoid overwhelming the system
  for (let i = 0; i < validUrls.length; i += 10) {
    const batch = validUrls.slice(i, i + 10);
    const batchResults = await Promise.all(batch.map(getCachedImageUrl));
    batch.forEach((url, idx) => {
      results[url] = batchResults[idx];
    });
  }

  return results;
}

/**
 * Scan and queue missing images from collection items
 * Caches images from TMDB CDN URLs provided by MDBList
 *
 * Flow:
 * 1. Find items with TMDB image URLs or cached URLs
 * 2. Queue uncached images for background download
 * 3. No TMDB API key needed - CDN is public
 */
export async function queueMissingImages(prisma) {
  try {
    // Get all collection items with TMDB poster/backdrop URLs or cached URLs
    const items = await prisma.collectionItem.findMany({
      where: {
        OR: [
          { posterPath: { startsWith: 'https://image.tmdb.org/' } },
          { backdropPath: { startsWith: 'https://image.tmdb.org/' } },
          { posterPath: { startsWith: '/api/v1/images/cache/' } },
          { backdropPath: { startsWith: '/api/v1/images/cache/' } },
        ],
      },
      select: {
        id: true,
        posterPath: true,
        backdropPath: true,
      },
    });

    let queued = 0;
    let alreadyCached = 0;
    let missingMetadata = 0;

    for (const item of items) {
      // Process poster image
      if (item.posterPath) {
        const result = await queueImageUrl(item.posterPath);
        if (result === 'queued') queued++;
        else if (result === 'cached') alreadyCached++;
        else if (result === 'missing_metadata') missingMetadata++;
      }

      // Process backdrop image
      if (item.backdropPath) {
        const result = await queueImageUrl(item.backdropPath);
        if (result === 'queued') queued++;
        else if (result === 'cached') alreadyCached++;
        else if (result === 'missing_metadata') missingMetadata++;
      }
    }

    console.log(`Image cache queue: ${queued} queued, ${alreadyCached} already cached, ${missingMetadata} missing metadata (${cacheQueue.size} in queue, ${processingQueue.size} processing)`);

    // Start processor if we have items to process
    if (cacheQueue.size > 0) {
      setImmediate(() => {
        processCacheQueue().catch(err =>
          console.error('Error starting cache queue processor:', err.message)
        );
      });
    }

    return { queued, alreadyCached, missingMetadata, queueSize: cacheQueue.size };
  } catch (error) {
    console.error('Error queueing missing images:', error.message);
    return { queued: 0, error: error.message };
  }
}

/**
 * Queue a single image URL for caching
 * Handles both TMDB URLs and cached URLs (re-caches if file missing)
 */
async function queueImageUrl(url) {
  // Handle cached URLs - check if file exists, re-queue from metadata if not
  const cachedFilename = getFilenameFromCachedUrl(url);
  if (cachedFilename) {
    const metadata = await getMetadata(cachedFilename);
    if (metadata?.url) {
      const wasQueued = await queueImageForCaching(metadata.url);
      return wasQueued ? 'queued' : 'cached';
    }
    return 'missing_metadata';
  }

  // Handle TMDB CDN URLs directly
  const wasQueued = await queueImageForCaching(url);
  return wasQueued ? 'queued' : 'cached';
}

export default {
  cacheImage,
  cacheImages,
  getCachedImage,
  getCachedImageWithStats,
  getCachedPath,
  isCached,
  clearOldCache,
  evictOldFiles,
  getCacheStats,
  validateFilename,
  getCachedImageUrl,
  getCachedImageUrls,
  queueMissingImages,
};
