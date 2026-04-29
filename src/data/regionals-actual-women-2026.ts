/**
 * Official NCAA D1 women's regional field for 2025-26, as announced by the
 * selection committee on April 29, 2026.
 *
 * Schema: see ActualSelection in regionals-actual-men-2026.ts.
 *
 * Source: David Tenneson (Discord paste, 2026-04-29). Validated against
 * canonical names in all-teams-women-2026.ts and regional ids in
 * regionals-women-2026.ts (72/72 team match, 6 × 12 bracket structure,
 * seeds 1..72 unique, S-curve snake clean).
 *
 * Women's regionals: May 11-13, 2026.
 *
 * Sites (NCAA committee numbering, matches regionals-women-2026.ts ids):
 *   1 Stanford   2 Ann Arbor   3 Tallahassee
 *   4 Waco       5 Chapel Hill  6 Simpsonville
 */

import type { ActualSelection } from "./regionals-actual-men-2026";

export const actualWomen2026: ActualSelection[] = [
  { team: "Stanford", seed: 1, regionalId: 1 },
  { team: "Southern California", seed: 2, regionalId: 2 },
  { team: "Florida", seed: 3, regionalId: 3 },
  { team: "Texas A&M", seed: 4, regionalId: 4 },
  { team: "Texas", seed: 5, regionalId: 5 },
  { team: "Arkansas", seed: 6, regionalId: 6 },
  { team: "North Carolina", seed: 7, regionalId: 5 },
  { team: "Oregon", seed: 8, regionalId: 4 },
  { team: "Wake Forest", seed: 9, regionalId: 3 },
  { team: "Duke", seed: 10, regionalId: 2 },
  { team: "Pepperdine", seed: 11, regionalId: 1 },
  { team: "Auburn", seed: 12, regionalId: 6 },
  { team: "Vanderbilt", seed: 13, regionalId: 1 },
  { team: "UCF", seed: 14, regionalId: 2 },
  { team: "UCLA", seed: 15, regionalId: 3 },
  { team: "Tennessee", seed: 16, regionalId: 4 },
  { team: "Mississippi State", seed: 17, regionalId: 5 },
  { team: "Iowa State", seed: 18, regionalId: 6 },
  { team: "Ole Miss", seed: 19, regionalId: 6 },
  { team: "Oklahoma State", seed: 20, regionalId: 5 },
  { team: "SMU", seed: 21, regionalId: 4 },
  { team: "Oklahoma", seed: 22, regionalId: 2 },
  { team: "Arizona State", seed: 23, regionalId: 1 },
  { team: "Florida State", seed: 24, regionalId: 3 },
  { team: "Ohio State", seed: 25, regionalId: 2 },
  { team: "Missouri", seed: 26, regionalId: 1 },
  { team: "Eastern Michigan", seed: 27, regionalId: 3 },
  { team: "Baylor", seed: 28, regionalId: 4 },
  { team: "Kent State", seed: 29, regionalId: 5 },
  { team: "Houston", seed: 30, regionalId: 6 },
  { team: "Virginia Tech", seed: 31, regionalId: 6 },
  { team: "Virginia", seed: 32, regionalId: 5 },
  { team: "LSU", seed: 33, regionalId: 4 },
  { team: "Kentucky", seed: 34, regionalId: 3 },
  { team: "Northwestern", seed: 35, regionalId: 2 },
  { team: "Arizona", seed: 36, regionalId: 1 },
  { team: "CSU Fullerton", seed: 37, regionalId: 1 },
  { team: "Kansas", seed: 38, regionalId: 2 },
  { team: "Purdue", seed: 39, regionalId: 3 },
  { team: "TCU", seed: 40, regionalId: 4 },
  { team: "Michigan State", seed: 41, regionalId: 5 },
  { team: "Kansas State", seed: 42, regionalId: 6 },
  { team: "Indiana", seed: 43, regionalId: 6 },
  { team: "NC State", seed: 44, regionalId: 5 },
  { team: "Tulsa", seed: 45, regionalId: 4 },
  { team: "Clemson", seed: 46, regionalId: 3 },
  { team: "Texas Tech", seed: 47, regionalId: 2 },
  { team: "Illinois", seed: 48, regionalId: 1 },
  { team: "Oregon State", seed: 49, regionalId: 1 },
  { team: "UNLV", seed: 50, regionalId: 2 },
  { team: "ULM", seed: 51, regionalId: 3 },
  { team: "Colorado", seed: 52, regionalId: 4 },
  { team: "High Point", seed: 53, regionalId: 5 },
  { team: "Charleston", seed: 54, regionalId: 6 },
  { team: "Xavier", seed: 55, regionalId: 6 },
  { team: "Furman", seed: 56, regionalId: 5 },
  { team: "Northern Arizona", seed: 57, regionalId: 4 },
  { team: "North Florida", seed: 58, regionalId: 3 },
  { team: "Columbia", seed: 59, regionalId: 2 },
  { team: "Cal Poly", seed: 60, regionalId: 1 },
  { team: "South Dakota State", seed: 61, regionalId: 1 },
  { team: "Quinnipiac", seed: 62, regionalId: 2 },
  { team: "Little Rock", seed: 63, regionalId: 3 },
  { team: "Tarleton State", seed: 64, regionalId: 4 },
  { team: "Richmond", seed: 65, regionalId: 5 },
  { team: "Western Kentucky", seed: 66, regionalId: 6 },
  { team: "Navy", seed: 67, regionalId: 1 },
  { team: "Howard", seed: 68, regionalId: 5 },
  { team: "Prairie View A&M", seed: 69, regionalId: 4 },
  { team: "UTRGV", seed: 70, regionalId: 3 },
  { team: "Murray State", seed: 71, regionalId: 6 },
  { team: "Oakland", seed: 72, regionalId: 2 },
];
