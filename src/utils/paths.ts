import path from 'path';

export function getUploadsDir(): string {
  const uploadsDir = process.env.UPLOADS_DIR || 'data/uploads';
  return path.resolve(process.cwd(), uploadsDir);
}

export function getPostersDir(): string {
  return path.join(getUploadsDir(), 'posters');
}
