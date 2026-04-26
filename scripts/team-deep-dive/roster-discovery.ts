/**
 * Phase 0 roster discovery for /team-deep-dive.
 *
 * Scans local-only data sources for any mention of the target team's
 * players, dedupes across sources, and writes a roster preview JSON to
 * data/team-deep-dive/roster-preview-<slug>.json.
 *
 * No scraping. No BigQuery writes. No network. Pure local read.
 *
 * Sources consulted:
 *   - src/data/records-men.json | records-women.json (NCAA Record Book entries)
 *   - src/data/records-manual-entries.json (manual additions to record book)
 *   - src/data/championships-history.json (team-level appearances; provides era context)
 *   - src/data/regionals-history.json (team-level appearances; provides era context)
 *   - src/data/regionals-rich.json (team-level seed + SG context, men only)
 *   - src/data/all-teams-men-2026.ts | all-teams-women-2026.ts (team name → slug)
 *
 * Phase 1+ will add caddie.results (BigQuery export) which is the primary
 * source of GolfStat-era player names. Phase M5b will add school media-guide
 * PDFs for the deep-history era.
 *
 * Usage:
 *   npx tsx scripts/team-deep-dive/roster-discovery.ts <slug> <gender>
 *
 * Examples:
 *   npx tsx scripts/team-deep-dive/roster-discovery.ts texas-tech men
 *   npx tsx scripts/team-deep-dive/roster-discovery.ts oklahoma-state men
 */

import * as fs from "fs";
import * as path from "path";
import type {
  Gender,
  RosterCandidate,
  RosterMention,
  RosterPreview,
  SourceName,
} from "./lib/types";
import { normalizeName } from "./lib/identity";

const REPO_ROOT = path.join(__dirname, "..", "..");
const DATA_DIR = path.join(REPO_ROOT, "src", "data");
const OUT_DIR = path.join(REPO_ROOT, "data", "team-deep-dive");

interface RecordEntry {
  player?: string;
  school?: string;
  years?: string;
  value?: number | string;
  team?: string;
  position?: string;
  date?: string;
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
  gender: string;
  groups: RecordGroup[];
}

interface ManualEntries {
  [gender: string]: {
    [groupSlug: string]: {
      [sectionSlug: string]: {
        kind: string;
        entries: RecordEntry[];
      };
    };
  };
}

interface AppearanceRow {
  team: string;
  gender: string;
  year: number;
  position?: string | number;
  positionNoTies?: number | null;
  madeCut?: boolean;
  matchPlayEra?: boolean;
  matchPlaySeed?: number | null;
  wonQuarterfinal?: boolean | null;
  wonSemifinal?: boolean | null;
  wonChampionship?: boolean | null;
  regional?: string;
  seed?: number | null;
  result?: string;
  finalPos?: number;
  sgTotal?: number | null;
  margin?: number | null;
  titleCount?: number | null;
}

// ---------- helpers ----------

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

function readAllTeamsTs(filePath: string): Array<{ team: string; conference: string }> {
  // Quick-and-dirty: extract every `team: "..."` literal from the auto-generated TS file.
  const src = fs.readFileSync(filePath, "utf-8");
  const out: Array<{ team: string; conference: string }> = [];
  const re = /\{\s*rank:\s*\d+\s*,\s*team:\s*"([^"]+)"\s*,\s*conference:\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    out.push({ team: m[1], conference: m[2] });
  }
  return out;
}

// Some record-book entries store the school as e.g. "Texas Tech" exactly,
// others might have variants. Build a small alias set per slug.
function schoolAliasesForSlug(slug: string, allTeams: Array<{ team: string }>): Set<string> {
  const aliases = new Set<string>();
  const exact = allTeams.find((t) => slugify(t.team) === slug);
  if (exact) aliases.add(exact.team);
  // Manual common aliases — extend over time as we hit edge cases.
  const manual: Record<string, string[]> = {
    "texas-tech": ["Texas Tech", "Texas Tech University", "TTU"],
    "oklahoma-state": ["Oklahoma State", "Oklahoma St.", "Oklahoma St"],
    "north-carolina": ["North Carolina", "UNC"],
    "north-carolina-state": ["NC State", "North Carolina State", "N.C. State"],
    "ucla": ["UCLA", "U.C.L.A.", "California-Los Angeles"],
    "byu": ["BYU", "Brigham Young"],
    "ole-miss": ["Ole Miss", "Mississippi"],
    "lsu": ["LSU", "Louisiana State"],
  };
  if (manual[slug]) for (const a of manual[slug]) aliases.add(a);
  return aliases;
}

function matchesSchool(entrySchool: string | undefined, aliases: Set<string>): boolean {
  if (!entrySchool) return false;
  const normEntry = entrySchool.trim().toLowerCase();
  for (const a of aliases) if (a.trim().toLowerCase() === normEntry) return true;
  return false;
}

function parseYearsField(years?: string): number | undefined {
  // Common formats: "1973-76", "1971-73", "2014-18", "2023-", "1977-80, 81-82"
  if (!years) return undefined;
  const m = years.match(/^(\d{2,4})/);
  if (!m) return undefined;
  let y = parseInt(m[1], 10);
  if (y < 100) y = y >= 50 ? 1900 + y : 2000 + y;
  return y;
}

// ---------- main ----------

interface CliArgs {
  slug: string;
  gender: Gender;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  if (argv.length < 2) {
    console.error("Usage: npx tsx scripts/team-deep-dive/roster-discovery.ts <slug> <men|women>");
    process.exit(1);
  }
  const slug = argv[0];
  const gender = argv[1] === "women" || argv[1] === "w" ? "w" : argv[1] === "men" || argv[1] === "m" ? "m" : null;
  if (!gender) {
    console.error(`Invalid gender: ${argv[1]}. Use 'men' or 'women'.`);
    process.exit(1);
  }
  return { slug, gender };
}

function main(): void {
  const { slug, gender } = parseArgs();

  const allTeamsFile = path.join(
    DATA_DIR,
    gender === "m" ? "all-teams-men-2026.ts" : "all-teams-women-2026.ts"
  );
  const allTeams = readAllTeamsTs(allTeamsFile);
  const teamRow = allTeams.find((t) => slugify(t.team) === slug);
  if (!teamRow) {
    console.error(`No team found for slug '${slug}' in ${allTeamsFile}`);
    console.error("Tip: slug should be lowercase kebab-case of the team name.");
    process.exit(1);
  }
  const aliases = schoolAliasesForSlug(slug, allTeams);

  const candidates = new Map<string, RosterCandidate>();
  const sourcesConsulted = new Set<SourceName>();
  const notes: string[] = [];

  function pushMention(rawName: string, mention: RosterMention): void {
    if (!rawName || rawName.trim().length < 2) return;
    const normalized = normalizeName(rawName);
    const existing = candidates.get(normalized);
    if (existing) {
      existing.mentions.push(mention);
    } else {
      candidates.set(normalized, {
        raw_name: rawName.trim(),
        normalized_name: normalized,
        mentions: [mention],
        confidence: 0,
      });
    }
    sourcesConsulted.add(mention.source);
  }

  // 1) records-{gender}.json
  const recordsFile = path.join(DATA_DIR, gender === "m" ? "records-men.json" : "records-women.json");
  if (fs.existsSync(recordsFile)) {
    const records = readJson<RecordsFile>(recordsFile);
    let matched = 0;
    for (const group of records.groups || []) {
      for (const section of group.sections || []) {
        for (const entry of section.entries || []) {
          if (!matchesSchool(entry.school, aliases) || !entry.player) continue;
          pushMention(entry.player, {
            source: "ncaa_record_book",
            context: `${group.title} / ${section.title}`,
            year: parseYearsField(entry.years),
            detail: entry.years,
          });
          matched++;
        }
      }
    }
    notes.push(`records-${gender === "m" ? "men" : "women"}.json: ${matched} matching record-book entries`);
  } else {
    notes.push(`records-${gender === "m" ? "men" : "women"}.json: not found`);
  }

  // 2) records-manual-entries.json
  const manualFile = path.join(DATA_DIR, "records-manual-entries.json");
  if (fs.existsSync(manualFile)) {
    const manual = readJson<ManualEntries>(manualFile);
    const bucket = manual[gender === "m" ? "men" : "women"] || {};
    let matched = 0;
    for (const groupSlug of Object.keys(bucket)) {
      const sections = bucket[groupSlug];
      for (const sectionSlug of Object.keys(sections)) {
        const section = sections[sectionSlug];
        for (const entry of section.entries || []) {
          if (!matchesSchool(entry.school, aliases) || !entry.player) continue;
          pushMention(entry.player, {
            source: "manual",
            context: `manual / ${groupSlug} / ${sectionSlug}`,
            year: parseYearsField(entry.years),
            detail: entry.years,
          });
          matched++;
        }
      }
    }
    notes.push(`records-manual-entries.json: ${matched} matching entries`);
  }

  // 3) championships-history.json — team-level only, but record the appearance years as context.
  const champFile = path.join(DATA_DIR, "championships-history.json");
  const championshipYears: number[] = [];
  if (fs.existsSync(champFile)) {
    const champ = readJson<AppearanceRow[]>(champFile);
    for (const row of champ) {
      if (row.gender === (gender === "m" ? "men" : "women") && matchesSchool(row.team, aliases)) {
        championshipYears.push(row.year);
      }
    }
    sourcesConsulted.add("championships_history");
    notes.push(`championships-history.json: ${championshipYears.length} NCAA Championship appearance years`);
  }

  // 4) regionals-history.json — team-level only.
  const regFile = path.join(DATA_DIR, "regionals-history.json");
  const regionalYears: number[] = [];
  if (fs.existsSync(regFile)) {
    const reg = readJson<AppearanceRow[]>(regFile);
    for (const row of reg) {
      if (row.gender === (gender === "m" ? "men" : "women") && matchesSchool(row.team, aliases)) {
        regionalYears.push(row.year);
      }
    }
    sourcesConsulted.add("regionals_history");
    notes.push(`regionals-history.json: ${regionalYears.length} regional appearance years`);
  }

  // 5) regionals-rich.json — context (men only currently).
  const richFile = path.join(DATA_DIR, "regionals-rich.json");
  const richYears: number[] = [];
  if (gender === "m" && fs.existsSync(richFile)) {
    const rich = readJson<AppearanceRow[]>(richFile);
    for (const row of rich) {
      if (row.gender === "men" && matchesSchool(row.team, aliases)) richYears.push(row.year);
    }
    notes.push(`regionals-rich.json: ${richYears.length} rich-data regional rows`);
  }

  // Confidence heuristic for Phase 0:
  //   base 0.5 for any mention from records (school field is authoritative)
  //   +0.2 per additional source
  //   +0.1 per additional record-book entry (multiple entries = more weight)
  for (const c of candidates.values()) {
    const sources = new Set(c.mentions.map((m) => m.source));
    let score = 0.5 + (sources.size - 1) * 0.2 + Math.max(0, c.mentions.length - 1) * 0.05;
    if (score > 0.99) score = 0.99;
    c.confidence = Number(score.toFixed(2));
  }

  // Build preview.
  const candidatesArr = Array.from(candidates.values()).sort((a, b) =>
    b.confidence - a.confidence || a.normalized_name.localeCompare(b.normalized_name)
  );

  const preview: RosterPreview & {
    program_appearances: {
      regional_years: number[];
      championship_years: number[];
      regionals_rich_years: number[];
    };
  } = {
    team_slug: slug,
    team_name: teamRow.team,
    gender,
    built_at: new Date().toISOString(),
    candidate_count: candidatesArr.length,
    candidates: candidatesArr,
    sources_consulted: Array.from(sourcesConsulted),
    notes,
    program_appearances: {
      regional_years: Array.from(new Set(regionalYears)).sort((a, b) => a - b),
      championship_years: Array.from(new Set(championshipYears)).sort((a, b) => a - b),
      regionals_rich_years: Array.from(new Set(richYears)).sort((a, b) => a - b),
    },
  };

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, `roster-preview-${slug}-${gender}.json`);
  fs.writeFileSync(outPath, JSON.stringify(preview, null, 2));

  // Console summary.
  console.log("");
  console.log(`Roster preview written: ${outPath}`);
  console.log(`Team: ${preview.team_name} (${slug}, ${gender})`);
  console.log(`Sources consulted: ${preview.sources_consulted.join(", ") || "(none)"}`);
  console.log(`Candidate names found: ${preview.candidate_count}`);
  console.log(`Regional appearances on file: ${preview.program_appearances.regional_years.length} years`);
  console.log(`NCAA Championship appearances on file: ${preview.program_appearances.championship_years.length} years`);
  console.log("");
  console.log("Top 10 by confidence:");
  for (const c of candidatesArr.slice(0, 10)) {
    console.log(
      `  ${c.confidence.toFixed(2)}  ${c.raw_name.padEnd(28)} ${c.mentions.length} mentions [${Array.from(
        new Set(c.mentions.map((m) => m.source))
      ).join(", ")}]`
    );
  }
  if (candidatesArr.length > 10) console.log(`  ... and ${candidatesArr.length - 10} more`);
  console.log("");
  console.log("Notes:");
  for (const n of notes) console.log(`  - ${n}`);
  console.log("");
  console.log("Phase 0 done. This is local-data only. Phase 1 (GolfStat scrape, BigQuery merge,");
  console.log("identity resolution) is dispatched via the LaunchAgent — not yet wired.");
}

main();
