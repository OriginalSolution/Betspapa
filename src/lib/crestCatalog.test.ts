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

const juniorCatalog = {
  byKey: { birmingham: '/crests/img/birmingham.png', arsenal: '/crests/img/arsenal.png', 'arsenal women': '/crests/img/arsenal-women.png' },
  byId: { 'birmingham-u21': '/crests/img/generic-youth.png' },
};

describe('catalogCrest junior sides', () => {
  it('shows the senior club crest for youth and reserve sides', () => {
    expect(catalogCrest(juniorCatalog, { id: 'birmingham-u21', name: 'Birmingham U21' })).toBe('/crests/img/birmingham.png');
    expect(catalogCrest(juniorCatalog, { id: 'jong-arsenal', name: 'Jong Arsenal' })).toBe('/crests/img/arsenal.png');
    expect(catalogCrest(juniorCatalog, { id: 'arsenal-b', name: 'Arsenal B' })).toBe('/crests/img/arsenal.png');
  });

  it('keeps a women side its own crest and falls back to the senior one', () => {
    expect(catalogCrest(juniorCatalog, { id: 'arsenal-women', name: 'Arsenal Women' })).toBe('/crests/img/arsenal-women.png');
    expect(catalogCrest(juniorCatalog, { id: 'arsenal-ladies', name: 'Arsenal Ladies' })).toBe('/crests/img/arsenal.png');
  });

  it('leaves senior clubs alone', () => {
    expect(catalogCrest(juniorCatalog, { id: 'arsenal', name: 'Arsenal' })).toBe('/crests/img/arsenal.png');
    expect(catalogCrest(juniorCatalog, { id: 'gillingham-u23', name: 'Gillingham U23' })).toBeNull();
  });
});
