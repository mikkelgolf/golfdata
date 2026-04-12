import { Suspense } from "react";
import ScurveTable from "@/components/scurve-table";
import { rankingsMen } from "@/data/rankings-men";
import { regionalsMen2026 } from "@/data/regionals-men-2026";
import { rankingsWomen } from "@/data/rankings-women";
import { regionalsWomen2026 } from "@/data/regionals-women-2026";

const LAST_UPDATED = "Apr 10, 2026";

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-4 pb-8">
      {/* Compact header */}
      <div className="mb-4 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
        <div>
          <h1 className="text-lg font-semibold text-foreground">
            NCAA D1 Regional Predictions
          </h1>
          <p className="text-[12px] text-text-tertiary">
            Based on the official NCAA rankings &middot; Updated {LAST_UPDATED}
          </p>
        </div>
      </div>

      {/* S-Curve Table */}
      <Suspense fallback={<TableSkeleton />}>
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

function TableSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-8 w-full rounded-md bg-secondary/50" />
      <div className="h-[400px] w-full rounded-lg bg-secondary/30" />
    </div>
  );
}
