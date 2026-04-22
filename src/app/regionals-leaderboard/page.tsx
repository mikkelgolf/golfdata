import type { Metadata } from "next";
import { Suspense } from "react";
import { regionalsRich } from "@/data/regionals-rich";
import { championshipsHistory } from "@/data/championships-history";
import type { Gender, RegionalFinishRich } from "@/data/records-types";
import RegionalsLeaderboardTabs, {
  type LeaderboardBoards,
} from "@/components/regionals-leaderboard-tabs";

export const metadata: Metadata = {
  title: "Regionals Leaderboard",
  description:
    "Site-wide leaderboards for NCAA Division I Men's and Women's Regionals — titles, committee seeding, strokes-gained performance, and underdog advances.",
};

const MIN_APPEARANCES_FOR_RATE = 5;
const TOP_N = 15;

interface TeamAgg {
  team: string;
  appearances: number;
  titles: number;
  seededAppearances: number;
  avgSeed: number | null;
  sgSum: number;
  sgCount: number;
  avgSg: number | null;
  bestSg: number | null;
  bestSgYear: number | null;
  bestSgRegional: string | null;
  beatSeedCount: number;
  underdogAdvanceCount: number;
}

function buildAggregates(
  rows: RegionalFinishRich[],
  gender: Gender
): Map<string, TeamAgg> {
  const out = new Map<string, TeamAgg>();
  for (const r of rows) {
    if (r.gender !== gender) continue;
    const key = r.team;
    let agg = out.get(key);
    if (!agg) {
      agg = {
        team: r.team,
        appearances: 0,
        titles: 0,
        seededAppearances: 0,
        avgSeed: null,
        sgSum: 0,
        sgCount: 0,
        avgSg: null,
        bestSg: null,
        bestSgYear: null,
        bestSgRegional: null,
        beatSeedCount: 0,
        underdogAdvanceCount: 0,
      };
      out.set(key, agg);
    }
    agg.appearances += 1;
    if (r.finalPos === 1 || r.result === "1" || r.result === "T1") {
      agg.titles += 1;
    }
    if (r.seed != null) {
      agg.seededAppearances += 1;
    }
    if (r.sgTotal != null) {
      agg.sgSum += r.sgTotal;
      agg.sgCount += 1;
      if (agg.bestSg == null || r.sgTotal > agg.bestSg) {
        agg.bestSg = r.sgTotal;
        agg.bestSgYear = r.year;
        agg.bestSgRegional = r.regional;
      }
    }
    if (r.seed != null && r.finalPos != null && r.finalPos < r.seed) {
      agg.beatSeedCount += 1;
    }
  }

  // Second pass for avgSeed + avgSg
  for (const agg of out.values()) {
    if (agg.seededAppearances > 0) {
      let sum = 0;
      let count = 0;
      for (const r of rows) {
        if (r.gender !== gender || r.team !== agg.team || r.seed == null) continue;
        sum += r.seed;
        count += 1;
      }
      agg.avgSeed = count > 0 ? sum / count : null;
    }
    if (agg.sgCount > 0) {
      agg.avgSg = agg.sgSum / agg.sgCount;
    }
  }

  // "Advanced as underdog" needs NCAA appearance truth (seed data alone
  // can be misleading). Pre-index championship appearances by team/year
  // for the relevant gender.
  const ncaaByTeamYear = new Set<string>();
  for (const r of championshipsHistory) {
    if (r.gender === gender) ncaaByTeamYear.add(`${r.team}|${r.year}`);
  }
  for (const r of rows) {
    if (r.gender !== gender) continue;
    if (r.seed == null || r.seed < 5) continue;
    if (ncaaByTeamYear.has(`${r.team}|${r.year}`)) {
      const agg = out.get(r.team);
      if (agg) agg.underdogAdvanceCount += 1;
    }
  }

  return out;
}

function buildBoards(
  rows: RegionalFinishRich[],
  gender: Gender
): LeaderboardBoards {
  const aggregates = buildAggregates(rows, gender);
  const teams = Array.from(aggregates.values());

  const topTitles = [...teams]
    .filter((t) => t.titles > 0)
    .sort((a, b) => b.titles - a.titles || b.appearances - a.appearances)
    .slice(0, TOP_N)
    .map((t) => ({ team: t.team, cells: [t.titles, t.appearances] }));

  const bestAvgSeed = [...teams]
    .filter(
      (t) => t.avgSeed !== null && t.seededAppearances >= MIN_APPEARANCES_FOR_RATE
    )
    .sort((a, b) => (a.avgSeed as number) - (b.avgSeed as number))
    .slice(0, TOP_N)
    .map((t) => ({
      team: t.team,
      cells: [(t.avgSeed as number).toFixed(2), t.seededAppearances],
    }));

  const bestAvgSg = [...teams]
    .filter((t) => t.avgSg !== null && t.sgCount >= MIN_APPEARANCES_FOR_RATE)
    .sort((a, b) => (b.avgSg as number) - (a.avgSg as number))
    .slice(0, TOP_N)
    .map((t) => ({
      team: t.team,
      cells: [
        fmtSg(t.avgSg),
        t.bestSg !== null ? `${fmtSg(t.bestSg)} (${t.bestSgYear})` : "—",
        t.sgCount,
      ],
    }));

  const mostBeatSeed = [...teams]
    .filter((t) => t.beatSeedCount > 0)
    .sort(
      (a, b) =>
        b.beatSeedCount - a.beatSeedCount ||
        b.seededAppearances - a.seededAppearances
    )
    .slice(0, TOP_N)
    .map((t) => ({
      team: t.team,
      cells: [t.beatSeedCount, t.seededAppearances],
    }));

  const mostUnderdogAdvance = [...teams]
    .filter((t) => t.underdogAdvanceCount > 0)
    .sort(
      (a, b) =>
        b.underdogAdvanceCount - a.underdogAdvanceCount ||
        b.appearances - a.appearances
    )
    .slice(0, TOP_N)
    .map((t) => ({
      team: t.team,
      cells: [t.underdogAdvanceCount, t.appearances],
    }));

  return {
    teamCount: teams.length,
    topTitles,
    bestAvgSeed,
    bestAvgSg,
    mostBeatSeed,
    mostUnderdogAdvance,
  };
}

function fmtSg(v: number | null): string {
  if (v === null) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}`;
}

export default function RegionalsLeaderboardPage() {
  const men = buildBoards(regionalsRich, "men");
  const women = buildBoards(regionalsRich, "women");

  return (
    <div className="mx-auto max-w-6xl px-3 sm:px-4 pt-2 sm:pt-4 pb-8">
      <div className="mb-4">
        <h1 className="text-[15px] sm:text-lg font-semibold tracking-tight text-foreground">
          Regionals Leaderboard
        </h1>
        <p className="hidden sm:block text-[12px] text-text-tertiary mt-1">
          NCAA Division I Regionals — titles, seeding, strokes-gained, and
          underdog advances. Minimum {MIN_APPEARANCES_FOR_RATE} appearances on
          rate-based rankings.
        </p>
      </div>
      <Suspense fallback={<div className="h-8" />}>
        <RegionalsLeaderboardTabs
          men={men}
          women={women}
          minAppearances={MIN_APPEARANCES_FOR_RATE}
        />
      </Suspense>
      <p className="mt-6 text-[11px] text-text-tertiary">
        Source: aggregated Regional tournament history. Raw dataset is private;
        only derived per-team summaries are shown here.
      </p>
    </div>
  );
}
