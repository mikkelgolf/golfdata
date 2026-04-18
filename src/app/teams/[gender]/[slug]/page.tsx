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

interface RecordHit {
  group: string;
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
              group: group.title,
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
              group: group.title,
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
              group: group.title,
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
              group: group.title,
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
              group: group.title,
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
              group: group.title,
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

  // Compute S-curve assignment (if eligible)
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
  const years = [...new Set(history.map((r) => r.year))].sort((a, b) => b - a);

  const recordBook = gender === "men" ? recordsMen : recordsWomen;
  const recordHits = findRecordMentions(team, recordBook);

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

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <div className="flex items-center gap-2 text-[12px]">
        <Link
          href={gender === "men" ? "/records/men" : "/records/women"}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          ← {label} Record Book
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

      <h1 className="mt-4 font-serif text-3xl sm:text-4xl tracking-tight text-foreground">
        {team} {label} Golf
      </h1>
      {record?.conference && (
        <p className="mt-2 text-[13px] text-muted-foreground">
          {record.conference} · 2025-26 NCAA Division I
        </p>
      )}

      {/* Current season */}
      <section className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Current rank" value={ranking ? `#${ranking.rank}` : "—"} />
        <Stat
          label="Record"
          value={
            record
              ? `${record.wins}-${record.losses}${record.ties > 0 ? `-${record.ties}` : ""}`
              : "—"
          }
        />
        <Stat
          label="Field status"
          value={
            myAssignment
              ? myAssignment.isAutoQualifier
                ? "Projected AQ"
                : "Projected at-large"
              : record?.eligible === false
                ? "Sub-.500"
                : "Outside field"
          }
        />
        <Stat
          label="Projected regional"
          value={myRegional ? myRegional.name.replace(/ Regional$/, "") : "—"}
          detail={
            myAssignment
              ? `Seed #${myAssignment.seed} overall · ${posInRegional ?? "?"} in regional · ${Math.round(myAssignment.distanceMiles).toLocaleString()} mi`
              : undefined
          }
        />
      </section>

      {/* Upcoming conference event */}
      {championship && (
        <section className="mt-8">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Upcoming conference championship
          </h2>
          <div className="mt-2 rounded-lg border border-border bg-card px-4 py-3">
            <div className="text-[14px] font-medium text-foreground">
              {championship.name}
            </div>
            <div className="mt-1 text-[12px] text-muted-foreground">
              {championship.courseName} · {championship.city}
              {championship.state ? `, ${championship.state}` : ""}
            </div>
            <div className="mt-1 text-[12px] text-muted-foreground font-mono tabular-nums">
              {championship.startDate} → {championship.endDate}
            </div>
            {championship.winner && (
              <div className="mt-1 text-[12px] text-primary">
                Winner: {championship.winner}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Streaks + wins */}
      <section className="mt-8">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Historical record (since 1989)
        </h2>
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat
            label="Regional appearances"
            value={String(stats.totalAppearances)}
            detail={`streak: ${formatStreak(stats.regionalStreak)}`}
          />
          <Stat
            label="National appearances"
            value={String(stats.totalAdvancements)}
            detail={`streak: ${formatStreak(stats.nationalStreak)}`}
          />
          <Stat label="Regional wins" value={String(stats.regionalWins)} />
          <Stat
            label="Best regional finish"
            value={stats.bestFinish ? `#${stats.bestFinish}` : "—"}
          />
        </div>
      </section>

      {/* Year-by-year regional history */}
      {years.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Year-by-year regional finishes
          </h2>
          <div className="mt-2 grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-1.5">
            {years.map((y) => {
              const r = history.find((h) => h.year === y);
              if (!r) return null;
              return (
                <div
                  key={y}
                  className="rounded border border-border/40 bg-card px-1.5 py-1 text-center"
                >
                  <div className="text-[10px] text-muted-foreground font-mono tabular-nums">
                    {y}
                  </div>
                  <div className="text-[12px] font-mono tabular-nums">
                    <span
                      className={
                        r.advanced
                          ? "font-semibold text-foreground"
                          : "text-foreground/80"
                      }
                    >
                      {r.position}
                      {r.advanced ? (
                        <span
                          aria-hidden="true"
                          className="ml-0.5 inline-block h-[4px] w-[4px] rounded-full bg-primary/70 align-middle"
                        />
                      ) : null}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-text-tertiary">
            <span
              aria-hidden="true"
              className="mr-1 inline-block h-[4px] w-[4px] rounded-full bg-primary/70 align-middle"
            />
            = advanced to Nationals. Bold = position in regional.
          </p>
        </section>
      )}

      {/* Record book excerpts */}
      {recordHits.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {team} in the record book
          </h2>
          <div className="mt-2 rounded-lg border border-border bg-card divide-y divide-border/40">
            {recordHits.slice(0, 20).map((h, i) => (
              <div
                key={i}
                className="grid grid-cols-[80px_1fr_1fr] items-baseline gap-3 px-3 py-1.5 text-[12px]"
              >
                <span className="font-mono tabular-nums text-right text-foreground">
                  {h.value}
                </span>
                <span className="text-foreground truncate">{h.section}</span>
                <span className="text-muted-foreground truncate">{h.detail}</span>
              </div>
            ))}
            {recordHits.length > 20 && (
              <div className="px-3 py-2 text-[11px] text-muted-foreground">
                … {recordHits.length - 20} more entries.{" "}
                <Link
                  href={gender === "men" ? "/records/men" : "/records/women"}
                  className="underline-offset-4 hover:underline hover:text-foreground"
                >
                  Open the full record book
                </Link>
                .
              </div>
            )}
          </div>
        </section>
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

function Stat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
        {label}
      </div>
      <div className="mt-0.5 text-[15px] font-semibold text-foreground tabular-nums">
        {value}
      </div>
      {detail && (
        <div className="mt-0.5 text-[10px] text-muted-foreground font-mono tabular-nums truncate" title={detail}>
          {detail}
        </div>
      )}
    </div>
  );
}
