import { describe, expect, it, vi } from 'vitest';
import { bookmakerUrl, deskForLink, openBookmaker, SHARE_LINKS } from './bookmakerLink';
import { DESKS } from './engineSlips';

describe('bookmaker share links', () => {
  it('builds the share-code URL each bookmaker loads a slip from', () => {
    expect(bookmakerUrl('sportybet', 'ABC123')).toBe('https://www.sportybet.com/gh/?shareCode=ABC123');
    expect(bookmakerUrl('footballcom', 'ABC123')).toBe('https://www.football.com/gh/?shareCode=ABC123');
    expect(bookmakerUrl('msport', 'MS1234')).toBe('https://www.msport.com/gh/?shareCode=MS1234');
    expect(bookmakerUrl('betika', 'BK7788')).toBe('https://betika.com/en-gh/share/BK7788');
    expect(bookmakerUrl('betpawa', 'BP9900')).toBe('https://www.betpawa.com.gh/share-betslip/BP9900');
  });

  it('every desk has an https link on its own host', () => {
    for (const desk of DESKS) {
      const url = SHARE_LINKS[desk]('X1Y2Z3');
      expect(url.startsWith('https://')).toBe(true);
      expect(deskForLink(url)).toBe(desk);
    }
  });

  it('keeps the booked link only when it belongs to that bookmaker', () => {
    const booked = 'https://www.sportybet.com/gh/?shareCode=9B4CVQ';
    expect(bookmakerUrl('sportybet', '9B4CVQ', booked)).toBe(booked);
    expect(bookmakerUrl('betika', 'BK7788', booked)).toBe('https://betika.com/en-gh/share/BK7788');
    expect(bookmakerUrl('sportybet', '9B4CVQ', 'http://www.sportybet.com/gh/?shareCode=9B4CVQ')).toBe(booked);
    expect(bookmakerUrl('sportybet', '9B4CVQ', 'https://evil.example/?shareCode=9B4CVQ')).toBe(booked);
    expect(deskForLink('not a url')).toBeNull();
  });

  it('copies the code before opening the bookmaker', async () => {
    const order: string[] = [];
    const copy = vi.fn(async (value: string) => void order.push(`copy:${value}`));
    const open = vi.fn((url: string) => void order.push(`open:${url}`));
    const url = await openBookmaker('sportybet', '9B4CVQ', null, { copy, open });
    expect(url).toBe('https://www.sportybet.com/gh/?shareCode=9B4CVQ');
    expect(order).toEqual(['copy:9B4CVQ', 'open:https://www.sportybet.com/gh/?shareCode=9B4CVQ']);
  });

  it('still opens the bookmaker when the clipboard refuses', async () => {
    const open = vi.fn();
    await openBookmaker('betpawa', 'BP9900', undefined, { copy: async () => Promise.reject(new Error('denied')), open });
    expect(open).toHaveBeenCalledWith('https://www.betpawa.com.gh/share-betslip/BP9900');
  });
});
