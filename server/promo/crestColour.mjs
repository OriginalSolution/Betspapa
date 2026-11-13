import { inflateSync } from 'node:zlib';

/**
 * Dominant kit-like colours from a crest PNG.
 * Gold and white borders, and the pale background, are ignored.
 * Saturated pixels inside the badge count for more than a grey field.
 */
export function coloursFromPng(buffer) {
  const decoded = decodeRgba(buffer);
  if (!decoded) return null;
  const { width, height, data } = decoded;
  const buckets = new Map();
  const step = Math.max(1, Math.floor(Math.min(width, height) / 32));
  const insetX = Math.floor(width * 0.18);
  const insetY = Math.floor(height * 0.18);
  for (let y = insetY; y < height - insetY; y += step) {
    for (let x = insetX; x < width - insetX; x += step) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 160) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (isWash(r, g, b) || isGold(r, g, b)) continue;
      const weight = saturation(r, g, b);
      if (weight < 0.16) continue;
      const key = `${r >> 4},${g >> 4},${b >> 4}`;
      buckets.set(key, (buckets.get(key) || 0) + weight);
    }
  }
  const ranked = [...buckets.entries()].sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return null;
  const rgb = (key) => key.split(',').map((part) => (Number(part) << 4) + 8);
  const primary = rgb(ranked[0][0]);
  let secondary = [244, 246, 251];
  for (const [key] of ranked.slice(1, 12)) {
    const next = rgb(key);
    if (distance(primary, next) > 70 * 70) {
      secondary = next;
      break;
    }
  }
  return { primary, secondary };
}

function saturation(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return 0;
  return (max - min) / max;
}

function isWash(r, g, b) {
  return r > 214 && g > 214 && b > 200;
}

function isGold(r, g, b) {
  return r > 165 && g > 120 && b < 110 && r + g > b * 3;
}

function distance(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

function decodeRgba(buffer) {
  if (!buffer || buffer.length < 8 || buffer[0] !== 137 || buffer[1] !== 80) return null;
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const start = offset + 8;
    const end = start + length;
    if (end + 4 > buffer.length) return null;
    if (type === 'IHDR') {
      width = buffer.readUInt32BE(start);
      height = buffer.readUInt32BE(start + 4);
      bitDepth = buffer[start + 8];
      colorType = buffer[start + 9];
      interlace = buffer[start + 12];
    } else if (type === 'IDAT') {
      idat.push(buffer.subarray(start, end));
    } else if (type === 'IEND') break;
    offset = end + 4;
  }
  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0 || width < 1 || height < 1 || width * height > 512 * 512) return null;
  let inflated;
  try {
    inflated = inflateSync(Buffer.concat(idat));
  } catch {
    return null;
  }
  const stride = width * 4;
  const data = Buffer.alloc(width * height * 4);
  let src = 0;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[src];
    src += 1;
    const row = Buffer.from(inflated.subarray(src, src + stride));
    src += stride;
    for (let i = 0; i < stride; i += 1) {
      const left = i >= 4 ? row[i - 4] : 0;
      const up = prev[i];
      const ul = i >= 4 ? prev[i - 4] : 0;
      if (filter === 1) row[i] = (row[i] + left) & 255;
      else if (filter === 2) row[i] = (row[i] + up) & 255;
      else if (filter === 3) row[i] = (row[i] + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) row[i] = (row[i] + paeth(left, up, ul)) & 255;
    }
    row.copy(data, y * stride);
    prev = row;
  }
  return { width, height, data };
}

function paeth(left, up, ul) {
  const estimate = left + up - ul;
  const dl = Math.abs(estimate - left);
  const du = Math.abs(estimate - up);
  const dul = Math.abs(estimate - ul);
  if (dl <= du && dl <= dul) return left;
  if (du <= dul) return up;
  return ul;
}
