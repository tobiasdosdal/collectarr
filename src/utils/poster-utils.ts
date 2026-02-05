import fs from 'fs/promises';
import { getPostersDir } from './paths.js';

export async function hasUploadedPoster(collectionId: string): Promise<boolean> {
  try {
    const files = await fs.readdir(getPostersDir());
    return files.some((file) => file.startsWith(collectionId));
  } catch {
    return false;
  }
}
