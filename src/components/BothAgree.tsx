import { useEffect, useMemo, useState } from 'react';
import { CapacitorHttp } from '@capacitor/core';
import { Link } from 'react-router-dom';
import { Crest } from './Crest';
import { catalogCrest, type CrestCatalog } from '../lib/crestCatalog';
import { agreeAside, rateName, readAgreeBoard, sampleText, visibleAgree, type AgreeFixture } from '../lib/bothAgree';
import { apiUrl } from '../lib/apiJson';
import { kickoffClock } from '../lib/format';
import { isNativeApp, nativeRequestOptions, readJsonBody } from '../lib/nativeHttp';
import { tierLabel } from '../lib/pickCodes';
import { isPlayStoreBuild } from '../lib/storeBuild';
import { teamOnList } from '../lib/teamMarks';
import type { ListItem } from '../data/board';
import type { Match, Team } from '../types';

const PREVIEW = 6;

async function loadBoard(): Promise<AgreeFixture[]> {
  const path = '/api/both-agree';
  const url = apiUrl(path);
  if (isNativeApp()) {
    const result = await CapacitorHttp.request(nativeRequestOptions('GET', url, { connectMs: 12_000, readMs: 20_000 }));
    if (result.status < 200 || result.status >= 300) return [];
    return readAgreeBoard(readJsonBody(result.data));
  }
  const response = await fetch(url);
  if (!response.ok) return [];
  return readAgreeBoard(await response.json());
}

function teamOf(name: string, id: string, crest: string | undefined, color: string, catalog: CrestCatalog): Team {
  const team: Team = { id: id || name, name, shortName: name, abbr: name.slice(0, 3).toUpperCase(), color, crest: crest || null };
  if (team.crest) return team;
  const stored = catalogCrest(catalog, team);
  return stored ? { ...team, crest: stored } : team;
}

export function BothAgree({ lists, matches, catalog }: { lists: ListItem[]; matches: Match[]; catalog: CrestCatalog }) {
  const [rows, setRows] = useState<AgreeFixture[] | null>(null);
  const [open, setOpen] = useState(false);
  const play = isPlayStoreBuild();
  useEffect(() => {
    let stop = false;
    void loadBoard()
      .then((body) => {
        if (!stop) setRows(body);
      })
      .catch(() => {
        if (!stop) setRows([]);
      });
    return () => {
      stop = true;
    };
  }, []);

  const shown = useMemo(() => {
    if (!rows) return [];
    const markets = new Set(lists.filter((item) => item.list === 'black' && item.scope === 'market').map((item) => item.id));
    const competitions = new Set(lists.filter((item) => item.list === 'black' && item.scope === 'competition').map((item) => item.id));
    const names = new Set(lists.filter((item) => item.list === 'black' && item.scope === 'competition').map((item) => item.name.toLowerCase()));
    return rows
      .filter((row) => {
        if (teamOnList(lists, 'black', { id: row.homeId, name: row.home })) return false;
        if (teamOnList(lists, 'black', { id: row.awayId, name: row.away })) return false;
        const live = matches.find((match) => match.id === row.id);
        if (live && competitions.has(live.competition.id)) return false;
        if (row.competition && names.has(row.competition.toLowerCase())) return false;
        return true;
      })
      .map((row) => visibleAgree(row, markets))
      .filter((row): row is AgreeFixture => Boolean(row));
  }, [rows, lists, matches]);

  if (!shown.length) return null;
  const preview = open ? shown : shown.slice(0, PREVIEW);
  return (
    <section className="agree-board" aria-label="Both teams agree">
      <header className="agree-head">
        <strong>Both teams agree</strong>
        <small>last 10</small>
      </header>
      {preview.map((row) => {
        const live = matches.find((match) => match.id === row.id);
        const home = teamOf(row.home, row.homeId, live?.home.crest || row.homeCrest, live?.home.color || '#e11d2e', catalog);
        const away = teamOf(row.away, row.awayId, live?.away.crest || row.awayCrest, live?.away.color || '#3d7eff', catalog);
        const clock = kickoffClock(row.kickoff);
        const aside = agreeAside(row, play);
        return (
          <Link key={row.id} className="agree-card" to={`/match/${row.id}`}>
            <span className="agree-row">
              <span className="agree-crests">
                <Crest team={home} size={28} />
                <Crest team={away} size={28} />
              </span>
              <span className="agree-who">
                <b>{row.home}</b>
                <span>
                  {rateName(row.away)}
                  {clock ? ` · ${clock}` : ''} · {row.market.label}
                </span>
              </span>
              <span className="agree-tier">{tierLabel(row.market.tier, play)}</span>
            </span>
            <span className="agree-rates">
              <span className="agree-rate">
                <span>{rateName(row.home)}</span>
                <b>{sampleText(row.market.home)}</b>
              </span>
              <span className="agree-rate">
                <span>{rateName(row.away)}</span>
                <b>{sampleText(row.market.away)}</b>
              </span>
            </span>
            {aside && <p className="agree-meta">{aside}</p>}
          </Link>
        );
      })}
      {shown.length > PREVIEW && (
        <button type="button" className="agree-more" onClick={() => setOpen((value) => !value)}>
          {open ? 'Show fewer' : `Show the other ${shown.length - PREVIEW}`}
        </button>
      )}
    </section>
  );
}
