import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { esc, playerSvg, starFor } from './players.mjs';

const W = 1080;
const H = 1350;
const MARK = `<svg width="36" height="36" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#E11D2E"/><path fill="#fff" d="M9 7.2h8.1c3.3 0 5.4 1.6 5.4 4.1 0 1.7-1 3-2.6 3.6 2 .6 3.2 2.1 3.2 4.1 0 2.8-2.4 4.8-6.1 4.8H9V7.2zm3.1 6.4h4.2c1.4 0 2.3-.7 2.3-1.7s-.9-1.7-2.3-1.7h-4.2v3.4zm0 6.8h4.8c1.6 0 2.6-.8 2.6-2s-1-2-2.6-2h-4.8V20.4z"/></svg>`;

const LOGO_FILE = {
  sportybet: 'sportybet.png',
  footballcom: 'football.png',
  msport: 'msport.png',
  betika: 'betika.png',
  betpawa: 'betpawa.png',
};

const GLOW = {
  club: '#e11d2e',
  international: '#f0c94a',
  champions: '#4c6fff',
};

export function logoData(id, root = process.cwd()) {
  const file = LOGO_FILE[id];
  if (!file) return '';
  const path = join(root, 'public', 'bookies', file);
  if (!existsSync(path)) return '';
  return `data:image/png;base64,${readFileSync(path).toString('base64')}`;
}

export function crestForName(name, root = process.cwd()) {
  try {
    const catalog = JSON.parse(readFileSync(join(root, 'public', 'crests', 'crests.json'), 'utf8'));
    const key = String(name || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
    const file = catalog.byKey?.[key] || catalog.byId?.[key.replace(/ /g, '-')] || '';
    return crestData(typeof file === 'string' ? file : '', root);
  } catch {
    return '';
  }
}

export function crestData(url, root = process.cwd()) {
  const value = String(url || '');
  if (!value.startsWith('/crests/')) return '';
  const path = join(root, 'public', value.replace(/^\//, ''));
  if (!existsSync(path)) return '';
  const type = path.endsWith('.svg') ? 'image/svg+xml' : path.endsWith('.webp') ? 'image/webp' : 'image/png';
  return `data:${type};base64,${readFileSync(path).toString('base64')}`;
}

function brand(x = 56, y = 48) {
  return `<g transform="translate(${x} ${y})">${MARK}<text x="48" y="26" fill="#f4f6fb" font-family="Outfit" font-size="24" font-weight="600">betspapa.com</text></g>`;
}

function clock(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Accra', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
}

function when(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Accra', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
}

function cut(value, max) {
  const text = String(value || '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function ring(cx, cy, hit, r = 42) {
  const circ = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, Number(hit) || 0)) / 100) * circ;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#0c0e14" stroke="rgba(255,255,255,.14)" stroke-width="8"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#3ddc97" stroke-width="8" stroke-linecap="round" stroke-dasharray="${dash.toFixed(1)} ${(circ - dash).toFixed(1)}" transform="rotate(-90 ${cx} ${cy})"/>
    <text x="${cx}" y="${cy + 10}" text-anchor="middle" font-family="Barlow Condensed" font-weight="700" font-size="28" fill="#f4f6fb">${Math.round(hit)}%</text>`;
}

function logosRow(codes, logos, right, y, size = 44) {
  const rows = (codes || []).filter((row) => logos[row.id]).slice(0, 5);
  return rows
    .map((row, index) => {
      const x = right - (rows.length - index) * (size + 10);
      return `<image href="${logos[row.id]}" x="${x}" y="${y}" width="${size}" height="${size}"/>`;
    })
    .join('');
}

function frame(glow, body, height = H) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}">
  <defs>
    <radialGradient id="wash" cx="50%" cy="28%" r="68%">
      <stop offset="0" stop-color="${glow}" stop-opacity=".42"/>
      <stop offset=".55" stop-color="${glow}" stop-opacity=".08"/>
      <stop offset="1" stop-color="#07080c" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="vig" cx="50%" cy="40%" r="72%">
      <stop offset=".5" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity=".78"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${height}" fill="#07080c"/>
  <rect width="${W}" height="${height}" fill="url(#wash)"/>
  <polygon points="40,0 210,0 520,${Math.round(height * 0.62)}" fill="#fff" opacity=".05"/>
  <polygon points="870,0 1040,0 560,${Math.round(height * 0.62)}" fill="#fff" opacity=".045"/>
  <ellipse cx="540" cy="${Math.round(height * 0.72)}" rx="420" ry="28" fill="#000" opacity=".35"/>
  <rect width="${W}" height="${height}" fill="url(#vig)"/>
  ${body}
</svg>`;
}

export function shareSvg(card, logos = {}) {
  const code = card.codes[0];
  const legs = card.legCount || code?.legs || card.legs.length;
  const odds = card.total != null ? Number(card.total).toFixed(2) : code?.odds != null ? Number(code.odds).toFixed(2) : '—';
  const booked = clock(card.bookedAt);
  const deskRows = card.codes
    .map((row, index) => {
      const y = 560 + index * 78;
      const logo = logos[row.id] ? `<image href="${logos[row.id]}" x="72" y="${y - 28}" width="48" height="48"/>` : '';
      return `${logo}<text x="136" y="${y + 6}" fill="#f4f6fb" font-family="Outfit" font-size="28" font-weight="600">${esc(row.name)}</text><text x="1008" y="${y + 8}" text-anchor="end" fill="#f4f6fb" font-family="Barlow Condensed" font-size="36" font-weight="700">${esc(row.code)}</text>`;
    })
    .join('');
  const note = card.fullNote
    ? `<text x="72" y="500" fill="#949bab" font-family="Outfit" font-size="22">${esc(card.fullNote)}</text>`
    : '';
  const height = 620 + card.codes.length * 78;
  return frame('#e11d2e', `
    ${brand()}
    <text x="72" y="150" fill="#ff4d5a" font-family="Outfit" font-size="18" font-weight="700" letter-spacing="3">MASTER SLIP</text>
    <text x="72" y="268" fill="#f4f6fb" font-family="Barlow Condensed" font-size="128" font-weight="700">${esc(card.code || code?.code || '')}</text>
    <text x="72" y="340" fill="#949bab" font-family="Outfit" font-size="18" font-weight="600" letter-spacing="2">LEGS</text>
    <text x="72" y="386" fill="#f4f6fb" font-family="Barlow Condensed" font-size="48" font-weight="700">${esc(legs)}</text>
    <text x="360" y="340" fill="#949bab" font-family="Outfit" font-size="18" font-weight="600" letter-spacing="2">TOTAL</text>
    <text x="360" y="386" fill="#f4f6fb" font-family="Barlow Condensed" font-size="48" font-weight="700">${esc(odds)}</text>
    <text x="700" y="340" fill="#949bab" font-family="Outfit" font-size="18" font-weight="600" letter-spacing="2">BOOKED</text>
    <text x="700" y="386" fill="#f4f6fb" font-family="Barlow Condensed" font-size="48" font-weight="700">${esc(booked)}</text>
    ${note}
    <text x="72" y="470" fill="#676e7e" font-family="Outfit" font-size="20">Codes by bookmaker. Not an odds source.</text>
    ${deskRows}
  `, height);
}

export function posterSvg(card, logos = {}) {
  const home = starFor(card.home);
  const away = starFor(card.away);
  const scale = 2.7;
  const crest = (href, x, y) => (href
    ? `<circle cx="${x + 52}" cy="${y + 52}" r="70" fill="${GLOW[card.context] || '#e11d2e'}" opacity=".28"/>
       <image href="${href}" x="${x}" y="${y}" width="104" height="104"/>`
    : '');
  return frame(GLOW[card.context] || '#e11d2e', `
    ${brand()}
    <text x="1008" y="74" text-anchor="end" fill="#f0c94a" font-family="Outfit" font-size="20" font-weight="700" letter-spacing="2">${esc(card.kicker)}</text>
    ${crest(card.homeCrest, 28, 150)}
    ${crest(card.awayCrest, 948, 150)}
    ${playerSvg('home', home, { x: 118, y: 86, scale })}
    ${playerSvg('away', away, { x: 530, y: 86, scale, mirror: true })}
    <text x="64" y="900" fill="#f4f6fb" font-family="Barlow Condensed" font-size="72" font-weight="700">${esc(cut(String(card.home).toUpperCase(), 22))}</text>
    <text x="64" y="952" fill="#c5cad6" font-family="Outfit" font-size="32" font-weight="500">vs ${esc(card.away)}</text>
    <text x="64" y="992" fill="#949bab" font-family="Outfit" font-size="22">${esc(cut(card.tournament, 36))}   ·   ${esc(when(card.kickoff))}</text>
    <rect x="56" y="1024" width="968" height="150" rx="28" fill="#12151c" stroke="rgba(255,255,255,.08)"/>
    <text x="84" y="1068" fill="#ff4d5a" font-family="Outfit" font-size="16" font-weight="700" letter-spacing="2">BETSPAPA PREDICTION</text>
    <text x="84" y="1132" fill="#f4f6fb" font-family="Barlow Condensed" font-size="46" font-weight="700">${esc(cut(card.market, 22))}</text>
    <text x="760" y="1136" text-anchor="end" fill="#f4f6fb" font-family="Barlow Condensed" font-size="64" font-weight="700">${Number(card.odds).toFixed(2)}</text>
    ${ring(948, 1099, card.hit, 40)}
    <rect x="56" y="1196" width="968" height="110" rx="28" fill="#0c0e14"/>
    <text x="84" y="1236" fill="#f0c94a" font-family="Outfit" font-size="15" font-weight="700" letter-spacing="2">CODE</text>
    <text x="84" y="1280" fill="#f4f6fb" font-family="Barlow Condensed" font-size="48" font-weight="700">${esc(card.code)}</text>
    ${logosRow(card.codes, logos, 1000, 1228, 46)}
  `);
}

export function weekendSvg(card, logos = {}) {
  const home = starFor(String(card.picks[0]?.match || '').split(/\s+vs\s+/i)[0]);
  const away = starFor(String(card.picks[0]?.match || '').split(/\s+vs\s+/i)[1]);
  const rows = card.picks.map((pick, index) => {
    const y = 620 + index * 156;
    return `<rect x="56" y="${y}" width="968" height="140" rx="24" fill="#12151c" stroke="rgba(255,255,255,.06)"/>
      <text x="84" y="${y + 58}" fill="#f4f6fb" font-family="Barlow Condensed" font-size="34" font-weight="700">${esc(cut(pick.match, 32))}</text>
      <text x="84" y="${y + 98}" fill="#949bab" font-family="Outfit" font-size="20">${esc(cut(pick.market, 28))}  ·  ${esc(when(pick.kickoff))}</text>
      <text x="860" y="${y + 78}" text-anchor="end" fill="#f4f6fb" font-family="Barlow Condensed" font-size="44" font-weight="700">${pick.odds.toFixed(2)}</text>
      ${ring(968, y + 70, pick.hit, 34)}`;
  }).join('');
  return frame('#e11d2e', `
    ${brand()}
    <text x="72" y="148" fill="#f0c94a" font-family="Outfit" font-size="20" font-weight="700" letter-spacing="3">WEEKEND BANKERS</text>
    ${playerSvg('wk-home', home, { x: 250, y: 150, scale: 1.45 })}
    ${playerSvg('wk-away', away, { x: 560, y: 150, scale: 1.45, mirror: true })}
    ${rows}
    <rect x="56" y="1108" width="968" height="110" rx="28" fill="#0c0e14"/>
    <text x="84" y="1148" fill="#f0c94a" font-family="Outfit" font-size="15" font-weight="700" letter-spacing="2">CODE</text>
    <text x="84" y="1194" fill="#f4f6fb" font-family="Barlow Condensed" font-size="48" font-weight="700">${esc(card.code)}</text>
    ${logosRow(card.codes, logos, 1000, 1140, 46)}
  `);
}
