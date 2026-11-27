import { describe, expect, it } from 'vitest';
import { pageMeta } from './seo';

describe('pageMeta', () => {
  it('gives the home page the full site title and a clean canonical', () => {
    const meta = pageMeta('/', 'Today');
    expect(meta.title).toBe('Betspapa · Live football scores and match alerts');
    expect(meta.canonical).toBe('https://betspapa.com/');
  });
  it('names the route and drops query strings from the canonical', () => {
    const meta = pageMeta('/trends?team=sr:competitor:1', 'Trends');
    expect(meta.title).toBe('Trends · Betspapa');
    expect(meta.canonical).toBe('https://betspapa.com/trends');
    expect(meta.description).toMatch(/trend/i);
  });
  it('keeps the percent wording in search descriptions outside the Play build', () => {
    expect(pageMeta('/record', 'Record').description).toContain('80%+');
    expect(pageMeta('/picks', 'Picks').description).toContain('80%+');
    expect(pageMeta('/slips', 'Slips').description).toContain('80%+');
    expect(pageMeta('/codes', 'Codes').description).toContain('Banker');
  });
  it('describes a match by its real teams', () => {
    const meta = pageMeta('/match/sr:match:1', 'Chelsea vs Leeds United', { home: 'Chelsea', away: 'Leeds United', competition: 'Premier League' });
    expect(meta.title).toBe('Chelsea vs Leeds United · Betspapa');
    expect(meta.description).toBe('Chelsea vs Leeds United (Premier League): live score, timeline and alerts on Betspapa.');
  });
});
