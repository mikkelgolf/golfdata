/**
 * Build a rank-history series for sparklines.
 *
 * Currently the only durable history we have is the Apr 11 weekly snapshot
 * (snapshots/2026-04-11-men-weekly.json), so series are at most [old, current].
 * As new snapshots land each Wednesday, append them to the imports below
 * and the sparklines extend automatically.
 */

import snapshotApr11Men from "../../snapshots/2026-04-11-men-weekly.json";

interface SnapshotTeam {
  rank: number;
  team: string;
}

interface Snapshot {
  capturedAt: string;
  gender: string;
  teams: SnapshotTeam[];
}

const menSnapshots: Snapshot[] = [snapshotApr11Men as unknown as Snapshot];
const womenSnapshots: Snapshot[] = [];

/**
 * Returns rank history for a team in chronological order, ending with
 * `currentRank`. Empty array if the team has no snapshot history.
 */
export function getRankHistory(
  team: string,
  currentRank: number,
  gender: "men" | "women"
): number[] {
  const snaps = gender === "men" ? menSnapshots : womenSnapshots;
  const history: number[] = [];

  for (const snap of snaps) {
    const found = snap.teams.find((t) => t.team === team);
    if (found) history.push(found.rank);
  }

  if (history.length === 0) return [];
  history.push(currentRank);
  return history;
}
