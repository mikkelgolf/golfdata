/**
 * May/June US timezone helpers.
 *
 * The NCAA Regionals are played in mid-May through early June, so every
 * U.S. timezone that observes DST is on daylight time during the event:
 *
 *   Eastern (EDT)  = UTC-4
 *   Central (CDT)  = UTC-5
 *   Mountain (MDT) = UTC-6
 *   Pacific (PDT)  = UTC-7
 *   Alaska (AKDT)  = UTC-8
 *   Hawaii (HST)   = UTC-10 (no DST)
 *
 * Arizona also stays on MST year-round (UTC-7), which in May/June matches
 * Pacific Daylight. That gets handled in the state-level map below.
 *
 * Timezone assignment is done by finding the U.S. state that contains a
 * given (lat, lng) via d3-geo's geoContains, then looking up the state's
 * dominant zone. A handful of states straddle a zone boundary and get a
 * longitude-based override so per-campus precision is preserved for the
 * notable D1 schools on each side.
 */
import { geoContains } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import usTopology from "@/data/us-states-10m.json";

/** Zone labels used throughout the app. */
export type TimezoneBand = "ET" | "CT" | "MT" | "PT" | "AKT" | "HT";

/** Human-readable label for a band. */
export const TIMEZONE_BAND_NAME: Record<TimezoneBand, string> = {
  ET: "Eastern",
  CT: "Central",
  MT: "Mountain",
  PT: "Pacific",
  AKT: "Alaska",
  HT: "Hawaii",
};

/** UTC offset (negative = west of UTC) during May/June. */
export const MAY_UTC_OFFSET: Record<TimezoneBand, number> = {
  ET: -4,
  CT: -5,
  MT: -6,
  PT: -7,
  AKT: -8,
  HT: -10,
};

/**
 * Dominant (May/June) timezone for every U.S. state by FIPS id.
 *
 * Split states get a single dominant assignment here and a more precise
 * per-longitude override in `tzBandFromStateFips` below. The topology
 * we render uses these same FIPS ids.
 */
export const STATE_FIPS_TO_TZ: Record<string, TimezoneBand> = {
  "01": "CT", // Alabama
  "02": "AKT", // Alaska
  "04": "PT", // Arizona — MST no-DST ≡ PDT in May/June
  "05": "CT", // Arkansas
  "06": "PT", // California
  "08": "MT", // Colorado
  "09": "ET", // Connecticut
  "10": "ET", // Delaware
  "11": "ET", // DC
  "12": "ET", // Florida (panhandle overridden → CT below)
  "13": "ET", // Georgia
  "15": "HT", // Hawaii
  "16": "MT", // Idaho (north panhandle overridden → PT)
  "17": "CT", // Illinois
  "18": "ET", // Indiana (NW counties overridden → CT)
  "19": "CT", // Iowa
  "20": "CT", // Kansas (western panhandle overridden → MT)
  "21": "ET", // Kentucky (west overridden → CT)
  "22": "CT", // Louisiana
  "23": "ET", // Maine
  "24": "ET", // Maryland
  "25": "ET", // Massachusetts
  "26": "ET", // Michigan (western UP overridden → CT)
  "27": "CT", // Minnesota
  "28": "CT", // Mississippi
  "29": "CT", // Missouri
  "30": "MT", // Montana
  "31": "CT", // Nebraska (panhandle overridden → MT)
  "32": "PT", // Nevada
  "33": "ET", // New Hampshire
  "34": "ET", // New Jersey
  "35": "MT", // New Mexico
  "36": "ET", // New York
  "37": "ET", // North Carolina
  "38": "CT", // North Dakota (west overridden → MT)
  "39": "ET", // Ohio
  "40": "CT", // Oklahoma
  "41": "PT", // Oregon (Malheur County overridden → MT)
  "42": "ET", // Pennsylvania
  "44": "ET", // Rhode Island
  "45": "ET", // South Carolina
  "46": "CT", // South Dakota (west overridden → MT)
  "47": "CT", // Tennessee (east overridden → ET)
  "48": "CT", // Texas (El Paso overridden → MT)
  "49": "MT", // Utah
  "50": "ET", // Vermont
  "51": "ET", // Virginia
  "53": "PT", // Washington
  "54": "ET", // West Virginia
  "55": "CT", // Wisconsin
  "56": "MT", // Wyoming
};

/**
 * Map a state FIPS id + point coordinate to a May/June timezone band.
 * Applies per-state longitude/latitude overrides for the well-known
 * state-splitting boundaries so campuses on either side of the line
 * land in the right zone.
 */
export function tzBandFromStateFips(
  fips: string,
  lat: number,
  lng: number
): TimezoneBand | null {
  // Tennessee: the ET/CT line runs roughly down longitude ~85.5°W; Knoxville
  // (~83.9°W) + Chattanooga (~85.3°W) are Eastern, Nashville/Memphis Central.
  if (fips === "47") return lng > -85.4 ? "ET" : "CT";
  // Kentucky: Louisville (~85.7°W), Lexington (~84.5°W) Eastern; Bowling Green,
  // Murray Central. Line around -86.25°W.
  if (fips === "21") return lng > -86.25 ? "ET" : "CT";
  // Florida: panhandle (Pensacola ~87.2°W) is Central; rest Eastern.
  if (fips === "12") return lng > -85 ? "ET" : "CT";
  // Indiana: handful of NW + SW counties are Central. Most D1 schools sit
  // east of ~86.75°W and stay Eastern.
  if (fips === "18") return lng > -86.75 ? "ET" : "CT";
  // Michigan: the four western UP counties (Gogebic, Iron, Dickinson,
  // Menominee) are Central; everything else Eastern. Those counties sit
  // west of ~87°W.
  if (fips === "26") return lng > -87 ? "ET" : "CT";
  // Kansas: four western panhandle counties (Sherman, Wallace, Greeley,
  // Hamilton) are Mountain. All west of ~101.5°W.
  if (fips === "20") return lng > -101.5 ? "CT" : "MT";
  // Nebraska: western panhandle (west of ~101.5°W) is Mountain.
  if (fips === "31") return lng > -101.5 ? "CT" : "MT";
  // North Dakota: thin western strip of Bowman/Slope/etc is Mountain.
  if (fips === "38") return lng > -100.7 ? "CT" : "MT";
  // South Dakota: west-river is Mountain; east-river Central. Line ~100.5°W.
  if (fips === "46") return lng > -100.5 ? "CT" : "MT";
  // Texas: El Paso + Hudspeth counties are Mountain (west of ~104°W).
  if (fips === "48") return lng > -104 ? "CT" : "MT";
  // Oregon: Malheur County (far SE corner) observes Mountain. Latitude <
  // ~44.3°N and longitude > ~-118°W.
  if (fips === "41") return lng > -117.5 && lat < 44.5 ? "MT" : "PT";
  // Idaho: northern panhandle (north of Salmon River, lat > ~45.5°N) is
  // Pacific; rest Mountain.
  if (fips === "16") return lat > 45.5 ? "PT" : "MT";
  // Everything else follows the state-level default.
  return STATE_FIPS_TO_TZ[fips] ?? null;
}

/**
 * Rough longitude/latitude heuristic for points that don't fall inside any
 * state polygon (e.g. offshore, Great Lakes, or tiny missing topo gaps).
 * Intentionally simple — good enough for fallback so we never return null.
 */
export function tzBandFromCoordFallback(
  lat: number,
  lng: number
): TimezoneBand {
  if (lat < 23 && lng > -165 && lng < -150) return "HT";
  if (lat > 54 || (lat > 50 && lng < -130)) return "AKT";
  if (lng > -87) return "ET";
  if (lng > -102) return "CT";
  if (lng > -114) return "MT";
  return "PT";
}

/**
 * Given the FeatureCollection of U.S. states (same topology used to render
 * the map), return the timezone band for a (lat, lng) point. Uses the
 * state's FIPS id via `geoContains` then applies any split-state override.
 * Falls back to the longitude heuristic when no polygon contains the point.
 */
export function tzBandFromCoord(
  lat: number,
  lng: number,
  statesGeo: FeatureCollection
): TimezoneBand {
  const pt: [number, number] = [lng, lat];
  for (const feat of statesGeo.features) {
    const fips = typeof feat.id === "string" ? feat.id : String(feat.id ?? "");
    if (!fips) continue;
    if (geoContains(feat as Feature<Geometry>, pt)) {
      const band = tzBandFromStateFips(fips, lat, lng);
      if (band) return band;
    }
  }
  return tzBandFromCoordFallback(lat, lng);
}

/**
 * Cached FeatureCollection of U.S. states, derived from the bundled
 * `us-states-10m` topology. Lazy so callers that only need the pure
 * helpers (`tzDeltaHours`, `formatTzDelta`) don't pay the parse cost.
 */
let _statesGeoCache: FeatureCollection | null = null;
function getStatesGeo(): FeatureCollection {
  if (!_statesGeoCache) {
    const topo = usTopology as unknown as Topology;
    _statesGeoCache = feature(
      topo,
      topo.objects.states as GeometryCollection
    ) as FeatureCollection;
  }
  return _statesGeoCache;
}

/**
 * Convenience wrapper: resolve a (lat, lng) directly to a timezone band
 * without the caller having to thread the state FeatureCollection
 * through. Use this from pages that don't already render the US map.
 */
export function tzBandFromLatLng(lat: number, lng: number): TimezoneBand {
  return tzBandFromCoord(lat, lng, getStatesGeo());
}

/**
 * Hour difference the traveller experiences: positive = clocks go forward,
 * negative = clocks go back. Matches the spec: Eastern → Central = -1,
 * Pacific → Central = +2.
 */
export function tzDeltaHours(from: TimezoneBand, to: TimezoneBand): number {
  return MAY_UTC_OFFSET[to] - MAY_UTC_OFFSET[from];
}

/** Short label: "+2 hours", "-1 hour", "same time zone". */
export function formatTzDelta(hours: number): string {
  if (hours === 0) return "same time zone";
  const sign = hours > 0 ? "+" : "−"; // use a real minus sign for polish
  const magnitude = Math.abs(hours);
  return `${sign}${magnitude} hour${magnitude === 1 ? "" : "s"}`;
}
