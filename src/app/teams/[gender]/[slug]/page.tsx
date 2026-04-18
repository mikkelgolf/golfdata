import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { allSlugs, unslugify } from "@/lib/team-slug";
import {
  computeTeamStats,
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
import { recordsMen } from "@/data/records-men";
import { recordsWomen } from "@/data/records-women";

import { StatCard } from "@/components/stat-card";
import { ConferenceBadge } from "@/components/conference-badge";
import RegionalTimeline from "@/components/team-page/regional-timeline";
import UpcomingEvent from "@/components/team-page/upcoming-event";
import RelatedTeams from "@/components/team-page/related-teams";

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

  const timelineResults = history.map((r) => ({
    year: r.year,
    position: r.position,
    advanced: r.advanced,
  }));

  const recordBook = gender === "men" ? recordsMen : recordsWomen;
  const recordHits = findRecordMentions(team, recordBook);
  const clusteredHits = clusterBySection(recordHits);

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
      <section className="mt-4 rounded-xl border border-border bg-gradient-to-b from-card/90 to-card/40 px-5 py-6 sm:px-6 sm:py-7">
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
                #{ranking.rank}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Current season */}
      <section className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <StatCard
          label="Record"
          value={
            record
              ? `${record.wins}-${record.losses}${record.ties > 0 ? `-${record.ties}` : ""}`
              : "—"
          }
          animate={false}
          detail={record ? `${record.wins + record.losses + record.ties} meetings` : undefined}
        />
        <StatCard
          label="Field status"
          value={fieldStatusLabel}
          animate={false}
          accent={myAssignment?.isAutoQualifier ? "primary" : myAssignment ? "green" : "amber"}
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
        />
        <StatCard
          label="Travel distance"
          value={myAssignment ? `${Math.round(myAssignment.distanceMiles).toLocaleString()} mi` : "—"}
          animate={false}
        />
      </section>

      {/* Upcoming conference event */}
      {championship && (
        <section className="mt-8">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Upcoming conference championship
          </h2>
          <UpcomingEvent championship={championship} />
        </section>
      )}

      {/* Historical */}
      <section className="mt-8">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Historical record (since 1989)
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <StatCard
            label="Regional appearances"
            value={stats.totalAppearances}
            detail={`streak: ${formatStreak(stats.regionalStreak)}`}
            accent="green"
          />
          <StatCard
            label="National appearances"
            value={stats.totalAdvancements}
            detail={`streak: ${formatStreak(stats.nationalStreak)}`}
            accent="primary"
          />
          <StatCard
            label="Regional wins"
            value={stats.regionalWins}
            accent="amber"
          />
          <StatCard
            label="Best regional finish"
            value={stats.bestFinish ? `#${stats.bestFinish}` : "—"}
            animate={false}
          />
        </div>
      </section>

      {/* Year-by-year */}
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
          </p>
        </section>
      )}

      {/* Record book excerpts, clustered */}
      {clusteredHits.size > 0 && (
        <section className="mt-8">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            {team} in the record book
          </h2>
          <div className="space-y-3">
            {[...clusteredHits.entries()].map(([sectionTitle, items]) => (
              <div
                key={sectionTitle}
                className="rounded-lg border border-border bg-card px-4 py-3"
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
