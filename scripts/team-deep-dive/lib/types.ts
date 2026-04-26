/**
 * Shared types for /team-deep-dive.
 *
 * Mirrors the BigQuery `cgd_graph.*` schema (see ../schema.sql) so that
 * scrapers, the identity resolver, and the dispatcher all speak the same
 * shape before staging rows for MERGE.
 */

export type Gender = "m" | "w";

export type SourceName =
  | "golfstat"
  | "clippd"
  | "ncaa"
  | "ajga"
  | "wagr"
  | "jgs"
  | "bluegolf"
  | "datagolf"
  | "school_pdf"
  | "newspaper"
  | "manual"
  | "regionals_history"
  | "championships_history"
  | "ncaa_record_book";

export interface Player {
  player_id: string;
  canonical_name: string;
  name_variants: NameVariant[];
  birthdate?: string; // ISO date
  hometown_city?: string;
  hometown_state?: string;
  hometown_country?: string;
  handedness?: "R" | "L";
  height_in?: number;
  wagr_id?: string;
  datagolf_id?: string;
  ajga_id?: string;
  clippd_player_id?: string;
  created_at: string;
  updated_at: string;
}

export interface NameVariant {
  name: string;
  source: SourceName;
  first_seen: string;
}

export interface PlayerSchoolStint {
  stint_id: string;
  player_id: string;
  school_slug: string;
  gender: Gender;
  class_year?: number;
  enrolled_year?: number;
  final_year?: number;
  transferred_in_from?: string;
  transferred_out_to?: string;
  redshirt_seasons?: number[];
}

export interface TournamentResult {
  player_id: string;
  tournament_id: string;
  school_slug: string;
  placing?: number;
  placing_display?: string;
  total_score?: number;
  to_par?: number;
  rounds?: number[];
  made_cut?: boolean;
  dq?: boolean;
  wd?: boolean;
  source: SourceName;
  source_row_url?: string;
  scraped_at: string;
  conflict_flag?: boolean;
}

export interface RankingSnapshot {
  snapshot_id: string;
  player_id?: string;
  team_slug?: string;
  source: SourceName;
  as_of_date: string;
  value: number;
  value_meta?: Record<string, unknown>;
}

export interface ProvenanceLogEntry {
  fact_id: string;
  subject_table: string;
  subject_pk: string;
  field: string;
  value: string;
  source: SourceName;
  source_url?: string;
  source_hash?: string;
  scraped_at: string;
  superseded_by?: string;
  confidence?: number;
}

export interface EventCoverage {
  tournament_id: string;
  schools_seen: string[];
  leaderboard_complete: boolean;
  player_count?: number;
  last_full_scrape_at?: string;
  source?: SourceName;
}

export interface IdentityCandidate {
  candidate_id: string;
  proposed_player_id?: string;
  raw_name: string;
  raw_school?: string;
  raw_year?: number;
  evidence: IdentityEvidence[];
  score: number;
  status: "auto_merged" | "needs_review" | "rejected" | "human_resolved";
  resolved_to_player_id?: string;
  created_at: string;
  resolved_at?: string;
}

export interface IdentityEvidence {
  kind:
    | "name_jaro_winkler"
    | "exact_variant_match"
    | "school_match"
    | "class_year_overlap"
    | "co_event_presence"
    | "hometown_match"
    | "birthdate_match"
    | "external_id";
  value: string;
  weight: number;
}

/**
 * Phase 0 roster discovery output. Written to
 * data/team-deep-dive/roster-preview-<slug>.json.
 *
 * Pre-identity-resolution: each candidate is just a name + the sources that
 * mentioned it for this team. The identity resolver runs later to merge
 * candidates into canonical Player rows.
 */
export interface RosterPreview {
  team_slug: string;
  team_name: string;
  gender: Gender;
  built_at: string;
  candidate_count: number;
  candidates: RosterCandidate[];
  sources_consulted: SourceName[];
  notes: string[];
}

export interface RosterCandidate {
  raw_name: string;
  normalized_name: string;
  mentions: RosterMention[];
  /** Heuristic confidence the name actually played for this team, 0..1. */
  confidence: number;
}

export interface RosterMention {
  source: SourceName;
  context: string; // e.g. 'records-men.json:Lowest 54-Hole Score' or 'caddie.results:2018-Big 12 Championship'
  year?: number;
  detail?: string;
}
