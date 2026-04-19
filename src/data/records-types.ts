export type Gender = "men" | "women";

export interface StatEntry {
  value: number | string;
  player?: string;
  school: string;
  years?: string;
  isCurrentPlayer?: boolean;
  detail?: string;
}

export interface TournamentEntry {
  value: string;
  player?: string;
  school: string;
  event: string;
  round?: string;
  date?: string;
  isCurrentPlayer?: boolean;
}

export interface TableEntry {
  rounds: number;
  strokes: number;
  avg: number;
  player?: string;
  school: string;
  years?: string;
  isCurrentPlayer?: boolean;
}

export interface AwardEntry {
  year: string;
  winner: string;
  school?: string;
}

export interface AnnualRankYear {
  year: string;
  teams?: string[];
  individuals?: string[];
}

export interface AllAmericaYear {
  year: string;
  first?: string[];
  second?: string[];
  third?: string[];
  honorable?: string[];
}

export interface MajorsEntry {
  count: number;
  school: string;
  players: string;
}

export interface LongRunningEntry {
  years: number;
  event: string;
  host?: string;
}

export interface CoachEntry {
  value: number | string;
  coach: string;
  school: string;
  years?: string;
  detail?: string;
}

export interface TeamAggregateEntry {
  school: string;
  value: number | string;
  detail?: string;
}

export type RecordSection =
  | { kind: "stat"; slug: string; title: string; minQualifier?: string; entries: StatEntry[] }
  | { kind: "tournament"; slug: string; title: string; entries: TournamentEntry[] }
  | { kind: "table"; slug: string; title: string; minQualifier?: string; entries: TableEntry[] }
  | { kind: "award"; slug: string; title: string; entries: AwardEntry[] }
  | { kind: "annual-rank"; slug: string; title: string; years: AnnualRankYear[] }
  | { kind: "all-america"; slug: string; title: string; years: AllAmericaYear[] }
  | { kind: "majors"; slug: string; title: string; entries: MajorsEntry[] }
  | { kind: "long-running"; slug: string; title: string; entries: LongRunningEntry[] }
  | { kind: "coach"; slug: string; title: string; entries: CoachEntry[] }
  | {
      kind: "team-aggregate";
      slug: string;
      title: string;
      minQualifier?: string;
      valueLabel?: string;
      searchable?: boolean;
      entries: TeamAggregateEntry[];
    };

export interface RecordGroup {
  slug: string;
  title: string;
  sections: RecordSection[];
}

export interface RecordBook {
  gender: Gender;
  sourceNote: string;
  sourceDate: string;
  bqRefreshDate?: string;
  groups: RecordGroup[];
}

export interface RegionalFinish {
  year: number;
  gender: Gender;
  site: string;
  team: string;
  position: string;
  advanced: boolean;
}

export interface ChampionshipFinish {
  team: string;
  gender: Gender;
  year: number;
  /** "1", "T3", "10", "MC" — "MC" means missed the 54-hole cut. */
  position: string;
  /** Ties flattened to the base integer. Null when position === "MC". */
  positionNoTies: number | null;
  /** False when position === "MC", true otherwise. */
  madeCut: boolean;
  /** True for post-2009 match-play-era Championships. */
  matchPlayEra: boolean;
  /** 1–8 when the team made the match-play bracket, else null. */
  matchPlaySeed: number | null;
  /** True/false once the team qualified for match play; null if DNQ. */
  wonQuarterfinal: boolean | null;
  wonSemifinal: boolean | null;
  wonChampionship: boolean | null;
}
