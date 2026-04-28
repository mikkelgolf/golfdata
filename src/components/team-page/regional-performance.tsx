"use client";

import { StatCard } from "@/components/stat-card";

interface SeedBucket {
  range: string;
  entries: number;
  titles: number;
  advanced: number;
}

export interface RegionalPerformanceProps {
  /** Number of Regional titles (finished 1st, solo or tied). */
  titles: number;
  /** Average committee seed across years where seeding was recorded. Null if no seeded years. */
  avgSeed: number | null;
  /** How many years have a recorded committee seed. */
  seededYears: number;
  /** Best (highest) team strokes-gained total at any Regional. Null if none recorded. */
  bestSgTotal: number | null;
  /** Year of best SG total. */
  bestSgYear: number | null;
  /** Regional site for best SG. */
  bestSgRegional: string | null;
  /** Number of Regional appearances where the team's final position beat its seed. */
  beatSeedCount: number;
  /**
   * Number of appearances where the team was NOT expected to advance
   * (per the spreadsheet's "Expected to Adv" flag) but made it to NCAAs
   * anyway. Only years within the seeding-data window count.
   */
  underdogAdvanceCount: number;
  /** Total Regional appearances ever (with and without seed data). */
  totalAppearances: number;
  /** Bucketed seed performance (entries / titles / advanced per band). */
  seedBuckets: SeedBucket[];
  /**
   * Earliest year for which seeding-expectation data is available for
   * this gender (e.g. 2000 for women, 2002 for men). Drives the
   * "Seeded years" tile subtitle. Null if no data is available.
   */
  seedingMinYear: number | null;
}

function fmtSg(v: number | null): string {
  if (v === null) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}`;
}

export default function RegionalPerformance(props: RegionalPerformanceProps) {
  const {
    titles,
    avgSeed,
    seededYears,
    bestSgTotal,
    bestSgYear,
    bestSgRegional,
    beatSeedCount,
    underdogAdvanceCount,
    totalAppearances,
    seedBuckets,
    seedingMinYear,
  } = props;

  const bestSgDetail =
    bestSgYear != null
      ? `${bestSgYear}${bestSgRegional ? ` · ${bestSgRegional}` : ""}`
      : undefined;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          label="Regional titles"
          value={titles}
          detail={`${totalAppearances} appearance${totalAppearances === 1 ? "" : "s"}`}
        />
        <StatCard
          label="Avg committee seed"
          value={avgSeed !== null ? avgSeed.toFixed(1) : "—"}
          detail={
            seededYears > 0
              ? `across ${seededYears} seeded year${seededYears === 1 ? "" : "s"}`
              : "no seeding data"
          }
        />
        <StatCard
          label="Best Regional SG"
          value={fmtSg(bestSgTotal)}
          detail={bestSgDetail}
        />
        <StatCard
          label="Beat the seed"
          value={`${beatSeedCount}×`}
          detail="finished better than seeded"
        />
        <StatCard
          label="Advanced as underdog"
          value={`${underdogAdvanceCount}×`}
          detail="Advanced to NCAAs unexpectedly based on seeding"
          wrapDetail
        />
        <StatCard
          label="Seeded years"
          value={seededYears}
          detail={
            seedingMinYear != null
              ? `Seeding data available: ${seedingMinYear}-present`
              : "with committee seed on record"
          }
          wrapDetail
        />
      </div>

      {seedBuckets.some((b) => b.entries > 0) && (
        <div className="rounded border border-border/50 bg-card/40 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-text-tertiary mb-1">
            Seed breakdown
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {seedBuckets.map((b) => (
              <div key={b.range} className="flex flex-col">
                <div className="text-[10px] text-text-tertiary">
                  Seed {b.range}
                </div>
                <div className="font-mono tabular-nums text-[13px] text-foreground">
                  {b.entries}{" "}
                  <span className="text-[10px] text-text-tertiary">entries</span>
                </div>
                <div className="font-mono tabular-nums text-[11px] text-text-tertiary">
                  <span className="text-amber-300">{b.titles}</span> wins ·{" "}
                  <span className="text-emerald-400">{b.advanced}</span> advanced
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
