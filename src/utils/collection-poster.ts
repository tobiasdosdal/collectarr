import { createCanvas } from 'canvas';
import path from 'path';
import fs from 'fs/promises';

const POSTER_WIDTH = 500;
const POSTER_HEIGHT = 750;
const UPLOADS_DIR = './uploads/posters';
const FONT_SIZE = 52;
const MAX_CHARS_PER_LINE = 16;
const LINE_HEIGHT = 70;

interface CollectionPosterOptions {
  collectionId: string;
  collectionName: string;
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length <= maxChars) {
      currentLine = (currentLine + ' ' + word).trim();
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines.length > 0 ? lines : [text.slice(0, maxChars)];
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

    const lines = wrapText(collectionName, MAX_CHARS_PER_LINE).slice(0, 3);
    if (lines.length === 3 && collectionName.length > MAX_CHARS_PER_LINE * 3 && lines[2]) {
      lines[2] = lines[2].slice(0, MAX_CHARS_PER_LINE - 3) + '...';
    }

    const totalTextHeight = lines.length * LINE_HEIGHT;
    const startY = (POSTER_HEIGHT - totalTextHeight) / 2 + (LINE_HEIGHT / 2);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    const padding = 40;
    const boxHeight = totalTextHeight + padding * 2;
    const boxY = startY - (LINE_HEIGHT / 2) - padding;
    ctx.fillRect(30, boxY, POSTER_WIDTH - 60, boxHeight);

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${FONT_SIZE}px Arial, "Helvetica Neue", Helvetica, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    lines.forEach((line, index) => {
      const y = startY + (index * LINE_HEIGHT);
      ctx.fillText(line, POSTER_WIDTH / 2, y);
    });

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
