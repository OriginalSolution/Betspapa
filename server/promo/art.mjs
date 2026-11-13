import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { esc, playerSvg, starFor } from './players.mjs';

const MARK = `<svg width="36" height="36" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#E11D2E"/><path fill="#fff" d="M9 7.2h8.1c3.3 0 5.4 1.6 5.4 4.1 0 1.7-1 3-2.6 3.6 2 .6 3.2 2.1 3.2 4.1 0 2.8-2.4 4.8-6.1 4.8H9V7.2zm3.1 6.4h4.2c1.4 0 2.3-.7 2.3-1.7s-.9-1.7-2.3-1.7h-4.2v3.4zm0 6.8h4.8c1.6 0 2.6-.8 2.6-2s-1-2-2.6-2h-4.8V20.4z"/></svg>`;

const LOGO_FILE = {
  sportybet: 'sportybet.png',
  footballcom: 'football.png',
  msport: 'msport.png',
  betika: 'betika.png',
  betpawa: 'betpawa.png',
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

function brand() {
  return `<g>${MARK}<text x="48" y="26" fill="#f4f6fb" font-family="Arial, sans-serif" font-size="22" font-weight="700">betspapa.com</text></g>`;
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

export function shareSvg(card, logos = {}) {
  const code = card.codes[0];
  const legs = code.legs || card.legs.length;
  const odds = code.odds != null ? code.odds.toFixed(2) : '—';
  const booked = clock(card.bookedAt);
  const deskRows = card.codes
    .map((row, index) => {
      const y = 430 + index * 72;
      const logo = logos[row.id] ? `<image href="${logos[row.id]}" x="48" y="${y - 28}" width="44" height="44"/>` : '';
      return `${logo}<text x="108" y="${y}" fill="#f4f6fb" font-family="Arial" font-size="28" font-weight="700">${esc(row.name)}</text><text x="1032" y="${y}" text-anchor="end" fill="#f4f6fb" font-family="ui-monospace, Menlo, monospace" font-size="32" font-weight="700">${esc(row.code)}</text>`;
    })
    .join('');
  const legRows = card.legs.slice(0, 6).map((leg, index) => {
    const y = 430 + card.codes.length * 72 + 70 + index * 56;
    return `<text x="48" y="${y}" fill="#f4f6fb" font-family="Arial" font-size="26">${esc(leg.match)} · ${esc(leg.market)}</text><text x="1032" y="${y}" text-anchor="end" fill="#3ddc97" font-family="Arial" font-size="26" font-weight="700">${leg.hit}%</text>`;
  }).join('');
  const height = 520 + card.codes.length * 72 + Math.min(6, card.legs.length) * 56;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${height}" viewBox="0 0 1080 ${height}">
  <rect width="1080" height="${height}" rx="36" fill="#12151c"/>
  <rect width="14" height="${height}" fill="#e11d2e"/>
  <g transform="translate(48 40)">${brand()}</g>
  <text x="48" y="150" fill="#ff4d5a" font-family="Arial" font-size="22" font-weight="700" letter-spacing="3">MASTER SLIP</text>
  <text x="48" y="250" fill="#f4f6fb" font-family="ui-monospace, Menlo, monospace" font-size="84" font-weight="700">${esc(code.code)}</text>
  <text x="48" y="340" fill="#949bab" font-family="Arial" font-size="28">${legs} LEGS</text>
  <text x="360" y="340" fill="#f4f6fb" font-family="Arial" font-size="40" font-weight="700">${esc(odds)}</text>
  <text x="620" y="340" fill="#949bab" font-family="Arial" font-size="28">${esc(booked)} BOOKED</text>
  <text x="48" y="400" fill="#676e7e" font-family="Arial" font-size="20">Codes by bookmaker. Not an odds source.</text>
  ${deskRows}
  ${legRows}
</svg>`;
}

export function posterSvg(card, logos = {}) {
  const home = starFor(card.home);
  const away = starFor(card.away);
  const crest = (href, x) => (href ? `<image href="${href}" x="${x}" y="150" width="120" height="120"/>` : '');
  const marks = card.codes
    .map((row, index) => (logos[row.id] ? `<image href="${logos[row.id]}" x="${48 + index * 56}" y="1180" width="44" height="44"/>` : ''))
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <defs>
    <radialGradient id="glow" cx="50%" cy="20%" r="60%">
      <stop offset="0" stop-color="#e11d2e" stop-opacity=".35"/>
      <stop offset="1" stop-color="#07080c" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1080" height="1350" fill="#07080c"/>
  <rect width="1080" height="1350" fill="url(#glow)"/>
  <g transform="translate(48 40)">${brand()}</g>
  <text x="1032" y="68" text-anchor="end" fill="#f0c94a" font-family="Arial" font-size="22" font-weight="700" letter-spacing="2">${esc(card.kicker)}</text>
  ${crest(card.homeCrest, 80)}
  ${crest(card.awayCrest, 880)}
  ${playerSvg('home', home, { x: 180, y: 180, scale: 1.15 })}
  ${playerSvg('away', away, { x: 560, y: 180, scale: 1.15, mirror: true })}
  <text x="48" y="860" fill="#f4f6fb" font-family="Arial" font-size="64" font-weight="800">${esc(String(card.home).toUpperCase())}</text>
  <text x="48" y="920" fill="#949bab" font-family="Arial" font-size="36">vs ${esc(card.away)}</text>
  <text x="48" y="970" fill="#676e7e" font-family="Arial" font-size="24">${esc(card.tournament)}  ·  ${esc(when(card.kickoff))}</text>
  <text x="48" y="1040" fill="#ff4d5a" font-family="Arial" font-size="18" font-weight="700" letter-spacing="2">BETSPAPA PREDICTION</text>
  <text x="48" y="1110" fill="#f4f6fb" font-family="Arial" font-size="40" font-weight="700">${esc(card.market)}</text>
  <text x="620" y="1110" fill="#f4f6fb" font-family="Arial" font-size="48" font-weight="800">${card.odds.toFixed(2)}</text>
  <text x="860" y="1110" fill="#3ddc97" font-family="Arial" font-size="40" font-weight="800">${card.hit}%</text>
  <text x="48" y="1240" fill="#f4f6fb" font-family="ui-monospace, Menlo, monospace" font-size="42" font-weight="700">${esc(card.code)}</text>
  ${marks}
</svg>`;
}

export function weekendSvg(card, logos = {}) {
  const rows = card.picks.map((pick, index) => {
    const y = 520 + index * 140;
    return `<text x="48" y="${y}" fill="#f4f6fb" font-family="Arial" font-size="32" font-weight="700">${esc(pick.match)}</text>
      <text x="48" y="${y + 42}" fill="#949bab" font-family="Arial" font-size="24">${esc(pick.market)} · ${esc(when(pick.kickoff))}</text>
      <text x="860" y="${y}" text-anchor="end" fill="#f4f6fb" font-family="Arial" font-size="36" font-weight="800">${pick.odds.toFixed(2)}</text>
      <text x="1032" y="${y}" text-anchor="end" fill="#3ddc97" font-family="Arial" font-size="28" font-weight="700">${pick.hit}%</text>`;
  }).join('');
  const star = starFor(card.picks[0]?.match?.split(/\s+vs\s+/i)[0] || 'banker');
  const marks = (card.codes || []).slice(0, 5).map((row, index) => (logos[row.id] ? `<image href="${logos[row.id]}" x="${48 + index * 56}" y="980" width="40" height="40"/>` : '')).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1120" viewBox="0 0 1080 1120">
  <rect width="1080" height="1120" fill="#12151c"/>
  <rect width="14" height="1120" fill="#e11d2e"/>
  <g transform="translate(48 36)">${brand()}</g>
  <text x="48" y="140" fill="#f0c94a" font-family="Arial" font-size="22" font-weight="700" letter-spacing="3">WEEKEND BANKERS</text>
  ${playerSvg('wk', star, { x: 760, y: 80, scale: 0.7 })}
  ${rows}
  <text x="48" y="960" fill="#f4f6fb" font-family="ui-monospace, Menlo, monospace" font-size="48" font-weight="700">${esc(card.code)}</text>
  ${marks}
</svg>`;
}
