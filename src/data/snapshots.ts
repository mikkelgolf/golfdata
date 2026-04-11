/**
 * Rankings snapshot data for timeline tracking.
 *
 * Each snapshot represents a weekly rankings update.
 * The S-curve is recomputed from each snapshot to show how
 * regional assignments change over time.
 *
 * Data is manually updated by running:
 *   npx tsx scripts/capture-rankings-snapshot.ts --label weekly
 *
 * Then copying the relevant diff data into this file.
 */

export interface SnapshotMeta {
  date: string;
  label: string;
  teamCount: number;
  notes?: string;
}

export interface RankChange {
  team: string;
  from: number;
  to: number;
  delta: number; // positive = moved up
}

export interface RegionalChange {
  team: string;
  seed: number;
  fromRegional: string;
  toRegional: string;
}

export interface SnapshotDiff {
  fromDate: string;
  toDate: string;
  rankChanges: RankChange[];
  regionalChanges: RegionalChange[];
  newTeams: string[];
  droppedTeams: string[];
}

// ---------------------------------------------------------------------------
// Snapshot history
// ---------------------------------------------------------------------------

export const snapshotHistory: SnapshotMeta[] = [
  {
    date: "2026-04-10",
    label: "Initial launch",
    teamCount: 81,
    notes: "First S-curve prediction published on collegegolfdata.com",
  },
];

// Diffs will be populated as new rankings drop each Wednesday
export const snapshotDiffs: SnapshotDiff[] = [];
