/**
 * build-record-book.ts — aggregate every committed player JSON for a team
 * into the OK-State-style record-book sections.
 *
 * Pure compute: no scraping, no BQ. Reads:
 *   src/data/players/*.json  (filtered by school_slug + gender)
 *   src/data/events/*.json   (for team-level records)
 *   src/data/championships-history.json
 *   src/data/regionals-history.json
 *   src/data/records-men.json | records-women.json (NCAA-Record-Book All-Americans, etc.)
 *
 * Writes src/data/teams/<slug>-record-book.json with normalized record-book
 * sections that the /teams/<slug>/record-book route renders.
 *
 * Usage:
 *   npx tsx scripts/team-deep-dive/build-record-book.ts texas-tech men
 *   npx tsx scripts/team-deep-dive/build-record-book.ts --all
 */

import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = path.join(__dirname, "..", "..");
const PLAYERS_DIR = path.join(REPO_ROOT, "src", "data", "players");
const EVENTS_DIR = path.join(REPO_ROOT, "src", "data", "events");
const TEAMS_DIR = path.join(REPO_ROOT, "src", "data", "teams");
const TEAM_DD_DIR = path.join(REPO_ROOT, "data", "team-deep-dive");
const NCAA_RECORDS_MEN = path.join(REPO_ROOT, "src", "data", "records-men.json");
const NCAA_RECORDS_WOMEN = path.join(REPO_ROOT, "src", "data", "records-women.json");

interface SchoolPdfFile {
  school_slug: string;
  gender: "m" | "w";
  source_pdf: string;
  built_at: string;
  sections: {
    all_time_letterwinners: { raw_name: string; first_year: number | null; last_year: number | null; years_raw: string; is_current: boolean }[];
    head_coaches: { name: string; years_raw: string; tenure_years: number | null }[];
    all_americans: {
      first_team: { year: number; player: string; note?: string }[];
      second_team: { year: number; player: string; note?: string }[];
      third_team: { year: number; player: string; note?: string }[];
      honorable_mention: { year: number; player: string; note?: string }[];
    };
    ncaa_regional_appearances: { year: number; location: string; finish: string; canceled: boolean }[];
    ncaa_championships_appearances: { year: number; location: string; finish: string }[];
    southwest_conference_championships: { year: number; champion: string; medalist: string; tech_finish: number | null }[];
    walker_cup_appearances?: { year: number | null; entry: string }[];
    masters_appearances?: { year: number | null; entry: string }[];
    major_amateur_titles?: { year: number | null; entry: string }[];
    arnold_palmer_cup?: { year: number | null; entry: string }[];
    [key: string]: unknown;
  };
}

function readSchoolPdf(slug: string, gender: "m" | "w"): SchoolPdfFile | null {
  const p = path.join(TEAM_DD_DIR, `school-pdf-${slug}-${gender}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8")) as SchoolPdfFile;
}

interface WikipediaFile {
  school_slug: string;
  wikipedia_title: string;
  wikipedia_url: string;
  scraped_at: string;
  ncaa_championships: number[];
  ncaa_runner_up: number[];
  ncaa_match_play_berths: number[];
  ncaa_appearances_from_infobox: number[];
  individual_ncaa_champions: { year: number; player: string }[];
  conference_titles: { year: number; conference: string }[];
  notable_alumni: { name: string; raw_line?: string }[];
  head_coaches: { name: string; start_year: number; end_year: number | null; raw_line?: string }[];
  all_americans: { year: number; player: string; tier: string | null; raw?: string }[];
}

function readWikipedia(slug: string, gender: "m" | "w"): WikipediaFile | null {
  const p = path.join(TEAM_DD_DIR, `wikipedia-${slug}-${gender}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8")) as WikipediaFile;
}

interface CupAppearance {
  cup: string;
  year: number;
  team_country: string;
  player: string;
  school: string | null;
  source_url: string;
  scraped_at: string;
  notes?: string;
}

function readCupAppearances(): CupAppearance[] {
  const p = path.join(TEAM_DD_DIR, "cup-appearances.json");
  if (!fs.existsSync(p)) return [];
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function readPlayersForCupResolution(): { raw_name: string; school_slug: string }[] {
  const p = path.join(PLAYERS_DIR, "index.json");
  if (!fs.existsSync(p)) return [];
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function cupAppearancesForSlug(
  cupRows: CupAppearance[],
  slug: string,
  playerIndex: { raw_name: string; school_slug: string }[],
): { cup: string; year: number; player: string }[] {
  // Build name → set-of-school-slugs from the player index.
  const nameToSchools = new Map<string, Set<string>>();
  for (const p of playerIndex) {
    const lcName = p.raw_name.toLowerCase();
    if (!nameToSchools.has(lcName)) nameToSchools.set(lcName, new Set());
    nameToSchools.get(lcName)!.add(p.school_slug);
  }
  const out: { cup: string; year: number; player: string }[] = [];
  for (const r of cupRows) {
    // 1) Direct school annotation matches our slug (best signal).
    if (r.school) {
      const annotated = r.school.toLowerCase();
      if (annotated.includes(slug.replace(/-/g, " "))) {
        out.push({ cup: r.cup, year: r.year, player: r.player });
        continue;
      }
    }
    // 2) Player resolves uniquely to our school via the index.
    const schools = nameToSchools.get(r.player.toLowerCase());
    if (schools && schools.size === 1 && schools.has(slug)) {
      out.push({ cup: r.cup, year: r.year, player: r.player });
    }
  }
  out.sort((a, b) => a.year - b.year || a.player.localeCompare(b.player));
  return out;
}

interface RoundDetail {
  round: number;
  rd_total: number | null;
  round_to_par: number | null;
}

interface PlayerEvent {
  tournament_id: string;
  tournament: string;
  course: string | null;
  start_date: string | null;
  season: number | null;
  rounds: RoundDetail[];
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
  career: { events_total: number; seasons: SeasonAgg[]; events: PlayerEvent[] };
  record_book_mentions: { context: string; detail?: string }[];
}

interface PlayerIndexEntry {
  player_id: string;
  raw_name: string;
  school_slug: string;
  gender: "m" | "w";
  primary_gender?: "m" | "w" | null;
  events_total: number;
}

interface RecordEntry {
  value?: number | string | null;
  player?: string;
  school?: string;
  years?: string;
}

interface RecordSection {
  kind: string;
  slug: string;
  title: string;
  entries: RecordEntry[];
}

interface RecordGroup {
  slug: string;
  title: string;
  sections: RecordSection[];
}

interface RecordsFile {
  groups: RecordGroup[];
}

interface AppearanceRow {
  team: string;
  gender: string;
  year: number;
  position?: string | number;
  positionNoTies?: number | null;
  madeCut?: boolean;
}

// --- helpers ---

function parsePos(p: string | number | null | undefined): number | null {
  if (p === null || p === undefined || p === "") return null;
  if (typeof p === "number") return p;
  const m = String(p).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function fmtRange(years: number[]): string {
  if (years.length === 0) return "";
  const sorted = [...new Set(years)].sort((a, b) => a - b);
  if (sorted.length === 1) return String(sorted[0]);
  return `${sorted[0]}–${sorted[sorted.length - 1]}`;
}

function readPlayers(slug: string, gender: "m" | "w"): PlayerExport[] {
  const indexPath = path.join(PLAYERS_DIR, "index.json");
  if (!fs.existsSync(indexPath)) return [];
  const idx: PlayerIndexEntry[] = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
  const out: PlayerExport[] = [];
  for (const e of idx) {
    if (e.school_slug !== slug || e.gender !== gender) continue;
    if (e.primary_gender && e.primary_gender !== gender) continue;
    const p = path.join(PLAYERS_DIR, `${e.player_id}.json`);
    if (!fs.existsSync(p)) continue;
    out.push(JSON.parse(fs.readFileSync(p, "utf-8")));
  }
  return out;
}

interface SchoolAlias {
  slug: string;
  aliases: string[];
}

const SCHOOL_ALIAS_MAP: Record<string, string[]> = {
  "texas-tech": ["Texas Tech"],
  "oklahoma-state": ["Oklahoma State"],
  "north-carolina": ["North Carolina"],
  "north-carolina-state": ["NC State"],
  "ucla": ["UCLA"],
  "byu": ["BYU"],
  "ole-miss": ["Ole Miss"],
  "lsu": ["LSU"],
  "auburn": ["Auburn"],
  "vanderbilt": ["Vanderbilt"],
  "stanford": ["Stanford"],
  "texas": ["Texas"],
  "alabama": ["Alabama"],
  "arkansas": ["Arkansas"],
  "arizona-state": ["Arizona State"],
  "georgia": ["Georgia"],
  "illinois": ["Illinois"],
};

function aliasesForSlug(slug: string): string[] {
  return SCHOOL_ALIAS_MAP[slug] || [];
}

// --- aggregations ---

interface LeaderRow {
  player_id: string;
  player_name: string;
  value: number;
  detail?: string;
  years?: string;
}

interface CareerLeaders {
  career_wins: LeaderRow[];
  career_top5s: LeaderRow[];
  career_top10s: LeaderRow[];
  career_events: LeaderRow[];
  career_scoring_avg: LeaderRow[];
  career_low_to_par: LeaderRow[];
}

interface SeasonLeaders {
  single_season_wins: LeaderRow[];
  single_season_top5s: LeaderRow[];
  single_season_top10s: LeaderRow[];
  single_season_events: LeaderRow[];
  single_season_scoring_avg: LeaderRow[];
}

interface TournamentLeaders {
  low_18_hole: LeaderRow[];
  low_36_hole: LeaderRow[];
  low_54_hole: LeaderRow[];
  low_72_hole: LeaderRow[];
  best_finish: LeaderRow[];
}

function topN<T>(xs: T[], n: number, cmp: (a: T, b: T) => number): T[] {
  return [...xs].sort(cmp).slice(0, n);
}

function buildCareerLeaders(players: PlayerExport[], min_events_for_avg = 5): CareerLeaders {
  const rows = players.map((p) => {
    let wins = 0, top5 = 0, top10 = 0;
    const totals: number[] = [];
    let lowToPar: number | null = null;
    const years = new Set<number>();
    for (const e of p.career.events) {
      const pos = parsePos(e.individual_position);
      if (pos === 1) wins++;
      if (pos !== null && pos <= 5) top5++;
      if (pos !== null && pos <= 10) top10++;
      if (e.total_to_par !== null && e.total_to_par !== undefined) {
        totals.push(e.total_to_par);
        if (lowToPar === null || e.total_to_par < lowToPar) lowToPar = e.total_to_par;
      }
      if (e.season) years.add(e.season);
    }
    const avg =
      totals.length >= min_events_for_avg
        ? totals.reduce((a, b) => a + b, 0) / totals.length
        : null;
    return {
      player_id: p.player_id,
      player_name: p.raw_name,
      events: p.career.events_total,
      wins,
      top5,
      top10,
      scoring_avg_to_par: avg,
      low_to_par: lowToPar,
      years: fmtRange(Array.from(years)),
    };
  });

  const lr = (val: number, r: typeof rows[number], detail?: string): LeaderRow => ({
    player_id: r.player_id,
    player_name: r.player_name,
    value: val,
    years: r.years,
    detail,
  });

  return {
    career_wins: topN(rows.filter((r) => r.wins > 0), 15, (a, b) => b.wins - a.wins).map((r) => lr(r.wins, r)),
    career_top5s: topN(rows.filter((r) => r.top5 > 0), 15, (a, b) => b.top5 - a.top5).map((r) => lr(r.top5, r)),
    career_top10s: topN(rows.filter((r) => r.top10 > 0), 15, (a, b) => b.top10 - a.top10).map((r) => lr(r.top10, r)),
    career_events: topN(rows, 15, (a, b) => b.events - a.events).map((r) => lr(r.events, r)),
    career_scoring_avg: topN(
      rows.filter((r) => r.scoring_avg_to_par !== null),
      15,
      (a, b) => (a.scoring_avg_to_par! - b.scoring_avg_to_par!),
    ).map((r) => lr(Number(r.scoring_avg_to_par!.toFixed(2)), r, `min ${min_events_for_avg} events`)),
    career_low_to_par: topN(
      rows.filter((r) => r.low_to_par !== null),
      15,
      (a, b) => (a.low_to_par! - b.low_to_par!),
    ).map((r) => lr(r.low_to_par!, r, "lowest single-event to par")),
  };
}

function buildSeasonLeaders(players: PlayerExport[]): SeasonLeaders {
  interface Season {
    player_id: string;
    player_name: string;
    season: number;
    events: number;
    wins: number;
    top5: number;
    top10: number;
    scoring_avg: number | null;
  }
  const seasons: Season[] = [];
  for (const p of players) {
    const bySeason = new Map<number, { wins: number; top5: number; top10: number; events: number; totals: number[] }>();
    for (const e of p.career.events) {
      if (!e.season) continue;
      const s = bySeason.get(e.season) || { wins: 0, top5: 0, top10: 0, events: 0, totals: [] };
      s.events++;
      const pos = parsePos(e.individual_position);
      if (pos === 1) s.wins++;
      if (pos !== null && pos <= 5) s.top5++;
      if (pos !== null && pos <= 10) s.top10++;
      if (e.total_to_par !== null && e.total_to_par !== undefined) s.totals.push(e.total_to_par);
      bySeason.set(e.season, s);
    }
    for (const [season, s] of bySeason) {
      seasons.push({
        player_id: p.player_id,
        player_name: p.raw_name,
        season,
        events: s.events,
        wins: s.wins,
        top5: s.top5,
        top10: s.top10,
        scoring_avg: s.totals.length ? s.totals.reduce((a, b) => a + b, 0) / s.totals.length : null,
      });
    }
  }

  const lr = (val: number, s: Season, detail?: string): LeaderRow => ({
    player_id: s.player_id,
    player_name: s.player_name,
    value: val,
    years: String(s.season),
    detail,
  });

  return {
    single_season_wins: topN(
      seasons.filter((s) => s.wins > 0),
      15,
      (a, b) => b.wins - a.wins,
    ).map((s) => lr(s.wins, s)),
    single_season_top5s: topN(
      seasons.filter((s) => s.top5 > 0),
      15,
      (a, b) => b.top5 - a.top5,
    ).map((s) => lr(s.top5, s)),
    single_season_top10s: topN(
      seasons.filter((s) => s.top10 > 0),
      15,
      (a, b) => b.top10 - a.top10,
    ).map((s) => lr(s.top10, s)),
    single_season_events: topN(seasons, 15, (a, b) => b.events - a.events).map((s) => lr(s.events, s)),
    single_season_scoring_avg: topN(
      seasons.filter((s) => s.scoring_avg !== null && s.events >= 4),
      15,
      (a, b) => a.scoring_avg! - b.scoring_avg!,
    ).map((s) => lr(Number(s.scoring_avg!.toFixed(2)), s, `min 4 events`)),
  };
}

function buildTournamentLeaders(players: PlayerExport[]): TournamentLeaders {
  interface OneRound {
    player_id: string;
    player_name: string;
    round: number;
    rd_total: number;
    to_par: number | null;
    tournament: string;
    season: number | null;
  }
  interface OneEvent {
    player_id: string;
    player_name: string;
    tournament: string;
    season: number | null;
    cumulative_to_par: (number | null)[]; // [r1, r1+r2, r1+r2+r3, all]
    sum_total_to_par: number | null;
    rounds_count: number;
    finish: number | null;
  }
  const rounds: OneRound[] = [];
  const events: OneEvent[] = [];
  for (const p of players) {
    for (const e of p.career.events) {
      // Per-round low scores.
      for (const r of e.rounds) {
        if (r.rd_total !== null && r.rd_total !== undefined && r.rd_total > 0) {
          rounds.push({
            player_id: p.player_id,
            player_name: p.raw_name,
            round: r.round,
            rd_total: r.rd_total,
            to_par: r.round_to_par ?? null,
            tournament: e.tournament,
            season: e.season,
          });
        }
      }
      // Cumulative to-par at 18/36/54/72 — derived from round_to_par if present.
      const cum: (number | null)[] = [];
      let running: number | null = 0;
      for (const r of e.rounds) {
        if (r.round_to_par === null || r.round_to_par === undefined) {
          running = null;
          break;
        }
        running += r.round_to_par;
        cum.push(running);
      }
      events.push({
        player_id: p.player_id,
        player_name: p.raw_name,
        tournament: e.tournament,
        season: e.season,
        cumulative_to_par: cum,
        sum_total_to_par: e.total_to_par ?? null,
        rounds_count: e.rounds.length,
        finish: parsePos(e.individual_position),
      });
    }
  }

  const lrR = (r: OneRound): LeaderRow => ({
    player_id: r.player_id,
    player_name: r.player_name,
    value: r.rd_total,
    years: r.season ? String(r.season) : "",
    detail: `${r.tournament}${r.to_par !== null ? ` (${r.to_par > 0 ? `+${r.to_par}` : r.to_par})` : ""}, R${r.round}`,
  });

  const lrE = (e: OneEvent, round_index: number, label: string): LeaderRow => {
    const v = e.cumulative_to_par[round_index];
    return {
      player_id: e.player_id,
      player_name: e.player_name,
      value: v ?? 0,
      years: e.season ? String(e.season) : "",
      detail: `${e.tournament} (${label})`,
    };
  };

  return {
    low_18_hole: topN(rounds, 15, (a, b) => a.rd_total - b.rd_total).map(lrR),
    low_36_hole: topN(
      events.filter((e) => e.cumulative_to_par[1] !== null && e.cumulative_to_par[1] !== undefined),
      15,
      (a, b) => (a.cumulative_to_par[1]! - b.cumulative_to_par[1]!),
    ).map((e) => lrE(e, 1, "36-hole")),
    low_54_hole: topN(
      events.filter((e) => e.cumulative_to_par[2] !== null && e.cumulative_to_par[2] !== undefined),
      15,
      (a, b) => (a.cumulative_to_par[2]! - b.cumulative_to_par[2]!),
    ).map((e) => lrE(e, 2, "54-hole")),
    low_72_hole: topN(
      events.filter((e) => e.cumulative_to_par[3] !== null && e.cumulative_to_par[3] !== undefined),
      15,
      (a, b) => (a.cumulative_to_par[3]! - b.cumulative_to_par[3]!),
    ).map((e) => lrE(e, 3, "72-hole")),
    best_finish: topN(
      events.filter((e) => e.finish !== null),
      15,
      (a, b) => (a.finish! - b.finish!),
    ).map((e) => ({
      player_id: e.player_id,
      player_name: e.player_name,
      value: e.finish!,
      years: e.season ? String(e.season) : "",
      detail: e.tournament,
    })),
  };
}

interface YearByYearRow {
  year: number;
  events_count: number;
  team_wins: number;
  best_team_finish: number | null;
  best_team_finish_event: string | null;
  individual_winners: { player_id: string; player_name: string; tournament: string }[];
}

function buildYearByYear(players: PlayerExport[]): YearByYearRow[] {
  // Each year = one row aggregating across all our players' events that
  // season. Approximations because we infer team finish from any one
  // player's row in each event.
  interface EventAgg {
    tournament: string;
    season: number;
    team_position: number | null;
    individual_winners: { player_id: string; player_name: string }[];
  }
  const byTournamentSeason = new Map<string, EventAgg>();
  for (const p of players) {
    for (const e of p.career.events) {
      if (!e.season) continue;
      const key = `${e.season}::${e.tournament_id}`;
      let agg = byTournamentSeason.get(key);
      if (!agg) {
        agg = {
          tournament: e.tournament,
          season: e.season,
          team_position: parsePos(e.team_position),
          individual_winners: [],
        };
        byTournamentSeason.set(key, agg);
      }
      const pos = parsePos(e.individual_position);
      if (pos === 1) agg.individual_winners.push({ player_id: p.player_id, player_name: p.raw_name });
    }
  }
  const byYear = new Map<number, YearByYearRow>();
  for (const a of byTournamentSeason.values()) {
    let r = byYear.get(a.season);
    if (!r) {
      r = {
        year: a.season,
        events_count: 0,
        team_wins: 0,
        best_team_finish: null,
        best_team_finish_event: null,
        individual_winners: [],
      };
      byYear.set(a.season, r);
    }
    r.events_count++;
    if (a.team_position === 1) r.team_wins++;
    if (a.team_position !== null) {
      if (r.best_team_finish === null || a.team_position < r.best_team_finish) {
        r.best_team_finish = a.team_position;
        r.best_team_finish_event = a.tournament;
      }
    }
    for (const w of a.individual_winners) {
      r.individual_winners.push({ ...w, tournament: a.tournament });
    }
  }
  return Array.from(byYear.values()).sort((a, b) => b.year - a.year);
}

interface AllAmericanEntry {
  year: number;
  player: string;
  team: string;
  context: string;
}

function findAllAmericans(slug: string, gender: "m" | "w"): AllAmericanEntry[] {
  const file = gender === "m" ? NCAA_RECORDS_MEN : NCAA_RECORDS_WOMEN;
  if (!fs.existsSync(file)) return [];
  const records: RecordsFile = JSON.parse(fs.readFileSync(file, "utf-8"));
  const aliases = aliasesForSlug(slug);
  const out: AllAmericanEntry[] = [];
  for (const group of records.groups || []) {
    if (!/all[\s-]*american/i.test(group.title)) continue;
    for (const sec of group.sections || []) {
      for (const e of sec.entries || []) {
        if (!e.school || !e.player) continue;
        if (!aliases.includes(e.school.trim())) continue;
        const yr = (() => {
          const m = (e.years || "").match(/(\d{4})/);
          return m ? parseInt(m[1], 10) : 0;
        })();
        out.push({ year: yr, player: e.player, team: sec.title, context: group.title });
      }
    }
  }
  out.sort((a, b) => b.year - a.year || a.player.localeCompare(b.player));
  return out;
}

interface ProgramAppearances {
  ncaa_championships: { year: number; position: string | number; madeCut: boolean }[];
  ncaa_regionals: { year: number; position: string | number }[];
}

function findProgramAppearances(slug: string, gender: "m" | "w"): ProgramAppearances {
  const aliases = aliasesForSlug(slug);
  const champPath = path.join(REPO_ROOT, "src", "data", "championships-history.json");
  const regPath = path.join(REPO_ROOT, "src", "data", "regionals-history.json");
  const cs: AppearanceRow[] = fs.existsSync(champPath) ? JSON.parse(fs.readFileSync(champPath, "utf-8")) : [];
  const rs: AppearanceRow[] = fs.existsSync(regPath) ? JSON.parse(fs.readFileSync(regPath, "utf-8")) : [];
  const g = gender === "m" ? "men" : "women";
  return {
    ncaa_championships: cs
      .filter((r) => r.gender === g && aliases.includes(r.team))
      .map((r) => ({ year: r.year, position: r.position ?? "—", madeCut: !!r.madeCut }))
      .sort((a, b) => b.year - a.year),
    ncaa_regionals: rs
      .filter((r) => r.gender === g && aliases.includes(r.team))
      .map((r) => ({ year: r.year, position: r.position ?? "—" }))
      .sort((a, b) => b.year - a.year),
  };
}

// --- main ---

function buildOne(slug: string, gender: "m" | "w"): void {
  const players = readPlayers(slug, gender);
  if (players.length === 0) {
    console.log(`[${slug} ${gender}] no players in lake; skipping`);
    return;
  }

  const career = buildCareerLeaders(players);
  const season = buildSeasonLeaders(players);
  const tournament = buildTournamentLeaders(players);
  const yearByYear = buildYearByYear(players);
  const allAmericansFromNcaa = findAllAmericans(slug, gender);
  const appearances = findProgramAppearances(slug, gender);
  const schoolPdf = readSchoolPdf(slug, gender);
  const wiki = readWikipedia(slug, gender);
  const cupRows = readCupAppearances();
  const playerIndex = readPlayersForCupResolution();
  const cupAppearancesResolved = cupAppearancesForSlug(cupRows, slug, playerIndex);
  const walkerCupForTeam = cupAppearancesResolved.filter((c) => c.cup === "walker");
  const palmerCupForTeam = cupAppearancesResolved.filter((c) => c.cup === "palmer");

  // Combine BQ-derived roster + school-PDF letterwinners by normalized name.
  // Players already in the BQ index keep their player_id (linkable);
  // letterwinners only in the PDF show up as text-only with no link.
  const bqRoster = players.map((p) => ({
    player_id: p.player_id as string | null,
    player_name: p.raw_name,
    events_total: p.career.events_total,
    seasons: p.career.seasons.map((s) => s.season),
    first_season: p.career.seasons.length ? p.career.seasons[0].season : null,
    last_season: p.career.seasons.length ? p.career.seasons[p.career.seasons.length - 1].season : null,
    source: "granular_master" as const,
  }));
  const bqByLast = new Map<string, (typeof bqRoster)[number]>();
  for (const r of bqRoster) {
    const last = r.player_name.split(" ").slice(-1)[0].toLowerCase();
    bqByLast.set(last + ":" + r.player_name.toLowerCase().split(" ")[0]?.[0], r);
  }
  const allTimeRoster: Array<{
    player_id: string | null;
    player_name: string;
    events_total: number;
    seasons: number[];
    first_season: number | null;
    last_season: number | null;
    source: "granular_master" | "school_pdf" | "both";
  }> = [];
  const seenNames = new Set<string>();
  for (const r of bqRoster) {
    allTimeRoster.push(r);
    seenNames.add(r.player_name.toLowerCase());
  }
  if (schoolPdf) {
    for (const lw of schoolPdf.sections.all_time_letterwinners) {
      const lcName = lw.raw_name.toLowerCase();
      // Heuristic merge: if BQ has the same first+last name, mark as both.
      const existing = allTimeRoster.find((r) => r.player_name.toLowerCase() === lcName);
      if (existing) {
        existing.source = "both";
        if (lw.first_year && (existing.first_season === null || lw.first_year < existing.first_season))
          existing.first_season = lw.first_year;
        if (lw.last_year && (existing.last_season === null || lw.last_year > existing.last_season))
          existing.last_season = lw.last_year;
        continue;
      }
      if (seenNames.has(lcName)) continue;
      allTimeRoster.push({
        player_id: null,
        player_name: lw.raw_name,
        events_total: 0,
        seasons: [],
        first_season: lw.first_year,
        last_season: lw.last_year,
        source: "school_pdf",
      });
      seenNames.add(lcName);
    }
  }
  allTimeRoster.sort((a, b) => a.player_name.localeCompare(b.player_name));

  // Merge All-Americans from NCAA Record Book + school PDF.
  const allAmericansBySource = {
    from_ncaa_record_book: allAmericansFromNcaa,
    from_school_pdf: schoolPdf
      ? [
          ...schoolPdf.sections.all_americans.first_team.map((e) => ({ ...e, tier: "first_team" })),
          ...schoolPdf.sections.all_americans.second_team.map((e) => ({ ...e, tier: "second_team" })),
          ...schoolPdf.sections.all_americans.third_team.map((e) => ({ ...e, tier: "third_team" })),
          ...schoolPdf.sections.all_americans.honorable_mention.map((e) => ({ ...e, tier: "honorable_mention" })),
        ]
      : [],
  };

  const coverageBits: string[] = [];
  coverageBits.push(`BigQuery granular_master (≈2010+) ${players.length} players`);
  if (schoolPdf) {
    coverageBits.push(`school media-guide PDF ${schoolPdf.source_pdf} (back to 1934)`);
  }
  if (wiki) {
    coverageBits.push(`Wikipedia infobox (${wiki.wikipedia_title})`);
  }

  const recordBook = {
    school_slug: slug,
    gender,
    built_at: new Date().toISOString(),
    coverage_note: `Sources merged: ${coverageBits.join("; ")}. Empty sections still need their respective source modules — see /team-deep-dive SKILL.md.`,
    sections: {
      career_individual_records: career,
      single_season_records: season,
      tournament_records: tournament,
      all_time_roster: allTimeRoster,
      year_by_year_team_results: yearByYear,
      all_americans_from_ncaa_record_book: allAmericansFromNcaa,
      all_americans_from_school_pdf: allAmericansBySource.from_school_pdf,
      program_appearances: appearances,
      ncaa_regional_appearances_pdf: schoolPdf?.sections.ncaa_regional_appearances ?? [],
      ncaa_championships_appearances_pdf: schoolPdf?.sections.ncaa_championships_appearances ?? [],
      southwest_conference_championships: schoolPdf?.sections.southwest_conference_championships ?? [],
      coaching_history: schoolPdf?.sections.head_coaches ?? [],
      walker_cup_from_school_pdf: schoolPdf?.sections.walker_cup_appearances ?? [],
      walker_cup_from_wikipedia: walkerCupForTeam,
      palmer_cup_from_school_pdf: schoolPdf?.sections.arnold_palmer_cup ?? [],
      palmer_cup_from_wikipedia: palmerCupForTeam,
      walker_cup: schoolPdf?.sections.walker_cup_appearances ?? [],
      palmer_cup: schoolPdf?.sections.arnold_palmer_cup ?? [],
      masters_appearances: schoolPdf?.sections.masters_appearances ?? [],
      major_amateur_titles: schoolPdf?.sections.major_amateur_titles ?? [],
      all_conference_selections: { entries: [], needs_source: "school media guide PDF / conference archives" },
      hall_of_fame: { entries: [], needs_source: "school media guide PDF (TT 2022 PDF does not include this section)" },
      notable_pros: wiki?.notable_alumni ?? [],
      conference_titles: wiki?.conference_titles ?? [],
      ncaa_championships_from_wikipedia: wiki?.ncaa_championships ?? [],
      ncaa_runner_up_from_wikipedia: wiki?.ncaa_runner_up ?? [],
      ncaa_match_play_berths_from_wikipedia: wiki?.ncaa_match_play_berths ?? [],
      individual_ncaa_champions: wiki?.individual_ncaa_champions ?? [],
      wikipedia_meta: wiki
        ? { title: wiki.wikipedia_title, url: wiki.wikipedia_url, scraped_at: wiki.scraped_at }
        : null,
    },
  };

  if (!fs.existsSync(TEAMS_DIR)) fs.mkdirSync(TEAMS_DIR, { recursive: true });
  const outPath = path.join(TEAMS_DIR, `${slug}-${gender === "m" ? "men" : "women"}-record-book.json`);
  fs.writeFileSync(outPath, JSON.stringify(recordBook, null, 2));
  console.log(
    `[${slug} ${gender}] ${players.length} players → ${outPath}\n` +
      `  career_wins leaders: ${career.career_wins.length}, ` +
      `low_72: ${tournament.low_72_hole.length}, ` +
      `years: ${yearByYear.length}, ` +
      `All-Americans: ${allAmericansFromNcaa.length} (NCAA RB) + ${allAmericansBySource.from_school_pdf.length} (school PDF)`,
  );
}

function main(): void {
  const argv = process.argv.slice(2);
  if (argv[0] === "--all") {
    const indexPath = path.join(PLAYERS_DIR, "index.json");
    if (!fs.existsSync(indexPath)) {
      console.error("No players index.json yet.");
      process.exit(1);
    }
    const idx: PlayerIndexEntry[] = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
    const seen = new Set<string>();
    for (const e of idx) {
      const k = `${e.school_slug}:${e.gender}`;
      if (seen.has(k)) continue;
      seen.add(k);
      buildOne(e.school_slug, e.gender);
    }
    return;
  }
  if (argv.length < 2) {
    console.error("Usage: npx tsx scripts/team-deep-dive/build-record-book.ts <slug> <men|women> | --all");
    process.exit(1);
  }
  const slug = argv[0];
  const gender: "m" | "w" = argv[1] === "men" || argv[1] === "m" ? "m" : "w";
  buildOne(slug, gender);
}

main();
