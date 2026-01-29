import { Jimp } from 'jimp';
import path from 'path';
import fs from 'fs/promises';

const POSTER_WIDTH = 500;
const POSTER_HEIGHT = 750;
const UPLOADS_DIR = './uploads/posters';

function rgbaToInt(r: number, g: number, b: number, a: number): number {
  return (r << 24) + (g << 16) + (b << 8) + a;
}

interface CollectionPosterOptions {
  collectionId: string;
  collectionName: string;
  itemCount: number;
  itemPosterPaths: string[];
}

export async function generateCollectionPoster(
  options: CollectionPosterOptions
): Promise<string | null> {
  const { collectionId, itemPosterPaths } = options;

  try {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });

    const poster = new Jimp({ width: POSTER_WIDTH, height: POSTER_HEIGHT, color: 0x1a1a2eFF });

    for (let y = 0; y < POSTER_HEIGHT; y++) {
      const ratio = y / POSTER_HEIGHT;
      const r = Math.floor(26 + (45 - 26) * ratio);
      const g = Math.floor(26 + (27 - 26) * ratio);
      const b = Math.floor(46 + (90 - 46) * ratio);
      
      for (let x = 0; x < POSTER_WIDTH; x++) {
        poster.setPixelColor(rgbaToInt(r, g, b, 255), x, y);
      }
    }

    const thumbnailsToShow = itemPosterPaths.slice(0, 4);
    if (thumbnailsToShow.length > 0) {
      await addThumbnailGrid(poster, thumbnailsToShow);
    }

    await addTextOverlay(poster);

    const filename = `collage-${collectionId}.png`;
    const filepath = path.join(UPLOADS_DIR, filename);
    await poster.write(filepath as `${string}.${string}`);

    return `/api/v1/images/collage/${filename}`;
  } catch (error) {
    console.error('Failed to generate collection poster:', error);
    return null;
  }
}

async function addThumbnailGrid(poster: InstanceType<typeof Jimp>, thumbnailPaths: string[]): Promise<void> {
  const thumbWidth = POSTER_WIDTH / 2;
  const thumbHeight = (POSTER_HEIGHT * 0.6) / 2;

  for (let i = 0; i < thumbnailPaths.length && i < 4; i++) {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const x = col * thumbWidth;
    const y = 80 + (row * thumbHeight);

    try {
      const thumbPath = thumbnailPaths[i];
      if (!thumbPath) continue;
      
      let thumbBuffer: Buffer | null = null;
      
      if (thumbPath.startsWith('/')) {
        const fullPath = `.${thumbPath}`;
        try {
          await fs.access(fullPath);
          thumbBuffer = await fs.readFile(fullPath);
        } catch {}
      } else if (thumbPath.startsWith('http')) {
        const response = await fetch(thumbPath);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          thumbBuffer = Buffer.from(arrayBuffer);
        }
      }

      if (thumbBuffer) {
        const thumb = await Jimp.read(thumbBuffer);
        thumb.resize({ w: Math.floor(thumbWidth), h: Math.floor(thumbHeight) });
        poster.composite(thumb, x, y);
      }
    } catch {}
  }
}

async function addTextOverlay(poster: InstanceType<typeof Jimp>): Promise<void> {
  const barHeight = 80;
  const barY = POSTER_HEIGHT - barHeight;
  
  for (let y = barY; y < POSTER_HEIGHT; y++) {
    for (let x = 0; x < POSTER_WIDTH; x++) {
      poster.setPixelColor(rgbaToInt(0, 0, 0, 200), x, y);
    }
  }
}

export async function regenerateAllCollectionPosters(
  prisma: any
): Promise<{ generated: number; failed: number }> {
  const collections = await prisma.collection.findMany({
    include: {
      items: {
        take: 4,
        orderBy: { createdAt: 'desc' },
        select: { posterPath: true },
      },
      _count: { select: { items: true } },
    },
  });

  let generated = 0;
  let failed = 0;

  for (const collection of collections) {
    const itemPaths = collection.items
      .map((item: { posterPath: string | null }) => item.posterPath)
      .filter((path: string | null): path is string => Boolean(path));

    if (itemPaths.length === 0) {
      failed++;
      continue;
    }

    const posterUrl = await generateCollectionPoster({
      collectionId: collection.id,
      collectionName: collection.name,
      itemCount: collection._count.items,
      itemPosterPaths: itemPaths,
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
