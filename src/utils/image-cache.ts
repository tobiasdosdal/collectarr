/**
 * Image Caching Utility
 * Downloads and caches images locally from TMDB CDN
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import type { PrismaClient } from '@prisma/client';

const CACHE_DIR = process.env.IMAGE_CACHE_DIR || './data/image-cache';
const METADATA_DIR = path.join(CACHE_DIR, '.metadata');
const MAX_CACHE_SIZE_MB = parseInt(process.env.MAX_CACHE_SIZE_MB || '1000', 10);
const MIN_FILE_SIZE = 100;

const cacheQueue = new Set<string>();
const processingQueue = new Set<string>();
let queueProcessorRunning = false;
let queueProcessorStopped = false;
const QUEUE_CONCURRENCY = 2; // Reduced from 5 to respect TMDB rate limits
const RATE_LIMIT_DELAY_MS = 600; // 600ms between requests (40 req/10 sec = 250ms, but be conservative)

export interface ImageMetadata {
  url?: string;
  cachedAt?: string;
  lastAccess?: string;
  accessCount?: number;
  size?: number;
  queuedAt?: string;
  status?: string;
}

export interface CachedFile {
  filename: string;
  filepath: string;
  size: number;
  mtime: Date;
  atime: Date;
  accessCount: number;
  lastAccess: string;
}

export interface CacheStats {
  totalFiles: number;
  totalSize: number;
  totalSizeMB: string;
  maxSizeMB: number;
  usagePercent: string;
  oldestFile: CachedFile | null;
  newestFile: CachedFile | null;
}

export interface CachedImageWithStats {
  buffer: Buffer;
  stats: import('fs').Stats;
  etag: string;
  lastModified: string;
}

async function ensureCacheDir(): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.mkdir(METADATA_DIR, { recursive: true });
  } catch {
    // Ignore if exists
  }
}

async function cleanupTempFiles(): Promise<void> {
  try {
    const files = await fs.readdir(CACHE_DIR);
    const now = Date.now();
    const MAX_TEMP_AGE_MS = 60000; // Only cleanup temp files older than 1 minute

    for (const file of files) {
      if (file.endsWith('.tmp')) {
        const filepath = path.join(CACHE_DIR, file);
        try {
          const stats = await fs.stat(filepath);
          // Only delete temp files that are older than MAX_TEMP_AGE_MS
          // This prevents deleting files that are currently being processed
          if (now - stats.mtimeMs > MAX_TEMP_AGE_MS) {
            await fs.unlink(filepath);
          }
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
            console.warn(`Failed to remove temp file ${file}:`, (err as Error).message);
          }
        }
      }
    }
  } catch {
    // Ignore errors during cleanup
  }
}

ensureCacheDir().then(() => cleanupTempFiles());

async function processCacheQueue(): Promise<void> {
  if (queueProcessorRunning || queueProcessorStopped) {
    return;
  }

  queueProcessorRunning = true;
  let processedCount = 0;
  let failedCount = 0;

  try {
    console.log(`Starting cache queue processor. Queue size: ${cacheQueue.size}`);

    while ((cacheQueue.size > 0 || processingQueue.size > 0) && !queueProcessorStopped) {
      const urlsToProcess: string[] = [];
      for (const url of cacheQueue) {
        if (urlsToProcess.length >= QUEUE_CONCURRENCY) break;
        if (!processingQueue.has(url)) {
          urlsToProcess.push(url);
          cacheQueue.delete(url);
          processingQueue.add(url);
        }
      }

      if (urlsToProcess.length === 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
        continue;
      }

      // Process URLs sequentially with delays to respect rate limits
      for (let i = 0; i < urlsToProcess.length; i++) {
        const url = urlsToProcess[i]!;
        if (i > 0) {
          // Stagger requests with delay
          await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
        }

        try {
          const filename = await cacheImage(url);
          if (filename) {
            processedCount++;
          } else {
            failedCount++;
          }
        } catch (error) {
          failedCount++;
          console.error(`Error processing image ${url}:`, (error as Error).message);
        } finally {
          processingQueue.delete(url);
        }
      }

      if ((processedCount + failedCount) % 10 === 0) {
        console.log(`Cache queue progress: ${processedCount} cached, ${failedCount} failed, ${cacheQueue.size} remaining`);
      }
    }

    console.log(`Cache queue processor finished. Total: ${processedCount} cached, ${failedCount} failed`);
  } catch (error) {
    console.error('Error in cache queue processor:', (error as Error).message);
  } finally {
    queueProcessorRunning = false;
  }
}

async function queueImageForCaching(url: string): Promise<boolean> {
  if (!url || !url.startsWith('https://image.tmdb.org/')) {
    return false;
  }

  if (cacheQueue.has(url) || processingQueue.has(url)) {
    return false;
  }

  const filename = getCacheFilename(url);
  const filepath = path.join(CACHE_DIR, filename);

  try {
    await fs.access(filepath);
    const isValid = await validateImageFile(filepath);
    if (isValid) {
      return false;
    } else {
      await fs.unlink(filepath).catch(() => {});
    }
  } catch {
    // File doesn't exist
  }

  if (cacheQueue.has(url) || processingQueue.has(url)) {
    return false;
  }

  const metadataPath = path.join(METADATA_DIR, `${filename}.json`);
  try {
    await fs.writeFile(metadataPath, JSON.stringify({
      url,
      queuedAt: new Date().toISOString(),
      status: 'queued',
    }, null, 2));
  } catch {
    // Ignore metadata write errors
  }

  cacheQueue.add(url);

  setImmediate(() => {
    processCacheQueue().catch(err =>
      console.error('Error processing cache queue:', (err as Error).message)
    );
  });

  return true;
}

function getCacheFilename(url: string): string {
  const hash = crypto.createHash('md5').update(url).digest('hex');
  const ext = path.extname(new URL(url).pathname) || '.jpg';
  return `${hash}${ext}`;
}

function getFilenameFromCachedUrl(url: string): string | null {
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

export function validateFilename(filename: string): boolean {
  if (!filename || typeof filename !== 'string') {
    return false;
  }

  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return false;
  }

  const validPattern = /^[a-f0-9]{32}\.(jpg|jpeg|png|webp|gif)$/i;
  return validPattern.test(filename);
}

function generateETag(stats: import('fs').Stats): string {
  const hash = crypto
    .createHash('md5')
    .update(`${stats.size}-${stats.mtimeMs}`)
    .digest('hex');
  return `"${hash}"`;
}

async function validateImageFile(filepath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filepath);

    if (stats.size < MIN_FILE_SIZE) {
      console.warn(`Image file too small: ${filepath} (${stats.size} bytes)`);
      return false;
    }

    const buffer = Buffer.alloc(12);
    const fd = await fs.open(filepath, 'r');
    await fd.read(buffer, 0, 12, 0);
    await fd.close();

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
    console.error(`Error validating image file: ${filepath}`, (error as Error).message);
    return false;
  }
}

export async function getMetadata(filename: string): Promise<ImageMetadata | null> {
  const metadataPath = path.join(METADATA_DIR, `${filename}.json`);
  try {
    const data = await fs.readFile(metadataPath, 'utf-8');
    return JSON.parse(data) as ImageMetadata;
  } catch {
    return null;
  }
}

async function saveMetadata(filename: string, metadata: ImageMetadata): Promise<void> {
  const metadataPath = path.join(METADATA_DIR, `${filename}.json`);
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
}

async function getCacheSize(): Promise<number> {
  await ensureCacheDir();
  let totalSize = 0;

  try {
    const files = await fs.readdir(CACHE_DIR);
    for (const file of files) {
      if (file === '.metadata' || file.endsWith('.tmp')) continue;

      const filepath = path.join(CACHE_DIR, file);
      try {
        const stats = await fs.stat(filepath);
        if (stats.isFile()) {
          totalSize += stats.size;
        }
      } catch (statError) {
        if ((statError as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.warn(`Error statting file ${file}:`, (statError as Error).message);
        }
      }
    }
  } catch (error) {
    console.error('Error calculating cache size:', (error as Error).message);
  }

  return totalSize;
}

async function getCachedFiles(): Promise<CachedFile[]> {
  await ensureCacheDir();
  const files: CachedFile[] = [];

  try {
    const entries = await fs.readdir(CACHE_DIR);
    for (const entry of entries) {
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
        if ((statError as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.warn(`Error statting file ${entry}:`, (statError as Error).message);
        }
      }
    }
  } catch (error) {
    console.error('Error getting cached files:', (error as Error).message);
  }

  return files.sort((a, b) => new Date(a.lastAccess).getTime() - new Date(b.lastAccess).getTime());
}

export async function evictOldFiles(): Promise<{ evicted: number; freedBytes: number }> {
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

  const targetSize = maxSizeBytes * 0.8;

  for (const file of files) {
    if (totalSize <= targetSize) break;

    try {
      await fs.unlink(file.filepath);

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
      console.error(`Failed to evict file: ${file.filename}`, (error as Error).message);
    }
  }

  console.log(`Eviction complete: removed ${evicted} files, freed ${(freedBytes / 1024 / 1024).toFixed(2)}MB`);

  return { evicted, freedBytes };
}

export async function isCached(url: string): Promise<boolean> {
  if (!url) return false;
  await ensureCacheDir();
  const filename = getCacheFilename(url);
  const filepath = path.join(CACHE_DIR, filename);
  try {
    await fs.access(filepath);
    const isValid = await validateImageFile(filepath);
    if (!isValid) {
      await fs.unlink(filepath).catch(() => {});
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function getCachedPath(url: string): Promise<string | null> {
  if (!url) return null;
  const filename = getCacheFilename(url);
  const filepath = path.join(CACHE_DIR, filename);
  try {
    await fs.access(filepath);
    const isValid = await validateImageFile(filepath);
    if (!isValid) {
      await fs.unlink(filepath).catch(() => {});
      return null;
    }
    return filepath;
  } catch {
    return null;
  }
}

export async function cacheImage(url: string, retryCount = 0): Promise<string | null> {
  if (!url) return null;

  await ensureCacheDir();
  const filename = getCacheFilename(url);
  const filepath = path.join(CACHE_DIR, filename);

  try {
    await fs.access(filepath);
    const isValid = await validateImageFile(filepath);
    if (isValid) {
      const metadata = await getMetadata(filename);
      await saveMetadata(filename, {
        ...metadata,
        accessCount: (metadata?.accessCount || 0) + 1,
        lastAccess: new Date().toISOString(),
      });
      return filename;
    } else {
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

    // Handle rate limiting with exponential backoff
    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      const delayMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : Math.pow(2, retryCount) * 1000;

      if (retryCount < 3) {
        console.warn(`Rate limited for ${url}, retrying in ${delayMs}ms (attempt ${retryCount + 1}/3)`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        return cacheImage(url, retryCount + 1);
      } else {
        console.warn(`Rate limit exceeded and max retries reached for ${url}`);
        return null;
      }
    }

    if (!response.ok) {
      console.error(`Failed to download image: ${url} - ${response.status} ${response.statusText}`);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.length === 0) {
      console.error(`Downloaded image is empty: ${url}`);
      return null;
    }

    // Use unique temp filename to avoid race conditions with cleanup
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tempPath = `${filepath}.${uniqueSuffix}.tmp`;
    await fs.writeFile(tempPath, buffer);

    const isValid = await validateImageFile(tempPath);
    if (!isValid) {
      await fs.unlink(tempPath).catch(() => {});
      console.error(`Downloaded image failed validation: ${url}`);
      return null;
    }

    try {
      await fs.rename(tempPath, filepath);
    } catch (renameError) {
      // If rename fails, try to clean up temp file
      await fs.unlink(tempPath).catch(() => {});
      throw renameError;
    }

    await saveMetadata(filename, {
      url,
      cachedAt: new Date().toISOString(),
      lastAccess: new Date().toISOString(),
      accessCount: 1,
      size: buffer.length,
    });

    await evictOldFiles();

    return filename;
  } catch (error) {
    console.error(`Error caching image: ${url}`, (error as Error).message);
    return null;
  }
}

export async function cacheImages(urls: string[], concurrency = 5): Promise<Record<string, string | null>> {
  const results: Record<string, string | null> = {};
  const validUrls = urls.filter(Boolean);

  for (let i = 0; i < validUrls.length; i += concurrency) {
    const batch = validUrls.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(cacheImage));
    batch.forEach((url, idx) => {
      results[url] = batchResults[idx] ?? null;
    });
  }

  return results;
}

export async function getCachedImage(filename: string): Promise<Buffer | null> {
  if (!validateFilename(filename)) {
    console.warn(`Invalid filename rejected: ${filename}`);
    return null;
  }

  const filepath = path.join(CACHE_DIR, filename);
  try {
    const isValid = await validateImageFile(filepath);
    if (!isValid) {
      await fs.unlink(filepath).catch(() => {});
      return null;
    }

    const metadata = await getMetadata(filename);
    saveMetadata(filename, {
      ...metadata,
      accessCount: (metadata?.accessCount || 0) + 1,
      lastAccess: new Date().toISOString(),
    }).catch(err => console.error('Failed to update metadata:', (err as Error).message));

    return await fs.readFile(filepath);
  } catch {
    return null;
  }
}

export async function getCachedImageWithStats(filename: string): Promise<CachedImageWithStats | null> {
  if (!validateFilename(filename)) {
    console.warn(`Invalid filename rejected: ${filename}`);
    return null;
  }

  const filepath = path.join(CACHE_DIR, filename);
  try {
    const isValid = await validateImageFile(filepath);
    if (!isValid) {
      await fs.unlink(filepath).catch(() => {});
      return null;
    }

    const [buffer, stats] = await Promise.all([
      fs.readFile(filepath),
      fs.stat(filepath),
    ]);

    const metadata = await getMetadata(filename);
    saveMetadata(filename, {
      ...metadata,
      accessCount: (metadata?.accessCount || 0) + 1,
      lastAccess: new Date().toISOString(),
    }).catch(err => console.error('Failed to update metadata:', (err as Error).message));

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

export async function clearOldCache(maxAgeDays = 30): Promise<number> {
  await ensureCacheDir();
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  const now = Date.now();

  try {
    const files = await fs.readdir(CACHE_DIR);
    let cleared = 0;

    for (const file of files) {
      if (file === '.metadata' || file.endsWith('.tmp')) continue;

      const filepath = path.join(CACHE_DIR, file);
      try {
        const stats = await fs.stat(filepath);
        if (now - stats.mtimeMs > maxAgeMs) {
          await fs.unlink(filepath);

          const metadataPath = path.join(METADATA_DIR, `${file}.json`);
          try {
            await fs.unlink(metadataPath);
          } catch {
            // Ignore if metadata doesn't exist
          }

          cleared++;
        }
      } catch (statError) {
        if ((statError as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.warn(`Error statting file ${file} during cache clear:`, (statError as Error).message);
        }
      }
    }

    return cleared;
  } catch (error) {
    console.error('Error clearing cache:', (error as Error).message);
    return 0;
  }
}

export async function getCacheStats(): Promise<CacheStats | null> {
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
      oldestFile: files.length > 0 ? files[0]! : null,
      newestFile: files.length > 0 ? files[files.length - 1]! : null,
    };
  } catch (error) {
    console.error('Error getting cache stats:', (error as Error).message);
    return null;
  }
}

export async function getCachedImageUrl(tmdbUrl: string): Promise<string> {
  if (!tmdbUrl) {
    return tmdbUrl;
  }

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
        console.warn(`Failed to queue missing cached image: ${metadata.url}`, (err as Error).message)
      );
    }
    return tmdbUrl;
  }

  if (!tmdbUrl.startsWith('https://image.tmdb.org/')) {
    return tmdbUrl;
  }

  const filename = getCacheFilename(tmdbUrl);
  const filepath = path.join(CACHE_DIR, filename);

  try {
    await fs.access(filepath);
    const isValid = await validateImageFile(filepath);
    if (isValid) {
      const metadata = await getMetadata(filename);
      saveMetadata(filename, {
        ...metadata,
        url: tmdbUrl,
        accessCount: (metadata?.accessCount || 0) + 1,
        lastAccess: new Date().toISOString(),
      }).catch(() => {});

      return `/api/v1/images/cache/${filename}`;
    } else {
      await fs.unlink(filepath).catch(() => {});
    }
  } catch {
    // File doesn't exist yet, will queue and return cache path
  }

  // Always queue if not cached, but return the expected cache path
  // The image endpoint will handle actual caching on first request
  await queueImageForCaching(tmdbUrl).catch(err =>
    console.warn(`Failed to queue image for caching: ${tmdbUrl}`, (err as Error).message)
  );

  return `/api/v1/images/cache/${filename}`;
}

export async function getCachedImageUrls(urls: string[]): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  const validUrls = urls.filter(Boolean);

  for (let i = 0; i < validUrls.length; i += 10) {
    const batch = validUrls.slice(i, i + 10);
    const batchResults = await Promise.all(batch.map(getCachedImageUrl));
    batch.forEach((url, idx) => {
      results[url] = batchResults[idx]!;
    });
  }

  return results;
}

async function queueImageUrl(url: string): Promise<'queued' | 'cached' | 'missing_metadata'> {
  const cachedFilename = getFilenameFromCachedUrl(url);
  if (cachedFilename) {
    const metadata = await getMetadata(cachedFilename);
    if (metadata?.url) {
      const wasQueued = await queueImageForCaching(metadata.url);
      return wasQueued ? 'queued' : 'cached';
    }
    return 'missing_metadata';
  }

  const wasQueued = await queueImageForCaching(url);
  return wasQueued ? 'queued' : 'cached';
}

export async function queueMissingImages(prisma: PrismaClient): Promise<{
  queued: number;
  alreadyCached?: number;
  missingMetadata?: number;
  queueSize?: number;
  error?: string;
}> {
  try {
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
      if (item.posterPath) {
        const result = await queueImageUrl(item.posterPath);
        if (result === 'queued') queued++;
        else if (result === 'cached') alreadyCached++;
        else if (result === 'missing_metadata') missingMetadata++;
      }

      if (item.backdropPath) {
        const result = await queueImageUrl(item.backdropPath);
        if (result === 'queued') queued++;
        else if (result === 'cached') alreadyCached++;
        else if (result === 'missing_metadata') missingMetadata++;
      }
    }

    console.log(`Image cache queue: ${queued} queued, ${alreadyCached} already cached, ${missingMetadata} missing metadata (${cacheQueue.size} in queue, ${processingQueue.size} processing)`);

    if (cacheQueue.size > 0) {
      setImmediate(() => {
        processCacheQueue().catch(err =>
          console.error('Error starting cache queue processor:', (err as Error).message)
        );
      });
    }

    return { queued, alreadyCached, missingMetadata, queueSize: cacheQueue.size };
  } catch (error) {
    console.error('Error queueing missing images:', (error as Error).message);
    return { queued: 0, error: (error as Error).message };
  }
}

/**
 * Stop the cache queue processor and clear all queues.
 * Call this when shutting down the application.
 */
export function stopCacheQueue(): void {
  queueProcessorStopped = true;
  cacheQueue.clear();
  processingQueue.clear();
}

/**
 * Reset the cache queue (for testing purposes).
 */
export function resetCacheQueue(): void {
  queueProcessorStopped = false;
  queueProcessorRunning = false;
  cacheQueue.clear();
  processingQueue.clear();
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
  stopCacheQueue,
  resetCacheQueue,
};
