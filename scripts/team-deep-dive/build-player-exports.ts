/**
 * build-player-exports.ts — convert raw BQ careers + roster preview into
 * per-player JSON exports the Next.js /players/[id] route can read.
 *
 * Inputs:
 *   data/team-deep-dive/roster-preview-<slug>.json
 *   data/team-deep-dive/careers-<slug>.json
 *
 * Outputs:
 *   src/data/players/<player_id>.json   (one per player)
 *   src/data/players/index.json         (lookup table for the route)
 *
 * Player ID assignment is DETERMINISTIC and TEMPORARY for M1:
 *   player_id = sha1(normalized_name + ':' + first_school_slug).substring(0, 12)
 *
 * Once the real identity resolver lands (M1 milestone) this changes to a
 * ULID stored in cgd_graph.players. Until then, the deterministic hash
 * keeps URLs stable across re-runs while we have no central registry.
 *
 * Usage:
 *   npx tsx scripts/team-deep-dive/build-player-exports.ts texas-tech men
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { normalizeName } from "./lib/identity";

const REPO_ROOT = path.join(__dirname, "..", "..");
const TEAM_DD_DIR = path.join(REPO_ROOT, "data", "team-deep-dive");
const PLAYERS_OUT_DIR = path.join(REPO_ROOT, "src", "data", "players");
const ALL_TEAMS_MEN = path.join(REPO_ROOT, "src", "data", "all-teams-men-2026.ts");
const ALL_TEAMS_WOMEN = path.join(REPO_ROOT, "src", "data", "all-teams-women-2026.ts");

interface RosterMention {
  source: string;
  context: string;
  year?: number;
  detail?: string;
}

interface RosterCandidate {
  raw_name: string;
  normalized_name: string;
  mentions: RosterMention[];
  confidence: number;
}

interface RosterPreview {
  team_slug: string;
  team_name: string;
  gender: "m" | "w";
  candidate_count: number;
  candidates: RosterCandidate[];
  sources_consulted: string[];
  notes: string[];
  program_appearances: {
    regional_years: number[];
    championship_years: number[];
    regionals_rich_years: number[];
  };
}

interface CareerRow {
  raw_name: string;
  team: string;
  division: string;
  tournament_id: string | number;
  tournament: string;
  course: string | null;
  start_date: string | null;
  rounds: { round: number; rd_total: number | null; round_to_par: number | null }[];
  individual_position: string | number | null;
  team_position: string | number | null;
  total_to_par: number | null;
  sources: string;
}

interface PlayerEvent {
  tournament_id: string;
  tournament: string;
  course: string | null;
  start_date: string | null;
  season: number | null;
  rounds: { round: number; rd_total: number | null; round_to_par: number | null }[];
  individual_position: string | number | null;
  team_position: string | number | null;
  total_to_par: number | null;
  sources: string[];
}

interface SeasonAgg {
  season: number;
  events: number;
  best_finish: number | null;
  scoring_avg_to_par: number | null;
}

interface PlayerExport {
  player_id: string;
  raw_name: string;
  normalized_name: string;
  school_slug: string;
  school_name: string;
  gender: "m" | "w";
  primary_gender: "m" | "w" | null;
  contamination_score: number | null;
  built_at: string;
  identity_confidence: number;
  source_summary: string[];
  identity_notes: string[];
  career: {
    events_total: number;
    seasons: SeasonAgg[];
    events: PlayerEvent[];
  };
  record_book_mentions: { context: string; detail?: string }[];
}

interface PlayerIndexEntry {
  player_id: string;
  raw_name: string;
  normalized_name: string;
  school_slug: string;
  school_name: string;
  gender: "m" | "w";
  primary_gender: "m" | "w" | null;
  contamination_score: number | null;
  events_total: number;
  best_finish: number | null;
  first_season: number | null;
  last_season: number | null;
}

interface GenderStat {
  men_rows: number;
  women_rows: number;
  total_rows: number;
  primary_gender: "m" | "w";
  contamination_score: number;
}

function deterministicPlayerId(normalizedName: string, schoolSlug: string): string {
  return crypto
    .createHash("sha1")
    .update(`${normalizedName}:${schoolSlug}`)
    .digest("hex")
    .slice(0, 12);
}

function readAllTeamsTs(filePath: string): Map<string, string> {
  // team name → slug
  const src = fs.readFileSync(filePath, "utf-8");
  const m = new Map<string, string>();
  const re = /\{\s*rank:\s*\d+\s*,\s*team:\s*"([^"]+)"/g;
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(src)) !== null) {
    const team = mm[1];
    const slug = team
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    m.set(team, slug);
  }
  return m;
}

function seasonOf(isoDate: string | null): number | null {
  if (!isoDate) return null;
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return null;
  // Academic season: Aug→Jul. A start_date in 2024-09-15 belongs to season 2025.
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1; // 1..12
  return month >= 8 ? year + 1 : year;
}

function parsePosition(p: string | number | null): number | null {
  if (p === null || p === undefined) return null;
  if (typeof p === "number") return p;
  const m = String(p).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function aggregateSeasons(events: PlayerEvent[]): SeasonAgg[] {
  const buckets = new Map<number, PlayerEvent[]>();
  for (const e of events) {
    if (!e.season) continue;
    const arr = buckets.get(e.season) || [];
    arr.push(e);
    buckets.set(e.season, arr);
  }
  const seasons: SeasonAgg[] = [];
  for (const [season, arr] of buckets) {
    const finishes = arr.map((e) => parsePosition(e.individual_position)).filter((n): n is number => n !== null);
    const totals = arr.map((e) => e.total_to_par).filter((n): n is number => n !== null);
    seasons.push({
      season,
      events: arr.length,
      best_finish: finishes.length ? Math.min(...finishes) : null,
      scoring_avg_to_par: totals.length
        ? Number((totals.reduce((a, b) => a + b, 0) / totals.length).toFixed(2))
        : null,
    });
  }
  seasons.sort((a, b) => a.season - b.season);
  return seasons;
}

function bestFinishOverall(events: PlayerEvent[]): number | null {
  const finishes = events
    .map((e) => parsePosition(e.individual_position))
    .filter((n): n is number => n !== null);
  return finishes.length ? Math.min(...finishes) : null;
}

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.length < 2) {
    console.error("Usage: npx tsx scripts/team-deep-dive/build-player-exports.ts <slug> <men|women>");
    process.exit(1);
  }
  const slug = argv[0];
  const gender: "m" | "w" = argv[1] === "men" || argv[1] === "m" ? "m" : "w";

  const rosterPath = path.join(TEAM_DD_DIR, `roster-preview-${slug}-${gender}.json`);
  const careersPath = path.join(TEAM_DD_DIR, `careers-${slug}-${gender}.json`);
  if (!fs.existsSync(rosterPath)) {
    console.error(`Missing ${rosterPath} — run roster-discovery + roster-from-bq first.`);
    process.exit(1);
  }
  if (!fs.existsSync(careersPath)) {
    console.error(`Missing ${careersPath} — run careers-from-bq first.`);
    process.exit(1);
  }
  const roster: RosterPreview = JSON.parse(fs.readFileSync(rosterPath, "utf-8"));
  const careers: CareerRow[] = JSON.parse(fs.readFileSync(careersPath, "utf-8"));

  const genderStatsPath = path.join(TEAM_DD_DIR, `gender-stats-${slug}-${gender}.json`);
  const genderStats: Record<string, GenderStat> = fs.existsSync(genderStatsPath)
    ? JSON.parse(fs.readFileSync(genderStatsPath, "utf-8"))
    : {};

  // School media-guide PDF letterwinners — fold into roster as stub
  // candidates so every historical player gets a /players/[id] profile.
  const schoolPdfPath = path.join(TEAM_DD_DIR, `school-pdf-${slug}-${gender}.json`);
  interface SchoolPdfLetterwinner {
    raw_name: string;
    last_name: string;
    first_name: string;
    years_raw: string;
    first_year: number | null;
    last_year: number | null;
    is_current: boolean;
  }
  let schoolPdfLetterwinners: SchoolPdfLetterwinner[] = [];
  if (fs.existsSync(schoolPdfPath)) {
    const sp = JSON.parse(fs.readFileSync(schoolPdfPath, "utf-8"));
    schoolPdfLetterwinners = sp?.sections?.all_time_letterwinners ?? [];
  }
  // Index existing roster candidates by normalized name.
  const existingByNorm = new Map<string, RosterCandidate>();
  for (const c of roster.candidates) {
    existingByNorm.set(c.normalized_name, c);
  }
  let stubsAdded = 0;
  for (const lw of schoolPdfLetterwinners) {
    const norm = normalizeName(lw.raw_name);
    if (existingByNorm.has(norm)) {
      // Enrich existing candidate with PDF mention.
      existingByNorm.get(norm)!.mentions.push({
        source: "school_pdf",
        context: "school_media_guide / letterwinner",
        year: lw.first_year ?? undefined,
        detail: lw.years_raw,
      });
      continue;
    }
    roster.candidates.push({
      raw_name: lw.raw_name,
      normalized_name: norm,
      mentions: [
        {
          source: "school_pdf",
          context: "school_media_guide / letterwinner",
          year: lw.first_year ?? undefined,
          detail: lw.years_raw,
        },
      ],
      confidence: 0.7,
    });
    existingByNorm.set(norm, roster.candidates[roster.candidates.length - 1]);
    stubsAdded++;
  }
  if (stubsAdded > 0) {
    console.log(`[${slug}] +${stubsAdded} letterwinner stubs from school PDF`);
  }

  const teamMap = readAllTeamsTs(gender === "m" ? ALL_TEAMS_MEN : ALL_TEAMS_WOMEN);
  const schoolName = roster.team_name;
  const schoolSlug = teamMap.get(schoolName) || slug;

  // Index careers by normalized name.
  const careersByName = new Map<string, CareerRow[]>();
  for (const c of careers) {
    const key = normalizeName(c.raw_name);
    const arr = careersByName.get(key) || [];
    arr.push(c);
    careersByName.set(key, arr);
  }

  if (!fs.existsSync(PLAYERS_OUT_DIR)) fs.mkdirSync(PLAYERS_OUT_DIR, { recursive: true });

  const indexEntries: PlayerIndexEntry[] = [];
  let written = 0;

  for (const cand of roster.candidates) {
    const playerId = deterministicPlayerId(cand.normalized_name, schoolSlug);
    const careerRows = careersByName.get(cand.normalized_name) || [];

    const events: PlayerEvent[] = careerRows.map((c) => ({
      tournament_id: String(c.tournament_id),
      tournament: c.tournament,
      course: c.course,
      start_date: c.start_date,
      season: seasonOf(c.start_date),
      rounds: c.rounds || [],
      individual_position: c.individual_position,
      team_position: c.team_position,
      total_to_par: c.total_to_par,
      sources: (c.sources || "").split(",").map((s) => s.trim()).filter(Boolean),
    }));
    events.sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""));

    const seasons = aggregateSeasons(events);
    const bestFinish = bestFinishOverall(events);

    const recordBookMentions = cand.mentions
      .filter((m) => m.source === "ncaa_record_book" || m.source === "manual")
      .map((m) => ({ context: m.context, detail: m.detail }));

    const sources = new Set<string>();
    for (const m of cand.mentions) sources.add(m.source);
    for (const e of events) for (const s of e.sources) sources.add(s);

    const notes: string[] = [];
    // Pull school-PDF year range from mentions (set above when stub-folded).
    const pdfMention = cand.mentions.find((m) => m.source === "school_pdf");
    let pdfFirstYear: number | null = null;
    let pdfLastYear: number | null = null;
    if (pdfMention?.detail) {
      // detail is like "1985-89", "2019-current", "1973-76, 81-82"
      const m1 = pdfMention.detail.match(/(\d{4})/);
      if (m1) pdfFirstYear = parseInt(m1[1], 10);
      const m2 = pdfMention.detail.match(/(\d{4})\s*-\s*(\d{2,4}|current)/i);
      if (m2) {
        if (/current/i.test(m2[2])) pdfLastYear = 2026;
        else if (m2[2].length === 2) {
          const century = (parseInt(m2[1], 10) / 100 | 0) * 100;
          let v = century + parseInt(m2[2], 10);
          if (v < parseInt(m2[1], 10)) v += 100;
          pdfLastYear = v;
        } else pdfLastYear = parseInt(m2[2], 10);
      }
    }
    if (events.length === 0) {
      if (pdfMention) {
        notes.push(
          `Pre-2010 era letterwinner (${pdfMention.detail ?? "school PDF"}). Career-event data not yet ingested — pending GolfStat / NCAA.com / newspaper backfill.`,
        );
      } else {
        notes.push("No granular_master rows; record-book-only candidate.");
      }
    }
    if (cand.confidence < 0.7) notes.push("Low identity confidence; review queue candidate after resolver lands.");

    // Look up gender stats by raw name. The careers query returns the raw
    // BQ name (which may differ slightly from the candidate's raw_name),
    // so try both.
    const gs =
      genderStats[cand.raw_name] ||
      genderStats[careerRows[0]?.raw_name as string] ||
      null;
    const primary_gender: "m" | "w" | null = gs ? gs.primary_gender : null;
    const contamination_score: number | null = gs ? gs.contamination_score : null;
    if (gs && gs.primary_gender !== gender) {
      notes.push(
        `Cross-gender contamination: this name has more events under the opposite-gender's divisions globally (${gs.men_rows} men's, ${gs.women_rows} women's). Likely mis-attributed to this team.`
      );
    } else if (gs && gs.contamination_score > 0.15) {
      notes.push(
        `Source data has ${(gs.contamination_score * 100).toFixed(0)}% cross-gender row noise (${gs.men_rows} men's vs ${gs.women_rows} women's globally) — common for popular events scored under both brackets.`
      );
    }

    const exportObj: PlayerExport = {
      player_id: playerId,
      raw_name: cand.raw_name,
      normalized_name: cand.normalized_name,
      school_slug: schoolSlug,
      school_name: schoolName,
      gender,
      primary_gender,
      contamination_score,
      built_at: new Date().toISOString(),
      identity_confidence: cand.confidence,
      source_summary: Array.from(sources).sort(),
      identity_notes: notes,
      career: {
        events_total: events.length,
        seasons,
        events,
      },
      record_book_mentions: recordBookMentions,
    };

    const outPath = path.join(PLAYERS_OUT_DIR, `${playerId}.json`);
    fs.writeFileSync(outPath, JSON.stringify(exportObj, null, 2));
    written++;

    indexEntries.push({
      player_id: playerId,
      raw_name: cand.raw_name,
      normalized_name: cand.normalized_name,
      school_slug: schoolSlug,
      school_name: schoolName,
      gender,
      primary_gender,
      contamination_score,
      events_total: events.length,
      best_finish: bestFinish,
      first_season: seasons.length ? seasons[0].season : null,
      last_season: seasons.length ? seasons[seasons.length - 1].season : null,
    });
  }

  // Merge into existing index (other teams' entries should survive).
  const indexPath = path.join(PLAYERS_OUT_DIR, "index.json");
  let existing: PlayerIndexEntry[] = [];
  if (fs.existsSync(indexPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
    } catch {
      existing = [];
    }
  }
  // Drop any prior entries for this (school_slug, gender) before appending fresh.
  existing = existing.filter((e) => !(e.school_slug === schoolSlug && e.gender === gender));
  existing.push(...indexEntries);
  existing.sort((a, b) => a.normalized_name.localeCompare(b.normalized_name));
  fs.writeFileSync(indexPath, JSON.stringify(existing, null, 2));

  console.log(`Wrote ${written} player JSON files into ${PLAYERS_OUT_DIR}`);
  console.log(`Index now has ${existing.length} total entries`);
  console.log(`Sample player_id for top scorer:`);
  const top = indexEntries.sort((a, b) => b.events_total - a.events_total)[0];
  if (top) {
    console.log(`  ${top.player_id}  ${top.raw_name}  events=${top.events_total}  best=${top.best_finish}`);
    console.log(`  → src/data/players/${top.player_id}.json`);
    console.log(`  → /players/${top.player_id}`);
  }
}

main();
