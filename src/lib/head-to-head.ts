import h2hData from "@/data/head-to-head-2526.json";

// ---------------------------------------------------------------------------
// Types mirror the shape emitted by
// mikkel-system/tools/tournament-scraper/head_to_head_build.py (schemaVersion 2)
// ---------------------------------------------------------------------------

export interface StrokeplayBreakdown {
  meetings: number;
  wins: number;
  losses: number;
  ties: number;
  cumulativeStrokeDiff: number;
  avgStrokeDiff: number;
  bestResult: number;
  worstResult: number;
}

export interface MatchplayBreakdown {
  meetings: number;
  wins: number;
  losses: number;
  ties: number;
}

export interface OpponentRecord {
  unitid: number;
  // Top-level fields are combined (strokeplay + matchplay) totals.
  meetings: number;
  wins: number;
  losses: number;
  ties: number;
  // Format-specific breakdowns — present only when the pair has meetings of that format.
  strokeplay?: StrokeplayBreakdown;
  matchplay?: MatchplayBreakdown;
}

export interface TeamHeadToHead {
  unitid: number;
  schoolName: string;
  conference: string | null;
  opponents: Record<string, OpponentRecord>;
}

export type Gender = "men" | "women";
export type H2HFormat = "combined" | "strokeplay" | "matchplay";

const byGender = (h2hData as unknown as {
  byGender: Record<Gender, Record<string, TeamHeadToHead>>;
}).byGender;

// ---------------------------------------------------------------------------
// Aggregated record type used in the UI
// ---------------------------------------------------------------------------

export interface FieldRecord {
  meetings: number;
  wins: number;
  losses: number;
  ties: number;
  // Strokeplay-only fields (0 when the filter yielded no SP meetings).
  cumulativeStrokeDiff: number;
  avgStrokeDiff: number;
  strokeplayMeetings: number;
  // Win% computed over the meetings that contributed to this record.
  winPct: number;
  opponentsPlayed: number;
}

/**
 * Aggregate a team's head-to-head record against a specific set of opponents
 * (e.g. the other teams in the same conference championship). Returns null
 * if the team has no recorded meetings with any of them.
 *
 * `format` selects which meeting counts drive wins/losses/ties:
 *   - "combined" (default): all meetings across SP + MP
 *   - "strokeplay": only strokeplay meetings
 *   - "matchplay": only matchplay meetings
 *
 * Regardless of `format`, `avgStrokeDiff` and `cumulativeStrokeDiff` always
 * reflect strokeplay meetings only (stroke differential isn't meaningful for
 * matchplay).
 */
export function computeFieldRecord(
  teamBoardName: string,
  opponentBoardNames: readonly string[],
  gender: Gender,
  format: H2HFormat = "combined"
): FieldRecord | null {
  const teamData = byGender[gender]?.[teamBoardName];
  if (!teamData) return null;

  let meetings = 0;
  let wins = 0;
  let losses = 0;
  let ties = 0;
  let cum = 0;
  let spMeetings = 0;
  let opponentsPlayed = 0;

  for (const oppName of opponentBoardNames) {
    if (oppName === teamBoardName) continue;
    const opp = teamData.opponents[oppName];
    if (!opp) continue;

    const source =
      format === "combined"
        ? opp
        : format === "strokeplay"
        ? opp.strokeplay
        : opp.matchplay;

    if (!source || source.meetings === 0) continue;

    meetings += source.meetings;
    wins += source.wins;
    losses += source.losses;
    ties += source.ties;
    if (opp.strokeplay) {
      cum += opp.strokeplay.cumulativeStrokeDiff;
      spMeetings += opp.strokeplay.meetings;
    }
    opponentsPlayed += 1;
  }

  if (meetings === 0) return null;

  return {
    meetings,
    wins,
    losses,
    ties,
    cumulativeStrokeDiff: cum,
    avgStrokeDiff: spMeetings > 0 ? cum / spMeetings : 0,
    strokeplayMeetings: spMeetings,
    winPct: (wins + ties * 0.5) / meetings,
    opponentsPlayed,
  };
}

/** Format a field record as "W-L-T" (or "W-L" if no ties). */
export function formatRecord(r: { wins: number; losses: number; ties: number }): string {
  if (r.ties > 0) return `${r.wins}-${r.losses}-${r.ties}`;
  return `${r.wins}-${r.losses}`;
}

/** Format avg stroke differential with explicit sign. */
export function formatStrokeDiff(diff: number): string {
  const rounded = Math.round(diff * 10) / 10;
  if (rounded === 0) return "±0";
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

// ---------------------------------------------------------------------------
// Opponent browsing (drill-down)
// ---------------------------------------------------------------------------

/** All opponents for a given team, sorted alphabetically by board name. */
export function getAllOpponents(
  teamBoardName: string,
  gender: Gender
): Array<{ opponent: string; record: OpponentRecord }> {
  const teamData = byGender[gender]?.[teamBoardName];
  if (!teamData) return [];
  return Object.entries(teamData.opponents)
    .map(([opponent, record]) => ({ opponent, record }))
    .sort((a, b) => a.opponent.localeCompare(b.opponent));
}

/** The team's own top-level entry. */
export function getTeam(teamBoardName: string, gender: Gender): TeamHeadToHead | null {
  return byGender[gender]?.[teamBoardName] ?? null;
}

/** All team board names with any h2h data, sorted alphabetically. */
export function getAllTeamNames(gender: Gender): string[] {
  return Object.keys(byGender[gender] ?? {}).sort();
}

// ---------------------------------------------------------------------------
// Per-meeting drill-down — dynamic-imported so the 6 MB JSON stays out of the
// base page bundle. Consumers should await loadMeetings() / getMeetings().
// ---------------------------------------------------------------------------

export interface StrokeplayMeeting {
  format: "strokeplay";
  tournamentId: number;
  tournamentName: string;
  course: string | null;
  startDate: string | null;
  endDate: string | null;
  aToPar: number | null;
  aPlacing: number | null;
  bToPar: number | null;
  bPlacing: number | null;
  strokeDiff: number | null;
  winner: "A" | "B" | "T";
}

export interface MatchplayMeeting {
  format: "matchplay";
  tournamentId: number;
  tournamentName: string;
  venue: string | null;
  startDate: string | null;
  endDate: string | null;
  roundId: number | null;
  roundLabel: string | null;
  teamMatchKey: string;
  aPoints: number | null;
  bPoints: number | null;
  playerMatches: number | null;
  winner: "A" | "B" | "T";
}

export type Meeting = StrokeplayMeeting | MatchplayMeeting;

interface MeetingsData {
  generatedAt: string;
  byPair: Record<string, Meeting[]>;
}

let meetingsPromise: Promise<MeetingsData> | null = null;

export function loadMeetings(): Promise<MeetingsData> {
  if (!meetingsPromise) {
    meetingsPromise = import("@/data/head-to-head-meetings-2526.json").then(
      (mod) => mod.default as unknown as MeetingsData
    );
  }
  return meetingsPromise;
}

function pairKey(gender: Gender, uidA: number, uidB: number): string {
  const [lo, hi] = uidA < uidB ? [uidA, uidB] : [uidB, uidA];
  return `${gender}:${lo}:${hi}`;
}

/**
 * Get all meetings (strokeplay + matchplay) between two teams. Meetings are
 * returned from the perspective of the CALLER's team:
 *   - For strokeplay: aToPar/aPlacing belong to `teamUnitid`, bToPar/bPlacing to `opponentUnitid`
 *   - For matchplay:  aPoints belongs to `teamUnitid`, bPoints to `opponentUnitid`
 * `winner` is "A" if `teamUnitid` won, "B" if opponent won, "T" if tied.
 */
export async function getMeetings(
  teamUnitid: number,
  opponentUnitid: number,
  gender: Gender
): Promise<Meeting[]> {
  const data = await loadMeetings();
  const raw = data.byPair[pairKey(gender, teamUnitid, opponentUnitid)] ?? [];

  // Stored canonically with smaller unitid as side A. Flip if caller is side B.
  if (teamUnitid < opponentUnitid) return raw;

  return raw.map((m): Meeting => {
    const flipWinner = m.winner === "A" ? "B" : m.winner === "B" ? "A" : "T";
    if (m.format === "strokeplay") {
      return {
        ...m,
        aToPar: m.bToPar,
        aPlacing: m.bPlacing,
        bToPar: m.aToPar,
        bPlacing: m.aPlacing,
        strokeDiff: m.strokeDiff === null ? null : -m.strokeDiff,
        winner: flipWinner,
      };
    }
    return {
      ...m,
      aPoints: m.bPoints,
      bPoints: m.aPoints,
      winner: flipWinner,
    };
  });
}

// ---------------------------------------------------------------------------
// Seasons
//
// A "season" runs Aug 1 of the start year through Jul 31 of the next year.
// The pre-aggregated h2h totals in head-to-head-2526.json come from a BigQuery
// view whose date filter is loose (it can include May 2025 NCAA Championship
// matches in the 2025-26 bucket). Consumers that care about strict season
// scoping should re-aggregate from `getMeetings()` and filter with
// `isMeetingInSeason()` instead of trusting the pre-computed totals.
// ---------------------------------------------------------------------------

export type Season = `${number}-${number}`;

/** Currently available seasons, newest last. Add more as historical JSON ships. */
export const AVAILABLE_SEASONS: readonly Season[] = ["2025-26"];

/** Default season shown by the UI. */
export const CURRENT_SEASON: Season = AVAILABLE_SEASONS[AVAILABLE_SEASONS.length - 1];

/** Inclusive [start, end] ISO date strings for a season (Aug 1 → Jul 31). */
export function getSeasonDateRange(season: Season): {
  startDate: string;
  endDate: string;
} {
  const startYear = Number(season.slice(0, 4));
  const endYear = startYear + 1;
  return {
    startDate: `${startYear}-08-01`,
    endDate: `${endYear}-07-31`,
  };
}

/**
 * True if the meeting falls inside the given season window. Meetings with
 * a missing startDate are excluded (we can't place them).
 */
export function isMeetingInSeason(meeting: Meeting, season: Season): boolean {
  if (!meeting.startDate) return false;
  const { startDate, endDate } = getSeasonDateRange(season);
  return meeting.startDate >= startDate && meeting.startDate <= endDate;
}

/**
 * Re-aggregate an OpponentRecord from a list of per-meeting rows. Used after
 * filtering meetings by season so the displayed totals match what's actually
 * shown in the meeting list. `unitid` is left as 0 — the caller already knows
 * the opponent identity.
 */
export function computeRecordFromMeetings(meetings: Meeting[]): OpponentRecord {
  let wins = 0;
  let losses = 0;
  let ties = 0;

  let spMeetings = 0;
  let spWins = 0;
  let spLosses = 0;
  let spTies = 0;
  let cumStrokeDiff = 0;
  let best = Infinity;
  let worst = -Infinity;

  let mpMeetings = 0;
  let mpWins = 0;
  let mpLosses = 0;
  let mpTies = 0;

  for (const m of meetings) {
    if (m.winner === "A") wins += 1;
    else if (m.winner === "B") losses += 1;
    else ties += 1;

    if (m.format === "strokeplay") {
      spMeetings += 1;
      if (m.winner === "A") spWins += 1;
      else if (m.winner === "B") spLosses += 1;
      else spTies += 1;
      if (m.strokeDiff !== null) {
        cumStrokeDiff += m.strokeDiff;
        if (m.strokeDiff < best) best = m.strokeDiff;
        if (m.strokeDiff > worst) worst = m.strokeDiff;
      }
    } else {
      mpMeetings += 1;
      if (m.winner === "A") mpWins += 1;
      else if (m.winner === "B") mpLosses += 1;
      else mpTies += 1;
    }
  }

  return {
    unitid: 0,
    meetings: meetings.length,
    wins,
    losses,
    ties,
    strokeplay:
      spMeetings > 0
        ? {
            meetings: spMeetings,
            wins: spWins,
            losses: spLosses,
            ties: spTies,
            cumulativeStrokeDiff: cumStrokeDiff,
            avgStrokeDiff: cumStrokeDiff / spMeetings,
            bestResult: best === Infinity ? 0 : best,
            worstResult: worst === -Infinity ? 0 : worst,
          }
        : undefined,
    matchplay:
      mpMeetings > 0
        ? {
            meetings: mpMeetings,
            wins: mpWins,
            losses: mpLosses,
            ties: mpTies,
          }
        : undefined,
  };
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const H2H_GENERATED_AT = (h2hData as unknown as { generatedAt: string }).generatedAt;
export const H2H_COUNTS = (h2hData as unknown as {
  counts: {
    men_teams: number;
    women_teams: number;
    strokeplay_pairs: number;
    matchplay_pairs: number;
  };
}).counts;
