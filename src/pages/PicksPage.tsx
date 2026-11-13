import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Crest } from '../components/Crest';
import { catalogCrest, loadCrestCatalog, type CrestCatalog } from '../lib/crestCatalog';
import { fetchEngine, readEngineCache, writeEngineCache, ENGINE_POLL_MS, type EngineState } from '../lib/engineSlips';
import { cx, formatTime } from '../lib/format';
import { cardsFromEngine, combinedOdds, rateLabel, type MatchPickCard, type PickChip, type PickSort } from '../lib/matchPicks';
import type { Team } from '../types';
import { useProduct } from '../state/product';
import { useStore } from '../state/store';

const emptyCatalog: CrestCatalog = { byKey: {}, byId: {} };

const sorts: Array<{ id: PickSort; label: string }> = [
  { id: 'confidence', label: 'Confidence' },
  { id: 'odds', label: 'Odds' },
  { id: 'kickoff', label: 'Kickoff' },
];

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
  const { lists, toggleList, toggleTrend, trendFollows, addLeg, removeLeg, slip } = useProduct();
  const { state, problem } = useEngine();
  const [sort, setSort] = useState<PickSort>('confidence');
  const [open, setOpen] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string[]>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('betspapa.pickChips.v1') || '[]') as unknown;
      return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : [];
    } catch {
      return [];
    }
  });
  const [catalog, setCatalog] = useState<CrestCatalog>(emptyCatalog);
  useEffect(() => {
    void loadCrestCatalog().then(setCatalog);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('betspapa.pickChips.v1', JSON.stringify(chosen));
    } catch {
      /* the selection still lives in this session */
    }
  }, [chosen]);

  const blocked = useMemo(() => {
    const teams = new Set(lists.filter((item) => item.list === 'black' && item.scope === 'team').map((item) => item.id));
    const markets = new Set(lists.filter((item) => item.list === 'black' && item.scope === 'market').map((item) => item.id));
    const competitions = new Set(lists.filter((item) => item.list === 'black' && item.scope === 'competition').map((item) => item.id));
    return { teams, markets, competitions };
  }, [lists]);
  const greenTeams = useMemo(() => new Set(lists.filter((item) => item.list === 'green' && item.scope === 'team').map((item) => item.id)), [lists]);

  const cards = useMemo(() => {
    return cardsFromEngine(state, matches, sort)
      .map((card) => ({
        ...card,
        chips: card.chips.filter(
          (chip) => !blocked.markets.has(chip.market) && !blocked.teams.has(chip.teamId) && !blocked.competitions.has(card.competitionId),
        ),
      }))
      .filter((card) => card.chips.length > 0 && card.chips.every((chip) => chip.odds >= 1.2));
  }, [state, matches, sort, blocked]);

  const selected = useMemo(() => {
    const byId = new Map(cards.flatMap((card) => card.chips.map((chip) => [chip.id, chip] as const)));
    return chosen.map((id) => byId.get(id)).filter((chip): chip is PickChip => Boolean(chip));
  }, [cards, chosen]);
  const total = combinedOdds(selected);

  const toggleChip = (chip: PickChip) => {
    setChosen((current) => (current.includes(chip.id) ? current.filter((id) => id !== chip.id) : [...current, chip.id]));
    if (slip.includes(chip.id)) removeLeg(chip.id);
    else addLeg(chip.id);
  };

  return (
    <div className={cx('stack', 'picks-page', selected.length > 0 && 'has-float')}>
      <p className="page-lead">One card per match. Every market at 80% or better, with the price and the real hit rate.</p>
      <div className="chips" role="radiogroup" aria-label="Sort picks">
        {sorts.map((option) => (
          <button key={option.id} type="button" role="radio" aria-checked={sort === option.id} className={sort === option.id ? 'chip is-on' : 'chip'} onClick={() => setSort(option.id)}>
            {option.label}
          </button>
        ))}
      </div>
      {!state && <p className="lede">{problem ? 'Could not load picks. They appear when the engine responds.' : 'Loading picks.'}</p>}
      {cards.map((card) => (
        <MatchCard
          key={card.eventId}
          card={card}
          catalog={catalog}
          matches={matches}
          expanded={open === card.eventId}
          menu={menu}
          chosen={chosen}
          greenTeams={greenTeams}
          following={trendFollows}
          onExpand={() => setOpen((current) => (current === card.eventId ? null : card.eventId))}
          onMenu={(id) => setMenu((current) => (current === id ? null : id))}
          onToggle={toggleChip}
          onTrend={(id) => toggleTrend(id)}
          onList={(chip, list) => toggleList({ scope: 'team', id: chip.teamId, name: chip.teamName }, list)}
        />
      ))}
      {state && cards.length === 0 && (
        <div className="empty">
          <h2>No picks on this board</h2>
          <p>Picks appear when an 80% trend has a price of 1.20 or higher.</p>
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

function MatchCard({
  card,
  catalog,
  matches,
  expanded,
  menu,
  chosen,
  greenTeams,
  following,
  onExpand,
  onMenu,
  onToggle,
  onTrend,
  onList,
}: {
  card: MatchPickCard;
  catalog: CrestCatalog;
  matches: ReturnType<typeof useStore>['matches'];
  expanded: boolean;
  menu: string | null;
  chosen: string[];
  greenTeams: Set<string>;
  following: string[];
  onExpand: () => void;
  onMenu: (id: string) => void;
  onToggle: (chip: PickChip) => void;
  onTrend: (id: string) => void;
  onList: (chip: PickChip, list: 'green' | 'black') => void;
}) {
  const live = matches.find((match) => match.id === card.eventId);
  const home = teamOf(card.home, card.homeId, live?.home.abbr || '', live?.home.color || '#e11d2e', catalog, live?.home.crest);
  const away = teamOf(card.away, card.awayId, live?.away.abbr || '', live?.away.color || '#3d7eff', catalog, live?.away.crest);
  const kick = card.kickoff ? formatTime(card.kickoff) : '';
  return (
    <article className={cx('match-pick', expanded && 'is-open', (greenTeams.has(card.homeId) || greenTeams.has(card.awayId)) && 'is-green')}>
      <header className="match-pick-head">
        <div className="match-pick-side">
          <Crest team={home} size={36} />
          <strong>{card.home}</strong>
        </div>
        <div className="match-pick-meta">
          <span>{card.league}</span>
          <b>{kick}</b>
        </div>
        <div className="match-pick-side is-away">
          <Crest team={away} size={36} />
          <strong>{card.away}</strong>
        </div>
      </header>
      <div className="pick-chips">
        {card.chips.map((chip) => {
          const on = chosen.includes(chip.id);
          const rate = rateLabel(chip);
          return (
            <div key={chip.id} className="pick-chip-wrap">
              <button
                type="button"
                className={cx('pick-chip', on && 'is-on')}
                aria-pressed={on}
                onClick={() => onToggle(chip)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  onMenu(chip.id);
                }}
              >
                <span>{chip.short}</span>
                <b>{chip.odds.toFixed(2)}</b>
                {rate && <em>{rate}</em>}
              </button>
              <button type="button" className="pick-chip-menu" aria-label={`${chip.label} actions`} aria-expanded={menu === chip.id} onClick={() => onMenu(chip.id)}>
                ···
              </button>
              {menu === chip.id && (
                <div className="pick-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => onTrend(chip.id)}>
                    {following.includes(chip.id) ? 'Unfollow trend' : 'Follow trend'}
                  </button>
                  <button type="button" role="menuitem" onClick={() => onList(chip, 'green')}>
                    {greenTeams.has(chip.teamId) ? 'Remove greenlist' : `Greenlist ${chip.teamName}`}
                  </button>
                  <button type="button" role="menuitem" onClick={() => onList(chip, 'black')}>
                    {`Blacklist ${chip.teamName}`}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button type="button" className="btn btn-quiet btn-tiny" aria-expanded={expanded} onClick={onExpand}>
        {expanded ? 'Hide detail' : 'More detail'}
      </button>
      {expanded && (
        <ul className="pick-detail">
          {card.chips.map((chip) => (
            <li key={chip.id}>
              <strong>{chip.label}</strong>
              <span>
                {chip.odds.toFixed(2)}
                {chip.sample ? ` · ${chip.sample}` : ''}
                {chip.occurrence != null ? ` · ${chip.occurrence > 1 ? chip.occurrence : Math.round(chip.occurrence * 100)}%` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
