import { describe, expect, it } from 'vitest';
import { teamInitials } from './Crest';

describe('teamInitials', () => {
  it('uses the first two meaningful words', () => {
    expect(teamInitials('Orlando Pirates FC')).toBe('OP');
    expect(teamInitials('AFC Telford United')).toBe('TU');
    expect(teamInitials('Arsenal FC')).toBe('A');
    expect(teamInitials('Al-Seeb')).toBe('S');
  });
  it('never returns an empty badge', () => {
    expect(teamInitials('FC')).toBe('F');
    expect(teamInitials('')).toBe('?');
  });
});
