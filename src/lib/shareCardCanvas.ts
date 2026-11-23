/** Booked-slip share card: option 1's bold layout plus option 2's red ticket stub. 1080×1350. */

export const SHARE_CARD = { width: 1080, height: 1350 } as const;

export type ShareDesk = { id: string; name: string; codes: string[] };
export type ShareStats = { legs: number; matches: number; avg: number };
export type ShareModel = { stats: ShareStats; desks: ShareDesk[] };
export type ShareAssets = { logos: Record<string, CanvasImageSource> };

const COLORS = {
  bg: '#07080c',
  bg2: '#0d1016',
  surface2: '#1a1f2a',
  text: '#f4f6fb',
  muted: '#949bab',
  faint: '#676e7e',
  red: '#E11D2E',
  red2: '#ff4d5a',
  line: 'rgba(255,255,255,0.07)',
  lineStrong: 'rgba(255,255,255,0.14)',
};

const SANS = '"Outfit", "Avenir Next", "Segoe UI", sans-serif';
const SCORE = '"Barlow Condensed", "Arial Narrow", sans-serif';
const LOGO_ZOOM: Record<string, number> = { msport: 1.18, betpawa: 1.28, footballcom: 1, sportybet: 1, betika: 1.04 };

export const BOOKIE_LOGOS: Record<string, string> = {
  sportybet: '/bookies/sportybet.png',
  footballcom: '/bookies/football.png',
  msport: '/bookies/msport.png',
  betika: '/bookies/betika.png',
  betpawa: '/bookies/betpawa.png',
};

type TextOpts = {
  weight?: number;
  size?: number;
  face?: string;
  color?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  tracking?: number;
};

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, badge = false) {
  ctx.save();
  if (badge) {
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;
  }
  ctx.translate(x, y);
  ctx.scale(size / 100, size / 100);
  roundedRect(ctx, 0, 0, 100, 100, 22);
  ctx.fillStyle = COLORS.red;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#fff';
  ctx.fillRect(30, 22, 36, 25);
  ctx.fillRect(30, 22, 10, 56);
  ctx.fillRect(30, 50, 40, 28);
  ctx.fillStyle = COLORS.red;
  ctx.fillRect(50, 32, 8, 8);
  ctx.fillRect(51, 60, 9, 9);
  ctx.restore();
}

function drawRedWash(ctx: CanvasRenderingContext2D, width: number, height: number, cy: number, strength: number) {
  const g = ctx.createRadialGradient(width * 0.5, cy, 20, width * 0.5, cy, height * 0.72);
  g.addColorStop(0, `rgba(225,29,46,${strength})`);
  g.addColorStop(0.55, 'rgba(225,29,46,0.08)');
  g.addColorStop(1, 'rgba(7,8,12,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
}

function drawSpotlights(ctx: CanvasRenderingContext2D, _width: number, height: number) {
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.045)';
  ctx.beginPath();
  ctx.moveTo(40, 0);
  ctx.lineTo(210, 0);
  ctx.lineTo(520, height * 0.58);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(870, 0);
  ctx.lineTo(1040, 0);
  ctx.lineTo(560, height * 0.58);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawVignette(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const g = ctx.createRadialGradient(width / 2, height * 0.4, height * 0.15, width / 2, height * 0.45, height * 0.85);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
}

function measure(ctx: CanvasRenderingContext2D, value: string, opts: TextOpts = {}) {
  ctx.font = `${opts.weight || 600} ${opts.size || 28}px ${opts.face || SANS}`;
  return ctx.measureText(value).width;
}

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, opts: TextOpts = {}) {
  ctx.font = `${opts.weight || 600} ${opts.size || 28}px ${opts.face || SANS}`;
  ctx.fillStyle = opts.color || COLORS.text;
  ctx.textAlign = opts.align || 'left';
  ctx.textBaseline = opts.baseline || 'alphabetic';
  if (opts.tracking) {
    const chars = [...value];
    ctx.save();
    ctx.textAlign = 'left';
    const widths = chars.map((ch) => ctx.measureText(ch).width);
    const total = widths.reduce((sum, w) => sum + w, 0) + opts.tracking * (chars.length - 1);
    let cursor = x;
    if (opts.align === 'center') cursor = x - total / 2;
    if (opts.align === 'right') cursor = x - total;
    chars.forEach((ch, i) => {
      ctx.fillText(ch, cursor, y);
      cursor += widths[i] + opts.tracking!;
    });
    ctx.restore();
    return total;
  }
  ctx.fillText(value, x, y);
  return ctx.measureText(value).width;
}

function drawLogo(ctx: CanvasRenderingContext2D, img: CanvasImageSource | undefined, x: number, y: number, size: number, radius: number, id: string) {
  ctx.save();
  roundedRect(ctx, x, y, size, size, radius);
  ctx.fillStyle = COLORS.surface2;
  ctx.fill();
  ctx.clip();
  if (img) {
    const zoom = LOGO_ZOOM[id] || 1;
    const draw = size * zoom;
    ctx.drawImage(img, x - (draw - size) / 2, y - (draw - size) / 2, draw, draw);
  }
  ctx.restore();
}

function pillSize(ctx: CanvasRenderingContext2D, value: string, height: number, fontSize: number) {
  return { w: Math.ceil(measure(ctx, value, { weight: 700, size: fontSize, face: SCORE }) + 44), h: height };
}

function drawPill(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, height: number, fontSize: number) {
  const { w, h } = pillSize(ctx, value, height, fontSize);
  roundedRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = 'rgba(225,29,46,0.18)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,77,90,0.45)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  text(ctx, value, x + w / 2, y + h / 2 + 1, {
    weight: 700,
    size: fontSize,
    face: SCORE,
    color: COLORS.text,
    align: 'center',
    baseline: 'middle',
  });
  return w;
}

type DeskLayout = { sameLine: boolean; sizes: { w: number; h: number }[]; totalW: number; lines: { w: number; h: number }[][]; rowH: number };

function layoutDeskRows(ctx: CanvasRenderingContext2D, desks: ShareDesk[], innerW: number, icon: number, nameSize: number, fontSize: number, pillH: number, pillGap: number): DeskLayout[] {
  const nameLeft = 32 + icon + 20;
  return desks.map((desk) => {
    const nameW = measure(ctx, desk.name, { weight: 600, size: nameSize });
    const sizes = desk.codes.map((code) => pillSize(ctx, code, pillH, fontSize));
    const totalW = sizes.reduce((sum, p) => sum + p.w, 0) + pillGap * Math.max(0, sizes.length - 1);
    const sameLine = nameLeft + nameW + 16 + totalW + 32 <= innerW;
    const lines: { w: number; h: number }[][] = [];
    if (!sameLine) {
      const maxW = innerW - 64;
      let cur: { w: number; h: number }[] = [];
      let used = 0;
      for (const sz of sizes) {
        const next = used === 0 ? sz.w : used + pillGap + sz.w;
        if (cur.length && next > maxW) {
          lines.push(cur);
          cur = [sz];
          used = sz.w;
        } else {
          cur.push(sz);
          used = next;
        }
      }
      if (cur.length) lines.push(cur);
    } else {
      lines.push(sizes);
    }
    const rowH = sameLine ? 124 : 52 + 16 + lines.length * (pillH + 10) + 8;
    return { sameLine, sizes, totalW, lines, rowH };
  });
}

/** Draw the combo share card onto an existing 1080×1350 canvas. */
export function renderShareCard(ctx: CanvasRenderingContext2D, model: ShareModel, assets: ShareAssets = { logos: {} }) {
  const { width, height } = SHARE_CARD;
  const desks = model.desks;
  const stats = model.stats;
  const logos = assets.logos || {};

  ctx.fillStyle = '#05060a';
  ctx.fillRect(0, 0, width, height);
  drawRedWash(ctx, width, height, 180, 0.26);

  const margin = 44;
  const ticketX = margin;
  const ticketY = 52;
  const ticketW = width - margin * 2;
  const ticketH = height - 104;
  const stubW = 118;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.65)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 18;
  roundedRect(ctx, ticketX, ticketY, ticketW, ticketH, 28);
  ctx.fillStyle = COLORS.bg2;
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundedRect(ctx, ticketX, ticketY, ticketW, ticketH, 28);
  ctx.clip();

  ctx.fillStyle = COLORS.red;
  ctx.fillRect(ticketX, ticketY, stubW, ticketH);
  const stubGlow = ctx.createLinearGradient(ticketX, ticketY, ticketX + stubW, ticketY);
  stubGlow.addColorStop(0, 'rgba(255,255,255,0.12)');
  stubGlow.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = stubGlow;
  ctx.fillRect(ticketX, ticketY, stubW, ticketH);

  const stubCx = ticketX + stubW / 2;
  drawMark(ctx, stubCx - 34, ticketY + 48, 68, true);
  ctx.save();
  ctx.translate(stubCx, ticketY + ticketH / 2 + 20);
  ctx.rotate(-Math.PI / 2);
  text(ctx, 'BETSPAPA', 0, 8, { weight: 700, size: 52, face: SCORE, color: '#fff', align: 'center', tracking: 10 });
  ctx.restore();

  const bodyX = ticketX + stubW;
  const bodyW = ticketW - stubW;
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(bodyX, ticketY, bodyW, ticketH);
  ctx.save();
  ctx.beginPath();
  ctx.rect(bodyX, ticketY, bodyW, ticketH);
  ctx.clip();
  drawRedWash(ctx, width, height, ticketY + 160, 0.4);
  drawSpotlights(ctx, width, height);
  drawVignette(ctx, width, height);
  ctx.restore();

  const holeR = 11;
  const holeGap = 36;
  for (let hy = ticketY + 28; hy < ticketY + ticketH - 16; hy += holeGap) {
    ctx.beginPath();
    ctx.arc(bodyX, hy, holeR, 0, Math.PI * 2);
    ctx.fillStyle = '#05060a';
    ctx.fill();
  }
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 2;
  ctx.setLineDash([3, 9]);
  ctx.beginPath();
  ctx.moveTo(bodyX, ticketY + 16);
  ctx.lineTo(bodyX, ticketY + ticketH - 16);
  ctx.stroke();
  ctx.restore();

  const lineG = ctx.createLinearGradient(bodyX, 0, ticketX + ticketW, 0);
  lineG.addColorStop(0, COLORS.red);
  lineG.addColorStop(0.5, '#ffb703');
  lineG.addColorStop(1, COLORS.red);
  ctx.fillStyle = lineG;
  ctx.fillRect(bodyX, ticketY, bodyW, 5);

  const pad = 44;
  const innerL = bodyX + pad;
  const innerR = ticketX + ticketW - pad;
  const innerW = innerR - innerL;

  drawMark(ctx, innerL, ticketY + 36, 68);
  text(ctx, 'Betspapa', innerL + 84, ticketY + 66, { weight: 700, size: 42, face: SANS, baseline: 'middle' });
  text(ctx, 'betspapa.com', innerL + 84, ticketY + 98, { weight: 500, size: 20, color: COLORS.muted, baseline: 'middle' });
  text(ctx, 'BOOKED SLIP', innerL, ticketY + 156, { weight: 700, size: 18, color: COLORS.red2, tracking: 4 });

  const statsY = ticketY + 176;
  const statsH = 176;
  roundedRect(ctx, innerL, statsY, innerW, statsH, 24);
  ctx.fillStyle = 'rgba(18,21,28,0.92)';
  ctx.fill();
  ctx.strokeStyle = COLORS.lineStrong;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const cols = [
    { value: String(stats.legs), label: 'LEGS' },
    { value: String(stats.matches), label: 'MATCHES' },
    { value: Number(stats.avg).toFixed(2), label: 'AVG' },
  ];
  cols.forEach((col, i) => {
    const cx = innerL + (innerW * (i + 0.5)) / cols.length;
    text(ctx, col.value, cx, statsY + 100, { weight: 700, size: 84, face: SCORE, align: 'center' });
    text(ctx, col.label, cx, statsY + 144, { weight: 700, size: 16, color: COLORS.muted, align: 'center', tracking: 3 });
    if (i > 0) {
      const lx = innerL + (innerW * i) / cols.length;
      ctx.fillStyle = COLORS.lineStrong;
      ctx.fillRect(lx, statsY + 40, 1, statsH - 80);
    }
  });

  const icon = 56;
  const nameSize = 26;
  const fontSize = 32;
  const pillH = 52;
  const pillGap = 10;
  const layouts = layoutDeskRows(ctx, desks, innerW, icon, nameSize, fontSize, pillH, pillGap);
  const cardPad = 12;
  const cardH = cardPad * 2 + layouts.reduce((sum, row) => sum + row.rowH, 0);
  const cardY = statsY + statsH + 28;
  const maxCard = ticketY + ticketH - 88 - cardY;
  const scale = cardH > maxCard ? maxCard / cardH : 1;

  roundedRect(ctx, innerL, cardY, innerW, Math.min(cardH, maxCard), 24);
  ctx.fillStyle = 'rgba(18,21,28,0.88)';
  ctx.fill();
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  let y = cardY + cardPad * scale;
  desks.forEach((desk, i) => {
    const layout = layouts[i];
    const rowH = layout.rowH * scale;
    if (i > 0) {
      ctx.fillStyle = COLORS.line;
      ctx.fillRect(innerL + 22, y, innerW - 44, 1);
    }
    if (layout.sameLine) {
      const mid = y + rowH / 2;
      drawLogo(ctx, logos[desk.id], innerL + 24, mid - icon / 2, icon, 14, desk.id);
      text(ctx, desk.name, innerL + 24 + icon + 16, mid, { weight: 600, size: nameSize, baseline: 'middle' });
      let px = innerR - 24 - layout.totalW;
      const py = mid - pillH / 2;
      desk.codes.forEach((code) => {
        px += drawPill(ctx, code, px, py, pillH, fontSize) + pillGap;
      });
    } else {
      drawLogo(ctx, logos[desk.id], innerL + 24, y + 16, icon, 14, desk.id);
      text(ctx, desk.name, innerL + 24 + icon + 16, y + 16 + icon / 2, { weight: 600, size: nameSize, baseline: 'middle' });
      let py = y + 16 + icon + 12;
      let codeIndex = 0;
      for (const line of layout.lines) {
        const lineW = line.reduce((sum, p) => sum + p.w, 0) + pillGap * (line.length - 1);
        let px = innerR - 24 - lineW;
        for (const _unused of line) {
          const code = desk.codes[codeIndex];
          px += drawPill(ctx, code, px, py, pillH, fontSize) + pillGap;
          codeIndex += 1;
        }
        py += pillH + 10;
      }
    }
    y += rowH;
  });

  const discY = Math.min(ticketY + ticketH - 36, cardY + Math.min(cardH, maxCard) + 40);
  text(ctx, 'Codes by bookmaker. Not an odds source.', (innerL + innerR) / 2, discY, {
    weight: 500,
    size: 18,
    face: SANS,
    color: COLORS.faint,
    align: 'center',
  });

  ctx.restore();

  roundedRect(ctx, ticketX, ticketY, ticketW, ticketH, 28);
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

async function ensureFonts() {
  if (typeof document === 'undefined' || !document.fonts) return;
  await document.fonts.ready;
  await Promise.all([
    document.fonts.load('600 42px Outfit'),
    document.fonts.load('700 42px Outfit'),
    document.fonts.load('700 84px "Barlow Condensed"'),
  ]).catch(() => undefined);
}

async function loadLogos(): Promise<Record<string, CanvasImageSource>> {
  const logos: Record<string, CanvasImageSource> = {};
  await Promise.all(
    Object.entries(BOOKIE_LOGOS).map(async ([id, src]) => {
      try {
        logos[id] = await loadImage(src);
      } catch {
        /* the card still draws the bookmaker name */
      }
    }),
  );
  return logos;
}

/** Render the booked slip to a PNG blob the share sheet can attach. */
export async function renderSlipPng(model: ShareModel): Promise<Blob> {
  await ensureFonts();
  const logos = await loadLogos();
  const canvas = document.createElement('canvas');
  canvas.width = SHARE_CARD.width;
  canvas.height = SHARE_CARD.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  renderShareCard(ctx, model, { logos });
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not build the share image');
  return blob;
}
