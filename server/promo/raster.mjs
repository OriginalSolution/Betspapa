import { Resvg } from '@resvg/resvg-js';

/** Rasterise a poster SVG to a PNG about 1080px wide. */
export function svgToPng(svg) {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1080 } });
  return resvg.render().asPng();
}
