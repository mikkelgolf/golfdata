import { Suspense } from "react";
import ScurveTable from "@/components/scurve-table";
import { MapSkeleton, FilterBarSkeleton } from "@/components/skeletons";
import { allTeamsMen2026 } from "@/data/all-teams-men-2026";
import { regionalsMen2026 } from "@/data/regionals-men-2026";
import { allTeamsWomen2026 } from "@/data/all-teams-women-2026";
import { regionalsWomen2026 } from "@/data/regionals-women-2026";
import { rankingsMen } from "@/data/rankings-men";
import { rankingsWomen } from "@/data/rankings-women";
import type { TeamData } from "@/data/rankings-men";

function enrichWithAwp(allTeams: TeamData[], rankings: TeamData[]): TeamData[] {
  const awp = new Map<string, number>();
  for (const r of rankings) {
    if (r.avgPoints != null) awp.set(r.team, r.avgPoints);
  }
  return allTeams.map((t) => (awp.has(t.team) ? { ...t, avgPoints: awp.get(t.team) } : t));
}

const LAST_UPDATED = "Apr 13, 2026";

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
