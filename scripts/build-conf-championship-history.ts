/**
 * Conference-championship history builder.
 *
 * Pulls NCAA Division I men's & women's tournaments from Clippd Scoreboard
 * for the three available seasons (Clippd's API caps at season=2024,
 * 2025, 2026) and produces a normalized history of conference
 * championships at `src/data/conference-championship-history.json`.
 *
 * Data source:
 *   GET https://scoreboard.clippd.com/api/tournaments
 *       ?gender={Men|Women}&division=NCAA%20Division%20I&season=YYYY&limit=2000
 *
 * Schema (one row per conference × gender × season):
 *   {
 *     conference: "B12",                  // canonical code matching rankings + championships-{gender}-2026.ts
 *     conferenceFull: "Big 12 Conference",
 *     gender: "men" | "women",
 *     season: 2024,                       // academic-year-end (Clippd's `season` param)
 *     strokeplay: { tournamentId, name, endDate, clippdUrl, winner? } | null,
 *     matchplay:  { tournamentId, name, endDate, clippdUrl, winner? } | null,
 *   }
 *
 * Winner population — phase 1:
 *   - Current season (2026): pulled from `championships-{men,women}-2026.ts`.
 *     Both stroke-play and match-play winners default to the same value
 *     because the TS file only carries one `winner` field. Phase 2 will
 *     split them via Playwright extraction against the per-tournament URL.
 *   - Past seasons (2024, 2025): left null. Phase 2 will Playwright-scrape
 *     these from `clippdUrl`.
 *
 * Filter logic:
 *   1. Tournament name must contain "championship" (case-insensitive).
 *   2. Apply EXCLUDE_NAME_PATTERNS to drop NCAA Nationals, PGA WORKS,
 *      named invitationals (Mason Rudolph, Bandon Dunes, etc.).
 *   3. Apply CONFERENCE_MAPPINGS — each entry has hostName patterns +
 *      name patterns. The mapping resolves a tournament to a canonical
 *      conference code (or null if no match — those get logged as
 *      "unmapped" so we can extend the table).
 *   4. Group by (code × gender × season), assigning stroke-play vs
 *      match-play based on name patterns.
 *
 * Usage:
 *   npx tsx scripts/build-conf-championship-history.ts             # default: write JSON
 *   npx tsx scripts/build-conf-championship-history.ts --print     # also print to stdout
 *   npx tsx scripts/build-conf-championship-history.ts --debug     # log unmapped + skips
 */

import * as fs from "fs";
import * as path from "path";

import {
  championshipsMen2026,
  type Championship,
} from "../src/data/championships-men-2026";
import { championshipsWomen2026 } from "../src/data/championships-women-2026";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CLIPPD_BASE = "https://scoreboard.clippd.com";
const CLIPPD_API = `${CLIPPD_BASE}/api`;
const SEASONS = [2024, 2025, 2026] as const;
const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: `${CLIPPD_BASE}/rankings`,
};

const OUTPUT_PATH = path.join(
  __dirname,
  "..",
  "src",
  "data",
  "conference-championship-history.json"
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClippdTournament {
  tournamentId: string;
  tournamentName: string;
  gender: string;
  /** Clippd authoritative format flag — "Stroke Play" | "Match Play". */
  eventType: string;
  startDate: string;
  endDate: string;
  hostName: string | null;
  hostConference: string | null;
}

type Gender = "men" | "women";
type Format = "stroke" | "match";

interface TournamentLeg {
  tournamentId: string;
  name: string;
  endDate: string;
  clippdUrl: string;
  winner: string | null;
}

interface ConfChampRow {
  conference: string; // canonical code (matches rankings + championships-*.ts)
  conferenceFull: string;
  gender: Gender;
  season: number;
  strokeplay: TournamentLeg | null;
  matchplay: TournamentLeg | null;
}

interface BuildOutput {
  generatedAt: string;
  source: "clippd-scoreboard";
  seasonsCovered: readonly number[];
  rows: ConfChampRow[];
}

// ---------------------------------------------------------------------------
// Filter — exclude these names regardless of host
// ---------------------------------------------------------------------------

// Substrings (lower-cased) that disqualify a tournament from being a
// conference championship. Hits: NCAA finals, PGA WORKS, named invitationals
// hosted at member schools, and a few odd one-offs spotted in the dataset.
const EXCLUDE_NAME_PATTERNS: string[] = [
  "ncaa di",
  "ncaa division i",
  "pga works",
  "pga work",
  "arcis hbcu",
  "mason rudolph",
  "sahalee players",
  "sahalee",
  "bandon dunes",
  "peoples championship",
  "big 5 golf",
  "big five",
  "metropolitan championship",
  "metropolitan intercollegiate",
  "vsga",
  "general hackler",
  "general james hackler",
  "jayhawk championship",
  "long island collegiate",
  "little three",
  "old waverly",
  "lady bulldog",
  "match play championship at the jimmie",
  "leadership and golf",
  "national women's collegiate golf",
  "conference carolinas", // DII transitional, not on our roster
];

// ---------------------------------------------------------------------------
// Conference mapping table
// ---------------------------------------------------------------------------

interface ConferenceMapping {
  full: string;
  codeMen: string;
  codeWomen: string;
  // hostName matches (with optional " (Men)" / " (Women)" suffix stripped).
  hostNames: string[];
  // tournamentName regex patterns (case-insensitive). Matched as regex,
  // bounded by word boundaries on alpha tokens.
  namePatterns: RegExp[];
}

// Order matters: Mid-American Conference (MAC) MUST come before American
// Athletic Conference (AAC). Otherwise AAC's `\bamerican\s+(athletic|conference)\b`
// matches "American Conference" inside "Mid-American Conference Championship"
// and grabs the row before MAC's pattern is checked.
const CONFERENCE_MAPPINGS: ConferenceMapping[] = [
  {
    full: "Mid-American Conference",
    codeMen: "MAC",
    codeWomen: "MAC",
    hostNames: ["Mid-American Conference"],
    namePatterns: [
      /\bmid-?american\b/i,
      /\bMAC\s+(women's|men's|championship|women’s|men’s)/i,
    ],
  },
  {
    full: "American Athletic Conference",
    codeMen: "AAC",
    codeWomen: "AAC",
    hostNames: ["American Athletic Conference"],
    namePatterns: [
      /\bamerican\s+(athletic|conference)\b/i,
      // Tolerant of curly quotes (U+2019) that Clippd uses inconsistently
      // ("Men's" vs "Men's"). Match "American Men/Women" + word boundary
      // — the trailing quote+s isn't required.
      /\bamerican\s+(men|women)\b/i,
    ],
  },
  {
    full: "Atlantic Coast Conference",
    codeMen: "ACC",
    codeWomen: "ACC",
    hostNames: ["Atlantic Coast Conference"],
    namePatterns: [/\bACC\b/, /\batlantic\s+coast\b/i],
  },
  {
    full: "Atlantic 10 Conference",
    codeMen: "A10",
    codeWomen: "A10",
    hostNames: ["Atlantic 10 Conference"],
    namePatterns: [/\batlantic\s+10\b/i, /\bA-?10\b/],
  },
  {
    full: "ASUN Conference",
    codeMen: "ASUN",
    codeWomen: "ASUN",
    hostNames: ["ASUN Conference"],
    namePatterns: [/\batlantic\s+sun\b/i, /\bASUN\b/],
  },
  {
    full: "Big Ten Conference",
    codeMen: "B10",
    codeWomen: "B10",
    hostNames: ["Big Ten Conference"],
    namePatterns: [/\bbig\s+ten\b/i],
  },
  {
    full: "Big 12 Conference",
    codeMen: "B12",
    codeWomen: "B12",
    hostNames: ["Big 12 Conference"],
    namePatterns: [/\bbig\s+12\b/i],
  },
  {
    full: "Big East Conference",
    codeMen: "BE",
    codeWomen: "BEAST",
    hostNames: ["Big East Conference"],
    namePatterns: [/\bbig\s+east\b/i],
  },
  {
    full: "Big Sky Conference",
    codeMen: "BIGSKY",
    codeWomen: "BSKY",
    hostNames: ["Big Sky Conference"],
    namePatterns: [/\bbig\s+sky\b/i],
  },
  {
    full: "Big South Conference",
    codeMen: "BIGSOUTH",
    codeWomen: "BSOUTH",
    hostNames: ["Big South Conference"],
    namePatterns: [/\bbig\s+south\b/i],
  },
  {
    full: "Big West Conference",
    codeMen: "BWEST",
    codeWomen: "BWEST",
    hostNames: ["Big West Conference"],
    namePatterns: [/\bbig\s+west\b/i],
  },
  {
    full: "Coastal Athletic Association",
    codeMen: "CAA",
    codeWomen: "CAA",
    hostNames: ["Coastal Athletic Association"],
    // "CAA" alone is too short to match safely; require " CAA " or end-anchored
    namePatterns: [/\bCAA\b/, /\bcoastal\s+athletic\b/i],
  },
  {
    full: "Conference USA",
    codeMen: "CUSA",
    codeWomen: "CUSA",
    hostNames: ["Conference USA"],
    namePatterns: [/\bconference\s+usa\b/i, /\bC-?USA\b/i],
  },
  {
    full: "Horizon League",
    codeMen: "HORIZON",
    codeWomen: "HORIZON",
    hostNames: ["Horizon League"],
    namePatterns: [/\bhorizon\s+league\b/i],
  },
  {
    full: "Ivy League",
    codeMen: "IVY",
    codeWomen: "IVY",
    hostNames: ["The Ivy League", "Ivy League"],
    namePatterns: [/\bivy\s+league\b/i],
  },
  {
    full: "Metro Atlantic Athletic Conference",
    codeMen: "MAAC",
    codeWomen: "MAAC",
    hostNames: ["Metro Atlantic Athletic Conference"],
    namePatterns: [/\bMAAC\b/, /\bmetro\s+atlantic\b/i],
  },
  {
    full: "Missouri Valley Conference",
    codeMen: "MVC",
    codeWomen: "MVC",
    hostNames: ["Missouri Valley Conference"],
    namePatterns: [/\bmissouri\s+valley\b/i],
  },
  {
    full: "Mountain West Conference",
    codeMen: "MWC",
    codeWomen: "MWC",
    hostNames: ["Mountain West Conference"],
    namePatterns: [/\bmountain\s+west\b/i],
  },
  {
    full: "Northeast Conference",
    codeMen: "NEC",
    codeWomen: "NEC",
    hostNames: ["Northeast Conference"],
    namePatterns: [/\bnortheast\s+conference\b/i, /\bNEC\b/],
  },
  {
    full: "Ohio Valley Conference",
    codeMen: "OVC",
    codeWomen: "OVC",
    hostNames: ["Ohio Valley Conference"],
    namePatterns: [/\bOVC\b/, /\bohio\s+valley\b/i],
  },
  {
    full: "Pac-12 Conference",
    codeMen: "PAC12",
    codeWomen: "PAC12",
    hostNames: ["Pac-12 Conference"],
    namePatterns: [/\bpac-?12\b/i],
  },
  {
    full: "Patriot League",
    codeMen: "PATRIOT",
    codeWomen: "PATRIOT",
    hostNames: ["Patriot League"],
    namePatterns: [/\bpatriot\s+league\b/i],
  },
  {
    full: "Southeastern Conference",
    codeMen: "SEC",
    codeWomen: "SEC",
    hostNames: ["Southeastern Conference"],
    namePatterns: [/\bSEC\b/],
  },
  {
    full: "Southern Conference",
    codeMen: "SOCON",
    codeWomen: "SOCON",
    hostNames: ["Southern Conference"],
    namePatterns: [/\bSoCon\b/i, /\bsouthern\s+conference\b/i],
  },
  {
    full: "Southland Conference",
    codeMen: "SOUTHLAND",
    codeWomen: "SOUTHLAND",
    hostNames: ["Southland Conference"],
    namePatterns: [/\bsouthland\b/i],
  },
  {
    full: "The Summit League",
    codeMen: "SUMMIT",
    codeWomen: "SUMMIT",
    hostNames: ["The Summit League", "Summit League"],
    namePatterns: [/\bsummit\s+league\b/i],
  },
  {
    full: "Sun Belt Conference",
    codeMen: "SUNBELT",
    codeWomen: "SUNBELT",
    hostNames: ["Sun Belt Conference"],
    namePatterns: [/\bsun\s+belt\b/i],
  },
  {
    full: "Southwestern Athletic Conference",
    codeMen: "SWAC",
    codeWomen: "SWAC",
    hostNames: ["Southwestern Athletic Conference"],
    namePatterns: [/\bSWAC\b/i],
  },
  {
    full: "Western Athletic Conference",
    codeMen: "WAC",
    codeWomen: "WAC",
    hostNames: ["Western Athletic Conference"],
    namePatterns: [/\bWAC\b/, /\bwestern\s+athletic\b/i],
  },
  {
    full: "West Coast Conference",
    codeMen: "WCC",
    codeWomen: "WCC",
    hostNames: ["West Coast Conference"],
    namePatterns: [/\bWCC\b/, /\bwest\s+coast\s+conference\b/i],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(...args: unknown[]) {
  const ts = new Date().toISOString().slice(11, 19);
  console.error(`[conf-history ${ts}]`, ...args);
}

/** Strip " (Men)" / " (Women)" suffix from hostName. */
function normalizeHost(host: string | null): string | null {
  if (!host) return null;
  return host.replace(/\s*\((Men|Women)\)\s*$/i, "").trim();
}

function isExcluded(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDE_NAME_PATTERNS.some((p) => lower.includes(p));
}

function detectFormat(eventType: string | null, name: string): Format {
  // Prefer Clippd's authoritative eventType field. Fall back to scanning
  // the tournament name when eventType is unset (rare in this dataset —
  // distribution is 233 stroke / 38 match across all 6 seasons).
  if (eventType && /match\s*play/i.test(eventType)) return "match";
  if (eventType && /stroke\s*play/i.test(eventType)) return "stroke";
  if (/\bmatch\s*play\b/i.test(name)) return "match";
  return "stroke";
}

/**
 * Resolve a tournament to its canonical conference code in two phases:
 *
 *  1. **hostName** (high confidence) — when the host IS literally a
 *     conference, e.g. hostName="Big 12 Conference" or "Atlantic Coast
 *     Conference (Men)" → exact match against the mapping table.
 *  2. **tournamentName** patterns — used when hostName is empty or a
 *     school. Patterns are tested in CONFERENCE_MAPPINGS order; the
 *     first match wins. MAC is intentionally listed before AAC so
 *     "Mid-American Conference Championship" doesn't accidentally
 *     hit AAC's "American Conference" pattern.
 *
 * `hostConference` is intentionally NOT used — it reflects the host
 * school's CURRENT conference, which is unreliable for retroactive
 * mapping (e.g. Arizona State hosting the 2024 Pac-12 Championship had
 * hostConference="Big 12 Conference" because ASU moved to the Big 12
 * the next year).
 */
function resolveConference(
  hostName: string | null,
  tournamentName: string,
  gender: Gender
): { code: string; full: string } | null {
  const normHost = normalizeHost(hostName);

  // Phase 1: hostName direct match
  if (normHost) {
    for (const m of CONFERENCE_MAPPINGS) {
      if (m.hostNames.some((h) => h.toLowerCase() === normHost.toLowerCase())) {
        return {
          code: gender === "men" ? m.codeMen : m.codeWomen,
          full: m.full,
        };
      }
    }
  }

  // Phase 2: tournamentName pattern match (in declared order)
  for (const m of CONFERENCE_MAPPINGS) {
    if (m.namePatterns.some((re) => re.test(tournamentName))) {
      return {
        code: gender === "men" ? m.codeMen : m.codeWomen,
        full: m.full,
      };
    }
  }
  return null;
}

async function fetchTournaments(
  gender: "Men" | "Women",
  season: number
): Promise<ClippdTournament[]> {
  const url = `${CLIPPD_API}/tournaments?gender=${gender}&division=${encodeURIComponent(
    "NCAA Division I"
  )}&season=${season}&limit=2000`;
  const resp = await fetch(url, { headers: HEADERS });
  if (!resp.ok) {
    throw new Error(`${gender} ${season} fetch failed: HTTP ${resp.status}`);
  }
  const body = (await resp.json()) as { results?: ClippdTournament[] };
  return body.results ?? [];
}

/**
 * Build the index of canonical-code → winner from the championships-2026.ts
 * file for current-season winner attribution. Keyed by `${gender}:${code}`.
 */
function buildCurrentWinnerIndex(): Map<string, string> {
  const idx = new Map<string, string>();
  for (const c of championshipsMen2026 as Championship[]) {
    if (c.winner) idx.set(`men:${c.conference}`, c.winner);
  }
  for (const c of championshipsWomen2026 as Championship[]) {
    if (c.winner) idx.set(`women:${c.conference}`, c.winner);
  }
  return idx;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const debug = args.includes("--debug");
  const printOnly = args.includes("--print");

  const winnerIndex = buildCurrentWinnerIndex();
  log(`current-season winner index: ${winnerIndex.size} entries`);

  // Collect every tournament that maps cleanly to a conference. We dedupe
  // AFTER the full sweep so we can compare candidates against each other —
  // this matters for cases like 2026 Horizon men where Clippd has both an
  // Oakland-hosted record (school) and a Horizon-League-hosted record
  // (conference) for the same event.
  type SlotKey = string; // `${code}|${gender}|${season}|${format}`
  interface Candidate {
    leg: TournamentLeg;
    hostName: string | null;
    isConferenceHosted: boolean;
  }
  const candidates = new Map<SlotKey, Candidate[]>();

  // Track row metadata (conferenceFull etc.) keyed by (code|gender|season).
  type RowKey = string;
  const rowMeta = new Map<
    RowKey,
    Pick<ConfChampRow, "conference" | "conferenceFull" | "gender" | "season">
  >();

  const unmapped: string[] = [];
  const excluded: string[] = [];

  for (const season of SEASONS) {
    for (const genderRaw of ["Men", "Women"] as const) {
      const gender: Gender = genderRaw === "Men" ? "men" : "women";
      log(`fetching ${genderRaw} season=${season}`);
      const all = await fetchTournaments(genderRaw, season);

      const champs = all.filter((t) =>
        (t.tournamentName || "").toLowerCase().includes("championship")
      );

      for (const t of champs) {
        const name = t.tournamentName || "";
        if (isExcluded(name)) {
          excluded.push(`${gender} ${season}: ${name}`);
          continue;
        }

        const resolved = resolveConference(t.hostName, name, gender);
        if (!resolved) {
          unmapped.push(
            `${gender} ${season}: [${t.hostName ?? "<none>"}] ${name}`
          );
          continue;
        }

        const fmt = detectFormat(t.eventType ?? null, name);
        const rowKey: RowKey = `${resolved.code}|${gender}|${season}`;
        const slotKey: SlotKey = `${rowKey}|${fmt}`;

        rowMeta.set(rowKey, {
          conference: resolved.code,
          conferenceFull: resolved.full,
          gender,
          season,
        });

        const leg: TournamentLeg = {
          tournamentId: t.tournamentId,
          name,
          endDate: t.endDate,
          clippdUrl: `${CLIPPD_BASE}/tournaments/${t.tournamentId}`,
          // Phase 1: only attach the current-season TS-file winner. Past
          // seasons stay null until Phase 2 Playwright extraction. The
          // championships-2026.ts file has one `winner` per conference;
          // attribute it to whichever leg this is — Phase 2 will refine.
          winner:
            season === 2026
              ? winnerIndex.get(`${gender}:${resolved.code}`) ?? null
              : null,
        };

        // "Conference-hosted" means hostName looks like a conference (i.e.
        // it appears in any mapping's hostNames list, after stripping the
        // gender suffix). Used as the dedupe tiebreaker.
        const normHost = normalizeHost(t.hostName);
        const isConfHosted = normHost
          ? CONFERENCE_MAPPINGS.some((m) =>
              m.hostNames.some(
                (h) => h.toLowerCase() === normHost.toLowerCase()
              )
            )
          : false;

        const list = candidates.get(slotKey) ?? [];
        list.push({ leg, hostName: t.hostName, isConferenceHosted: isConfHosted });
        candidates.set(slotKey, list);
      }
    }
  }

  // Dedupe each (code, gender, season, format) bucket. Preference order:
  //   1. Conference-hosted records over school-hosted records.
  //   2. Lower tournamentId (earliest Clippd ingestion — usually canonical).
  // Log every collision so the diagnostics call out real Clippd duplicates
  // we can flag upstream if needed.
  const grouped = new Map<RowKey, ConfChampRow>();
  for (const [rowKey, meta] of rowMeta.entries()) {
    grouped.set(rowKey, { ...meta, strokeplay: null, matchplay: null });
  }

  for (const [slotKey, cands] of candidates.entries()) {
    const [rowKey, fmt] = (() => {
      const parts = slotKey.split("|");
      return [parts.slice(0, 3).join("|"), parts[3] as Format] as const;
    })();
    const row = grouped.get(rowKey)!;
    cands.sort((a, b) => {
      if (a.isConferenceHosted !== b.isConferenceHosted) {
        return a.isConferenceHosted ? -1 : 1; // conf-hosted first
      }
      // Numeric comparison on tournamentId (string IDs but they're numeric)
      const an = Number(a.leg.tournamentId);
      const bn = Number(b.leg.tournamentId);
      if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
      return a.leg.tournamentId.localeCompare(b.leg.tournamentId);
    });
    const chosen = cands[0];
    if (cands.length > 1) {
      const losers = cands
        .slice(1)
        .map((c) => `${c.leg.tournamentId}(${c.hostName ?? "<none>"})`)
        .join(", ");
      log(
        `dedup ${slotKey}: kept ${chosen.leg.tournamentId} (${chosen.hostName ?? "<none>"}); dropped [${losers}]`
      );
    }
    if (fmt === "match") row.matchplay = chosen.leg;
    else row.strokeplay = chosen.leg;
  }

  // Sort rows for stable diff: by season, gender, conference code
  const rows = Array.from(grouped.values()).sort((a, b) => {
    if (a.season !== b.season) return a.season - b.season;
    if (a.gender !== b.gender) return a.gender.localeCompare(b.gender);
    return a.conference.localeCompare(b.conference);
  });

  const output: BuildOutput = {
    generatedAt: new Date().toISOString(),
    source: "clippd-scoreboard",
    seasonsCovered: SEASONS,
    rows,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n");
  log(`wrote ${OUTPUT_PATH}: ${rows.length} rows`);

  // Per-season summary
  const byGenderSeason = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.gender} ${r.season}`;
    byGenderSeason.set(key, (byGenderSeason.get(key) ?? 0) + 1);
  }
  for (const [k, v] of [...byGenderSeason.entries()].sort()) {
    log(`  ${k}: ${v} rows`);
  }

  if (debug) {
    log(`\n=== EXCLUDED (${excluded.length}) ===`);
    for (const e of excluded) log(`  ${e}`);
    log(`\n=== UNMAPPED (${unmapped.length}) ===`);
    for (const u of unmapped) log(`  ${u}`);
  } else {
    log(
      `excluded=${excluded.length} unmapped=${unmapped.length} (use --debug to list)`
    );
  }

  if (printOnly) {
    process.stdout.write(JSON.stringify(output, null, 2) + "\n");
  }

  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error("[conf-history ERROR]", err);
    process.exit(1);
  }
);
