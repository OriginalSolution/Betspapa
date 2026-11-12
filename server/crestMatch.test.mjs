import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allowedImageUrl,
  chooseLayer,
  coreName,
  flagUrl,
  isNationalSide,
  nameSimilarity,
  pickBest,
  providerLogo,
  searchQueries,
  sportsDbCandidates,
} from '../src/lib/crestMatch.mjs';

const england = { area: 'England', competition: 'Premier League' };
const russia = { area: 'Russia', competition: 'Russian Football National League' };

test('youth, women, and reserve suffixes use the parent club name', () => {
  assert.equal(coreName('Arsenal U20'), 'arsenal');
  assert.equal(coreName('Arsenal U19'), 'arsenal');
  assert.equal(coreName('FC Barcelona W'), 'barcelona');
  assert.equal(coreName('Arsenal WFC'), 'arsenal');
  assert.equal(coreName('Real Madrid Women'), 'real madrid');
  assert.equal(coreName('FC Viktoria Plzen B'), 'viktoria plzen');
  assert.equal(coreName('Zamora FC II'), 'zamora');
  assert.equal(coreName('Jong Sparta Rotterdam'), 'sparta rotterdam');
  assert.equal(coreName('Real Madrid Castilla'), 'real madrid');
  assert.equal(coreName('Millwall U21'), 'millwall');
});

test('Arsenal does not take the Arsenal Tula badge', () => {
  const teams = [
    { name: 'Arsenal', country: 'England', sport: 'Soccer', league: 'English Premier League', leagues: ['English Premier League', 'UEFA Champions League'], badge: 'https://example.com/arsenal.png' },
    { name: 'Arsenal Tula', country: 'Russia', sport: 'Soccer', league: 'Russian Football National League', leagues: ['Russian Football National League'], badge: 'https://example.com/tula.png' },
  ];
  assert.equal(pickBest('Arsenal', teams, england)?.candidate.name, 'Arsenal');
  assert.equal(pickBest('Arsenal Tula', teams, russia)?.candidate.name, 'Arsenal Tula');
  assert.equal(pickBest('Arsenal', [teams[1]], england), null);
  assert.ok(nameSimilarity('Arsenal', 'Arsenal Tula') < 0.86);
});

test('an American football Georgia side is not the national football team', () => {
  const teams = [{ name: 'Georgia', country: 'United States', sport: 'American Football', league: 'NCAA', badge: 'https://example.com/uga.png' }];
  assert.equal(pickBest('Georgia', teams, { area: 'International', competition: 'UEFA Nations League' }), null);
});

test('a close fuzzy miss stays below the threshold', () => {
  const teams = [{ name: 'Nigeria', country: 'Nigeria', sport: 'Soccer', league: 'FIFA World Cup', badge: 'https://example.com/nga.png' }];
  assert.equal(pickBest('Niger', teams, { area: 'International', competition: 'Africa Cup of Nations Qualification' }), null);
});

test('Benfica Lisbon maps to Benfica and a national side does not steal Austria Wien', () => {
  const benfica = [{ name: 'Benfica', country: 'Portugal', sport: 'Soccer', league: 'Portuguese Primeira Liga', leagues: ['UEFA Champions League'], badge: 'https://example.com/benfica.png' }];
  assert.equal(pickBest('SL Benfica Lisbon W', benfica, { area: 'International Clubs', competition: 'UEFA Champions League Women' })?.candidate.name, 'Benfica');
  const austria = [
    { name: 'Austria', country: 'Austria', sport: 'Soccer', league: 'FIFA World Cup', leagues: ['FIFA World Cup'], badge: 'https://example.com/aut.png' },
    { name: 'Austria Wien', aliases: ['FK Austria Wien'], country: 'Austria', sport: 'Soccer', league: 'Austrian Bundesliga', leagues: ['UEFA Champions League'], badge: 'https://example.com/wien.png' },
  ];
  assert.equal(pickBest('FK Austria Wien', austria, { area: 'International Clubs', competition: 'UEFA Champions League Women' })?.candidate.name, 'Austria Wien');
});

test('Barcelona in the Champions League is not Barcelona SC', () => {
  const teams = [
    { name: 'Barcelona', aliases: ['FC Barcelona'], country: 'Spain', sport: 'Soccer', leagues: ['Spanish La Liga', 'UEFA Champions League'], badge: 'https://example.com/fcb.png' },
    { name: 'Barcelona SC', country: 'Ecuador', sport: 'Soccer', leagues: ['Ecuadorian Serie A'], badge: 'https://example.com/bsc.png' },
  ];
  const picked = pickBest('FC Barcelona W', teams, { area: 'International Clubs', competition: 'UEFA Champions League Women' });
  assert.equal(picked?.candidate.name, 'Barcelona');
  assert.equal(pickBest('Barcelona SC', teams, { area: 'Ecuador', competition: 'Liga Pro' })?.candidate.country, 'Ecuador');
});

test('source order prefers a fixture logo, then TheSportsDB, and never SofaScore or SportyBet', () => {
  assert.equal(allowedImageUrl('https://img.sofascore.com/team.png'), false);
  assert.equal(allowedImageUrl('https://www.sportybet.com/logo.png'), false);
  assert.equal(providerLogo({ crest: 'https://www.sportybet.com/logo.png', logo: 'https://cdn.example/team.png' }), 'https://cdn.example/team.png');
  const chosen = chooseLayer([
    { source: 'flag', url: '/flags/es.svg', confidence: 0.8 },
    { source: 'wikipedia', url: 'https://upload.wikimedia.org/badge.png', confidence: 0.9 },
    { source: 'thesportsdb', url: 'https://r2.thesportsdb.com/badge.png', confidence: 0.97 },
    { source: 'fixture', url: 'https://crests.football-data.org/57.png', confidence: 1 },
    { source: 'sofascore', url: 'https://img.sofascore.com/x.png', confidence: 1 },
  ]);
  assert.equal(chosen.source, 'fixture');
  assert.equal(chooseLayer([{ source: 'thesportsdb', url: 'https://img.sofascore.com/x.png', confidence: 0.99 }]), null);
  assert.equal(chooseLayer([{ source: 'sportybet', url: 'https://cdn.example/a.png', confidence: 1 }]), null);
});

test('national teams can fall back to a flag and club searches stay on the club', () => {
  assert.equal(isNationalSide('Spain', { area: 'International', competition: 'UEFA Nations League' }), true);
  assert.equal(isNationalSide('Spain U21', { area: 'International Youth', competition: 'U21 UEFA European Championship, Qualification' }), true);
  assert.equal(isNationalSide('CD Tarancon', { area: 'Spain', competition: 'Copa del Rey' }), false);
  assert.equal(flagUrl('England'), '/flags/gb-eng.svg');
  assert.match(flagUrl('Malta') || '', /flagcdn\.com\/w160\/mt\.png$/);
  assert.ok(searchQueries('Man City', england).some((query) => /manchester city/i.test(query)));
  const parsed = sportsDbCandidates({ teams: [{ idTeam: '1', strTeam: 'Arsenal', strSport: 'Soccer', strCountry: 'England', strBadge: 'https://example.com/a.png', strTeamAlternate: 'Arsenal FC, AFC' }] });
  assert.equal(parsed[0].badge, 'https://example.com/a.png');
  assert.ok(parsed[0].aliases.includes('Arsenal FC'));
});
