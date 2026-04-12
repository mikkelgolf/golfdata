import { Suspense } from "react";
import ScurveTable from "@/components/scurve-table";
import { MapSkeleton, FilterBarSkeleton } from "@/components/skeletons";
import { rankingsMen } from "@/data/rankings-men";
import { regionalsMen2026 } from "@/data/regionals-men-2026";
import { rankingsWomen } from "@/data/rankings-women";
import { regionalsWomen2026 } from "@/data/regionals-women-2026";

const LAST_UPDATED = "Apr 10, 2026";

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
          menTeams={rankingsMen}
          womenTeams={rankingsWomen}
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
