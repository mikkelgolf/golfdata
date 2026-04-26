---
name: team-deep-dive
description: Map a college golf program's complete history — every player ever on the roster, every tournament result of their full career arc (junior → college → professional), every year-end ranking, every postseason appearance. Output is the source-of-truth record book for that program. Days-long background job dispatched to a Mac Mini LaunchAgent; the in-session work is plan + dispatch + status. Invoke as `/team-deep-dive "<team name>"` (e.g. "texas tech men", "oklahoma state men"). Subcommands: `status`, `resume`, `validate`. Strategic asset: ingesting one team incidentally caches leaderboards containing every other team in those events, so subsequent builds compound.
argument-hint: "<team name>" | status <slug> | resume <slug> | validate <slug>
tags: [collegegolfdata, scrape, record-book, players, long-running]
---

# Team Deep Dive

The skill that builds collegegolfdata's per-team record book. See the architecture plan at `~/.claude/plans/in-the-mikkel-system-and-nested-waterfall.md` for the full design — this file is the operational entry point.

## Branch policy — `dev` only

All team-deep-dive / record-book / per-team page work in `~/projects/collegegolfdata` lands on the **`dev` branch**, never directly on `main`. Before any commit:

```
cd ~/projects/collegegolfdata && git checkout dev
```

`main` is the production branch that Vercel auto-deploys to collegegolfdata.com. `dev` is the staging branch — merge `dev → main` only when Mikkel has reviewed the change. If you find yourself on `main` while doing deep-dive work, switch to `dev` first (uncommitted changes move with the branch switch).

## Phase 0 — interactive (run in this session)

When invoked as `/team-deep-dive "<team name>"`:

1. **Resolve the team.** Match against `~/projects/collegegolfdata/src/data/all-teams-men-2026.ts` and `all-teams-women-2026.ts` for an exact or fuzzy match. Resolve gender + slug (lowercase, kebab). Confirm with the user before proceeding.
2. **Run roster discovery** against existing local data:
   ```
   cd ~/projects/collegegolfdata && npx tsx scripts/team-deep-dive/roster-discovery.ts <slug> <gender>
   ```
   This reads `records-men.json`, `regionals-history.json`, `championships-history.json`, and (when added) `caddie.results` exports — no scraping. Outputs `data/team-deep-dive/roster-preview-<slug>.json`.
3. **Show the user the preview.** Read the JSON, summarize: total candidate names, decades covered, sources contributing, top-confidence names, low-confidence names that need review.
4. **Estimate the job.** Count events to scrape (BigQuery cached vs. uncached), wall-clock estimate at GolfStat rate limits, DataGolf credit budget if M4+, BigQuery storage delta.
5. **Gate on user confirmation.** Do NOT dispatch the LaunchAgent without explicit user approval. Phase 0 is read-only.

## Phase 1+ — background (LaunchAgent on the Mac Mini)

After approval:

6. Write a job manifest to `~/projects/collegegolfdata/data/team-deep-dive/jobs/<job_id>.json` with: slug, gender, sources enabled, era window, milestone targets, source-trust order, rate limits, budget caps.
7. Trigger `com.local.CGDDeepDive` LaunchAgent (NOT YET BUILT — see Status). The LaunchAgent runs `npx tsx scripts/team-deep-dive/run.ts <job_id>` which dispatches scrapes, MERGEs into BigQuery `cgd_graph.*`, posts Discord milestones, and emits `data/players/`, `data/events/`, `data/teams/<slug>-deep.json` exports.
8. Skill returns immediately with the job_id and "watch Discord for milestones".

## Subcommands

- `/team-deep-dive status <slug>` — read `~/projects/collegegolfdata/logs/deep-dive/<job_id>.ndjson` + `event_coverage` row counts via `caddie.cgd_graph` queries. Print a progress table.
- `/team-deep-dive resume <slug>` — re-enter a paused/failed job from its `next_event_cursor`.
- `/team-deep-dive validate <slug>` — run the golden-set diff against the school's media-guide PDF.

## Status (build progress)

This skill is being built incrementally. Current state:

- ✅ M0 — architecture plan, skill scaffold, scripts directory, BQ DDL drafted (review-only)
- ✅ M0 — Phase 0a roster discovery from local NCAA Record Book + David's sheets
- ✅ M0 — Phase 0b roster expansion from BigQuery `granular_master` (GolfStat + Clippd)
- ✅ M0 — per-event careers pulled from BigQuery (`careers-from-bq.py`)
- ✅ M0 — per-player JSON exports (`build-player-exports.ts` → `src/data/players/<id>.json` + `index.json`)
- ✅ M0 — `/players/[id]` Next.js route (header + season-by-season + every event + record-book mentions)
- ✅ M0 — Identity normalizer v1 (`lib/identity.ts`: CamelCase split, nickname dictionary, Jaro-Winkler)
- ✅ M0 — Cross-gender contamination filter (per-player primary_gender from global division split)
- ✅ M0 — Per-team All-Time Roster section on `/teams/[gender]/[slug]` (filters by primary_gender match)
- ✅ M0 — Full-leaderboard event lake (`events-from-bq.py` batched single-scan)
- ✅ M0 — `/events/[id]` Next.js route with player_id back-links
- ✅ M0 — Cross-linking: team → roster → player → events → other competitors → other teams
- ✅ M0 — Record-book aggregator (career/season/tournament leaders) + `/teams/<slug>/record-book` route
- ✅ M0 — School media-guide PDF parser (`parse-school-pdf.py`) — extracts letterwinners, head coaches, All-Americans, SWC/conference titles, Walker/Palmer Cup, Masters, major amateur titles. Sanity-cap on per-section yields filters out non-TT-layout false positives.
- ✅ M0 — Texas Tech 2022 record book PDF ingested → 207 historical letterwinners (1934-2021), 7 head coaches, 19 All-Americans, 39 SWC titles
- ✅ M0 — Wikipedia program-page scraper (`scrape-wikipedia-program.py`) — pulls infobox: NCAA championships, NCAA runner-up, NCAA appearances, individual NCAA medalists, conference titles, notable alumni
- ✅ M0 — Walker/Palmer Cup scraper (`scrape-cups.py`) — Wikipedia year-by-year US team rosters, resolved per-team via player-index lookup
- ✅ M0 — NCAA Championship year-by-year scraper (`scrape-ncaa-championships.py`) — year-specific Wikipedia pages → individual leaderboards + medalist; partial coverage (Wikipedia table format varies by year)
- ✅ M0 — DataGolf API scaffolding (`datagolf-tracker.py`) — stub files written for all teams; one env var (DATAGOLF_API_KEY) away from full post-college tracking
- ✅ M0 — Unified seed script (`seed-team.sh <slug> <gender>`) — runs roster/careers/wiki/PDF/exports/record-book end-to-end, idempotent
- ✅ M0 — 36 men's programs mass-seeded with BQ-modern data + Wikipedia infoboxes
- ⬜ M0 — BigQuery `cgd_graph` DDL execution (deferred — needs user approval)
- ⬜ M1 — Phase-1 identity resolver: school + class-year + co-event scoring (substrate is in `lib/identity.ts`)
- ⬜ M1 — Dispatcher with `event_coverage` cache, LaunchAgent worker
- ⬜ M1 — Per-school PDF adapters (each major program's PDF has a different layout; only TT-style works generically today)
- ⬜ M2 — GCAA All-American scraper (built but rate-limited by gcaa.coach; retry needed)
- ⬜ M2 — DataGolf API key + run (post-college tracking)
- ⬜ M3-M5 — AJGA, JGS, Newspapers.com (paid), Wayback WAGR, conference archives

### Phase 0 results — 36 teams seeded (validated 2026-04-26)

**Lake-wide:** 3,100 player profiles, 745 events with full leaderboards, 36 record-book JSONs, 30 Wikipedia infobox extractions, 11 school PDFs downloaded, 164 Walker Cup appearances mapped.

**Top hauls per program:**
| team | BQ players | NCAA titles (Wiki) | Individual NCAA champs | Walker Cup | School PDF |
|---|---|---|---|---|---|
| Stanford men | 73 | 46 appearances | 0 | 7 | partial parse |
| Oklahoma State men | 88 | **12 titles, 17 runner-up** | **9 medalists** | 11 | yes (different layout) |
| Texas Tech men | **259** (190 PDF + 69 BQ) | — | — | 0 | **fully parsed** |
| North Carolina men | 57 | 46 appearances | 0 | — | yes |
| Auburn men | 58 | 12 | 0 | — | yes |
| Georgia men | 91 | 32 | 0 | 5 | — |
| Ohio State men | 89 | 30 | 0 | — | — |
| Virginia men | 53 | 29 | 0 | — | — |
| Duke men | 80 | 26 | 0 | — | — |
| Arizona State men | 91 | 21 | 0 | — | yes (parse failed) |
| Wake Forest men | 89 | 15 | 0 | — | — |
| Auburn men | 58 | 12 | 0 | — | yes (older) |
| Vanderbilt men | 64 | 10 | 0 | — | yes |
| Florida men | 90 | 5 | 0 | — | yes |

Texas Tech remains the proof-of-concept for full historical depth (1934-2026 via school PDF). Other programs have BQ-modern + Wikipedia-historical data merged but await per-school PDF adapters.

**Lake totals:**
- 3,100 player JSON exports under `src/data/players/`
- 745 event JSON exports under `src/data/events/` with full leaderboards
- 36 team record-book JSONs under `src/data/teams/`
- 11 school PDFs downloaded; 1 fully parsed, 10 require bespoke adapters
- 30 Wikipedia infobox extractions populating NCAA championships, individual medalists, notable alumni

**Identity normalizer v1 wins:**
- "LudvigAberg" (PDF parse artifact) → merges with "Ludvig Aberg" (BQ) automatically
- 5 of 6 record-book TT players confirmed by golfstat data
- 10 cross-gender mis-attributions filtered via per-player primary_gender heuristic
- Nickname canonicalization for 30+ name pairs (Will/William, Mike/Michael, etc.)

**Known artifacts deferred to M1:**
- 4 women's golfers (Amy Taylor, Elin Arvidsson, Kimberly Kaufman, Gabriella Dominguez) still appear in Texas Tech men's index — source-level data corruption in `granular_master` where their men's-bracket hole-rows outnumber women's globally. Filter requires either name-based heuristic or rebuild of granular_master tagger.
- Pre-2010 era is empty for most teams — needs the M5 GolfStat backfill phase.

When the user invokes the skill before M1 is complete, run Phase 0 only and tell them what's not yet wired.

## Identity-resolution rule of thumb

When matching names across sources:
- Auto-merge confidence ≥ 0.85
- Queue 0.55–0.85 to `cgd_graph.identity_candidates` for human review via `/players review`
- Reject < 0.55
- External IDs (WAGR / DataGolf / AJGA) always trump fuzzy

See plan section "Identity-resolution algorithm" for the scoring weights.

## Cost guardrails

- 72h hard wall-clock cap per job
- GolfStat: 1 req/2s, exponential backoff, HTML cached indefinitely keyed by URL hash
- DataGolf: per-job credit budget in manifest, halts + Discord pings if exceeded
- BigQuery: `maximum_bytes_billed` cap on every query, `scraped_at` partitioning
- Append-only writes everywhere; provenance is the audit trail

## Where things live

- Plan: `~/.claude/plans/in-the-mikkel-system-and-nested-waterfall.md`
- Scripts: `~/projects/collegegolfdata/scripts/team-deep-dive/`
- BigQuery DDL (review-only, not executed): `~/projects/collegegolfdata/scripts/team-deep-dive/schema.sql`
- Job manifests: `~/projects/collegegolfdata/data/team-deep-dive/jobs/`
- Logs: `~/projects/collegegolfdata/logs/deep-dive/`
- LaunchAgent: `~/Library/LaunchAgents/com.local.CGDDeepDive.plist` — built 2026-04-26. Drains `data/team-deep-dive/queue.txt` via `scripts/team-deep-dive/queue-drainer.sh`. Append `<slug> <men|women>` lines to the queue; drainer polls so new appends get picked up without restart. Logs: `~/Library/Logs/cgd-deep-dive.log`. Single-instance via `data/team-deep-dive/.queue.lock`.
- Intermediate JSON files now gender-suffixed: `careers-<slug>-<m|w>.json`, `roster-preview-<slug>-<m|w>.json`, `wikipedia-<slug>-<m|w>.json`, `school-pdf-<slug>-<m|w>.json`, `gender-stats-<slug>-<m|w>.json`. Prevents women's runs from clobbering men's.
- Player exports: `~/projects/collegegolfdata/src/data/players/`
- Event exports: `~/projects/collegegolfdata/src/data/events/`
- Team record book exports: `~/projects/collegegolfdata/src/data/teams/<slug>-<gender>-record-book.json`
- Source PDFs: `~/projects/collegegolfdata/data/source/<slug>-record-book-*.pdf`
- Source-derived JSONs: `~/projects/collegegolfdata/data/team-deep-dive/{school-pdf,wikipedia,gcaa-all-americans,cup-appearances,datagolf}-*.json`
- Cache: `~/projects/collegegolfdata/data/cache/{wikipedia,wikipedia-cups,wikipedia-ncaa,gcaa}/<sha1>.html.gz`

## One-shot pipeline for a new team

```bash
cd ~/projects/collegegolfdata
./scripts/team-deep-dive/seed-team.sh oklahoma men   # full chain
# Or manually step-by-step:
npx tsx scripts/team-deep-dive/roster-discovery.ts <slug> men
~/venv/bin/python scripts/team-deep-dive/roster-from-bq.py <slug> men
~/venv/bin/python scripts/team-deep-dive/careers-from-bq.py <slug> men
~/venv/bin/python scripts/team-deep-dive/scrape-wikipedia-program.py <slug> men
~/venv/bin/python scripts/team-deep-dive/parse-school-pdf.py data/source/<slug>-record-book-*.pdf <slug> men  # optional
npx tsx scripts/team-deep-dive/build-player-exports.ts <slug> men
npx tsx scripts/team-deep-dive/build-record-book.ts <slug> men
~/venv/bin/python scripts/team-deep-dive/events-from-bq.py   # refresh event lake
```

## When more sources land

When future agents/scripts add coverage:
- **GCAA scraper recovery**: re-run `scrape-gcaa-all-americans.py` after rate-limit cooldown. Will populate the canonical D-I All-Americans 1958+ list. Then re-run `build-record-book.ts --all`.
- **DataGolf**: set `DATAGOLF_API_KEY` env var → re-run `datagolf-tracker.py --all` → re-run record-book builder. Notable-pros section will populate.
- **Per-school PDF adapters**: each major program's media guide has its own layout. As bespoke parsers ship, drop them under `scripts/team-deep-dive/parsers/<slug>.py` and call from `parse-school-pdf.py` based on slug.
