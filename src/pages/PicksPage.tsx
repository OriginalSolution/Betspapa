import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BothAgree } from '../components/BothAgree';
import { CodeActions } from '../components/CodeActions';
import { Crest } from '../components/Crest';
import { catalogCrest, loadCrestCatalog, type CrestCatalog } from '../lib/crestCatalog';
import { DESKS, DESK_NAMES, marketLabel, type DeskId } from '../lib/engineSlips';
import { formRingLabel, showsInTier, slipParts, tierSlip, tierLabel, CODE_TIERS, type CodeTier } from '../lib/pickCodes';
import { canSeeTier } from '../lib/proAccess';
import { plainReasons } from '../lib/plainReason';
import { BookMark } from '../components/BookMark';
import { cx, kickoffClock } from '../lib/format';
import { marketFilters, tipsFromEngine, type PickChip, type PickTip } from '../lib/matchPicks';
import type { Team } from '../types';
import { useEngineBoard } from '../state/engine';
import { useProduct } from '../state/product';
import { useStore } from '../state/store';
import { isPlayStoreBuild } from '../lib/storeBuild';
import { teamOnList } from '../lib/teamMarks';

const emptyCatalog: CrestCatalog = { byKey: {}, byId: {} };

function confidenceBand(rate: number | null): CodeTier {
  const value = rate ?? 0;
  if (value + 1e-12 >= 0.995) return '100';
  if (value + 1e-12 >= 0.9) return '90';
  return '80';
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
  const { state, problem, ready } = useEngineBoard();
  const [market, setMarket] = useState('all');
  const [desk, setDesk] = useState<DeskId>('sportybet');
  const [tier, setTier] = useState<CodeTier>('80');
  const [catalog, setCatalog] = useState<CrestCatalog>(emptyCatalog);
  const [openId, setOpenId] = useState<string | null>(null);
  const [folded, setFolded] = useState<Record<string, boolean>>({});
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
    const markets = new Set(lists.filter((item) => item.list === 'black' && item.scope === 'market').map((item) => item.id));
    const competitions = new Set(lists.filter((item) => item.list === 'black' && item.scope === 'competition').map((item) => item.id));
    return { markets, competitions };
  }, [lists]);

  const tips = useMemo(() => {
    return tipsFromEngine(state, matches).filter(
      (tip) =>
        !blocked.markets.has(tip.chip.market) &&
        !blocked.competitions.has(tip.competitionId) &&
        !teamOnList(lists, 'black', { id: tip.chip.teamId, name: tip.chip.teamName }) &&
        !teamOnList(lists, 'black', { id: tip.chip.opponentId, name: tip.chip.opponentName }),
    );
  }, [state, matches, blocked]);
  const band = useMemo(() => tips.filter((tip) => showsInTier(tip.chip.rate, tier, tip.chip.teamsAgree)), [tips, tier]);
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
  const average = selected.length ? selected.reduce((sum, chip) => sum + chip.odds, 0) / selected.length : 0;
  const openTip = shown.find((tip) => tip.chip.id === openId) || null;

  const toggleChip = (chip: PickChip) => {
    const on = chosen.includes(chip.id);
    setChosen((current) => (on ? current.filter((id) => id !== chip.id) : [...current, chip.id]));
    if (on) removeLeg(chip.id);
    else if (!slip.includes(chip.id)) addLeg(chip.id);
  };

  return (
    <div className={cx('stack', 'picks-page', selected.length > 0 && 'has-float')}>
      <div className="pick-tiers" role="tablist" aria-label="Confidence" aria-busy={!ready}>
        {CODE_TIERS.map((id) => (
          <button key={id} type="button" role="tab" aria-selected={tier === id} className={cx('pick-tier', tier === id && 'is-on')} onClick={() => setTier(id)}>
            {tierLabel(id)}
            <small className={ready ? undefined : 'is-wait'}>{ready ? tips.filter((tip) => showsInTier(tip.chip.rate, id, tip.chip.teamsAgree)).length : '…'}</small>
          </button>
        ))}
      </div>
      {isPlayStoreBuild() && <p className="pick-disclaimer">18+. Tips are analysis, not guarantees. Bet responsibly.</p>}
      <BothAgree lists={lists} matches={matches} catalog={catalog} desk={desk} />
      {!canSeeTier(tier) ? (
        <p className="pro-lock">
          {tierLabel(tier)} picks are part of Pro. <Link to="/pro">See Pro</Link>
        </p>
      ) : (
      <>
      <section className="master-strip">
        <header>
          <span>Master code · {tierLabel(tier)} all {band.length}</span>
          {!isPlayStoreBuild() && (
            <label>
              <BookMark id={desk} />
              <select value={desk} aria-label="Bookmaker" onChange={(event) => setDesk(event.target.value as DeskId)}>
                {DESKS.map((id) => (
                  <option key={id} value={id}>{DESK_NAMES[id]}</option>
                ))}
              </select>
            </label>
          )}
        </header>
        {booked.parts.length === 0 && <p>{state?.showingCached ? 'Showing the last booked board' : 'No code yet'}</p>}
        <div className="master-parts">
          {booked.parts.map((part) => (
            <div key={part.code} className="master-part">
              <span>P{part.index}·{part.legs}</span>
              <CodeActions code={part.code} desk={desk} link={part.link} />
            </div>
          ))}
        </div>
      </section>
      <div className="market-filters pick-markets" role="tablist" aria-label="Filter by market">
        <button type="button" role="tab" aria-selected={market === 'all'} className={cx('market-filter', market === 'all' && 'is-on')} onClick={() => setMarket('all')}>
          All
          <small>{band.length} picks</small>
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
            <b>{item.count}</b>
            <small>{slipParts(tierSlip(state, tier, item.id), desk).parts[0]?.code || ''}</small>
          </button>
        ))}
      </div>
      {!state && <p className="lede">{problem ? 'Could not load picks. They appear when the engine responds.' : 'Loading picks.'}</p>}
      {(['100', '90', '80'] as CodeTier[])
        .filter((id) => (tier === '100' ? id === '100' : tier === '90' ? id !== '80' : true))
        .map((id) => {
          const rows = shown.filter((tip) => confidenceBand(tip.chip.rate) === id);
          if (!rows.length) return null;
          const part = slipParts(tierSlip(state, id, market === 'all' ? null : market), desk).parts[0];
          const shut = Boolean(folded[id]);
          return (
            <section key={id} className="pick-group">
              <header>
                <button type="button" aria-expanded={!shut} onClick={() => setFolded((current) => ({ ...current, [id]: !current[id] }))}>
                  {shut ? '▸' : '▾'} {tierLabel(id)}
                  <small>{rows.length} {rows.length === 1 ? 'pick' : 'picks'}</small>
                </button>
                {part?.code && (
                  <CodeActions className="pick-group-code" code={part.code} desk={desk} link={part.link} />
                )}
              </header>
              {!shut && rows.map((tip) => (
                <RingCard
                  key={tip.chip.id}
                  tip={tip}
                  catalog={catalog}
                  matches={matches}
                  onSlip={chosen.includes(tip.chip.id)}
                  onAdd={() => toggleChip(tip.chip)}
                  onOpen={() => setOpenId(tip.chip.id)}
                />
              ))}
            </section>
          );
        })}
      {state && shown.length === 0 && (
        <div className="empty">
          <h2>No picks on this board</h2>
          <p>Picks appear when an 80% trend has a price of 1.18 or higher.</p>
        </div>
      )}
      {selected.length > 0 && (
        <Link className="pick-float" to="/slips">
          <span>
            <b>{selected.length} {selected.length === 1 ? 'leg' : 'legs'} on slip</b>
            <em>avg {average.toFixed(2)}</em>
          </span>
          <em>Open slip</em>
        </Link>
      )}
      {openTip && (
        <ReasonSheet
          tip={openTip}
          catalog={catalog}
          matches={matches}
          onSlip={chosen.includes(openTip.chip.id)}
          onClose={() => setOpenId(null)}
          onAdd={() => toggleChip(openTip.chip)}
        />
      )}
      </>
      )}
    </div>
  );
}

function HitRing({ rate }: { rate: number }) {
  const pct = Math.round(rate * 100);
  const play = isPlayStoreBuild();
  const label = formRingLabel(rate, play);
  const hot = pct >= 90;
  const radius = 16;
  const turn = 2 * Math.PI * radius;
  const dash = turn * Math.min(1, Math.max(0, rate));
  return (
    <span className={cx('hit-ring', hot ? 'is-hot' : 'is-warm', pct >= 100 && 'is-full', play && 'is-form')} aria-label={play ? `${label} recent form` : `${pct}% hit rate`}>
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r={radius} className="hit-track" />
        <circle cx="20" cy="20" r={radius} className="hit-value" strokeDasharray={`${dash} ${turn - dash}`} />
      </svg>
      <b>{label}</b>
    </span>
  );
}

function sidesOf(tip: PickTip, catalog: CrestCatalog, matches: ReturnType<typeof useStore>['matches']) {
  const live = matches.find((match) => match.id === tip.chip.eventId);
  return {
    home: teamOf(tip.home, tip.homeId, live?.home.abbr || '', live?.home.color || '#e11d2e', catalog, live?.home.crest || tip.homeCrest),
    away: teamOf(tip.away, tip.awayId, live?.away.abbr || '', live?.away.color || '#3d7eff', catalog, live?.away.crest || tip.awayCrest),
  };
}

function RingCard({
  tip,
  catalog,
  matches,
  onSlip,
  onAdd,
  onOpen,
}: {
  tip: PickTip;
  catalog: CrestCatalog;
  matches: ReturnType<typeof useStore>['matches'];
  onSlip: boolean;
  onAdd: () => void;
  onOpen: () => void;
}) {
  const { home, away } = sidesOf(tip, catalog, matches);
  return (
    <article className="ring-card">
      {tip.chip.rate != null && <HitRing rate={tip.chip.rate} />}
      <button type="button" className="ring-body" onClick={onOpen}>
        <span className="ring-meta">
          <b>{kickoffClock(tip.kickoff)}</b>
          <em>{marketLabel(tip.chip.market)}</em>
          {tip.chip.opponentHeld && <i className="sig-held" title="Held after opponent">Held</i>}
          {tip.chip.exception && <i className="sig-exc">EXC</i>}
        </span>
        <span><Crest team={home} size={17} />{tip.home}</span>
        <span><Crest team={away} size={17} />{tip.away}</span>
      </button>
      <button type="button" className={cx('ring-price', onSlip && 'is-on')} aria-pressed={onSlip} onClick={onAdd}>
        <b>{tip.chip.odds.toFixed(2)}</b>
        <small>{onSlip ? 'On slip' : 'Add'}</small>
      </button>
    </article>
  );
}

function ReasonSheet({
  tip,
  catalog,
  matches,
  onSlip,
  onClose,
  onAdd,
}: {
  tip: PickTip;
  catalog: CrestCatalog;
  matches: ReturnType<typeof useStore>['matches'];
  onSlip: boolean;
  onClose: () => void;
  onAdd: () => void;
}) {
  const { home, away } = sidesOf(tip, catalog, matches);
  const reasons = plainReasons(tip.chip.reasons);
  return (
    <div className="pick-sheet" role="dialog" aria-modal="true" aria-label="Why this pick">
      <button type="button" className="pick-sheet-dim" aria-label="Close" onClick={onClose} />
      <div className="pick-sheet-card">
        <p>Why this pick</p>
        <h2>{marketLabel(tip.chip.market)}</h2>
        <p className="ring-meta">
          <Crest team={home} size={18} />{tip.home}
          <span>v</span>
          <Crest team={away} size={18} />{tip.away}
        </p>
        {tip.chip.homeSample && tip.chip.awaySample && <p>Home {tip.chip.homeSample} · Away {tip.chip.awaySample}</p>}
        {reasons.length > 0 ? reasons.map((line) => <p key={line}>{line}</p>) : <p>League record: building, no settled games yet.</p>}
        <div>
          <button type="button" className={cx('btn', onSlip && 'btn-quiet')} onClick={onAdd}>{onSlip ? 'On slip' : 'Add to slip'}</button>
          <Link to={`/match/${tip.chip.eventId}`} className="btn btn-quiet">Open match</Link>
        </div>
      </div>
    </div>
  );
}
