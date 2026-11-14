import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MARKETS, settle, type MarketId } from '../data/board';
import { BookMark } from '../components/BookMark';
import { Crest } from '../components/Crest';
import { catalogCrest, loadCrestCatalog, type CrestCatalog } from '../lib/crestCatalog';
import {
  DESK_NAMES,
  DESKS,
  type DeskId,
} from '../lib/engineSlips';
import { cx, kickoffClock } from '../lib/format';
import { isLiveStatus } from '../lib/group';
import { backedSide, tipsFromEngine, type PickTip } from '../lib/matchPicks';
import { marketCodeCards, masterParts, shortMarket, type CodePart, type MarketCodeCard } from '../lib/trendDesk';
import type { Team } from '../types';
import { useEngineBoard } from '../state/engine';
import { useProduct } from '../state/product';
import { useStore } from '../state/store';
import { FollowedTrends } from './FollowingPage';

const emptyCatalog: CrestCatalog = { byKey: {}, byId: {} };
const knownMarkets = new Set<string>(MARKETS.map((market) => market.id));

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduced(query.matches);
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);
  return reduced;
}

function useEngineTrends(_refreshKey: number | null) {
  return useEngineBoard();
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return;
  } catch {
    /* the WebView can refuse the async clipboard */
  }
  const area = document.createElement('textarea');
  area.value = value;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.left = '-9999px';
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  area.remove();
}

function teamOf(name: string, catalog: CrestCatalog, live?: Team): Team {
  if (live?.crest) return live;
  const team: Team = live || {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'team',
    name,
    shortName: name,
    abbr: name.slice(0, 3).toUpperCase(),
    color: '#2a303c',
  };
  const crest = catalogCrest(catalog, team);
  return crest ? { ...team, crest } : team;
}

export function TrendsPage() {
  const { trendFollows, toggleTrend } = useProduct();
  const { matches, updatedAt } = useStore();
  const [params] = useSearchParams();
  const focus = params.get('trend');
  const requested = params.get('book');
  const { state, problem } = useEngineTrends(updatedAt);
  const reduced = useReducedMotion();
  const [desk, setDesk] = useState<DeskId>(DESKS.includes(requested as DeskId) ? (requested as DeskId) : 'sportybet');
  const [catalog, setCatalog] = useState<CrestCatalog>(emptyCatalog);
  const [copied, setCopied] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);
  const seenHits = useRef<Set<string> | null>(null);

  useEffect(() => {
    void loadCrestCatalog().then(setCatalog);
  }, []);

  const master = useMemo(() => masterParts(state, desk), [state, desk]);
  const cards = useMemo(() => marketCodeCards(state, desk), [state, desk]);
  const tips = useMemo(() => tipsFromEngine(state, matches), [state, matches]);

  const popped = useMemo(() => {
    return tips.filter((tip) => {
      const match = matches.find((item) => item.id === tip.chip.eventId);
      if (!match || !knownMarkets.has(tip.chip.market)) return false;
      return settle(tip.chip.market as MarketId, match, backedSide(tip.chip.market) !== 'away') === 'won';
    });
  }, [tips, matches]);
  const poppedIds = useMemo(() => new Set(popped.map((tip) => tip.chip.id)), [popped]);
  const live = useMemo(() => {
    const rows = tips.filter((tip) => !poppedIds.has(tip.chip.id));
    const liveRank = (tip: PickTip) => (isLiveStatus(matches.find((item) => item.id === tip.chip.eventId)?.status || 'scheduled') ? 1 : 0);
    return rows.sort((a, b) => liveRank(b) - liveRank(a) || (b.chip.rate || 0) - (a.chip.rate || 0));
  }, [tips, poppedIds, matches]);

  useEffect(() => {
    const ids = popped.map((tip) => tip.chip.id);
    if (!seenHits.current) {
      seenHits.current = new Set(ids);
      return;
    }
    const fresh = ids.find((id) => !seenHits.current?.has(id));
    for (const id of ids) seenHits.current.add(id);
    if (!fresh || reduced) return;
    setFlashId(fresh);
    const timer = window.setTimeout(() => setFlashId((current) => (current === fresh ? null : current)), 1400);
    return () => window.clearTimeout(timer);
  }, [popped, reduced]);

  useEffect(() => {
    if (!focus) return;
    document.getElementById(`trend-${focus}`)?.scrollIntoView({ block: 'center' });
  }, [focus, live, popped]);

  const copy = (id: string, value: string) => {
    void copyText(value);
    setCopied(id);
    window.setTimeout(() => setCopied((current) => (current === id ? null : current)), 1600);
  };

  return (
    <div className="stack trends-option-c">
      <div className="trend-seg" role="tablist" aria-label="Bookmaker">
        {DESKS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={desk === id}
            className={cx('trend-seg-btn', `desk-${id}`, desk === id && 'is-on')}
            onClick={() => {
              setDesk(id);
              setFlipped(false);
            }}
          >
            <BookMark id={id} />
            <span>{id === 'footballcom' ? 'Football' : DESK_NAMES[id]}</span>
          </button>
        ))}
      </div>

      {!state && <TrendSkeleton problem={problem} />}

      {state && (
        <MasterCard
          desk={desk}
          parts={master.parts}
          legs={master.legs}
          bookedAt={master.bookedAt}
          updated={updatedClock(state?.updatedAt || null)}
          flipped={flipped}
          reduced={reduced}
          copied={copied}
          catalog={catalog}
          matches={matches}
          onFlip={() => setFlipped((current) => !current)}
          onCopy={copy}
        />
      )}

      {state && (
        <section className="trend-block" aria-label="Codes by market">
          <div className="tip-head">
            <h2>Codes by market</h2>
            <span>Swipe</span>
          </div>
          <div className="trend-carousel">
            {cards.map((card) => (
              <MarketCard key={card.id} card={card} desk={desk} copied={copied} onCopy={copy} />
            ))}
            {cards.length === 0 && <p className="lede">No market codes on this board.</p>}
          </div>
        </section>
      )}

      <FollowedTrends />

      {live.length > 0 && (
        <section className="trend-block" id="live-trends" aria-label="Live trends">
          <div className="tip-head">
            <h2>Live trends</h2>
            <span>{live.length === 1 ? '1 tip' : `${live.length} tips`}</span>
          </div>
          {live.map((tip) => (
            <LiveRow
              key={tip.chip.id}
              tip={tip}
              catalog={catalog}
              matches={matches}
              following={trendFollows.includes(tip.chip.id)}
              reduced={reduced}
              focus={focus === tip.chip.id}
              onFollow={() => toggleTrend(tip.chip.id)}
            />
          ))}
        </section>
      )}

      {popped.length > 0 && (
        <section className="trend-block" aria-label="Popped off">
          <div className="tip-head">
            <h2>Popped off</h2>
            <span>Already hit</span>
          </div>
          {popped.map((tip) => (
            <PoppedRow
              key={tip.chip.id}
              tip={tip}
              catalog={catalog}
              matches={matches}
              desk={desk}
              following={trendFollows.includes(tip.chip.id)}
              flash={flashId === tip.chip.id}
              focus={focus === tip.chip.id}
              onFollow={() => toggleTrend(tip.chip.id)}
            />
          ))}
        </section>
      )}
    </div>
  );
}

function TrendSkeleton({ problem }: { problem: string | null }) {
  return (
    <div className="trend-skel" aria-busy="true">
      <div className="trend-skel-master">
        <i className="trend-shimmer" />
      </div>
      <div className="trend-skel-row" />
      <div className="trend-skel-row" />
      {problem && <p className="lede">Could not load codes. They appear when the engine responds.</p>}
    </div>
  );
}

function flipKey(event: { key: string; preventDefault: () => void; target: EventTarget | null; currentTarget: EventTarget | null }, onFlip: () => void) {
  if (event.target !== event.currentTarget) return;
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  onFlip();
}

function CopyButton({ id, value, copied, onCopy }: { id: string; value: string; copied: string | null; onCopy: (id: string, value: string) => void }) {
  const on = copied === id;
  return (
    <button
      type="button"
      className={cx('btn', 'trend-copy', on && 'is-copied')}
      onClick={(event) => {
        event.stopPropagation();
        onCopy(id, value);
      }}
    >
      {on ? 'Copied' : 'Copy'}
    </button>
  );
}

function updatedClock(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Africa/Accra' }).format(date);
}

function MasterCard({
  desk,
  parts,
  legs,
  bookedAt,
  updated,
  flipped,
  reduced,
  copied,
  catalog,
  matches,
  onFlip,
  onCopy,
}: {
  desk: DeskId;
  parts: CodePart[];
  legs: ReturnType<typeof masterParts>['legs'];
  bookedAt: string | null;
  updated: string;
  flipped: boolean;
  reduced: boolean;
  copied: string | null;
  catalog: CrestCatalog;
  matches: ReturnType<typeof useStore>['matches'];
  onFlip: () => void;
  onCopy: (id: string, value: string) => void;
}) {
  const booked = kickoffClock(bookedAt || '');
  const front = (
    <div className="trend-face">
      <div className="trend-kicker">Master slip</div>
      {updated && <p className="trend-updated">Updated {updated}</p>}
      {parts.length === 0 && <p className="trend-nocode">No code this cycle</p>}
      {parts.map((part) => {
        const id = `master:${desk}:${part.code}`;
        const bits = [`${part.legs} ${part.legs === 1 ? 'leg' : 'legs'}`, part.odds, booked ? `booked ${booked}` : ''].filter(Boolean);
        return (
          <div className="trend-part" key={part.code}>
            {part.total > 1 && (
              <p className="trend-part-label">
                Part {part.index}/{part.total}
              </p>
            )}
            <p className="trend-code" data-master-code={part.code}>
              {part.code}
            </p>
            <div className="trend-part-row">
              <span>{bits.join(' · ')}</span>
              <CopyButton id={id} value={part.code} copied={copied} onCopy={onCopy} />
            </div>
          </div>
        );
      })}
    </div>
  );
  const back = (
    <div className="trend-face trend-face-back">
      <div className="trend-kicker">Master legs</div>
      <ul className="trend-legs">
        {legs.map((leg) => {
          const [homeName, awayName] = leg.match.split(/\s+vs\s+/i);
          const board = matches.find((match) => match.id === leg.eventId);
          const home = teamOf(homeName || leg.match, catalog, board?.home);
          const away = awayName ? teamOf(awayName, catalog, board?.away) : null;
          return (
            <li key={`${leg.eventId}:${leg.market}`}>
              <span className="trend-leg-sides">
                <Crest team={home} size={18} />
                {away && <Crest team={away} size={18} />}
              </span>
              <span>
                {home.shortName}
                {away ? ` vs ${away.shortName}` : ''} · {shortMarket(leg.market)}
              </span>
              <em>{leg.odds.toFixed(2)}</em>
            </li>
          );
        })}
        {legs.length === 0 && <li className="trend-leg-empty">No priced legs on this slip.</li>}
      </ul>
    </div>
  );

  if (reduced) {
    return (
      <section className={cx('trend-master', `desk-${desk}`)}>
        <button type="button" className="trend-flip-toggle" onClick={onFlip}>
          {flipped ? 'Show code' : 'Show legs'}
        </button>
        {flipped ? back : front}
      </section>
    );
  }

  return (
    <section className={cx('trend-flip', flipped && 'is-flipped', `desk-${desk}`)}>
      <div className="trend-flip-inner">
        <div className="trend-face-hit" role="button" tabIndex={0} aria-pressed={flipped} onClick={onFlip} onKeyDown={(event) => flipKey(event, onFlip)}>
          {front}
        </div>
        <div className="trend-face-hit trend-face-hit-back" role="button" tabIndex={0} aria-pressed={flipped} onClick={onFlip} onKeyDown={(event) => flipKey(event, onFlip)}>
          {back}
        </div>
      </div>
    </section>
  );
}

function MarketCard({ card, desk, copied, onCopy }: { card: MarketCodeCard; desk: DeskId; copied: string | null; onCopy: (id: string, value: string) => void }) {
  const code = card.codes[0];
  const id = `market:${desk}:${card.id}`;
  const bits = [`${card.legs} ${card.legs === 1 ? 'leg' : 'legs'}`, card.odds].filter(Boolean);
  return (
    <article className="trend-ccard" data-market-code={code || ''}>
      <b>{card.label}</b>
      <p>{bits.join(' · ')}</p>
      {card.codes.length === 0 && <p className="trend-card-code">No code this cycle</p>}
      {card.codes.map((item, index) => (
        <div key={item}>
          {card.codes.length > 1 && <p className="trend-part-label">Part {index + 1}/{card.codes.length}</p>}
          <p className="trend-card-code">{item}</p>
          <CopyButton id={`${id}:${item}`} value={item} copied={copied} onCopy={onCopy} />
        </div>
      ))}
    </article>
  );
}

function RateRing({ rate, reduced }: { rate: number; reduced: boolean }) {
  const pct = Math.round(rate * 100);
  const radius = 16;
  const turn = 2 * Math.PI * radius;
  const dash = turn * Math.min(1, Math.max(0, rate));
  return (
    <span className={cx('trend-ring', pct >= 90 ? 'is-hot' : 'is-warm', !reduced && 'is-play')} style={{ ['--p' as string]: String(dash) }} aria-label={`${pct}% hit rate`}>
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <circle className="trend-ring-track" cx="20" cy="20" r={radius} />
        <circle className="trend-ring-fill" cx="20" cy="20" r={radius} />
      </svg>
      <b>{pct}%</b>
    </span>
  );
}

function LiveRow({
  tip,
  catalog,
  matches,
  following,
  reduced,
  focus,
  onFollow,
}: {
  tip: PickTip;
  catalog: CrestCatalog;
  matches: ReturnType<typeof useStore>['matches'];
  following: boolean;
  reduced: boolean;
  focus: boolean;
  onFollow: () => void;
}) {
  const match = matches.find((item) => item.id === tip.chip.eventId);
  const home = teamOf(tip.home, catalog, match?.home);
  const away = teamOf(tip.away, catalog, match?.away);
  const live = match ? isLiveStatus(match.status) : false;
  const clock = kickoffClock(tip.kickoff);
  return (
    <article id={`trend-${tip.chip.id}`} className={cx('trend-live', live && 'is-live', focus && 'trend-focus')}>
      {tip.chip.rate != null && <RateRing rate={tip.chip.rate} reduced={reduced} />}
      <div className="trend-live-copy">
        <strong>
          {live && <i className={cx('trend-pulse', reduced && 'is-still')} aria-hidden="true" />}
          <Crest team={home} size={18} />
          <Crest team={away} size={18} />
          <span>
            {tip.home} vs {tip.away}
          </span>
        </strong>
        <p>
          {shortMarket(tip.chip.market)}
          {clock ? ` · ${clock}` : ''}
        </p>
      </div>
      <button type="button" className={cx('trend-follow', following && 'is-on')} onClick={onFollow}>
        {following ? 'Following' : 'Follow'}
      </button>
    </article>
  );
}

function PoppedRow({
  tip,
  catalog,
  matches,
  desk,
  following,
  flash,
  focus,
  onFollow,
}: {
  tip: PickTip;
  catalog: CrestCatalog;
  matches: ReturnType<typeof useStore>['matches'];
  desk: DeskId;
  following: boolean;
  flash: boolean;
  focus: boolean;
  onFollow: () => void;
}) {
  const match = matches.find((item) => item.id === tip.chip.eventId);
  const home = teamOf(tip.home, catalog, match?.home);
  const away = teamOf(tip.away, catalog, match?.away);
  const pct = Math.round((tip.chip.rate || 0) * 100);
  return (
    <article id={`trend-${tip.chip.id}`} className={cx('trend-pop', flash && 'is-flash', focus && 'trend-focus')}>
      {flash && (
        <span className="trend-confetti" aria-hidden="true">
          <i /><i /><i /><i /><i />
        </span>
      )}
      <div className="trend-pop-top">
        <span className="trend-leg-sides">
          <Crest team={home} size={22} />
          <Crest team={away} size={22} />
        </span>
        <div>
          <strong>
            {tip.home} vs {tip.away} · {shortMarket(tip.chip.market)}
          </strong>
          <p>Already hit.</p>
        </div>
        <b>
          {pct}%<small>Hit</small>
        </b>
      </div>
      <div className="trend-pop-acts">
        <button type="button" className={cx('btn', 'trend-follow', following && 'is-on')} onClick={onFollow}>
          {following ? 'Following' : 'Follow trend'}
        </button>
        <Link className="btn btn-quiet btn-tiny" to={`/slips?trend=${encodeURIComponent(`80:${tip.chip.market}`)}&book=${desk}`}>
          Code
        </Link>
        <Link className="btn btn-quiet btn-tiny" to={`/match/${tip.chip.eventId}`}>
          Match
        </Link>
      </div>
    </article>
  );
}
