import { DESK_NAMES, type DeskId } from './engineSlips';

/**
 * Share-code URLs, the same ones the server books with (server/bookers.mjs).
 * On Android, Capacitor opens them with ACTION_VIEW, so the bookmaker's app takes
 * them when it claims the link and the website loads the code otherwise.
 */
export const SHARE_LINKS: Record<DeskId, (code: string) => string> = {
  sportybet: (code) => `https://www.sportybet.com/gh/?shareCode=${encodeURIComponent(code)}`,
  footballcom: (code) => `https://www.football.com/gh/?shareCode=${encodeURIComponent(code)}`,
  msport: (code) => `https://www.msport.com/gh/?shareCode=${encodeURIComponent(code)}`,
  betika: (code) => `https://betika.com/en-gh/share/${encodeURIComponent(code)}`,
  betpawa: (code) => `https://www.betpawa.com.gh/share-betslip/${encodeURIComponent(code)}`,
};

const HOSTS: Record<DeskId, string[]> = {
  sportybet: ['www.sportybet.com', 'sportybet.com'],
  footballcom: ['www.football.com', 'football.com'],
  msport: ['www.msport.com', 'msport.com'],
  betika: ['betika.com', 'www.betika.com'],
  betpawa: ['www.betpawa.com.gh', 'betpawa.com.gh'],
};

export function isDesk(value: unknown): value is DeskId {
  return typeof value === 'string' && value in SHARE_LINKS;
}

/** SportyBet when the desk is missing or unknown. */
export function deskOrSporty(value: unknown): DeskId {
  return isDesk(value) ? value : 'sportybet';
}

/** Which bookmaker a share link belongs to, or null for anything else. */
export function deskForLink(link: string | null | undefined): DeskId | null {
  if (!link) return null;
  try {
    const url = new URL(link);
    if (url.protocol !== 'https:') return null;
    for (const desk of Object.keys(HOSTS) as DeskId[]) {
      if (HOSTS[desk].includes(url.hostname)) return desk;
    }
  } catch {
    /* not a URL */
  }
  return null;
}

/** The link to load a code: the booked link when it is that bookmaker's own https link, else the share URL. */
export function bookmakerUrl(desk: DeskId, code: string, link?: string | null): string {
  if (link && deskForLink(link) === desk) return link;
  return SHARE_LINKS[desk](code);
}

export function deskName(desk: DeskId): string {
  return DESK_NAMES[desk];
}

export async function copyText(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    return;
  } catch {
    /* the WebView can refuse the async clipboard */
  }
  if (typeof document === 'undefined') return;
  const area = document.createElement('textarea');
  area.value = value;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.left = '-9999px';
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  area.remove();
}

function openUrl(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Copy the code first (so it can be pasted if the bookmaker drops the link),
 * then open the bookmaker with the code preloaded.
 */
export async function openBookmaker(
  desk: DeskId,
  code: string,
  link?: string | null,
  deps: { copy?: (value: string) => Promise<void>; open?: (url: string) => void } = {},
): Promise<string> {
  const url = bookmakerUrl(desk, code, link);
  try {
    await (deps.copy || copyText)(code);
  } catch {
    /* opening still loads the code */
  }
  (deps.open || openUrl)(url);
  return url;
}
