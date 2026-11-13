/**
 * Fictional star cut-outs. These are AI-generated players in plain kits,
 * not photographs of real footballers. The drawn cartoon players are gone.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { coloursFromPng } from './crestColour.mjs';

const assetDir = join(dirname(fileURLToPath(import.meta.url)), '../assets/stars');
const library = JSON.parse(readFileSync(join(assetDir, 'manifest.json'), 'utf8')).items;
const hrefs = new Map();

const COUNTRY = {
  ghana: 'GH',
  'black stars': 'GH',
  nigeria: 'NG',
  'super eagles': 'NG',
  senegal: 'SN',
  'ivory coast': 'CI',
  "cote d'ivoire": 'CI',
  'cote divoire': 'CI',
  'cote d ivoire': 'CI',
  cameroon: 'CM',
  morocco: 'MA',
  egypt: 'EG',
  england: 'ENG',
  france: 'FR',
  brazil: 'BR',
  argentina: 'AR',
  germany: 'DE',
  spain: 'ES',
  portugal: 'PT',
  netherlands: 'NL',
  holland: 'NL',
  italy: 'IT',
};

/** Home-kit colours when we know them. Crest sampling covers everyone else. */
const KITS = {
  arsenal: ['#C8102E', '#FFFFFF'],
  'borussia dortmund': ['#FDE100', '#111111'],
  dortmund: ['#FDE100', '#111111'],
  'heart of lions': ['#B4232D', '#F0C94A'],
  'dreams fc': ['#1A4FD8', '#F0C94A'],
  chelsea: ['#034694', '#FFFFFF'],
  liverpool: ['#C8102E', '#FFFFFF'],
  'manchester united': ['#DA291C', '#FFFFFF'],
  'manchester city': ['#6CABDD', '#FFFFFF'],
  barcelona: ['#A50044', '#004D98'],
  'fc barcelona': ['#A50044', '#004D98'],
  'real madrid': ['#F4F6FB', '#111111'],
  ghana: ['#F4F6FB', '#C8102E'],
  nigeria: ['#008751', '#FFFFFF'],
  senegal: ['#F4F6FB', '#00853F'],
  'ivory coast': ['#FF8200', '#FFFFFF'],
  cameroon: ['#007A5E', '#FCD116'],
  morocco: ['#C1272D', '#006233'],
  egypt: ['#C8102E', '#FFFFFF'],
  england: ['#F4F6FB', '#C8102E'],
  france: ['#002654', '#ED2939'],
  brazil: ['#FEDD00', '#009C3B'],
  argentina: ['#75AADB', '#FFFFFF'],
  germany: ['#F4F6FB', '#111111'],
  spain: ['#C60B1E', '#F1BF00'],
  portugal: ['#C8102E', '#006600'],
  netherlands: ['#FF6600', '#FFFFFF'],
  italy: ['#0066B3', '#FFFFFF'],
};

function norm(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(u\d+|women|fc|cf|afc|sc)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function countryCode(name) {
  const key = norm(name);
  return COUNTRY[key] || '';
}

function rgb(hex) {
  const raw = String(hex || '').replace('#', '');
  if (raw.length !== 6) return [128, 128, 128];
  return [parseInt(raw.slice(0, 2), 16), parseInt(raw.slice(2, 4), 16), parseInt(raw.slice(4, 6), 16)];
}

function distance(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

function hash(value) {
  let n = 0;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) n = (n * 33 + text.charCodeAt(i)) >>> 0;
  return n;
}

const FALLBACK = ['#C8102E', '#1A4FD8', '#FDE100', '#F4F6FB', '#007A5E', '#111111', '#6BB5E0', '#FF6600'];

export function kitFor(name, crestPath = '') {
  const known = KITS[norm(name)];
  if (known) return { primary: rgb(known[0]), secondary: rgb(known[1]), source: 'kit' };
  if (crestPath) {
    try {
      const colours = coloursFromPng(readFileSync(crestPath));
      if (colours) return { ...colours, source: 'crest' };
    } catch {
      /* a missing crest uses the name fallback */
    }
  }
  const tone = FALLBACK[hash(norm(name)) % FALLBACK.length];
  return { primary: rgb(tone), secondary: [255, 255, 255], source: 'name' };
}

function primaryDistance(item, kit) {
  return distance(rgb(item.primary), kit.primary);
}

function choose(name, kit, facing, avoidId) {
  const code = countryCode(name);
  const national = code ? library.filter((item) => item.country === code) : [];
  const pool = national.length ? national : library.filter((item) => !item.country);
  const faced = pool.filter((item) => item.facing === facing && item.id !== avoidId);
  const list = (faced.length ? faced : pool.filter((item) => item.id !== avoidId)).slice();
  list.sort((a, b) => {
    const pa = primaryDistance(a, kit);
    const pb = primaryDistance(b, kit);
    if (Math.abs(pa - pb) > 3500) return pa - pb || a.id.localeCompare(b.id);
    const sa = distance(rgb(a.secondary), kit.secondary);
    const sb = distance(rgb(b.secondary), kit.secondary);
    return pa + sa * 0.15 - (pb + sb * 0.15) || a.id.localeCompare(b.id);
  });
  const item = list[0] || pool[0];
  return { ...item, mirror: false };
}

/** Home faces right, toward the centre. Away faces left. Shirt numbers are never mirrored. */
export function pickPair(home, away, homeCrest = '', awayCrest = '') {
  const homeKit = kitFor(home, homeCrest);
  const awayKit = kitFor(away, awayCrest);
  const homeStar = choose(home, homeKit, 'right', '');
  const awayStar = choose(away, awayKit, 'left', homeStar.id);
  return { home: homeStar, away: awayStar, homeKit, awayKit };
}

export function starHref(item) {
  if (!hrefs.has(item.id)) {
    const bytes = readFileSync(join(assetDir, item.file));
    hrefs.set(item.id, `data:image/png;base64,${bytes.toString('base64')}`);
  }
  return hrefs.get(item.id);
}

export function playerBox(item, height) {
  const width = Math.round(height * (item.width / item.height));
  return { width, height };
}

/** Soft floor shadow and a kit-coloured rim. The cut-out is never flipped. */
export function playerImage(item, { x, y, height }) {
  const { width } = playerBox(item, height);
  const glow = item.primary || '#e11d2e';
  return `<ellipse cx="${x + width / 2}" cy="${y + height - 6}" rx="${Math.round(width * 0.42)}" ry="18" fill="#000" opacity=".42"/>
    <ellipse cx="${x + width / 2}" cy="${y + height * 0.46}" rx="${Math.round(width * 0.72)}" ry="${Math.round(height * 0.4)}" fill="${glow}" opacity=".28"/>
    <image href="${starHref(item)}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMax meet"/>`;
}

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
