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

/** Rasterise a poster SVG. Phone banners use a smaller width than the full poster. */
export function svgToPng(svg, width = 1080) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
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
