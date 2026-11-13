/**
 * Original illustrated players. The project owns these drawings.
 * They are not photographs and not club or press art. A licensed photo
 * source can replace `playerSvg` later without changing the posters.
 */

const STARS = {
  ghana: { number: '10', kit: '#f4f6fb', trim: '#f0c94a', shorts: '#111111', skin: '#8d5a3a', hair: '#1a120c' },
  arsenal: { number: '7', kit: '#e11d2e', trim: '#ffffff', shorts: '#ffffff', skin: '#c48a62', hair: '#2a1c14' },
  'heart of lions': { number: '9', kit: '#b4232d', trim: '#f0c94a', shorts: '#f4f6fb', skin: '#8d5a3a', hair: '#1a120c' },
  'dreams fc': { number: '10', kit: '#1a4fd8', trim: '#f0c94a', shorts: '#1a4fd8', skin: '#c48a62', hair: '#2a1c14' },
  'borussia dortmund': { number: '9', kit: '#f0c94a', trim: '#111111', shorts: '#111111', skin: '#c48a62', hair: '#3a2414' },
};

const SKINS = ['#8d5a3a', '#6b3e28', '#c48a62', '#e0b088'];
const KITS = ['#e11d2e', '#1a4fd8', '#f0c94a', '#f4f6fb', '#1f8a4c', '#111111'];

function hash(value) {
  let n = 0;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) n = (n * 33 + text.charCodeAt(i)) >>> 0;
  return n;
}

export function starFor(name) {
  const key = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (STARS[key]) return { ...STARS[key], named: true };
  const n = hash(key);
  return {
    number: String((n % 11) + 7),
    kit: KITS[n % KITS.length],
    trim: n % 2 ? '#f0c94a' : '#ffffff',
    shorts: n % 3 ? '#111111' : '#f4f6fb',
    skin: SKINS[n % SKINS.length],
    hair: n % 2 ? '#1a120c' : '#3a2418',
    named: false,
  };
}

/** One illustrated cut-out. The shirt number is drawn upright, even when the body is mirrored. */
export function playerSvg(id, star, { mirror = false, x = 0, y = 0, scale = 1 } = {}) {
  const safe = String(id).replace(/[^a-z0-9]+/gi, '') || 'p';
  const flip = mirror ? `translate(${x + 160 * scale} ${y}) scale(${-scale} ${scale})` : `translate(${x} ${y}) scale(${scale})`;
  const numX = x + 80 * scale;
  const numY = y + 124 * scale;
  return `<defs>
    <linearGradient id="${safe}-kit" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${star.kit}"/>
      <stop offset="1" stop-color="${shade(star.kit, 0.62)}"/>
    </linearGradient>
    <linearGradient id="${safe}-shine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/>
      <stop offset=".32" stop-color="#fff" stop-opacity=".28"/>
      <stop offset="1" stop-color="#000" stop-opacity=".2"/>
    </linearGradient>
    <filter id="${safe}-ds" x="-30%" y="-10%" width="160%" height="130%">
      <feDropShadow dx="0" dy="10" stdDeviation="8" flood-color="#000" flood-opacity=".55"/>
    </filter>
  </defs>
  <g filter="url(#${safe}-ds)">
    <ellipse cx="${x + 80 * scale}" cy="${y + 268 * scale}" rx="${46 * scale}" ry="${8 * scale}" fill="#000" opacity=".45"/>
    <g transform="${flip}">
      <path d="M96 232c10 2 22 8 26 16 1 3-2 6-9 6h-22c-5 0-7-2-7-6 1-7 5-13 12-16z" fill="#141414"/>
      <path d="M108 214c8 6 10 16 6 22-6 2-16-2-18-10-1-6 4-12 12-12z" fill="#0c0c0c"/>
      <path d="M100 168c8 6 14 34 12 58-1 8-8 12-15 9-8-3-12-22-12-44 0-12 6-26 15-23z" fill="${star.shorts}"/>
      <path d="M98 168h16v10h-18z" fill="${star.trim}"/>
      <path d="M48 236c-10 4-20 10-22 18-1 3 3 6 9 6h24c6 0 8-3 8-7 0-8-7-15-19-17z" fill="#141414"/>
      <path d="M40 218c-8 6-8 16-4 22 7 2 16-4 16-12 0-6-5-12-12-10z" fill="#0c0c0c"/>
      <path d="M60 168c-10 7-16 36-13 60 1 8 8 12 15 9 8-3 13-24 14-46 1-14-6-28-16-23z" fill="${star.shorts}"/>
      <path d="M52 168h16v10H50z" fill="${star.trim}"/>
      <path d="M52 132c16-6 44-8 60 2 5 10 8 28 3 38-12 6-32 8-48 4-12-3-20-16-18-28 1-6 1-12 3-16z" fill="${star.shorts}"/>
      <path d="M56 70c10-14 40-18 56-6 10 7 16 20 17 34 2 18-4 40-12 50-10 6-40 8-56 0-10-10-14-34-12-54 1-10 2-18 7-24z" fill="url(#${safe}-kit)"/>
      <path d="M56 70c10-14 40-18 56-6 10 7 16 20 17 34 2 18-4 40-12 50-10 6-40 8-56 0-10-10-14-34-12-54 1-10 2-18 7-24z" fill="url(#${safe}-shine)"/>
      <path d="M58 70h48v9H58z" fill="${star.trim}"/>
      <path d="M70 78h20l-4 16h-12z" fill="${star.trim}" opacity=".9"/>
      <path d="M50 82c-10 12-16 28-16 44 0 7 3 11 8 10 6-2 10-12 14-24 4-10 6-18 4-26-2-4-6-6-10-4z" fill="${star.trim}"/>
      <path d="M42 128c-4 12-4 26 1 34 4 6 10 6 13 1 4-10 6-24 3-34-2-6-12-7-17-1z" fill="${star.skin}"/>
      <path d="M112 80c10 10 16 26 16 42 0 7-3 11-8 10-6-2-10-12-14-24-3-10-5-18-3-25 1-4 5-6 9-3z" fill="${star.trim}"/>
      <path d="M120 126c4 12 5 26 1 34-3 6-9 6-13 1-3-10-5-24-2-34 2-6 11-7 14-1z" fill="${star.skin}"/>
      <path d="M72 62c8 10 22 10 30 0 1 12-5 20-15 20s-16-8-15-20z" fill="${star.skin}"/>
      <ellipse cx="86" cy="40" rx="22" ry="24" fill="${star.skin}"/>
      <path d="M66 36c6-20 26-30 42-20 10 6 14 16 12 26-10-8-22-10-34-6-8 2-16 2-20 0z" fill="${star.hair}"/>
      <path d="M64 44c-3 10 0 18 5 18 2-8 2-14-1-18-1 0-3 0-4 0z" fill="${star.hair}"/>
      <path d="M100 28c8 2 16 10 16 18-8-2-14 0-20-4-4-6-2-12 4-14z" fill="${star.hair}" opacity=".85"/>
      <path d="M74 38c2 2 6 2 8 0" fill="none" stroke="#2a140c" stroke-width="1.4" opacity=".35"/>
    </g>
    <text x="${numX}" y="${numY}" text-anchor="middle" font-family="Barlow Condensed" font-weight="700" font-size="${28 * scale}" fill="#fff">${esc(star.number)}</text>
  </g>`;
}

function shade(hex, amount) {
  const raw = String(hex || '').replace('#', '');
  if (raw.length !== 6) return '#111111';
  const mix = (channel) => Math.max(0, Math.min(255, Math.round(channel * amount))).toString(16).padStart(2, '0');
  return `#${mix(parseInt(raw.slice(0, 2), 16))}${mix(parseInt(raw.slice(2, 4), 16))}${mix(parseInt(raw.slice(4, 6), 16))}`;
}

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
