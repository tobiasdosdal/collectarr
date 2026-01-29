import { createCanvas } from 'canvas';
import path from 'path';
import fs from 'fs/promises';

const POSTER_WIDTH = 500;
const POSTER_HEIGHT = 750;
const UPLOADS_DIR = './uploads/posters';

interface CollectionPosterOptions {
  collectionId: string;
  collectionName: string;
}

export async function generateCollectionPoster(
  options: CollectionPosterOptions
): Promise<string | null> {
  const { collectionId, collectionName } = options;

  try {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });

    const canvas = createCanvas(POSTER_WIDTH, POSTER_HEIGHT);
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 0, POSTER_HEIGHT);
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(0.5, '#2d1b5a');
    gradient.addColorStop(1, '#1a1a2e');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(40, POSTER_HEIGHT - 140, POSTER_WIDTH - 80, 100);

    const title = collectionName.length > 30
      ? collectionName.slice(0, 27) + '...'
      : collectionName;

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px Arial, "Helvetica Neue", Helvetica, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, POSTER_WIDTH / 2, POSTER_HEIGHT - 90);

    const filename = `poster-${collectionId}.png`;
    const filepath = path.join(UPLOADS_DIR, filename);
    const buffer = canvas.toBuffer('image/png');
    await fs.writeFile(filepath, buffer);

    return `/api/v1/images/collage/${filename}`;
  } catch (error) {
    console.error('Failed to generate collection poster:', error);
    return null;
  }
}

interface PrismaCollection {
  id: string;
  name: string;
}

export async function regenerateAllCollectionPosters(
  prisma: { collection: { findMany: () => Promise<PrismaCollection[]>; update: (args: {
    where: { id: string };
    data: { posterPath: string };
  }) => Promise<void>; } }
): Promise<{ generated: number; failed: number }> {
  const collections = await prisma.collection.findMany();

  let generated = 0;
  let failed = 0;

  for (const collection of collections) {
    const posterUrl = await generateCollectionPoster({
      collectionId: collection.id,
      collectionName: collection.name,
    });

    if (posterUrl) {
      await prisma.collection.update({
        where: { id: collection.id },
        data: { posterPath: posterUrl },
      });
      generated++;
    } else {
      failed++;
    }
  }

  return { generated, failed };
}
