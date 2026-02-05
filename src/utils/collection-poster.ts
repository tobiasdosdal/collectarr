import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createCanvas } from 'canvas';
import { getPostersDir } from './paths.js';
import { createLogger } from './runtime-logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const POSTER_WIDTH = 500;
const POSTER_HEIGHT = 750;
const POSTERS_DIR = getPostersDir();
const FONT_SIZE = 52;
const MAX_CHARS_PER_LINE = 16;
const LINE_HEIGHT = 70;
const log = createLogger('collection-poster');

// Font stack with fallbacks for Alpine Linux Docker environment
const FONT_FAMILY = "'Liberation Sans', 'DejaVu Sans', 'Bitstream Vera Sans', Arial, sans-serif";

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
    await fs.mkdir(POSTERS_DIR, { recursive: true });

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
    const startY = (POSTER_HEIGHT - totalTextHeight) / 2;

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${FONT_SIZE}px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    lines.forEach((line, index) => {
      const y = startY + (index * LINE_HEIGHT) + (LINE_HEIGHT / 2);
      ctx.fillText(line, POSTER_WIDTH / 2, y);
    });

    const filename = `poster-${collectionId}.png`;
    const filepath = path.join(POSTERS_DIR, filename);
    const buffer = canvas.toBuffer('image/png');

    // Atomic file write: write to temp file first, then rename
    const tempPath = `${filepath}.tmp`;
    await fs.writeFile(tempPath, buffer);
    await fs.rename(tempPath, filepath);

    return `/api/v1/images/collage/${filename}`;
  } catch (error) {
    log.error('Failed to generate collection poster', {
      collectionId,
      collectionName,
      error: (error as Error).message,
    });
    return null;
  }
}

export function getGeneratedPosterPath(collectionId: string): string {
  return path.join(POSTERS_DIR, `poster-${collectionId}.png`);
}

export function getUploadedPosterPath(collectionId: string, ext: string): string {
  return path.join(POSTERS_DIR, `${collectionId}.${ext}`);
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
