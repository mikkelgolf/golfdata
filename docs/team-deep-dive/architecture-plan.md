# `/team-deep-dive` — collegiate program record-book skill

## Context

Mikkel wants a skill that, given a program (e.g. `/team-deep-dive "texas tech men"`), spends days of wall-clock mapping out **every player who has ever worn the jersey**, every tournament result of their full career arc (junior → college → professional), every year-end ranking, every postseason appearance. Output is the source-of-truth record book for that program — better than Oklahoma State's published media guide.

The strategic asset is *cross-team backfill*: ingesting Texas Tech's history incidentally pulls leaderboards containing Oklahoma State, TCU, Oklahoma, etc. Future team builds become cheaper and richer because most of their events are already cached. After ~10 teams the lake validates and backfills itself.

Decisions locked with user:
- **Pilot**: Texas Tech men
- **Era**: full history to program founding
- **Run mode**: full background via Mac Mini LaunchAgent, Discord-gated milestones
- **Identity resolution**: auto-merge ≥ 0.85, manual review queue for 0.55–0.85

## Architecture in one paragraph

The interactive Claude session is a **control plane**. The Mac Mini is the **data plane**. The skill plans + dispatches in minutes; LaunchAgent workers run for days. All scraped facts land in BigQuery (`mikkelgolf-caddie.cgd_graph.*`) keyed at the player+event level, with a provenance log behind every fact. Static JSON exports under `src/data/players/`, `src/data/events/`, `src/data/teams/<slug>-deep.json` are the *render* layer that Next.js consumes. Player identity is resolved by a deterministic-when-possible / fuzzy-with-evidence-when-not scoring algorithm with a manual review surface.

## Data model (BigQuery, dataset `cgd_graph`)

Separate dataset from raw `caddie.*` so the lake stays untouched. All tables partitioned by ingest date.

- **`players`** — `player_id` (ULID, deterministic seed: canonical-name + birthdate-or-class-year + first-school), `canonical_name`, `name_variants[]` (`{name, source, first_seen}`), optional `birthdate`, `hometown_city/state/country`, `handedness`, `wagr_id`, `datagolf_id`, `ajga_id`, `clippd_player_id`. Cluster on `canonical_name`.
- **`player_school_stints`** — one row per (player, school): `class_year`, `enrolled_year`, `final_year`, `transferred_in_from`, `transferred_out_to`, `redshirt_seasons[]`.
- **`tournament_xref`** — links existing `caddie.tournaments.tournament_id` to `golfstat_id`, `clippd_id`, `ncaa_event_id`, `ajga_event_id`, etc. Don't duplicate the tournaments table.
- **`tournament_results`** — `(player_id, tournament_id)` PK, `school_slug` *at time of event*, `placing`, `total_score`, `to_par`, `rounds[]`, `made_cut`, `dq`, `wd`, `source`, `source_row_url`, `scraped_at`, `conflict_flag`. Cluster on `player_id, tournament_id`.
- **`career_seasons`** — derived/materialized nightly: per (player_id, season): `events_played`, `scoring_avg`, `top10s`, `wins`, `individual_titles`, `rank_start`, `rank_end`, `team_rank_start`, `team_rank_end`, `postseason_appearance`, `all_american_status`.
- **`ranking_snapshots`** — `(player_id?, team_slug?, source, as_of_date)`, `value`, `value_meta`. Sources: `golfweek_sagarin | wagr | jgs | ajga_rolex | clippd | scratch_players`. Cluster on `as_of_date, source`.
- **`pre_college_profile`** — `ajga_events[]`, `rolex_all_america_year`, `jgs_peak_rank`, `state_amateur_titles[]`, `usga_qualifications[]`, `high_school`, `committed_date`.
- **`post_college_profile`** — `tour_starts[]` (PGA, KFT, LIV, DP World, LPGA, Epson), `tour_wins[]`, `walker_cup`, `palmer_cup`, `last_known_status`. DataGolf-fed.
- **`provenance_log`** — `fact_id`, `subject_table`, `subject_pk`, `field`, `value`, `source`, `source_url`, `source_hash`, `scraped_at`, `superseded_by`, `confidence`. Append-only audit trail.
- **`event_coverage`** — `tournament_id` → `schools_seen[]`, `leaderboard_complete`, `last_full_scrape_at`. The dispatcher's cache: skip re-scrapes when complete.
- **`identity_candidates`** — staging for fuzzy matches awaiting review: `proposed_player_id`, `evidence[]`, `score`, `status` (auto_merged | needs_review | rejected).
- **`reconciliation_events`** — every conflict reconciled: `tournament_id`, `player_id`, `field`, `before`, `after`, `winning_source`, `losing_sources[]`, `resolution_rule`, `resolved_at`.

### Identity-resolution algorithm

1. Normalize: lowercase, fold diacritics, collapse whitespace, expand nicknames via dictionary (`Jon`↔`Jonathan`, `Will`↔`William`, etc.). **Do not** strip Jr/III/IV from `name_variants` — only from the matcher's normalized form. Suffix presence forces birthdate or class-year disambiguation.
2. Candidate set: Jaro-Winkler ≥ 0.92 on `canonical_name` OR exact match in any `name_variants`.
3. Score:
   - school match: +0.4
   - class-year overlap: +0.3
   - co-event presence (same season, same school): +0.2 per event up to +0.4
   - hometown match: +0.2
   - birthdate match: **+0.5 (decisive)**
4. Auto-merge ≥ 0.85; queue 0.55–0.85 to `identity_candidates`; reject < 0.55.
5. External IDs (WAGR / DataGolf / AJGA) when present are deterministic merge keys — always trump fuzzy.

A `/players review` subcommand surfaces the queue for human resolution.

## Source ingestion order

Cheapest, highest-yield, least-anti-bot first.

1. **NCAA championship + regional PDFs** — already parsed by `scripts/build-records.ts`, `scripts/build-championships-history.ts`, `scripts/build-regionals-history.ts`. Free, static, authoritative. Re-run as the taxonomy oracle.
2. **School record-book PDFs** — Texas Tech media guide, OK State, Big 12. Free, static. Parse once per school for the seed roster (every name ever listed) and the field taxonomy (low rounds, conference titles, All-Americans, Walker Cup, etc.).
3. **GolfStat** (`results.golfstat.com`) — primary college warehouse 1995-present. Free but rate-limited. Playwright + 2-4s jitter, robots.txt respected, max 1 req/2s. **This is the spine.**
4. **NCAA.com history** — fills 1980s-1994 gap for major championships and modern recaps.
5. **Golfweek/Sagarin via agoragolf.com** — historical archive 2004-present. Schedule a forward-looking weekly snapshot LaunchAgent immediately.
6. **Clippd Scoreboard** — already integrated via `scripts/scrape-clippd-tournaments.ts`. Live 2019+.
7. **WAGR** — public 2007+ men, 2011+ women; Wayback for older snapshots.
8. **AJGA + Rolex All-America** — archives back to mid-90s. Per-player profiles include committed-college and HS.
9. **Junior Golf Scoreboard** — rolling 365d only; **schedule weekly archive snapshot LaunchAgent now** so future builds have history.
10. **BlueGolf** — state/regional amateur fill.
11. **DataGolf API** — paid, comprehensive post-college tracking. Last because it gates only ~10% of the record book.
12. **Conference championship archives** — last-mile gap fill.

For Texas Tech *full-history-to-program-founding* (1925), pre-1980 requires:
- **School athletic archives** (ttu.edu library digital collections, contact for media-guide back issues)
- **Newspapers.com** subscription scrape (Lubbock Avalanche-Journal for SWC tournament leaderboards 1925-1995)
- **NCAA Championship media guides** PDF archive (1939+)
- Hand entry for the thinnest decades. Tracked in a `manual_entries.json` that survives regeneration.

This pre-1980 phase is its own skill milestone (**M5b**, see phasing) — not blocking the MVP.

## "Leaderboard-once, attribute-many"

Dispatcher emits jobs at the **event** level, not the team level:

1. Discover Texas Tech's all-time roster.
2. Enumerate every `(event_id)` any TT player ever appeared in.
3. For each event, check `event_coverage`: if `leaderboard_complete = true` and `last_full_scrape_at < 365d`, **skip the scrape** and just attribute existing rows.
4. Otherwise, scrape the full leaderboard once and `MERGE` all rows into `tournament_results` keyed by `(player_id, tournament_id)`. BigQuery handles this natively.
5. `event_coverage` updated after each scrape.

Every conflicting write goes to `reconciliation_events` + `provenance_log`. Source-trust order for score conflicts: GolfStat > Clippd > NCAA.com > school PDF (school PDFs have transcription errors). Hole-level data (`caddie.hole_scores`) overrides scraped totals when present.

## Skill UX

### Phase 0 — interactive (~10 min in Claude session)

`/team-deep-dive "texas tech men"`

1. Slug-resolve → `texas-tech` + gender=m. Confirm.
2. **Roster discovery**: parse `/data/source/texas-tech-record-book.pdf` if present; cross-reference NCAA appearance sheets; query `caddie.results WHERE school = 'Texas Tech'` for every distinct `player_name`; merge with prior `cgd_graph.players` rows. Present grouped by decade with confidence flags.
3. **Plan + cost estimate**: events to scrape, events already cached, wall-clock estimate at GolfStat rate limit, DataGolf credits, BigQuery storage delta. Source-by-source toggle.
4. **Gate on user confirmation.** No scraping starts in-session.
5. On confirm: write `~/projects/collegegolfdata/data/team-deep-dive/jobs/<job_id>.json` and trigger LaunchAgent.

### Phase 1+ — queued background

LaunchAgent `com.local.CGDDeepDive` consumes manifests serially: `npx tsx scripts/team-deep-dive/run.ts <job_id>`. Streams progress to `~/projects/collegegolfdata/logs/deep-dive/<job_id>.ndjson`.

**Discord milestones** (reuse Holly/CGD webhook pattern):
- `roster_ingested`
- `leaderboards_25pct` / `_50pct` / `_75pct` / `_done`
- `rankings_snapshot_done`
- `pre_college_done`
- `post_college_done`
- `profile_pages_built`
- `validation_done`
- `build_complete`

**Subcommands**:
- `/team-deep-dive status texas-tech` — reads ndjson + provenance counts, prints progress table
- `/team-deep-dive resume texas-tech` — re-enters paused/failed from `next_event_cursor`
- `/team-deep-dive validate texas-tech` — runs the golden-set diff
- `/players review` — human review queue for ambiguous matches

## Output

### Routes

- `/teams/[gender]/[slug]` — extends current page with: All-Time Roster (sortable table), Record Book section, Year-by-Year (team rank, individual rank, postseason).
- `/players/[id]` — **new dynamic route**. Pre-college profile, college season-by-season (OK State media-guide format), every event placing, post-college tracker.
- `/events/[year]/[slug]` — **new route**, full leaderboard archive. Linked from every result.
- `/teams/[gender]/[slug]/record-book` — **new sub-route**, printable Oklahoma-State-style record book layout.
- `/teams/[gender]/[slug]/record-book/audit` — dev-only, renders flagged conflicts.

### Data exports (committed, regenerated by background job)

- `src/data/players/<id>.json` — per-player (~50KB), lazy-loaded.
- `src/data/players/index.json` — slim search index.
- `src/data/events/<year>-<slug>.json` — per-event leaderboards.
- `src/data/teams/<slug>-deep.json` — record-book aggregations.

Texas Tech projection: ~300 players × 50KB + ~800 events × 30KB ≈ 40 MB committed. Fine for git at one team; **migrate to Cloudflare R2 / GCS + CDN at the 5-team threshold** (decision deferred until then).

## Phasing

- **M1 — Texas Tech MVP, GolfStat era (1995+), Tier 1+2 sources** (~3 weeks): roster from school PDF + NCAA appearance sheets + GolfStat + NCAA.com pre-1995 stub. Ship identity resolver, `/players/[id]`, `/events/[year]/[slug]`, record-book sub-route. **Validation: diff against TTU's official media guide, target 80% field coverage.**
- **M2 — Rankings layer** (+1 week): Golfweek/Sagarin + WAGR snapshots feed year-by-year team/individual rank.
- **M3 — Pre-college** (+2 weeks): AJGA + Rolex + JGS → pre-college profile section.
- **M4 — Post-college** (+1 week): DataGolf integration → tour tracking.
- **M5a — Pre-1995 modern era** (+2 weeks): NCAA.com history archive, Big 12 / SWC archives, school athletic archives for 1980-1995.
- **M5b — Deep history (program founding → 1980)** (+3-4 weeks): Newspapers.com Lubbock Avalanche-Journal scrape, hand-entry for thinnest decades, NCAA media guide PDF parse 1939+. **Per user: full history to founding.**
- **M6 — Second team: Oklahoma State** (~3 days): validates cross-team backfill; most events already cached.
- **M7 — Conference rollout**: Big 12 men's complement, then by-conference. Each new team should take days, not weeks, once the lake is warm.

## Cost guardrails

- **BigQuery**: cap queries with `maximum_bytes_billed`; partition by `scraped_at`; materialize `career_seasons` nightly.
- **DataGolf**: per-job credit budget in manifest; halt + Discord ping if exceeded.
- **GolfStat / web**: 1 req/2s with exponential backoff (5/30/120/300/900s, max 5 retries). Cache HTML to `data/cache/<host>/<sha1(url)>.html.gz` indefinitely keyed on URL — re-runs hit disk, not network.
- **Newspapers.com**: rate-limit aware; scrape during off-peak; budget ~$200 for the TTU pre-1980 pass.
- **Wall-clock cap per job**: 72h hard timeout; checkpoint every event so resume is cheap.
- **Append-only**: never delete; provenance is the audit trail.

## Validation

- **Golden-set diff**: hand-transcribe ~50 facts from the TTU official media guide PDF (top 10 scoring records, conference title years, All-Americans, NCAA finishes). Skill emits a diff report per build; CI fails if golden set breaks.
- **Random spot-check**: weekly LaunchAgent samples 20 random `tournament_results` rows, fetches the source URL, asserts placing/score match.
- **Internal consistency**: sum-of-rounds = total_score; every postseason appearance has a row in `regionals-history` or `championships-history`; class_year ≤ first-event-year + 5.
- **Cross-source agreement**: track % of (player, event) pairs where ≥2 sources agree. Target ≥ 95% on Tier 2 sources for events 2000+.

## Critical files

- `src/app/teams/[gender]/[slug]/page.tsx` — extend with new sections
- `scripts/build-records.ts` — current NCAA PDF parser; extend with school media-guide parser
- `scripts/build-regionals-history.ts`, `scripts/build-championships-history.ts` — David's authoritative sheets, feed `event_coverage`
- `scripts/scrape-clippd-tournaments.ts` — pattern to follow for new scrapers
- `scripts/daily-refresh.sh` — extend trigger surface
- **NEW** `scripts/team-deep-dive/run.ts` — the LaunchAgent worker entry point
- **NEW** `scripts/team-deep-dive/sources/{golfstat,ncaa,ajga,jgs,wagr,bluegolf,datagolf,newspapers}.ts` — one module per source
- **NEW** `scripts/team-deep-dive/identity.ts` — resolution algorithm
- **NEW** `scripts/team-deep-dive/reconcile.ts` — provenance + conflict resolver
- **NEW** `scripts/team-deep-dive/dispatcher.ts` — event-level job emission, `event_coverage` lookups
- **NEW** `src/app/players/[id]/page.tsx`, `src/app/events/[year]/[slug]/page.tsx`, `src/app/teams/[gender]/[slug]/record-book/page.tsx`
- **NEW** `~/Library/LaunchAgents/com.local.CGDDeepDive.plist`

## Verification (end-to-end)

1. `/team-deep-dive "texas tech men"` → confirm Phase 0 roster preview matches a hand-eyeballed sample of the TTU media guide.
2. Watch Discord for `roster_ingested` within ~10 min, `leaderboards_done` within ~48-72h.
3. `/team-deep-dive status texas-tech` mid-run → progress table renders.
4. After `build_complete`: open `/teams/men/texas-tech/record-book` in dev — diff against the TTU media guide PDF; golden-set ≥ 80% match for M1.
5. Open 5 random `/players/[id]` pages — verify pre-college (M3+), college season-by-season, every event placing, post-college (M4+).
6. Open 5 random `/events/[year]/[slug]` pages — leaderboard renders, every TTU player linked to their profile.
7. `/players review` — confirm queue is non-empty and items are reviewable; merge or split a few.
8. Trigger M6 (`/team-deep-dive "oklahoma state men"`) → watch `event_coverage` skip rate; expect ≥40% of events already complete from the TTU build.

## Open decisions deferred until evidence

- **Postgres vs BigQuery for the graph**: BigQuery for now (zero new ops surface, pattern matches existing data flow). Revisit only if `/players/[id]` cold-render latency on Vercel exceeds 800ms.
- **Static-JSON commit threshold**: commit through 5 teams, then migrate to Cloudflare R2 / GCS + CDN. Don't pre-build the migration.
- **Women's parity**: pipeline is gender-agnostic from day one but the MVP is men's; first women's build (likely Vanderbilt or Stanford) is M8+.

---

# M2 — Deep Web Discovery (autonomous 24h LaunchAgent campaign)

## Context (M2 — added 2026-04-26)

The original plan (M1 above) has shipped to a working state: 36 men's programs in the lake, 3,100 player profiles, 745 events with full leaderboards, 36 record-book JSONs, Wikipedia infobox + Walker Cup data merged. **What's now insufficient:** every fact in the record book has to come from somewhere we already scraped (BQ, Wikipedia, school PDF, NCAA Record Book). For pre-2010 history, conference titles, individual NCAA finishes, full leaderboards at every event, year-end rankings, and notable-pro tracking we have huge gaps.

**M2's job:** for each program, exhaustively crawl the open web — the school's own news archive going back as far as it goes; Wayback Machine snapshots of every ranking + tournament + news index that's ever existed; Library of Congress Chronicling America for pre-1963 SWC/Big Six era; the school's library digital archive for yearbooks + student newspapers; aggregated Searx search across all of the above. Every article gets LLM-extracted into structured facts with full provenance.

**Locked decisions (M2):**
- **Pilot teams**: Texas Tech AND Oklahoma State (parallel, deep)
- **Search**: self-hosted Searx on Mac Mini (Docker, unlimited queries)
- **Run mode**: `com.local.CGDDeepDive` LaunchAgent on Mac Mini, 24h+ continuous, Discord milestones
- **Deep history**: free sources only (LoC Chronicling America, Internet Archive, Wayback, school library digital collections)
- **Evidence layer**: per-source JSON files with full provenance under `data/team-deep-dive/evidence/<slug>/<sha1(url)>.json`
- **LLM extraction**: Claude Code CLI invoked locally on the Mac Mini under Mikkel's Max plan — **$0 additional cost**. No Anthropic API key, no per-token billing. Pattern: dispatcher writes a batch of article paths + extraction prompt to a temp file, shells out to `claude` (the Claude Code CLI) in non-interactive mode, parses stdout JSON. Same wrapping pattern Holly / Drummerboy / Treeskirt already use to expose Claude through Discord.
- **Rankings priority**: team rank start/end of year + individual rank start/end of year, sourced from Golfweek/Sagarin (Wayback agoragolf.com archive) + WAGR (Wayback wagr.com) + Clippd (modern) + JGS (modern)
- **Branch**: stay on `dev`
- **Compute**: cheap, not constrained — Mac Mini runs continuously, Claude Max already paid for

## M2 architecture — five layers

### 1. Source layer (8 new scrapers)

All scrapers cache to `data/cache/<host>/<sha1(url)>.html.gz`, rate-limit politely, and emit raw evidence files to `data/team-deep-dive/evidence/<slug>/<sha1(url)>.json` with shape `{url, fetched_at, source, raw_text, headings, links_extracted}`.

- **`scripts/team-deep-dive/scrape-school-news.py`** — for each team's athletics domain (texastech.com, okstate.com, …), discover the men's-golf news index via sitemap.xml first, fall back to `/sports/mens-golf/news?page=N` pagination. Walk every article URL going back as far as the archive serves. Rate: 1 req/3s.
- **`scripts/team-deep-dive/scrape-wayback.py`** — uses Internet Archive CDX API to enumerate historical snapshots of: (a) school golf news index pages — pulls article URLs the live site has dropped; (b) `agoragolf.com/index.php/gw-sag` for Golfweek/Sagarin team + individual rankings 2004-present; (c) `wagr.com` for individual amateur rankings 2007+; (d) `results.golfstat.com` for tournament archive; (e) school athletic department roster + record pages. Default depth: first snapshot per year + latest 3 per year, cap 500 per URL. Rate: 1 req/2s.
- **`scripts/team-deep-dive/scrape-loc-newspapers.py`** — Library of Congress Chronicling America JSON API (`https://chroniclingamerica.loc.gov/search/pages/results/?...&format=json`) for pre-1963 newspaper articles mentioning the team. Filter by state (Texas for TT, Oklahoma for OSU) + golf keywords. Free, no auth, generous rate limits.
- **`scripts/team-deep-dive/scrape-school-archive.py`** — Texas Tech Southwest Collection (`swco.ttu.edu`), OSU Library Digital Collections — search for "golf" with date filters, pull yearbook + student newspaper PDFs (Daily Toreador, Daily O'Collegian). Free.
- **`scripts/team-deep-dive/scrape-rankings-history.py`** — schedules Wayback snapshots of Sagarin (sagarin.com/sports/menteams.htm + agoragolf.com archive), WAGR per-player profile pages, JGS top-N pages, Clippd team rankings. Outputs `ranking_snapshots` rows: `(player_id?, team_slug?, source, as_of_date, value)`.
- **`scripts/team-deep-dive/scrape-search-aggregator.py`** — Searx HTTP API on `http://localhost:8888/search?q=...&format=json`. Per team, runs ~500 structured queries: `"<school>" men's golf <year>` × every year 1925-2025, `"<school>" "all-american"`, `"<school>" "national championship" golf`, plus per-player queries for known roster names. No quota, no ToS friction. Captures top 20 results per query.
- **`scripts/team-deep-dive/scrape-conference-archives.py`** — for each program's historical conferences (SWC for TT pre-1996, Big 8/12 OSU, etc.), crawl the conference site + Wayback snapshots for championship results pages.
- **`scripts/team-deep-dive/scrape-usga-amateur.py`** — USGA championship history (US Amateur, US Mid-Am, US Open qualifiers). For each year + championship, pulls the field/results, cross-refs against our player names.

### 2. Searx-on-Mac-Mini setup

- **`scripts/team-deep-dive/searx-setup.sh`** — one-time Docker compose to spin up Searx on `http://localhost:8888`. Includes a tweaked `settings.yml` enabling Google + Bing + DuckDuckGo + Brave engines, JSON output, no rate limit on `127.0.0.1`. Runs as `com.local.Searx` LaunchAgent so it survives reboots.
- All scraper modules use a shared `searx_client.py` helper.

### 3. LLM fact-extraction layer (Claude Code CLI, Mac Mini, $0)

**`scripts/team-deep-dive/extract-facts.py`** — orchestrator. Reads every evidence file under `data/team-deep-dive/evidence/<slug>/`. Batches articles (e.g. 50 per call to fit comfortably under the context window), writes a prompt file to `/tmp/cgd-extract-<batch_id>.md`, then shells out:

```bash
claude --print --output-format json --no-color < /tmp/cgd-extract-<batch_id>.md > /tmp/cgd-extract-<batch_id>.json
```

The CLI runs against Mikkel's Max plan ($0 additional cost). Stdout is parsed JSON. Failed batches are retried with smaller batches (binary-search down on payload size).

Extraction prompt body (constant across batches; Claude Code's own caching handles efficiency): "You are extracting structured facts from college golf articles for the program `<school_name>` (slug: `<slug>`, gender: `<gender>`). For each article in this batch, return a JSON array of facts. Each fact has: `source_url`, `fact_type` ∈ {all_american, conference_title, ncaa_team_finish, ncaa_individual_finish, individual_tournament_win, team_tournament_win, coach_hire, coach_fire, hall_of_fame, tour_win, major_appearance, individual_ranking, team_ranking, letterwinner_year, walker_cup, palmer_cup, masters_appearance, us_amateur_appearance, transfer_in, transfer_out, signing}, `player_name?`, `school?`, `year?`, `tournament?`, `position?`, `score?`, `tier?`, `supporting_quote` (≤80 chars from the article)."

Outputs `data/team-deep-dive/extracted-facts/<slug>.json` — flat array of facts, each tagged with the source URL.

**`scripts/team-deep-dive/lib/claude_cli.py`** — shared helper that wraps the `claude --print` invocation, handles retries, parses JSON, propagates errors. Used by extract-facts.py and any future LLM-assisted step. Mirrors the wrapping pattern in `mikkel-system/scripts/discord_bot_base.py`.

**Why this is robust:** Claude Code CLI runs locally and authenticates against the Max plan via the existing login on the Mac Mini. The dispatcher never needs an API key. If the Mac Mini reboots, the next dispatcher tick simply runs `claude` again — the login is persistent.

### 4. Reconciliation layer

**`scripts/team-deep-dive/reconcile-facts.ts`** — merges extracted facts across sources, dedupes via the identity resolver, writes confidence scores based on source agreement (3+ sources agree → 0.95; single low-trust source → 0.4). Writes to `data/team-deep-dive/reconciled-facts-<slug>.json` and merges high-confidence facts into the per-team record book at `src/data/teams/<slug>-<gender>-record-book.json`.

Conflict-resolution priority: NCAA Record Book > school media-guide PDF > school athletics news article > Wikipedia > newspaper archive > Searx-discovered SERP > LLM-inferred. Conflicts logged to `data/team-deep-dive/reconciliation-log-<slug>.json`.

### 5. Dispatcher + LaunchAgent

**`scripts/team-deep-dive/dispatcher.py`** — the LaunchAgent worker. Reads job manifests from `data/team-deep-dive/jobs/<job_id>.json`. For each pending job:

1. `news_archive` phase
2. `wayback` phase
3. `loc_newspapers` phase
4. `school_archive` phase
5. `rankings_history` phase
6. `search_aggregator` phase
7. `conference_archives` phase
8. `usga_amateur` phase
9. `llm_extract` phase
10. `reconcile` phase
11. `record_book_rebuild` phase
12. `validate` phase (golden-set diff vs existing PDFs)

Each phase writes a checkpoint to the job manifest (`current_phase` + `phase_progress`). LaunchAgent restart resumes from the checkpoint. Logs streamed to `logs/deep-dive/<job_id>.ndjson`.

**Discord milestones** (via `mikkel-system/scripts/discord_notify.py`): one per phase boundary; per-phase progress at 25/50/75/100% for long phases.

**`~/Library/LaunchAgents/com.local.CGDDeepDive.plist`** — runs `~/venv/bin/python ~/projects/collegegolfdata/scripts/team-deep-dive/dispatcher.py` continuously with `KeepAlive: true`.

## M2 directory layout

```
~/projects/collegegolfdata/
├── scripts/team-deep-dive/
│   ├── dispatcher.py                       # LaunchAgent worker
│   ├── scrape-school-news.py
│   ├── scrape-wayback.py
│   ├── scrape-loc-newspapers.py
│   ├── scrape-school-archive.py
│   ├── scrape-rankings-history.py
│   ├── scrape-search-aggregator.py
│   ├── scrape-conference-archives.py
│   ├── scrape-usga-amateur.py
│   ├── extract-facts.py                    # LLM extraction
│   ├── reconcile-facts.ts                  # merge + commit to record book
│   ├── searx-setup.sh                      # one-time Docker compose
│   ├── searx_client.py                     # shared helper
│   └── lib/
│       ├── http_cache.py                   # gzip cache helper
│       └── llm.py                          # Anthropic SDK wrapper w/ prompt cache
└── data/team-deep-dive/
    ├── jobs/<job_id>.json                  # per-team job manifest with checkpoint
    ├── evidence/<slug>/<sha1>.json         # one per source URL touched
    ├── extracted-facts/<slug>.json
    ├── reconciled-facts-<slug>.json
    └── reconciliation-log-<slug>.json
```

## Pilot — Texas Tech + Oklahoma State (parallel)

Both pilot teams run in the same dispatcher queue. Job manifests created up-front:

- `data/team-deep-dive/jobs/texas-tech-men-2026-04-26.json`
- `data/team-deep-dive/jobs/oklahoma-state-men-2026-04-26.json`

Dispatcher processes them serially (TT first, OSU second) so both pilots finish before any other team starts. After both validate (golden-set diff vs school PDFs), the same dispatcher is fed manifests for the remaining 34 already-seeded teams + any new programs.

**Validation gates** (each pilot must pass before next team starts):
- TT golden set: ≥ 80% match against the parsed `data/source/texas-tech-record-book-2022.pdf` for known facts (letterwinners, All-Americans, conference titles, NCAA finishes)
- OSU golden set: ≥ 80% match against published OK State record book (will download + parse separately as part of pilot)
- Cross-source agreement: ≥ 95% on facts attested by 2+ sources
- Source coverage report: per phase, count of new evidence files + new facts emitted

## Runtime — continuous queue, not fixed timeboxes

The dispatcher runs forever. Each team takes whatever it takes (typical 1–3 hours, longer if rate-limited or the school has a 1000-article archive); when a team completes, the dispatcher pulls the next job from the queue and starts immediately. The 36 already-seeded programs all roll through; new teams added by `team-deep-dive` queue up the same way. No artificial timebox per team.

**Per-team typical phase durations** (Mac Mini, no rate-limit stalls):

- `news_archive` — 5–30 min (50–2000 articles at 1 req/3s)
- `wayback` — 10–40 min (5+ URLs × ~50 snapshots × 2s)
- `loc_newspapers` — 5–20 min (free LoC API, fast)
- `school_archive` — 10–60 min (TTU Southwest, OSU Library, varies)
- `rankings_history` — 5–15 min (Wayback Sagarin/WAGR/JGS)
- `search_aggregator` — 5–20 min (Searx ~500 queries × 0.5s, localhost)
- `conference_archives` + `usga_amateur` — 10–30 min combined
- `llm_extract` — 10–90 min (depends on article volume + Claude Max rate-limit window; dispatcher pauses + resumes seamlessly)
- `reconcile` + `record_book_rebuild` — 2–10 min
- `validate` (golden-set diff) — 1–5 min

**Realistic total**: 1–3 hours per team in clean conditions, up to 6 hours if Claude rate-limits halve LLM throughput. Pilots (TT + OSU) finish first; then queue chews through the remaining 34 already-seeded teams in roughly 2–7 days of continuous Mac Mini runtime, after which the queue idles waiting for new manifests.

**Discord cadence**: ping per phase boundary per team + ping on team completion with a one-line summary (facts extracted, sources covered, golden-set match %) and the URL to the team's record book. No fixed 24-hour cadence — the activity itself is the heartbeat.

Dispatcher resumes cleanly after kernel restart, network blip, or rate-limit pauses by re-reading the latest checkpoint in each job manifest.

## Cost guardrails (M2)

- **LLM cost**: $0 — all extraction via Claude Code CLI on Mikkel's Max plan, running locally on the Mac Mini. No Anthropic API key in the project.
- **Disk**: per-team evidence corpus ~500 MB; cache ~1 GB. Mac Mini has plenty.
- **Rate limits**: 1 req/2s for athletics sites + Wayback + LoC; 1 req/0.5s for localhost Searx. Exponential backoff on 429.
- **Robots.txt**: respected. School athletics sites generally allow crawl.
- **Claude CLI throughput**: max-plan rate limits apply to Claude itself; if we hit them, the dispatcher pauses the LLM phase and Discord-pings, then resumes when the rate-limit window resets.

## M2 critical files (new)

- `scripts/team-deep-dive/dispatcher.py`
- `scripts/team-deep-dive/scrape-{school-news,wayback,loc-newspapers,school-archive,rankings-history,search-aggregator,conference-archives,usga-amateur}.py`
- `scripts/team-deep-dive/extract-facts.py`
- `scripts/team-deep-dive/reconcile-facts.ts`
- `scripts/team-deep-dive/searx-setup.sh`
- `scripts/team-deep-dive/searx_client.py`
- `scripts/team-deep-dive/lib/{http_cache.py, claude_cli.py}`
- `~/Library/LaunchAgents/com.local.CGDDeepDive.plist`
- `~/Library/LaunchAgents/com.local.Searx.plist`

## M2 verification

1. After Hour 1: `launchctl list | grep CGDDeepDive` + `curl http://localhost:8888/search?q=test` confirm both LaunchAgents up.
2. After each phase: Discord ping arrives in `#general`; `data/team-deep-dive/evidence/texas-tech/` directory grows; spot-check 5 random evidence files render readable raw_text.
3. After `llm_extract`: `data/team-deep-dive/extracted-facts/texas-tech.json` ≥ 500 facts with source URLs; spot-check 10 facts trace back to a real article quote.
4. After `reconcile`: `src/data/teams/texas-tech-men-record-book.json` has new sections populated (notable_pros from web, full conference-title list, more individual NCAA medalists, year-end rankings).
5. After `validate`: golden-set diff report at `data/team-deep-dive/golden-diff-texas-tech.json` shows ≥ 80% match. Discord posts the report URL.
6. `/teams/men/texas-tech/record-book` and `/teams/men/oklahoma-state/record-book` render the deep coverage.
7. Re-running the dispatcher with the same job_id is a no-op (idempotent).
8. Stop the LaunchAgent mid-`llm_extract` → restart → resumes at the article cursor.

## After pilots: rollout to remaining 34 teams

The Searx instance + LaunchAgent + scrapers + extractor are reused across every team without modification. Each new team is just one more job manifest. Compounding leverage: search aggregator results often surface multiple programs per article, so processing TT's articles incidentally enriches OSU, TCU, Oklahoma, etc. Identity resolver merges cross-team facts on shared player names.

Cumulative trajectory: 36 teams currently seeded × ~1–3 hours typical M2 runtime each ≈ **2–7 days of continuous Mac Mini runtime** to bring every existing program to deep-coverage parity (longer if Claude Max rate limits halve LLM throughput). After that, dispatcher idles until a new team's manifest is added — at which point the next program runs end-to-end automatically.
