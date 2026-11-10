import { describe, expect, it } from 'vitest';
import { mapSportyEvent } from '../data/sporty';
import { countryMark } from './country';

describe('country marks', () => {
  it('uses ISO alpha-3 with a flag for countries', () => {
    expect(countryMark('Spain')).toEqual({ code: 'ESP', flag: '/flags/es.svg' });
    expect(countryMark('Brazil')).toEqual({ code: 'BRA', flag: '/flags/br.svg' });
    expect(countryMark('Denmark Amateur')).toEqual({ code: 'DNK', flag: '/flags/dk.svg' });
    expect(countryMark('Ghana')).toEqual({ code: 'GHA', flag: '/flags/gh.svg' });
    expect(countryMark('Turkiye')).toEqual({ code: 'TUR', flag: '/flags/tr.svg' });
  });

  it('keeps the football code for home nations and still points at a flag', () => {
    expect(countryMark('England')).toEqual({ code: 'ENG', flag: '/flags/gb-eng.svg' });
    expect(countryMark('Scotland')).toEqual({ code: 'SCO', flag: '/flags/gb-sct.svg' });
    expect(countryMark('Northern Ireland')).toEqual({ code: 'NIR', flag: '/flags/gb-nir.svg' });
  });

  it('keeps a three-letter code and no image when the place is not a country', () => {
    expect(countryMark('International Clubs')).toEqual({ code: 'INT', flag: null });
    expect(countryMark('Simulated Reality League')).toEqual({ code: 'SRL', flag: null });
    expect(countryMark('Somewhere Else').flag).toBeNull();
    expect(countryMark('Somewhere Else').code).toBe('SOM');
  });

  it('stores the three-letter code on a real fixture', () => {
    const match = mapSportyEvent({
      eventId: 'sr:match:1',
      home: 'CD Pamplona',
      away: 'Eibar',
      kickoff: '2026-11-10T18:00:00.000Z',
      tournament: 'Copa del Rey',
      country: 'Spain',
    });
    expect(match.competition.code).toBe('ESP');
    expect(match.competition.area).toBe('Spain');
  });
});
