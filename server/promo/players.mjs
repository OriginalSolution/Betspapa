/**
 * Original illustrated players. The project owns these drawings.
 * They are not photographs and not club or press art. A licensed photo
 * source can replace `playerSvg` later without changing the posters.
 */

const STARS = {
  ghana: { number: '10', kit: '#f4f6fb', trim: '#f0c94a', shorts: '#111', skin: '#8d5a3a' },
  arsenal: { number: '7', kit: '#e11d2e', trim: '#ffffff', shorts: '#ffffff', skin: '#c48a62' },
  'heart of lions': { number: '9', kit: '#b4232d', trim: '#f0c94a', shorts: '#f4f6fb', skin: '#8d5a3a' },
  'dreams fc': { number: '10', kit: '#1a4fd8', trim: '#f0c94a', shorts: '#1a4fd8', skin: '#c48a62' },
  'borussia dortmund': { number: '9', kit: '#f0c94a', trim: '#111111', shorts: '#111111', skin: '#c48a62' },
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
    named: false,
  };
}

/** One illustrated cut-out. `id` must be unique inside the poster. */
export function playerSvg(id, star, { mirror = false, x = 0, y = 0, scale = 1 } = {}) {
  const flip = mirror ? `translate(${x + 160 * scale} ${y}) scale(${-scale} ${scale})` : `translate(${x} ${y}) scale(${scale})`;
  return `<g transform="${flip}">
    <ellipse cx="80" cy="266" rx="42" ry="7" fill="#000" opacity=".42"/>
    <path d="M96 236c8 2 20 6 24 13 1 3-2 5-8 5h-20c-4 0-6-2-6-5 0-6 4-11 10-13z" fill="#111"/>
    <path d="M100 176c7 4 11 28 10 50-1 6-6 10-12 8-6-2-9-16-10-36-1-10 4-24 12-22z" fill="${star.shorts}"/>
    <path d="M50 242c-8 3-18 8-20 15-1 3 2 5 8 5h22c5 0 7-3 7-6 0-7-6-13-17-14z" fill="#111"/>
    <path d="M62 176c-9 6-15 32-13 54 1 7 7 10 13 8 7-2 11-20 13-40 2-12-4-26-13-22z" fill="${star.shorts}"/>
    <path d="M54 140c14-4 40-6 56 2 4 8 8 24 4 32-10 4-28 6-42 3-10-2-18-12-18-22 0-6 0-12 0-15z" fill="#1a1c22"/>
    <path d="M58 78c8-10 36-14 50-6 8 5 14 16 16 28 2 14-2 32-8 42-8 4-36 6-50 0-8-8-12-28-10-46 1-8 2-14 2-18z" fill="${star.kit}"/>
    <path d="M58 78h44v8H58z" fill="${star.trim}"/>
    <path d="M54 86c-8 10-14 24-16 38-1 6 2 10 7 9 5-1 8-10 12-20 3-8 6-16 4-24-1-3-4-5-7-3z" fill="${star.trim}"/>
    <path d="M46 128c-3 10-4 22 0 28 3 5 8 5 11 1 3-8 5-20 3-28-1-4-11-5-14-1z" fill="${star.skin}"/>
    <path d="M108 84c8 8 14 22 16 36 1 6-2 10-7 9-5-1-8-10-12-20-3-8-6-16-4-23 1-3 4-5 7-2z" fill="${star.trim}"/>
    <path d="M116 126c3 10 5 22 1 28-3 5-8 5-11 1-3-8-5-20-3-27 1-4 10-5 13-2z" fill="${star.skin}"/>
    <path d="M74 66c6 8 18 8 24 0 0 10-4 16-12 16s-12-6-12-16z" fill="${star.skin}"/>
    <ellipse cx="86" cy="46" rx="20" ry="22" fill="${star.skin}"/>
    <path d="M68 42c4-18 22-26 36-18 8 4 12 14 10 22-8-6-18-8-28-6-8 1-14 2-18 2z" fill="#1a120c"/>
    <text x="80" y="128" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="28" fill="#fff">${esc(star.number)}</text>
  </g>`;
}

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
