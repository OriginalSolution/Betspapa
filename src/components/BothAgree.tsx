import { useEffect, useMemo, useState } from 'react';
import { CapacitorHttp } from '@capacitor/core';
import { Link } from 'react-router-dom';
import { CodeActions } from './CodeActions';
import { Crest } from './Crest';
import { SlipBell } from './SlipBell';
import { catalogCrest, type CrestCatalog } from '../lib/crestCatalog';
import { agreeAside, agreeCopyText, agreeQuote, rateName, readAgreeBoard, sampleText, visibleAgree, type AgreeFixture } from '../lib/bothAgree';
import { apiUrl } from '../lib/apiJson';
import { bookGroups, type BookedGroup } from '../lib/bookFollow';
import { copyText, openBookmaker } from '../lib/bookmakerLink';
import { kickoffClock } from '../lib/format';
import { isNativeApp, nativeRequestOptions, readJsonBody } from '../lib/nativeHttp';
import { tierLabel } from '../lib/pickCodes';
import { setBell } from '../lib/slipBells';
import { useSlipBells } from '../lib/useSlipBells';
import { isPlayStoreBuild } from '../lib/storeBuild';
import { teamOnList } from '../lib/teamMarks';
import type { DeskId } from '../lib/engineSlips';
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

export function BothAgree({ lists, matches, catalog, desk }: { lists: ListItem[]; matches: Match[]; catalog: CrestCatalog; desk: DeskId }) {
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
          <article key={row.id} className="agree-card">
            <Link className="agree-link" to={`/match/${row.id}`}>
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
            <AgreeActions row={row} desk={desk} />
          </article>
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

function codeFrom(group: BookedGroup | undefined, desk: DeskId, play: boolean): { code: string; link: string } | null {
  if (!group?.books) return null;
  const books = play ? Object.values(group.books) : [group.books[desk]];
  for (const book of books) {
    const part = book?.parts?.find((item) => item.code);
    if (part?.code) return { code: part.code, link: play ? '' : part.link || '' };
  }
  return null;
}

function AgreeActions({ row, desk }: { row: AgreeFixture; desk: DeskId }) {
  const play = isPlayStoreBuild();
  const bells = useSlipBells();
  const bellId = `agree:${row.id}:${row.market.id}`;
  const bellOn = Boolean(bells[bellId]?.on);
  const quote = agreeQuote(row);
  const [booked, setBooked] = useState<{ code: string; link: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  const remember = async (): Promise<{ code: string; link: string } | null> => {
    if (booked) return booked;
    if (!quote) return null;
    setBusy(true);
    setStatus('');
    try {
      const groups = await bookGroups([
        {
          id: bellId,
          legs: [{ eventId: row.id, market: quote.market, odds: quote.odds, kickoff: row.kickoff, match: `${row.home} vs ${row.away}` }],
        },
      ]);
      const found = codeFrom(groups[0], desk, play);
      if (!found) {
        setStatus('No code yet.');
        return null;
      }
      setBooked(found);
      return found;
    } catch {
      setStatus('No code yet.');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const copyPlain = () => {
    void copyText(agreeCopyText(row)).then(() => setStatus('Copied'));
  };

  const onCopy = () => {
    if (!quote) {
      copyPlain();
      return;
    }
    void remember().then((found) => {
      if (found) void copyText(found.code).then(() => setStatus('Copied'));
    });
  };

  const onLoad = () => {
    if (play) return;
    if (!quote) {
      setStatus('Outside the odds range.');
      return;
    }
    void remember().then((found) => {
      if (found) void openBookmaker(desk, found.code, found.link);
    });
  };

  const toggleBell = () => {
    const market = quote?.market || row.market.id;
    const leg = {
      key: `${row.id}|${market}`,
      eventId: row.id,
      market,
      label: row.market.label,
      odds: quote?.odds || 0,
      kickoff: row.kickoff,
      home: row.home,
      away: row.away,
    };
    setBell(bellId, !bellOn, { label: `${row.home} v ${row.away}`, legs: [leg] });
  };

  return (
    <div className="agree-actions">
      {booked ? (
        <CodeActions code={booked.code} desk={play ? null : desk} link={play ? '' : booked.link} />
      ) : (
        <span className="code-pair">
          <button type="button" className="btn btn-tiny btn-quiet" disabled={busy} onClick={onCopy}>
            {busy ? 'Wait' : 'Copy'}
          </button>
          {!play && (
            <button type="button" className="btn btn-tiny" disabled={busy} onClick={onLoad}>
              Load
            </button>
          )}
        </span>
      )}
      <SlipBell on={bellOn} count={1} onToggle={toggleBell} className="slip-bell-small" />
      {status && <p className="agree-status">{status}</p>}
    </div>
  );
}
