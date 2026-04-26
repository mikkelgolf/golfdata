-- BigQuery DDL for cgd_graph dataset — the player + event graph
-- behind /team-deep-dive.
--
-- STATUS: REVIEW-READY, NOT YET EXECUTED. Run after user approval.
--
-- Project: mikkelgolf-caddie
-- Dataset: cgd_graph (new — separate from raw `caddie.*` so the lake stays untouched)
--
-- Conventions:
--   - All tables PARTITION BY ingest_date or as_of_date so backfills don't full-scan.
--   - Cluster keys chosen for the dominant lookup pattern (player_id, tournament_id).
--   - Append-only philosophy: provenance_log is the audit trail. Never DELETE.
--   - Writes go through MERGE on the documented PK.

-- ============================================================================
-- DATASET
-- ============================================================================
-- CREATE SCHEMA IF NOT EXISTS `mikkelgolf-caddie.cgd_graph`
--   OPTIONS (location = 'US', description = 'Player + event graph for /team-deep-dive');

-- ============================================================================
-- players
-- ============================================================================
CREATE TABLE IF NOT EXISTS `mikkelgolf-caddie.cgd_graph.players` (
  player_id STRING NOT NULL,                  -- ULID, deterministic from canonical_name + birthdate-or-class-year + first-school
  canonical_name STRING NOT NULL,
  name_variants ARRAY<STRUCT<
    name STRING,
    source STRING,
    first_seen TIMESTAMP
  >>,
  birthdate DATE,
  hometown_city STRING,
  hometown_state STRING,
  hometown_country STRING,
  handedness STRING,                          -- 'R' | 'L' | NULL
  height_in INT64,
  wagr_id STRING,
  datagolf_id STRING,
  ajga_id STRING,
  clippd_player_id STRING,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  ingest_date DATE NOT NULL
)
PARTITION BY ingest_date
CLUSTER BY canonical_name
OPTIONS (description = 'Canonical player records. PK: player_id.');

-- ============================================================================
-- player_school_stints
-- ============================================================================
CREATE TABLE IF NOT EXISTS `mikkelgolf-caddie.cgd_graph.player_school_stints` (
  stint_id STRING NOT NULL,                   -- player_id + ':' + school_slug + ':' + enrolled_year
  player_id STRING NOT NULL,
  school_slug STRING NOT NULL,
  gender STRING NOT NULL,                     -- 'm' | 'w'
  class_year INT64,                           -- graduating class year
  enrolled_year INT64,
  final_year INT64,
  transferred_in_from STRING,
  transferred_out_to STRING,
  redshirt_seasons ARRAY<INT64>,
  ingest_date DATE NOT NULL
)
PARTITION BY ingest_date
CLUSTER BY school_slug, player_id
OPTIONS (description = 'One row per (player, school). PK: stint_id.');

-- ============================================================================
-- tournament_xref
-- ============================================================================
CREATE TABLE IF NOT EXISTS `mikkelgolf-caddie.cgd_graph.tournament_xref` (
  tournament_id STRING NOT NULL,              -- canonical id (matches caddie.tournaments.tournament_id when applicable)
  golfstat_id STRING,
  clippd_id STRING,
  ncaa_event_id STRING,
  ajga_event_id STRING,
  bluegolf_id STRING,
  source_priority STRING,                     -- 'golfstat' | 'clippd' | 'ncaa' | 'school_pdf' | 'newspaper'
  notes STRING,
  ingest_date DATE NOT NULL
)
PARTITION BY ingest_date
CLUSTER BY tournament_id
OPTIONS (description = 'Cross-source ID mapping. Does NOT duplicate caddie.tournaments — links to it.');

-- ============================================================================
-- tournament_results
-- ============================================================================
CREATE TABLE IF NOT EXISTS `mikkelgolf-caddie.cgd_graph.tournament_results` (
  player_id STRING NOT NULL,                  -- PK part 1
  tournament_id STRING NOT NULL,              -- PK part 2
  school_slug STRING NOT NULL,                -- school AT TIME OF EVENT (may differ from current stint)
  placing INT64,
  placing_display STRING,                     -- 'T17', 'WD', 'DQ', '1', etc.
  total_score INT64,
  to_par INT64,
  rounds ARRAY<INT64>,
  made_cut BOOL,
  dq BOOL,
  wd BOOL,
  source STRING NOT NULL,                     -- 'golfstat' | 'clippd' | 'ncaa' | 'ajga' | 'school_pdf' | ...
  source_row_url STRING,
  scraped_at TIMESTAMP NOT NULL,
  conflict_flag BOOL DEFAULT FALSE,
  ingest_date DATE NOT NULL
)
PARTITION BY ingest_date
CLUSTER BY player_id, tournament_id
OPTIONS (description = 'Per-player per-event result. PK: (player_id, tournament_id). Multi-source rows reconcile via provenance_log.');

-- ============================================================================
-- ranking_snapshots
-- ============================================================================
CREATE TABLE IF NOT EXISTS `mikkelgolf-caddie.cgd_graph.ranking_snapshots` (
  snapshot_id STRING NOT NULL,                -- ULID
  player_id STRING,                           -- one of player_id or team_slug must be non-null
  team_slug STRING,
  source STRING NOT NULL,                     -- 'golfweek_sagarin' | 'wagr' | 'jgs' | 'ajga_rolex' | 'clippd' | 'scratch_players'
  as_of_date DATE NOT NULL,
  value INT64 NOT NULL,                       -- the rank number itself
  value_meta JSON,                            -- points, division, gender, etc.
  ingest_date DATE NOT NULL
)
PARTITION BY as_of_date
CLUSTER BY source, as_of_date
OPTIONS (description = 'Time-series rankings. Both player and team rankings live here.');

-- ============================================================================
-- pre_college_profile
-- ============================================================================
CREATE TABLE IF NOT EXISTS `mikkelgolf-caddie.cgd_graph.pre_college_profile` (
  player_id STRING NOT NULL,
  ajga_events ARRAY<STRUCT<
    event_id STRING,
    name STRING,
    date DATE,
    placing INT64,
    score INT64
  >>,
  rolex_all_america_year INT64,
  jgs_peak_rank INT64,
  state_amateur_titles ARRAY<STRUCT<state STRING, year INT64>>,
  usga_qualifications ARRAY<STRUCT<event STRING, year INT64>>,
  high_school STRING,
  committed_date DATE,
  ingest_date DATE NOT NULL
)
PARTITION BY ingest_date
CLUSTER BY player_id;

-- ============================================================================
-- post_college_profile
-- ============================================================================
CREATE TABLE IF NOT EXISTS `mikkelgolf-caddie.cgd_graph.post_college_profile` (
  player_id STRING NOT NULL,
  tour_starts ARRAY<STRUCT<tour STRING, year INT64, starts INT64, earnings_usd FLOAT64>>,
  tour_wins ARRAY<STRUCT<tour STRING, event STRING, date DATE>>,
  walker_cup_year INT64,
  palmer_cup_year INT64,
  curtis_cup_year INT64,
  last_known_status STRING,
  ingest_date DATE NOT NULL
)
PARTITION BY ingest_date
CLUSTER BY player_id;

-- ============================================================================
-- provenance_log
-- ============================================================================
CREATE TABLE IF NOT EXISTS `mikkelgolf-caddie.cgd_graph.provenance_log` (
  fact_id STRING NOT NULL,                    -- ULID
  subject_table STRING NOT NULL,              -- 'tournament_results' | 'players' | ...
  subject_pk STRING NOT NULL,                 -- the PK of the row this fact belongs to
  field STRING NOT NULL,
  value STRING,                               -- stringified for uniformity
  source STRING NOT NULL,
  source_url STRING,
  source_hash STRING,                         -- sha1 of fetched HTML / row
  scraped_at TIMESTAMP NOT NULL,
  superseded_by STRING,                       -- fact_id of the row that replaced this one
  confidence FLOAT64,                         -- 0..1
  ingest_date DATE NOT NULL
)
PARTITION BY ingest_date
CLUSTER BY subject_table, subject_pk
OPTIONS (description = 'Append-only audit trail. Every written fact gets a row.');

-- ============================================================================
-- event_coverage
-- ============================================================================
CREATE TABLE IF NOT EXISTS `mikkelgolf-caddie.cgd_graph.event_coverage` (
  tournament_id STRING NOT NULL,
  schools_seen ARRAY<STRING>,
  leaderboard_complete BOOL NOT NULL,
  player_count INT64,
  last_full_scrape_at TIMESTAMP,
  source STRING,
  ingest_date DATE NOT NULL
)
PARTITION BY ingest_date
CLUSTER BY tournament_id
OPTIONS (description = 'Dispatcher cache. If leaderboard_complete=true and recent, skip the scrape.');

-- ============================================================================
-- identity_candidates
-- ============================================================================
CREATE TABLE IF NOT EXISTS `mikkelgolf-caddie.cgd_graph.identity_candidates` (
  candidate_id STRING NOT NULL,               -- ULID
  proposed_player_id STRING,                  -- the player_id we're proposing to merge into (NULL = new player)
  raw_name STRING NOT NULL,
  raw_school STRING,
  raw_year INT64,
  evidence ARRAY<STRUCT<kind STRING, value STRING, weight FLOAT64>>,
  score FLOAT64 NOT NULL,
  status STRING NOT NULL,                     -- 'auto_merged' | 'needs_review' | 'rejected' | 'human_resolved'
  resolved_to_player_id STRING,
  created_at TIMESTAMP NOT NULL,
  resolved_at TIMESTAMP,
  ingest_date DATE NOT NULL
)
PARTITION BY ingest_date
CLUSTER BY status, score;

-- ============================================================================
-- reconciliation_events
-- ============================================================================
CREATE TABLE IF NOT EXISTS `mikkelgolf-caddie.cgd_graph.reconciliation_events` (
  reconciliation_id STRING NOT NULL,
  tournament_id STRING,
  player_id STRING,
  field STRING NOT NULL,
  before_value STRING,
  after_value STRING,
  winning_source STRING,
  losing_sources ARRAY<STRING>,
  resolution_rule STRING,                     -- 'source_priority' | 'hole_level_overrides' | 'human_review'
  resolved_at TIMESTAMP NOT NULL,
  ingest_date DATE NOT NULL
)
PARTITION BY ingest_date
CLUSTER BY tournament_id, player_id;

-- ============================================================================
-- career_seasons (materialized nightly from tournament_results + ranking_snapshots)
-- ============================================================================
-- Recommended: build as a scheduled MATERIALIZED VIEW or a nightly INSERT.
-- Stub left here; the nightly job lives in scripts/team-deep-dive/build-career-seasons.ts.
CREATE TABLE IF NOT EXISTS `mikkelgolf-caddie.cgd_graph.career_seasons` (
  player_id STRING NOT NULL,
  season INT64 NOT NULL,
  school_slug STRING,
  events_played INT64,
  scoring_avg FLOAT64,
  top10s INT64,
  wins INT64,
  individual_titles INT64,
  rank_start INT64,
  rank_end INT64,
  team_rank_start INT64,
  team_rank_end INT64,
  postseason_appearance BOOL,
  all_american_status STRING,                 -- 'first' | 'second' | 'third' | 'honorable' | NULL
  built_at TIMESTAMP NOT NULL,
  ingest_date DATE NOT NULL
)
PARTITION BY ingest_date
CLUSTER BY player_id, season;
