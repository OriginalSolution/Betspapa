import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { fetchSportyWindow } from '../data/remote';
import { catalogCrest, loadCrestCatalog } from '../lib/crestCatalog';
import { forgetSearch, kickoffSoon, leaguesIn, loadLeagueFollows, loadRecent, rememberSearch, searchBoard, teamsIn, toggleLeagueFollow, trending, type SearchFilter } from '../lib/search';
import { cx, formatDay, formatTime, minuteLabel, teamFollow } from '../lib/format';
import type { Match } from '../types';
import { useStore } from '../state/store';
import { Crest } from './Crest';

const filters: Array<{ id: SearchFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'teams', label: 'Teams' },
  { id: 'leagues', label: 'Leagues' },
  { id: 'matches', label: 'Matches' },
];

export function TodaySearch({ matches, onQuery, onCorpus }: { matches: Match[]; onQuery: (query: string) => void; onCorpus?: (matches: Match[]) => void }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { follows, toggleTeam } = useStore();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SearchFilter>('all');
  const [recent, setRecent] = useState<string[]>(() => loadRecent());
  const [leagues, setLeagues] = useState<string[]>(() => loadLeagueFollows());
  const [corpus, setCorpus] = useState<Match[] | null>(null);
  const text = query.trim();
  const scoped = Boolean(params.get('team') || params.get('league'));
  const source = corpus && corpus.length ? corpus : matches;

  useEffect(() => {
    let stop = false;
    const from = new Date(Date.now() - 6 * 60 * 60_000).toISOString();
    const to = new Date(Date.now() + 21 * 86_400_000).toISOString();
    void (async () => {
      try {
        const [rows, catalog] = await Promise.all([fetchSportyWindow(from, to), loadCrestCatalog()]);
        if (stop) return;
        onCorpus?.(
          rows.map((match) => ({
            ...match,
            home: { ...match.home, crest: match.home.crest || catalogCrest(catalog, match.home) },
            away: { ...match.away, crest: match.away.crest || catalogCrest(catalog, match.away) },
          })),
        );
        setCorpus(
          rows.map((match) => ({
            ...match,
            home: { ...match.home, crest: match.home.crest || catalogCrest(catalog, match.home) },
            away: { ...match.away, crest: match.away.crest || catalogCrest(catalog, match.away) },
          })),
        );
      } catch {
        /* the board already on screen is still searchable */
      }
    })();
    return () => {
      stop = true;
    };
  }, []);

  useEffect(() => {
    onQuery(text);
  }, [text, onQuery]);

  const commit = (value: string) => {
    setRecent(rememberSearch(value));
  };

  const hits = text.length >= 2 ? searchBoard(source, text, filter) : null;
  const discovery = !text && !scoped;

  return (
    <div className="today-search">
      <label className="search-bar">
        <span aria-hidden="true">⌕</span>
        <input
          value={query}
          placeholder="Search teams, leagues, matches"
          aria-label="Search teams, leagues, matches"
          onChange={(event) => {
            setQuery(event.target.value);
            if (params.get('team') || params.get('league')) setParams({}, { replace: true });
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit(text);
          }}
        />
        {text && (
          <button type="button" className="search-clear" aria-label="Clear search" onClick={() => setQuery('')}>
            ×
          </button>
        )}
      </label>

      {discovery && recent.length > 0 && (
        <div className="recent-row" aria-label="Recent searches">
          {recent.map((item) => (
            <span key={item} className="recent-chip">
              <button type="button" onClick={() => setQuery(item)}>
                {item}
              </button>
              <button type="button" aria-label={`Remove ${item}`} onClick={() => setRecent(forgetSearch(item))}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {hits && (
        <>
          <div className="chips" role="tablist" aria-label="Search results">
            {filters.map((item) => (
              <button key={item.id} type="button" role="tab" aria-selected={filter === item.id} className={cx('chip', filter === item.id && 'is-on')} onClick={() => setFilter(item.id)}>
                {item.label}
              </button>
            ))}
          </div>
          {hits.teams.length + hits.leagues.length + hits.matches.length === 0 ? (
            <p className="search-empty">No teams, leagues, or matches on this board match “{text}”.</p>
          ) : (
            <ul className="search-list">
              {hits.teams.map((hit) => (
                <TeamRow
                  key={hit.team.id}
                  team={hit.team}
                  subtitle={hit.subtitle}
                  following={follows.teams.some((team) => team.id === hit.team.id)}
                  onOpen={() => {
                    commit(text);
                    setQuery('');
                    setParams({ team: hit.team.id });
                  }}
                  onFollow={() => toggleTeam(teamFollow(hit.team))}
                />
              ))}
              {hits.leagues.map((hit) => (
                <LeagueRow
                  key={hit.id}
                  name={hit.name}
                  subtitle={`${hit.area} · ${hit.fixtures} ${hit.fixtures === 1 ? 'fixture' : 'fixtures'}`}
                  following={leagues.includes(hit.id)}
                  onOpen={() => {
                    commit(text);
                    setQuery('');
                    setParams({ league: hit.id });
                  }}
                  onFollow={() => setLeagues(toggleLeagueFollow(hit.id))}
                />
              ))}
              {hits.matches.map((match) => (
                <MatchResult
                  key={match.id}
                  match={match}
                  onOpen={() => {
                    commit(text);
                    navigate(`/match/${match.id}`);
                  }}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {discovery && <Discovery matches={matches.length ? matches : source} leagues={leagues} setLeagues={setLeagues} />}
    </div>
  );
}

function Discovery({
  matches,
  leagues,
  setLeagues,
}: {
  matches: Match[];
  leagues: string[];
  setLeagues: (ids: string[]) => void;
}) {
  const [, setParams] = useSearchParams();
  const { follows, toggleTeam } = useStore();
  const rows = trending(matches);
  const soon = kickoffSoon(matches);
  if (!matches.length) return null;
  return (
    <>
      {rows.length > 0 && (
        <section className="discover" aria-label="Trending">
          <h2>Trending</h2>
          <ul className="search-list">
            {rows.map((row) =>
              row.kind === 'team' ? (
                <TeamRow
                  key={row.team.id}
                  team={row.team}
                  subtitle={row.subtitle}
                  following={follows.teams.some((team) => team.id === row.team.id)}
                  onOpen={() => setParams({ team: row.team.id })}
                  onFollow={() => toggleTeam(teamFollow(row.team))}
                />
              ) : (
                <LeagueRow
                  key={row.id}
                  name={row.name}
                  subtitle={row.area ? `League · ${row.area}` : 'League'}
                  following={leagues.includes(row.id)}
                  onOpen={() => setParams({ league: row.id })}
                  onFollow={() => setLeagues(toggleLeagueFollow(row.id))}
                />
              ),
            )}
          </ul>
        </section>
      )}
      {soon.length > 0 && (
        <section className="discover" aria-label="Kick-off soon">
          <h2>Kick-off soon</h2>
          <ul className="search-list">
            {soon.map((match) => (
              <li key={match.id}>
                <Link to={`/match/${match.id}`} className="search-match match-main">
                  <Crest team={match.home} />
                  <Crest team={match.away} />
                  <span>
                    <strong>
                      {match.home.shortName} vs {match.away.shortName}
                    </strong>
                    <em>
                      {match.competition.name} · {formatDay(match.utcDate.slice(0, 10))}
                    </em>
                  </span>
                  <time>{formatTime(match.utcDate)}</time>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function TeamRow({
  team,
  subtitle,
  following,
  onOpen,
  onFollow,
}: {
  team: Match['home'];
  subtitle: string;
  following: boolean;
  onOpen: () => void;
  onFollow: () => void;
}) {
  return (
    <li>
      <div className="search-row">
        <button type="button" className="search-open" onClick={onOpen}>
          <Crest team={team} size={36} followed={following} />
          <span>
            <strong>{team.shortName}</strong>
            <em>{subtitle}</em>
          </span>
        </button>
        <button type="button" className={cx('follow-btn', following && 'is-on')} aria-pressed={following} onClick={onFollow}>
          {following ? 'Following' : 'Follow'}
        </button>
      </div>
    </li>
  );
}

function LeagueRow({
  name,
  subtitle,
  following,
  onOpen,
  onFollow,
}: {
  name: string;
  subtitle: string;
  following: boolean;
  onOpen: () => void;
  onFollow: () => void;
}) {
  return (
    <li>
      <div className="search-row">
        <button type="button" className="search-open" onClick={onOpen}>
          <span className="league-mark" aria-hidden="true">
            {name.slice(0, 1)}
          </span>
          <span>
            <strong>{name}</strong>
            <em>{subtitle}</em>
          </span>
        </button>
        <button type="button" className={cx('follow-btn', following && 'is-on')} aria-pressed={following} onClick={onFollow}>
          {following ? 'Following' : 'Follow'}
        </button>
      </div>
    </li>
  );
}

function MatchResult({ match, onOpen }: { match: Match; onOpen: () => void }) {
  const live = match.status === 'live' || match.status === 'halftime';
  const scored = match.homeScore != null && match.awayScore != null && match.status !== 'scheduled';
  return (
    <li>
      <button type="button" className="search-match match-main" onClick={onOpen}>
        <Crest team={match.home} />
        <Crest team={match.away} />
        <span>
          <strong>
            {match.home.shortName} vs {match.away.shortName}
          </strong>
          <em>
            {match.competition.name}
            {live ? ' · Live' : ''}
          </em>
        </span>
        {scored ? (
          <b className={cx('score-pill', live && 'is-live')}>
            {match.homeScore}–{match.awayScore}
            {live && <i>{minuteLabel(match)}</i>}
          </b>
        ) : (
          <time>{formatTime(match.utcDate)}</time>
        )}
      </button>
    </li>
  );
}

export function scopeLabel(matches: Match[], teamId: string, leagueId: string): string {
  if (teamId) return teamsIn(matches).find((hit) => hit.team.id === teamId)?.team.shortName || 'Team';
  if (leagueId) return leaguesIn(matches).find((hit) => hit.id === leagueId)?.name || 'League';
  return '';
}
