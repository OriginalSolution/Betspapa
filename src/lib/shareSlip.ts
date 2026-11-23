import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { BookedDeskView } from './bookedSlip';
import type { TrackedSlip } from './builderStore';
import { DESKS } from './engineSlips';
import { renderSlipPng, type ShareModel } from './shareCardCanvas';
import type { BuilderLeg } from './slipPacks';

export type SlipShareSource = {
  desks?: BookedDeskView[];
  legs?: BuilderLeg[];
};

export type ShareChannel = 'native' | 'web' | 'whatsapp';

export type ShareHooks = {
  render?: (model: ShareModel) => Promise<Blob>;
  isNative?: () => boolean;
  shareNative?: (file: File, text: string) => Promise<void>;
  canShareFiles?: (file: File) => boolean;
  shareWeb?: (data: { title: string; text: string; files: File[] }) => Promise<void>;
  openUrl?: (url: string) => void;
};

/** Build the share-card model from a tracked slip. Average is the mean of the leg odds. */
export function slipShareModel(tracked: SlipShareSource | null | undefined): ShareModel | null {
  const desks = (tracked?.desks || [])
    .map((desk) => ({
      id: desk.desk,
      name: desk.name,
      codes: (desk.parts || []).map((part) => String(part.code || '').trim()).filter(Boolean),
    }))
    .filter((desk) => desk.codes.length);
  if (!desks.length) return null;
  const ordered = DESKS.map((id) => desks.find((desk) => desk.id === id)).filter((desk): desk is NonNullable<typeof desk> => Boolean(desk));
  const leftover = desks.filter((desk) => !DESKS.includes(desk.id as (typeof DESKS)[number]));
  const legs = tracked?.legs || [];
  const matches = new Set(legs.map((leg) => leg.eventId).filter(Boolean));
  const odds = legs.map((leg) => leg.odds).filter((value) => Number.isFinite(value) && value > 0);
  const avg = odds.length ? odds.reduce((sum, value) => sum + value, 0) / odds.length : 0;
  return {
    stats: {
      legs: legs.length,
      matches: matches.size || legs.length,
      avg: Math.round(avg * 100) / 100,
    },
    desks: [...ordered, ...leftover],
  };
}

/** The text caption that travels with the image, and the wa.me fallback. */
export function shareCaption(model: ShareModel): string {
  const lines = model.desks.flatMap((desk) => desk.codes.map((code) => `${desk.name} ${code}`));
  return `Betspapa slip\n${lines.join('\n')}`;
}

export function whatsAppTextUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

function openWhatsApp(text: string, openUrl: (url: string) => void) {
  openUrl(whatsAppTextUrl(text));
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Could not read the share image'));
    reader.readAsDataURL(blob);
  });
}

async function shareNativeFile(file: File, text: string) {
  const data = await blobToBase64(file);
  const path = 'betspapa-slip.png';
  const written = await Filesystem.writeFile({ path, data, directory: Directory.Cache });
  const uri = written.uri || (await Filesystem.getUri({ path, directory: Directory.Cache })).uri;
  await Share.share({
    title: 'Betspapa slip',
    text,
    files: [uri],
    dialogTitle: 'Share slip',
  });
}

function canShareFiles(file: File): boolean {
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  try {
    return typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [file], text: 'Betspapa slip' });
  } catch {
    return false;
  }
}

/** Capacitor Share rejects with "Share canceled"; the Web Share API throws AbortError. */
export function isShareCancel(error: unknown): boolean {
  if (!error) return false;
  const name = (error as { name?: unknown }).name;
  if (name === 'AbortError') return true;
  const message = String((error as { message?: unknown }).message ?? error);
  return /cancel/i.test(message);
}

/** Render the branded card and share it with the caption. Falls back to wa.me text if files cannot be attached. */
export async function shareTrackedSlip(tracked: TrackedSlip | SlipShareSource | null | undefined, hooks: ShareHooks = {}): Promise<ShareChannel | null> {
  const model = slipShareModel(tracked);
  if (!model) return null;
  const text = shareCaption(model);
  const openUrl = hooks.openUrl || ((url) => window.open(url, '_blank', 'noopener,noreferrer'));
  const render = hooks.render || renderSlipPng;
  const isNative = hooks.isNative || (() => Capacitor.isNativePlatform());
  const shareNative = hooks.shareNative || shareNativeFile;
  const canShare = hooks.canShareFiles || canShareFiles;
  const shareWeb = hooks.shareWeb || ((data) => navigator.share(data));

  try {
    const blob = await render(model);
    const file = new File([blob], 'betspapa-slip.png', { type: 'image/png' });
    if (isNative()) {
      await shareNative(file, text);
      return 'native';
    }
    if (canShare(file)) {
      await shareWeb({ title: 'Betspapa slip', text, files: [file] });
      return 'web';
    }
  } catch (error) {
    // Closing the share sheet is a choice, not a failure: do not open WhatsApp behind it.
    if (isShareCancel(error)) return null;
    /* fall through to the text-only WhatsApp link */
  }
  openWhatsApp(text, openUrl);
  return 'whatsapp';
}
