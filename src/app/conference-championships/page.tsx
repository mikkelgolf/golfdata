import { Suspense } from "react";
import type { Metadata } from "next";
import ChampionshipsView from "@/components/championships-view";
import { MapSkeleton, FilterBarSkeleton } from "@/components/skeletons";
import {
  allTeamsMen2026,
  ALL_TEAMS_GENERATED_AT,
} from "@/data/all-teams-men-2026";
import { allTeamsWomen2026 } from "@/data/all-teams-women-2026";
import { championshipsMen2026 } from "@/data/championships-men-2026";
import { championshipsWomen2026 } from "@/data/championships-women-2026";

function formatLastUpdated(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const LAST_UPDATED = formatLastUpdated(ALL_TEAMS_GENERATED_AT);

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
          menTeams={allTeamsMen2026}
          womenTeams={allTeamsWomen2026}
          menChampionships={championshipsMen2026}
          womenChampionships={championshipsWomen2026}
          lastUpdated={LAST_UPDATED}
          todayISO={new Date().toISOString().slice(0, 10)}
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
