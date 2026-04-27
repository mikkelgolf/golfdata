import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { allSlugs, unslugify } from "@/lib/team-slug";
import {
  computeTeamChampionshipStats,
  computeTeamStats,
  isCancelled,
  isChampion,
  isRegionalWin,
  MOST_RECENT_SEASON,
  type StreakResult,
} from "@/lib/streaks";
import { computeScurve, computeRegionalPositions } from "@/lib/scurve";

import type { Gender, RecordBook } from "@/data/records-types";
import { rankingsMen, type TeamData } from "@/data/rankings-men";
import { rankingsWomen } from "@/data/rankings-women";
import { allTeamsMen2026 } from "@/data/all-teams-men-2026";
import { allTeamsWomen2026 } from "@/data/all-teams-women-2026";
import { championshipsMen2026 } from "@/data/championships-men-2026";
import { championshipsWomen2026 } from "@/data/championships-women-2026";
import { regionalsMen2026 } from "@/data/regionals-men-2026";
import { regionalsWomen2026 } from "@/data/regionals-women-2026";
import { regionalsHistory } from "@/data/regionals-history";
import { regionalsRich } from "@/data/regionals-rich";
import { championshipsHistory } from "@/data/championships-history";
import { recordsMen } from "@/data/records-men";
import { recordsWomen } from "@/data/records-women";

import { StatCard } from "@/components/stat-card";
import { ConferenceBadge } from "@/components/conference-badge";
import RegionalTimeline from "@/components/team-page/regional-timeline";
import RegionalPerformance from "@/components/team-page/regional-performance";
import NationalTimeline, {
  type NationalYearResult,
} from "@/components/team-page/national-timeline";
import UpcomingEvent from "@/components/team-page/upcoming-event";
import { type NcaaYearResult } from "@/components/team-page/program-arc";
import InteractiveProgramArc from "@/components/team-page/interactive-program-arc";
import TeamMap from "@/components/team-page/team-map";
import TeamMonogram from "@/components/team-page/team-monogram";
import {
  AnimatedSection,
} from "@/components/team-page/animated-section";
import { AnimatedNumber } from "@/components/animated-number";
import { getTeamPercentiles } from "@/lib/percentiles";
import {
  formatTzDelta,
  tzBandFromLatLng,
  tzDeltaHours,
} from "@/lib/timezone";
import { cn } from "@/lib/utils";

interface Params {
  gender: string;
  slug: string;
}

export async function generateStaticParams(): Promise<Params[]> {
  return [
    ...allSlugs("men").map((slug) => ({ gender: "men", slug })),
    ...allSlugs("women").map((slug) => ({ gender: "women", slug })),
  ];
}

function parseGender(g: string): Gender | null {
  if (g === "men" || g === "women") return g;
  return null;
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const gender = parseGender(params.gender);
  if (!gender) return { title: "Team not found" };
  const team = unslugify(params.slug, gender);
  if (!team) return { title: "Team not found" };
  const label = gender === "men" ? "Men's" : "Women's";
  const stats = computeTeamStats(team, gender);
  const conf = findTeam(team, gender)?.conference ?? "";
  const title = `${team} ${label} Golf — D1 Ranking, Regional History & Records`;
  const desc = [
    `${team} ${label.toLowerCase()} golf`,
    conf ? `${conf} conference` : "",
    stats.totalAppearances > 0
      ? `${stats.totalAppearances} NCAA regional appearances since 1989`
      : "",
    stats.regionalWins > 0 ? `${stats.regionalWins} regional wins` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    title,
    description: desc,
    openGraph: { title, description: desc, type: "website" },
    alternates: { canonical: `/teams/${gender}/${params.slug}` },
  };
}

function findTeam(team: string, gender: Gender): TeamData | null {
  const rankings = gender === "men" ? rankingsMen : rankingsWomen;
  const allTeams = gender === "men" ? allTeamsMen2026 : allTeamsWomen2026;
  const rankingsHit = rankings.find((t) => t.team === team) ?? null;
  const allTeamsHit = allTeams.find((t) => t.team === team) ?? null;
  if (!rankingsHit) return allTeamsHit;
  // Defensive: if the rankings row is missing coords but all-teams has them,
  // merge the coord fields. Keeps the team-page map from projecting (0, 0) if
  // rankings-*.ts is ever regenerated with zero-coord rows before the
  // all-teams backfill step runs. Both sources agree on every other field.
  if ((rankingsHit.lat === 0 && rankingsHit.lng === 0) && allTeamsHit) {
    return { ...rankingsHit, lat: allTeamsHit.lat, lng: allTeamsHit.lng };
  }
  return rankingsHit;
}

function findRanking(team: string, gender: Gender): TeamData | null {
  const rankings = gender === "men" ? rankingsMen : rankingsWomen;
  return rankings.find((t) => t.team === team) ?? null;
}

function findChampionship(conference: string, gender: Gender) {
  const source =
    gender === "men" ? championshipsMen2026 : championshipsWomen2026;
  return source.find((c) => c.conference === conference) ?? null;
}

interface RecordHit {
  section: string;
  value: string;
  detail?: string;
}

function findRecordMentions(team: string, book: RecordBook): RecordHit[] {
  const hits: RecordHit[] = [];
  for (const group of book.groups) {
    for (const section of group.sections) {
      if (section.kind === "stat") {
        for (const e of section.entries) {
          if (e.school === team) {
            hits.push({
              section: section.title,
              value: String(e.value),
              detail: `${e.player ?? ""}${e.years ? ` · ${e.years}` : ""}`.trim(),
            });
          }
        }
      } else if (section.kind === "coach") {
        for (const e of section.entries) {
          if (e.school === team) {
            hits.push({
              section: section.title,
              value: String(e.value),
              detail: `${e.coach}${e.years ? ` · ${e.years}` : ""}`,
            });
          }
        }
      } else if (section.kind === "tournament") {
        for (const e of section.entries) {
          if (e.school === team) {
            hits.push({
              section: section.title,
              value: e.value,
              detail: [e.player, e.event, e.date].filter(Boolean).join(" · "),
            });
          }
        }
      } else if (section.kind === "table") {
        for (const e of section.entries) {
          if (e.school === team) {
            hits.push({
              section: section.title,
              value: `${e.avg.toFixed(2)} avg`,
              detail: `${e.player ?? ""}${e.years ? ` · ${e.years}` : ""}${e.rounds ? ` · ${e.rounds} rounds` : ""}`.trim(),
            });
          }
        }
      } else if (section.kind === "award") {
        for (const e of section.entries) {
          if (e.school === team) {
            hits.push({
              section: section.title,
              value: e.year,
              detail: e.winner,
            });
          }
        }
      } else if (section.kind === "majors") {
        for (const e of section.entries) {
          if (e.school === team) {
            hits.push({
              section: section.title,
              value: String(e.count),
              detail: e.players,
            });
          }
        }
      }
    }
  }
  return hits;
}

function clusterBySection(hits: RecordHit[]): Map<string, RecordHit[]> {
  const m = new Map<string, RecordHit[]>();
  for (const h of hits) {
    const arr = m.get(h.section) ?? [];
    arr.push(h);
    m.set(h.section, arr);
  }
  return m;
}

function formatStreak(s: StreakResult): string {
  if (s.active > 0 && s.active === s.longest) {
    return `${s.active} (active, all-time longest)`;
  }
  if (s.active > 0) {
    return `${s.active} active · ${s.longest} longest`;
  }
  return s.longest > 0 ? `${s.longest} all-time longest` : "—";
}

export default function TeamPage({ params }: { params: Params }) {
  const gender = parseGender(params.gender);
  if (!gender) notFound();
  const team = unslugify(params.slug, gender);
  if (!team) notFound();

  const record = findTeam(team, gender);
  const ranking = findRanking(team, gender);
  const stats = computeTeamStats(team, gender);
  const championship = record ? findChampionship(record.conference, gender) : null;
  const label = gender === "men" ? "Men's" : "Women's";

  const allTeams = gender === "men" ? rankingsMen : rankingsWomen;
  const regionals = gender === "men" ? regionalsMen2026 : regionalsWomen2026;
  const championships =
    gender === "men" ? championshipsMen2026 : championshipsWomen2026;
  const assignments = computeScurve(
    allTeams,
    regionals,
    "committee",
    gender,
    championships
  );
  const myAssignment = assignments.find((a) => a.team === team);
  const posInRegional = computeRegionalPositions(assignments).get(team);
  const myRegional = myAssignment
    ? regionals.find((r) => r.id === myAssignment.regionalId)
    : null;

  const history = regionalsHistory
    .filter((r) => r.team === team && r.gender === gender)
    .sort((a, b) => b.year - a.year);

  // NCAA Championship history for this team, sorted newest-first to match the
  // regional timeline. Derived before the regional loop so we can cross-check
  // NCAA appearance when deciding whether a team actually advanced.
  const ncaaHistory = championshipsHistory
    .filter((r) => r.team === team && r.gender === gender)
    .sort((a, b) => b.year - a.year);
  const ncaaByYear = new Map(ncaaHistory.map((r) => [r.year, r]));

  const historyByYear = new Map(history.map((r) => [r.year, r]));
  const maxYear = MOST_RECENT_SEASON;
  // Anchor the grid to the gender-wide earliest regional year (1989 men,
  // 1993 women) for EVERY team — including teams with zero historical
  // appearances. This keeps the grid the same width across every team of a
  // given gender, so a program like Illinois women (first appearance 2002)
  // and a program like Southern Utah women (no historical appearances) both
  // render the full era. Pre-first-appearance years show as "missed" cells,
  // which honestly communicates the team's regional history. Mirrors the
  // NCAA timeline below, which already uses this pattern.
  const minYear = regionalsHistory
    .filter((r) => r.gender === gender)
    .reduce((min, r) => Math.min(min, r.year), maxYear);

  // Rich Regional stats (seed, SG, margin, titleCount) keyed by year for this
  // team. Women's sheet tab is currently empty, so this will be empty for women.
  const richByYear = new Map(
    regionalsRich
      .filter((r) => r.team === team && r.gender === gender)
      .map((r) => [r.year, r])
  );

  const timelineResults: Array<{
    year: number;
    position: string;
    advanced: boolean;
    missed?: boolean;
    cancelled?: boolean;
    win?: boolean;
    seed?: number | null;
    regional?: string | null;
    sgTotal?: number | null;
    margin?: number | null;
    titleCount?: number | null;
  }> = [];
  for (let y = maxYear; y >= minYear; y--) {
    const r = historyByYear.get(y);
    if (r) {
      const win = isRegionalWin(r.position);
      // If the team appeared at the NCAA Championship that year, they must
      // have advanced through the Regional — trust NCAA presence over the
      // regional row's `advanced` flag, which is unreliable in pre-modern
      // eras (e.g., Auburn men 1993-1995 have regional rows flagged
      // advanced:false despite showing up at Nationals).
      const advanced = r.advanced || ncaaByYear.has(y);
      const rich = richByYear.get(y);
      timelineResults.push({
        year: y,
        position: r.position,
        advanced,
        win,
        seed: rich?.seed ?? null,
        regional: rich?.regional ?? null,
        sgTotal: rich?.sgTotal ?? null,
        margin: rich?.margin ?? null,
        titleCount: rich?.titleCount ?? null,
      });
    } else if (isCancelled(y)) {
      timelineResults.push({ year: y, position: "—", advanced: false, cancelled: true });
    } else {
      timelineResults.push({ year: y, position: "--", advanced: false, missed: true });
    }
  }
  const championshipStats = computeTeamChampionshipStats(team, gender);

  // Derived Regional-performance stats from the rich sheet data. Computed
  // lazily so women's teams (no rich data yet) hit the empty-case path below.
  const richRows = Array.from(richByYear.values());
  const seededRich = richRows.filter((r) => r.seed != null);
  const avgSeed =
    seededRich.length > 0
      ? seededRich.reduce((s, r) => s + (r.seed as number), 0) / seededRich.length
      : null;
  const titlesFromRich = richRows.filter(
    (r) => r.finalPos === 1 || r.result === "1" || r.result === "T1"
  ).length;
  const totalRichAppearances = richRows.length;
  let bestSg: (typeof richRows)[number] | null = null;
  for (const r of richRows) {
    if (r.sgTotal == null) continue;
    if (bestSg == null || (r.sgTotal as number) > (bestSg.sgTotal as number)) {
      bestSg = r;
    }
  }
  // "Beat the seed" = finalPos strictly better (lower) than committee seed.
  const beatSeedCount = richRows.filter(
    (r) => r.seed != null && r.finalPos != null && (r.finalPos as number) < (r.seed as number)
  ).length;
  // "Advanced as underdog" = seed >= 5 AND the team actually appeared at NCAAs
  // that year (NCAA appearance is the reliable advance proxy per the existing
  // timeline logic).
  const underdogAdvanceCount = richRows.filter(
    (r) => r.seed != null && (r.seed as number) >= 5 && ncaaByYear.has(r.year)
  ).length;
  // Seed buckets for a small "seed breakdown" chip grid.
  const bucketDefs: Array<{ range: string; test: (s: number) => boolean }> = [
    { range: "1", test: (s) => s === 1 },
    { range: "2", test: (s) => s === 2 },
    { range: "3", test: (s) => s === 3 },
    { range: "4", test: (s) => s === 4 },
    { range: "5–8", test: (s) => s >= 5 && s <= 8 },
    { range: "9+", test: (s) => s >= 9 },
  ];
  const seedBuckets = bucketDefs.map((b) => {
    const matches = seededRich.filter((r) => b.test(r.seed as number));
    return {
      range: b.range,
      entries: matches.length,
      titles: matches.filter(
        (r) => r.finalPos === 1 || r.result === "1" || r.result === "T1"
      ).length,
      advanced: matches.filter((r) => ncaaByYear.has(r.year)).length,
    };
  });
  const hasRichData = richRows.length > 0;

  // NCAA timeline spans the full history of the championship for this gender
  // (men's from 1939, women's from 1982) rather than clipping to the regional
  // window — teams may have an NCAA appearance well before their regional
  // record starts. Upper bound still tracks the most recent season.
  const ncaaMinYear = championshipsHistory
    .filter((r) => r.gender === gender)
    .reduce((min, r) => Math.min(min, r.year), maxYear);
  const ncaaTimelineResults: NationalYearResult[] = [];
  for (let y = maxYear; y >= ncaaMinYear; y--) {
    const row = ncaaByYear.get(y);
    if (!row) {
      ncaaTimelineResults.push({
        year: y,
        position: "—",
        win: false,
        matchPlay: false,
        madeCut: false,
        missedCut: false,
        missed: !isCancelled(y),
        cancelled: isCancelled(y),
      });
    } else {
      const champion = isChampion(row);
      // Derive match-play round lost for non-champion qualifiers. Null for
      // champions (trophy shown instead), teams that didn't reach match play,
      // and pre-match-play-era years.
      let matchPlayResult: "qf" | "sf" | "r" | null = null;
      if (!champion && row.matchPlaySeed !== null) {
        if (row.wonSemifinal === true) matchPlayResult = "r";
        else if (row.wonQuarterfinal === true) matchPlayResult = "sf";
        else matchPlayResult = "qf";
      }
      ncaaTimelineResults.push({
        year: y,
        position: row.position,
        win: champion,
        matchPlay: row.matchPlaySeed !== null && !champion,
        madeCut: row.madeCut && row.matchPlaySeed === null,
        missedCut: !row.madeCut,
        missed: false,
        cancelled: false,
        matchPlayResult,
      });
    }
  }

  // Parallel series for ProgramArc overlay. Only populated when the team
  // has at least one NCAA appearance; otherwise the overlay isn't rendered.
  const ncaaArcSeries: NcaaYearResult[] = ncaaHistory.map((r) => ({
    year: r.year,
    positionNoTies: r.positionNoTies,
    appeared: true,
    position: r.position,
    win: isChampion(r),
    advanced: r.matchPlaySeed !== null,
    madeCut: r.madeCut,
  }));

  const recordBook = gender === "men" ? recordsMen : recordsWomen;
  const recordHits = findRecordMentions(team, recordBook);
  const clusteredHits = clusterBySection(recordHits);

  const percentiles = getTeamPercentiles(team, gender);

  const otherGenderSlug = params.slug;
  const otherGender: Gender = gender === "men" ? "women" : "men";
  const otherTeamExists = unslugify(otherGenderSlug, otherGender) !== null;

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SportsTeam",
    name: `${team} ${label} Golf`,
    sport: "Golf",
    memberOf: record?.conference ?? undefined,
    url: `https://collegegolfdata.com/teams/${gender}/${params.slug}`,
  };

  const fieldStatusLabel = myAssignment
    ? myAssignment.isAutoQualifier
      ? "Projected AQ"
      : "Projected at-large"
    : record?.eligible === false
      ? "Sub-.500"
      : "Outside field";

  // May/June timezone delta from campus → projected regional host. Shown
  // as small text under the Travel distance card. Null when either end
  // is missing coordinates (women's tabs, international, etc.).
  const tzDetail =
    record?.lat != null &&
    record?.lng != null &&
    myRegional?.lat != null &&
    myRegional?.lng != null
      ? formatTzDelta(
          tzDeltaHours(
            tzBandFromLatLng(record.lat, record.lng),
            tzBandFromLatLng(myRegional.lat, myRegional.lng)
          )
        )
      : undefined;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      {/* Sticky team header — breadcrumb + identity strip stay pinned below
          the global SiteHeader (sticky, h=var(--nav-height)=40px) while the
          rest of the page scrolls. z-40 sits just under the nav's z-50. */}
      <div className="sticky top-[var(--nav-height)] z-40 bg-background/80 backdrop-blur-xl backdrop-saturate-150 border-b border-border/40">
        <div className="mx-auto max-w-6xl px-4 py-3">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-[12px] flex-wrap">
            <Link
              href="/teams"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              ← All programs
            </Link>
            {otherTeamExists && (
              <>
                <span className="text-border">·</span>
                <Link
                  href={`/teams/${otherGender}/${otherGenderSlug}`}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Switch to {otherGender === "men" ? "men's" : "women's"} →
                </Link>
              </>
            )}
          </div>

          {/* Identity strip — compact single row: monogram + name + rank + conf + gender. */}
          <AnimatedSection className="mt-3 px-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <TeamMonogram team={team} size={36} />
              <div className="flex items-baseline flex-wrap gap-x-2.5 gap-y-0 min-w-0">
                <h1 className="text-[20px] sm:text-[22px] font-semibold tracking-tight text-foreground leading-tight truncate">
                  {team} {label} Golf
                </h1>
                {ranking && (
                  <span className="font-mono tabular-nums text-[15px] sm:text-[17px] text-text-tertiary leading-none">
                    #<AnimatedNumber value={ranking.rank} />
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[10px] flex-wrap w-full sm:w-auto sm:ml-auto">
                {record?.conference && <ConferenceBadge conference={record.conference} size="sm" />}
                <span className="text-text-tertiary uppercase tracking-wider">
                  {label} · 2025-26
                </span>
              </div>
            </div>
          </AnimatedSection>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 pt-4 pb-6 sm:pb-8">
        {/* Current season — single bordered row, cells separated by hairlines. */}
        <div className="rounded-lg border border-border/60 overflow-hidden bg-card/30">
          <div className="grid grid-cols-2 sm:grid-cols-4">
            <StatCard
              label="Record"
              value={
                record
                  ? `${record.wins}-${record.losses}${record.ties > 0 ? `-${record.ties}` : ""}`
                  : "—"
              }
              animate={false}
              detail={record ? `${record.wins + record.losses + record.ties} meetings` : undefined}
              className="border-r border-border/40 sm:border-r"
            />
            <StatCard
              label="Field status"
              value={fieldStatusLabel}
              animate={false}
              className="border-t sm:border-t-0 sm:border-r border-border/40"
            />
            <StatCard
              label="Projected regional"
              value={myRegional ? myRegional.name.replace(/ Regional$/, "") : "—"}
              animate={false}
              detail={
                myAssignment
                  ? `#${posInRegional ?? "?"} seed · #${myAssignment.seed} overall`
                  : undefined
              }
              className="border-t sm:border-t-0 border-r-0 sm:border-r border-border/40"
            />
            <StatCard
              label="Travel distance"
              value={
                myAssignment
                  ? `${Math.round(myAssignment.distanceMiles).toLocaleString()} mi`
                  : "—"
              }
              detail={myAssignment ? tzDetail : undefined}
              animate={false}
              className="border-t sm:border-t-0 border-border/40"
            />
          </div>
        </div>

        {/* Above-fold chart grid — program arc | mini-map side-by-side. */}
        {timelineResults.length > 0 && (
          <div className="mt-3 grid grid-cols-1 lg:grid-cols-12 gap-3">
            <section className="lg:col-span-7">
              <h2 className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
                Program arc
              </h2>
              <InteractiveProgramArc
                timeline={timelineResults}
                ncaaTimeline={ncaaArcSeries.length > 0 ? ncaaArcSeries : undefined}
              />
            </section>
            <section className="lg:col-span-5">
              <h2 className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
                Geography
              </h2>
              {record ? (
                <TeamMap
                  team={record}
                  assignment={myAssignment ?? undefined}
                  regional={myRegional ?? undefined}
                  regionals={regionals}
                  gender={gender}
                />
              ) : (
                <div className="rounded-lg border border-border/60 bg-card/30 min-h-[180px] flex items-center justify-center text-text-tertiary text-[11px]">
                  Location not available
                </div>
              )}
            </section>
          </div>
        )}

        {/* 2026 conference championship */}
        {championship && (
          <section className="mt-5">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
              2026 conference championship
            </h2>
            <UpcomingEvent championship={championship} gender={gender} />
          </section>
        )}

        {/* Historical stats — regional + NCAA merged into a single bordered 8-cell
            strip (2 rows × 4 cols). Streaks live inline with the relevant cells. */}
        <section className="mt-4">
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
            Program history
          </h2>
          <div className="rounded-lg border border-border/60 overflow-hidden bg-card/30">
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8">
              <StatCard
                label="Regional apps"
                value={stats.totalAppearances}
                detail={`streak: ${formatStreak(stats.regionalStreak)}`}
                percentile={percentiles?.apps}
                className="border-r border-border/40"
              />
              <StatCard
                label="Advanced"
                value={stats.totalAdvancements}
                detail={`streak: ${formatStreak(stats.nationalStreak)}`}
                percentile={percentiles?.nationals}
                className="border-r border-border/40"
              />
              <StatCard
                label="Regional wins"
                value={stats.regionalWins}
                percentile={percentiles?.regionalWins}
                className="border-r border-border/40"
              />
              <StatCard
                label="Best regional"
                value={stats.bestFinish ? `#${stats.bestFinish}` : "—"}
                animate={false}
                percentile={
                  stats.bestFinish !== null ? percentiles?.bestFinish : undefined
                }
                className="border-t sm:border-t-0 lg:border-r border-border/40"
              />
              <StatCard
                label="NCAA apps"
                value={championshipStats.appearances}
                detail={
                  championshipStats.appearances > 0
                    ? `streak: ${formatStreak(championshipStats.appearanceStreak)}`
                    : undefined
                }
                percentile={
                  championshipStats.appearances > 0 ? percentiles?.ncaaApps : undefined
                }
                className="border-t lg:border-t-0 sm:border-r border-border/40"
              />
              <StatCard
                label="NCAA wins"
                value={championshipStats.wins}
                percentile={
                  championshipStats.appearances > 0 ? percentiles?.ncaaWins : undefined
                }
                className="border-t lg:border-t-0 border-r border-border/40"
              />
              <StatCard
                label="NCAA best"
                value={
                  championshipStats.bestFinishLabel
                    ? championshipStats.bestFinishLabel
                    : championshipStats.bestFinish !== null
                      ? `#${championshipStats.bestFinish}`
                      : "—"
                }
                animate={false}
                percentile={
                  championshipStats.bestFinish !== null
                    ? percentiles?.ncaaBest
                    : undefined
                }
                className="border-t lg:border-t-0 sm:border-r border-border/40"
              />
              <StatCard
                label={championshipStats.topEight > 0 ? "MP berths" : "Match-play"}
                value={championshipStats.topEight}
                detail={
                  championshipStats.matchPlayWins > 0
                    ? `${championshipStats.matchPlayWins} MP wins`
                    : undefined
                }
                className="border-t lg:border-t-0 border-border/40"
              />
            </div>
          </div>
        </section>

        {/* Year-by-year regionals timeline. */}
        {timelineResults.length > 0 && (
          <section className="mt-5">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
              Year-by-year regionals
            </h2>
            <RegionalTimeline results={timelineResults} />
            <p className="mt-2 text-[11px] text-text-tertiary">
              <span
                aria-hidden="true"
                className="mr-1 inline-block h-[6px] w-[6px] rounded-sm bg-emerald-500/70 align-middle"
              />
              = advanced to Nationals.
              <span
                aria-hidden="true"
                className="ml-3 mr-1 inline-block h-[6px] w-[6px] rounded-sm bg-rose-500/70 align-middle"
              />
              = did not make Regionals.
            </p>
          </section>
        )}

        {/* Regional performance details — seed / SG / expected-vs-actual. */}
        {hasRichData && (
          <section className="mt-5">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
              Regional performance
            </h2>
            <RegionalPerformance
              titles={titlesFromRich}
              avgSeed={avgSeed}
              seededYears={seededRich.length}
              bestSgTotal={bestSg?.sgTotal ?? null}
              bestSgYear={bestSg?.year ?? null}
              bestSgRegional={bestSg?.regional ?? null}
              beatSeedCount={beatSeedCount}
              underdogAdvanceCount={underdogAdvanceCount}
              totalAppearances={totalRichAppearances}
              seedBuckets={seedBuckets}
            />
          </section>
        )}

        {/* Year-by-year NCAAs timeline. */}
        {timelineResults.length > 0 &&
          championshipStats.appearances > 0 &&
          ncaaTimelineResults.length > 0 && (
            <section className="mt-5">
              <h2 className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
                Year-by-year NCAAs
              </h2>
              <NationalTimeline results={ncaaTimelineResults} />
            </section>
          )}

        {/* Record book excerpts — flat sections, no per-card chrome. */}
        {clusteredHits.size > 0 && (
          <section className="mt-5">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
              {team} in the record book
            </h2>
            <div className="rounded-lg border border-border/60 overflow-hidden bg-card/30">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {[...clusteredHits.entries()].map(([sectionTitle, items], idx) => {
                  const colMod = idx % 3; // for 3-col borders on lg
                  const col2Mod = idx % 2; // for 2-col borders on md
                  return (
                    <div
                      key={sectionTitle}
                      className={cn(
                        "px-3 py-2 border-t border-border/40",
                        // Top-row dividers reset
                        idx === 0 && "border-t-0",
                        // 2-col: hide top border for 2nd row's first cell — actually
                        // simpler to just always render top border and accept the
                        // first row has one too on md+. Skip hairlining.
                        "md:border-l",
                        col2Mod === 0 && "md:border-l-0",
                        "lg:border-l",
                        colMod === 0 && "lg:border-l-0"
                      )}
                    >
                      <div className="flex items-baseline justify-between mb-1 gap-2">
                        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                          {sectionTitle}
                        </h3>
                        <span className="shrink-0 text-[9px] text-text-tertiary font-mono tabular-nums">
                          {items.length}
                        </span>
                      </div>
                      <div>
                        {items.map((h, i) => (
                          <div
                            key={i}
                            className="grid grid-cols-[56px_1fr] items-baseline gap-2 py-0.5 text-[11px]"
                          >
                            <span className="font-mono tabular-nums text-right text-foreground/90">
                              {h.value}
                            </span>
                            <span className="text-text-tertiary truncate" title={h.detail}>
                              {h.detail}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">
              <Link
                href={gender === "men" ? "/records/men" : "/records/women"}
                className="underline-offset-4 hover:underline hover:text-foreground"
              >
                Open the full {label.toLowerCase()} record book →
              </Link>
            </div>
          </section>
        )}

        {history.length === 0 && recordHits.length === 0 && (
          <section className="mt-8 rounded-lg border border-border bg-card/50 px-4 py-4 text-[12px] text-muted-foreground">
            No NCAA Regional appearances or record-book entries on file for{" "}
            {team} {label.toLowerCase()} yet. The program may be new to D1
            or data is still being compiled.
          </section>
        )}

        <div className="mt-12 border-t border-border pt-4 text-[11px] text-text-tertiary">
          Current-season data from NCAA rankings · Regional history 1989–
          {MOST_RECENT_SEASON}.
        </div>
      </div>
    </>
  );
}
