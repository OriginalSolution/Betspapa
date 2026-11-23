import { useEffect } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { deskName, isDesk, openBookmaker } from './bookmakerLink';
import { clearFresh, freshCodes, markFresh, PULSE_MS, type FreshCode } from './freshCode';

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function escapeCode(code: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(code) : code.replace(/["\\]/g, '\\$&');
}

/** Slide the page in when a booking lands on it. Skipped under reduce-motion. */
export function playArrive() {
  if (typeof document === 'undefined' || reducedMotion()) return;
  const main = document.querySelector('main.main');
  if (!main) return;
  main.classList.remove('fresh-arrive');
  void (main as HTMLElement).offsetWidth;
  main.classList.add('fresh-arrive');
  window.setTimeout(() => main.classList.remove('fresh-arrive'), 700);
}

/** After a booking: remember the codes, go to the page that shows them, and animate the arrival. */
export function goToBookedCodes(navigate: NavigateFunction, path: string, codes: FreshCode[]) {
  markFresh(codes);
  navigate(path);
  window.setTimeout(playArrive, 0);
}

let hint: HTMLElement | null = null;
function showHint(text: string, anchor?: HTMLElement) {
  hint?.remove();
  const node = document.createElement('p');
  node.className = 'fresh-hint';
  node.setAttribute('role', 'status');
  node.textContent = text;
  if (anchor) {
    const rect = anchor.getBoundingClientRect();
    const mid = Math.min(Math.max(rect.left + rect.width / 2, 140), window.innerWidth - 140);
    const below = rect.bottom + 10;
    node.classList.add('is-anchored');
    node.style.left = `${mid}px`;
    if (below + 72 < window.innerHeight - 96) {
      node.style.top = `${below}px`;
    } else {
      node.style.top = `${Math.max(12, rect.top - 10)}px`;
      node.style.transform = 'translate(-50%, -100%)';
    }
  }
  document.body.appendChild(node);
  hint = node;
  window.setTimeout(() => {
    if (hint === node) hint = null;
    node.remove();
  }, 6_000);
}

/**
 * Highlight just-booked codes on this page: every element with a matching
 * data-booking-code glows (pulsing for a few seconds), the first one scrolls into
 * view, and tapping it opens the bookmaker with the code loaded.
 */
export function useFreshCodes(ready: unknown, options: { scroll?: boolean } = {}) {
  const scroll = options.scroll !== false;
  useEffect(() => {
    if (!ready || typeof document === 'undefined') return;
    const fresh = freshCodes();
    if (!fresh.length) return;
    let pulseTimer = 0;
    const frame = window.requestAnimationFrame(() => {
      const lit: HTMLElement[] = [];
      for (const item of fresh) {
        if (!isDesk(item.desk)) continue;
        document.querySelectorAll<HTMLElement>(`[data-booking-code="${escapeCode(item.code)}"]`).forEach((node) => {
          node.classList.add('is-fresh', 'fresh-pulse');
          node.dataset.freshDesk = item.desk;
          if (item.link) node.dataset.freshLink = item.link;
          node.setAttribute('role', 'link');
          node.setAttribute('tabindex', '0');
          node.setAttribute('aria-label', `New code ${item.code}. Open in ${deskName(item.desk)}`);
          node.title = `Open in ${deskName(item.desk)}`;
          lit.push(node);
        });
      }
      if (!lit.length) return;
      clearFresh();
      if (scroll) lit[0].scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
      const first = fresh.find((item) => isDesk(item.desk));
      if (first) showHint(`New code ${first.code} · tap it to open ${deskName(first.desk)}`, lit[0]);
      pulseTimer = window.setTimeout(() => lit.forEach((node) => node.classList.remove('fresh-pulse')), PULSE_MS);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(pulseTimer);
    };
  }, [ready, scroll]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const open = (event: Event) => {
      const target = event.target as Element | null;
      const node = target?.closest?.('[data-booking-code].is-fresh') as HTMLElement | null;
      if (!node) return;
      if (event instanceof KeyboardEvent && event.key !== 'Enter' && event.key !== ' ') return;
      const desk = node.dataset.freshDesk;
      const code = node.dataset.bookingCode;
      if (!isDesk(desk) || !code) return;
      event.preventDefault();
      event.stopPropagation();
      void openBookmaker(desk, code, node.dataset.freshLink);
    };
    document.addEventListener('click', open, true);
    document.addEventListener('keydown', open, true);
    return () => {
      document.removeEventListener('click', open, true);
      document.removeEventListener('keydown', open, true);
    };
  }, []);
}
