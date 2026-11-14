import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CodeStrip } from '../components/CodeStrip';
import { Crest } from '../components/Crest';
import { FormPips } from '../components/PickCard';
import { catalogCrest, loadCrestCatalog, type CrestCatalog } from '../lib/crestCatalog';
import { fetchEngine, marketLabel, readEngineCache, writeEngineCache, ENGINE_POLL_MS, type DeskId, type EngineState } from '../lib/engineSlips';
import { slipParts, tierMin, tierSlip, TIER_LABEL, type CodeTier } from '../lib/pickCodes';
import { cx, kickoffClock } from '../lib/format';
import { combinedOdds, marketFilters, tipsFromEngine, type PickChip, type PickTip } from '../lib/matchPicks';
import type { Team } from '../types';
import { useProduct } from '../state/product';
import { useStore } from '../state/store';

const emptyCatalog: CrestCatalog = { byKey: {}, byId: {} };

function useEngine() {
  const [state, setState] = useState<EngineState | null>(() => readEngineCache());
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    let stop = false;
    const pull = async () => {
      try {
        const next = await fetchEngine();
        if (stop) return;
        writeEngineCache(next);
        setState(next);
        setProblem(null);
      } catch (error) {
        if (!stop) setProblem(error instanceof Error ? error.message : 'Could not load picks');
      }
    };
    void pull();
    const timer = window.setInterval(() => void pull(), ENGINE_POLL_MS);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, []);
  return { state, problem };
}

function teamOf(name: string, id: string, abbr: string, color: string, catalog: CrestCatalog, crest?: string | null): Team {
  const team: Team = { id, name, shortName: name, abbr: abbr || name.slice(0, 3).toUpperCase(), color };
  if (crest) return { ...team, crest };
  const stored = catalogCrest(catalog, team);
  return stored ? { ...team, crest: stored } : team;
}

export function PicksPage() {
  const { matches } = useStore();
  const { lists, addLeg, removeLeg, slip } = useProduct();
  const { state, problem } = useEngine();
  const [market, setMarket] = useState('all');
  const [desk, setDesk] = useState<DeskId>('sportybet');
  const [tier, setTier] = useState<CodeTier>('80');
  const [catalog, setCatalog] = useState<CrestCatalog>(emptyCatalog);
  const [chosen, setChosen] = useState<string[]>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('betspapa.pickChips.v1') || '[]') as unknown;
      return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('betspapa.pickChips.v1', JSON.stringify(chosen));
    } catch {
      /* the selection still lives in this session */
    }
  }, [chosen]);
  useEffect(() => {
    void loadCrestCatalog().then(setCatalog);
  }, []);

  const blocked = useMemo(() => {
    const teams = new Set(lists.filter((item) => item.list === 'black' && item.scope === 'team').map((item) => item.id));
    const markets = new Set(lists.filter((item) => item.list === 'black' && item.scope === 'market').map((item) => item.id));
    const competitions = new Set(lists.filter((item) => item.list === 'black' && item.scope === 'competition').map((item) => item.id));
    return { teams, markets, competitions };
  }, [lists]);

  const tips = useMemo(() => {
    return tipsFromEngine(state, matches).filter(
      (tip) => !blocked.markets.has(tip.chip.market) && !blocked.teams.has(tip.chip.teamId) && !blocked.competitions.has(tip.competitionId),
    );
  }, [state, matches, blocked]);
  const band = useMemo(() => tips.filter((tip) => (tip.chip.rate ?? 0) + 1e-12 >= tierMin(tier)), [tips, tier]);
  const filters = useMemo(() => marketFilters(band), [band]);
  useEffect(() => {
    if (market !== 'all' && !filters.some((item) => item.id === market)) setMarket('all');
  }, [filters, market]);
  const shown = market === 'all' ? band : band.filter((tip) => tip.chip.market === market);
  const booked = slipParts(tierSlip(state, tier, market === 'all' ? null : market), desk);

  const selected = useMemo(() => {
    const byId = new Map(tips.map((tip) => [tip.chip.id, tip.chip]));
    return chosen.map((id) => byId.get(id)).filter((chip): chip is PickChip => Boolean(chip));
  }, [tips, chosen]);
  const total = combinedOdds(selected);

  const toggleChip = (chip: PickChip) => {
    const on = chosen.includes(chip.id);
    setChosen((current) => (on ? current.filter((id) => id !== chip.id) : [...current, chip.id]));
    if (on) removeLeg(chip.id);
    else if (!slip.includes(chip.id)) addLeg(chip.id);
  };

  return (
    <div className={cx('stack', 'picks-page', selected.length > 0 && 'has-float')}>
      <CodeStrip
        desk={desk}
        tier={tier}
        title={market === 'all' ? `${TIER_LABEL[tier]} all picks` : `${TIER_LABEL[tier]} ${marketLabel(market)}`}
        parts={booked.parts}
        bookedAt={booked.bookedAt}
        note={state?.showingCached ? 'Showing the last booked board' : undefined}
        onDesk={setDesk}
        onTier={setTier}
      />
      <div className="market-filters" role="tablist" aria-label="Filter by market">
        <button type="button" role="tab" aria-selected={market === 'all'} className={cx('market-filter', market === 'all' && 'is-on')} onClick={() => setMarket('all')}>
          All
        </button>
        {filters.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={market === item.id}
            className={cx('market-filter', market === item.id && 'is-on')}
            onClick={() => setMarket(item.id)}
          >
            {item.label}
            <small>{slipParts(tierSlip(state, tier, item.id), desk).parts[0]?.code || ''}</small>
          </button>
        ))}
      </div>
      <div className="tip-head">
        <h2>{TIER_LABEL[tier]} tips</h2>
        <span>{shown.length === 1 ? '1 tip' : `${shown.length} tips`}</span>
      </div>
      {!state && <p className="lede">{problem ? 'Could not load picks. They appear when the engine responds.' : 'Loading picks.'}</p>}
      {shown.map((tip, index) => (
        <TipRow
          key={tip.chip.id}
          tip={tip}
          catalog={catalog}
          matches={matches}
          onSlip={chosen.includes(tip.chip.id)}
          hint={index === 0}
          onToggle={() => toggleChip(tip.chip)}
        />
      ))}
      {state && shown.length === 0 && (
        <div className="empty">
          <h2>No picks on this board</h2>
          <p>Picks appear when an 80% trend has a price of 1.18 or higher.</p>
        </div>
      )}
      {selected.length > 0 && total != null && (
        <Link className="pick-float" to="/slips">
          <span>
            {selected.length} {selected.length === 1 ? 'leg' : 'legs'}
          </span>
          <strong>{total.toFixed(2)}</strong>
          <em>Open slip</em>
        </Link>
      )}
    </div>
  );
}

function HitRing({ rate }: { rate: number }) {
  const pct = Math.round(rate * 100);
  const hot = pct >= 90;
  const radius = 16;
  const turn = 2 * Math.PI * radius;
  const dash = turn * Math.min(1, Math.max(0, rate));
  return (
    <span className={cx('hit-ring', hot ? 'is-hot' : 'is-warm')} aria-label={`${pct}% hit rate`}>
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r={radius} className="hit-track" />
        <circle cx="20" cy="20" r={radius} className="hit-value" strokeDasharray={`${dash} ${turn - dash}`} />
      </svg>
      <b>{pct}%</b>
    </span>
  );
}

function TipRow({
  tip,
  catalog,
  matches,
  onSlip,
  hint,
  onToggle,
}: {
  tip: PickTip;
  catalog: CrestCatalog;
  matches: ReturnType<typeof useStore>['matches'];
  onSlip: boolean;
  hint: boolean;
  onToggle: () => void;
}) {
  const live = matches.find((match) => match.id === tip.chip.eventId);
  const home = teamOf(tip.home, tip.homeId, live?.home.abbr || '', live?.home.color || '#e11d2e', catalog, live?.home.crest);
  const away = teamOf(tip.away, tip.awayId, live?.away.abbr || '', live?.away.color || '#3d7eff', catalog, live?.away.crest);
  const clock = kickoffClock(tip.kickoff);
  const [offset, setOffset] = useState(0);
  const shift = useRef(0);
  const start = useRef<{ x: number; y: number; pointer: number } | null>(null);
  const dragging = useRef(false);
  const suppress = useRef(false);

  const move = (next: number) => {
    shift.current = next;
    setOffset(next);
  };

  const end = (commit: boolean) => {
    if (dragging.current) suppress.current = true;
    if (commit && shift.current > 72) onToggle();
    move(0);
    start.current = null;
    dragging.current = false;
    window.setTimeout(() => {
      suppress.current = false;
    }, 350);
  };

  return (
    <article className={cx('tip-swipe', onSlip && 'is-on')}>
      <span className="tip-reveal">Slip</span>
      <div
        className="tip-row"
        style={{ transform: `translateX(${offset}px)` }}
        onPointerDown={(event) => {
          start.current = { x: event.clientX, y: event.clientY, pointer: event.pointerId };
          dragging.current = false;
        }}
        onPointerMove={(event) => {
          if (!start.current || start.current.pointer !== event.pointerId) return;
          const dx = event.clientX - start.current.x;
          const dy = event.clientY - start.current.y;
          if (!dragging.current && Math.abs(dx) < 8) return;
          if (!dragging.current && Math.abs(dy) > Math.abs(dx)) {
            start.current = null;
            return;
          }
          dragging.current = true;
          event.currentTarget.setPointerCapture?.(event.pointerId);
          move(Math.max(0, Math.min(120, dx)));
        }}
        onPointerUp={() => end(dragging.current)}
        onPointerCancel={() => end(false)}
      >
        <button
          type="button"
          className="tip-main"
          aria-pressed={onSlip}
          onClick={() => {
            if (suppress.current) return;
            onToggle();
          }}
        >
          {tip.chip.rate != null && <HitRing rate={tip.chip.rate} />}
          <span className="tip-copy">
            <strong>{marketLabel(tip.chip.market)}</strong>
            <span className="tip-fixture">
              <Crest team={home} size={18} />
              <Crest team={away} size={18} />
              <em>
                {tip.home} vs {tip.away}
                {clock ? ` - ${clock}` : ''}
              </em>
            </span>
            {(tip.chip.form?.length || tip.chip.opponentHeld || tip.chip.exception) && (
              <span className="tip-extra">
                {tip.chip.form && tip.chip.form.length > 0 && <FormPips form={tip.chip.form} />}
                {tip.chip.exception && <i className="exception-chip">Exception</i>}
                {tip.chip.opponentHeld && <i className="held-chip">Held after opponent</i>}
              </span>
            )}
          </span>
          <span className="tip-price">
            <b>{tip.chip.odds.toFixed(2)}</b>
            {hint && <small>Swipe &gt;</small>}
          </span>
        </button>
      </div>
    </article>
  );
}
