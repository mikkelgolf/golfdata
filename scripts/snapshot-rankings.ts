/**
 * Snapshot rankings into the archive at
 * `src/data/rankings-archive/{men,women}/YYYY-MM-DD.ts`, then regenerate
 * the per-gender `index.ts` so the helper at
 * `src/lib/rankings-archive.ts` can statically import the entries.
 *
 * Modes
 * -----
 *   --from-live [--force] [--require-publication-day]
 *       Snapshot today's live rankings (`src/data/rankings-{men,women}.ts`)
 *       into the archive, dated YYYY-MM-DD (today, UTC). This is the mode
 *       wired into `daily-refresh.sh` after a successful Clippd pull.
 *
 *       Content-aware dedup is ON by default: if today's live data
 *       fingerprint (events / W-L-T / AQ / eventsWon / eventsTop3) matches
 *       the most recent prior snapshot, we skip writing. NCAA only
 *       publishes new rankings on certain days; on off days Clippd's
 *       leaderboard API still returns rows but the substantive fields
 *       are unchanged — only derived metrics (rank, avgPoints,
 *       strengthOfSchedule, adjustedScore) drift. We don't want to
 *       archive that drift as if it were a real publication.
 *
 *       `--force` overrides dedup and always writes (useful for testing
 *       or if you've manually edited the live file and want the new
 *       state captured).
 *
 *       `--require-publication-day` is the option-b prep flag — it gates
 *       writes on `isPublicationDay(date, gender)`, which today is a
 *       stub returning true. When the NCAA publication calendar lands,
 *       fill in that function and flip the flag on in daily-refresh.sh.
 *
 *   --from-clippd-json <path>
 *       Read a raw Clippd leaderboard JSON (the kind written to
 *       `data/clippd/rankings-YYYY-MM-DD.json`) and write archive
 *       entries for both genders, dated by the JSON's `pulledAt` (UTC
 *       date). Used for backfilling historical snapshots from JSONs we
 *       already have on disk. Dedup does NOT run in this mode — historical
 *       backfills are intentional and should always write.
 *
 *   --regen-index
 *       Just rebuild the per-gender `index.ts` files. Useful after
 *       hand-editing or moving snapshot TS files around.
 *
 * Notes on AQ flags + coords
 * --------------------------
 * Backfilled-from-raw-JSON entries copy `isAutoQualifier` / `aqConference`
 * / `lat` / `lng` from the CURRENT live `rankings-{gender}.ts` file
 * (best-effort: AQ flags change as conference championships are decided,
 * so historical entries may misattribute AQ status. The `source` field
 * tags backfilled entries so consumers know to take AQ with a grain of
 * salt).
 */

import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";
import { rankingsMen as liveMen, type TeamData } from "../src/data/rankings-men";
import { rankingsWomen as liveWomen } from "../src/data/rankings-women";
import { normalizeConference } from "../src/data/conference-codes";

type Gender = "men" | "women";

// Mirror of CONFERENCE_OVERRIDES from scripts/scrape-clippd-teams.ts. Keep in
// sync — these patch known-bad Clippd conference assignments at backfill
// time so historical archive entries match the live rankings file.
const CONFERENCE_OVERRIDES: Record<string, string> = {
  "women:Dayton": "A10",
  "women:Duquesne": "A10",
  "women:Saint Josephs": "A10",
};

// Repo paths
const REPO_ROOT = path.join(__dirname, "..");
const ARCHIVE_ROOT = path.join(REPO_ROOT, "src", "data", "rankings-archive");

interface RawClippdRow {
  schoolName: string;
  boardName: string;
  conference: string;
  rank: number;
  averagePoints: number;
  totalPoints?: number;
  totalWeight?: number;
  regionalRank?: number;
  divisionalRank?: number;
  strokePlayEvents: number;
  strokePlayRounds?: number;
  matchPlayEvents?: number;
  matchPlayRounds?: number;
  eventsWon: number;
  eventsTop3: number;
  strengthOfSchedule: number;
  strengthOfScheduleRank: number;
  averageScore?: number;
  adjustedScore: number;
  winLossTie: string;
  division: string;
  gender: string;
  rankingDate?: string;
}

interface RawClippdPull {
  pulledAt: string;
  season: number;
  men: RawClippdRow[];
  women: RawClippdRow[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseWLT(s: string): { wins: number; losses: number; ties: number } {
  // "145-21-2" → { wins: 145, losses: 21, ties: 2 }. Defensive: missing
  // segments default to 0 so a malformed row doesn't crash the seed.
  const [w = "0", l = "0", t = "0"] = s.split("-");
  return {
    wins: parseInt(w, 10) || 0,
    losses: parseInt(l, 10) || 0,
    ties: parseInt(t, 10) || 0,
  };
}

function deriveEligible(wins: number, losses: number, ties: number): boolean {
  const total = wins + losses + ties;
  if (total === 0) return false;
  return wins + ties * 0.5 >= total * 0.5;
}

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function pulledAtToDate(pulledAt: string): string {
  // ISO timestamp → YYYY-MM-DD (UTC).
  return pulledAt.slice(0, 10);
}

interface TeamLookup {
  isAQ: Map<string, string>; // boardName → aqConference
  coords: Map<string, { lat: number; lng: number }>;
}

function buildLookupFromLive(gender: Gender): TeamLookup {
  const live = gender === "men" ? liveMen : liveWomen;
  const isAQ = new Map<string, string>();
  const coords = new Map<string, { lat: number; lng: number }>();
  for (const t of live) {
    if (t.isAutoQualifier && t.aqConference) {
      isAQ.set(t.team, t.aqConference);
    }
    if (t.lat || t.lng) {
      coords.set(t.team, { lat: t.lat, lng: t.lng });
    }
  }
  return { isAQ, coords };
}

function rowToTeamData(
  row: RawClippdRow,
  gender: Gender,
  lookup: TeamLookup
): TeamData {
  const { wins, losses, ties } = parseWLT(row.winLossTie);
  const overrideKey = `${gender}:${row.boardName}`;
  const conf =
    CONFERENCE_OVERRIDES[overrideKey] ??
    normalizeConference(row.conference, gender) ??
    row.conference;
  const aqConf = lookup.isAQ.get(row.boardName) ?? null;
  const c = lookup.coords.get(row.boardName);
  return {
    rank: row.rank,
    team: row.boardName,
    conference: conf,
    events: row.strokePlayEvents,
    wins,
    losses,
    ties,
    eligible: deriveEligible(wins, losses, ties),
    isAutoQualifier: aqConf !== null,
    aqConference: aqConf,
    lat: c?.lat ?? 0,
    lng: c?.lng ?? 0,
    avgPoints: roundTo(row.averagePoints, 2),
    strengthOfSchedule: roundTo(row.strengthOfSchedule, 4),
    strengthOfScheduleRank: row.strengthOfScheduleRank,
    adjustedScore: roundTo(row.adjustedScore, 2),
    eventsWon: row.eventsWon,
    eventsTop3: row.eventsTop3,
  };
}

function roundTo(n: number, places: number): number {
  const factor = Math.pow(10, places);
  return Math.round(n * factor) / factor;
}

// ---------------------------------------------------------------------------
// Snapshot file writer
// ---------------------------------------------------------------------------

function snapshotFilePath(gender: Gender, date: string): string {
  return path.join(ARCHIVE_ROOT, gender, `${date}.ts`);
}

function snapshotVarName(date: string): string {
  // 2026-04-29 → snap_2026_04_29 (valid TS identifier, sortable).
  return `snap_${date.replace(/-/g, "_")}`;
}

function writeSnapshotFile(
  gender: Gender,
  date: string,
  pulledAt: string,
  label: string | null,
  source: string,
  teams: TeamData[]
): void {
  ensureDir(path.join(ARCHIVE_ROOT, gender));
  const lines: string[] = [];
  lines.push(
    `// AUTO-GENERATED — do not edit by hand.`,
    `// Written by: scripts/snapshot-rankings.ts`,
    `// Source: ${source}`,
    ``,
    `import type { RankingsSnapshot } from "@/lib/rankings-archive";`,
    ``,
    `const snapshot: RankingsSnapshot = {`,
    `  date: ${JSON.stringify(date)},`,
    `  gender: ${JSON.stringify(gender)},`,
    `  pulledAt: ${JSON.stringify(pulledAt)},`,
    `  label: ${label === null ? "null" : JSON.stringify(label)},`,
    `  source: ${JSON.stringify(source)},`,
    `  teams: [`
  );
  for (const t of teams) {
    lines.push(`    ${JSON.stringify(t)},`);
  }
  lines.push(`  ],`, `};`, ``, `export default snapshot;`, ``);
  fs.writeFileSync(snapshotFilePath(gender, date), lines.join("\n"));
}

// ---------------------------------------------------------------------------
// Index regen
// ---------------------------------------------------------------------------

function listSnapshotDates(gender: Gender): string[] {
  const dir = path.join(ARCHIVE_ROOT, gender);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.ts$/.test(f))
    .map((f) => f.replace(/\.ts$/, ""))
    .sort();
}

function regenIndex(gender: Gender): void {
  const dates = listSnapshotDates(gender);
  const archiveVar = gender === "men" ? "archiveMen" : "archiveWomen";
  const latestVar = gender === "men" ? "latestDateMen" : "latestDateWomen";
  const lines: string[] = [];
  lines.push(
    `// AUTO-GENERATED — do not edit by hand.`,
    `// Regenerate with: npx tsx scripts/snapshot-rankings.ts --regen-index`,
    `//`,
    `// Maps date (YYYY-MM-DD) → snapshot for the ${gender}'s rankings archive.`,
    `// \`${latestVar}\` is the most recent date present (lexicographic sort`,
    `// works because all keys are ISO YYYY-MM-DD).`,
    ``,
    `import type { RankingsSnapshot } from "@/lib/rankings-archive";`
  );
  for (const d of dates) {
    lines.push(`import ${snapshotVarName(d)} from "./${d}";`);
  }
  lines.push(
    ``,
    `export const ${archiveVar}: Record<string, RankingsSnapshot> = {`
  );
  for (const d of dates) {
    lines.push(`  ${JSON.stringify(d)}: ${snapshotVarName(d)},`);
  }
  lines.push(`};`, ``);
  if (dates.length === 0) {
    lines.push(`export const ${latestVar}: string | null = null;`);
  } else {
    const latest = dates[dates.length - 1];
    lines.push(`export const ${latestVar}: string = ${JSON.stringify(latest)};`);
  }
  lines.push(``);
  fs.writeFileSync(path.join(ARCHIVE_ROOT, gender, "index.ts"), lines.join("\n"));
}

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

interface FromLiveOpts {
  label: string | null;
  /** Bypass content-aware dedup and always write today's snapshot. */
  force: boolean;
  /** Option-b gate: skip writes on non-publication days. Stubbed today. */
  requirePublicationDay: boolean;
}

function snapshotFromLive(opts: FromLiveOpts): void {
  const date = todayUtcDate();
  const pulledAt = new Date().toISOString();

  // Two-phase decide-then-write so we can COUPLE the genders. If either
  // gender's content has changed (fingerprint differs from the previous
  // snapshot), we write BOTH — keeping the archive symmetric so a user
  // selecting a date always finds matching men's + women's entries.
  // Per David Tenneson (2026-04-29): "if there is a rankings change on
  // the men's side but the women are the same, we still want to keep
  // the update for both."
  //
  // The exception is hard gates like publication-day (option-b): if
  // women's calendar firmly says "not a publication day today" we won't
  // coupled-write women just because men changed. `decideWrite`
  // distinguishes soft skips (overridable=true, dedup match) from hard
  // skips (overridable=false, publication-day gate).
  const decisions: Record<Gender, WriteDecision> = {
    men: decideWrite("men", date, liveMen, {
      force: opts.force,
      requirePublicationDay: opts.requirePublicationDay,
    }),
    women: decideWrite("women", date, liveWomen, {
      force: opts.force,
      requirePublicationDay: opts.requirePublicationDay,
    }),
  };

  const anyWrite = decisions.men.write || decisions.women.write;
  let wroteAny = false;

  for (const gender of ["men", "women"] as const) {
    const teams = gender === "men" ? liveMen : liveWomen;
    const decision = decisions[gender];
    let shouldWrite = decision.write;
    let reason = decision.reason;

    // Coupling: if the OTHER gender wants to write and this gender's
    // skip is overridable (soft — fingerprint match), upgrade to write.
    if (!shouldWrite && decision.overridable && anyWrite) {
      const other = gender === "men" ? "women" : "men";
      shouldWrite = true;
      reason = `coupled with ${other} change (own dedup: ${decision.reason})`;
    }

    if (!shouldWrite) {
      console.log(`  ⊘ skip ${gender} ${date} — ${reason}`);
      continue;
    }
    writeSnapshotFile(
      gender,
      date,
      pulledAt,
      opts.label,
      "live-rankings-ts",
      teams
    );
    console.log(
      `  ✓ wrote ${snapshotFilePath(gender, date)} (${teams.length} teams) — ${reason}`
    );
    wroteAny = true;
  }
  // Always regen the index files: cheap, idempotent, and ensures the
  // generated TypeScript stays consistent with whatever's on disk.
  for (const gender of ["men", "women"] as const) {
    regenIndex(gender);
    console.log(`  ✓ regen index ${gender}`);
  }
  if (!wroteAny) {
    console.log(
      `  (no new snapshots written — both genders' content matches existing archive entries)`
    );
  }
}

// ---------------------------------------------------------------------------
// Should-we-write decision
// ---------------------------------------------------------------------------

interface WriteDecision {
  write: boolean;
  /**
   * When `write: false`, can a coupled write (the OTHER gender wants to
   * write) override this skip?
   *   - true  → soft skip. Today's only soft skip is "fingerprint
   *             matches previous snapshot". If the other gender's
   *             content changed, we couple-write this gender too so the
   *             archive stays in sync.
   *   - false → hard skip. Cannot be overridden. Today's hard skips:
   *             publication-day gate (option-b) — if NCAA didn't
   *             publish for this gender, we won't pretend they did just
   *             because the other gender did.
   * Ignored when `write: true`.
   */
  overridable: boolean;
  reason: string;
}

interface DecideOpts {
  force: boolean;
  requirePublicationDay: boolean;
}

/**
 * Single hook for "should we write a snapshot for `gender` on `date`?"
 * Today encapsulates content-aware dedup (option-a). When the NCAA
 * publication calendar lands (option-b), `isPublicationDay` gets real
 * logic and `--require-publication-day` starts gating writes — no
 * structural changes needed here.
 */
function decideWrite(
  gender: Gender,
  date: string,
  liveTeams: TeamData[],
  opts: DecideOpts
): WriteDecision {
  if (opts.force) {
    return { write: true, overridable: false, reason: "--force flag" };
  }

  // Hard gate: publication-day check (option-b). If NCAA didn't publish
  // for this gender today, skip — and don't let coupling override us.
  if (opts.requirePublicationDay && !isPublicationDay(date, gender)) {
    return {
      write: false,
      overridable: false,
      reason: `${date} is not an NCAA publication day for ${gender}`,
    };
  }

  // Content-aware dedup. Compare the incoming live data's fingerprint
  // against the most recent prior snapshot's fingerprint. If they match,
  // NCAA hasn't actually published anything new — Clippd recomputed
  // derived metrics but the substantive fields (events / W-L-T / AQ /
  // eventsWon / eventsTop3) are unchanged. Mark as soft skip — if the
  // other gender's content changed, we'll still couple-write this one.
  const existing = listSnapshotDates(gender).filter((d) => d !== date);
  if (existing.length === 0) {
    return {
      write: true,
      overridable: false,
      reason: "no prior snapshot to dedup against",
    };
  }
  const previousDate = existing[existing.length - 1];
  let previousTeams: TeamData[];
  try {
    previousTeams = readSnapshotFile(gender, previousDate).teams;
  } catch (err) {
    return {
      write: true,
      overridable: false,
      reason: `couldn't read previous snapshot ${previousDate} (${(err as Error).message}) — writing anyway`,
    };
  }
  const previousFp = contentFingerprint(previousTeams);
  const liveFp = contentFingerprint(liveTeams);
  if (previousFp === liveFp) {
    return {
      write: false,
      overridable: true,
      reason: `content fingerprint matches ${previousDate} (no NCAA publication detected — pass --force to override)`,
    };
  }
  return {
    write: true,
    overridable: false,
    reason: `content differs from ${previousDate}`,
  };
}

/**
 * Stub for option-b. Today returns `true` for every date — i.e. the
 * `--require-publication-day` flag is a no-op until this is filled in.
 *
 * When option-b is wired up:
 *   1. Encode NCAA's regular-season publication calendar (typically
 *      Wednesdays during the spring season; verify the actual cadence
 *      and any postseason quirks).
 *   2. Add manual override hooks for one-off weeks (regionals, finals,
 *      bye weeks) where the calendar drifts.
 *   3. Flip `--require-publication-day` on in scripts/daily-refresh.sh
 *      so the LaunchAgent stops writing snapshots on off days.
 *
 * The function takes `gender` because in principle men's and women's
 * publication days could differ (different season cadence, separate
 * announcements). Today they don't — kept as a parameter so the API
 * doesn't change when we differentiate later.
 */
function isPublicationDay(_date: string, _gender: Gender): boolean {
  // TODO(option-b): replace with real NCAA publication-day calendar.
  return true;
}

/**
 * Stable SHA-256 hash over the substantive fields of a snapshot.
 *
 * Covers EVERY team in the array (sorted by canonical team name then
 * mapped — no sampling, no top-N truncation). This matters because on
 * a typical NCAA publication only ~10% of teams pick up new tournament
 * results — if we hashed only the top 25 we'd miss most real changes.
 * The full sort+join means a single events-played bump on team #150
 * still flips the hash.
 *
 * Included (substantive — change only when NCAA ingests new tournament
 * data):
 *   team           — name (catches Clippd renaming a school mid-season)
 *   conference     — conference assignment (catches realignments)
 *   events         — strokePlayEvents played
 *   wins/losses/ties — head-to-head record
 *   isAutoQualifier + aqConference — AQ status (changes as conference
 *                    championships are decided)
 *   eventsWon      — tournament wins
 *   eventsTop3     — top-3 finishes
 *
 * Excluded (derived — Clippd recomputes daily, drifts even when NCAA
 * has published nothing new):
 *   rank, avgPoints, strengthOfSchedule, strengthOfScheduleRank,
 *   adjustedScore — all functions of the substantive fields plus the
 *     algorithm; we explicitly want to ignore drift in the algorithm's
 *     output for dedup purposes
 *   eligible — derived from W-L-T (already covered by W/L/T fields)
 *   lat/lng — static team metadata; doesn't change with rankings
 *
 * If a future schema change adds a new substantive field, ADD IT HERE
 * — otherwise dedup will silently miss real updates. (Kept the field
 * list explicit rather than reflective so this stays loud at review
 * time.)
 */
function contentFingerprint(teams: TeamData[]): string {
  const sorted = [...teams].sort((a, b) => a.team.localeCompare(b.team));
  const lines = sorted.map((t) =>
    [
      t.team,
      t.conference,
      t.events,
      t.wins,
      t.losses,
      t.ties,
      t.isAutoQualifier ? "1" : "0",
      t.aqConference ?? "",
      t.eventsWon,
      t.eventsTop3,
    ].join("|")
  );
  // Prefix with team count so adding/removing a team flips the hash
  // even if the surviving teams' lines are otherwise identical.
  const body = `n=${sorted.length}\n${lines.join("\n")}`;
  return createHash("sha256").update(body).digest("hex");
}

/**
 * Read an existing snapshot file from disk and return its `teams`
 * array. We don't dynamically `import` the file because the snapshot
 * source uses the `@/...` path alias and tsx's resolver doesn't pick
 * that up without extra config. Each team row was written via
 * `JSON.stringify(t)` on its own line, so we can scan and JSON.parse.
 */
function readSnapshotFile(
  gender: Gender,
  date: string
): { teams: TeamData[] } {
  const p = snapshotFilePath(gender, date);
  if (!fs.existsSync(p)) {
    throw new Error(`no snapshot file at ${p}`);
  }
  const src = fs.readFileSync(p, "utf-8");
  const teams: TeamData[] = [];
  for (const line of src.split("\n")) {
    const trimmed = line.trim().replace(/,$/, "");
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        teams.push(JSON.parse(trimmed) as TeamData);
      } catch {
        // Non-team lines (comments, prelude) — skip silently.
      }
    }
  }
  if (teams.length === 0) {
    throw new Error(`no team rows parsed from ${p}`);
  }
  return { teams };
}

function snapshotFromClippdJson(jsonPath: string, label: string | null): void {
  const abs = path.isAbsolute(jsonPath)
    ? jsonPath
    : path.join(process.cwd(), jsonPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`clippd JSON not found: ${abs}`);
  }
  const raw = JSON.parse(fs.readFileSync(abs, "utf-8")) as RawClippdPull;
  const date = pulledAtToDate(raw.pulledAt);
  const lookups: Record<Gender, TeamLookup> = {
    men: buildLookupFromLive("men"),
    women: buildLookupFromLive("women"),
  };
  for (const gender of ["men", "women"] as const) {
    const rows = (gender === "men" ? raw.men : raw.women).filter(
      (r) => r.division === "NCAA Division I"
    );
    rows.sort((a, b) => a.rank - b.rank);
    const teams = rows.map((r) => rowToTeamData(r, gender, lookups[gender]));
    writeSnapshotFile(
      gender,
      date,
      raw.pulledAt,
      label,
      "clippd-leaderboard-api-historical-json",
      teams
    );
    console.log(
      `  ✓ wrote ${snapshotFilePath(gender, date)} (${teams.length} teams, from ${path.basename(abs)})`
    );
  }
  for (const gender of ["men", "women"] as const) {
    regenIndex(gender);
    console.log(`  ✓ regen index ${gender}`);
  }
}

function regenIndexOnly(): void {
  for (const gender of ["men", "women"] as const) {
    regenIndex(gender);
    console.log(`  ✓ regen index ${gender}`);
  }
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseLabel(args: string[]): string | null {
  const idx = args.indexOf("--label");
  if (idx === -1) return null;
  const v = args[idx + 1];
  return v && !v.startsWith("--") ? v : null;
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function main(): void {
  const args = process.argv.slice(2);
  const mode = args[0];
  const label = parseLabel(args);
  switch (mode) {
    case "--from-live":
      console.log("=== snapshot-rankings: --from-live ===");
      snapshotFromLive({
        label,
        force: hasFlag(args, "--force"),
        requirePublicationDay: hasFlag(args, "--require-publication-day"),
      });
      break;
    case "--from-clippd-json": {
      const p = args[1];
      if (!p) {
        console.error("error: --from-clippd-json requires a path argument");
        process.exit(1);
      }
      console.log(`=== snapshot-rankings: --from-clippd-json ${p} ===`);
      snapshotFromClippdJson(p, label);
      break;
    }
    case "--regen-index":
      console.log("=== snapshot-rankings: --regen-index ===");
      regenIndexOnly();
      break;
    default:
      console.error(
        "usage:\n" +
          "  npx tsx scripts/snapshot-rankings.ts --from-live [--label <name>] [--force] [--require-publication-day]\n" +
          "  npx tsx scripts/snapshot-rankings.ts --from-clippd-json <path> [--label <name>]\n" +
          "  npx tsx scripts/snapshot-rankings.ts --regen-index"
      );
      process.exit(1);
  }
}

main();
