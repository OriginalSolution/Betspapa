import { publishableOdds } from '../lib/oddsFloor';
import type { Match } from '../types';
import { teams } from './catalog';

export type MarketId =
  | 'home'
  | 'draw'
  | 'away'
  | 'dc-1x'
  | 'dc-12'
  | 'dc-x2'
  | 'dnb-home'
  | 'dnb-away'
  | 'over05'
  | 'over15'
  | 'over25'
  | 'over35'
  | 'under15'
  | 'under25'
  | 'under35'
  | 'btts'
  | 'btts-no'
  | 'home-score'
  | 'away-score'
  | 'clean'
  | 'fh-home'
  | 'fh-draw'
  | 'fh-away'
  | 'fh-over05'
  | 'fh-over15';

export type FormMark = 'W' | 'D' | 'L';
export type SquadStrength = 'full' | 'weakened' | 'rotated';
export type LegStatus = 'open' | 'won' | 'bust';
export type Grade = 'A' | 'B' | 'C';

export type MarketInfo = {
  id: MarketId;
  label: string;
  short: string;
};

export const MARKETS: MarketInfo[] = [
  { id: 'home', label: 'Full-time home win', short: 'FT 1' },
  { id: 'draw', label: 'Full-time draw', short: 'FT X' },
  { id: 'away', label: 'Full-time away win', short: 'FT 2' },
  { id: 'dc-1x', label: 'Double chance 1X', short: '1X' },
  { id: 'dc-12', label: 'Double chance 12', short: '12' },
  { id: 'dc-x2', label: 'Double chance X2', short: 'X2' },
  { id: 'dnb-home', label: 'Draw no bet · home', short: 'DNB 1' },
  { id: 'dnb-away', label: 'Draw no bet · away', short: 'DNB 2' },
  { id: 'over05', label: 'Over 0.5 goals', short: 'O0.5' },
  { id: 'over15', label: 'Over 1.5 goals', short: 'O1.5' },
  { id: 'over25', label: 'Over 2.5 goals', short: 'O2.5' },
  { id: 'over35', label: 'Over 3.5 goals', short: 'O3.5' },
  { id: 'under15', label: 'Under 1.5 goals', short: 'U1.5' },
  { id: 'under25', label: 'Under 2.5 goals', short: 'U2.5' },
  { id: 'under35', label: 'Under 3.5 goals', short: 'U3.5' },
  { id: 'btts', label: 'Both teams to score', short: 'BTTS' },
  { id: 'btts-no', label: 'Both teams not to score', short: 'BTTS no' },
  { id: 'home-score', label: 'Home team to score', short: 'Home score' },
  { id: 'away-score', label: 'Away team to score', short: 'Away score' },
  { id: 'clean', label: 'Clean sheet', short: 'Clean' },
  { id: 'fh-home', label: 'First-half home win', short: 'FH 1' },
  { id: 'fh-draw', label: 'First-half draw', short: 'FH X' },
  { id: 'fh-away', label: 'First-half away win', short: 'FH 2' },
  { id: 'fh-over05', label: 'First-half over 0.5', short: 'FH O0.5' },
  { id: 'fh-over15', label: 'First-half over 1.5', short: 'FH O1.5' },
];

/** Markets the no-login share route can book. Other major markets can be followed without joining the slip. */
export const SLIP_MARKETS = new Set<MarketId>([
  'home',
  'draw',
  'away',
  'over15',
  'over25',
  'over35',
  'under25',
  'btts',
  'btts-no',
  'home-score',
  'away-score',
]);

const marketById = new Map(MARKETS.map((market) => [market.id, market]));

export function marketInfo(id: MarketId): MarketInfo {
  const found = marketById.get(id);
  if (!found) throw new Error(`Unknown market ${id}`);
  return found;
}

export type TeamProfile = {
  form: FormMark[];
  squad: SquadStrength;
  scoredRate: number;
  concedeRate: number;
};

const featured: Record<string, TeamProfile> = {
  ars: { form: ['W', 'W', 'D', 'W', 'W'], squad: 'full', scoredRate: 0.86, concedeRate: 0.28 },
  liv: { form: ['W', 'L', 'W', 'W', 'D'], squad: 'rotated', scoredRate: 0.8, concedeRate: 0.72 },
  che: { form: ['W', 'W', 'W', 'D', 'L'], squad: 'full', scoredRate: 0.78, concedeRate: 0.4 },
  mci: { form: ['W', 'W', 'W', 'W', 'D'], squad: 'weakened', scoredRate: 0.88, concedeRate: 0.3 },
  aja: { form: ['W', 'D', 'W', 'W', 'L'], squad: 'full', scoredRate: 0.7, concedeRate: 0.22 },
  psv: { form: ['W', 'W', 'L', 'W', 'W'], squad: 'full', scoredRate: 0.84, concedeRate: 0.48 },
  bay: { form: ['W', 'W', 'W', 'D', 'W'], squad: 'full', scoredRate: 0.9, concedeRate: 0.35 },
  bvb: { form: ['L', 'W', 'D', 'W', 'L'], squad: 'weakened', scoredRate: 0.76, concedeRate: 0.62 },
  bar: { form: ['W', 'W', 'W', 'L', 'W'], squad: 'full', scoredRate: 0.84, concedeRate: 0.32 },
  rma: { form: ['W', 'D', 'W', 'W', 'W'], squad: 'full', scoredRate: 0.8, concedeRate: 0.34 },
  psg: { form: ['W', 'W', 'D', 'W', 'W'], squad: 'full', scoredRate: 0.82, concedeRate: 0.26 },
  mar: { form: ['L', 'W', 'L', 'D', 'W'], squad: 'rotated', scoredRate: 0.6, concedeRate: 0.5 },
  avl: { form: ['W', 'W', 'D', 'L', 'W'], squad: 'full', scoredRate: 0.66, concedeRate: 0.4 },
  bha: { form: ['L', 'D', 'W', 'W', 'W'], squad: 'full', scoredRate: 0.58, concedeRate: 0.22 },
  tot: { form: ['L', 'D', 'W', 'L', 'D'], squad: 'weakened', scoredRate: 0.52, concedeRate: 0.55 },
};

const fallback: TeamProfile = {
  form: ['D', 'W', 'L', 'D', 'W'],
  squad: 'full',
  scoredRate: 0.55,
  concedeRate: 0.45,
};

export function profile(teamId: string): TeamProfile {
  return featured[teamId] ?? fallback;
}

export function squadLabel(squad: SquadStrength): string {
  if (squad === 'rotated') return 'Heavily rotated';
  if (squad === 'weakened') return 'Weakened';
  return 'Full strength';
}

type TrendSeed = {
  id: string;
  teamId: string;
  market: MarketId;
  sample: number;
  hits: number;
  note: string;
};

const trendSeeds: TrendSeed[] = [
  { id: 'ars-over35', teamId: 'ars', market: 'over35', sample: 12, hits: 10, note: 'Arsenal home matches pass three goals' },
  { id: 'che-score', teamId: 'che', market: 'home-score', sample: 14, hits: 12, note: 'Chelsea score in home games' },
  { id: 'aja-clean', teamId: 'aja', market: 'clean', sample: 11, hits: 10, note: 'Ajax keep a clean sheet at home' },
  { id: 'bay-over25', teamId: 'bay', market: 'over25', sample: 12, hits: 11, note: 'Bayern games clear 2.5 goals' },
  { id: 'bar-btts', teamId: 'bar', market: 'btts', sample: 12, hits: 10, note: 'Barcelona matches see both teams score' },
  { id: 'psg-home', teamId: 'psg', market: 'home', sample: 12, hits: 10, note: 'PSG win at home' },
  { id: 'avl-home', teamId: 'avl', market: 'home', sample: 12, hits: 10, note: 'Aston Villa win at home' },
  { id: 'tot-home', teamId: 'tot', market: 'home', sample: 10, hits: 6, note: 'Tottenham home wins are still patchy' },
  { id: 'bha-score', teamId: 'bha', market: 'away-score', sample: 10, hits: 7, note: 'Brighton scoring away is improving' },
];

export type TrendView = {
  id: string;
  /** `price:<market>` on a priced trend. That id is the engine trend slip. */
  trendId: string;
  matchId: string;
  teamId: string;
  teamName: string;
  market: MarketId;
  marketLabel: string;
  label: string;
  sample: number;
  hits: number;
  rate: number;
  bookmarked: boolean;
  developing: boolean;
  status: LegStatus;
  note: string;
  form: FormMark[];
  squad: SquadStrength;
};

export type PickView = {
  id: string;
  trendId: string;
  matchId: string;
  competitionId: string;
  competitionName: string;
  teamId: string;
  teamName: string;
  opponentName: string;
  market: MarketId;
  marketLabel: string;
  rate: number;
  support: -1 | 0 | 1;
  supportText: string;
  confidence: number;
  grade: Grade | null;
  bookmarked: boolean;
  softened: boolean;
  odds: number;
  status: LegStatus;
  form: FormMark[];
  squad: SquadStrength;
  label: string;
  /** Set when the rate comes from recent matches rather than the price. */
  hits?: number;
  sample?: number;
};

export type LedgerEntry = {
  id: string;
  at: number;
  market: MarketId;
  teamId: string;
  teamName: string;
  competitionId: string;
  competitionName: string;
  label: string;
  result: 'won' | 'bust';
};

export type ListScope = 'team' | 'competition' | 'market';
export type ListItem = { scope: ListScope; id: string; name: string; list: 'black' | 'green' };

export type Bookmaker = {
  id: string;
  name: string;
  prefix: string;
  markets: MarketId[];
  note: string;
};

export const bookmakers: Bookmaker[] = [
  { id: 'sportybet', name: 'SportyBet', prefix: '', markets: MARKETS.map((market) => market.id), note: 'Share code has not been issued.' },
  { id: 'footballcom', name: 'Football.com', prefix: '', markets: MARKETS.map((market) => market.id), note: 'Share code has not been issued.' },
  { id: 'msport', name: 'MSport', prefix: '', markets: MARKETS.map((market) => market.id), note: 'Share code has not been issued.' },
  { id: 'betika', name: 'Betika', prefix: '', markets: MARKETS.map((market) => market.id), note: 'Share code has not been issued.' },
  { id: 'betpawa', name: 'BetPawa', prefix: '', markets: MARKETS.map((market) => market.id), note: 'Share code has not been issued.' },
];

const TIP_RATE = 0.8;

function teamName(id: string): string {
  return teams.find((team) => team.id === id)?.shortName ?? id;
}

export function trendsFromPicks(picks: PickView[]): TrendView[] {
  return picks
    .map((pick) => ({
      id: pick.id,
      trendId: pick.trendId,
      matchId: pick.matchId,
      teamId: pick.teamId,
      teamName: pick.teamName,
      market: pick.market,
      marketLabel: pick.marketLabel,
      label: pick.label,
      sample: pick.sample ?? 0,
      hits: pick.hits ?? 0,
      rate: pick.rate,
      bookmarked: pick.bookmarked,
      developing: !pick.bookmarked && pick.rate >= 0.7 && pick.rate <= TIP_RATE,
      status: pick.status,
      note: pick.supportText,
      form: pick.form,
      squad: pick.squad,
    }))
    .sort((a, b) => Number(b.status === 'won') - Number(a.status === 'won') || b.rate - a.rate || a.teamName.localeCompare(b.teamName));
}

export function listTrends(): TrendView[] {
  return trendSeeds
    .map((seed) => {
      const rate = seed.hits / seed.sample;
      const form = profile(seed.teamId).form;
      const recentWins = form.slice(-3).filter((mark) => mark === 'W').length;
      return {
        id: seed.id,
        trendId: seed.id,
        matchId: '',
        teamId: seed.teamId,
        teamName: teamName(seed.teamId),
        market: seed.market,
        marketLabel: marketInfo(seed.market).label,
        label: `${teamName(seed.teamId)} · ${marketInfo(seed.market).label}`,
        sample: seed.sample,
        hits: seed.hits,
        rate,
        bookmarked: rate > TIP_RATE,
        developing: rate <= TIP_RATE && rate >= 0.7 && recentWins >= 2,
        status: 'open' as const,
        note: seed.note,
        form,
        squad: profile(seed.teamId).squad,
      };
    })
    .sort((a, b) => b.rate - a.rate || a.teamName.localeCompare(b.teamName));
}

function applies(market: MarketId, teamIsHome: boolean): boolean {
  if (market === 'home' || market === 'home-score') return teamIsHome;
  if (market === 'away' || market === 'away-score') return !teamIsHome;
  return true;
}

function supportFor(market: MarketId, opponent: TeamProfile): -1 | 0 | 1 {
  const openGame = market === 'over15' || market === 'over25' || market === 'over35' || market === 'btts' || market === 'home-score' || market === 'away-score';
  const shut = market === 'under25' || market === 'btts-no' || market === 'clean';
  if (openGame) {
    if (opponent.concedeRate >= 0.6 || opponent.scoredRate >= 0.75) return 1;
    if (opponent.concedeRate <= 0.3 && opponent.scoredRate <= 0.45) return -1;
    return 0;
  }
  if (shut) {
    if (opponent.scoredRate <= 0.35) return 1;
    if (opponent.scoredRate >= 0.7) return -1;
    return 0;
  }
  if (opponent.concedeRate >= 0.55) return 1;
  if (opponent.concedeRate <= 0.25) return -1;
  return 0;
}

export function confidenceOf(rate: number, support: -1 | 0 | 1): number {
  const adjusted = Math.min(0.97, Math.max(0.4, rate + support * 0.06));
  return Math.round(adjusted * 1000) / 1000;
}

export function gradeFor(confidence: number): Grade | null {
  if (confidence > 0.9) return 'A';
  if (confidence > 0.85) return 'B';
  if (confidence > TIP_RATE) return 'C';
  return null;
}

export function demoOdds(confidence: number, market: MarketId): number {
  const bias = (market.length % 4) * 0.07;
  return Math.round((1.32 + (1 - confidence) * 6 + bias) * 100) / 100;
}

function halfReady(match: Match): boolean {
  if (match.htHome == null || match.htAway == null) return false;
  return match.status === 'halftime' || match.status === 'finished' || (match.status === 'live' && (match.minute ?? 0) >= 45);
}

export function settle(market: MarketId, match: Match, teamIsHome: boolean): LegStatus {
  const firstHalf =
    market === 'fh-home' || market === 'fh-draw' || market === 'fh-away' || market === 'fh-over05' || market === 'fh-over15';
  if (firstHalf) {
    if (!halfReady(match) || match.htHome == null || match.htAway == null) return 'open';
    const home = match.htHome;
    const away = match.htAway;
    const total = home + away;
    if (market === 'fh-over05') return total >= 1 ? 'won' : 'bust';
    if (market === 'fh-over15') return total >= 2 ? 'won' : 'bust';
    if (market === 'fh-home') return home > away ? 'won' : 'bust';
    if (market === 'fh-away') return away > home ? 'won' : 'bust';
    return home === away ? 'won' : 'bust';
  }
  if (match.status === 'scheduled' || match.status === 'postponed' || match.homeScore == null || match.awayScore == null) {
    return 'open';
  }
  const home = match.homeScore;
  const away = match.awayScore;
  const total = home + away;
  const finished = match.status === 'finished';
  const conceded = teamIsHome ? away : home;
  const scored = teamIsHome ? home : away;
  if (market === 'over05') return total >= 1 ? 'won' : finished ? 'bust' : 'open';
  if (market === 'over15') return total >= 2 ? 'won' : finished ? 'bust' : 'open';
  if (market === 'over25') return total >= 3 ? 'won' : finished ? 'bust' : 'open';
  if (market === 'over35') return total >= 4 ? 'won' : finished ? 'bust' : 'open';
  if (market === 'under15') return total >= 2 ? 'bust' : finished ? 'won' : 'open';
  if (market === 'under25') return total >= 3 ? 'bust' : finished ? 'won' : 'open';
  if (market === 'under35') return total >= 4 ? 'bust' : finished ? 'won' : 'open';
  if (market === 'btts') return home > 0 && away > 0 ? 'won' : finished ? 'bust' : 'open';
  if (market === 'btts-no') return home > 0 && away > 0 ? 'bust' : finished ? 'won' : 'open';
  if (market === 'home-score') return home > 0 ? 'won' : finished ? 'bust' : 'open';
  if (market === 'away-score') return away > 0 ? 'won' : finished ? 'bust' : 'open';
  if (market === 'clean') return conceded > 0 ? 'bust' : finished ? 'won' : 'open';
  if (market === 'home') return finished ? (home > away ? 'won' : 'bust') : 'open';
  if (market === 'away') return finished ? (away > home ? 'won' : 'bust') : 'open';
  if (market === 'draw') return finished ? (home === away ? 'won' : 'bust') : 'open';
  if (market === 'dc-1x') return finished ? (home >= away ? 'won' : 'bust') : 'open';
  if (market === 'dc-12') return finished ? (home !== away ? 'won' : 'bust') : 'open';
  if (market === 'dc-x2') return finished ? (away >= home ? 'won' : 'bust') : 'open';
  if (market === 'dnb-home') {
    if (!finished) return 'open';
    if (home > away) return 'won';
    if (away > home) return 'bust';
    return 'open';
  }
  if (market === 'dnb-away') {
    if (!finished) return 'open';
    if (away > home) return 'won';
    if (home > away) return 'bust';
    return 'open';
  }
  return scored > 0 && finished ? 'won' : 'open';
}

function supportText(support: -1 | 0 | 1, opponent: string, market: MarketId): string {
  const scoring = market === 'clean' || market === 'under25' || market === 'btts-no';
  if (support > 0) {
    return scoring ? `${opponent} rarely score, so this is stronger.` : `${opponent} leak chances, so this is stronger.`;
  }
  if (support < 0) {
    return scoring ? `${opponent} score often, so this is softer.` : `${opponent} are hard to break down, so this is softer.`;
  }
  return `${opponent} neither boost nor weaken this read.`;
}

const ODDS_MARKETS: Array<[string, MarketId, boolean]> = [
  ['home', 'home', true],
  ['draw', 'draw', false],
  ['away', 'away', false],
  ['home-dnb', 'dnb-home', true],
  ['away-dnb', 'dnb-away', false],
  ['over-05', 'over05', true],
  ['over-15', 'over15', true],
  ['over-25', 'over25', true],
  ['over-35', 'over35', true],
  ['under-15', 'under15', false],
  ['under-25', 'under25', false],
  ['under-35', 'under35', false],
  ['btts-yes', 'btts', true],
  ['btts-no', 'btts-no', false],
  ['home-over-05', 'home-score', true],
  ['away-over-05', 'away-score', true],
  ['fh-over-05', 'fh-over05', true],
  ['fh-over-15', 'fh-over15', true],
  ['fh-home', 'fh-home', true],
  ['fh-draw', 'fh-draw', false],
  ['fh-away', 'fh-away', false],
];

/** Same window the engine uses before it will call a rate 80%+. */
const MEASURED = 8;

function applyOccurrence(pick: PickView, match: Match): PickView {
  const rows = match.occurrence;
  if (!Array.isArray(rows) || !rows.length) return pick;
  const row = rows.find((item) => item.market === pick.market && item.sample >= MEASURED && item.hits >= 0);
  if (!row) return { ...pick, bookmarked: false, softened: false, grade: null };
  const rate = row.hits / row.sample;
  let confidence = confidenceOf(rate, 0);
  if (rate >= TIP_RATE && confidence <= TIP_RATE) confidence = TIP_RATE + 0.001;
  const bookmarked = rate + 1e-12 >= TIP_RATE;
  return {
    ...pick,
    rate,
    hits: row.hits,
    sample: row.sample,
    support: 0,
    supportText: `${row.hits} of the last ${row.sample} matches.`,
    confidence,
    grade: bookmarked && SLIP_MARKETS.has(pick.market) ? gradeFor(confidence) : null,
    bookmarked,
    softened: false,
  };
}

function combinePrice(left?: number, right?: number): number | null {
  if (left == null || right == null || left <= 1 || right <= 1) return null;
  const implied = 1 / left + 1 / right;
  if (!Number.isFinite(implied) || implied <= 0) return null;
  return Math.round((1 / implied) * 100) / 100;
}

function pricePick(match: Match, market: MarketId, price: number | null, note: string, support: -1 | 0 | 1 = 0): PickView {
  const implied = price != null && price > 1 ? Math.min(0.99, 1 / price) : 0.5;
  const confidence = confidenceOf(implied, support);
  const slip = SLIP_MARKETS.has(market);
  const backingAway = market === 'away' || market === 'away-score' || market === 'dnb-away' || market === 'fh-away';
  const backed = backingAway ? match.away : match.home;
  const opposed = backingAway ? match.home : match.away;
  return {
    id: `${match.id}:${market}`,
    trendId: `price:${market}`,
    matchId: match.id,
    competitionId: match.competition.id,
    competitionName: match.competition.name,
    teamId: backed.id,
    teamName: backed.shortName,
    opponentName: opposed.shortName,
    market,
    marketLabel: marketInfo(market).label,
    rate: implied,
    support,
    supportText: note,
    confidence,
    grade: slip ? gradeFor(confidence) : null,
    bookmarked: slip && implied > TIP_RATE,
    softened: slip && implied > TIP_RATE && confidence <= TIP_RATE,
    odds: price != null && price > 1 ? Math.round(price * 100) / 100 : 0,
    status: settle(market, match, !backingAway),
    form: [],
    squad: 'full',
    label: `${match.home.shortName} vs ${match.away.shortName} · ${marketInfo(market).label}`,
  };
}

function picksFromOdds(match: Match): PickView[] {
  const odds = match.odds;
  if (!odds) return [];
  const homeImp = odds.home ? 1 / odds.home : 0;
  const drawImp = odds.draw ? 1 / odds.draw : 0;
  const awayImp = odds.away ? 1 / odds.away : 0;
  const book = homeImp + drawImp + awayImp || 1;
  const picks: PickView[] = [];
  for (const [key, market] of ODDS_MARKETS) {
    const price = odds[key];
    if (typeof price !== 'number' || !publishableOdds(price)) continue;
    const raw = Math.min(0.99, 1 / price);
    const implied = market === 'home' ? homeImp / book : market === 'draw' ? drawImp / book : market === 'away' ? awayImp / book : raw;
    const oneXTwo = market === 'home' || market === 'away' || market === 'draw';
    const backingAway = market === 'away' || market === 'away-score' || market === 'dnb-away';
    const gap = backingAway ? awayImp - homeImp : homeImp - awayImp;
    const support: -1 | 0 | 1 = oneXTwo ? (gap > 0.15 ? 1 : gap < -0.05 ? -1 : 0) : raw >= 0.75 ? 1 : raw < 0.55 ? -1 : 0;
    const backed = backingAway ? match.away : match.home;
    const opposed = backingAway ? match.home : match.away;
    const note = `Price ${price.toFixed(2)}. ${oneXTwo ? supportText(support, opposed.shortName, market) : support > 0 ? 'Short price, so this is stronger.' : support < 0 ? 'Longer price, so this is softer.' : 'The price sits in the middle.'}`;
    const pick = pricePick(match, market, price, note, support);
    pick.rate = Math.min(0.99, implied);
    pick.teamId = backed.id;
    pick.teamName = backed.shortName;
    pick.opponentName = opposed.shortName;
    pick.confidence = confidenceOf(pick.rate, support);
    pick.grade = SLIP_MARKETS.has(market) ? gradeFor(pick.confidence) : null;
    pick.bookmarked = SLIP_MARKETS.has(market) && pick.rate > TIP_RATE;
    pick.softened = pick.bookmarked && pick.confidence <= TIP_RATE;
    picks.push(pick);
  }
  const doubles: Array<[MarketId, number | null]> = [
    ['dc-1x', combinePrice(odds.home, odds.draw)],
    ['dc-12', combinePrice(odds.home, odds.away)],
    ['dc-x2', combinePrice(odds.draw, odds.away)],
  ];
  for (const [market, price] of doubles) {
    if (price == null || !publishableOdds(price)) continue;
    picks.push(pricePick(match, market, price, 'Combined from the full-time 1X2 prices.'));
  }
  const measured = picks.map((pick) => applyOccurrence(pick, match));
  if (match.status === 'live' || match.status === 'halftime' || match.status === 'finished') {
    for (const market of ['fh-home', 'fh-draw', 'fh-away'] as MarketId[]) {
      measured.push(applyOccurrence(pricePick(match, market, null, 'Settles from the half-time score.'), match));
    }
  }
  return measured;
}

export function buildPicks(matches: Match[]): PickView[] {
  if (matches.some((match) => match.feed === 'sporty')) {
    return matches
      .filter((match) => match.feed === 'sporty')
      .flatMap(picksFromOdds)
      .filter((pick) => publishableOdds(pick.odds))
      .sort((a, b) => b.confidence - a.confidence || a.odds - b.odds);
  }
  const picks: PickView[] = [];
  for (const match of matches) {
    for (const seed of trendSeeds) {
      const teamIsHome = match.home.id === seed.teamId;
      const teamIsAway = match.away.id === seed.teamId;
      if (!teamIsHome && !teamIsAway) continue;
      if (!applies(seed.market, teamIsHome)) continue;
      const opponent = teamIsHome ? match.away : match.home;
      const rate = seed.hits / seed.sample;
      const support = supportFor(seed.market, profile(opponent.id));
      const confidence = confidenceOf(rate, support);
      const team = teamIsHome ? match.home : match.away;
      picks.push({
        id: `${match.id}:${seed.id}`,
        trendId: seed.id,
        matchId: match.id,
        competitionId: match.competition.id,
        competitionName: match.competition.name,
        teamId: team.id,
        teamName: team.shortName,
        opponentName: opponent.shortName,
        market: seed.market,
        marketLabel: marketInfo(seed.market).label,
        rate,
        support,
        supportText: supportText(support, opponent.shortName, seed.market),
        confidence,
        grade: gradeFor(confidence),
        bookmarked: rate > TIP_RATE,
        softened: rate > TIP_RATE && confidence <= TIP_RATE,
        odds: demoOdds(confidence, seed.market),
        status: settle(seed.market, match, teamIsHome),
        form: profile(team.id).form,
        squad: profile(team.id).squad,
        label: `${team.shortName} · ${marketInfo(seed.market).label}`,
      });
    }
  }
  return picks.filter((pick) => publishableOdds(pick.odds)).sort((a, b) => b.confidence - a.confidence || a.odds - b.odds);
}

export function qualifying(picks: PickView[]): PickView[] {
  return picks.filter((pick) => {
    if (!publishableOdds(pick.odds) || !SLIP_MARKETS.has(pick.market)) return false;
    if ((pick.sample ?? 0) >= MEASURED) return pick.rate + 1e-9 >= TIP_RATE;
    return pick.bookmarked && pick.confidence > TIP_RATE;
  });
}

export type SharePart = {
  code: string;
  link: string;
  totalOdds: number | null;
  legs: number;
};

export type ShareBook = {
  parts?: SharePart[];
  error?: string | null;
};

export type SharePayload = {
  status: 'pending' | 'ready' | 'empty' | 'error';
  books?: Record<string, ShareBook>;
  error?: string | null;
};

export type BookingCode = {
  id: string;
  name: string;
  note: string;
  code: string;
  link: string;
  parts: SharePart[];
  bookingState: 'unavailable' | 'ready' | 'pending' | 'error';
  legs: PickView[];
  skipped: PickView[];
  status: LegStatus;
  error?: string;
};

export function bookingCodes(slip: PickView[]): BookingCode[] {
  return bookmakers.map((book) => {
    const legs = slip.filter((pick) => book.markets.includes(pick.market));
    const skipped = slip.filter((pick) => !book.markets.includes(pick.market));
    const status: LegStatus = legs.some((leg) => leg.status === 'bust')
      ? 'bust'
      : legs.length > 0 && legs.every((leg) => leg.status === 'won')
        ? 'won'
        : 'open';
    return {
      id: book.id,
      name: book.name,
      note: book.note,
      code: '',
      link: '',
      parts: [],
      bookingState: 'unavailable',
      legs,
      skipped,
      status,
    };
  });
}

const SAFE_LINK = /^https:\/\/(?:www\.sportybet\.com|www\.football\.com|www\.msport\.com|betika\.com|www\.betpawa\.com\.gh)\//i;

export function applyShares(codes: BookingCode[], shares: SharePayload | null): BookingCode[] {
  if (!shares) return codes;
  return codes.map((code) => {
    const book = shares.books?.[code.id];
    const parts = (book?.parts || []).filter((part) => part.code && SAFE_LINK.test(part.link));
    if (parts.length) {
      return {
        ...code,
        bookingState: 'ready',
        code: parts[0].code,
        link: parts[0].link,
        parts,
        note: parts.length > 1 ? `${parts.length} share codes. A long slip is split.` : 'Share code is ready.',
      };
    }
    if (!book) {
      return shares.status === 'pending' ? { ...code, bookingState: 'pending', note: 'Booking this slip.' } : code;
    }
    if (shares.status === 'pending' && !book.error) {
      return { ...code, bookingState: 'pending', note: 'Booking this slip.' };
    }
    const error = book.error || shares.error || 'No code returned.';
    return { ...code, bookingState: 'error', note: error, error };
  });
}

export function suggestPicks(picks: PickView[], slipIds: string[], greenMarketIds: string[]): PickView[] {
  const open = picks.filter((pick) => pick.status === 'open' && pick.bookmarked && !pick.softened);
  const chosen = picks.filter((pick) => slipIds.includes(pick.id) || greenMarketIds.includes(pick.market));
  const markets = new Set(chosen.map((pick) => pick.market));
  const pool = markets.size ? open.filter((pick) => markets.has(pick.market) && !slipIds.includes(pick.id)) : open;
  return [...pool].sort((a, b) => b.confidence - a.confidence).slice(0, 4);
}

export function seedLedger(now = Date.now()): LedgerEntry[] {
  const day = 86_400_000;
  const row = (
    id: string,
    daysAgo: number,
    market: MarketId,
    teamId: string,
    competitionId: string,
    competitionName: string,
    result: 'won' | 'bust',
  ): LedgerEntry => ({
    id,
    at: now - daysAgo * day,
    market,
    teamId,
    teamName: teamName(teamId),
    competitionId,
    competitionName,
    label: `${teamName(teamId)} · ${marketInfo(market).label}`,
    result,
  });
  return [
    row('s1', 1, 'over25', 'ars', 'pl', 'Premier League', 'won'),
    row('s2', 2, 'home', 'psg', 'l1', 'Ligue 1', 'won'),
    row('s3', 3, 'btts', 'bar', 'll', 'La Liga', 'won'),
    row('s4', 4, 'clean', 'aja', 'er', 'Eredivisie', 'bust'),
    row('s5', 5, 'home-score', 'che', 'pl', 'Premier League', 'won'),
    row('s6', 6, 'over35', 'ars', 'pl', 'Premier League', 'won'),
    row('s7', 12, 'home', 'avl', 'pl', 'Premier League', 'bust'),
    row('s8', 18, 'over25', 'bay', 'bl', 'Bundesliga', 'won'),
    row('s9', 21, 'btts', 'bar', 'll', 'La Liga', 'bust'),
    row('s10', 40, 'home', 'psg', 'l1', 'Ligue 1', 'won'),
    row('s11', 70, 'over25', 'bay', 'bl', 'Bundesliga', 'won'),
    row('s12', 120, 'clean', 'aja', 'er', 'Eredivisie', 'won'),
    row('s13', 200, 'home-score', 'che', 'pl', 'Premier League', 'bust'),
    row('s14', 250, 'over35', 'ars', 'pl', 'Premier League', 'won'),
  ];
}

export type RankRow = { id: string; name: string; won: number; played: number; rate: number };

export function rankLedger(
  entries: LedgerEntry[],
  period: 'week' | 'month' | 'year',
  now: number,
  field: 'market' | 'team' | 'competition',
): RankRow[] {
  const windowMs = period === 'week' ? 7 : period === 'month' ? 30 : 365;
  const cutoff = now - windowMs * 86_400_000;
  const buckets = new Map<string, RankRow>();
  for (const entry of entries) {
    if (entry.at < cutoff) continue;
    const id = field === 'market' ? entry.market : field === 'team' ? entry.teamId : entry.competitionId;
    const name = field === 'market' ? marketInfo(entry.market).label : field === 'team' ? entry.teamName : entry.competitionName;
    const row = buckets.get(id) ?? { id, name, won: 0, played: 0, rate: 0 };
    row.played += 1;
    if (entry.result === 'won') row.won += 1;
    row.rate = row.won / row.played;
    buckets.set(id, row);
  }
  return [...buckets.values()].sort((a, b) => b.rate - a.rate || b.won - a.won || a.name.localeCompare(b.name));
}

export function isBlacklisted(pick: PickView, lists: ListItem[]): boolean {
  return lists.some(
    (item) =>
      item.list === 'black' &&
      ((item.scope === 'team' && item.id === pick.teamId) ||
        (item.scope === 'competition' && item.id === pick.competitionId) ||
        (item.scope === 'market' && item.id === pick.market)),
  );
}

export function isGreenlisted(pick: PickView, lists: ListItem[]): boolean {
  return lists.some(
    (item) =>
      item.list === 'green' &&
      ((item.scope === 'team' && item.id === pick.teamId) ||
        (item.scope === 'competition' && item.id === pick.competitionId) ||
        (item.scope === 'market' && item.id === pick.market)),
  );
}
