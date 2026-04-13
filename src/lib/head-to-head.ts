import h2hData from "@/data/head-to-head-2526.json";

// ---------------------------------------------------------------------------
// Types mirror the shape emitted by
// mikkel-system/tools/tournament-scraper/head_to_head_build.py
// ---------------------------------------------------------------------------

export interface OpponentRecord {
  unitid: number;
  meetings: number;
  wins: number;
  losses: number;
  ties: number;
  cumulativeStrokeDiff: number;
  avgStrokeDiff: number;
  bestResult: number;
  worstResult: number;
}

export interface TeamHeadToHead {
  unitid: number;
  schoolName: string;
  conference: string | null;
  opponents: Record<string, OpponentRecord>;
}

type Gender = "men" | "women";

const byGender = h2hData.byGender as Record<
  Gender,
  Record<string, TeamHeadToHead>
>;

// ---------------------------------------------------------------------------
// Aggregated record type used in the UI
// ---------------------------------------------------------------------------

export interface FieldRecord {
  meetings: number;
  wins: number;
  losses: number;
  ties: number;
  cumulativeStrokeDiff: number;
  avgStrokeDiff: number;
  winPct: number;
  opponentsPlayed: number;
}

/**
 * Aggregate a team's head-to-head record against a specific set of opponents
 * (e.g. the other teams in the same conference championship). Returns null
 * if the team has no recorded meetings with any of them in 25-26.
 */
export function computeFieldRecord(
  teamBoardName: string,
  opponentBoardNames: readonly string[],
  gender: Gender
): FieldRecord | null {
  const teamData = byGender[gender]?.[teamBoardName];
  if (!teamData) return null;

  let meetings = 0;
  let wins = 0;
  let losses = 0;
  let ties = 0;
  let cum = 0;
  let opponentsPlayed = 0;

  for (const oppName of opponentBoardNames) {
    if (oppName === teamBoardName) continue;
    const opp = teamData.opponents[oppName];
    if (!opp) continue;
    meetings += opp.meetings;
    wins += opp.wins;
    losses += opp.losses;
    ties += opp.ties;
    cum += opp.cumulativeStrokeDiff;
    opponentsPlayed += 1;
  }

  if (meetings === 0) return null;

  return {
    meetings,
    wins,
    losses,
    ties,
    cumulativeStrokeDiff: cum,
    avgStrokeDiff: cum / meetings,
    winPct: (wins + ties * 0.5) / meetings,
    opponentsPlayed,
  };
}

/** Format a field record as "W-L-T" */
export function formatRecord(r: FieldRecord): string {
  if (r.ties > 0) return `${r.wins}-${r.losses}-${r.ties}`;
  return `${r.wins}-${r.losses}`;
}

/** Format avg stroke differential with explicit sign */
export function formatStrokeDiff(diff: number): string {
  const rounded = Math.round(diff * 10) / 10;
  if (rounded === 0) return "±0";
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

export const H2H_GENERATED_AT = (h2hData as { generatedAt: string }).generatedAt;
export const H2H_COUNTS = (h2hData as { counts: { men_teams: number; women_teams: number; pairs_kept: number } }).counts;
