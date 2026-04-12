import { Suspense } from "react";
import type { Metadata } from "next";
import ChampionshipsView from "@/components/championships-view";
import { MapSkeleton, FilterBarSkeleton } from "@/components/skeletons";
import { rankingsMen } from "@/data/rankings-men";
import { rankingsWomen } from "@/data/rankings-women";
import { championshipsMen2026 } from "@/data/championships-men-2026";
import { championshipsWomen2026 } from "@/data/championships-women-2026";

const LAST_UPDATED = "Apr 12, 2026";

export const metadata: Metadata = {
  title: "Conference Championships - College Golf Data",
  description:
    "Every NCAA D1 men's and women's golf conference championship for 2026: venues, dates, fields, travel maps, and predicted automatic qualifiers.",
};

export default function ConferenceChampionshipsPage() {
  return (
    <div className="mx-auto max-w-6xl px-3 sm:px-4 pt-2 sm:pt-4 pb-8">
      <div className="mb-2 sm:mb-4">
        <h1 className="text-[15px] sm:text-lg font-semibold text-foreground leading-tight tracking-tight">
          NCAA D1 Conference Championships
        </h1>
        <p className="hidden sm:block text-[12px] text-text-tertiary">
          Venues, dates, fields, and travel for every D1 conference championship
          &middot; Updated {LAST_UPDATED}
        </p>
      </div>

      <Suspense fallback={<PageSkeleton />}>
        <ChampionshipsView
          menTeams={rankingsMen}
          womenTeams={rankingsWomen}
          menChampionships={championshipsMen2026}
          womenChampionships={championshipsWomen2026}
          lastUpdated={LAST_UPDATED}
        />
      </Suspense>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-4">
      <FilterBarSkeleton />
      <MapSkeleton />
    </div>
  );
}
