#!/usr/bin/env node
/*
 * build-us-base-map.mjs
 *
 * Pre-renders the static US base map (state fills + state borders +
 * timezone borders + nation border) used by the team page's TeamMap
 * component to a single SVG file at public/us-base-map.svg.
 *
 * Why: previously TeamMap rendered ~50 individual <path> elements
 * inline on every team page, contributing ~395 KB of identical SVG
 * geometry to every prerendered HTML output. Moving the static base
 * to a public/ asset:
 *   - Removes ~395 KB from each of the 597 prerendered team pages
 *   - Lets the CDN cache the base map once and serve it free of
 *     Vercel ISR read-unit charges
 *   - Keeps the team-specific overlays (team marker, regional
 *     marker, travel arc, other regionals) inline in the page SVG
 *
 * Run when:
 *   - The topology source (src/data/us-states-10m.json) changes
 *   - The hardcoded colors below need to track a theme update
 *   - Adding/removing static layers (e.g., timezone borders)
 *
 * Output is committed to public/us-base-map.svg. This file is not
 * regenerated on every build — it's a static asset checked in to
 * the repo.
 *
 * Usage:
 *   node scripts/build-us-base-map.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { geoAlbersUsa, geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";

// Inlined from src/lib/timezone.ts (single source of truth lives there;
// we copy here so this script can run as plain Node ESM without a TS
// loader). If the canonical map gains a new state, update both sides.
const STATE_FIPS_TO_TZ = {
  "01": "CT", "02": "AKT", "04": "PT", "05": "CT", "06": "PT", "08": "MT",
  "09": "ET", "10": "ET", "11": "ET", "12": "ET", "13": "ET", "15": "HT",
  "16": "MT", "17": "CT", "18": "ET", "19": "CT", "20": "CT", "21": "ET",
  "22": "CT", "23": "ET", "24": "ET", "25": "ET", "26": "ET", "27": "CT",
  "28": "CT", "29": "CT", "30": "MT", "31": "CT", "32": "PT", "33": "ET",
  "34": "ET", "35": "MT", "36": "ET", "37": "ET", "38": "CT", "39": "ET",
  "40": "CT", "41": "PT", "42": "ET", "44": "ET", "45": "ET", "46": "CT",
  "47": "CT", "48": "CT", "49": "MT", "50": "ET", "51": "ET", "53": "PT",
  "54": "ET", "55": "CT", "56": "MT",
};

const ROOT = process.cwd();
const TOPO_PATH = join(ROOT, "src/data/us-states-10m.json");
const OUTPUT_PATH = join(ROOT, "public/us-base-map.svg");

// MUST match SVG_WIDTH/HEIGHT in src/components/team-page/team-map.tsx so
// the rendered base lines up with the per-team overlays drawn on top.
const SVG_WIDTH = 975;
const SVG_HEIGHT = 610;

// Hardcoded colors — site is dark-mode-only. Values pulled from
// src/app/globals.css :root block. If theme colors change, re-run
// this script.
//   --secondary: 240 4% 16%   → #28282b   (state fill)
//   --foreground: 0 0% 98%    → #fafafa   (borders)
const FILL_SECONDARY = "#28282b";
const STROKE_FOREGROUND = "#fafafa";

const projection = geoAlbersUsa()
  .scale(1300)
  .translate([SVG_WIDTH / 2, SVG_HEIGHT / 2]);
const pathGen = geoPath(projection);

const topo = JSON.parse(readFileSync(TOPO_PATH, "utf8"));
const statesGeo = feature(topo, topo.objects.states);

// Single combined path for all 50 state fills. Concatenating the per-state
// `d` attributes into one path is identical visually to 50 separate paths
// (same fill, no per-state interactivity needed for the base layer).
const stateFillPaths = statesGeo.features
  .map((f) => pathGen(f))
  .filter(Boolean)
  .join(" ");

const stateBorderPath = pathGen(
  mesh(topo, topo.objects.states, (a, b) => a !== b)
);

const nationBorderPath = pathGen(mesh(topo, topo.objects.nation));

const timezoneBorderPath = pathGen(
  mesh(topo, topo.objects.states, (a, b) => {
    const aFips = String(a.id ?? "");
    const bFips = String(b.id ?? "");
    if (!aFips || !bFips) return false;
    const aTz = STATE_FIPS_TO_TZ[aFips];
    const bTz = STATE_FIPS_TO_TZ[bFips];
    if (!aTz || !bTz) return false;
    return aTz !== bTz;
  })
);

const svg = [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" preserveAspectRatio="xMidYMid meet">`,
  `<path d="${stateFillPaths}" fill="${FILL_SECONDARY}" stroke="none"/>`,
  stateBorderPath
    ? `<path d="${stateBorderPath}" fill="none" stroke="${STROKE_FOREGROUND}" stroke-width="0.75" stroke-linejoin="round" opacity="0.18"/>`
    : "",
  timezoneBorderPath
    ? `<path d="${timezoneBorderPath}" fill="none" stroke="${STROKE_FOREGROUND}" stroke-width="1" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="3 2" opacity="0.42"/>`
    : "",
  nationBorderPath
    ? `<path d="${nationBorderPath}" fill="none" stroke="${STROKE_FOREGROUND}" stroke-width="1" stroke-linejoin="round" opacity="0.35"/>`
    : "",
  `</svg>`,
]
  .filter(Boolean)
  .join("");

writeFileSync(OUTPUT_PATH, svg);

const sizeKb = (Buffer.byteLength(svg, "utf8") / 1024).toFixed(1);
console.log(`Wrote ${OUTPUT_PATH} (${sizeKb} KB)`);
