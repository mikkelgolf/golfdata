/**
 * Identity normalizer v1 — string-level cleanup before any fuzzy match.
 *
 * Centralizes the rules so roster-discovery, build-player-exports, and the
 * eventual Phase-1 identity resolver all use the same normalized form.
 *
 * Goals:
 *   - Fold diacritics ("Åberg" → "aberg")
 *   - Split CamelCase ("LudvigAberg" → "ludvig aberg")  ← fixes the
 *     known PDF-parser artifact in records-men.json
 *   - Strip Jr/Sr/II/III/IV from the matcher form (preserved on raw_name)
 *   - Canonicalize common nickname pairs ("Will" ↔ "William", etc.)
 *   - Provide a Jaro-Winkler scorer for fuzzy candidate matching
 *
 * The full identity resolver (M1) layers school + class-year + co-event
 * scoring on top of this. This file is the substrate.
 */

const NICKNAME_PAIRS: ReadonlyArray<[string, string]> = [
  ["jon", "jonathan"],
  ["jonny", "jonathan"],
  ["jonny", "jon"],
  ["will", "william"],
  ["bill", "william"],
  ["billy", "william"],
  ["bob", "robert"],
  ["bobby", "robert"],
  ["rob", "robert"],
  ["robbie", "robert"],
  ["mike", "michael"],
  ["mickey", "michael"],
  ["matt", "matthew"],
  ["matty", "matthew"],
  ["dan", "daniel"],
  ["danny", "daniel"],
  ["chris", "christopher"],
  ["topher", "christopher"],
  ["alex", "alexander"],
  ["alec", "alexander"],
  ["nick", "nicholas"],
  ["nicky", "nicholas"],
  ["tony", "anthony"],
  ["tom", "thomas"],
  ["tommy", "thomas"],
  ["jim", "james"],
  ["jimmy", "james"],
  ["jamie", "james"],
  ["pat", "patrick"],
  ["paddy", "patrick"],
  ["sam", "samuel"],
  ["sammy", "samuel"],
  ["josh", "joshua"],
  ["ben", "benjamin"],
  ["benny", "benjamin"],
  ["andy", "andrew"],
  ["drew", "andrew"],
  ["zach", "zachary"],
  ["zac", "zachary"],
  ["nate", "nathan"],
  ["nat", "nathan"],
  ["luke", "lucas"],
  ["theo", "theodore"],
  ["ted", "edward"],
  ["eddie", "edward"],
  ["ed", "edward"],
  ["fred", "frederick"],
  ["freddie", "frederick"],
  ["greg", "gregory"],
];

/**
 * Build a transitive nickname → set-of-equivalents map. So `jon`, `jonny`,
 * and `jonathan` all map to the same canonical form ("jon", chosen as the
 * shortest). Used by canonicalNickname() below.
 */
const NICKNAME_GROUPS: Map<string, string> = (() => {
  const parent: Map<string, string> = new Map();
  function find(x: string): string {
    let p = parent.get(x) ?? x;
    while (p !== (parent.get(p) ?? p)) p = parent.get(p) ?? p;
    parent.set(x, p);
    return p;
  }
  function union(a: string, b: string): void {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    // Prefer the shorter as canonical (it's usually the diminutive form,
    // but we don't actually care which wins; we just need consistency).
    if (ra.length <= rb.length) parent.set(rb, ra);
    else parent.set(ra, rb);
  }
  for (const [a, b] of NICKNAME_PAIRS) union(a, b);
  // Materialize: each name → its canonical root.
  const out = new Map<string, string>();
  for (const k of parent.keys()) out.set(k, find(k));
  return out;
})();

export function canonicalNickname(token: string): string {
  return NICKNAME_GROUPS.get(token) ?? token;
}

/**
 * Split CamelCase into space-separated lowercase tokens. Handles the
 * "LudvigAberg" parsing artifact from records-men.json.
 *
 * Examples:
 *   "LudvigAberg" → "ludvig aberg"
 *   "JohnMcEnroe" → "john mc enroe"  (acceptable; downstream tokenizer treats both)
 *   "AB"          → "ab"
 *   "JonRahm"     → "jon rahm"
 */
export function splitCamelCase(s: string): string {
  // Insert a space between every lowercase→uppercase boundary, and between
  // uppercase→uppercase-followed-by-lowercase (handles "USAm" → "US Am").
  return s
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2");
}

const SUFFIX_RE = /[,.\s]+(jr|sr|ii|iii|iv)$/i;

/**
 * The matcher's normalized form. Lossy on purpose: removes diacritics,
 * suffixes, casing, internal whitespace, and CamelCase joins. Two names
 * that share this form are very likely the same person (subject to
 * downstream school/class-year scoring).
 */
export function normalizeName(raw: string): string {
  if (!raw) return "";
  // 1. Fold diacritics.
  let s = raw.normalize("NFD").replace(/[̀-ͯ]/g, "");
  // 2. Split CamelCase BEFORE lowercasing.
  s = splitCamelCase(s);
  // 3. Lowercase + collapse whitespace.
  s = s.toLowerCase().trim().replace(/\s+/g, " ");
  // 4. Strip suffixes.
  s = s.replace(SUFFIX_RE, "");
  // 5. Replace common punctuation.
  s = s.replace(/[.\-']/g, " ").replace(/\s+/g, " ").trim();
  // 6. Apply nickname canonicalization to each token.
  s = s
    .split(" ")
    .map(canonicalNickname)
    .join(" ");
  return s;
}

/**
 * Jaro-Winkler similarity. 0..1, higher is better. 0.92 is our auto-merge
 * candidate threshold per the architecture plan.
 */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const m = jaro(a, b);
  if (m === 0) return 0;
  // Common prefix bonus (up to 4 chars).
  let prefix = 0;
  for (let i = 0; i < Math.min(4, a.length, b.length); i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }
  return m + prefix * 0.1 * (1 - m);
}

function jaro(a: string, b: string): number {
  const matchWindow = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatches = new Array<boolean>(a.length).fill(false);
  const bMatches = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const lo = Math.max(0, i - matchWindow);
    const hi = Math.min(b.length - 1, i + matchWindow);
    for (let j = lo; j <= hi; j++) {
      if (bMatches[j]) continue;
      if (a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  transpositions /= 2;
  return (
    matches / a.length / 3 +
    matches / b.length / 3 +
    (matches - transpositions) / matches / 3
  );
}
