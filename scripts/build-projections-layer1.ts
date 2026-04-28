/**
 * build-projections-layer1.ts
 *
 * Layer 1 of the Regional Advancement Projections model.
 *
 * Reads regionals-rich.json (David's regional history, 1989-2025), groups by
 * (gender, seed), and computes the historical advancement rate for each
 * (gender, seed) cell. This is the seed baseline that Layers 2-4 will adjust.
 *
 * Advancement = finalPos <= 5. This rule perfectly matches the explicit
 * `advanced` flag in regionals-history.json (verified: 4,635 rows agree, 0
 * disagree). Ties at 5th flatten to finalPos=5 and count as advanced —
 * uniformly across the historical sample.
 *
 * FORMAT-ERA FILTER. Field size and regional count have changed historically;
 * "seed 14" in an old 21-team field is structurally different from "seed 14"
 * in today's 14-team field. The baseline only trains on format-stable eras:
 *
 *   - Men:   2009-2025 excl. 2020 = 16 seasons of 6 regionals × 14 teams
 *   - Women: 2022-2025            =  4 seasons of 6 regionals × 12 teams
 *
 * Pre-modern data is informative but not structurally comparable, so it is
 * dropped. Women's baseline is trained on a small sample (4 seasons) and
 * tightens as more seasons accumulate.
 *
 * Output: src/data/projections/seed-baseline.json + stdout table for review.
 */
import { mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";
import { regionalsRich } from "../src/data/regionals-rich";

const ADVANCEMENT_CUTOFF = 5;

const MODERN_ERA_START: Record<"men" | "women", number> = {
  men: 2009, // 6 regionals × 14 teams
  women: 2022, // 6 regionals × 12 teams
};

interface SeedCell {
  gender: "men" | "women";
  seed: number;
  n_apps: number;
  n_advanced: number;
  rate: number;
}

function main() {
  const rows = regionalsRich.filter(
    (r) =>
      r.year !== 2020 &&
      r.seed != null &&
      r.finalPos != null &&
      r.year >= MODERN_ERA_START[r.gender],
  );

  const byKey = new Map<string, { apps: number; advanced: number }>();
  for (const r of rows) {
    const key = `${r.gender}|${r.seed}`;
    const cell = byKey.get(key) ?? { apps: 0, advanced: 0 };
    cell.apps += 1;
    if (r.finalPos! <= ADVANCEMENT_CUTOFF) cell.advanced += 1;
    byKey.set(key, cell);
  }

  const cells: SeedCell[] = [];
  for (const gender of ["men", "women"] as const) {
    const seeds = new Set<number>();
    for (const r of rows) if (r.gender === gender) seeds.add(r.seed!);
    for (const seed of [...seeds].sort((a, b) => a - b)) {
      const cell = byKey.get(`${gender}|${seed}`)!;
      cells.push({
        gender,
        seed,
        n_apps: cell.apps,
        n_advanced: cell.advanced,
        rate: cell.advanced / cell.apps,
      });
    }
  }

  console.log("Layer 1 — Seed advancement baseline (modern format only)");
  console.log(
    `Men   ${MODERN_ERA_START.men}-2025 excl. 2020 (6 regionals × 14 teams)`,
  );
  console.log(
    `Women ${MODERN_ERA_START.women}-2025              (6 regionals × 12 teams)`,
  );
  console.log(`Advancement = finalPos <= ${ADVANCEMENT_CUTOFF}`);
  console.log(`Total appearances: ${rows.length}`);
  console.log("");
  console.log("gender | seed | n_apps | n_advanced | rate");
  console.log("-------|------|--------|------------|--------");
  for (const c of cells) {
    console.log(
      [
        c.gender.padEnd(6),
        String(c.seed).padStart(4),
        String(c.n_apps).padStart(6),
        String(c.n_advanced).padStart(10),
        `${(c.rate * 100).toFixed(1)}%`.padStart(6),
      ].join(" | "),
    );
  }

  console.log("\nMonotonicity check (rate should generally decrease as seed worsens):");
  for (const gender of ["men", "women"] as const) {
    const g = cells.filter((c) => c.gender === gender);
    const violations: { from: number; to: number; rateFrom: number; rateTo: number }[] = [];
    for (let i = 1; i < g.length; i++) {
      if (g[i].rate > g[i - 1].rate) {
        violations.push({
          from: g[i - 1].seed,
          to: g[i].seed,
          rateFrom: g[i - 1].rate,
          rateTo: g[i].rate,
        });
      }
    }
    if (violations.length === 0) {
      console.log(`  ${gender}: monotonic (no inversions)`);
    } else {
      console.log(`  ${gender}: ${violations.length} inversions:`);
      for (const v of violations) {
        console.log(
          `    seed ${v.from} (${(v.rateFrom * 100).toFixed(1)}%) -> seed ${v.to} (${(v.rateTo * 100).toFixed(1)}%)`,
        );
      }
    }
  }

  console.log("\nSample-size guardrail (cells with n_apps < 15):");
  const sparse = cells.filter((c) => c.n_apps < 15);
  if (sparse.length === 0) console.log("  none");
  else for (const c of sparse) console.log(`  ${c.gender} seed ${c.seed}: n=${c.n_apps}`);

  const outPath = "src/data/projections/seed-baseline.json";
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(cells, null, 2) + "\n");
  console.log(`\nWrote ${cells.length} seed cells to ${outPath}`);
}

main();
