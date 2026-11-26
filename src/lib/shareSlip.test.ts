import { describe, expect, it, vi } from 'vitest';
import type { BookedDeskView } from './bookedSlip';
import type { BuilderLeg } from './slipPacks';
import { shareCaption, shareTrackedSlip, slipShareModel, whatsAppTextUrl } from './shareSlip';

function desk(id: BookedDeskView['desk'], name: string, codes: string[]): BookedDeskView {
  return {
    desk: id,
    name,
    bookedLegs: 0,
    missed: 0,
    codes: codes.length,
    error: null,
    parts: codes.map((code) => ({ code, legs: 1, matches: 1, from: '', to: '' })),
  };
}

function leg(eventId: string, odds: number): BuilderLeg {
  return {
    key: `${eventId}|over15`,
    eventId,
    market: 'over15',
    label: 'Over 1.5',
    odds,
    kickoff: '2026-11-23T15:00:00Z',
    home: 'Home',
    away: 'Away',
    homeCrest: null,
    awayCrest: null,
    sample: null,
  };
}

const sample = {
  desks: [
    desk('sportybet', 'SportyBet', ['CGJD1X']),
    desk('footballcom', 'Football.com', ['CGJD1X']),
    desk('msport', 'MSport', ['B3NGEXR', 'B3NGEYF']),
    desk('betika', 'Betika', ['1AaSRf', 'DYw1dy', 'XbDYeV']),
    desk('betpawa', 'BetPawa', ['V7USZN2', 'Y49WW2E', 'L0PKMON']),
  ],
  legs: [
    ...Array.from({ length: 33 }, (_, i) => leg(`m${i}`, 1.26)),
    ...Array.from({ length: 11 }, (_, i) => leg(`m${i}`, 1.26)),
  ],
};

describe('slip share model', () => {
  it('keeps desk order, unique matches, and the mean of the leg odds', () => {
    const model = slipShareModel(sample);
    expect(model?.desks.map((desk) => desk.id)).toEqual(['sportybet', 'footballcom', 'msport', 'betika', 'betpawa']);
    expect(model?.stats).toEqual({ legs: 44, matches: 33, avg: 1.26 });
    expect(model?.desks.find((desk) => desk.id === 'betpawa')?.codes).toEqual(['V7USZN2', 'Y49WW2E', 'L0PKMON']);
  });

  it('builds the WhatsApp caption with one line per code', () => {
    const model = slipShareModel(sample)!;
    const text = shareCaption(model);
    expect(text).toBe(
      [
        'Betspapa slip',
        'SportyBet CGJD1X',
        'Football.com CGJD1X',
        'MSport B3NGEXR',
        'MSport B3NGEYF',
        'Betika 1AaSRf',
        'Betika DYw1dy',
        'Betika XbDYeV',
        'BetPawa V7USZN2',
        'BetPawa Y49WW2E',
        'BetPawa L0PKMON',
      ].join('\n'),
    );
    expect(whatsAppTextUrl(text)).toContain('https://wa.me/?text=Betspapa');
    expect(shareCaption({ ...model, desks: [{ id: 'sportybet', name: 'SportyBet', codes: ['ABC123 https://www.sportybet.com/gh/?shareCode=ABC123'] }] }, true)).not.toMatch(/sportybet\.com|football\.com|msport|betika|betpawa/);
  });

  it('returns null when there are no codes', () => {
    expect(slipShareModel({ desks: [], legs: [] })).toBeNull();
  });
});

describe('shareTrackedSlip', () => {
  const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' });

  it('shares the image on a native app', async () => {
    const shareNative = vi.fn(async () => undefined);
    const openUrl = vi.fn();
    const channel = await shareTrackedSlip(sample, {
      render: async () => png,
      isNative: () => true,
      shareNative,
      openUrl,
    });
    expect(channel).toBe('native');
    expect(shareNative).toHaveBeenCalledOnce();
    const nativeArgs = shareNative.mock.calls[0] as unknown as [File, string];
    expect(nativeArgs[0]).toBeInstanceOf(File);
    expect(nativeArgs[1]).toContain('SportyBet CGJD1X');
    expect(openUrl).not.toHaveBeenCalled();
  });

  it('uses navigator.share with files on the web', async () => {
    const shareWeb = vi.fn(async () => undefined);
    const openUrl = vi.fn();
    const channel = await shareTrackedSlip(sample, {
      render: async () => png,
      isNative: () => false,
      canShareFiles: () => true,
      shareWeb,
      openUrl,
    });
    expect(channel).toBe('web');
    expect(shareWeb).toHaveBeenCalledOnce();
    const webArgs = shareWeb.mock.calls[0] as unknown as [{ files: File[] }];
    expect(webArgs[0].files[0]).toBeInstanceOf(File);
    expect(openUrl).not.toHaveBeenCalled();
  });

  it('falls back to a wa.me text link when file sharing fails', async () => {
    const openUrl = vi.fn();
    const channel = await shareTrackedSlip(sample, {
      render: async () => {
        throw new Error('no canvas');
      },
      isNative: () => true,
      openUrl,
    });
    expect(channel).toBe('whatsapp');
    expect(openUrl.mock.calls[0][0]).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(decodeURIComponent(openUrl.mock.calls[0][0])).toContain('BetPawa L0PKMON');
  });

  it('does not open WhatsApp when the share sheet is closed', async () => {
    const openUrl = vi.fn();
    const channel = await shareTrackedSlip(sample, {
      render: async () => png,
      isNative: () => true,
      shareNative: async () => {
        throw new Error('Share canceled');
      },
      openUrl,
    });
    expect(channel).toBeNull();
    expect(openUrl).not.toHaveBeenCalled();
  });

  it('treats a web AbortError as a cancel', async () => {
    const openUrl = vi.fn();
    const abort = Object.assign(new Error('The user aborted a request.'), { name: 'AbortError' });
    const channel = await shareTrackedSlip(sample, {
      render: async () => png,
      isNative: () => false,
      canShareFiles: () => true,
      shareWeb: async () => {
        throw abort;
      },
      openUrl,
    });
    expect(channel).toBeNull();
    expect(openUrl).not.toHaveBeenCalled();
  });
});
