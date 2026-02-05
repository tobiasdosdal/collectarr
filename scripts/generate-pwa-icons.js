import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createCanvas } from 'canvas';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(scriptDir, '..', 'client', 'public');

const BACKGROUND_COLOR = '#1a1a2e';
const RECT_COLOR = '#151526';
const TEXT_COLOR = '#D4A843';

const icons = [
  { name: 'pwa-192x192.png', size: 192 },
  { name: 'pwa-512x512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
];

function drawRoundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function generateIcon({ name, size }) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = BACKGROUND_COLOR;
  ctx.fillRect(0, 0, size, size);

  const padding = Math.round(size * 0.12);
  const rectSize = size - padding * 2;
  const radius = Math.round(size * 0.14);

  drawRoundedRect(ctx, padding, padding, rectSize, rectSize, radius);
  ctx.fillStyle = RECT_COLOR;
  ctx.fill();

  ctx.fillStyle = TEXT_COLOR;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${Math.round(size * 0.6)}px sans-serif`;
  ctx.fillText('C', size / 2, size / 2 + size * 0.02);

  const outputPath = path.join(publicDir, name);
  fs.writeFileSync(outputPath, canvas.toBuffer('image/png'));
}

fs.mkdirSync(publicDir, { recursive: true });

icons.forEach(generateIcon);

console.log(`Generated ${icons.length} PWA icons in ${publicDir}`);
