/**
 * Crest image checks. Every badge we keep is decoded, trimmed to a square PNG
 * (at most 128px), and rejected when it is a placeholder, an initials badge,
 * blurry, too small, or sits on a photo-like opaque background.
 */
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { Resvg } from '@resvg/resvg-js';

export const MAX_SIDE = 128;
export const MIN_SIDE = 64;
export const BLUR_LIMIT = 0.17;
export const MIN_VISIBLE = 40;

export function sniff(bytes) {
  if (!bytes || bytes.length < 12) return '';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpeg';
  if (bytes.slice(0, 3).toString('latin1') === 'GIF') return 'gif';
  if (bytes.slice(0, 4).toString('latin1') === 'RIFF' && bytes.slice(8, 12).toString('latin1') === 'WEBP') return 'webp';
  const head = bytes.slice(0, 400).toString('utf8').trimStart().toLowerCase();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'svg';
  return '';
}

/** RGBA pixels, or an Error with a short reason. */
export function decode(bytes) {
  const kind = sniff(bytes);
  if (kind === 'png') {
    const png = PNG.sync.read(bytes);
    return { width: png.width, height: png.height, data: new Uint8Array(png.data), kind };
  }
  if (kind === 'jpeg') {
    const img = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 64 });
    return { width: img.width, height: img.height, data: new Uint8Array(img.data), kind };
  }
  if (kind === 'svg') {
    const rendered = new Resvg(bytes, { fitTo: { mode: 'width', value: 256 }, background: 'rgba(0,0,0,0)' }).render();
    return { width: rendered.width, height: rendered.height, data: new Uint8Array(rendered.pixels), kind };
  }
  throw new Error(kind ? `unsupported ${kind}` : 'not an image');
}

function at(img, x, y) {
  return (y * img.width + x) * 4;
}

/** Crop to the visible pixels so padding does not hide a small badge. */
export function trim(img) {
  let minX = img.width;
  let minY = img.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < img.height; y += 1) {
    for (let x = 0; x < img.width; x += 1) {
      if (img.data[at(img, x, y) + 3] > 16) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { ...img, width: 0, height: 0, data: new Uint8Array(0) };
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  if (width === img.width && height === img.height) return img;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const from = at(img, minX, minY + y);
    data.set(img.data.subarray(from, from + width * 4), y * width * 4);
  }
  return { ...img, width, height, data };
}

/** Area-average downscale (never upscales), then centre on a transparent square. */
export function fitSquare(img, maxSide = MAX_SIDE) {
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const scaled = new Float64Array(w * h * 4);
  if (scale === 1) {
    for (let i = 0; i < img.data.length; i += 1) scaled[i] = img.data[i];
  } else {
    const weight = new Float64Array(w * h);
    for (let y = 0; y < img.height; y += 1) {
      const ty = Math.min(h - 1, Math.floor(y * scale));
      for (let x = 0; x < img.width; x += 1) {
        const tx = Math.min(w - 1, Math.floor(x * scale));
        const s = at(img, x, y);
        const t = (ty * w + tx);
        const a = img.data[s + 3] / 255;
        scaled[t * 4] += img.data[s] * a;
        scaled[t * 4 + 1] += img.data[s + 1] * a;
        scaled[t * 4 + 2] += img.data[s + 2] * a;
        scaled[t * 4 + 3] += img.data[s + 3];
        weight[t] += 1;
      }
    }
    for (let t = 0; t < w * h; t += 1) {
      const n = weight[t] || 1;
      const alpha = scaled[t * 4 + 3] / n;
      const cover = scaled[t * 4 + 3] / 255 || 1;
      scaled[t * 4] /= cover;
      scaled[t * 4 + 1] /= cover;
      scaled[t * 4 + 2] /= cover;
      scaled[t * 4 + 3] = alpha;
    }
  }
  const side = Math.max(w, h);
  const out = new Uint8Array(side * side * 4);
  const ox = Math.floor((side - w) / 2);
  const oy = Math.floor((side - h) / 2);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const s = (y * w + x) * 4;
      const t = ((y + oy) * side + x + ox) * 4;
      for (let c = 0; c < 4; c += 1) out[t + c] = Math.max(0, Math.min(255, Math.round(scaled[s + c])));
    }
  }
  return { width: side, height: side, data: out };
}

function opaque(img) {
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] < 250) return false;
  return true;
}

function close(data, i, color, tolerance) {
  return Math.abs(data[i] - color[0]) + Math.abs(data[i + 1] - color[1]) + Math.abs(data[i + 2] - color[2]) <= tolerance;
}

/** The border colour when the frame is one flat colour, else null. */
export function flatBorder(img, tolerance = 36) {
  const ring = [];
  for (let x = 0; x < img.width; x += 1) ring.push(at(img, x, 0), at(img, x, img.height - 1));
  for (let y = 0; y < img.height; y += 1) ring.push(at(img, 0, y), at(img, img.width - 1, y));
  const first = ring[0];
  const color = [img.data[first], img.data[first + 1], img.data[first + 2]];
  const agree = ring.filter((i) => close(img.data, i, color, tolerance)).length;
  return agree / ring.length >= 0.97 ? color : null;
}

/** Opaque badge on a flat backdrop: flood the backdrop out from the edges. */
export function clearBackdrop(img, color, tolerance = 36) {
  const data = new Uint8Array(img.data);
  const seen = new Uint8Array(img.width * img.height);
  const stack = [];
  for (let x = 0; x < img.width; x += 1) stack.push([x, 0], [x, img.height - 1]);
  for (let y = 0; y < img.height; y += 1) stack.push([0, y], [img.width - 1, y]);
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
    const p = y * img.width + x;
    if (seen[p]) continue;
    seen[p] = 1;
    if (!close(data, p * 4, color, tolerance)) continue;
    data[p * 4 + 3] = 0;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return { ...img, data };
}

function bilinear(small, width, height) {
  const out = { width, height, data: new Uint8Array(width * height * 4) };
  for (let y = 0; y < height; y += 1) {
    const fy = Math.min(small.height - 1, Math.max(0, ((y + 0.5) * small.height) / height - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(small.height - 1, y0 + 1);
    const dy = fy - y0;
    for (let x = 0; x < width; x += 1) {
      const fx = Math.min(small.width - 1, Math.max(0, ((x + 0.5) * small.width) / width - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(small.width - 1, x0 + 1);
      const dx = fx - x0;
      for (let c = 0; c < 4; c += 1) {
        const top = small.data[(y0 * small.width + x0) * 4 + c] * (1 - dx) + small.data[(y0 * small.width + x1) * 4 + c] * dx;
        const bottom = small.data[(y1 * small.width + x0) * 4 + c] * (1 - dx) + small.data[(y1 * small.width + x1) * 4 + c] * dx;
        out.data[(y * width + x) * 4 + c] = top * (1 - dy) + bottom * dy;
      }
    }
  }
  return out;
}

function shades(img) {
  const out = new Float64Array(img.width * img.height);
  for (let p = 0; p < out.length; p += 1) {
    const a = img.data[p * 4 + 3];
    out[p] = ((0.299 * img.data[p * 4] + 0.587 * img.data[p * 4 + 1] + 0.114 * img.data[p * 4 + 2]) * a + 128 * (255 - a)) / 255;
  }
  return out;
}

/**
 * Fine detail: how much of the picture is lost by halving it and scaling back,
 * relative to its edges. Real badges score about 0.20 or more; a badge blown
 * up from 32px or less scores about 0.15 or less.
 */
function detail(img, lum) {
  if (img.width < 16) return 1;
  const half = fitSquare(img, Math.max(8, Math.round(img.width / 2)));
  const back = shades(bilinear(half, img.width, img.height));
  const w = img.width;
  let lost = 0;
  let edges = 0;
  for (let y = 1; y < img.height - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const p = y * w + x;
      lost += Math.abs(lum[p] - back[p]);
      edges += Math.abs(lum[p + 1] - lum[p - 1]) + Math.abs(lum[p + w] - lum[p - w]);
    }
  }
  return edges ? lost / edges : 1;
}

/** Numbers the checks use; exported for tests and the admin view. */
export function measure(img) {
  const { width, height, data } = img;
  let visible = 0;
  const colors = new Map();
  let insideDisc = 0;
  let insideDiscVisible = 0;
  let outsideDiscVisible = 0;
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const r = Math.min(width, height) / 2;
  const lum = new Float64Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = at(img, x, y);
      const a = data[i + 3];
      const p = y * width + x;
      const shade = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      lum[p] = (shade * a + 128 * (255 - a)) / 255;
      const d = Math.hypot(x - cx, y - cy);
      const inDisc = d <= r - 1.5;
      const outDisc = d >= r + 0.5;
      if (inDisc) insideDisc += 1;
      if (a > 200) {
        visible += 1;
        if (inDisc) insideDiscVisible += 1;
        if (outDisc) outsideDiscVisible += 1;
        const key = (data[i] >> 4) * 256 + (data[i + 1] >> 4) * 16 + (data[i + 2] >> 4);
        colors.set(key, (colors.get(key) || 0) + 1);
      }
    }
  }
  const counts = [...colors.values()].sort((a, b) => b - a);
  const topTwo = visible ? ((counts[0] || 0) + (counts[1] || 0)) / visible : 0;
  const total = width * height;
  const coverage = total ? visible / total : 0;
  const disc = insideDisc > 0 && insideDiscVisible / insideDisc > 0.97 && outsideDiscVisible / Math.max(1, visible) < 0.02;
  const square = coverage > 0.97;
  return { width, height, coverage, colors: counts.length, topTwo, shape: disc ? 'disc' : square ? 'square' : 'other', sharpness: detail(img, lum) };
}

/**
 * Decode, check and normalise one crest. Returns { ok, png, reason, metrics }.
 * force skips the initials and blur checks (a manual override), never the decode or size.
 */
export function prepareCrest(bytes, { force = false, minSide = MIN_SIDE } = {}) {
  if (!bytes || bytes.length < 120) return { ok: false, reason: 'placeholder (tiny file)' };
  let img;
  try {
    img = decode(bytes);
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'decode failed' };
  }
  if (img.width <= 2 || img.height <= 2) return { ok: false, reason: 'placeholder (1x1)' };
  if (Math.max(img.width, img.height) < minSide) return { ok: false, reason: `too small (${img.width}x${img.height})` };
  if (opaque(img)) {
    const color = flatBorder(img);
    if (color) img = clearBackdrop(img, color);
    else if (!force && measure(fitSquare(img)).colors > 900) return { ok: false, reason: 'opaque photo background' };
  }
  img = trim(img);
  if (!img.width) return { ok: false, reason: 'empty image' };
  if (Math.max(img.width, img.height) < MIN_VISIBLE) return { ok: false, reason: `too small (${img.width}x${img.height} visible)` };
  const fitted = fitSquare(img);
  const metrics = measure(fitted);
  if (metrics.coverage < 0.08) return { ok: false, reason: 'mostly empty', metrics };
  if (!force) {
    if ((metrics.shape === 'disc' || metrics.shape === 'square') && metrics.topTwo > 0.95) return { ok: false, reason: 'initials badge', metrics };
    if (metrics.sharpness < BLUR_LIMIT) return { ok: false, reason: 'blurry', metrics };
  }
  const png = PNG.sync.write({ width: fitted.width, height: fitted.height, data: Buffer.from(fitted.data) }, { colorType: 6 });
  return { ok: true, png, metrics, native: { width: img.width, height: img.height } };
}
