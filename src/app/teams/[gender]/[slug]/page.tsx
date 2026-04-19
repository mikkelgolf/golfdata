import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { allSlugs, unslugify } from "@/lib/team-slug";
import {
  computeTeamChampionshipStats,
  computeTeamStats,
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
import ProgramArc, {
  type NcaaYearResult,
} from "@/components/team-page/program-arc";
import {
  AnimatedSection,
  StaggerGrid,
} from "@/components/team-page/animated-section";
import { AnimatedNumber } from "@/components/animated-number";
import { getTeamPercentiles } from "@/lib/percentiles";

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
  }> = [];
  for (let y = maxYear; y >= minYear; y--) {
    const r = historyByYear.get(y);
    if (r) {
      timelineResults.push({ year: y, position: r.position, advanced: r.advanced });
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

  // NCAA timeline spans the same year range as the regional timeline so the
  // two grids read side-by-side. Even if the NCAA span is narrower (e.g.,
  // women's only starts 1982), we still align to the regional window.
  const ncaaTimelineResults: NationalYearResult[] = [];
  for (let y = maxYear; y >= minYear; y--) {
    const row = ncaaByYear.get(y);
    if (!row) {
      ncaaTimelineResults.push({
        year: y,
        position: "—",
        win: false,
        matchPlay: false,
        madeCut: false,
        missedCut: false,
        missed: true,
      });
    } else {
      const champion = isChampion(row);
      ncaaTimelineResults.push({
        year: y,
        position: row.position,
        win: champion,
        matchPlay: row.matchPlaySeed !== null && !champion,
        madeCut: row.madeCut && row.matchPlaySeed === null,
        missedCut: !row.madeCut,
        missed: false,
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
    <div className="mx-auto max-w-4xl px-4 py-6 sm:py-10">
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
              {otherGender === "men" ? "Men's" : "Women's"} {team}
            </Link>
          </>
        )}
      </div>

      {/* Hero */}
      <AnimatedSection className="mt-4 ring-card shadow-raised px-5 py-6 sm:px-6 sm:py-7">
        <div className="flex items-center gap-2 text-[11px] flex-wrap">
          {record?.conference && <ConferenceBadge conference={record.conference} size="md" />}
          <span className="text-muted-foreground uppercase tracking-wider">
            {label} · 2025-26
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-3">
          <h1 className="font-serif text-3xl sm:text-4xl tracking-tight text-foreground">
            {team} {label} Golf
          </h1>
          {ranking && (
            <div className="flex items-baseline gap-2">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Rank
              </span>
              <span className="font-mono tabular-nums text-[32px] sm:text-[36px] font-semibold text-foreground leading-none">
                #<AnimatedNumber value={ranking.rank} />
              </span>
            </div>
          )}
        </div>
      </AnimatedSection>

      {/* Current season */}
      <StaggerGrid className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {[
          <StatCard
            key="record"
            label="Record"
            value={
              record
                ? `${record.wins}-${record.losses}${record.ties > 0 ? `-${record.ties}` : ""}`
                : "—"
            }
            animate={false}
            detail={record ? `${record.wins + record.losses + record.ties} meetings` : undefined}
          />,
          <StatCard
            key="field-status"
            label="Field status"
            value={fieldStatusLabel}
            animate={false}
            accent={myAssignment?.isAutoQualifier ? "primary" : myAssignment ? "green" : "amber"}
          />,
          <StatCard
            key="projected-regional"
            label="Projected regional"
            value={myRegional ? myRegional.name.replace(/ Regional$/, "") : "—"}
            animate={false}
            detail={
              myAssignment
                ? `Seed #${myAssignment.seed} · ${posInRegional ?? "?"} in regional`
                : undefined
            }
          />,
          <StatCard
            key="travel"
            label="Travel distance"
            value={
              myAssignment
                ? `${Math.round(myAssignment.distanceMiles).toLocaleString()} mi`
                : "—"
            }
            animate={false}
          />,
        ]}
      </StaggerGrid>

      {/* Program arc — best regional finish per year, with NCAA overlay */}
      {timelineResults.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Program arc
          </h2>
          <ProgramArc
            timeline={timelineResults}
            ncaaTimeline={ncaaArcSeries.length > 0 ? ncaaArcSeries : undefined}
          />
        </section>
      )}

      {/* Upcoming conference event */}
      {championship && (
        <section className="mt-8">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Upcoming conference championship
          </h2>
          <UpcomingEvent championship={championship} />
        </section>
      )}

      {/* Regional history — since 1989 */}
      <section className="mt-8">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Regional history (since 1989)
        </h2>
        <StaggerGrid className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {[
            <StatCard
              key="apps"
              label="Regional appearances"
              value={stats.totalAppearances}
              detail={`streak: ${formatStreak(stats.regionalStreak)}`}
              accent="green"
              percentile={percentiles?.apps}
            />,
            <StatCard
              key="nationals"
              label="Advanced to nationals"
              value={stats.totalAdvancements}
              detail={`streak: ${formatStreak(stats.nationalStreak)}`}
              accent="primary"
              percentile={percentiles?.nationals}
            />,
            <StatCard
              key="wins"
              label="Regional wins"
              value={stats.regionalWins}
              accent="amber"
              percentile={percentiles?.regionalWins}
            />,
            <StatCard
              key="best"
              label="Best regional finish"
              value={stats.bestFinish ? `#${stats.bestFinish}` : "—"}
              animate={false}
              percentile={
                stats.bestFinish !== null ? percentiles?.bestFinish : undefined
              }
            />,
          ]}
        </StaggerGrid>
      </section>

      {/* National championship history */}
      {championshipStats.appearances > 0 && (
        <section className="mt-6">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            National championship history
          </h2>
          <StaggerGrid className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            {[
              <StatCard
                key="ncaa-apps"
                label="NCAA appearances"
                value={championshipStats.appearances}
                detail={`streak: ${formatStreak(championshipStats.appearanceStreak)}`}
                accent="primary"
                percentile={percentiles?.ncaaApps}
              />,
              <StatCard
                key="ncaa-wins"
                label="NCAA wins"
                value={championshipStats.wins}
                accent="amber"
                percentile={percentiles?.ncaaWins}
              />,
              <StatCard
                key="ncaa-best"
                label="NCAA best finish"
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
              />,
              <StatCard
                key="ncaa-mp"
                label={
                  championshipStats.topEight > 0
                    ? "Top-8 match-play berths"
                    : "Match-play berths"
                }
                value={championshipStats.topEight}
                detail={
                  championshipStats.matchPlayWins > 0
                    ? `${championshipStats.matchPlayWins} match-play wins`
                    : undefined
                }
                accent="green"
              />,
            ]}
          </StaggerGrid>
        </section>
      )}

      {/* Year-by-year regionals */}
      {timelineResults.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Year-by-year regional finishes
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

      {/* Year-by-year NCAA championships — mirrors the regional grid shape */}
      {championshipStats.appearances > 0 && ncaaTimelineResults.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Year-by-year NCAAs
          </h2>
          <NationalTimeline results={ncaaTimelineResults} />
        </section>
      )}

      {/* Record book excerpts, clustered */}
      {clusteredHits.size > 0 && (
        <section className="mt-8">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            {team} in the record book
          </h2>
          <StaggerGrid className="space-y-3" staggerDelay={0.04} initialDelay={0.05}>
            {[...clusteredHits.entries()].map(([sectionTitle, items]) => (
              <div
                key={sectionTitle}
                className="ring-card shadow-flat hover:shadow-raised transition-shadow duration-150 ease-out px-4 py-3"
              >
                <div className="flex items-baseline justify-between mb-2 gap-3">
                  <h3 className="label-caps">{sectionTitle}</h3>
                  <span className="shrink-0 text-[10px] text-text-tertiary font-mono tabular-nums">
                    {items.length} {items.length === 1 ? "entry" : "entries"}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {items.map((h, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-[80px_1fr] items-baseline gap-3 py-0.5 text-[12px]"
                    >
                      <span className="font-mono tabular-nums text-right text-foreground">
                        {h.value}
                      </span>
                      <span className="text-muted-foreground truncate" title={h.detail}>
                        {h.detail}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </StaggerGrid>
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
