import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

export function promoDir(root = process.env.ENGINE_DATA_DIR || join(process.cwd(), 'data', 'engine')) {
  return join(root, 'promos');
}

export function loadPromoState(dir) {
  try {
    const parsed = JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8'));
    return {
      approveFirst: parsed.approveFirst !== false,
      items: Array.isArray(parsed.items) ? parsed.items : [],
      seen: parsed.seen && typeof parsed.seen === 'object' ? parsed.seen : {},
    };
  } catch {
    return { approveFirst: true, items: [], seen: {} };
  }
}

export function savePromoState(dir, state) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'state.json'), JSON.stringify(state));
}

export function writePng(dir, id, png) {
  const file = join(dir, `${id.replace(/[^a-z0-9:_-]+/gi, '_')}.png`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, png);
  return file;
}

export function readPng(file) {
  if (!file || !existsSync(file)) return null;
  return readFileSync(file);
}

export function removeFile(file) {
  try {
    if (file && existsSync(file)) unlinkSync(file);
  } catch {
    /* a missing file is already gone */
  }
}
