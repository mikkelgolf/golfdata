import { Suspense } from "react";
import ScurveTable from "@/components/scurve-table";
import { MapSkeleton, FilterBarSkeleton } from "@/components/skeletons";
import { allTeamsMen2026, ALL_TEAMS_GENERATED_AT } from "@/data/all-teams-men-2026";
import { regionalsMen2026 } from "@/data/regionals-men-2026";
import { allTeamsWomen2026 } from "@/data/all-teams-women-2026";
import { regionalsWomen2026 } from "@/data/regionals-women-2026";
import { rankingsMen } from "@/data/rankings-men";
import { rankingsWomen } from "@/data/rankings-women";
import { championshipsMen2026 } from "@/data/championships-men-2026";
import { championshipsWomen2026 } from "@/data/championships-women-2026";
import { actualMen2026 } from "@/data/regionals-actual-men-2026";
import { actualWomen2026 } from "@/data/regionals-actual-women-2026";
import type { TeamData } from "@/data/rankings-men";

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

// Derive the display date from ALL_TEAMS_GENERATED_AT (populated from the
// Clippd JSON's `pulledAt` field by scripts/build-all-teams.mjs) so it stays
// in sync automatically after every rankings refresh.
function formatLastUpdated(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
const LAST_UPDATED = formatLastUpdated(ALL_TEAMS_GENERATED_AT);

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
