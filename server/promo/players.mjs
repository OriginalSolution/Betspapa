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
  japan: 'JP',
  albania: 'AL',
  luxembourg: 'LU',
  switzerland: 'CH',
  romania: 'RO',
  malawi: 'MW',
  mali: 'ML',
  rwanda: 'RW',
  bermuda: 'BM',
  belgium: 'BE',
  croatia: 'HR',
  denmark: 'DK',
  sweden: 'SE',
  norway: 'NO',
  poland: 'PL',
  scotland: 'SCO',
  wales: 'WAL',
  ireland: 'IE',
  'republic of ireland': 'IE',
  usa: 'US',
  'united states': 'US',
  mexico: 'MX',
  uruguay: 'UY',
  colombia: 'CO',
  chile: 'CL',
  turkey: 'TR',
  turkiye: 'TR',
  greece: 'GR',
  austria: 'AT',
  hungary: 'HU',
  serbia: 'RS',
  ukraine: 'UA',
  'south korea': 'KR',
  korea: 'KR',
  australia: 'AU',
  'south africa': 'ZA',
};

/** Club home shirts. These beat a crest, which is often a gold ring around a small badge. */
const KITS = {
  arsenal: ['#C8102E', '#FFFFFF'],
  chelsea: ['#034694', '#FFFFFF'],
  liverpool: ['#C8102E', '#FFFFFF'],
  'manchester united': ['#DA291C', '#FFFFFF'],
  'manchester city': ['#6CABDD', '#FFFFFF'],
  tottenham: ['#F4F6FB', '#111111'],
  'tottenham hotspur': ['#F4F6FB', '#111111'],
  newcastle: ['#111111', '#FFFFFF'],
  'newcastle united': ['#111111', '#FFFFFF'],
  barcelona: ['#A50044', '#004D98'],
  'fc barcelona': ['#A50044', '#004D98'],
  'real madrid': ['#F4F6FB', '#111111'],
  'atletico madrid': ['#C8102E', '#FFFFFF'],
  'atletico de madrid': ['#C8102E', '#FFFFFF'],
  leganes: ['#1A4FD8', '#FFFFFF'],
  'cd leganes': ['#1A4FD8', '#FFFFFF'],
  burgos: ['#F4F6FB', '#111111'],
  'borussia dortmund': ['#FDE100', '#111111'],
  dortmund: ['#FDE100', '#111111'],
  'bayern munich': ['#DC052D', '#FFFFFF'],
  'bayern munchen': ['#DC052D', '#FFFFFF'],
  juventus: ['#111111', '#FFFFFF'],
  inter: ['#010E80', '#111111'],
  'inter milan': ['#010E80', '#111111'],
  'ac milan': ['#C8102E', '#111111'],
  milan: ['#C8102E', '#111111'],
  napoli: ['#6BB5E0', '#FFFFFF'],
  roma: ['#8B1E3F', '#F0C94A'],
  'paris saint germain': ['#0A1F44', '#E10600'],
  psg: ['#0A1F44', '#E10600'],
  ajax: ['#C8102E', '#FFFFFF'],
  benfica: ['#E10600', '#FFFFFF'],
  porto: ['#0033A0', '#FFFFFF'],
  'sporting cp': ['#008057', '#FFFFFF'],
  celtic: ['#008751', '#FFFFFF'],
  rangers: ['#1A4FD8', '#FFFFFF'],
  'heart of lions': ['#B4232D', '#F0C94A'],
  'dreams fc': ['#1A4FD8', '#F0C94A'],
};

/**
 * National home shirts by country code. A nation with no cut-out of its own
 * (Japan, and the rest) is matched to the closest club colour.
 */
const NATION_KITS = {
  GH: ['#F4F6FB', '#C8102E'],
  NG: ['#008751', '#FFFFFF'],
  SN: ['#F4F6FB', '#00853F'],
  CI: ['#FF8200', '#FFFFFF'],
  CM: ['#007A5E', '#FCD116'],
  MA: ['#C1272D', '#006233'],
  EG: ['#C8102E', '#FFFFFF'],
  ENG: ['#F4F6FB', '#C8102E'],
  FR: ['#002654', '#ED2939'],
  BR: ['#FEDD00', '#009C3B'],
  AR: ['#75AADB', '#FFFFFF'],
  DE: ['#F4F6FB', '#111111'],
  ES: ['#C60B1E', '#F1BF00'],
  PT: ['#C8102E', '#006600'],
  NL: ['#FF6600', '#FFFFFF'],
  IT: ['#0066B3', '#FFFFFF'],
  JP: ['#1A4FD8', '#FFFFFF'],
  AL: ['#E10600', '#111111'],
  LU: ['#E10600', '#FFFFFF'],
  CH: ['#E10600', '#FFFFFF'],
  RO: ['#FDE100', '#002B7F'],
  MW: ['#E10600', '#111111'],
  ML: ['#FDE100', '#009A44'],
  RW: ['#6BB5E0', '#FDE100'],
  BM: ['#1A4FD8', '#E10600'],
  BE: ['#E10600', '#111111'],
  HR: ['#E10600', '#FFFFFF'],
  DK: ['#E10600', '#FFFFFF'],
  SE: ['#FDE100', '#005293'],
  NO: ['#E10600', '#00205B'],
  PL: ['#FFFFFF', '#E10600'],
  SCO: ['#0033A0', '#FFFFFF'],
  WAL: ['#E10600', '#FFFFFF'],
  IE: ['#008751', '#FFFFFF'],
  US: ['#FFFFFF', '#002868'],
  MX: ['#006847', '#FFFFFF'],
  UY: ['#6BB5E0', '#FFFFFF'],
  CO: ['#FDE100', '#0033A0'],
  CL: ['#E10600', '#FFFFFF'],
  TR: ['#E10600', '#FFFFFF'],
  GR: ['#0055A4', '#FFFFFF'],
  AT: ['#E10600', '#FFFFFF'],
  HU: ['#E10600', '#008751'],
  RS: ['#E10600', '#FFFFFF'],
  UA: ['#FDE100', '#0057B8'],
  KR: ['#E10600', '#FFFFFF'],
  AU: ['#FDE100', '#00843D'],
  ZA: ['#FDE100', '#007A4D'],
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

function fromPair(pair, source) {
  return { primary: rgb(pair[0]), secondary: rgb(pair[1]), source };
}

export function kitFor(name, crestPath = '') {
  const known = KITS[norm(name)];
  if (known) return fromPair(known, 'kit');
  const nation = NATION_KITS[countryCode(name)];
  if (nation) return fromPair(nation, 'nation');
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

/**
 * Kit glow and floor shadow. Drawn before every cut-out so one player's glow
 * cannot tint the other. minX/maxX keep the ellipse on this player's side.
 */
export function playerGlow(item, { x, y, height, minX, maxX }) {
  const { width } = playerBox(item, height);
  const cx = x + width / 2;
  let rx = Math.round(width * 0.42);
  if (minX != null) rx = Math.min(rx, cx - minX);
  if (maxX != null) rx = Math.min(rx, maxX - cx);
  rx = Math.max(28, rx);
  const ry = Math.round(height * 0.32);
  const glow = item.primary || '#e11d2e';
  return `<ellipse cx="${cx}" cy="${y + height * 0.44}" rx="${rx}" ry="${ry}" fill="${glow}" opacity=".3"/>
    <ellipse cx="${cx}" cy="${y + height - 8}" rx="${Math.round(Math.min(width * 0.32, rx))}" ry="14" fill="#000" opacity=".38"/>`;
}

/** The cut-out only. Shirt numbers are never mirrored. */
export function playerImage(item, { x, y, height }) {
  const { width } = playerBox(item, height);
  return `<image href="${starHref(item)}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMax meet"/>`;
}

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
