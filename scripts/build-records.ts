/**
 * Record Book Parser
 *
 * Reads pdftotext -raw output of the NCAA D1 Men's and Women's Golf Record Books
 * (compiled by Lindy Brown and staff at Duke) and emits typed TypeScript data
 * modules at src/data/records-men.ts and src/data/records-women.ts.
 *
 * The parser walks the text in reading order. It keeps two state machines:
 *
 *   1. current group  (Individual Career / Individual Season / Tournament / ...)
 *   2. current section (Career Wins / Lowest Individual Round / ...)
 *
 * Group and section headers are matched against a hardcoded registry per gender.
 * Entry lines are parsed with section-specific regexes.
 *
 * Output is committed — this script is run on-demand when the PDFs update, not
 * on every build. Run with: npx tsx scripts/build-records.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  Gender,
  ManualEntriesFile,
  ManualSectionPayload,
  RecordBook,
  RecordGroup,
  RecordSection,
  StatEntry,
  TournamentEntry,
  TableEntry,
  AwardEntry,
  AnnualRankYear,
  AllAmericaYear,
  MajorsEntry,
  LongRunningEntry,
  CoachEntry,
} from "../src/data/records-types";

type SectionKind = RecordSection["kind"];

// ---------------------------------------------------------------------------
// Text cleanup
// ---------------------------------------------------------------------------

/**
 * pdftotext -raw drops spaces in predictable places. Apply corrections before
 * regex parsing. All fixes are idempotent.
 */
function cleanLine(s: string): string {
  return s
    // space after comma ONLY when followed by a letter (preserve "5,208" numbers)
    .replace(/,(?=[A-Za-z])/g, ", ")
    // space before open-paren when the preceding char is a letter
    .replace(/([A-Za-z])\(/g, "$1 (")
    // common word-merges (pdftotext -raw drops spaces before certain capitalized
    // tokens). Use a mid-word-boundary regex so we don't split "IBM" from a
    // following cap sequence.
    .replace(
      /([a-z.])(Arizona|Alabama|Auburn|Aron|Adam|Andrew|Anders|Abigail|Austin|Albin|Alan|Alex|Alejandro|Ashton|South Alabama|Texas A&M|NCState|UCLA|UNC|UT Martin|USC|SMU|LSU|BYU|TCU|NCAA|Wake Forest|Oklahoma State|North Carolina|South Carolina|Georgia Tech|Florida State|Arizona State|Iowa State|Michigan State|Penn State|Oregon State|Mississippi State|NC State|Sacramento State|San Jose State|Ball State|Colorado State|Boise State|Ole Miss|Kent State)\b/g,
      "$1 $2",
    )
    // Un-separator: "ChunAn", "EugenioChacarra" etc — if we see a lowercase
    // followed by a capital, and the split would form two recognizable words,
    // skip. Too noisy to handle perfectly; leave these until we see a bad row.
    .replace(/([a-z])([A-Z])/g, (m, p, q, offset, whole) => {
      // Only split at a few known school-name boundaries to avoid breaking
      // names like "McNealy", "DeChambeau", "Van Sickle", etc.
      return m;
    })
    .replace(/ Texas A & M/g, " Texas A&M")
    .replace(/\s+–\s+/g, " – ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Section registry per gender
// ---------------------------------------------------------------------------

interface SectionSpec {
  title: string;
  slug: string;
  kind: SectionKind;
  minQualifier?: string;
  // Aliases the PDF header might concatenate or slightly reword
  aliases?: string[];
}

interface GroupSpec {
  title: string;
  slug: string;
  sections: SectionSpec[];
}

const MEN_GROUPS: GroupSpec[] = [
  {
    title: "Individual Career Records",
    slug: "individual-career",
    sections: [
      { title: "Career Wins", slug: "career-wins", kind: "stat" },
      { title: "Career Top 10 Finishes", slug: "career-top10", kind: "stat" },
      { title: "Career Even or Under Par Rounds", slug: "career-even-under", kind: "stat" },
      { title: "Career Rounds Played", slug: "career-rounds-played", kind: "stat" },
      { title: "Career Rounds in the 60's", slug: "career-rounds-60s", kind: "stat", aliases: ["Career Rounds in the 60’s"] },
      { title: "Career Stroke Average", slug: "career-stroke-avg", kind: "table", minQualifier: "Minimum 2 Years, 50 Rounds", aliases: ["Career Stroke Average (Minimum 2 Years, 50 Rounds)"] },
    ],
  },
  {
    title: "Individual Season Records",
    slug: "individual-season",
    sections: [
      { title: "Single Season Wins", slug: "single-season-wins", kind: "stat" },
      { title: "Single Season Top 10 Finishes", slug: "single-season-top10", kind: "stat" },
      { title: "Single Season Even or Under Rounds", slug: "single-season-even-under", kind: "stat" },
      { title: "Single Season Stroke Average", slug: "single-season-stroke-avg", kind: "table" },
      { title: "Consecutive Individual Wins", slug: "consecutive-individual-wins", kind: "stat" },
    ],
  },
  {
    title: "Individual Tournament Records",
    slug: "individual-tournament",
    sections: [
      { title: "Lowest Individual Round", slug: "lowest-individual-round", kind: "tournament" },
      {
        title: "Lowest Individual 54 Hole Score (Score to Par)",
        slug: "lowest-individual-54",
        kind: "tournament",
        aliases: [
          "Lowest Individual 54 Hole Score",
          "Lowest Individual 54 Hole Score (By Relation to Par)",
        ],
      },
    ],
  },
  {
    title: "Team Tournament Records",
    slug: "team-tournament",
    sections: [
      { title: "Lowest Team Round", slug: "lowest-team-round", kind: "tournament", aliases: ["Lowest Team Round (By Relation to Par)"] },
      { title: "Lowest Team 54 Hole Score", slug: "lowest-team-54", kind: "tournament", aliases: ["Lowest Team 54 Hole Score (By Relation to Par)"] },
    ],
  },
  {
    title: "NCAA Regional Records",
    slug: "ncaa-regional",
    sections: [
      { title: "Lowest Rounds at an NCAA Regional", slug: "low-round-regional", kind: "tournament" },
      { title: "Lowest 54-Hole Score in Relation to Par at an NCAA Regional", slug: "low-54-regional", kind: "tournament" },
      { title: "Lowest Team Round in Relation to Par at an NCAA Regional", slug: "low-team-round-regional", kind: "tournament" },
      { title: "Lowest Team 54-Hole Score in Relation to Par at an NCAA Regional", slug: "low-team-54-regional", kind: "tournament", aliases: ["Lowest Team 54 Hole Score in Relation to Par at an NCAA Regional"] },
    ],
  },
  {
    title: "Misc. Team / Head Coach Records",
    slug: "team-coach",
    sections: [
      { title: "Largest Margin of Victory", slug: "largest-margin", kind: "tournament" },
      { title: "Single Season Team Wins", slug: "single-season-team-wins", kind: "coach" },
      { title: "Consecutive Team Wins", slug: "consecutive-team-wins", kind: "coach" },
      { title: "Career Coaching Wins", slug: "career-coaching-wins", kind: "coach" },
      { title: "Most Wins in First Season as Head Coach", slug: "first-season-wins", kind: "coach" },
      { title: "Longest Tenured as Head Coach", slug: "longest-tenured", kind: "coach" },
    ],
  },
  {
    title: "Golf Majors by School",
    slug: "majors",
    sections: [
      { title: "Golf Majors by School", slug: "majors-list", kind: "majors" },
    ],
  },
  {
    title: "Longest Run Events",
    slug: "long-running",
    sections: [
      { title: "Longest Run Events (Years)", slug: "long-running-list", kind: "long-running" },
    ],
  },
];

const WOMEN_GROUPS: GroupSpec[] = [
  {
    title: "Honors and Awards",
    slug: "honors-awards",
    sections: [
      { title: "ANNIKA Award National Player of the Year", slug: "annika-award", kind: "award" },
      { title: "Golfweek National Player of the Year", slug: "golfweek-npoy", kind: "award" },
      { title: "WGCA PING Player of the Year", slug: "wgca-ping-poy", kind: "award" },
      { title: "WGCA Freshman of the Year", slug: "wgca-freshman", kind: "award" },
      { title: "Golfweek National Coach of the Year", slug: "golfweek-coach", kind: "award" },
      { title: "WGCA Golf Pride Assistant Coach of the Year", slug: "wgca-asst-coach", kind: "award" },
      { title: "WGCA Golf Pride Coach of the Year", slug: "wgca-coach", kind: "award" },
      { title: "GolfStat Cup Winner", slug: "golfstat-cup", kind: "award" },
      { title: "Juli Inkster Award", slug: "juli-inkster", kind: "award" },
      { title: "WGCA Mark Laesch Award", slug: "mark-laesch", kind: "award" },
    ],
  },
  {
    title: "WGCA Team GPA Rankings",
    slug: "wgca-gpa",
    sections: [
      { title: "WGCA Team GPA Rankings", slug: "wgca-gpa-rankings", kind: "annual-rank" },
    ],
  },
  {
    title: "All-America Teams",
    slug: "all-america",
    sections: [
      { title: "Golfweek All-Americans", slug: "golfweek-all-america", kind: "all-america" },
      { title: "WGCA All-America Teams", slug: "wgca-all-america", kind: "all-america", aliases: ["WGCA All-America Teams"] },
    ],
  },
  {
    title: "Final Rankings",
    slug: "final-rankings",
    sections: [
      { title: "Scoreboard Final Rankings", slug: "scoreboard-rankings", kind: "annual-rank", aliases: ["Scoreboard/Golfweek Rankings"] },
      { title: "Golfweek Final Rankings", slug: "golfweek-rankings", kind: "annual-rank" },
      { title: "Golf World/NGCA Coaches Poll", slug: "golf-world-ngca-poll", kind: "annual-rank" },
      { title: "Women's Golf Coaches Association (WGCA) Poll", slug: "wgca-poll", kind: "annual-rank", aliases: ["Women’s Golf Coaches Association (WGCA) Poll"] },
      { title: "Golfweek Rankings", slug: "golfweek-rankings-legacy", kind: "annual-rank" },
      { title: "MasterCard Collegiate Rankings", slug: "mastercard-rankings", kind: "annual-rank", aliases: ["Golfweek Rankings/MasterCard Collegiate Rankings"] },
    ],
  },
  {
    title: "Individual Career Records",
    slug: "individual-career",
    sections: [
      { title: "Career Wins", slug: "career-wins", kind: "stat" },
      { title: "Career Top 10 Finishes", slug: "career-top10", kind: "stat" },
      { title: "Career Even or Under Par Rounds", slug: "career-even-under", kind: "stat" },
      { title: "Career Rounds Played", slug: "career-rounds-played", kind: "stat" },
      { title: "Career Rounds in the 60's", slug: "career-rounds-60s", kind: "stat", aliases: ["Career Rounds in the 60’s"] },
      { title: "Career Stroke Average", slug: "career-stroke-avg", kind: "table", minQualifier: "Minimum 2 Years, 50 Rounds", aliases: ["Career Stroke Average (Minimum 2 Years, 50 Rounds)"] },
    ],
  },
  {
    title: "Individual Season Records",
    slug: "individual-season",
    sections: [
      { title: "Single Season Wins", slug: "single-season-wins", kind: "stat" },
      { title: "Single Season Top 10 Finishes", slug: "single-season-top10", kind: "stat" },
      { title: "Single Season Even or Under Rounds", slug: "single-season-even-under", kind: "stat" },
      { title: "Single Season Stroke Average", slug: "single-season-stroke-avg", kind: "table", minQualifier: "min. 25 rounds" },
    ],
  },
  {
    title: "Individual Tournament Records",
    slug: "individual-tournament",
    sections: [
      { title: "Lowest Individual Round", slug: "lowest-individual-round", kind: "tournament" },
      {
        title: "Lowest Individual 54 Hole Score (Score to Par)",
        slug: "lowest-individual-54",
        kind: "tournament",
        aliases: [
          "Lowest Individual 54 Hole Score",
          "Lowest Individual 54 Hole Score (By Relation to Par)",
        ],
      },
    ],
  },
  {
    title: "Team Tournament Records",
    slug: "team-tournament",
    sections: [
      { title: "Lowest Team Round", slug: "lowest-team-round", kind: "tournament", aliases: ["Lowest Team Round (By Relation to Par)"] },
      { title: "Lowest Team 54 Hole Score", slug: "lowest-team-54", kind: "tournament", aliases: ["Lowest Team 54 Hole Score (By Relation to Par)"] },
    ],
  },
  {
    title: "Misc. Team Records",
    slug: "misc-team",
    sections: [
      { title: "Largest Margin of Victory", slug: "largest-margin", kind: "tournament" },
      { title: "Single Season Team Wins", slug: "single-season-team-wins", kind: "coach" },
    ],
  },
  {
    title: "Misc. Team / Head Coach Records",
    slug: "team-coach-w",
    sections: [
      { title: "Consecutive Team Wins", slug: "consecutive-team-wins", kind: "coach" },
      { title: "Longest Tenured Active Coaches", slug: "longest-tenured-active", kind: "coach" },
      { title: "Career Coaching Wins", slug: "career-coaching-wins", kind: "coach" },
      { title: "Most Wins in First Season as Head Coach", slug: "first-season-wins", kind: "coach" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Header detection
// ---------------------------------------------------------------------------

function buildHeaderIndex(groups: GroupSpec[]) {
  const group = new Map<string, GroupSpec>();
  const section = new Map<string, { group: GroupSpec; section: SectionSpec }>();
  for (const g of groups) {
    group.set(g.title, g);
    for (const s of g.sections) {
      section.set(s.title, { group: g, section: s });
      for (const a of s.aliases ?? []) section.set(a, { group: g, section: s });
    }
  }
  return { group, section };
}

/**
 * Look for a known section or group title anywhere in the line. Returns the
 * split parts so the caller can parse the `before` segment as data before
 * switching state to the matched header.
 *
 * We try sections first (longer titles win) because they're more specific.
 * Group titles are also checked but only to strip the banner — they don't
 * change parse state.
 */
function splitOnHeader(
  line: string,
  titleRegex: RegExp,
  sections: Map<string, { group: GroupSpec; section: SectionSpec }>,
  groups: Map<string, GroupSpec>,
): {
  before?: string;
  headerKind: "section" | "group";
  match: { group: GroupSpec; section: SectionSpec } | GroupSpec;
  after?: string;
} | null {
  const m = titleRegex.exec(line);
  if (!m) return null;
  const title = m[0];
  const idx = m.index;
  const before = idx > 0 ? line.slice(0, idx).trim() : undefined;
  const after = line.slice(idx + title.length).trim() || undefined;
  const sec = sections.get(title);
  if (sec) return { before, headerKind: "section", match: sec, after };
  const grp = groups.get(title);
  if (grp) return { before, headerKind: "group", match: grp, after };
  return null;
}

function buildTitleRegex(
  sections: Map<string, { group: GroupSpec; section: SectionSpec }>,
  groups: Map<string, GroupSpec>,
): RegExp {
  const titles = [...sections.keys(), ...groups.keys()]
    // Longest first so "Single Season Stroke Average" wins over "Single Season"
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`(?:${titles.join("|")})`);
}

// ---------------------------------------------------------------------------
// Entry parsing — one regex per section kind
// ---------------------------------------------------------------------------

const RE_STAT = /^(\d+(?:\.\d+)?)\s*[-–]\s*(.+?),\s*(.+?)(?:\s*\(([^)]*?)\))?\s*$/;
const RE_MAJORS = /^(\d+)\s*[-–]\s*(.+?)\s*\((.+)\)\s*$/;
const RE_LONG_RUNNING = /^(\d+)\s*[-–]\s*(.+?)(?:\s*\((.+?)\))?\s*$/;
const RE_COACH = /^(\d+(?:\.\d+)?)\s*[-–]\s*(.+?),?\s*(?:\((\d{4}(?:[-–]\d{2,4})?(?:[-–](?:present|pres\.?))?(?:,\s*[\d-]+)?)\))?\s*,?\s*(.+?)?\s*$/;
const RE_AWARD = /^(\d{4})[-–]?\s*[-–]?\s*(.+?)(?:,\s*(.+?))?\s*$/;
/**
 * Tournament-entry "value + payload" extractor. Covers four shapes:
 *   60 - Nathan Han, Columbia                 (simple dash-separated)
 *   61 (-10) - Nick Voke, Iowa State          (score + to-par then dash)
 *   -20 (196) Ben James, Virginia             (to-par + total, NO dash)
 *   -26 (262) Stanford                        (team only, no dash, no comma)
 *   (-27, 261) - Auburn                       (tuple form, with dash)
 */
// Restrict the leading value to ≤3 digits with a negative lookahead so a
// 4-digit year on the detail line (e.g., "2017 NCAA Austin Regional ...")
// doesn't match by taking just the first three digits.
const RE_TOURN_VALUE_PLAYER =
  /^(-?\d{1,3}(?!\d)\s*\(-?\d{1,3}(?!\d)\)|\(-?\d{1,3}(?!\d)[^)]*\)|-?\d{1,3}(?!\d))\s*[-–]?\s*(.+?)(?:,\s*(.+?))?\s*$/;

/** Single-line team tournament: value - school - event (year). */
const RE_MARGIN_LINE =
  /^(\d+)\s*[-–]\s*([^–-]+?)\s*[-–]\s*(.+?)(?:\s*\((\d{4}[^)]*?)\))?\s*$/;
const RE_TABLE_STROKE_AVG =
  /^(.+?),\s*([^()]+?)(?:\s*\(([^)]+)\))?\s+(\d+(?:\.\d+)?)\s+([\d,]+)\s+(\d+\.\d+)\s*$/;
const RE_ANNUAL_RANK = /^(T?\d+)\.?\s*(.+?)(?:\s+(\d+(?:\.\d+)?))?\s*$/;

/** Parse "2022-23" / "2024-25" year divider for annual-rank sections. */
const RE_YEAR_DIVIDER = /^(19|20)\d{2}[-–]\d{2}$/;

function parseStatLine(line: string): StatEntry | null {
  const m = RE_STAT.exec(line);
  if (!m) return null;
  const value = parseNumber(m[1]);
  const player = m[2].trim();
  const school = m[3].trim();
  const years = m[4]?.trim();
  const isCurrentPlayer = isCurrent(years);
  return { value, player, school, ...(years ? { years } : {}), ...(isCurrentPlayer ? { isCurrentPlayer } : {}) };
}

function parseMarginLine(line: string): TournamentEntry | null {
  const m = RE_MARGIN_LINE.exec(line);
  if (!m) return null;
  const value = m[1];
  const school = m[2].trim();
  const event = m[3].trim();
  const date = m[4]?.trim();
  return { value, school, event, ...(date ? { date } : {}) };
}

function parseTournamentPair(line1: string, line2: string): TournamentEntry | null {
  const m = RE_TOURN_VALUE_PLAYER.exec(line1);
  if (!m) return null;
  const value = m[1].trim();
  const who = m[2].trim();
  const schoolFromComma = m[3]?.trim();
  const detail = line2.trim();

  // Detail line splits on "-" into event / round / par / date
  const parts = detail.split(/\s*[-–]\s*/).map((s) => s.trim()).filter(Boolean);
  const event = parts[0] ?? detail;
  const round = parts[1];
  const par = parts[2];
  const date = parts.slice(3).join(" - ");

  // If we have no comma, `who` is the school (team-only tournament record).
  if (!schoolFromComma) {
    return {
      value,
      school: who,
      event,
      ...(round ? { round: [round, par].filter(Boolean).join(" - ") } : {}),
      ...(date ? { date } : {}),
    };
  }

  return {
    value,
    player: who,
    school: schoolFromComma,
    event,
    ...(round ? { round: [round, par].filter(Boolean).join(" - ") } : {}),
    ...(date ? { date } : {}),
  };
}

function parseTableStrokeAvg(line: string): TableEntry | null {
  const m = RE_TABLE_STROKE_AVG.exec(line);
  if (!m) return null;
  const player = m[1].trim();
  const school = m[2].trim();
  const years = m[3]?.trim();
  const rounds = parseNumber(m[4]);
  const strokes = Number(m[5].replace(/,/g, ""));
  const avg = Number(m[6]);
  const isCurrentPlayer = isCurrent(years);
  return {
    rounds: Number(rounds),
    strokes,
    avg,
    player,
    school,
    ...(years ? { years } : {}),
    ...(isCurrentPlayer ? { isCurrentPlayer } : {}),
  };
}

function parseAwardLine(line: string): AwardEntry | null {
  const m = RE_AWARD.exec(line);
  if (!m) return null;
  const year = m[1];
  const winner = m[2].trim();
  const school = m[3]?.trim();
  if (!winner) return null;
  return { year, winner, ...(school ? { school } : {}) };
}

function parseMajorsLine(line: string): MajorsEntry | null {
  const m = RE_MAJORS.exec(line);
  if (!m) return null;
  return { count: Number(m[1]), school: m[2].trim(), players: m[3].trim() };
}

function parseLongRunningLine(line: string): LongRunningEntry | null {
  const m = RE_LONG_RUNNING.exec(line);
  if (!m) return null;
  return { years: Number(m[1]), event: m[2].trim(), ...(m[3] ? { host: m[3].trim() } : {}) };
}

function parseCoachLine(line: string): CoachEntry | null {
  // Career Coaching Wins format: "342 - Dave Williams (1952-87), Houston"
  const parts = line.split(/\s*[-–]\s*/);
  const first = parts[0];
  const valueMatch = /^(\d+(?:\.\d+)?)$/.exec(first.trim());
  if (!valueMatch) return null;
  const value = Number(valueMatch[1]);

  const rest = parts.slice(1).join(" - ");
  // "Dave Williams (1952-87), Houston"
  const m = /^(.+?)\s*(?:\(([^)]+)\))?\s*,\s*(.+?)\s*$/.exec(rest);
  if (!m) {
    // "10 - Duke 2003-04, Head Coach Dan Brooks" — team wins, coach inline
    const teamMatch = /^(.+?)\s*(\d{4}(?:[-–]\d{2,4})?)\s*,\s*Head Coach[:\s]*(.+?)\s*$/.exec(rest);
    if (teamMatch) {
      return { value, coach: teamMatch[3].trim(), school: teamMatch[1].trim(), years: teamMatch[2].trim() };
    }
    // "11 - Alabama, 2012-14, Head Coach: Jay Seawell"
    return { value, coach: "", school: rest };
  }
  return {
    value,
    coach: m[1].trim(),
    ...(m[2] ? { years: m[2].trim() } : {}),
    school: m[3].trim(),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseNumber(s: string): number | string {
  const n = Number(s);
  return Number.isNaN(n) ? s : n;
}

function isCurrent(years: string | undefined): boolean {
  if (!years) return false;
  return /present|pres\.?/i.test(years);
}

// ---------------------------------------------------------------------------
// Main parser — state machine
// ---------------------------------------------------------------------------

interface ParserState {
  groups: Map<string, RecordGroup>;
  currentGroup?: RecordGroup;
  currentSection?: RecordSection;
  currentSectionSpec?: SectionSpec;
  pendingTournFirst?: string;
  currentRankYear?: string; // for annual-rank
  currentAAYear?: string;   // for all-america
  currentAATeam?: "first" | "second" | "third" | "honorable";
}

function parseBook(text: string, groupSpecs: GroupSpec[]): RecordGroup[] {
  const { group: groupIndex, section: sectionIndex } = buildHeaderIndex(groupSpecs);
  const titleRegex = buildTitleRegex(sectionIndex, groupIndex);
  // pdftotext uses `\f` (form feed) to separate pages. Split on it so that a
  // line immediately after a page boundary is parsed independently from the
  // watermark that sometimes precedes the boundary.
  const rawLines = text.split(/[\r\n\f]+/);
  const state: ParserState = { groups: new Map() };

  function ensureGroup(spec: GroupSpec): RecordGroup {
    let g = state.groups.get(spec.slug);
    if (!g) {
      g = { slug: spec.slug, title: spec.title, sections: [] };
      state.groups.set(spec.slug, g);
    }
    return g;
  }

  function ensureSection(
    spec: SectionSpec,
    group: RecordGroup,
  ): RecordSection {
    const existing = group.sections.find((s) => s.slug === spec.slug);
    if (existing) return existing;
    const base = { slug: spec.slug, title: spec.title };
    let section: RecordSection;
    switch (spec.kind) {
      case "stat":
        section = { kind: "stat", ...base, entries: [], ...(spec.minQualifier ? { minQualifier: spec.minQualifier } : {}) };
        break;
      case "tournament":
        section = { kind: "tournament", ...base, entries: [] };
        break;
      case "table":
        section = { kind: "table", ...base, entries: [], ...(spec.minQualifier ? { minQualifier: spec.minQualifier } : {}) };
        break;
      case "award":
        section = { kind: "award", ...base, entries: [] };
        break;
      case "annual-rank":
        section = { kind: "annual-rank", ...base, years: [] };
        break;
      case "all-america":
        section = { kind: "all-america", ...base, years: [] };
        break;
      case "majors":
        section = { kind: "majors", ...base, entries: [] };
        break;
      case "long-running":
        section = { kind: "long-running", ...base, entries: [] };
        break;
      case "coach":
        section = { kind: "coach", ...base, entries: [] };
        break;
      case "team-aggregate":
        throw new Error(
          `Section kind "team-aggregate" is built at runtime in src/lib/program-records.ts, not by the PDF parser`
        );
    }
    group.sections.push(section);
    return section;
  }

  /** Process one line of data against the current section state. */
  function handleDataLine(line: string) {
    const sec = state.currentSection;
    const spec = state.currentSectionSpec;
    if (!sec || !spec || !line) return;

    switch (spec.kind) {
      case "stat": {
        const e = parseStatLine(line);
        if (e && sec.kind === "stat") sec.entries.push(e);
        return;
      }
      case "tournament": {
        // Largest Margin is single-line: value - school - event (year)
        if (spec.slug === "largest-margin") {
          const e = parseMarginLine(line);
          if (e && sec.kind === "tournament") sec.entries.push(e);
          return;
        }
        if (RE_TOURN_VALUE_PLAYER.test(line)) {
          state.pendingTournFirst = line;
          return;
        }
        if (state.pendingTournFirst) {
          const e = parseTournamentPair(state.pendingTournFirst, line);
          state.pendingTournFirst = undefined;
          if (e && sec.kind === "tournament") sec.entries.push(e);
        }
        return;
      }
      case "table": {
        const e = parseTableStrokeAvg(line);
        if (e && sec.kind === "table") sec.entries.push(e);
        return;
      }
      case "award": {
        const e = parseAwardLine(line);
        if (e && sec.kind === "award") sec.entries.push(e);
        return;
      }
      case "annual-rank": {
        if (sec.kind !== "annual-rank") return;
        if (RE_YEAR_DIVIDER.test(line)) {
          state.currentRankYear = line;
          sec.years.push({ year: line, teams: [] });
          return;
        }
        if (/^(Division I|Team Rankings|Individual Rankings)$/i.test(line)) return;
        const cur = sec.years.at(-1);
        if (cur && RE_ANNUAL_RANK.test(line)) {
          (cur.teams ??= []).push(line);
        }
        return;
      }
      case "all-america": {
        if (sec.kind !== "all-america") return;
        if (RE_YEAR_DIVIDER.test(line)) {
          state.currentAAYear = line;
          sec.years.push({ year: line });
          state.currentAATeam = undefined;
          return;
        }
        const teamHeader = /^(First|Second|Third)\s+Team$/i.exec(line);
        if (teamHeader) {
          state.currentAATeam = teamHeader[1].toLowerCase() as "first" | "second" | "third";
          return;
        }
        if (/^Honorable Mention$/i.test(line)) {
          state.currentAATeam = "honorable";
          return;
        }
        const y = sec.years.at(-1);
        if (y && state.currentAATeam) {
          (y[state.currentAATeam] ??= []).push(line);
        }
        return;
      }
      case "majors": {
        const e = parseMajorsLine(line);
        if (e && sec.kind === "majors") sec.entries.push(e);
        return;
      }
      case "long-running": {
        const e = parseLongRunningLine(line);
        if (e && sec.kind === "long-running") sec.entries.push(e);
        return;
      }
      case "coach": {
        const e = parseCoachLine(line);
        if (e && sec.kind === "coach") sec.entries.push(e);
        return;
      }
    }
  }

  function activateSection(spec: SectionSpec, groupSpec: GroupSpec) {
    state.currentGroup = ensureGroup(groupSpec);
    state.currentSectionSpec = spec;
    state.currentSection = ensureSection(spec, state.currentGroup);
    state.pendingTournFirst = undefined;
    state.currentRankYear = undefined;
    state.currentAAYear = undefined;
    state.currentAATeam = undefined;
  }

  const DEBUG = process.env.RECORDS_DEBUG_SECTION;
  for (let i = 0; i < rawLines.length; i++) {
    let line = cleanLine(rawLines[i]);
    if (!line) {
      state.pendingTournFirst = undefined;
      continue;
    }
    if (DEBUG && state.currentSectionSpec?.slug === DEBUG) {
      // eslint-disable-next-line no-console
      console.error(`[${DEBUG}] L${i} in-section line=${JSON.stringify(line)}`);
    }

    // Strip known watermark / legend fragments. These often sit at the start
    // of a line that also contains a section header.
    line = line
      .replace(/^\*?\s*Bold\s*[-–]\s*Denotes Current Player\s*/i, "")
      .replace(/^\*?\s*Denotes Freshman\s*/i, "")
      .replace(/^\*?\s*Single Season Stroke Average will not be used.*?Pandemic\.?\s*/i, "")
      .replace(/^of the season from the COVID-19 Pandemic\.\s*/i, "")
      .replace(/^\*\s*\d+\s*[-–]\s*36 hole tournament\s*/i, "")
      .replace(/^\*\s*Shot in a 72-hole event\s*/i, "")
      .replace(/^\*\*\s*Minimum \d+ rounds played\s*/i, "")
      .replace(/^Last Updated\s*\d+-\d+-\d+\s*/i, "")
      .replace(/^NCAA Division I\s*/i, "")
      .replace(/^(Women's|Women’s|Men's|Men’s) Golf Record Book\s*/i, "")
      .trim();

    if (!line) continue;

    // Consume any header-like substring, possibly with data before/after.
    // We loop because a line may carry multiple concatenated headers.
    while (line) {
      const split = splitOnHeader(line, titleRegex, sectionIndex, groupIndex);
      if (!split) {
        handleDataLine(line);
        break;
      }
      if (split.before) handleDataLine(split.before);
      if (split.headerKind === "section") {
        const s = split.match as { group: GroupSpec; section: SectionSpec };
        activateSection(s.section, s.group);
      } else {
        // Group banner: keep the current section if it belongs to the same group.
        const g = split.match as GroupSpec;
        state.currentGroup = ensureGroup(g);
      }
      line = split.after ?? "";
    }
  }

  // Preserve registry order
  return groupSpecs
    .map((g) => state.groups.get(g.slug))
    .filter((g): g is RecordGroup => !!g && g.sections.length > 0);
}

// ---------------------------------------------------------------------------
// Post-processing: manual corrections for known PDF artifacts
// ---------------------------------------------------------------------------

/**
 * pdftotext -raw occasionally mangles specific entries in ways our cleanups
 * don't catch. Fix them explicitly so regenerating from a fresh raw dump
 * still produces the correct output.
 *
 * Each correction matches by (gender, slug, player/school) then rewrites the
 * affected fields. Keep the match criteria strict so we don't silently
 * mutate unrelated rows.
 */
function applyKnownCorrections(groups: RecordGroup[], gender: Gender): RecordGroup[] {
  if (gender !== "men") return groups;
  return groups.map((g) => {
    if (g.slug !== "individual-tournament") return g;
    return {
      ...g,
      sections: g.sections.map((s) => {
        if (s.slug !== "lowest-individual-54" || s.kind !== "tournament") return s;
        return {
          ...s,
          entries: s.entries.map((e) => {
            // Dustin Morris row can arrive as: value="-22", player=", 194) - Dustin Morris"
            // (raw PDF line lost its opening paren, which collapses parsing).
            if (
              typeof e.player === "string" &&
              e.player.includes("Dustin Morris") &&
              (e.value === "-22" || !/^\(/.test(e.value))
            ) {
              return {
                ...e,
                value: "(-22, 194)",
                player: "Dustin Morris",
                school: e.school || "Colorado State",
              };
            }
            // Braden Thornberry AutoTrader.com row is missing its total score
            // in the raw PDF, which parses as "(-18, )".
            if (
              e.player === "Braden Thornberry" &&
              e.school === "Ole Miss" &&
              e.value === "(-18, )"
            ) {
              return { ...e, value: "(-18, 198)" };
            }
            return e;
          }),
        };
      }),
    };
  });
}

// ---------------------------------------------------------------------------
// Post-processing: merge human-added manual entries
// ---------------------------------------------------------------------------

/**
 * Merge entries from `src/data/records-manual-entries.json` into the parsed
 * record book so human additions survive PDF regeneration.
 *
 * The manual file is indexed by (gender → groupSlug → sectionSlug). For each
 * matched section we either concat entries (flat-entry kinds) or merge years
 * (annual-rank / all-america). Unknown group/section slugs or mismatched
 * `kind` values throw immediately — that's how we catch typos.
 */
function applyManualEntries(
  groups: RecordGroup[],
  gender: Gender,
  manual: ManualEntriesFile,
): RecordGroup[] {
  const genderBlock = manual[gender];
  if (!genderBlock) return groups;

  // Shallow clone so we can mutate sections by index without touching source.
  const next = groups.map((g) => ({ ...g, sections: [...g.sections] }));

  for (const [groupSlug, groupManual] of Object.entries(genderBlock)) {
    const group = next.find((g) => g.slug === groupSlug);
    if (!group) {
      throw new Error(
        `manual entries reference unknown group: ${gender}/${groupSlug}`,
      );
    }
    for (const [sectionSlug, sectionManual] of Object.entries(groupManual)) {
      const sectionIdx = group.sections.findIndex((s) => s.slug === sectionSlug);
      if (sectionIdx === -1) {
        throw new Error(
          `manual entries reference unknown section: ${gender}/${groupSlug}/${sectionSlug}`,
        );
      }
      const section = group.sections[sectionIdx];
      if (section.kind !== sectionManual.kind) {
        throw new Error(
          `manual entries kind mismatch: ${gender}/${groupSlug}/${sectionSlug} — ` +
            `section is "${section.kind}", manual is "${sectionManual.kind}"`,
        );
      }
      group.sections[sectionIdx] = mergeManualIntoSection(section, sectionManual);
    }
  }

  return next;
}

function mergeManualIntoSection(
  section: RecordSection,
  manual: ManualSectionPayload,
): RecordSection {
  switch (section.kind) {
    case "stat":
      if (manual.kind !== "stat") return section;
      return { ...section, entries: [...section.entries, ...manual.entries] };
    case "tournament":
      if (manual.kind !== "tournament") return section;
      return { ...section, entries: [...section.entries, ...manual.entries] };
    case "table":
      if (manual.kind !== "table") return section;
      return { ...section, entries: [...section.entries, ...manual.entries] };
    case "award":
      if (manual.kind !== "award") return section;
      return { ...section, entries: [...section.entries, ...manual.entries] };
    case "majors":
      if (manual.kind !== "majors") return section;
      return { ...section, entries: [...section.entries, ...manual.entries] };
    case "long-running":
      if (manual.kind !== "long-running") return section;
      return { ...section, entries: [...section.entries, ...manual.entries] };
    case "coach":
      if (manual.kind !== "coach") return section;
      return { ...section, entries: [...section.entries, ...manual.entries] };
    case "annual-rank": {
      if (manual.kind !== "annual-rank") return section;
      const years: AnnualRankYear[] = section.years.map((y) => ({ ...y }));
      for (const my of manual.years) {
        const existing = years.find((y) => y.year === my.year);
        if (existing) {
          if (my.teams) existing.teams = [...(existing.teams ?? []), ...my.teams];
          if (my.individuals)
            existing.individuals = [...(existing.individuals ?? []), ...my.individuals];
        } else {
          years.push({ ...my });
        }
      }
      return { ...section, years };
    }
    case "all-america": {
      if (manual.kind !== "all-america") return section;
      const years: AllAmericaYear[] = section.years.map((y) => ({ ...y }));
      for (const my of manual.years) {
        const existing = years.find((y) => y.year === my.year);
        if (existing) {
          if (my.first) existing.first = [...(existing.first ?? []), ...my.first];
          if (my.second) existing.second = [...(existing.second ?? []), ...my.second];
          if (my.third) existing.third = [...(existing.third ?? []), ...my.third];
          if (my.honorable)
            existing.honorable = [...(existing.honorable ?? []), ...my.honorable];
        } else {
          years.push({ ...my });
        }
      }
      return { ...section, years };
    }
    case "team-aggregate":
      throw new Error(
        `manual entries not supported for "team-aggregate" kind (built at runtime in src/lib/program-records.ts)`,
      );
  }
}

// ---------------------------------------------------------------------------
// Post-processing: synthesize derived sections
// ---------------------------------------------------------------------------

/**
 * Parse a "(par, total)" tuple off a tournament entry's value. Returns null
 * if the value isn't in that shape.
 */
function parseParTotal(value: string): { par: number; total: number } | null {
  const m = /^\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)$/.exec(value);
  if (!m) return null;
  return { par: Number(m[1]), total: Number(m[2]) };
}

/**
 * Pull a sortable date out of a tournament entry's event/round/date fields.
 * Month+day+year ("Feb 8 - 10, 2024") preferred; falls back to year-only
 * which is treated as Jan 1 of that year. Returns null when nothing
 * date-like is present.
 */
const MONTH_INDEX: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};
const MONTH_NAMES_RE =
  "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";

function extractSortDate(e: TournamentEntry): number | null {
  const all = [e.event, e.round, e.date].filter(Boolean).join(" ");
  if (!all) return null;

  // Numeric M/D/YY or M/D/YYYY (women's book format). Allow a stray "?"
  // as a separator where a "/" was mis-OCR'd (e.g. "10?31/23").
  const numericDate = /\b(\d{1,2})[/?](\d{1,2})[/?](\d{2,4})\b/.exec(all);
  if (numericDate) {
    const month = Number(numericDate[1]) - 1;
    const day = Number(numericDate[2]);
    let year = Number(numericDate[3]);
    if (year < 100) year += 2000; // 2-digit → 20YY
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      return Date.UTC(year, month, day);
    }
  }

  // Month-name + day + year ("Feb 8 - 10, 2024" — men's book format).
  const monthDayYear = new RegExp(
    `\\b(${MONTH_NAMES_RE})\\.?\\s+(\\d{1,2})\\b.*?\\b((?:19|20)\\d{2})\\b`,
    "i",
  ).exec(all);
  if (monthDayYear) {
    const month = MONTH_INDEX[monthDayYear[1].toLowerCase()];
    const day = Number(monthDayYear[2]);
    const year = Number(monthDayYear[3]);
    if (month !== undefined && day >= 1 && day <= 31) {
      return Date.UTC(year, month, day);
    }
  }

  // Last resort: first 4-digit year we can find.
  const yearOnly = /\b(19|20)\d{2}\b/.exec(all);
  if (yearOnly) return Date.UTC(Number(yearOnly[0]), 0, 1);

  return null;
}

/**
 * Compare two nullable sort dates. Null sorts first (treated as
 * -infinity), then ascending by date.
 */
function compareDates(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return a - b;
}

/**
 * The PDF lists the 54-hole individual records roughly by score-to-par but
 * with arbitrary tiebreakers within a par group. Normalize: par ascending
 * (most-negative first), then total ascending, then event date ascending
 * (undated entries first). Entries that don't parse as "(par, total)" keep
 * their original relative order appended at the end.
 */
function sortScoreToParSection(groups: RecordGroup[]): RecordGroup[] {
  return groups.map((g) => {
    const idx = g.sections.findIndex((s) => s.slug === "lowest-individual-54");
    if (idx === -1) return g;
    const src = g.sections[idx];
    if (src.kind !== "tournament") return g;

    const parseable: {
      entry: TournamentEntry;
      par: number;
      total: number;
      date: number | null;
    }[] = [];
    const unparseable: TournamentEntry[] = [];
    for (const e of src.entries) {
      const pt = parseParTotal(e.value);
      if (pt) parseable.push({ entry: e, ...pt, date: extractSortDate(e) });
      else unparseable.push(e);
    }
    parseable.sort(
      (a, b) =>
        a.par - b.par ||
        a.total - b.total ||
        compareDates(a.date, b.date),
    );

    const sorted: RecordSection = {
      ...src,
      entries: [...parseable.map((r) => r.entry), ...unparseable],
    };
    const nextSections = [...g.sections];
    nextSections[idx] = sorted;
    return { ...g, sections: nextSections };
  });
}

/**
 * Derive a companion "Total Score" view by flipping the "(par, total)" tuple
 * to "(total, par)" and re-sorting: total ascending, par ascending, event
 * date ascending (undated entries first). Inserted immediately after the
 * Score-to-Par section in the same group.
 */
function addTotalScoreSection(groups: RecordGroup[]): RecordGroup[] {
  return groups.map((g) => {
    const srcIdx = g.sections.findIndex((s) => s.slug === "lowest-individual-54");
    if (srcIdx === -1) return g;
    const src = g.sections[srcIdx];
    if (src.kind !== "tournament") return g;

    type Row = { entry: TournamentEntry; par: number; total: number; date: number | null };
    const rows: Row[] = [];
    for (const e of src.entries) {
      const pt = parseParTotal(e.value);
      if (!pt) continue; // skip entries without a parseable (par, total) tuple
      rows.push({ entry: e, ...pt, date: extractSortDate(e) });
    }
    rows.sort(
      (a, b) =>
        a.total - b.total ||
        a.par - b.par ||
        compareDates(a.date, b.date),
    );

    const derived: RecordSection = {
      kind: "tournament",
      slug: "lowest-individual-54-total",
      title: "Lowest Individual 54 Hole Score (Total Score)",
      entries: rows.map(({ entry, par, total }) => ({
        ...entry,
        value: `(${total}, ${par})`,
      })),
    };

    const nextSections = [...g.sections];
    nextSections.splice(srcIdx + 1, 0, derived);
    return { ...g, sections: nextSections };
  });
}

// ---------------------------------------------------------------------------
// Emit TS data files
// ---------------------------------------------------------------------------

function emitRecordBook(
  gender: Gender,
  groups: RecordGroup[],
  sourceNote: string,
  sourceDate: string,
  rootDir: string,
): void {
  const book: RecordBook = { gender, sourceNote, sourceDate, groups };
  const base = gender === "men" ? "records-men" : "records-women";
  const varName = gender === "men" ? "recordsMen" : "recordsWomen";
  writeFileSync(resolve(rootDir, `src/data/${base}.json`), JSON.stringify(book));
  const loader = [
    `// Re-exports the generated ${base}.json with the correct type.`,
    `// Generated by scripts/build-records.ts.`,
    ``,
    `import type { RecordBook } from "./records-types";`,
    `import data from "./${base}.json";`,
    ``,
    `export const ${varName} = data as RecordBook;`,
    ``,
  ].join("\n");
  writeFileSync(resolve(rootDir, `src/data/${base}.ts`), loader);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

function run() {
  const root = resolve(__dirname, "..");
  const menTxt = readFileSync(resolve(root, "scripts/records-raw/men-raw.txt"), "utf-8");
  const womenTxt = readFileSync(resolve(root, "scripts/records-raw/women-raw.txt"), "utf-8");
  const manual = JSON.parse(
    readFileSync(resolve(root, "src/data/records-manual-entries.json"), "utf-8"),
  ) as ManualEntriesFile;

  const pipeline = (gender: Gender, groups: RecordGroup[]): RecordGroup[] =>
    addTotalScoreSection(
      sortScoreToParSection(
        applyManualEntries(applyKnownCorrections(groups, gender), gender, manual),
      ),
    );

  const menGroups = pipeline("men", parseBook(menTxt, MEN_GROUPS));
  const womenGroups = pipeline("women", parseBook(womenTxt, WOMEN_GROUPS));

  emitRecordBook(
    "men",
    menGroups,
    "Unofficial records compiled by Lindy Brown and staff at Duke University. Republished with permission. Source book was updated Jul 18, 2025 — an updated men's book is expected soon.",
    "2025-07-18",
    root,
  );
  emitRecordBook(
    "women",
    womenGroups,
    "Unofficial records compiled by Lindy Brown and staff at Duke University. Republished with permission.",
    "2026-03-25",
    root,
  );

  const menSum = summarize(menGroups);
  const womenSum = summarize(womenGroups);
  console.log("MEN'S RECORD BOOK");
  console.log(menSum);
  console.log("\nWOMEN'S RECORD BOOK");
  console.log(womenSum);
}

function summarize(groups: RecordGroup[]): string {
  const lines: string[] = [];
  let total = 0;
  for (const g of groups) {
    lines.push(`  ${g.title}`);
    for (const s of g.sections) {
      const n = countEntries(s);
      total += n;
      lines.push(`    - ${s.title}  (${n})`);
    }
  }
  lines.push(`  TOTAL: ${total} entries`);
  return lines.join("\n");
}

function countEntries(s: RecordSection): number {
  switch (s.kind) {
    case "stat":
    case "tournament":
    case "table":
    case "award":
    case "majors":
    case "long-running":
    case "coach":
    case "team-aggregate":
      return s.entries.length;
    case "annual-rank":
      return s.years.reduce((n, y) => n + (y.teams?.length ?? 0) + (y.individuals?.length ?? 0), 0);
    case "all-america":
      return s.years.reduce(
        (n, y) =>
          n +
          (y.first?.length ?? 0) +
          (y.second?.length ?? 0) +
          (y.third?.length ?? 0) +
          (y.honorable?.length ?? 0),
        0,
      );
  }
}

run();
