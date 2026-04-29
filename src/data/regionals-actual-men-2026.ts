/**
 * Official NCAA D1 men's regional field for 2025-26, as announced by the
 * selection committee.
 *
 * Until the committee publishes the men's bracket, this array stays empty
 * and the "Actual" tab on the Regional Predictions page is hidden. Once
 * announced, populate this file by hand (or via a future script) — the
 * field doesn't change after release, so a single edit per year is enough.
 *
 * Schema notes:
 * - `team` must match the canonical team name in all-teams-men-2026.ts
 *   (case-sensitive). Teams that don't match get rendered with placeholder
 *   conference/coords and won't show on the map.
 * - `seed` is the overall seed 1..81 published by the committee.
 * - `regionalId` is 1..6, matching the ids in regionals-men-2026.ts.
 *
 * Men's selections: typically released the Wednesday before regionals.
 * Men's regionals: May 11-13, 2026.
 */

export interface ActualSelection {
  /** Canonical team name — must match all-teams-{gender}-2026.ts. */
  team: string;
  /** Overall committee seed (1..81 men, 1..72 women). */
  seed: number;
  /** Regional id (1..6) — matches regionals-{gender}-2026.ts. */
  regionalId: number;
}

export const actualMen2026: ActualSelection[] = [];
