import { crestForName, logoData, posterSvg, shareSvg, weekendSvg } from './art.mjs';
import { posterFrom, shareCardFrom, weekendBankers } from './plan.mjs';
import { svgToPng } from './raster.mjs';
import { loadPromoState, promoDir, readPng, removeFile, savePromoState, writePng } from './store.mjs';
import { broadcastPromo } from '../push.mjs';

let memory = null;

function state() {
  if (!memory) memory = loadPromoState(promoDir());
  return memory;
}

function persist() {
  savePromoState(promoDir(), state());
}

function logosFor(rows) {
  const logos = {};
  for (const row of rows || []) logos[row.id] = logoData(row.id);
  return logos;
}

function render(card) {
  const logos = logosFor(card.codes);
  if (card.kind === 'share') return svgToPng(shareSvg(card, logos));
  if (card.kind === 'weekend') return svgToPng(weekendSvg(card, logos));
  return svgToPng(posterSvg({ ...card, homeCrest: crestForName(card.home), awayCrest: crestForName(card.away) }, logos));
}

function remember(card, png) {
  const current = state();
  if (current.items.some((item) => item.id === card.id)) return current.items.find((item) => item.id === card.id);
  const file = writePng(promoDir(), card.id, png);
  const item = {
    ...card,
    file,
    status: current.approveFirst ? 'pending' : 'sent',
    createdAt: new Date().toISOString(),
    sentAt: null,
  };
  current.items.unshift(item);
  if (card.kind === 'share') current.seen.shareKey = card.id;
  persist();
  return item;
}

export function promoView(item, origin = '') {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    body: item.body,
    route: item.route,
    matchId: item.matchId || '',
    code: item.code || '',
    status: item.status,
    createdAt: item.createdAt,
    sentAt: item.sentAt,
    image: `${origin}/api/promos/${encodeURIComponent(item.id)}.png`,
  };
}

export function listPromos() {
  return { approveFirst: state().approveFirst, items: state().items.map((item) => promoView(item)) };
}

export function publicPromos(origin) {
  return state().items.filter((item) => item.status === 'sent').map((item) => promoView(item, origin));
}

export function promoPng(id) {
  const item = state().items.find((row) => row.id === id);
  return item ? readPng(item.file) : null;
}

export async function deliverPromo(item, book) {
  if (!item || item.status === 'sent' && item.sentAt) return { ok: true, skipped: true };
  const result = await broadcastPromo(book, {
    id: `promo:${item.id}`,
    kind: 'promo',
    title: item.title,
    body: item.body,
    matchId: item.matchId || '',
    route: item.route || '',
    code: item.code || '',
    image: item.image || '',
  });
  item.status = 'sent';
  item.sentAt = new Date().toISOString();
  item.push = result;
  persist();
  return result;
}

export async function syncPromos({ engine, events = [], book, origin = '', now = new Date() } = {}) {
  const planned = [];
  const share = shareCardFrom(engine);
  if (share && state().seen.shareKey !== share.id) planned.push(share);
  for (const event of events) {
    const poster = posterFrom(event, engine, now);
    if (poster) planned.push(poster);
  }
  const weekend = weekendBankers(engine, now);
  if (weekend) planned.push(weekend);
  const created = [];
  for (const card of planned) {
    if (state().items.some((item) => item.id === card.id)) continue;
    const item = remember(card, render(card));
    item.image = `${origin}/api/promos/${encodeURIComponent(item.id)}.png`;
    created.push(item);
    if (!state().approveFirst) await deliverPromo(item, book);
  }
  persist();
  return created;
}

export async function sendPromo(id, book, origin = '') {
  const item = state().items.find((row) => row.id === id);
  if (!item) return { error: 'That promo is not on the board.' };
  item.image = `${origin}/api/promos/${encodeURIComponent(item.id)}.png`;
  item.sentAt = null;
  return deliverPromo(item, book);
}

export function setApproveFirst(value) {
  state().approveFirst = value !== false;
  persist();
  return state().approveFirst;
}

export function deletePromo(id) {
  const current = state();
  const item = current.items.find((row) => row.id === id);
  if (!item) return false;
  removeFile(item.file);
  current.items = current.items.filter((row) => row.id !== id);
  persist();
  return true;
}

export async function sendCurrentShare(engine, book, origin = '') {
  const card = shareCardFrom(engine);
  if (!card) return { error: 'No booked master slip to send.' };
  card.id = `share:manual:${card.codes.map((row) => row.code).join('-')}:${Date.now()}`;
  const item = remember({ ...card }, render(card));
  item.image = `${origin}/api/promos/${encodeURIComponent(item.id)}.png`;
  if (state().approveFirst && item.status === 'pending') {
    persist();
    return { ok: true, pending: true, id: item.id };
  }
  return deliverPromo(item, book);
}
