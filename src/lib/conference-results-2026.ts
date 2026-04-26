// Per-conference championship results for the 2026 season, derived from
// `src/data/conference-championship-history.json`. Used by the Conference
// Championships page to render the gold-medal / trophy / silver-trophy
// icons next to teams in each conference's expanded card.
//
// Convention (David, 2026-04-26):
//   - Stroke-play-only conference  → gold trophy next to the SP winner.
//   - Mixed (stroke + match) conf  → gold medal  next to the SP winner,
//                                    gold trophy next to the MP winner,
//                                    silver trophy next to the MP runner-up.
//   - A team that wins both legs gets both the medal AND the trophy.
//
// The JSON is the planned long-term source of truth for these splits;
// `championships-{men,women}-2026.ts` keeps a single `winner` field for
// backwards-compat (the trophy team — match-play winner where applicable),
// which still drives the chronological / map / card-stripe summaries.

import historyData from "@/data/conference-championship-history.json";

export interface ConferenceResult2026 {
  /** Team that won the stroke-play leg, or the only-leg if stroke-only. */
  strokeplayWinner?: string;
  /** Team that won the match-play final, if a match-play leg exists. */
  matchplayWinner?: string;
  /** Team that lost the match-play final, if a match-play leg exists. */
  matchplayRunnerUp?: string;
  /** Public Clippd leaderboard URL for the stroke-play leg, if present. */
  strokeplayUrl?: string;
  /** Public Clippd leaderboard URL for the match-play leg, if present. */
  matchplayUrl?: string;
  /** True when this championship has a match-play leg (gold medal / silver trophy unlock). */
  hasMatchplay: boolean;
}

type Gender = "men" | "women";
type Key = `${Gender}:${string}`;

interface RawLeg {
  winner: string | null;
  runnerUp?: string | null;
  clippdUrl?: string | null;
}

interface RawRow {
  conference: string;
  gender: Gender;
  season: number;
  strokeplay: RawLeg | null;
  matchplay: RawLeg | null;
}

interface RawHistory {
  rows: RawRow[];
}

const ALL: ReadonlyMap<Key, ConferenceResult2026> = (() => {
  const m = new Map<Key, ConferenceResult2026>();
  const rows = (historyData as RawHistory).rows;
  for (const r of rows) {
    if (r.season !== 2026) continue;
    const sp = r.strokeplay?.winner ?? undefined;
    const mp = r.matchplay?.winner ?? undefined;
    const ru = r.matchplay?.runnerUp ?? undefined;
    const spUrl = r.strokeplay?.clippdUrl ?? undefined;
    const mpUrl = r.matchplay?.clippdUrl ?? undefined;
    m.set(`${r.gender}:${r.conference}`, {
      strokeplayWinner: sp,
      matchplayWinner: mp,
      matchplayRunnerUp: ru,
      strokeplayUrl: spUrl,
      matchplayUrl: mpUrl,
      hasMatchplay: r.matchplay != null,
    });
  }
  return m;
})();

export function getConferenceResult2026(
  gender: Gender,
  conference: string
): ConferenceResult2026 | undefined {
  return ALL.get(`${gender}:${conference}`);
}

/**
 * Honours a single team has earned in a given (gender, conference) result.
 * Used to decide which icon(s) to render next to the team's row.
 */
export interface TeamHonours {
  /** Won stroke-play in a mixed-format championship → gold medal. */
  strokeplayMedal: boolean;
  /** Won match-play final → gold trophy. */
  matchplayChampion: boolean;
  /** Lost match-play final → silver trophy. */
  matchplayRunnerUp: boolean;
  /** Won the only (stroke-only) leg → gold trophy. */
  strokeplayChampion: boolean;
}

export function getTeamHonours(
  result: ConferenceResult2026 | undefined,
  team: string
): TeamHonours {
  if (!result) {
    return {
      strokeplayMedal: false,
      matchplayChampion: false,
      matchplayRunnerUp: false,
      strokeplayChampion: false,
    };
  }
  const isSPWinner = !!result.strokeplayWinner && result.strokeplayWinner === team;
  const isMPWinner = !!result.matchplayWinner && result.matchplayWinner === team;
  const isMPRunner =
    !!result.matchplayRunnerUp && result.matchplayRunnerUp === team;

  if (result.hasMatchplay) {
    return {
      strokeplayMedal: isSPWinner,
      matchplayChampion: isMPWinner,
      matchplayRunnerUp: isMPRunner,
      strokeplayChampion: false,
    };
  }
  // Stroke-only: SP winner gets the gold trophy (no medal in this format).
  return {
    strokeplayMedal: false,
    matchplayChampion: false,
    matchplayRunnerUp: false,
    strokeplayChampion: isSPWinner,
  };
}
