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

/**
 * Shape of `src/data/records-manual-entries.json`. Entries listed here are
 * merged into the parsed record book by `scripts/build-records.ts` so that
 * human-added rows survive regeneration from the PDF source.
 *
 * Indexed by (gender → groupSlug → sectionSlug). Each section payload is a
 * discriminated union whose `kind` must match the target section's kind.
 * The build script throws if a target group/section doesn't exist or the
 * kind disagrees — use that to catch typos early.
 *
 * For `stat`/`tournament`/`table`/`award`/`majors`/`long-running`/`coach`,
 * entries are concatenated to the parsed list (sort helpers then slot each
 * one into the right position).
 *
 * For `annual-rank`/`all-america`, manual years merge by year key: if the
 * year already exists in the parsed data, its arrays are extended; otherwise
 * the whole year is appended.
 *
 * `team-aggregate` is not supported — it's built at runtime in
 * `src/lib/program-records.ts`, not by this parser.
 */
export type ManualSectionPayload =
  | { kind: "stat"; entries: StatEntry[] }
  | { kind: "tournament"; entries: TournamentEntry[] }
  | { kind: "table"; entries: TableEntry[] }
  | { kind: "award"; entries: AwardEntry[] }
  | { kind: "majors"; entries: MajorsEntry[] }
  | { kind: "long-running"; entries: LongRunningEntry[] }
  | { kind: "coach"; entries: CoachEntry[] }
  | { kind: "annual-rank"; years: AnnualRankYear[] }
  | { kind: "all-america"; years: AllAmericaYear[] };

export type ManualEntriesFile = {
  [gender in Gender]?: {
    [groupSlug: string]: {
      [sectionSlug: string]: ManualSectionPayload;
    };
  };
};

export interface RegionalFinish {
  year: number;
  gender: Gender;
  site: string;
  team: string;
  position: string;
  advanced: boolean;
}

/**
 * Per-Regional-appearance stats derived from David's private sheet.
 * Joins to RegionalFinish on (year, team, gender). Site/regional may
 * differ in casing; use team+year as the primary join and regional as
 * disambiguator when a team appeared in multiple regionals (rare).
 */
export interface RegionalFinishRich {
  year: number;
  gender: Gender;
  team: string;
  /** Regional site/host name from the sheet (e.g. "Amherst"). */
  regional: string;
  /** Committee seed into the Regional (1..N). Null for years pre-seeding. */
  seed: number | null;
  /** Committee-expected-to-advance flag. Null for years before the stat was kept. */
  expectedAdv: boolean | null;
  /**
   * Authoritative "did this team advance from the Regional to NCAAs?"
   * flag, sourced from the spreadsheet's "Team Advanced" column. Null
   * for years where the column wasn't filled in (older years and any
   * row not yet re-ingested under the column-aware Python script).
   *
   * Optional on the type so existing JSON without the field still
   * type-checks. Use `didAdvanceFromRegional` (src/lib/streaks.ts'
   * `effectiveAdvancedYears`) to combine this with NCAA appearance
   * truth and the basic position-based fallback.
   */
  teamAdvanced?: boolean | null;
  /** Display finish ("1", "T2", "5", …). */
  result: string | null;
  /** Numeric finish with ties flattened to the base integer. */
  finalPos: number | null;
  /** Team strokes-gained total vs field at this Regional. */
  sgTotal: number | null;
  /** Winning margin in strokes. Only set for the Regional winner. */
  margin: number | null;
  /** Running count of Regional titles including this one. Winners only. */
  titleCount: number | null;
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
