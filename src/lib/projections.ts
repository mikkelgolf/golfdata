/**
 * Regional Advancement Projections — modeling primitives.
 *
 * Zone classifier (`zoneFromCoords`) maps a campus lat/lng to its
 * climate/agronomy zone using state-bbox heuristics. Bbox sources: U.S.
 * Census tiger reference. Designed to handle every coords pair that appears
 * in the 311 D1 men's and ~300 D1 women's roster files.
 *
 * Layer math:
 *   - All lifts are stored as multiplicative odds-ratios (OR) on the
 *     seed-baseline odds.
 *   - Pseudo-counts (Laplace alpha=0.5) applied at the smoothing step to keep
 *     0% / 100% cells from breaking the odds math. Raw rates are preserved in
 *     the JSON outputs for transparency.
 *   - Final per-team probabilities are normalized within each regional to
 *     sum exactly to TEAMS_ADVANCING (5).
 */

import type { ClimateZone } from "@/data/climate-zones";

export const TEAMS_ADVANCING = 5;
const LAPLACE_ALPHA = 0.5;

// ──────────────────────────────────────────────────────────────────────────
// Zone classifier
// ──────────────────────────────────────────────────────────────────────────

/**
 * Classify a US campus by its climate/agronomy zone using lat/lng. Returns
 * null only for unresolved (0,0) coords — every legitimate D1 campus
 * resolves. Bbox order matters: smaller / more specific regions first so
 * overlapping bboxes don't mis-route.
 */
export function zoneFromCoords(lat: number, lng: number): ClimateZone | null {
  if (lat === 0 && lng === 0) return null;

  // Hawaii (separate Pacific bucket → WEST)
  if (lat >= 18 && lat <= 23 && lng >= -161 && lng <= -154) return "WEST";

  // PNW: WA + OR
  // WA  45.5-49.0  -124.7 to -116.9
  // OR  42.0-46.3  -124.6 to -116.5
  if (lat >= 42 && lat <= 49 && lng >= -125 && lng <= -116.5) return "PNW";

  // WEST: CA + AZ + NV + NM
  // CA  32.5-42.0  -124.5 to -114.1
  if (lat >= 32.5 && lat <= 42 && lng >= -124.5 && lng <= -114) return "WEST";
  // NV  35.0-42.0  -120.0 to -114.0  (overlaps CA bbox in eastern CA — handled by ordering above)
  if (lat >= 35 && lat <= 42 && lng >= -120 && lng <= -114) return "WEST";
  // AZ  31.3-37.0  -114.8 to -109.0
  if (lat >= 31.3 && lat <= 37 && lng >= -114.8 && lng <= -109) return "WEST";
  // NM  31.3-37.0  -109.05 to -103.0
  if (lat >= 31.3 && lat <= 37 && lng >= -109.05 && lng <= -103) return "WEST";

  // SOUTH: warm-season bermuda. Capture by state-by-state bboxes (priority
  // for narrow ones first to avoid pulling KY/VA into SOUTH).
  // TX  25.8-36.5  -106.65 to -93.5
  if (lat >= 25.84 && lat <= 36.5 && lng >= -106.65 && lng <= -93.5) return "SOUTH";
  // OK  33.6-37    -103 to -94.4
  if (lat >= 33.62 && lat <= 37 && lng >= -103 && lng <= -94.4) return "SOUTH";
  // AR  33-36.5    -94.6 to -89.6
  if (lat >= 33 && lat <= 36.5 && lng >= -94.62 && lng <= -89.6) return "SOUTH";
  // LA  28.9-33    -94 to -88.8
  if (lat >= 28.93 && lat <= 33.02 && lng >= -94.04 && lng <= -88.82) return "SOUTH";
  // MS  30.2-35    -91.7 to -88.1
  if (lat >= 30.17 && lat <= 35 && lng >= -91.66 && lng <= -88.1) return "SOUTH";
  // AL  30.2-35    -88.5 to -84.9
  if (lat >= 30.14 && lat <= 35 && lng >= -88.47 && lng <= -84.89) return "SOUTH";
  // GA  30.4-35    -85.6 to -80.8
  if (lat >= 30.36 && lat <= 35 && lng >= -85.6 && lng <= -80.84) return "SOUTH";
  // FL  24.5-31    -87.6 to -80.0
  if (lat >= 24.52 && lat <= 31 && lng >= -87.63 && lng <= -79.97) return "SOUTH";
  // SC  32.0-35.2  -83.4 to -78.5
  if (lat >= 32.03 && lat <= 35.22 && lng >= -83.35 && lng <= -78.54) return "SOUTH";
  // NC  33.8-36.6  -84.3 to -75.5
  if (lat >= 33.84 && lat <= 36.59 && lng >= -84.32 && lng <= -75.46) return "SOUTH";
  // TN  35.0-36.7  -90.3 to -81.6
  if (lat >= 34.98 && lat <= 36.68 && lng >= -90.31 && lng <= -81.65) return "SOUTH";

  // Everything else → NORTH (cool-season interior, Northeast, Mid-Atlantic,
  // Mountain West, AK)
  return "NORTH";
}

// ──────────────────────────────────────────────────────────────────────────
// Smoothing & layer math
// ──────────────────────────────────────────────────────────────────────────

/** Laplace-smoothed rate (avoids 0 / 1 endpoints). */
export function smoothRate(advanced: number, total: number): number {
  return (advanced + LAPLACE_ALPHA) / (total + 2 * LAPLACE_ALPHA);
}

/** Convert probability to odds. Smoothed input only — never call on raw 0/1. */
export function odds(p: number): number {
  return p / (1 - p);
}

export function probFromOdds(o: number): number {
  return o / (1 + o);
}

/**
 * Compose a final per-team probability from a smoothed seed baseline plus
 * three multiplicative odds-ratio adjustments.
 */
export function combineLayers(args: {
  baseRate: number; // Layer 1 smoothed
  hostOR: number; // Layer 2 odds-ratio (1.0 = no effect)
  distanceOR: number; // Layer 3 odds-ratio
  zoneOR: number; // Layer 4 odds-ratio
}): number {
  const baseOdds = odds(args.baseRate);
  const adj = baseOdds * args.hostOR * args.distanceOR * args.zoneOR;
  return probFromOdds(adj);
}

/**
 * Normalize a per-regional probability vector to sum to TEAMS_ADVANCING.
 *
 * Uses cap-and-redistribute: log-odds rescale, then cap any team above
 * `maxProb` (default 0.99) and recurse on the remaining teams with a reduced
 * sum target. This preserves near-deterministic top dogs (a #1 seed who is
 * also the host shouldn't drop from 99.7% raw to 94.5% just because the
 * regional field happens to be hot) without violating sum-to-5.
 */
export function normalizeToFive(probs: number[], maxProb = 0.99): number[] {
  if (probs.length === 0) return [];

  const result = new Array(probs.length).fill(0) as number[];
  const locked = new Array(probs.length).fill(false) as boolean[];
  let target = TEAMS_ADVANCING;
  let open = probs.map((_, i) => i);

  for (let iter = 0; iter < 20; iter++) {
    if (open.length === 0) break;
    const rescaled = rescaleLogOdds(
      open.map((i) => probs[i]),
      target,
    );
    let newlyLocked = 0;
    for (let k = 0; k < open.length; k++) {
      const i = open[k];
      if (rescaled[k] > maxProb) {
        result[i] = maxProb;
        locked[i] = true;
        target -= maxProb;
        newlyLocked++;
      } else {
        result[i] = rescaled[k];
      }
    }
    if (newlyLocked === 0) break;
    open = open.filter((i) => !locked[i]);
  }
  return result;
}

function rescaleLogOdds(probs: number[], target: number): number[] {
  if (probs.length === 0) return [];
  const sumRaw = probs.reduce((a, b) => a + b, 0);
  if (sumRaw === 0) return probs.map(() => target / probs.length);
  const logits = probs.map((p) =>
    Math.log(odds(Math.max(1e-6, Math.min(1 - 1e-6, p)))),
  );
  let lo = -30;
  let hi = 30;
  for (let i = 0; i < 80; i++) {
    const c = (lo + hi) / 2;
    const sum = logits.reduce((s, l) => s + 1 / (1 + Math.exp(-(l + c))), 0);
    if (Math.abs(sum - target) < 1e-7) break;
    if (sum > target) hi = c;
    else lo = c;
  }
  const c = (lo + hi) / 2;
  return logits.map((l) => 1 / (1 + Math.exp(-(l + c))));
}

// ──────────────────────────────────────────────────────────────────────────
// Seed tier — semi-global segmentation for Layers 2/3/4
// ──────────────────────────────────────────────────────────────────────────

export type SeedTier = "TOP" | "MID" | "BOT";

export function seedTier(seed: number): SeedTier {
  if (seed <= 3) return "TOP";
  if (seed <= 7) return "MID";
  return "BOT";
}

export const SEED_TIERS: SeedTier[] = ["TOP", "MID", "BOT"];

// ──────────────────────────────────────────────────────────────────────────
// Distance buckets
// ──────────────────────────────────────────────────────────────────────────

export type DistanceBucket = "<250" | "250-750" | "750-1500" | "1500+";

export function distanceBucket(miles: number): DistanceBucket {
  if (miles < 250) return "<250";
  if (miles < 750) return "250-750";
  if (miles < 1500) return "750-1500";
  return "1500+";
}

export const DISTANCE_BUCKETS: DistanceBucket[] = ["<250", "250-750", "750-1500", "1500+"];
