import type { Metadata } from "next";
import type { Gender } from "@/data/records-types";
import { rankingsMen } from "@/data/rankings-men";
import { rankingsWomen } from "@/data/rankings-women";
import { allTeamsMen2026 } from "@/data/all-teams-men-2026";
import { allTeamsWomen2026 } from "@/data/all-teams-women-2026";
import {
  computeAllTeamStats,
  computeAllChampionshipStats,
} from "@/lib/streaks";
import { slugify } from "@/lib/team-slug";
import TeamsIndex, { type TeamsIndexRow } from "@/components/teams-index";

export const metadata: Metadata = {
  title: "All NCAA D1 Golf Programs — College Golf Data",
  description:
    "Browse every NCAA Division I men's and women's golf program. Current-season rank, regional appearances, regional wins, and conference — one click to the team page.",
  alternates: { canonical: "/teams" },
};

function buildRows(gender: Gender): TeamsIndexRow[] {
  const rankings = gender === "men" ? rankingsMen : rankingsWomen;
  const allTeams = gender === "men" ? allTeamsMen2026 : allTeamsWomen2026;

  const byTeam = new Map<string, TeamsIndexRow>();

  for (const t of rankings) {
    byTeam.set(t.team, {
      team: t.team,
      slug: slugify(t.team),
      rank: t.rank,
      conference: t.conference,
      wins: t.wins,
      losses: t.losses,
      ties: t.ties,
      eligible: t.eligible,
      isAutoQualifier: t.isAutoQualifier,
      apps: 0,
      ncaaApps: 0,
      regionalWins: 0,
      bestFinish: null,
    });
  }
  for (const t of allTeams) {
    if (!byTeam.has(t.team)) {
      byTeam.set(t.team, {
        team: t.team,
        slug: slugify(t.team),
        rank: t.rank,
        conference: t.conference,
        wins: t.wins,
        losses: t.losses,
        ties: t.ties,
        eligible: t.eligible,
        isAutoQualifier: t.isAutoQualifier,
        apps: 0,
        ncaaApps: 0,
        regionalWins: 0,
        bestFinish: null,
      });
    }
  }

  const stats = computeAllTeamStats().filter((s) => s.gender === gender);
  for (const s of stats) {
    const row = byTeam.get(s.team);
    if (!row) continue;
    row.apps = s.totalAppearances;
    row.regionalWins = s.regionalWins;
    row.bestFinish = s.bestFinish;
  }

  // NCAA Championship appearances — same source as the Team page's
  // "NCAA apps" stat card (championships-history.json), so the two
  // numbers always agree.
  const champStats = computeAllChampionshipStats().filter(
    (s) => s.gender === gender
  );
  for (const s of champStats) {
    const row = byTeam.get(s.team);
    if (!row) continue;
    row.ncaaApps = s.appearances;
  }

  return [...byTeam.values()].sort((a, b) => a.rank - b.rank);
}

export default function TeamsIndexPage() {
  const menRows = buildRows("men");
  const womenRows = buildRows("women");

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
      <div className="mb-6">
        <h1 className="font-serif text-3xl sm:text-4xl tracking-tight text-foreground">
          All D1 golf programs
        </h1>
        <p className="mt-2 text-[13px] text-muted-foreground max-w-2xl">
          {menRows.length} men&apos;s · {womenRows.length} women&apos;s · every
          program with a 2025-26 ranking or roster on file. Each links to its
          own page with regional history, projected seeding, record-book
          excerpts, and upcoming conference championship.
        </p>
      </div>
      <TeamsIndex menRows={menRows} womenRows={womenRows} />
    </div>
  );
}
