/**
 * Update `src/data/active-rankings.json` — the pin that tells the
 * Regional Predictions page which archived rankings snapshot to render.
 *
 * Usage
 * -----
 *   npx tsx scripts/set-active-rankings.ts \
 *     --gender men|women \
 *     --date YYYY-MM-DD \
 *     [--label "frozen-for-regionals"] \
 *     [--by "Mikkel Bjerch-Andresen"]
 *
 *   npx tsx scripts/set-active-rankings.ts --gender men --clear
 *   npx tsx scripts/set-active-rankings.ts --show
 *
 * Behaviour
 * ---------
 *   Set: writes a pin object { date, label, setAt: now, setBy }.
 *        Validates that an archive entry exists for that date.
 *   Clear: writes `null` for that gender, falling back to "use latest".
 *   Show: prints the current pin state without modifying anything.
 *
 * The refresh pipeline (daily-refresh.sh) NEVER touches this file. New
 * snapshots get archived but the pin only flips when this script runs.
 */

import * as fs from "fs";
import * as path from "path";

type Gender = "men" | "women";

interface ActivePin {
  date: string;
  label: string | null;
  setAt: string;
  setBy: string | null;
}

interface ActiveRankingsConfig {
  men: ActivePin | null;
  women: ActivePin | null;
}

const REPO_ROOT = path.join(__dirname, "..");
const CONFIG_PATH = path.join(REPO_ROOT, "src", "data", "active-rankings.json");
const ARCHIVE_ROOT = path.join(REPO_ROOT, "src", "data", "rankings-archive");

function readConfig(): ActiveRankingsConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    return { men: null, women: null };
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) as ActiveRankingsConfig;
}

function writeConfig(cfg: ActiveRankingsConfig): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n");
}

function snapshotExists(gender: Gender, date: string): boolean {
  return fs.existsSync(path.join(ARCHIVE_ROOT, gender, `${date}.ts`));
}

function isoDateOk(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function getArg(args: string[], flag: string): string | null {
  const idx = args.indexOf(flag);
  if (idx === -1) return null;
  const v = args[idx + 1];
  return v && !v.startsWith("--") ? v : null;
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function show(cfg: ActiveRankingsConfig): void {
  const fmt = (g: Gender) => {
    const pin = cfg[g];
    if (!pin) return `${g}: (unpinned — uses latest)`;
    const label = pin.label ? ` "${pin.label}"` : "";
    const by = pin.setBy ? ` by ${pin.setBy}` : "";
    return `${g}: ${pin.date}${label} (set ${pin.setAt}${by})`;
  };
  console.log(fmt("men"));
  console.log(fmt("women"));
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0 || hasFlag(args, "--help") || hasFlag(args, "-h")) {
    console.log(
      "usage:\n" +
        "  set-active-rankings --gender <men|women> --date YYYY-MM-DD [--label NAME] [--by NAME]\n" +
        "  set-active-rankings --gender <men|women> --clear\n" +
        "  set-active-rankings --show"
    );
    process.exit(0);
  }

  const cfg = readConfig();

  if (hasFlag(args, "--show")) {
    show(cfg);
    return;
  }

  const genderArg = getArg(args, "--gender");
  if (genderArg !== "men" && genderArg !== "women") {
    console.error("error: --gender must be 'men' or 'women'");
    process.exit(1);
  }
  const gender: Gender = genderArg;

  if (hasFlag(args, "--clear")) {
    cfg[gender] = null;
    writeConfig(cfg);
    console.log(`✓ cleared ${gender} pin (will use latest snapshot)`);
    return;
  }

  const date = getArg(args, "--date");
  if (!date) {
    console.error("error: --date YYYY-MM-DD is required (or use --clear)");
    process.exit(1);
  }
  if (!isoDateOk(date)) {
    console.error(`error: --date must be YYYY-MM-DD, got ${date}`);
    process.exit(1);
  }
  if (!snapshotExists(gender, date)) {
    console.error(
      `error: no archive entry for ${gender} on ${date} ` +
        `(expected ${path.join("src/data/rankings-archive", gender, `${date}.ts`)}). ` +
        `Run scripts/snapshot-rankings.ts first, or pick a date with --show.`
    );
    process.exit(1);
  }

  const label = getArg(args, "--label");
  const setBy = getArg(args, "--by");

  cfg[gender] = {
    date,
    label,
    setAt: new Date().toISOString(),
    setBy,
  };
  writeConfig(cfg);

  const labelTxt = label ? ` "${label}"` : "";
  const byTxt = setBy ? ` (by ${setBy})` : "";
  console.log(`✓ pinned ${gender} → ${date}${labelTxt}${byTxt}`);
}

main();
