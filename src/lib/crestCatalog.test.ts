import { describe, expect, it } from 'vitest';
import { catalogCrest, catalogUrls } from './crestCatalog';
import type { Match } from '../types';

const catalog = {
  byKey: { 'man city': '/crests/img/city.png', arsenal: '/crests/img/arsenal.png' },
  byId: { 'man-city': '/crests/img/city.png' },
};

describe('crest catalog', () => {
  it('reads the stored badge by id and by normalized name', () => {
    expect(catalogCrest(catalog, { id: 'man-city', name: 'Man City' })).toBe('/crests/img/city.png');
    expect(catalogCrest(catalog, { id: 'arsenal', name: 'Arsenal WFC' })).toBe('/crests/img/arsenal.png');
    expect(catalogCrest(catalog, { id: 'missing', name: 'Nobody FC' })).toBeNull();
  });

  it('paints a fixture from the store before any live lookup', () => {
    const match = {
      home: { id: 'man-city', name: 'Man City', shortName: 'Man City', abbr: 'MC', color: '#6cabdd' },
      away: { id: 'arsenal', name: 'Arsenal', shortName: 'Arsenal', abbr: 'AR', color: '#e11d2e' },
    } as Match;
    expect(catalogUrls([match], catalog)).toEqual({
      'man city': '/crests/img/city.png',
      arsenal: '/crests/img/arsenal.png',
    });
  });
});
