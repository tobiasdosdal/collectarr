import path from 'path';

export function getDataDir(): string {
  const dataDir = process.env.DATA_DIR || 'data';
  return path.resolve(process.cwd(), dataDir);
}

export function getUploadsDir(): string {
  const uploadsDir = process.env.UPLOADS_DIR || path.join(getDataDir(), 'uploads');
  return path.resolve(process.cwd(), uploadsDir);
}

export function getPostersDir(): string {
  return path.join(getUploadsDir(), 'posters');
}

export function getImageCacheDir(): string {
  const cacheDir = process.env.IMAGE_CACHE_DIR || path.join(getDataDir(), 'image-cache');
  return path.resolve(process.cwd(), cacheDir);
}
