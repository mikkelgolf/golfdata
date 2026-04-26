/**
 * reconcile-facts.ts — merge LLM-extracted facts (per-source) into the
 * record book.
 *
 * Inputs:
 *   data/team-deep-dive/extracted-facts/<slug>.json
 *   data/team-deep-dive/conference-history.json
 *   data/team-deep-dive/usga-amateur-history.json
 *   data/team-deep-dive/ranking-snapshots.json
 *
 * Outputs:
 *   data/team-deep-dive/reconciled-facts-<slug>.json
 *   data/team-deep-dive/reconciliation-log-<slug>.json
 *   src/data/teams/<slug>-<gender>-record-book.json (merged sections)
 *
 * Source-trust priority (high → low):
 *   ncaa_record_book > school_pdf > school_news > wikipedia > newspaper >
 *   wayback > searx_serp > llm_inferred
 *
 * Confidence scoring:
 *   - 1+ low-trust source: 0.4
 *   - 2+ sources agree: 0.75
 *   - 3+ sources agree: 0.95
 *   - school PDF or NCAA Record Book attests: bumped to 0.95 regardless
 *   - conflicts logged with winner = highest trust source
 */

import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = path.join(__dirname, "..", "..");
const FACTS_DIR = path.join(REPO_ROOT, "data", "team-deep-dive", "extracted-facts");
const TEAM_DD_DIR = path.join(REPO_ROOT, "data", "team-deep-dive");
const TEAMS_DIR = path.join(REPO_ROOT, "src", "data", "teams");

interface ExtractedFact {
  source_url?: string;
  fact_type?: string;
  player_name?: string;
  school?: string;
  year?: number;
  tournament?: string;
  position?: string | number;
  score?: number;
  tier?: string;
  supporting_quote?: string;
  extracted_at?: string;
  batch_id?: number;
}

interface ReconciledFact extends ExtractedFact {
  fact_id: string;
  sources: string[];
  source_count: number;
  confidence: number;
  conflicting?: boolean;
  winning_source_kind?: string;
}

const SOURCE_TRUST: Record<string, number> = {
  ncaa_record_book: 1.0,
  school_pdf: 0.95,
  school_news: 0.85,
  wikipedia: 0.8,
  loc_chronicling_america: 0.75,
  wayback: 0.7,
  school_archive: 0.7,
  conference_archive: 0.85,
  usga_amateur: 0.85,
  searx_serp: 0.4,
  llm_inferred: 0.4,
};

function inferSourceKind(url: string | undefined): string {
  if (!url) return "llm_inferred";
  if (url.includes("chroniclingamerica.loc.gov")) return "loc_chronicling_america";
  if (url.includes("web.archive.org")) return "wayback";
  if (url.includes("wikipedia.org")) return "wikipedia";
  // school athletics domains all end in athletics-style TLDs / known domains
  if (
    /\.(com|net|edu|org)\//.test(url) &&
    /(texastech|okstate|gostanford|vucommodores|auburntigers|rolltide|arkansasrazorbacks|georgiadogs|lsusports|floridagators|utsports|thesundevils|goheels|gopack|goduke|godeacs|virginiasports|clemsontigers|seminoles|ohiostatebuckeyes|mgoblue|purduesports|fightingillini|nusports|soonersports|gofrogs|smumustangs|uhcougars|baylorbears|texaslonghorns|byucougars|calbears|gohuskies|goducks|utahutes|pepperdinewaves)/i.test(url)
  ) {
    return "school_news";
  }
  if (/(stanforddaily|theplainsman|crimsonwhite|reveille|redandblack|alligator|utdailybeacon|dailytarheel|dukechronicle)/i.test(url)) {
    return "school_archive";
  }
  return "searx_serp";
}

function normalizeName(raw: string | undefined): string {
  if (!raw) return "";
  let s = raw.normalize("NFD").replace(/[̀-ͯ]/g, "");
  s = s.replace(/([a-z])([A-Z])/g, "$1 $2");
  s = s.toLowerCase().trim().replace(/\s+/g, " ");
  s = s.replace(/[,.\s]+(jr|sr|ii|iii|iv)$/i, "");
  s = s.replace(/[.\-']/g, " ").replace(/\s+/g, " ").trim();
  return s;
}

function factDedupeKey(f: ExtractedFact): string {
  const name = normalizeName(f.player_name);
  const fn = (f.fact_type || "").toLowerCase();
  const yr = f.year ?? "";
  const tour = (f.tournament || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 50);
  const pos = String(f.position ?? "").toLowerCase();
  const tier = (f.tier || "").toLowerCase();
  return `${fn}|${name}|${yr}|${tour}|${pos}|${tier}`;
}

function readJson<T>(p: string, fallback: T): T {
  if (!fs.existsSync(p)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(p: string, value: unknown): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(value, null, 2));
}

function reconcile(facts: ExtractedFact[]): { reconciled: ReconciledFact[]; conflicts: unknown[] } {
  const groups = new Map<string, ExtractedFact[]>();
  for (const f of facts) {
    if (!f.fact_type) continue;
    const k = factDedupeKey(f);
    const arr = groups.get(k) || [];
    arr.push(f);
    groups.set(k, arr);
  }
  const reconciled: ReconciledFact[] = [];
  const conflicts: unknown[] = [];
  let nextId = 1;
  for (const [key, members] of groups) {
    const sourceKinds = new Set<string>();
    let bestSourceTrust = 0;
    let winningKind = "";
    for (const m of members) {
      const k = inferSourceKind(m.source_url);
      sourceKinds.add(k);
      const t = SOURCE_TRUST[k] ?? 0.3;
      if (t > bestSourceTrust) {
        bestSourceTrust = t;
        winningKind = k;
      }
    }
    // Confidence: source-agreement boost on top of best trust.
    let conf = bestSourceTrust;
    if (sourceKinds.size >= 2) conf = Math.max(conf, 0.75);
    if (sourceKinds.size >= 3) conf = Math.max(conf, 0.95);
    if (sourceKinds.has("school_pdf") || sourceKinds.has("ncaa_record_book")) conf = 0.95;

    // Pick the canonical fact (highest-trust one).
    const winner = members
      .slice()
      .sort(
        (a, b) =>
          (SOURCE_TRUST[inferSourceKind(b.source_url)] ?? 0) -
          (SOURCE_TRUST[inferSourceKind(a.source_url)] ?? 0),
      )[0];
    reconciled.push({
      ...winner,
      fact_id: `f-${String(nextId++).padStart(7, "0")}`,
      sources: Array.from(sourceKinds),
      source_count: members.length,
      confidence: Number(conf.toFixed(2)),
      winning_source_kind: winningKind,
    });
    if (members.length > 1) {
      // Detect conflicting attribute values across members (e.g. different positions for same player+event).
      const variants = new Set(members.map((m) => `${m.position ?? ""}|${m.tier ?? ""}|${m.score ?? ""}`));
      if (variants.size > 1) {
        conflicts.push({
          key,
          members,
          winner: { fact_id: `f-${nextId - 1}`.padStart(8, "0") },
        });
      }
    }
  }
  return { reconciled, conflicts };
}

interface RecordBook {
  school_slug: string;
  gender: "m" | "w";
  built_at: string;
  coverage_note: string;
  sections: { [key: string]: unknown };
}

function mergeIntoRecordBook(slug: string, gender: "m" | "w", reconciled: ReconciledFact[]): void {
  const rbPath = path.join(TEAMS_DIR, `${slug}-${gender === "m" ? "men" : "women"}-record-book.json`);
  if (!fs.existsSync(rbPath)) {
    console.log(`[reconcile] record-book file missing for ${slug} ${gender}; skipping merge`);
    return;
  }
  const rb: RecordBook = JSON.parse(fs.readFileSync(rbPath, "utf-8"));

  // Stash all reconciled facts under sections.web_extracted_facts grouped by
  // fact_type so they're discoverable + auditable.
  const grouped: Record<string, ReconciledFact[]> = {};
  for (const f of reconciled) {
    const t = f.fact_type || "unknown";
    grouped[t] = grouped[t] || [];
    grouped[t].push(f);
  }
  rb.sections.web_extracted_facts = grouped;

  // High-confidence promotions to canonical sections:
  const promote = reconciled.filter((f) => f.confidence >= 0.85);

  // All-Americans → all_americans_from_web
  const aas = promote.filter((f) => f.fact_type === "all_american");
  if (aas.length) {
    rb.sections.all_americans_from_web = aas.map((f) => ({
      year: f.year,
      player: f.player_name,
      tier: f.tier,
      sources: f.sources,
      confidence: f.confidence,
    }));
  }

  // Tour wins → notable_pros_from_web (paragraph-style entries)
  const tw = promote.filter((f) => f.fact_type === "tour_win");
  if (tw.length) {
    rb.sections.tour_wins_from_web = tw.map((f) => ({
      year: f.year,
      player: f.player_name,
      tournament: f.tournament,
      sources: f.sources,
      confidence: f.confidence,
    }));
  }

  // Conference titles → conference_titles_from_web
  const ct = promote.filter((f) => f.fact_type === "conference_title");
  if (ct.length) {
    rb.sections.conference_titles_from_web = ct.map((f) => ({
      year: f.year,
      tournament: f.tournament,
      player: f.player_name,
      sources: f.sources,
      confidence: f.confidence,
    }));
  }

  // Individual NCAA finishes → individual_ncaa_finishes_from_web
  const inf = promote.filter((f) => f.fact_type === "ncaa_individual_finish");
  if (inf.length) {
    rb.sections.individual_ncaa_finishes_from_web = inf.map((f) => ({
      year: f.year,
      player: f.player_name,
      position: f.position,
      sources: f.sources,
      confidence: f.confidence,
    }));
  }

  // Walker / Palmer / Masters / US Amateur → cup_majors_from_web
  const cm = promote.filter((f) =>
    ["walker_cup", "palmer_cup", "masters_appearance", "us_amateur_appearance"].includes(f.fact_type || ""),
  );
  if (cm.length) {
    rb.sections.cup_majors_from_web = cm.map((f) => ({
      kind: f.fact_type,
      year: f.year,
      player: f.player_name,
      sources: f.sources,
      confidence: f.confidence,
    }));
  }

  // Coach hires → coaching_history_from_web
  const ch = promote.filter((f) => f.fact_type === "coach_hire" || f.fact_type === "coach_fire");
  if (ch.length) {
    rb.sections.coaching_history_from_web = ch.map((f) => ({
      kind: f.fact_type,
      year: f.year,
      player: f.player_name,
      sources: f.sources,
      confidence: f.confidence,
    }));
  }

  // Fold Opus synthesis insights if available — written by synthesize-insights.py
  // which runs in a separate dispatcher phase before the record-book rebuild.
  // This means the insights for the previous run are merged here; the
  // synthesize phase that runs immediately after this reconcile will produce
  // fresher insights for the next reconcile/rebuild cycle.
  const insightsPath = path.join(REPO_ROOT, "data", "team-deep-dive", `insights-${slug}.json`);
  if (fs.existsSync(insightsPath)) {
    try {
      rb.sections.opus_insights = JSON.parse(fs.readFileSync(insightsPath, "utf-8"));
    } catch (e) {
      console.warn(`[reconcile] could not read insights file: ${(e as Error).message}`);
    }
  }

  rb.built_at = new Date().toISOString();
  rb.coverage_note += " | M2 web reconciliation merged.";
  writeJson(rbPath, rb);
  console.log(
    `[reconcile] merged ${reconciled.length} facts into ${rbPath} (${promote.length} promoted to canonical sections)`,
  );
}

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.length < 2) {
    console.error("Usage: npx tsx scripts/team-deep-dive/reconcile-facts.ts <slug> <men|women>");
    process.exit(1);
  }
  const slug = argv[0];
  const gender: "m" | "w" = argv[1] === "men" || argv[1] === "m" ? "m" : "w";

  const factsPath = path.join(FACTS_DIR, `${slug}.json`);
  const facts = readJson<ExtractedFact[]>(factsPath, []);
  if (!facts.length) {
    console.log(`[reconcile] no extracted facts for ${slug}; skipping`);
    return;
  }
  console.log(`[reconcile] ${slug}: ${facts.length} extracted facts`);

  const { reconciled, conflicts } = reconcile(facts);
  console.log(`[reconcile] ${slug}: ${reconciled.length} reconciled, ${conflicts.length} conflicts`);

  writeJson(path.join(TEAM_DD_DIR, `reconciled-facts-${slug}.json`), reconciled);
  writeJson(path.join(TEAM_DD_DIR, `reconciliation-log-${slug}.json`), conflicts);
  mergeIntoRecordBook(slug, gender, reconciled);
}

main();
