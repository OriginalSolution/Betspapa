import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const fontDir = join(dirname(fileURLToPath(import.meta.url)), 'fonts');

/** Outfit is the app body face. Barlow Condensed is the display face. */
export function fontFiles() {
  return readdirSync(fontDir)
    .filter((name) => name.endsWith('.ttf'))
    .map((name) => join(fontDir, name));
}

/** Rasterise a poster SVG to a PNG about 1080px wide. */
export function svgToPng(svg) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1080 },
    font: {
      fontFiles: fontFiles(),
      loadSystemFonts: false,
      defaultFontFamily: 'Outfit',
      sansSerifFamily: 'Outfit',
      serifFamily: 'Outfit',
      monospaceFamily: 'Barlow Condensed',
    },
    textRendering: 1,
  });
  return resvg.render().asPng();
}
