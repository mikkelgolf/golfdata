// Canonical Clippd full conference name -> short code mapping.
//
// The two genders use slightly different short codes for three conferences,
// matching the existing rankings + championships data files:
//   Big East: BE (men), BEAST (women)
//   Big Sky:  BIGSKY (men), BSKY (women)
//   Big South: BIGSOUTH (men), BSOUTH (women)
//
// `null` values are intentional drops (Clippd has 2 unaffiliated rows with
// empty conference strings, plus the Northeast Women's Golf Conference
// which we map into NEC for UMES).

export type ConferenceCode = string;

const SHARED: Record<string, ConferenceCode | null> = {
  "Southeastern Conference": "SEC",
  "Atlantic Coast Conference": "ACC",
  "Big 12 Conference": "B12",
  "Big Ten Conference": "B10",
  "American Athletic Conference": "AAC",
  "Mountain West Conference": "MWC",
  "West Coast Conference": "WCC",
  "Big West Conference": "BWEST",
  "Atlantic 10 Conference": "A10",
  "Missouri Valley Conference": "MVC",
  "ASUN Conference": "ASUN",
  "Sun Belt Conference": "SUNBELT",
  "Conference USA": "CUSA",
  "Southern Conference": "SOCON",
  "Ohio Valley Conference": "OVC",
  "Coastal Athletic Association": "CAA",
  "Patriot League": "PATRIOT",
  "The Ivy League": "IVY",
  "Northeast Conference": "NEC",
  "NEC - Northeast Conference": "NEC",
  "Metro Atlantic Athletic Conference": "MAAC",
  "Mid-American Conference": "MAC",
  "Southwestern Athletic Conference": "SWAC",
  "The Summit League": "SUMMIT",
  "Western Athletic Conference": "WAC",
  "Horizon League": "HORIZON",
  "Southland Conference": "SOUTHLAND",
  "": null,
};

export const CONFERENCE_CODES_MEN: Record<string, ConferenceCode | null> = {
  ...SHARED,
  "Big East Conference": "BE",
  "Big Sky Conference": "BIGSKY",
  "Big Sky": "BIGSKY",
  "Big South Conference": "BIGSOUTH",
};

export const CONFERENCE_CODES_WOMEN: Record<string, ConferenceCode | null> = {
  ...SHARED,
  "Big East Conference": "BEAST",
  "Big Sky Conference": "BSKY",
  "Big Sky": "BSKY",
  "Big South Conference": "BSOUTH",
  "Northeast Women's Golf Conference": "NEC",
};

export function normalizeConference(
  fullName: string,
  gender: "men" | "women"
): ConferenceCode | null {
  const map = gender === "men" ? CONFERENCE_CODES_MEN : CONFERENCE_CODES_WOMEN;
  const trimmed = fullName.trim();
  if (trimmed in map) return map[trimmed];
  return null;
}
