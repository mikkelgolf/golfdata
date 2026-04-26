# team-deep-dive scripts

Operational implementation of the `/team-deep-dive` skill. See the architecture plan at `~/.claude/plans/in-the-mikkel-system-and-nested-waterfall.md`.

## Layout

```
scripts/team-deep-dive/
├── README.md                  # this file
├── schema.sql                 # BigQuery DDL for cgd_graph dataset (review-only, NOT executed)
├── lib/
│   └── types.ts               # shared TS types: Player, TournamentResult, etc.
├── roster-discovery.ts        # Phase 0: scan local data for any mention of a team's players
├── identity.ts                # NOT YET BUILT — fuzzy match + score + auto-merge / queue
├── reconcile.ts               # NOT YET BUILT — provenance log + conflict resolver
├── dispatcher.ts              # NOT YET BUILT — event-level job emission, event_coverage cache
├── run.ts                     # NOT YET BUILT — LaunchAgent worker entry point
└── sources/                   # NOT YET BUILT — one module per source (golfstat, ncaa, ajga, ...)
```

## Build state

- ✅ Phase 0a roster discovery from local NCAA Record Book + David's sheets (`roster-discovery.ts`)
- ✅ Phase 0b roster expansion from BQ `granular_master` (`roster-from-bq.py`)
- ✅ Per-event careers pull (`careers-from-bq.py`)
- ✅ Per-player JSON exports + index (`build-player-exports.ts` → `src/data/players/<id>.json`)
- ✅ `/players/[id]` Next.js route at `src/app/players/[id]/page.tsx`
- ✅ BigQuery DDL drafted in `schema.sql` — REVIEW BEFORE EXECUTING
- ⬜ Identity resolver (CamelCase fix, cross-gender filter via dim_team_rosetta)
- ⬜ Source modules beyond granular_master (GolfStat backfill for pre-2010, NCAA.com, AJGA, WAGR, JGS, DataGolf)
- ⬜ Dispatcher with `event_coverage` cache
- ⬜ LaunchAgent worker
- ⬜ Discord milestone publisher

## Running the full Phase 0 pipeline for a team

```bash
# 1. Local-data roster (records + David's sheets) → 6 candidates for TT
npx tsx scripts/team-deep-dive/roster-discovery.ts texas-tech men

# 2. Expand from granular_master (GolfStat + Clippd) → ~80 candidates for TT
~/venv/bin/python scripts/team-deep-dive/roster-from-bq.py texas-tech men

# 3. Pull per-event career rows
~/venv/bin/python scripts/team-deep-dive/careers-from-bq.py texas-tech men

# 4. Emit per-player JSON exports + index
npx tsx scripts/team-deep-dive/build-player-exports.ts texas-tech men

# 5. Player pages now resolvable at /players/<player_id>
#    Top scorer at /players/9b59f6210b30 (Calum Scott)
```

## Convention notes

- All long-running scrapes belong in `scripts/team-deep-dive/sources/<source>.ts` and are invoked by `run.ts`. They MUST cache HTML to `data/cache/<host>/<sha1(url)>.html.gz`.
- All BigQuery writes go through `MERGE` against the keys defined in `schema.sql`. Never `DELETE`.
- Every fact written carries a row in `provenance_log`. No exceptions.
- Slug convention: lowercase, kebab-case, derived from the `team` field in `src/data/all-teams-{men,women}-2026.ts`.
