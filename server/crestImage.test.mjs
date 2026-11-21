import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PNG } from 'pngjs';
import { Resvg } from '@resvg/resvg-js';
import { prepareCrest, sniff } from './crestImage.mjs';

function svgPng(svg, width = 128) {
  return Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: width }, background: 'rgba(0,0,0,0)' }).render().asPng());
}

const crestSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120">
  <path d="M50 2 96 18v40c0 30-30 52-46 60C34 110 4 88 4 58V18z" fill="#0a3d91" stroke="#f2c230" stroke-width="5"/>
  <path d="M50 22 78 32v26c0 18-18 32-28 38-10-6-28-20-28-38V32z" fill="#ffffff"/>
  <circle cx="50" cy="58" r="14" fill="#d81e2c"/><rect x="30" y="40" width="40" height="6" fill="#0a3d91"/>
</svg>`;

test('a real-looking crest passes and is saved as a square PNG of at most 128px', () => {
  const result = prepareCrest(svgPng(crestSvg, 400));
  assert.equal(result.ok, true, result.reason);
  const png = PNG.sync.read(result.png);
  assert.equal(png.width, png.height);
  assert.ok(png.width <= 128);
});

test('the Sportradar 43-byte placeholder and 1x1 images are rejected', () => {
  assert.equal(prepareCrest(Buffer.alloc(43, 1)).ok, false);
  const one = new PNG({ width: 1, height: 1 });
  one.data.fill(255);
  assert.match(prepareCrest(PNG.sync.write(one)).reason, /placeholder/);
  const two = new PNG({ width: 2, height: 2 });
  two.data.fill(200);
  assert.match(prepareCrest(PNG.sync.write(two, { deflateLevel: 0, filterType: 0 })).reason, /placeholder/);
});

test('an initials badge (letters on a flat disc) is rejected', () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="#1d4ed8"/>
    <rect x="22" y="30" width="8" height="40" fill="#fff"/><rect x="22" y="30" width="22" height="8" fill="#fff"/><rect x="22" y="46" width="18" height="8" fill="#fff"/>
    <rect x="56" y="30" width="8" height="40" fill="#fff"/><rect x="56" y="62" width="22" height="8" fill="#fff"/></svg>`;
  assert.equal(prepareCrest(svgPng(svg, 128)).reason, 'initials badge');
});

test('a small badge blown up to 128px is rejected as blurry', () => {
  const tiny = new Resvg(crestSvg, { fitTo: { mode: 'width', value: 20 }, background: 'rgba(0,0,0,0)' }).render();
  const big = new PNG({ width: 120, height: 120 });
  const tw = tiny.width;
  const th = tiny.height;
  for (let y = 0; y < 120; y += 1) {
    for (let x = 0; x < 120; x += 1) {
      const fx = Math.max(0, (x * tw) / 120 - 0.5);
      const fy = Math.max(0, (y * th) / 120 - 0.5);
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const x1 = Math.min(tw - 1, x0 + 1);
      const y1 = Math.min(th - 1, y0 + 1);
      const dx = fx - x0;
      const dy = fy - y0;
      for (let c = 0; c < 4; c += 1) {
        const p = (yy, xx) => tiny.pixels[(yy * tw + xx) * 4 + c];
        big.data[(y * 120 + x) * 4 + c] = (p(y0, x0) * (1 - dx) + p(y0, x1) * dx) * (1 - dy) + (p(y1, x0) * (1 - dx) + p(y1, x1) * dx) * dy;
      }
    }
  }
  assert.equal(prepareCrest(PNG.sync.write(big)).reason, 'blurry');
});

test('too-small images fail; a manual override can skip the style checks but not the size', () => {
  assert.match(prepareCrest(svgPng(crestSvg, 40)).reason, /too small/);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="#1d4ed8"/><rect x="40" y="20" width="20" height="60" fill="#fff"/></svg>`;
  assert.equal(prepareCrest(svgPng(svg)).ok, false);
  assert.equal(prepareCrest(svgPng(svg), { force: true }).ok, true);
});

test('a badge on a flat white square gets its backdrop cleared', () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#ffffff"/><g transform="translate(10 0)">${crestSvg.replace(/<\/?svg[^>]*>/g, '')}</g></svg>`;
  const result = prepareCrest(svgPng(svg, 200));
  assert.equal(result.ok, true, result.reason);
  const png = PNG.sync.read(result.png);
  assert.ok(png.data[3] < 20, 'corner is transparent');
});

test('sniff knows the image types the sources send', () => {
  assert.equal(sniff(svgPng(crestSvg)), 'png');
  assert.equal(sniff(Buffer.from(crestSvg)), 'svg');
  assert.equal(sniff(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), 'jpeg');
});

test('every bundled 0.4.x crest still passes the checks (no false rejects on the catalogue look)', () => {
  const catalog = JSON.parse(readFileSync(new URL('../public/crests/crests.json', import.meta.url), 'utf8'));
  const files = [...new Set(Object.values(catalog.byKey || {}))].filter((file) => String(file).startsWith('/crests/img/')).slice(0, 120);
  let rejected = 0;
  for (const file of files) {
    if (!prepareCrest(readFileSync(new URL(`../public${file}`, import.meta.url))).ok) rejected += 1;
  }
  assert.ok(rejected <= Math.ceil(files.length * 0.02), `${rejected} of ${files.length} rejected`);
});
