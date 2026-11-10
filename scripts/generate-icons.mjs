import { deflateSync } from 'node:zlib';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function pngRect(width, height, pixel) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = pixel(x, y, width, height);
      const index = row + 1 + x * 4;
      raw[index] = r;
      raw[index + 1] = g;
      raw[index + 2] = b;
      raw[index + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function insideRound(x, y, size, radius) {
  const max = size - 1;
  const dx = x < radius ? radius - x : x > max - radius ? x - (max - radius) : 0;
  const dy = y < radius ? radius - y : y > max - radius ? y - (max - radius) : 0;
  return dx * dx + dy * dy <= radius * radius;
}

function inB(nx, ny) {
  const stem = nx >= 0.3 && nx <= 0.4 && ny >= 0.22 && ny <= 0.78;
  const upper = nx >= 0.38 && nx <= 0.66 && ny >= 0.22 && ny <= 0.48 && !(nx > 0.5 && ny > 0.32 && ny < 0.4 && nx < 0.58);
  const lower = nx >= 0.38 && nx <= 0.7 && ny >= 0.5 && ny <= 0.78 && !(nx > 0.5 && ny > 0.6 && ny < 0.68 && nx < 0.6);
  return stem || upper || lower;
}

function png(size, pixel) {
  return pngRect(size, size, (x, y) => pixel(x, y, size));
}

function paint(maskable) {
  return (x, y, size) => {
    const radius = maskable ? 0 : size * 0.22;
    if (!insideRound(x, y, size, radius)) return [0, 0, 0, 0];
    const pad = maskable ? 0.18 : 0;
    const nx = (x / (size - 1) - pad) / (1 - pad * 2);
    const ny = (y / (size - 1) - pad) / (1 - pad * 2);
    if (nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1 && inB(nx, ny)) return [255, 255, 255, 255];
    return [225, 29, 46, 255];
  };
}

mkdirSync(root, { recursive: true });
writeFileSync(join(root, 'icon-192.png'), png(192, paint(false)));
writeFileSync(join(root, 'icon-512.png'), png(512, paint(false)));
writeFileSync(join(root, 'icon-maskable-512.png'), png(512, paint(true)));
writeFileSync(join(root, 'apple-touch-icon.png'), png(180, paint(false)));
console.log('Wrote icons to public/icons');

const androidRes = join(dirname(fileURLToPath(import.meta.url)), '..', 'android', 'app', 'src', 'main', 'res');
if (existsSync(androidRes)) {
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.png')) {
        const header = readFileSync(path);
        const width = header.readUInt32BE(16);
        const height = header.readUInt32BE(20);
        const square = width === height;
        const file = entry.name;
        let image;
        if (file.startsWith('splash')) {
          image = pngRect(width, height, (x, y) => {
            const mark = Math.round(Math.min(width, height) * 0.28);
            const left = Math.round((width - mark) / 2);
            const top = Math.round((height - mark) / 2);
            if (x < left || y < top || x >= left + mark || y >= top + mark) return [7, 8, 12, 255];
            const color = paint(false)(x - left, y - top, mark);
            return color[3] === 0 ? [7, 8, 12, 255] : color;
          });
        } else if (file.includes('foreground') && square) {
          image = png(width, paint(true));
        } else if (square) {
          image = png(width, paint(false));
        }
        if (image) writeFileSync(path, image);
      }
    }
  };
  walk(androidRes);
  console.log('Wrote Android launcher and splash icons');
}
