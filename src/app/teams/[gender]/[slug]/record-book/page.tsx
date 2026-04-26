import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import * as fs from "fs";
import * as path from "path";

interface LeaderRow {
  player_id: string;
  player_name: string;
  value: number;
  detail?: string;
  years?: string;
}

interface YearByYearRow {
  year: number;
  events_count: number;
  team_wins: number;
  best_team_finish: number | null;
  best_team_finish_event: string | null;
  individual_winners: { player_id: string; player_name: string; tournament: string }[];
}

interface RosterEntry {
  player_id: string | null;
  player_name: string;
  events_total: number;
  first_season: number | null;
  last_season: number | null;
  source?: "granular_master" | "school_pdf" | "both";
}

interface AAEntry {
  year: number;
  player: string;
  note?: string;
  tier?: string;
}

interface CoachEntry {
  name: string;
  years_raw: string;
  tenure_years: number | null;
}

interface SwcEntry {
  year: number;
  champion: string;
  medalist: string;
  tech_finish: number | null;
}

interface YearLocFinishEntry {
  year: number;
  location: string;
  finish: string;
  canceled?: boolean;
}

interface YearEntryRow {
  year: number | null;
  entry: string;
}

interface AllAmericanEntry {
  year: number;
  player: string;
  team: string;
  context: string;
}

interface RecordBookFile {
  school_slug: string;
  gender: "m" | "w";
  built_at: string;
  coverage_note: string;
  sections: {
    career_individual_records: {
      career_wins: LeaderRow[];
      career_top5s: LeaderRow[];
      career_top10s: LeaderRow[];
      career_events: LeaderRow[];
      career_scoring_avg: LeaderRow[];
      career_low_to_par: LeaderRow[];
    };
    single_season_records: {
      single_season_wins: LeaderRow[];
      single_season_top5s: LeaderRow[];
      single_season_top10s: LeaderRow[];
      single_season_events: LeaderRow[];
      single_season_scoring_avg: LeaderRow[];
    };
    tournament_records: {
      low_18_hole: LeaderRow[];
      low_36_hole: LeaderRow[];
      low_54_hole: LeaderRow[];
      low_72_hole: LeaderRow[];
      best_finish: LeaderRow[];
    };
    all_time_roster: RosterEntry[];
    year_by_year_team_results: YearByYearRow[];
    all_americans_from_ncaa_record_book: AllAmericanEntry[];
    all_americans_from_school_pdf?: AAEntry[];
    program_appearances: {
      ncaa_championships: { year: number; position: string | number; madeCut: boolean }[];
      ncaa_regionals: { year: number; position: string | number }[];
    };
    ncaa_regional_appearances_pdf?: YearLocFinishEntry[];
    ncaa_championships_appearances_pdf?: YearLocFinishEntry[];
    southwest_conference_championships?: SwcEntry[];
    coaching_history?: CoachEntry[] | { entries: unknown[]; needs_source: string };
    walker_cup?: YearEntryRow[];
    walker_cup_from_wikipedia?: { cup: string; year: number; player: string }[];
    palmer_cup?: YearEntryRow[];
    palmer_cup_from_wikipedia?: { cup: string; year: number; player: string }[];
    masters_appearances?: YearEntryRow[];
    major_amateur_titles?: YearEntryRow[];
    all_conference_selections: { entries: unknown[]; needs_source: string };
    hall_of_fame: { entries: unknown[]; needs_source: string };
    notable_pros: { name: string; raw_line?: string }[] | { entries: unknown[]; needs_source: string };
    conference_titles: { year: number; conference: string }[] | { entries: unknown[]; needs_source: string };
    ncaa_championships_from_wikipedia?: number[];
    ncaa_runner_up_from_wikipedia?: number[];
    ncaa_match_play_berths_from_wikipedia?: number[];
    individual_ncaa_champions?: { year: number; player: string }[];
    wikipedia_meta?: { title: string; url: string; scraped_at: string } | null;
  };
}

function isCoachArray(x: unknown): x is CoachEntry[] {
  return Array.isArray(x);
}

const TEAMS_DIR = path.join(process.cwd(), "src", "data", "teams");
const ALL_TEAMS_MEN = path.join(process.cwd(), "src", "data", "all-teams-men-2026.ts");
const ALL_TEAMS_WOMEN = path.join(process.cwd(), "src", "data", "all-teams-women-2026.ts");

function readRecordBook(slug: string, genderPath: "men" | "women"): RecordBookFile | null {
  const p = path.join(TEAMS_DIR, `${slug}-${genderPath}-record-book.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function readTeamName(slug: string, gender: "men" | "women"): string {
  const file = gender === "men" ? ALL_TEAMS_MEN : ALL_TEAMS_WOMEN;
  if (!fs.existsSync(file)) return slug;
  const src = fs.readFileSync(file, "utf-8");
  const re = /\{\s*rank:\s*\d+\s*,\s*team:\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const s = m[1].toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (s === slug) return m[1];
  }
  return slug;
}

export async function generateStaticParams(): Promise<{ gender: string; slug: string }[]> {
  if (!fs.existsSync(TEAMS_DIR)) return [];
  const files = fs.readdirSync(TEAMS_DIR).filter((f) => f.endsWith("-record-book.json"));
  return files.flatMap((f) => {
    const m = f.match(/^(.+)-(men|women)-record-book\.json$/);
    if (!m) return [];
    return [{ gender: m[2], slug: m[1] }];
  });
}

export async function generateMetadata({
  params,
}: {
  params: { gender: string; slug: string };
}): Promise<Metadata> {
  const g = params.gender === "men" || params.gender === "women" ? params.gender : null;
  if (!g) return { title: "Record book" };
  const team = readTeamName(params.slug, g);
  return {
    title: `${team} ${g === "men" ? "Men's" : "Women's"} Golf Record Book | College Golf Data`,
    description: `Complete program record book for ${team} ${g === "men" ? "Men's" : "Women's"} Golf — career, season, and tournament records.`,
  };
}

function fmtToPar(n: number): string {
  if (n === 0) return "E";
  return n > 0 ? `+${n}` : String(n);
}

function LeaderTable({ rows, valueLabel, valueFmt }: { rows: LeaderRow[]; valueLabel: string; valueFmt?: (n: number) => string }) {
  if (rows.length === 0)
    return <p className="text-[12px] text-text-tertiary">No qualifying entries in current data.</p>;
  return (
    <div className="overflow-x-auto rounded border border-border">
      <table className="w-full text-[12px]">
        <thead className="bg-card/50 text-left text-text-tertiary">
          <tr>
            <th className="px-3 py-2 font-medium">{valueLabel}</th>
            <th className="px-3 py-2 font-medium">Player</th>
            <th className="px-3 py-2 font-medium">Years</th>
            <th className="px-3 py-2 font-medium">Detail</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.player_id}-${i}`} className="border-t border-border">
              <td className="px-3 py-2 font-semibold tabular-nums">{valueFmt ? valueFmt(r.value) : r.value}</td>
              <td className="px-3 py-2">
                <Link href={`/players/${r.player_id}`} className="text-foreground hover:underline">
                  {r.player_name}
                </Link>
              </td>
              <td className="px-3 py-2 text-text-tertiary">{r.years || "—"}</td>
              <td className="px-3 py-2 text-text-tertiary">{r.detail || ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NeedsSource({ source }: { source: string }) {
  return (
    <p className="rounded border border-amber-300/40 bg-amber-50/40 px-3 py-2 text-[12px] text-amber-900/80">
      <span className="font-semibold">Pending source:</span> {source}
    </p>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-10 mb-3 text-[18px] font-semibold tracking-tight">{children}</h2>;
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-6 mb-2 text-[14px] font-semibold tracking-tight text-foreground/90">{children}</h3>;
}

export default function RecordBookPage({ params }: { params: { gender: string; slug: string } }) {
  const g = params.gender === "men" || params.gender === "women" ? (params.gender as "men" | "women") : null;
  if (!g) notFound();
  const rb = readRecordBook(params.slug, g);
  if (!rb) notFound();
  const teamName = readTeamName(params.slug, g);
  const s = rb.sections;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 print:max-w-none print:px-0 print:py-4">
      <header className="border-b border-border pb-5">
        <Link
          href={`/teams/${g}/${params.slug}`}
          className="text-[12px] text-blue-600 hover:underline"
        >
          ← {teamName} {g === "men" ? "Men's" : "Women's"} Golf
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {teamName} {g === "men" ? "Men's" : "Women's"} Golf — Record Book
        </h1>
        <p className="mt-2 text-[12px] text-text-tertiary">{rb.coverage_note}</p>
      </header>

      <H2>Career individual records</H2>
      <H3>Career wins</H3>
      <LeaderTable rows={s.career_individual_records.career_wins} valueLabel="Wins" />
      <H3>Career top-5 finishes</H3>
      <LeaderTable rows={s.career_individual_records.career_top5s} valueLabel="Top-5s" />
      <H3>Career top-10 finishes</H3>
      <LeaderTable rows={s.career_individual_records.career_top10s} valueLabel="Top-10s" />
      <H3>Career scoring average (relative to par)</H3>
      <LeaderTable
        rows={s.career_individual_records.career_scoring_avg}
        valueLabel="Avg"
        valueFmt={fmtToPar}
      />
      <H3>Most events played</H3>
      <LeaderTable rows={s.career_individual_records.career_events} valueLabel="Events" />

      <H2>Single-season records</H2>
      <H3>Wins in a season</H3>
      <LeaderTable rows={s.single_season_records.single_season_wins} valueLabel="Wins" />
      <H3>Top-5s in a season</H3>
      <LeaderTable rows={s.single_season_records.single_season_top5s} valueLabel="Top-5s" />
      <H3>Top-10s in a season</H3>
      <LeaderTable rows={s.single_season_records.single_season_top10s} valueLabel="Top-10s" />
      <H3>Lowest single-season scoring average</H3>
      <LeaderTable
        rows={s.single_season_records.single_season_scoring_avg}
        valueLabel="Avg"
        valueFmt={fmtToPar}
      />

      <H2>Tournament records</H2>
      <H3>Lowest 18-hole round</H3>
      <LeaderTable rows={s.tournament_records.low_18_hole} valueLabel="Score" />
      <H3>Lowest 36-hole total (to par)</H3>
      <LeaderTable rows={s.tournament_records.low_36_hole} valueLabel="To par" valueFmt={fmtToPar} />
      <H3>Lowest 54-hole total (to par)</H3>
      <LeaderTable rows={s.tournament_records.low_54_hole} valueLabel="To par" valueFmt={fmtToPar} />
      <H3>Lowest 72-hole total (to par)</H3>
      <LeaderTable rows={s.tournament_records.low_72_hole} valueLabel="To par" valueFmt={fmtToPar} />
      <H3>Best individual finishes</H3>
      <LeaderTable rows={s.tournament_records.best_finish} valueLabel="Pos" />

      {(s.ncaa_championships_from_wikipedia?.length ?? 0) > 0 && (
        <>
          <H2>NCAA Championships won</H2>
          <div className="text-[13px]">
            <p className="font-semibold">
              {s.ncaa_championships_from_wikipedia!.length} national title
              {s.ncaa_championships_from_wikipedia!.length === 1 ? "" : "s"}:
            </p>
            <p className="mt-1 text-text-tertiary">
              {s.ncaa_championships_from_wikipedia!.join(", ")}
            </p>
            {(s.ncaa_runner_up_from_wikipedia?.length ?? 0) > 0 && (
              <>
                <p className="mt-3 font-semibold">
                  {s.ncaa_runner_up_from_wikipedia!.length} runner-up finish
                  {s.ncaa_runner_up_from_wikipedia!.length === 1 ? "" : "es"}:
                </p>
                <p className="mt-1 text-text-tertiary">
                  {s.ncaa_runner_up_from_wikipedia!.join(", ")}
                </p>
              </>
            )}
            {(s.ncaa_match_play_berths_from_wikipedia?.length ?? 0) > 0 && (
              <>
                <p className="mt-3 font-semibold">
                  Match-play berths ({s.ncaa_match_play_berths_from_wikipedia!.length}):
                </p>
                <p className="mt-1 text-text-tertiary">
                  {s.ncaa_match_play_berths_from_wikipedia!.join(", ")}
                </p>
              </>
            )}
          </div>
        </>
      )}

      {(s.individual_ncaa_champions?.length ?? 0) > 0 && (
        <>
          <H2>Individual NCAA champions</H2>
          <div className="overflow-x-auto rounded border border-border">
            <table className="w-full text-[12px]">
              <thead className="bg-card/50 text-left text-text-tertiary">
                <tr>
                  <th className="px-3 py-2 font-medium">Year</th>
                  <th className="px-3 py-2 font-medium">Medalist</th>
                </tr>
              </thead>
              <tbody>
                {(s.individual_ncaa_champions ?? []).map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-3 py-2 tabular-nums font-medium">{r.year}</td>
                    <td className="px-3 py-2">{r.player}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <H2>NCAA Championship appearances (per David Tenneson&apos;s sheets)</H2>
      {s.program_appearances.ncaa_championships.length === 0 ? (
        <p className="text-[12px] text-text-tertiary">No appearances on file.</p>
      ) : (
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full text-[12px]">
            <thead className="bg-card/50 text-left text-text-tertiary">
              <tr>
                <th className="px-3 py-2 font-medium">Year</th>
                <th className="px-3 py-2 font-medium">Team finish</th>
                <th className="px-3 py-2 font-medium">Made cut</th>
              </tr>
            </thead>
            <tbody>
              {s.program_appearances.ncaa_championships.map((r) => (
                <tr key={r.year} className="border-t border-border">
                  <td className="px-3 py-2 tabular-nums">{r.year}</td>
                  <td className="px-3 py-2">{r.position}</td>
                  <td className="px-3 py-2 text-text-tertiary">{r.madeCut ? "Yes" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <H2>NCAA Regional history</H2>
      {s.program_appearances.ncaa_regionals.length === 0 ? (
        <p className="text-[12px] text-text-tertiary">No appearances on file.</p>
      ) : (
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full text-[12px]">
            <thead className="bg-card/50 text-left text-text-tertiary">
              <tr>
                <th className="px-3 py-2 font-medium">Year</th>
                <th className="px-3 py-2 font-medium">Team finish</th>
              </tr>
            </thead>
            <tbody>
              {s.program_appearances.ncaa_regionals.map((r) => (
                <tr key={r.year} className="border-t border-border">
                  <td className="px-3 py-2 tabular-nums">{r.year}</td>
                  <td className="px-3 py-2">{r.position}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <H2>All-Americans</H2>
      {(s.all_americans_from_school_pdf?.length ?? 0) > 0 ? (
        <>
          <p className="text-[12px] text-text-tertiary">From school media-guide PDF.</p>
          <div className="overflow-x-auto rounded border border-border mt-2">
            <table className="w-full text-[12px]">
              <thead className="bg-card/50 text-left text-text-tertiary">
                <tr>
                  <th className="px-3 py-2 font-medium">Year</th>
                  <th className="px-3 py-2 font-medium">Player</th>
                  <th className="px-3 py-2 font-medium">Tier</th>
                  <th className="px-3 py-2 font-medium">Note</th>
                </tr>
              </thead>
              <tbody>
                {(s.all_americans_from_school_pdf ?? []).map((a, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-3 py-2 tabular-nums">{a.year || "—"}</td>
                    <td className="px-3 py-2">{a.player}</td>
                    <td className="px-3 py-2 text-text-tertiary">
                      {a.tier === "first_team"
                        ? "1st team"
                        : a.tier === "second_team"
                        ? "2nd team"
                        : a.tier === "third_team"
                        ? "3rd team"
                        : a.tier === "honorable_mention"
                        ? "HM"
                        : a.tier ?? ""}
                    </td>
                    <td className="px-3 py-2 text-text-tertiary">{a.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : s.all_americans_from_ncaa_record_book.length > 0 ? (
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full text-[12px]">
            <thead className="bg-card/50 text-left text-text-tertiary">
              <tr>
                <th className="px-3 py-2 font-medium">Year</th>
                <th className="px-3 py-2 font-medium">Player</th>
                <th className="px-3 py-2 font-medium">Team</th>
                <th className="px-3 py-2 font-medium">Context</th>
              </tr>
            </thead>
            <tbody>
              {s.all_americans_from_ncaa_record_book.map((a, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-3 py-2 tabular-nums">{a.year || "—"}</td>
                  <td className="px-3 py-2">{a.player}</td>
                  <td className="px-3 py-2 text-text-tertiary">{a.team}</td>
                  <td className="px-3 py-2 text-text-tertiary">{a.context}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <NeedsSource source="GCAA All-American database + school media-guide PDF" />
      )}

      <H2>All-Conference selections</H2>
      <NeedsSource source={s.all_conference_selections.needs_source} />

      <H2>Conference championship history</H2>
      {Array.isArray(s.conference_titles) && s.conference_titles.length > 0 ? (
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full text-[12px]">
            <thead className="bg-card/50 text-left text-text-tertiary">
              <tr>
                <th className="px-3 py-2 font-medium">Year</th>
                <th className="px-3 py-2 font-medium">Conference</th>
              </tr>
            </thead>
            <tbody>
              {(s.conference_titles as { year: number; conference: string }[])
                .slice()
                .sort((a, b) => a.year - b.year)
                .map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-3 py-2 tabular-nums">{r.year}</td>
                    <td className="px-3 py-2">{r.conference || "—"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (s.southwest_conference_championships?.length ?? 0) > 0 ? (
        <>
          <p className="text-[12px] text-text-tertiary">
            Southwest Conference Championships (Texas Tech in SWC through 1996).
          </p>
          <div className="overflow-x-auto rounded border border-border mt-2">
            <table className="w-full text-[12px]">
              <thead className="bg-card/50 text-left text-text-tertiary">
                <tr>
                  <th className="px-3 py-2 font-medium">Year</th>
                  <th className="px-3 py-2 font-medium">Champion</th>
                  <th className="px-3 py-2 font-medium">Medalist</th>
                  <th className="px-3 py-2 font-medium">Tech finish</th>
                </tr>
              </thead>
              <tbody>
                {(s.southwest_conference_championships ?? []).map((r) => (
                  <tr key={r.year} className="border-t border-border">
                    <td className="px-3 py-2 tabular-nums">{r.year}</td>
                    <td className="px-3 py-2">{r.champion}</td>
                    <td className="px-3 py-2 text-text-tertiary">{r.medalist}</td>
                    <td className="px-3 py-2">{r.tech_finish ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <NeedsSource
          source={
            !Array.isArray(s.conference_titles)
              ? s.conference_titles.needs_source
              : "conference archive scraper"
          }
        />
      )}

      <H2>Walker Cup</H2>
      {(s.walker_cup_from_wikipedia?.length ?? 0) > 0 ? (
        <ul className="ml-5 list-disc text-[12px]">
          {(s.walker_cup_from_wikipedia ?? []).map((r, i) => (
            <li key={i}>
              {r.player} ({r.year})
            </li>
          ))}
        </ul>
      ) : (s.walker_cup?.length ?? 0) > 0 ? (
        <ul className="ml-5 list-disc text-[12px]">
          {(s.walker_cup ?? []).map((r, i) => (
            <li key={i}>
              {r.entry}
              {r.year ? ` (${r.year})` : ""}
            </li>
          ))}
        </ul>
      ) : (
        <NeedsSource source="USGA Walker Cup site / school media-guide PDF" />
      )}

      <H2>Palmer Cup</H2>
      {(s.palmer_cup_from_wikipedia?.length ?? 0) > 0 ? (
        <ul className="ml-5 list-disc text-[12px]">
          {(s.palmer_cup_from_wikipedia ?? []).map((r, i) => (
            <li key={i}>
              {r.player} ({r.year})
            </li>
          ))}
        </ul>
      ) : (s.palmer_cup?.length ?? 0) > 0 ? (
        <ul className="ml-5 list-disc text-[12px]">
          {(s.palmer_cup ?? []).map((r, i) => (
            <li key={i}>
              {r.entry}
              {r.year ? ` (${r.year})` : ""}
            </li>
          ))}
        </ul>
      ) : (
        <NeedsSource source="Palmer Cup site / school media-guide PDF" />
      )}

      <H2>Masters appearances</H2>
      {(s.masters_appearances?.length ?? 0) > 0 ? (
        <ul className="ml-5 list-disc text-[12px]">
          {(s.masters_appearances ?? []).map((r, i) => (
            <li key={i}>
              {r.entry}
              {r.year ? ` (${r.year})` : ""}
            </li>
          ))}
        </ul>
      ) : (
        <NeedsSource source="school media-guide PDF / Augusta National archive" />
      )}

      <H2>Major amateur titles</H2>
      {(s.major_amateur_titles?.length ?? 0) > 0 ? (
        <ul className="ml-5 list-disc text-[12px]">
          {(s.major_amateur_titles ?? []).map((r, i) => (
            <li key={i}>{r.entry}</li>
          ))}
        </ul>
      ) : (
        <NeedsSource source="school media-guide PDF / USGA + R&A archives" />
      )}

      <H2>Coaching history</H2>
      {isCoachArray(s.coaching_history) && s.coaching_history.length > 0 ? (
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full text-[12px]">
            <thead className="bg-card/50 text-left text-text-tertiary">
              <tr>
                <th className="px-3 py-2 font-medium">Coach</th>
                <th className="px-3 py-2 font-medium">Years</th>
                <th className="px-3 py-2 font-medium">Tenure</th>
              </tr>
            </thead>
            <tbody>
              {s.coaching_history.map((c, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{c.name}</td>
                  <td className="px-3 py-2 text-text-tertiary">{c.years_raw}</td>
                  <td className="px-3 py-2">{c.tenure_years ? `${c.tenure_years} yrs` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <NeedsSource source="school media-guide PDF" />
      )}

      <H2>Hall of Fame</H2>
      <NeedsSource source={s.hall_of_fame.needs_source} />

      <H2>Notable alumni in pro golf</H2>
      {Array.isArray(s.notable_pros) && s.notable_pros.length > 0 ? (
        <ul className="ml-5 list-disc text-[12px]">
          {(s.notable_pros as { name: string; raw_line?: string }[]).map((r, i) => (
            <li key={i}>{r.name}</li>
          ))}
        </ul>
      ) : (
        <NeedsSource source="DataGolf API / PGA Tour stats" />
      )}

      <H2>Year-by-year team results</H2>
      {s.year_by_year_team_results.length === 0 ? (
        <p className="text-[12px] text-text-tertiary">No seasons yet.</p>
      ) : (
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full text-[12px]">
            <thead className="bg-card/50 text-left text-text-tertiary">
              <tr>
                <th className="px-3 py-2 font-medium">Season</th>
                <th className="px-3 py-2 font-medium">Events</th>
                <th className="px-3 py-2 font-medium">Team wins</th>
                <th className="px-3 py-2 font-medium">Best team finish</th>
                <th className="px-3 py-2 font-medium">Individual wins</th>
              </tr>
            </thead>
            <tbody>
              {s.year_by_year_team_results.map((y) => (
                <tr key={y.year} className="border-t border-border">
                  <td className="px-3 py-2 tabular-nums font-medium">{y.year}</td>
                  <td className="px-3 py-2">{y.events_count}</td>
                  <td className="px-3 py-2">{y.team_wins}</td>
                  <td className="px-3 py-2">
                    {y.best_team_finish !== null
                      ? `${y.best_team_finish}${y.best_team_finish_event ? ` (${y.best_team_finish_event})` : ""}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-text-tertiary">
                    {y.individual_winners.length === 0
                      ? "—"
                      : y.individual_winners.map((w, i) => (
                          <span key={`${w.player_id}-${i}`}>
                            {i > 0 ? "; " : ""}
                            <Link href={`/players/${w.player_id}`} className="hover:underline">
                              {w.player_name}
                            </Link>
                            {` (${w.tournament})`}
                          </span>
                        ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <H2>All-time roster</H2>
      <p className="text-[12px] text-text-tertiary">
        {s.all_time_roster.length} names — alphabetical. Linked names have a player profile;
        unlinked names are letterwinners whose career data is pre-2010 (BQ coverage starts there).
      </p>
      <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3 md:grid-cols-4 text-[12px]">
        {s.all_time_roster.map((p) => {
          const yearLabel =
            p.first_season && p.last_season
              ? p.first_season === p.last_season
                ? ` ’${String(p.first_season).slice(-2)}`
                : ` ’${String(p.first_season).slice(-2)}–’${String(p.last_season).slice(-2)}`
              : "";
          const tooltip = `${p.events_total} events${
            p.first_season ? `, ${p.first_season}–${p.last_season ?? p.first_season}` : ""
          }`;
          return p.player_id ? (
            <Link
              key={`${p.player_id}-${p.player_name}`}
              href={`/players/${p.player_id}`}
              className="hover:underline"
              title={tooltip}
            >
              {p.player_name}
              <span className="text-text-tertiary">{yearLabel}</span>
            </Link>
          ) : (
            <span
              key={`pdf-${p.player_name}`}
              className="text-text-tertiary"
              title={tooltip}
            >
              {p.player_name}
              <span>{yearLabel}</span>
            </span>
          );
        })}
      </div>

      <footer className="mt-12 border-t border-border pt-4 text-[11px] text-text-tertiary">
        Built {rb.built_at}. Sections marked with <em>Pending source</em> are intentionally empty
        until the corresponding source module lands. See{" "}
        <code>~/.claude/skills/team-deep-dive/SKILL.md</code> for the source roadmap.
      </footer>
    </main>
  );
}
