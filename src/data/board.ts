import type { Match } from '../types';
import { teams } from './catalog';

export type MarketId =
  | 'home'
  | 'draw'
  | 'away'
  | 'over15'
  | 'over25'
  | 'over35'
  | 'under25'
  | 'btts'
  | 'btts-no'
  | 'home-score'
  | 'away-score'
  | 'clean';

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
  { id: 'home', label: 'Home win', short: '1' },
  { id: 'draw', label: 'Draw', short: 'X' },
  { id: 'away', label: 'Away win', short: '2' },
  { id: 'over15', label: 'Over 1.5 goals', short: 'O1.5' },
  { id: 'over25', label: 'Over 2.5 goals', short: 'O2.5' },
  { id: 'over35', label: 'Over 3.5 goals', short: 'O3.5' },
  { id: 'under25', label: 'Under 2.5 goals', short: 'U2.5' },
  { id: 'btts', label: 'Both teams to score', short: 'BTTS' },
  { id: 'btts-no', label: 'Both teams not to score', short: 'BTTS no' },
  { id: 'home-score', label: 'Home team to score', short: 'Home score' },
  { id: 'away-score', label: 'Away team to score', short: 'Away score' },
  { id: 'clean', label: 'Clean sheet', short: 'Clean' },
];

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
  teamId: string;
  teamName: string;
  market: MarketId;
  marketLabel: string;
  sample: number;
  hits: number;
  rate: number;
  bookmarked: boolean;
  developing: boolean;
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
  {
    id: 'sportybet',
    name: 'SportyBet',
    prefix: '',
    markets: MARKETS.map((market) => market.id),
    note: 'Code unavailable. No live booking connection.',
  },
  {
    id: 'betway',
    name: 'Betway',
    prefix: '',
    markets: MARKETS.map((market) => market.id),
    note: 'Code unavailable. No live booking connection.',
  },
];

const TIP_RATE = 0.8;

function teamName(id: string): string {
  return teams.find((team) => team.id === id)?.shortName ?? id;
}

export function trendsFromPicks(picks: PickView[]): TrendView[] {
  return picks
    .map((pick) => ({
      id: pick.id,
      teamId: pick.teamId,
      teamName: pick.teamName,
      market: pick.market,
      marketLabel: pick.marketLabel,
      sample: 0,
      hits: 0,
      rate: pick.rate,
      bookmarked: pick.bookmarked,
      developing: !pick.bookmarked && pick.rate >= 0.7 && pick.rate <= TIP_RATE,
      note: pick.supportText,
      form: pick.form,
      squad: pick.squad,
    }))
    .sort((a, b) => b.rate - a.rate || a.teamName.localeCompare(b.teamName));
}

export function listTrends(): TrendView[] {
  return trendSeeds
    .map((seed) => {
      const rate = seed.hits / seed.sample;
      const form = profile(seed.teamId).form;
      const recentWins = form.slice(-3).filter((mark) => mark === 'W').length;
      return {
        id: seed.id,
        teamId: seed.teamId,
        teamName: teamName(seed.teamId),
        market: seed.market,
        marketLabel: marketInfo(seed.market).label,
        sample: seed.sample,
        hits: seed.hits,
        rate,
        bookmarked: rate > TIP_RATE,
        developing: rate <= TIP_RATE && rate >= 0.7 && recentWins >= 2,
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

export function settle(market: MarketId, match: Match, teamIsHome: boolean): LegStatus {
  if (match.status === 'scheduled' || match.status === 'postponed' || match.homeScore == null || match.awayScore == null) {
    return 'open';
  }
  const home = match.homeScore;
  const away = match.awayScore;
  const total = home + away;
  const finished = match.status === 'finished';
  const conceded = teamIsHome ? away : home;
  const scored = teamIsHome ? home : away;
  if (market === 'over15') return total >= 2 ? 'won' : finished ? 'bust' : 'open';
  if (market === 'over25') return total >= 3 ? 'won' : finished ? 'bust' : 'open';
  if (market === 'over35') return total >= 4 ? 'won' : finished ? 'bust' : 'open';
  if (market === 'under25') return total >= 3 ? 'bust' : finished ? 'won' : 'open';
  if (market === 'btts') return home > 0 && away > 0 ? 'won' : finished ? 'bust' : 'open';
  if (market === 'btts-no') return home > 0 && away > 0 ? 'bust' : finished ? 'won' : 'open';
  if (market === 'home-score') return home > 0 ? 'won' : finished ? 'bust' : 'open';
  if (market === 'away-score') return away > 0 ? 'won' : finished ? 'bust' : 'open';
  if (market === 'clean') return conceded > 0 ? 'bust' : finished ? 'won' : 'open';
  if (market === 'home') return finished ? (home > away ? 'won' : 'bust') : 'open';
  if (market === 'away') return finished ? (away > home ? 'won' : 'bust') : 'open';
  if (market === 'draw') return finished ? (home === away ? 'won' : 'bust') : 'open';
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
  ['over-15', 'over15', true],
  ['over-25', 'over25', true],
  ['over-35', 'over35', true],
  ['under-25', 'under25', false],
  ['btts-yes', 'btts', true],
  ['btts-no', 'btts-no', false],
  ['home-over-05', 'home-score', true],
  ['away-over-05', 'away-score', true],
];

function picksFromOdds(match: Match): PickView[] {
  const odds = match.odds;
  if (!odds) return [];
  const homeImp = odds.home ? 1 / odds.home : 0;
  const drawImp = odds.draw ? 1 / odds.draw : 0;
  const awayImp = odds.away ? 1 / odds.away : 0;
  const book = homeImp + drawImp + awayImp || 1;
  const picks: PickView[] = [];
  for (const [key, market, openGame] of ODDS_MARKETS) {
    const price = odds[key];
    if (typeof price !== 'number' || price <= 1) continue;
    const raw = 1 / price;
    const implied = market === 'home' ? homeImp / book : market === 'draw' ? drawImp / book : market === 'away' ? awayImp / book : raw;
    const oneXTwo = market === 'home' || market === 'away' || market === 'draw';
    const backingAway = market === 'away' || market === 'away-score';
    const gap = backingAway ? awayImp - homeImp : homeImp - awayImp;
    const backed = backingAway ? match.away : match.home;
    const opposed = backingAway ? match.home : match.away;
    const support: -1 | 0 | 1 = oneXTwo ? (gap > 0.15 ? 1 : gap < -0.05 ? -1 : 0) : raw >= 0.75 ? 1 : raw < 0.55 ? -1 : 0;
    const confidence = confidenceOf(implied, support);
    void openGame;
    picks.push({
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
      supportText: `Price ${price.toFixed(2)}. ${oneXTwo ? supportText(support, opposed.shortName, market) : support > 0 ? 'Short price, so this is stronger.' : support < 0 ? 'Longer price, so this is softer.' : 'The price sits in the middle.'}`,
      confidence,
      grade: gradeFor(confidence),
      bookmarked: implied > TIP_RATE,
      softened: implied > TIP_RATE && confidence <= TIP_RATE,
      odds: Math.round(price * 100) / 100,
      status: settle(market, match, true),
      form: [],
      squad: 'full',
      label: `${match.home.shortName} vs ${match.away.shortName} · ${marketInfo(market).label}`,
    });
  }
  return picks;
}

export function buildPicks(matches: Match[]): PickView[] {
  if (matches.some((match) => match.feed === 'sporty')) {
    return matches.filter((match) => match.feed === 'sporty').flatMap(picksFromOdds).sort((a, b) => b.confidence - a.confidence || a.odds - b.odds);
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
  return picks.sort((a, b) => b.confidence - a.confidence || a.odds - b.odds);
}

export function qualifying(picks: PickView[]): PickView[] {
  return picks.filter((pick) => pick.bookmarked && pick.confidence > TIP_RATE);
}

export type BookingCode = {
  id: string;
  name: string;
  note: string;
  code: string;
  bookingState: 'unavailable' | 'ready';
  legs: PickView[];
  skipped: PickView[];
  status: LegStatus;
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
      bookingState: 'unavailable',
      legs,
      skipped,
      status,
    };
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
