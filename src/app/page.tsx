import { Suspense } from "react";
import ScurveTable from "@/components/scurve-table";
import { MapSkeleton, FilterBarSkeleton } from "@/components/skeletons";
import { allTeamsMen2026 } from "@/data/all-teams-men-2026";
import { regionalsMen2026 } from "@/data/regionals-men-2026";
import { allTeamsWomen2026 } from "@/data/all-teams-women-2026";
import { regionalsWomen2026 } from "@/data/regionals-women-2026";
import { championshipsMen2026 } from "@/data/championships-men-2026";
import { championshipsWomen2026 } from "@/data/championships-women-2026";
import { actualMen2026 } from "@/data/regionals-actual-men-2026";
import { actualWomen2026 } from "@/data/regionals-actual-women-2026";
import type { TeamData } from "@/data/rankings-men";
import { loadActiveSnapshot } from "@/lib/rankings-archive";

// Regional Predictions consumes the rankings snapshot pinned in
// `src/data/active-rankings.json` (per gender). When a gender is
// unpinned, loadActiveSnapshot falls back to the latest archived
// snapshot — same behaviour as the pre-archive direct imports of
// `@/data/rankings-{men,women}`. Flip the pin via
// `scripts/set-active-rankings.ts`.
const menSnapshot = loadActiveSnapshot("men");
const womenSnapshot = loadActiveSnapshot("women");
const rankingsMen = menSnapshot.teams;
const rankingsWomen = womenSnapshot.teams;

// Team names in rankings-*.ts (sourced from Clippd) occasionally disagree with
// the canonical names in all-teams-*.ts. Normalize punctuation and fall back
// to an alias map so AWP still merges for schools like BYU, USF, UCF, and
// St Mary's (CA).
const AWP_NAME_ALIASES: Record<string, string> = {
  "byu": "brigham young",
  "south florida": "usf",
  "central florida": "ucf",
};

function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.'()&]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalKey(name: string): string {
  const n = normalizeTeamName(name);
  return AWP_NAME_ALIASES[n] ?? n;
}

function enrichWithAwp(allTeams: TeamData[], rankings: TeamData[]): TeamData[] {
  const awp = new Map<string, number>();
  for (const r of rankings) {
    if (r.avgPoints != null) awp.set(canonicalKey(r.team), r.avgPoints);
  }
  return allTeams.map((t) => {
    const pts = awp.get(canonicalKey(t.team));
    return pts != null ? { ...t, avgPoints: pts } : t;
  });
}

// Display date now comes from the active rankings snapshot for each
// gender. When men's and women's are pinned to the same date (or both
// flow to latest and refreshed on the same day), we show one date. When
// they differ — e.g. women frozen for regional predictions while men
// keeps tracking the latest — we show both, labelled.
function formatLastUpdated(isoDate: string, opts: { withYear?: boolean } = {}): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(opts.withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}
const LAST_UPDATED =
  menSnapshot.date === womenSnapshot.date
    ? formatLastUpdated(menSnapshot.date, { withYear: true })
    : `Men ${formatLastUpdated(menSnapshot.date)} · Women ${formatLastUpdated(womenSnapshot.date)}`;

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl px-3 sm:px-4 pt-2 sm:pt-4 pb-8">
      {/* Compact header */}
      <div className="mb-2 sm:mb-4 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
        <div>
          <h1 className="text-[15px] sm:text-lg font-semibold text-foreground leading-tight tracking-tight">
            NCAA D1 Regional Predictions
          </h1>
          <p className="hidden sm:block text-[12px] text-text-tertiary">
            Based on the official NCAA rankings &middot; Updated {LAST_UPDATED}
          </p>
        </div>
      </div>

      {/* S-Curve Table — split Suspense so map paints first */}
      <Suspense fallback={<HomeSkeleton />}>
        <ScurveTable
          menTeams={enrichWithAwp(allTeamsMen2026, rankingsMen)}
          womenTeams={enrichWithAwp(allTeamsWomen2026, rankingsWomen)}
          menRegionals={regionalsMen2026}
          womenRegionals={regionalsWomen2026}
          menChampionships={championshipsMen2026}
          womenChampionships={championshipsWomen2026}
          menActual={actualMen2026}
          womenActual={actualWomen2026}
          lastUpdated={LAST_UPDATED}
        />
      </Suspense>
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-4">
      <FilterBarSkeleton />
      <MapSkeleton />
    </div>
  );
}
