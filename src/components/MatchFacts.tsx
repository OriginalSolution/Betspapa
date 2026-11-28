import { useEffect, useState } from 'react';
import { CapacitorHttp } from '@capacitor/core';
import { apiUrl } from '../lib/apiJson';
import { isNativeApp, nativeRequestOptions, readJsonBody } from '../lib/nativeHttp';
import { tierLabel, type CodeTier } from '../lib/pickCodes';

type Pair = { home: number; away: number };
type H2HRow = { id: string; date: string; home: string; away: string; homeScore: number; awayScore: number };
type MarketRow = { id: string; label: string; hit: number; n?: number; tier?: CodeTier };
type Side = { name: string; n: number; markets: MarketRow[] } | null;
type TableRow = { pos: number; name: string; played: number; gd: number; points: number; side: 'home' | 'away' | null };
export type MatchInsight = {
  h2h: H2HRow[] | null;
  last10: { home: Side; away: Side } | null;
  table: { name: string; rows: TableRow[] } | null;
  stats: { possession: Pair | null; shots: Pair | null; shotsOn: Pair | null } | null;
};

async function loadInsight(id: string): Promise<MatchInsight | null> {
  const path = `/api/match-insight?id=${encodeURIComponent(id)}`;
  const url = apiUrl(path);
  if (isNativeApp()) {
    const response = await CapacitorHttp.request(nativeRequestOptions('GET', url, { connectMs: 12_000, readMs: 15_000 }));
    if (response.status < 200 || response.status >= 300) return null;
    return readJsonBody(response.data) as MatchInsight;
  }
  const response = await fetch(url);
  if (!response.ok) return null;
  return response.json();
}

function signed(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function StatRow({ label, pair, suffix = '' }: { label: string; pair: Pair; suffix?: string }) {
  const total = pair.home + pair.away;
  const homeShare = suffix === '%' ? Math.max(0, Math.min(100, pair.home)) : total > 0 ? (pair.home / total) * 100 : 0;
  return (
    <div className="stat-row">
      <div className="stat-nums">
        <strong>
          {pair.home}
          {suffix}
        </strong>
        <span>{label}</span>
        <strong>
          {pair.away}
          {suffix}
        </strong>
      </div>
      {total > 0 && (
        <div className="stat-bar" aria-hidden="true">
          <i style={{ width: `${homeShare}%` }} />
        </div>
      )}
    </div>
  );
}

export function MatchFacts({ id, home, away }: { id: string; home: string; away: string }) {
  const [facts, setFacts] = useState<MatchInsight | null>(null);
  useEffect(() => {
    let stop = false;
    setFacts(null);
    void loadInsight(id)
      .then((body) => {
        if (!stop) setFacts(body);
      })
      .catch(() => {
        if (!stop) setFacts(null);
      });
    return () => {
      stop = true;
    };
  }, [id]);
  if (!facts) return null;
  const last = facts.last10;
  const markets = last?.home?.markets || last?.away?.markets || [];
  const stats = facts.stats;
  const showStats = Boolean(stats && (stats.possession || stats.shots || stats.shotsOn));
  if (!facts.h2h && !last && !facts.table && !showStats) return null;
  return (
    <div className="match-facts">
      {facts.h2h && (
        <section className="match-fact" aria-label="Head to head">
          <h2>Head to head</h2>
          <ol>
            {facts.h2h.map((row) => (
              <li key={row.id} className="h2h-row">
                <span>{row.home}</span>
                <b>
                  {row.homeScore}–{row.awayScore}
                </b>
                <span>{row.away}</span>
                {row.date && <small>{row.date}</small>}
              </li>
            ))}
          </ol>
        </section>
      )}
      {last && markets.length > 0 && (
        <section className="match-fact" aria-label="Last 10">
          <h2>Last 10</h2>
          <div className="last10-head">
            <span />
            <span>{last.home?.name || home}</span>
            <span>{last.away?.name || away}</span>
          </div>
          {markets.map((market) => {
            const homeRow = last.home?.markets.find((item) => item.id === market.id);
            const awayRow = last.away?.markets.find((item) => item.id === market.id);
            const tier = homeRow?.tier || awayRow?.tier;
            const count = (row: MarketRow | undefined, side: Side) => (row && side ? `${row.hit}/${row.n ?? side.n}` : '–');
            return (
              <div key={market.id} className={tier ? 'last10-row is-agree' : 'last10-row'}>
                <span>
                  {market.label}
                  {tier && <i className="agree-pill">{tierLabel(tier)}</i>}
                </span>
                <b>{count(homeRow, last.home)}</b>
                <b>{count(awayRow, last.away)}</b>
              </div>
            );
          })}
          <p className="last10-note">1X is that team&apos;s win or draw. X2 is a draw or a loss. 12 is a winner either side. Draw no bet counts a win. Half lines use the first-half score; the second half is full time minus the first half.</p>
        </section>
      )}
      {facts.table && (
        <section className="match-fact" aria-label="League table">
          <h2>{facts.table.name || 'Table'}</h2>
          <div className="table-scroll">
            <div className="table-row table-head">
              <span>#</span>
              <span>Team</span>
              <span>P</span>
              <span>GD</span>
              <span>Pts</span>
            </div>
            {facts.table.rows.map((row) => (
              <div key={`${row.pos}-${row.name}`} className={row.side ? 'table-row is-us' : 'table-row'}>
                <span>{row.pos}</span>
                <span>{row.name}</span>
                <span>{row.played}</span>
                <span>{signed(row.gd)}</span>
                <span>{row.points}</span>
              </div>
            ))}
          </div>
        </section>
      )}
      {showStats && stats && (
        <section className="match-fact" aria-label="Live stats">
          <h2>Stats</h2>
          <div className="stat-names">
            <span>{home}</span>
            <span>{away}</span>
          </div>
          {stats.possession && <StatRow label="Possession" pair={stats.possession} suffix="%" />}
          {stats.shots && <StatRow label="Shots" pair={stats.shots} />}
          {stats.shotsOn && <StatRow label="Shots on target" pair={stats.shotsOn} />}
        </section>
      )}
    </div>
  );
}
