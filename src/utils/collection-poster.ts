import { createCanvas, loadImage } from 'canvas';
import path from 'path';
import fs from 'fs/promises';

const POSTER_WIDTH = 500;
const POSTER_HEIGHT = 750;
const UPLOADS_DIR = './uploads/posters';
const THUMB_WIDTH = 250;
const THUMB_HEIGHT = 225;
const GRID_Y_OFFSET = 80;
const BAR_HEIGHT = 80;
const MAX_TITLE_LENGTH = 25;
const FONT_SIZE = 26;

interface CollectionPosterOptions {
  collectionId: string;
  collectionName: string;
  itemCount: number;
  itemPosterPaths: string[];
}

export async function generateCollectionPoster(
  options: CollectionPosterOptions
): Promise<string | null> {
  const { collectionId, collectionName, itemPosterPaths } = options;

  try {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });

    const canvas = createCanvas(POSTER_WIDTH, POSTER_HEIGHT);
    const ctx = canvas.getContext('2d');

    drawGradientBackground(ctx);

    const thumbnailsToShow = itemPosterPaths.slice(0, 4);
    if (thumbnailsToShow.length > 0) {
      await drawThumbnailGrid(ctx, thumbnailsToShow);
    }

    drawBottomBar(ctx, collectionName);

    const filename = `collage-${collectionId}.png`;
    const filepath = path.join(UPLOADS_DIR, filename);
    const buffer = canvas.toBuffer('image/png');
    await fs.writeFile(filepath, buffer);

    return `/api/v1/images/collage/${filename}`;
  } catch (error) {
    console.error('Failed to generate collection poster:', error);
    return null;
  }
}

function drawGradientBackground(ctx: ReturnType<typeof createCanvas>['getContext'] extends (arg: '2d') => infer R ? R : never): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, POSTER_HEIGHT);
  gradient.addColorStop(0, '#1a1a2e');
  gradient.addColorStop(1, '#2d1b5a');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
}

async function drawThumbnailGrid(
  ctx: ReturnType<typeof createCanvas>['getContext'] extends (arg: '2d') => infer R ? R : never,
  thumbnailPaths: string[]
): Promise<void> {
  for (let i = 0; i < thumbnailPaths.length && i < 4; i++) {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const x = col * THUMB_WIDTH;
    const y = GRID_Y_OFFSET + (row * THUMB_HEIGHT);

    try {
      const thumbPath = thumbnailPaths[i];
      if (!thumbPath) continue;

      let imagePath: string;
      
      if (thumbPath.startsWith('/')) {
        imagePath = `.${thumbPath}`;
      } else {
        imagePath = thumbPath;
      }

      const image = await loadImage(imagePath);
      ctx.drawImage(image, x, y, THUMB_WIDTH, THUMB_HEIGHT);
    } catch {
      // Thumbnail loading failed - continue with remaining thumbnails
    }
  }
}

function drawBottomBar(
  ctx: ReturnType<typeof createCanvas>['getContext'] extends (arg: '2d') => infer R ? R : never,
  collectionName: string
): void {
  const barY = POSTER_HEIGHT - BAR_HEIGHT;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
  ctx.fillRect(0, barY, POSTER_WIDTH, BAR_HEIGHT);

  const title = collectionName.length > MAX_TITLE_LENGTH
    ? collectionName.slice(0, MAX_TITLE_LENGTH - 3) + '...'
    : collectionName;

  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${FONT_SIZE}px Arial, "Helvetica Neue", Helvetica, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  const textX = POSTER_WIDTH / 2;
  const textY = barY + (BAR_HEIGHT / 2);
  ctx.fillText(title, textX, textY);
}

interface PrismaCollection {
  id: string;
  name: string;
  items: { posterPath: string | null }[];
  _count: { items: number };
}

export async function regenerateAllCollectionPosters(
  prisma: { collection: { findMany: (args: {
    include: {
      items: { take: number; orderBy: { createdAt: string }; select: { posterPath: boolean } };
      _count: { select: { items: boolean } };
    };
  }) => Promise<PrismaCollection[]>; update: (args: {
    where: { id: string };
    data: { posterPath: string };
  }) => Promise<void>; } }
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
      .map((item) => item.posterPath)
      .filter((p): p is string => Boolean(p));

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
