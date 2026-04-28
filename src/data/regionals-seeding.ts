// Helper around the rich Regionals dataset for figuring out which years
// have reliable seeding-expectation data.
//
// Background: the spreadsheet's "Expected to Adv" column (mapped onto
// `RegionalFinishRich.expectedAdv`) is only filled in for years where the
// committee's expected-to-advance flag was actually recorded. Older years
// have null across the board, which means we can't tell who was an
// "underdog" in those seasons. Two consumers depend on this:
//   - the Team page's "Advanced as underdog" tile
//   - the /regionals-leaderboard "Most advanced as underdog" board
// Both should ignore years outside this window.
//
// The window is computed dynamically (per gender) so that as more years
// of seeding data are backfilled into the sheet, the site picks them up
// automatically without a code change.

import type { Gender } from "./records-types";
import { regionalsRich } from "./regionals-rich";

export interface SeedingWindow {
  /** Earliest year with at least one expectedAdv === true row for this gender. */
  minYear: number | null;
  /** Latest year with at least one expectedAdv === true row for this gender. */
  maxYear: number | null;
  /**
   * The set of years for which any team had expectedAdv === true. Use
   * this to gate the underdog calculation — only rows whose year is in
   * this set should be considered. (For years where the column is empty
   * across the board, we have no truth to call anyone an underdog.)
   */
  years: Set<number>;
}

const cache = new Map<Gender, SeedingWindow>();

export function getSeedingWindow(gender: Gender): SeedingWindow {
  const hit = cache.get(gender);
  if (hit) return hit;

  const years = new Set<number>();
  let min: number | null = null;
  let max: number | null = null;
  for (const r of regionalsRich) {
    if (r.gender !== gender) continue;
    if (r.expectedAdv !== true) continue;
    years.add(r.year);
    if (min == null || r.year < min) min = r.year;
    if (max == null || r.year > max) max = r.year;
  }

  const window: SeedingWindow = { minYear: min, maxYear: max, years };
  cache.set(gender, window);
  return window;
}
