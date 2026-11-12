export type MatchStatus = 'scheduled' | 'live' | 'halftime' | 'finished' | 'postponed';

export type EventType = 'kickoff' | 'goal' | 'yellow' | 'red' | 'ht' | 'ft' | 'var';

export type AlertKind = 'kickoff' | 'goal' | 'red' | 'ht' | 'ft' | 'var' | 'win' | 'bust' | 'squad';

export type VarReview = {
  teamId: string;
  player: string;
  minute: number;
};

export type Team = {
  id: string;
  name: string;
  shortName: string;
  abbr: string;
  color: string;
  crest?: string | null;
};

export type FollowedTeam = Pick<Team, 'id' | 'name' | 'shortName' | 'abbr' | 'color'>;

export type Competition = {
  id: string;
  name: string;
  area: string;
  code: string;
  priority: number;
};

export type MatchEvent = {
  id: string;
  type: EventType;
  minute: number | null;
  teamId: string | null;
  player: string | null;
  detail: string | null;
  homeScore: number | null;
  awayScore: number | null;
};

export type Match = {
  id: string;
  competition: Competition;
  utcDate: string;
  status: MatchStatus;
  minute: number | null;
  injuryTime: number | null;
  home: Team;
  away: Team;
  homeScore: number | null;
  awayScore: number | null;
  htHome: number | null;
  htAway: number | null;
  events: MatchEvent[];
  venue: string | null;
  /** Set while a goal is under review and not yet confirmed. */
  varReview?: VarReview | null;
  /** Decimal prices supplied with the fixture. */
  odds?: Record<string, number> | null;
  feed?: 'sporty' | 'demo';
};

export type GoalSound = 'crowd' | 'afro' | 'chant' | 'off';
export type DataSource = 'sporty' | 'demo';

export type Settings = {
  kickoff: boolean;
  goal: boolean;
  red: boolean;
  ht: boolean;
  ft: boolean;
  browser: boolean;
  var: boolean;
  goalSound: GoalSound;
  /** In-app cheer loudness, 0–100. 60 is a gain of 0.6. */
  goalVolume: number;
  dataSource: DataSource;
};

export type Follows = {
  matches: string[];
  teams: FollowedTeam[];
};

export type InboxItem = {
  id: string;
  matchId: string;
  kind: AlertKind;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
};

export type AppConfig = {
  mode: 'demo' | 'live' | 'sporty';
  provider: string;
  pollMs: number;
  reason: string | null;
};

export const defaultSettings: Settings = {
  kickoff: true,
  goal: true,
  red: true,
  ht: true,
  ft: true,
  browser: true,
  var: true,
  goalSound: 'crowd',
  goalVolume: 60,
  dataSource: 'sporty',
};
