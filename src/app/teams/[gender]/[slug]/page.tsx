import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { allSlugs, unslugify } from "@/lib/team-slug";
import {
  computeTeamChampionshipStats,
  computeTeamStats,
  isCancelled,
  isChampion,
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
import { championshipsHistory } from "@/data/championships-history";
import { recordsMen } from "@/data/records-men";
import { recordsWomen } from "@/data/records-women";

import { StatCard } from "@/components/stat-card";
import { ConferenceBadge } from "@/components/conference-badge";
import RegionalTimeline from "@/components/team-page/regional-timeline";
import NationalTimeline, {
  type NationalYearResult,
} from "@/components/team-page/national-timeline";
import UpcomingEvent from "@/components/team-page/upcoming-event";
import RelatedTeams from "@/components/team-page/related-teams";
import { type NcaaYearResult } from "@/components/team-page/program-arc";
import InteractiveProgramArc from "@/components/team-page/interactive-program-arc";
import TeamMap from "@/components/team-page/team-map";
import TeamTravelBeeswarm from "@/components/team-page/team-travel-beeswarm";
import TeamMonogram from "@/components/team-page/team-monogram";
import {
  AnimatedSection,
} from "@/components/team-page/animated-section";
import { AnimatedNumber } from "@/components/animated-number";
import { getTeamPercentiles } from "@/lib/percentiles";
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
  return (
    rankings.find((t) => t.team === team) ??
    allTeams.find((t) => t.team === team) ??
    null
  );
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

function findConferencePeers(
  conference: string,
  gender: Gender
): TeamData[] {
  if (!conference) return [];
  const rankings = gender === "men" ? rankingsMen : rankingsWomen;
  const allTeams = gender === "men" ? allTeamsMen2026 : allTeamsWomen2026;
  const seen = new Set<string>();
  const out: TeamData[] = [];
  for (const t of [...rankings, ...allTeams]) {
    if (t.conference !== conference) continue;
    if (seen.has(t.team)) continue;
    seen.add(t.team);
    out.push(t);
  }
  return out.sort((a, b) => a.rank - b.rank);
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
  const conferencePeers = record ? findConferencePeers(record.conference, gender) : [];
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

  const historyByYear = new Map(history.map((r) => [r.year, r]));
  const minYear = history.length > 0 ? history[history.length - 1].year : MOST_RECENT_SEASON;
  const maxYear = MOST_RECENT_SEASON;
  const timelineResults: Array<{
    year: number;
    position: string;
    advanced: boolean;
    missed?: boolean;
    cancelled?: boolean;
  }> = [];
  for (let y = maxYear; y >= minYear; y--) {
    const r = historyByYear.get(y);
    if (r) {
      timelineResults.push({ year: y, position: r.position, advanced: r.advanced });
    } else if (isCancelled(y)) {
      timelineResults.push({ year: y, position: "—", advanced: false, cancelled: true });
    } else {
      timelineResults.push({ year: y, position: "--", advanced: false, missed: true });
    }
  }

  // NCAA Championship history for this team, sorted newest-first to match the
  // regional timeline.
  const ncaaHistory = championshipsHistory
    .filter((r) => r.team === team && r.gender === gender)
    .sort((a, b) => b.year - a.year);
  const ncaaByYear = new Map(ncaaHistory.map((r) => [r.year, r]));
  const championshipStats = computeTeamChampionshipStats(team, gender);

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

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

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
          <div className="flex items-center gap-2 text-[10px] flex-wrap ml-auto">
            {record?.conference && <ConferenceBadge conference={record.conference} size="sm" />}
            <span className="text-text-tertiary uppercase tracking-wider">
              {label} · 2025-26
            </span>
          </div>
        </div>
      </AnimatedSection>

      {/* Current season — single bordered row, cells separated by hairlines. */}
      <div className="mt-3 rounded-lg border border-border/60 overflow-hidden bg-card/30">
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
                ? `Seed #${myAssignment.seed} · ${posInRegional ?? "?"} in regional`
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
            {record && myAssignment && myRegional ? (
              <TeamMap
                team={record}
                assignment={myAssignment}
                regional={myRegional}
                regionals={regionals}
                conferencePeers={conferencePeers}
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

      {/* Upcoming conference event */}
      {championship && (
        <section className="mt-5">
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
            Upcoming conference championship
          </h2>
          <UpcomingEvent championship={championship} />
        </section>
      )}

      {/* Historical stats — regional + NCAA merged into a single bordered 8-cell
          strip (2 rows × 4 cols). Streaks live inline with the relevant cells. */}
      <section className="mt-4">
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
          Program history <span className="font-normal normal-case text-text-tertiary/70">since 1989</span>
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

      {/* Year-by-year grids — regional + NCAA side-by-side on desktop. */}
      {timelineResults.length > 0 && (
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
          <section>
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
          {championshipStats.appearances > 0 && ncaaTimelineResults.length > 0 && (
            <section>
              <h2 className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
                Year-by-year NCAAs
              </h2>
              <NationalTimeline results={ncaaTimelineResults} />
            </section>
          )}
        </div>
      )}

      {/* Travel beeswarm — this team highlighted among all teams' predicted distances. */}
      {myAssignment && (
        <section className="mt-5">
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
            Travel distance across the field
          </h2>
          <TeamTravelBeeswarm
            assignments={assignments}
            regionals={regionals}
            highlightTeam={team}
          />
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

      {/* Related teams */}
      {record?.conference && (
        <RelatedTeams
          gender={gender}
          currentTeam={team}
          peers={conferencePeers}
        />
      )}

      {history.length === 0 && recordHits.length === 0 && (
        <section className="mt-8 rounded-lg border border-border bg-card/50 px-4 py-4 text-[12px] text-muted-foreground">
          No regional or record-book entries on file for {team} {label.toLowerCase()}{" "}
          yet. The program may be new to D1 or data is still being compiled.
        </section>
      )}

      <div className="mt-12 border-t border-border pt-4 text-[11px] text-text-tertiary">
        Current-season data from Clippd rankings · Regional history 1989–
        {MOST_RECENT_SEASON}.
      </div>
    </div>
  );
}
