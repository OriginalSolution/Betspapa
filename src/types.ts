export type MatchStatus = 'scheduled' | 'live' | 'halftime' | 'finished' | 'postponed';

export type EventType = 'kickoff' | 'goal' | 'yellow' | 'red' | 'penalty' | 'ht' | 'ft' | 'var';

export type AlertKind = 'kickoff' | 'goal' | 'red' | 'penalty' | 'ht' | 'ft' | 'var' | 'win' | 'bust' | 'squad';

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
  /** Recent hit rates for this fixture, when the engine has measured them. */
  occurrence?: Array<{ market: string; hits: number; sample: number; rate: number }>;
  feed?: 'sporty' | 'demo';
};

export type GoalSound = 'crowd' | 'afro' | 'chant' | 'papa' | 'horn' | 'arp' | 'off';
export type EventSound = 'red' | 'var' | 'penalty';
export type NotificationStyle = 'auto' | 'dark' | 'light';
export type DataSource = 'sporty' | 'demo';

export type Settings = {
  kickoff: boolean;
  goal: boolean;
  red: boolean;
  /** A penalty is awarded or scored for a followed match. */
  penalty: boolean;
  ht: boolean;
  ft: boolean;
  browser: boolean;
  var: boolean;
  goalSound: GoalSound;
  /** Play the dedicated red-card sting. The red-card alert can still post silently. */
  redSound: boolean;
  /** Play the VAR sting. A VAR alert can still post silently. */
  varSound: boolean;
  /** Play the penalty sting. A penalty alert can still post silently. */
  penaltySound: boolean;
  /** In-app cheer loudness, 0–100. 60 is a gain of 0.6. */
  goalVolume: number;
  /** Auto follows the phone. Dark is the Red Ticker. Light is the white score panel. */
  notificationStyle: NotificationStyle;
  dataSource: DataSource;
  /** Booking-code cards, match posters, and the weekend bankers flyer. */
  promos: boolean;
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
  penalty: true,
  ht: true,
  ft: true,
  browser: true,
  var: true,
  goalSound: 'crowd',
  redSound: true,
  varSound: true,
  penaltySound: true,
  goalVolume: 60,
  notificationStyle: 'auto',
  dataSource: 'sporty',
  promos: true,
};
