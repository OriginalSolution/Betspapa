import { priceAllowed } from './slipPacks';
import { tierLabel, type CodeTier } from './pickCodes';

export type AgreeSample = { hit: number; n: number };

export type AgreeMarket = {
  id: string;
  label: string;
  tier: CodeTier;
  home: AgreeSample;
  away: AgreeSample;
};

export type AgreeMiss = { id: string; label: string; home: AgreeSample; away: AgreeSample };

export type AgreeFixture = {
  id: string;
  home: string;
  away: string;
  homeId: string;
  awayId: string;
  homeCrest?: string;
  awayCrest?: string;
  kickoff: string;
  competition?: string;
  market: AgreeMarket;
  also: AgreeMarket[];
  miss: AgreeMiss | null;
  /** Present only when this row's market has a price inside its odds band. */
  quote: { market: string; odds: number } | null;
};

/** Blacklist ids for the same named line. Booking still refuses team 1X, which is not home 1X. */
const ALIAS: Record<string, string[]> = {
  dc1x: ['dc-1x'],
  dcx2: ['dc-x2'],
  dc12: ['dc-12'],
  dnb: ['dnb-home', 'dnb-away'],
  '1h05': ['fh-over05'],
  '1h15': ['fh-over15'],
};

const TIERS = new Set<CodeTier>(['100', '90', '80']);

export function agreeMarketBlocked(blocked: ReadonlySet<string>, id: string): boolean {
  if (blocked.has(id)) return true;
  return (ALIAS[id] || []).some((alias) => blocked.has(alias));
}

/** Drop blacklisted markets. A green light does not add a market that did not agree. */
export function visibleAgree(row: AgreeFixture, blocked: ReadonlySet<string>): AgreeFixture | null {
  const open = [row.market, ...(row.also || [])].filter((market) => market && market.id !== 'dc12' && market.id !== 'dc-12' && TIERS.has(market.tier) && !agreeMarketBlocked(blocked, market.id));
  if (!open.length) return null;
  const [market, ...also] = open;
  return { ...row, market, also, quote: market.id === row.market.id ? row.quote : null };
}

export function sampleText(sample: AgreeSample): string {
  return `${sample.hit}/${sample.n}`;
}

export function rateName(name: string): string {
  const clean = String(name || '').replace(/^(SC|FC|AC|AS|SS|CD|CF)\s+/i, '').replace(/\s+(FC|SC|CF)$/i, '').trim();
  return clean || name;
}

/** Web and sideload load a code. Play copies it and never names a bookmaker. */
export function agreeActionLabels(play: boolean): Array<'Copy' | 'Load' | 'Alerts'> {
  return play ? ['Copy', 'Alerts'] : ['Copy', 'Load', 'Alerts'];
}

/** The priced leg for this row. A missing or out-of-band price is not bookable, and a green light is not consulted. */
export function agreeQuote(row: Pick<AgreeFixture, 'quote'>): { market: string; odds: number } | null {
  const quote = row.quote;
  if (!quote || !priceAllowed(quote.market, quote.odds)) return null;
  return { market: quote.market, odds: quote.odds };
}

/** Plain text for Copy when this row has no code. No link and no bookmaker. */
export function agreeCopyText(row: AgreeFixture): string {
  return `${row.home} v ${row.away} · ${row.market.label} · ${sampleText(row.market.home)} and ${sampleText(row.market.away)}`;
}

export function agreeAside(row: AgreeFixture, play: boolean): string {
  const bits: string[] = [];
  for (const extra of (row.also || []).slice(0, 2)) {
    bits.push(`${extra.label} also agrees at ${tierLabel(extra.tier, play)}, ${sampleText(extra.home)} and ${sampleText(extra.away)}.`);
  }
  if (row.miss) {
    bits.push(`${row.miss.label} is ${sampleText(row.miss.home)} and ${sampleText(row.miss.away)}, so that market stays off.`);
  }
  return bits.join(' ');
}

function sample(value: unknown): AgreeSample | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as AgreeSample;
  if (!Number.isFinite(row.hit) || !Number.isFinite(row.n) || row.n <= 0) return null;
  return { hit: row.hit, n: row.n };
}

function market(value: unknown): AgreeMarket | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as AgreeMarket;
  const home = sample(row.home);
  const away = sample(row.away);
  if (!home || !away || typeof row.id !== 'string' || typeof row.label !== 'string' || !TIERS.has(row.tier)) return null;
  return { id: row.id, label: row.label, tier: row.tier, home, away };
}

export function readAgreeBoard(body: unknown): AgreeFixture[] {
  const fixtures = body && typeof body === 'object' ? (body as { fixtures?: unknown }).fixtures : null;
  if (!Array.isArray(fixtures)) return [];
  const rows: AgreeFixture[] = [];
  for (const value of fixtures) {
    if (!value || typeof value !== 'object') continue;
    const row = value as AgreeFixture;
    const lead = market(row.market);
    if (!lead || typeof row.id !== 'string' || typeof row.home !== 'string' || typeof row.away !== 'string') continue;
    const missMarket = row.miss ? market({ ...row.miss, tier: '80' }) : null;
    const quote = row.quote && typeof row.quote === 'object' ? agreeQuote({ quote: { market: String(row.quote.market || ''), odds: Number(row.quote.odds) } }) : null;
    rows.push({
      id: row.id,
      home: row.home,
      away: row.away,
      homeId: String(row.homeId || ''),
      awayId: String(row.awayId || ''),
      homeCrest: row.homeCrest || '',
      awayCrest: row.awayCrest || '',
      kickoff: String(row.kickoff || ''),
      competition: String(row.competition || ''),
      market: lead,
      also: (row.also || []).map(market).filter((item): item is AgreeMarket => Boolean(item)),
      miss: missMarket ? { id: missMarket.id, label: missMarket.label, home: missMarket.home, away: missMarket.away } : null,
      quote,
    });
  }
  return rows;
}
