/**
 * Regional venue lookup — host site name → state, lat/lng, climate zone.
 *
 * Built for the Regional Advancement Projections model. Two callers:
 *   1. Layer 3 (travel distance) — reads `lat`/`lng` and computes great-circle
 *      from each team's campus to the venue. Skips rows where coords are null.
 *   2. Layer 4 (climate zone)    — reads `zone` and compares against the
 *      team's home zone. Always present, including for directional sites.
 *
 * Coverage: 65 modern-era sites that appear in regionals-rich.json post-filter
 * (men 2009+, women 2022+, excl. 2020), plus the 4 new 2026 venues that have
 * not yet hosted a regional. Total 69 entries.
 *
 * Directional placeholder sites (Central, East, Southeast, …) appear in the
 * 2009-2011 men's data before NCAA standardized site naming. They have no
 * specific venue, so coords are null and the zone is the regional centroid
 * proxy. Layer 3 skips these rows; Layer 4 keeps them.
 *
 * Coords are accurate to ~0.01° (~1 km) — distance buckets are 250+ miles
 * wide, so this resolution is plenty.
 */

import type { ClimateZone } from "./climate-zones";

export interface VenueInfo {
  /** USPS state code, or null for directional placeholders. */
  state: string | null;
  /** Decimal degrees, or null when site is a directional placeholder. */
  lat: number | null;
  lng: number | null;
  /** Climate / agronomy zone — always set, even for directionals. */
  zone: ClimateZone;
  /** True for pre-naming-era directional placeholders ("Central", "East", …). */
  isDirectional?: boolean;
}

export const REGIONAL_VENUES: Record<string, VenueInfo> = {
  // ── PNW (bent-dominant Pacific Northwest) ──────────────────────────────────
  Bremerton: { state: "WA", lat: 47.5535, lng: -122.6892, zone: "PNW" }, // Gold Mountain
  "Cle Elum": { state: "WA", lat: 47.1979, lng: -120.9610, zone: "PNW" }, // Suncadia
  Corvallis: { state: "OR", lat: 44.5646, lng: -123.2620, zone: "PNW" }, // Trysting Tree
  Eugene: { state: "OR", lat: 44.0405, lng: -123.0683, zone: "PNW" }, // Eugene CC
  Pullman: { state: "WA", lat: 46.7387, lng: -117.1638, zone: "PNW" }, // Palouse Ridge
  Salem: { state: "OR", lat: 44.9314, lng: -123.0413, zone: "PNW" }, // Salem GC
  Washington: { state: "WA", lat: 47.5862, lng: -122.0290, zone: "PNW" }, // Aldarra GC, Sammamish (verified web)

  // ── WEST (poa / desert overseed) ───────────────────────────────────────────
  Albuquerque: { state: "NM", lat: 35.1869, lng: -106.3925, zone: "WEST" },
  "Gold Canyon": { state: "AZ", lat: 33.3717, lng: -111.4380, zone: "WEST" },
  "Las Vegas": { state: "NV", lat: 36.1023, lng: -115.2950, zone: "WEST" },
  Marana: { state: "AZ", lat: 32.4367, lng: -111.2257, zone: "WEST" }, // Gallery GC
  "Morgan Hill": { state: "CA", lat: 37.1325, lng: -121.6541, zone: "WEST" }, // CordeValle
  "Rancho Santa Fe": { state: "CA", lat: 32.9915, lng: -117.2480, zone: "WEST" },
  Reno: { state: "NV", lat: 39.4151, lng: -119.8313, zone: "WEST" }, // Montreux
  "San Diego": { state: "CA", lat: 32.7813, lng: -117.2434, zone: "WEST" },
  Stanford: { state: "CA", lat: 37.4275, lng: -122.1697, zone: "WEST" },
  Stockton: { state: "CA", lat: 37.9869, lng: -121.3084, zone: "WEST" }, // Brookside
  Tempe: { state: "AZ", lat: 33.4259, lng: -111.9396, zone: "WEST" }, // Karsten ASU
  Tucson: { state: "AZ", lat: 32.3010, lng: -110.9521, zone: "WEST" },

  // ── SOUTH (warm-season bermuda) ────────────────────────────────────────────
  Athens: { state: "GA", lat: 33.9519, lng: -83.3576, zone: "SOUTH" },
  Auburn: { state: "AL", lat: 32.6098, lng: -85.4920, zone: "SOUTH" },
  Austin: { state: "TX", lat: 30.3045, lng: -97.8633, zone: "SOUTH" }, // UT Golf Club
  "Baton Rouge": { state: "LA", lat: 30.3186, lng: -91.0998, zone: "SOUTH" },
  "Bermuda Run": { state: "NC", lat: 36.0048, lng: -80.4218, zone: "SOUTH" },
  Bryan: { state: "TX", lat: 30.6744, lng: -96.3698, zone: "SOUTH" },
  "Chapel Hill": { state: "NC", lat: 35.9049, lng: -79.0469, zone: "SOUTH" },
  "College Grove": { state: "TN", lat: 35.9376, lng: -86.8398, zone: "SOUTH" }, // Vanderbilt Legends
  "College Station": { state: "TX", lat: 30.6071, lng: -96.3417, zone: "SOUTH" }, // Aggie GC
  Fayetteville: { state: "AR", lat: 36.0697, lng: -94.1605, zone: "SOUTH" }, // Blessings
  Franklin: { state: "TN", lat: 35.9151, lng: -86.8689, zone: "SOUTH" }, // Vanderbilt Legends
  Greensboro: { state: "NC", lat: 36.0723, lng: -79.7918, zone: "SOUTH" }, // Grandover
  Kissimmee: { state: "FL", lat: 28.3025, lng: -81.4115, zone: "SOUTH" }, // Reunion
  Lubbock: { state: "TX", lat: 33.5876, lng: -101.9020, zone: "SOUTH" }, // Rawls TT
  "Myrtle Beach": { state: "SC", lat: 33.6891, lng: -78.8867, zone: "SOUTH" },
  Norman: { state: "OK", lat: 35.1843, lng: -97.4509, zone: "SOUTH" }, // Jimmie Austin
  "Palm Beach": { state: "FL", lat: 26.7080, lng: -80.0386, zone: "SOUTH" },
  Raleigh: { state: "NC", lat: 35.7822, lng: -78.6796, zone: "SOUTH" }, // Lonnie Poole
  "San Antonio": { state: "TX", lat: 29.5973, lng: -98.4019, zone: "SOUTH" }, // TPC San Antonio
  "Shoal Creek": { state: "AL", lat: 33.5318, lng: -86.6692, zone: "SOUTH" },
  Stillwater: { state: "OK", lat: 36.0552, lng: -97.0883, zone: "SOUTH" }, // Karsten Creek
  Tallahassee: { state: "FL", lat: 30.4418, lng: -84.2985, zone: "SOUTH" },
  Tuscaloosa: { state: "AL", lat: 33.2098, lng: -87.5692, zone: "SOUTH" },
  Waco: { state: "TX", lat: 31.5497, lng: -97.1143, zone: "SOUTH" },

  // ── NORTH (cool-season bent/rye/poa) ───────────────────────────────────────
  Amherst: { state: "MA", lat: 42.3601, lng: -72.5256, zone: "NORTH" },
  "Ann Arbor": { state: "MI", lat: 42.2808, lng: -83.7430, zone: "NORTH" },
  Bath: { state: "MI", lat: 42.8166, lng: -84.4644, zone: "NORTH" }, // Eagle Eye GC, MSU host (verified web — Bath MI not PA)
  "Bowling Green": { state: "KY", lat: 36.9685, lng: -86.4808, zone: "NORTH" }, // Olde Stone
  Charlottesville: { state: "VA", lat: 38.0354, lng: -78.5491, zone: "NORTH" }, // Birdwood
  Columbia: { state: "MO", lat: 38.9505, lng: -92.2107, zone: "NORTH" }, // Old Hawthorne, Mizzou host (verified web)
  Columbus: { state: "OH", lat: 40.0067, lng: -83.0305, zone: "NORTH" }, // Scarlet OSU
  "East Lansing": { state: "MI", lat: 42.7335, lng: -84.4604, zone: "NORTH" }, // Forest Akers
  Kingston: { state: "RI", lat: 41.4799, lng: -71.5260, zone: "NORTH" },
  Kohler: { state: "WI", lat: 43.7400, lng: -87.7818, zone: "NORTH" }, // Whistling Straits
  Lexington: { state: "KY", lat: 38.0406, lng: -84.4956, zone: "NORTH" }, // University Club
  Louisville: { state: "KY", lat: 38.2110, lng: -85.7126, zone: "NORTH" },
  "New Haven": { state: "CT", lat: 41.3081, lng: -72.9335, zone: "NORTH" }, // Yale GC
  Noblesville: { state: "IN", lat: 40.0457, lng: -86.0086, zone: "NORTH" }, // Sagamore
  Simpsonville: { state: "KY", lat: 38.2226, lng: -85.3554, zone: "NORTH" }, // 2026 women's host (Louisville)
  "South Bend": { state: "IN", lat: 41.6851, lng: -86.2447, zone: "NORTH" },
  "St George": { state: "UT", lat: 37.0961, lng: -113.5827, zone: "NORTH" },
  "Sugar Grove": { state: "IL", lat: 41.7944, lng: -88.4474, zone: "NORTH" }, // Rich Harvest
  Urbana: { state: "IL", lat: 40.0801, lng: -88.2046, zone: "NORTH" }, // Atkins UI
  "West Lafayette": { state: "IN", lat: 40.4259, lng: -86.9081, zone: "NORTH" }, // Birck Boilermaker
  Westfield: { state: "IN", lat: 40.0428, lng: -86.1278, zone: "NORTH" }, // Sagamore-area

  // ── DIRECTIONAL PLACEHOLDERS (2009-2011 men's, pre-naming era) ─────────────
  Central: { state: null, lat: null, lng: null, zone: "NORTH", isDirectional: true },
  East: { state: null, lat: null, lng: null, zone: "NORTH", isDirectional: true },
  Northeast: { state: null, lat: null, lng: null, zone: "NORTH", isDirectional: true },
  Pacific: { state: null, lat: null, lng: null, zone: "WEST", isDirectional: true },
  "South Central": { state: null, lat: null, lng: null, zone: "SOUTH", isDirectional: true },
  Southeast: { state: null, lat: null, lng: null, zone: "SOUTH", isDirectional: true },
  Southwest: { state: null, lat: null, lng: null, zone: "SOUTH", isDirectional: true },
  West: { state: null, lat: null, lng: null, zone: "WEST", isDirectional: true },
};

/** Lookup helper. Returns null when the venue name isn't in the lookup. */
export function venueInfo(siteName: string): VenueInfo | null {
  return REGIONAL_VENUES[siteName] ?? null;
}
