/**
 * Climate / agronomy zones for the Regional Advancement Projections model
 * (Layer 4). A team's home zone vs. the regional venue's zone determines
 * whether the team is "crossing zones" — historical data shows out-of-zone
 * teams advance at a reduced rate.
 *
 * Four zones, by dominant turf type:
 *   - PNW   — Pacific Northwest, bent dominant (WA, OR)
 *   - WEST  — poa annua / desert overseed (CA, AZ, NV, NM, HI)
 *   - SOUTH — warm-season bermuda (Southeast, Texas, Florida, Deep South)
 *   - NORTH — cool-season bent + ryegrass + poa (Midwest, Northeast,
 *             Mid-Atlantic, Mountain West interior, AK)
 *
 * Borderline transition-zone calls:
 *   - KY, VA, WV, MD, DE → NORTH (top D1 courses play cool-season)
 *   - OK, TX, NC, TN     → SOUTH (bermuda dominant)
 *   - NM                 → WEST  (high-desert overseed; plays closer to AZ)
 */

export type ClimateZone = "PNW" | "WEST" | "NORTH" | "SOUTH";

export const STATE_TO_ZONE: Record<string, ClimateZone> = {
  // PNW (bent-dominant Pacific Northwest)
  OR: "PNW",
  WA: "PNW",

  // WEST (poa / desert overseed)
  AZ: "WEST",
  CA: "WEST",
  HI: "WEST",
  NM: "WEST",
  NV: "WEST",

  // SOUTH (warm-season bermuda)
  AL: "SOUTH",
  AR: "SOUTH",
  FL: "SOUTH",
  GA: "SOUTH",
  LA: "SOUTH",
  MS: "SOUTH",
  NC: "SOUTH",
  OK: "SOUTH",
  SC: "SOUTH",
  TN: "SOUTH",
  TX: "SOUTH",

  // NORTH (cool-season)
  AK: "NORTH",
  CO: "NORTH",
  CT: "NORTH",
  DC: "NORTH",
  DE: "NORTH",
  IA: "NORTH",
  ID: "NORTH",
  IL: "NORTH",
  IN: "NORTH",
  KS: "NORTH",
  KY: "NORTH",
  MA: "NORTH",
  MD: "NORTH",
  ME: "NORTH",
  MI: "NORTH",
  MN: "NORTH",
  MO: "NORTH",
  MT: "NORTH",
  ND: "NORTH",
  NE: "NORTH",
  NH: "NORTH",
  NJ: "NORTH",
  NY: "NORTH",
  OH: "NORTH",
  PA: "NORTH",
  RI: "NORTH",
  SD: "NORTH",
  UT: "NORTH",
  VA: "NORTH",
  VT: "NORTH",
  WI: "NORTH",
  WV: "NORTH",
  WY: "NORTH",
};

export function zoneFromState(state: string | null | undefined): ClimateZone | null {
  if (!state) return null;
  return STATE_TO_ZONE[state.toUpperCase()] ?? null;
}
