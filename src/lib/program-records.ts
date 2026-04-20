import type { Gender, RecordGroup, TeamAggregateEntry } from "@/data/records-types";
import { CANCELLED_YEARS, computeAllTeamStats, MOST_RECENT_SEASON } from "@/lib/streaks";
import { rankingsMen } from "@/data/rankings-men";
import { rankingsWomen } from "@/data/rankings-women";
import { allTeamsMen2026 } from "@/data/all-teams-men-2026";
import { allTeamsWomen2026 } from "@/data/all-teams-women-2026";

const PROGRAM_TOP_N = 25;

export function buildProgramRecordsGroup(gender: Gender): RecordGroup {
  const stats = computeAllTeamStats().filter((s) => s.gender === gender);

  const currentConfByTeam = new Map<string, string>();
  const rankingsSrc = gender === "men" ? rankingsMen : rankingsWomen;
  const allTeamsSrc = gender === "men" ? allTeamsMen2026 : allTeamsWomen2026;
  for (const t of rankingsSrc) currentConfByTeam.set(t.team, t.conference);
  for (const t of allTeamsSrc) {
    if (!currentConfByTeam.has(t.team)) currentConfByTeam.set(t.team, t.conference);
  }

  const activeStreak: TeamAggregateEntry[] = stats
    .filter((s) => s.regionalStreak.active > 0)
    .sort((a, b) =>
      b.regionalStreak.active - a.regionalStreak.active ||
      a.team.localeCompare(b.team)
    )
    .slice(0, PROGRAM_TOP_N)
    .map((s) => {
      // Walk backward from MOST_RECENT_SEASON skipping cancelled years to find
      // the actual start year of the active streak (so display matches the
      // count). Mirrors the consecutiveness logic in streaks.ts.
      let yearsBack = s.regionalStreak.active - 1;
      let startYear = MOST_RECENT_SEASON;
      while (yearsBack > 0) {
        startYear -= 1;
        if (!CANCELLED_YEARS.has(startYear)) yearsBack -= 1;
      }
      return {
        school: s.team,
        value: s.regionalStreak.active,
        detail:
          s.regionalStreak.active > 0 ? `since ${startYear}` : undefined,
      };
    });

  const nationalsStreak: TeamAggregateEntry[] = stats
    .filter((s) => s.nationalStreak.longest > 0)
    .sort((a, b) =>
      b.nationalStreak.longest - a.nationalStreak.longest ||
      a.team.localeCompare(b.team)
    )
    .slice(0, PROGRAM_TOP_N)
    .map((s) => ({
      school: s.team,
      value: s.nationalStreak.longest,
      detail: s.nationalStreak.longestSpan
        ? `${s.nationalStreak.longestSpan[0]}–${s.nationalStreak.longestSpan[1]}`
        : undefined,
    }));

  const regionalWins: TeamAggregateEntry[] = stats
    .filter((s) => s.regionalWins > 0)
    .sort((a, b) =>
      b.regionalWins - a.regionalWins || a.team.localeCompare(b.team)
    )
    .slice(0, PROGRAM_TOP_N)
    .map((s) => ({ school: s.team, value: s.regionalWins }));

  const currentConference: TeamAggregateEntry[] = [...currentConfByTeam.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([team, conf]) => ({ school: team, value: "", detail: conf }));

  return {
    slug: "program-records",
    title: "Program records",
    sections: [
      {
        kind: "team-aggregate",
        slug: "active-regional-streak",
        title: "Longest active regional streak",
        minQualifier: `consecutive years ending ${MOST_RECENT_SEASON}`,
        valueLabel: "years",
        entries: activeStreak,
      },
      {
        kind: "team-aggregate",
        slug: "longest-nationals-streak",
        title: "Longest nationals streak (all-time)",
        minQualifier: "consecutive years advanced to NCAA Championship",
        valueLabel: "years",
        entries: nationalsStreak,
      },
      {
        kind: "team-aggregate",
        slug: "most-regional-wins",
        title: "Most regional wins",
        minQualifier: `since 1989, 1st-place finishes`,
        valueLabel: "wins",
        entries: regionalWins,
      },
      {
        kind: "team-aggregate",
        slug: "current-conference",
        title: "Current conference",
        minQualifier: "2025-26 season (not historical)",
        valueLabel: "",
        searchable: true,
        entries: currentConference,
      },
    ],
  };
}
