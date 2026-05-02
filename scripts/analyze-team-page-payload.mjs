#!/usr/bin/env node
/*
 * analyze-team-page-payload.mjs
 *
 * Reads .next/server/app/teams/men/<slug>.html and breaks down what's
 * eating bytes inside the inlined RSC stream. Run this against a few
 * representative team pages to see which sections of the team-page tree
 * dominate the payload (and therefore the Vercel ISR read cost).
 *
 * Usage:
 *   node scripts/analyze-team-page-payload.mjs alabama abilene-christian air-force
 *
 * Output (per slug):
 *   - Raw HTML size
 *   - Number of self.__next_f.push chunks and total payload bytes
 *   - Top heavy substring patterns (Tailwind classes, repeating props,
 *     known component markers) ranked by total bytes contributed
 *   - Approximate breakdown by team-page section markers
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const HTML_DIR = join(ROOT, ".next/server/app/teams/men");

const slugs = process.argv.slice(2);
if (slugs.length === 0) {
  console.error(
    "Usage: node scripts/analyze-team-page-payload.mjs <slug> [slug ...]"
  );
  process.exit(1);
}

// Patterns we want to count occurrences AND total byte cost of. Keys are
// human labels, values are exact substrings to grep for.
const TARGET_PATTERNS = {
  // Tailwind class usage. Each occurrence is the class string itself, so
  // total bytes ≈ count × pattern.length.
  "class: tabular-nums": "tabular-nums",
  "class: border-border/40": "border-border/40",
  "class: text-text-tertiary": "text-text-tertiary",
  "class: font-semibold uppercase tracking-wider": "font-semibold uppercase tracking-wider",
  "class: text-[10px]": 'text-[10px]',
  "class: text-[11px]": 'text-[11px]',
  "class: rounded-lg border": "rounded-lg border",
  // Section markers — distinctive strings that appear once per section
  // header. Useful for finding section boundaries.
  "section: Program arc": "Program arc",
  "section: Geography": "Geography",
  "section: 2026 conference championship": "2026 conference championship",
  "section: Program history": "Program history",
  "section: Year-by-year regionals": "Year-by-year regionals",
  "section: Regional performance": "Regional performance",
  "section: Year-by-year NCAAs": "Year-by-year NCAAs",
  "section: in the record book": "in the record book",
  // Big component prop markers
  "component: InteractiveProgramArc": "InteractiveProgramArc",
  "component: TeamMap": "TeamMap",
  "component: RegionalTimeline": "RegionalTimeline",
  "component: NationalTimeline": "NationalTimeline",
  "component: RegionalPerformance": "RegionalPerformance",
  // Per-cell timeline patterns
  "RSC field: \\\"position\\\":": '\\"position\\":',
  "RSC field: \\\"advanced\\\":": '\\"advanced\\":',
  "RSC field: \\\"win\\\":": '\\"win\\":',
  "RSC field: \\\"seed\\\":": '\\"seed\\":',
  "RSC field: \\\"sgTotal\\\":": '\\"sgTotal\\":',
  "RSC field: \\\"matchPlay\\\":": '\\"matchPlay\\":',
  "RSC field: \\\"madeCut\\\":": '\\"madeCut\\":',
  "RSC field: \\\"missed\\\":": '\\"missed\\":',
  "RSC field: \\\"cancelled\\\":": '\\"cancelled\\":',
  "RSC field: \\\"year\\\":": '\\"year\\":',
};

function countOccurrences(haystack, needle) {
  if (needle.length === 0) return 0;
  let i = 0;
  let n = 0;
  while (true) {
    const idx = haystack.indexOf(needle, i);
    if (idx === -1) break;
    n++;
    i = idx + needle.length;
  }
  return n;
}

function bytesFmt(n) {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}

function analyzeFile(slug) {
  const path = join(HTML_DIR, `${slug}.html`);
  if (!existsSync(path)) {
    console.log(`\n⚠️  ${slug}.html not found at ${path}`);
    return;
  }
  const html = readFileSync(path, "utf8");
  const totalBytes = Buffer.byteLength(html, "utf8");

  console.log(`\n=== ${slug}.html — ${bytesFmt(totalBytes)} (${totalBytes} bytes) ===`);

  // Count and sum bytes for each target pattern
  const rows = [];
  for (const [label, pattern] of Object.entries(TARGET_PATTERNS)) {
    const count = countOccurrences(html, pattern);
    const totalForPattern = count * pattern.length;
    rows.push({
      label,
      pattern: pattern.length > 30 ? pattern.slice(0, 27) + "..." : pattern,
      count,
      bytes: totalForPattern,
      pctOfPage: ((totalForPattern / totalBytes) * 100).toFixed(2) + "%",
    });
  }

  // Sort by bytes descending — biggest contributors first
  rows.sort((a, b) => b.bytes - a.bytes);

  console.log("\nTop bytes contributors (count × literal substring):");
  console.log(
    "  " +
      ["label".padEnd(48), "count".padStart(6), "bytes".padStart(10), "% page".padStart(7)].join(
        "  "
      )
  );
  for (const r of rows.slice(0, 25)) {
    if (r.count === 0) continue;
    console.log(
      "  " +
        [
          r.label.padEnd(48),
          String(r.count).padStart(6),
          bytesFmt(r.bytes).padStart(10),
          r.pctOfPage.padStart(7),
        ].join("  ")
    );
  }

  // Locate section boundaries by their header strings — gives us a
  // rough "how many bytes between Program arc and Geography" view.
  const sectionBoundaries = [
    "Program arc",
    "Geography",
    "2026 conference championship",
    "Program history",
    "Year-by-year regionals",
    "Regional performance",
    "Year-by-year NCAAs",
    "in the record book",
    "Current-season data from NCAA rankings", // footer marker
  ];
  const positions = [];
  for (const marker of sectionBoundaries) {
    const idx = html.indexOf(marker);
    if (idx !== -1) positions.push({ marker, idx });
  }
  positions.sort((a, b) => a.idx - b.idx);

  console.log("\nApprox bytes between section markers:");
  for (let i = 0; i < positions.length - 1; i++) {
    const a = positions[i];
    const b = positions[i + 1];
    const span = b.idx - a.idx;
    console.log(
      `  ${a.marker.padEnd(40)} → ${b.marker.padEnd(40)}  ${bytesFmt(span).padStart(10)}`
    );
  }
  if (positions.length > 0) {
    const first = positions[0];
    const last = positions[positions.length - 1];
    console.log(`  (head → first section "${first.marker}":  ${bytesFmt(first.idx)})`);
    console.log(
      `  (last section "${last.marker}" → end:  ${bytesFmt(totalBytes - last.idx)})`
    );
  }
}

for (const slug of slugs) {
  analyzeFile(slug);
}
