-- =============================================================================
-- College Golf Data - BigQuery Data Cleaning Queries
-- =============================================================================
-- Run against the CADDIE BigQuery project (mikkelgolf-caddie).
--
-- Known issues flagged by David:
-- 1. tournament_id 24048 (2022 Southern Highlands) has wrong tournament name
--    AND individual positions are wrong (Patrick Welch finished 1st, not
--    Christo Lamprecht as the data shows).
-- 2. tournament_id 5264 also has issues David flagged.
-- 3. Placing data is inconsistent across many tournaments. Workaround:
--    derive placing from total score using RANK() window function.
-- 4. David requested a source_link field alongside tournament_source to track
--    where each tournament's data came from (Golfstat URL, Wayback Machine, etc).
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. IDENTIFY DUPLICATE TOURNAMENTS
-- ---------------------------------------------------------------------------
-- Find tournaments with identical name, dates, and course that might be dupes.
-- This is critical for David's work connecting events across name changes.

SELECT
  tournament_name,
  start_date,
  course_name,
  COUNT(*) as count,
  ARRAY_AGG(tournament_id ORDER BY tournament_id) as tournament_ids
FROM `mikkelgolf-caddie.caddie.tournaments`
GROUP BY tournament_name, start_date, course_name
HAVING COUNT(*) > 1
ORDER BY count DESC;


-- ---------------------------------------------------------------------------
-- 2. DERIVE CORRECT PLACING FROM SCORES
-- ---------------------------------------------------------------------------
-- Don't trust source placing data. Calculate from total scores instead.
-- Handles ties using RANK(). This is Mikkel's workaround for the placing issue.

CREATE OR REPLACE VIEW `mikkelgolf-caddie.caddie.vw_corrected_placings` AS
SELECT
  r.*,
  RANK() OVER (
    PARTITION BY r.tournament_id
    ORDER BY r.total_score ASC
  ) AS derived_placing,
  CASE
    WHEN r.placing != RANK() OVER (
      PARTITION BY r.tournament_id
      ORDER BY r.total_score ASC
    ) THEN TRUE
    ELSE FALSE
  END AS placing_mismatch
FROM `mikkelgolf-caddie.caddie.results` r
WHERE r.total_score IS NOT NULL
  AND r.total_score > 0;


-- ---------------------------------------------------------------------------
-- 3. FIND TOURNAMENTS WITH PLACING MISMATCHES
-- ---------------------------------------------------------------------------
-- Identify tournaments where source placings diverge from score-derived ones.
-- Use this to prioritize which tournaments need manual review.

SELECT
  tournament_id,
  tournament_name,
  COUNT(*) as total_players,
  COUNTIF(placing_mismatch) as mismatched_placings,
  ROUND(COUNTIF(placing_mismatch) / COUNT(*) * 100, 1) as mismatch_pct
FROM `mikkelgolf-caddie.caddie.vw_corrected_placings`
GROUP BY tournament_id, tournament_name
HAVING COUNTIF(placing_mismatch) > 0
ORDER BY mismatch_pct DESC
LIMIT 50;


-- ---------------------------------------------------------------------------
-- 4. SPECIFIC TOURNAMENTS DAVID FLAGGED
-- ---------------------------------------------------------------------------
-- Check the exact tournaments David identified as problematic.

-- 2022 Southern Highlands Collegiate (Patrick Welch won, not Christo Lamprecht)
SELECT
  tournament_id,
  tournament_name,
  player_name,
  school,
  placing,
  total_score,
  RANK() OVER (ORDER BY total_score ASC) as correct_placing
FROM `mikkelgolf-caddie.caddie.results`
WHERE tournament_id = 24048
ORDER BY total_score ASC
LIMIT 20;

-- Tournament 5264 (also flagged by David)
SELECT
  tournament_id,
  tournament_name,
  player_name,
  school,
  placing,
  total_score,
  RANK() OVER (ORDER BY total_score ASC) as correct_placing
FROM `mikkelgolf-caddie.caddie.results`
WHERE tournament_id = 5264
ORDER BY total_score ASC
LIMIT 20;


-- ---------------------------------------------------------------------------
-- 5. STANDARDIZE TOURNAMENT NAMES
-- ---------------------------------------------------------------------------
-- Normalize common name variations. David's record book work depends on
-- connecting the same tournament across years even when names change.

UPDATE `mikkelgolf-caddie.caddie.tournaments`
SET tournament_name = CASE
  WHEN REGEXP_CONTAINS(tournament_name, r'(?i)southern.?highlands') THEN 'Southern Highlands Collegiate'
  WHEN REGEXP_CONTAINS(tournament_name, r'(?i)john.?a?.?burns') THEN 'John A. Burns Intercollegiate'
  WHEN REGEXP_CONTAINS(tournament_name, r'(?i)the.?goodwin') THEN 'The Goodwin'
  WHEN REGEXP_CONTAINS(tournament_name, r'(?i)jackson.?t?.?stephens') THEN 'Jackson T. Stephens Cup'
  WHEN REGEXP_CONTAINS(tournament_name, r'(?i)carmel.?cup') THEN 'Carmel Cup'
  WHEN REGEXP_CONTAINS(tournament_name, r'(?i)blessings.?collegiate') THEN 'Blessings Collegiate'
  ELSE tournament_name
END
WHERE REGEXP_CONTAINS(tournament_name, r'(?i)(southern.?highlands|john.?a?.?burns|the.?goodwin|jackson.?t?.?stephens|carmel.?cup|blessings.?collegiate)');


-- ---------------------------------------------------------------------------
-- 6. ADD SOURCE TRACKING FIELDS
-- ---------------------------------------------------------------------------
-- David requested source_link alongside tournament_source so we can track
-- exactly which Golfstat URL or Wayback Machine page each tournament came from.

ALTER TABLE `mikkelgolf-caddie.caddie.tournaments`
ADD COLUMN IF NOT EXISTS source_link STRING;

ALTER TABLE `mikkelgolf-caddie.caddie.tournaments`
ADD COLUMN IF NOT EXISTS tournament_source STRING;


-- ---------------------------------------------------------------------------
-- 7. DATA QUALITY REPORT
-- ---------------------------------------------------------------------------
-- Run this periodically to track overall data health.

SELECT
  'Total tournaments' as metric, CAST(COUNT(DISTINCT tournament_id) AS STRING) as value
FROM `mikkelgolf-caddie.caddie.tournaments`
UNION ALL
SELECT
  'Total player results', CAST(COUNT(*) AS STRING)
FROM `mikkelgolf-caddie.caddie.results`
UNION ALL
SELECT
  'Results with NULL score', CAST(COUNTIF(total_score IS NULL) AS STRING)
FROM `mikkelgolf-caddie.caddie.results`
UNION ALL
SELECT
  'Results with zero score', CAST(COUNTIF(total_score = 0) AS STRING)
FROM `mikkelgolf-caddie.caddie.results`
UNION ALL
SELECT
  'Tournaments without dates', CAST(COUNTIF(start_date IS NULL) AS STRING)
FROM `mikkelgolf-caddie.caddie.tournaments`
UNION ALL
SELECT
  'Distinct seasons', CAST(COUNT(DISTINCT season) AS STRING)
FROM `mikkelgolf-caddie.caddie.tournaments`
WHERE season IS NOT NULL;


-- ---------------------------------------------------------------------------
-- 8. COVERAGE BY SEASON
-- ---------------------------------------------------------------------------
-- David wanted to see what percentage of teams we have data for per season.
-- Useful for identifying gaps in historical coverage.

SELECT
  season,
  COUNT(DISTINCT tournament_id) as tournaments,
  COUNT(DISTINCT school) as teams,
  COUNT(DISTINCT player_name) as players,
  COUNTIF(total_score IS NOT NULL AND total_score > 0) as valid_scores,
  COUNT(*) as total_rows
FROM `mikkelgolf-caddie.caddie.results` r
JOIN `mikkelgolf-caddie.caddie.tournaments` t USING (tournament_id)
WHERE season IS NOT NULL
GROUP BY season
ORDER BY season DESC;


-- ---------------------------------------------------------------------------
-- 9. HOLE-BY-HOLE DATA COVERAGE
-- ---------------------------------------------------------------------------
-- Check which tournaments have granular hole-by-hole vs just round-level.
-- The hole-by-hole data is what enables bounce-back rates, par-type analysis,
-- wave splits, and SGT+ calculations.

SELECT
  season,
  COUNT(DISTINCT CASE WHEN has_hole_data THEN tournament_id END) as hole_level_tournaments,
  COUNT(DISTINCT CASE WHEN NOT has_hole_data THEN tournament_id END) as round_level_only,
  ROUND(
    COUNT(DISTINCT CASE WHEN has_hole_data THEN tournament_id END) * 100.0 /
    NULLIF(COUNT(DISTINCT tournament_id), 0), 1
  ) as hole_level_pct
FROM (
  SELECT
    t.tournament_id,
    t.season,
    EXISTS(
      SELECT 1 FROM `mikkelgolf-caddie.caddie.hole_scores` h
      WHERE h.tournament_id = t.tournament_id
      LIMIT 1
    ) as has_hole_data
  FROM `mikkelgolf-caddie.caddie.tournaments` t
)
GROUP BY season
ORDER BY season DESC;
