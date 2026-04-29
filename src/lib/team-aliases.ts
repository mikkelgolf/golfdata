/**
 * Team-name alias resolution for runtime data filters.
 *
 * Source-of-truth aliases live in scripts/team-name-aliases.json
 * (also read by the Python ingest scripts so build-time + runtime
 * stay in sync). Keys are sheet/legacy variants, values are the
 * canonical site names used by rankings-{men,women}.ts and
 * all-teams-{men,women}-2026.ts. The team-page slug router builds
 * off the canonical names.
 *
 * Why this exists: David's spreadsheet (and other future feeds) use
 * canonical names AND aliases interchangeably — sometimes "BYU",
 * sometimes "Brigham Young", sometimes both in the same dataset. A
 * runtime filter like `r.team === team` only matches one of those,
 * so even after we canonicalise the JSON files we want a defensive
 * predicate that handles either form.
 *
 * Usage:
 *   import { teamMatches, canonicalizeTeamName } from "@/lib/team-aliases";
 *   const rows = data.filter((r) => teamMatches(r.team, team, gender));
 */

import aliasesJson from "../../scripts/team-name-aliases.json";
import type { Gender } from "@/data/records-types";

type AliasMap = Record<string, string>;

const RAW = aliasesJson as unknown as {
  men?: AliasMap;
  women?: AliasMap;
  // The JSON file uses a leading-underscore "_comment" key for inline
  // documentation; ignore it here.
  [k: string]: unknown;
};

const MEN_ALIASES: AliasMap = RAW.men ?? {};
const WOMEN_ALIASES: AliasMap = RAW.women ?? {};

function aliasMap(gender: Gender): AliasMap {
  return gender === "men" ? MEN_ALIASES : WOMEN_ALIASES;
}

/**
 * Resolve a team name to its canonical form for the given gender.
 * Returns the input unchanged if no alias matches.
 *
 * Idempotent: canonicalizeTeamName(canonicalizeTeamName(x, g), g) === canonicalizeTeamName(x, g).
 */
export function canonicalizeTeamName(name: string, gender: Gender): string {
  if (!name) return name;
  const map = aliasMap(gender);
  return map[name] ?? name;
}

/**
 * Predicate: does `rowTeam` (raw value from a data row, possibly an
 * alias) refer to the same program as `canonical` (canonical name from
 * rankings/all-teams)? Tolerant of both forms appearing interchangeably.
 *
 * Use this in `.filter()` calls instead of raw string equality.
 */
export function teamMatches(
  rowTeam: string,
  canonical: string,
  gender: Gender
): boolean {
  if (!rowTeam) return false;
  if (rowTeam === canonical) return true;
  return canonicalizeTeamName(rowTeam, gender) === canonical;
}
