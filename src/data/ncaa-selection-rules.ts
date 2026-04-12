/**
 * NCAA D1 Golf Championship Selection Rules Reference
 *
 * Encodes the full set of rules the NCAA selection committee uses
 * to assign teams to regionals. This serves as the authoritative
 * reference for the S-curve algorithm and content generation.
 *
 * Sources:
 * - NCAA Pre-Championship Manual (Division I Men's & Women's Golf)
 * - David Tenneson's historical analysis
 * - Mikkel Bjerch-Andresen's coaching experience
 */

// ---------------------------------------------------------------------------
// Championship Structure
// ---------------------------------------------------------------------------

export const CHAMPIONSHIP_STRUCTURE = {
  regionals: {
    count: 6,
    teamsPerRegional: { min: 12, max: 14 },
    advancingPerRegional: 5,
    format: "54 holes, stroke play",
    duration: "3 days",
  },
  nationals: {
    teamsAdvancing: 30,
    format: "stroke play + match play",
    strokePlayRounds: 4,
    matchPlayCut: 8,
  },
  totalFieldSize: {
    men: 81,
    women: 72,
  },
} as const;

// ---------------------------------------------------------------------------
// Selection Process
// ---------------------------------------------------------------------------

export const SELECTION_PROCESS = {
  rankingSource: "Broadie Athletic Power Rankings (via Clippd Scoreboard)",
  rankingUrl: "https://scoreboard.clippd.com/rankings",
  selectionBasis:
    "Teams are ranked by the Broadie Athletic Power Rankings. " +
    "The committee uses these rankings as the primary factor, " +
    "then applies judgment for geographic, competitive, and logistic considerations.",

  steps: [
    {
      step: 1,
      name: "Determine eligible teams",
      detail:
        "Teams must have a .500 or better record (wins >= losses) to be eligible. " +
        "Auto-qualifiers (conference champions) bypass this requirement.",
    },
    {
      step: 2,
      name: "Identify auto-qualifiers",
      detail:
        "Each conference champion earns an automatic bid. " +
        "AQs are typically seeded 12-14 in the S-curve but enter as the " +
        "last teams assigned to a regional (protecting at-large bids for higher-ranked teams).",
    },
    {
      step: 3,
      name: "Assign top seeds to regionals",
      detail:
        "The top 6 ranked teams (1-seeds) are assigned to the CLOSEST regional site, " +
        "not in strict serpentine order. This is the '1-seed proximity rule.' " +
        "If a host school is a top seed, they are locked into their home regional first.",
    },
    {
      step: 4,
      name: "Serpentine fill for remaining seeds",
      detail:
        "Seeds 7+ are assigned via standard serpentine: " +
        "7-12 go right-to-left (reverse of 1-6), 13-18 go left-to-right again, etc. " +
        "This balances field strength across regionals.",
    },
    {
      step: 5,
      name: "Host school swaps",
      detail:
        "If a host school is ranked outside the top 6, they are swapped into their " +
        "home regional from wherever the serpentine placed them. " +
        "The swap happens within the same seed tier to minimize disruption.",
    },
    {
      step: 6,
      name: "AQ geographic preference",
      detail:
        "Auto-qualifiers seeded 12+ receive geographic consideration. " +
        "The committee avoids sending AQs from smaller conferences cross-country. " +
        "If an AQ is assigned >1200 miles from their regional, the committee " +
        "will try to swap them closer without breaking other constraints.",
    },
    {
      step: 7,
      name: "Final balance review",
      detail:
        "The committee reviews the final assignments for competitive balance, " +
        "ensuring no single regional is dramatically stronger than others. " +
        "Minor adjustments may be made at the committee's discretion.",
    },
  ],
} as const;

// ---------------------------------------------------------------------------
// Eligibility Rules
// ---------------------------------------------------------------------------

export const ELIGIBILITY_RULES = {
  halfRule: {
    name: ".500 Rule",
    detail:
      "A team must have a winning record (.500 or better) in head-to-head " +
      "competition during the current season to be eligible for the NCAA Championship. " +
      "Ties count as half a win and half a loss.",
    calculation: "(wins + ties * 0.5) / (wins + losses + ties) >= 0.500",
    exception:
      "Auto-qualifiers (conference champions) are exempt from the .500 rule. " +
      "They earn their bid by winning their conference championship regardless of record.",
  },
  autoQualifiers: {
    name: "Automatic Qualifiers",
    detail:
      "Each Division I conference that sponsors golf may send its champion " +
      "as an automatic qualifier. The AQ is typically seeded at the bottom " +
      "of the S-curve (seeds 12-14) unless their ranking warrants a higher seed.",
    conferences: {
      men: [
        "SEC", "ACC", "B12", "B10", "WCC", "MWC", "AAC", "CAA",
        "BWEST", "BEAST", "SUNBELT", "ASUN", "SOCON", "CUSA", "OVC",
      ],
      women: [
        "SEC", "ACC", "B12", "B10", "WCC", "MWC", "AAC", "CAA",
        "BWEST", "BEAST", "SUNBELT", "ASUN", "SOCON", "CUSA",
      ],
    },
  },
} as const;

// ---------------------------------------------------------------------------
// S-Curve Algorithm Constants
// ---------------------------------------------------------------------------

export const SCURVE_CONSTANTS = {
  aqDistanceThreshold: 1200,
  topSeedCount: 6,
  advancementLine: 5,
  serpentineDirection: {
    tier0: "left-to-right",
    tier1: "right-to-left",
    tier2: "left-to-right",
    pattern: "alternating (even tiers L→R, odd tiers R→L)",
  },
} as const;

// ---------------------------------------------------------------------------
// Key Dates (2025-26 Season)
// ---------------------------------------------------------------------------

export const KEY_DATES_2026 = {
  rankings: {
    weeklyRelease: "Wednesdays",
    finalRankingsBeforeSelections: "TBD",
  },
  women: {
    selections: "2026-04-29",
    regionals: { start: "2026-05-11", end: "2026-05-13" },
    nationals: { start: "2026-05-17", end: "2026-05-22" },
  },
  men: {
    selections: "2026-05-06",
    regionals: { start: "2026-05-18", end: "2026-05-20" },
    nationals: { start: "2026-05-29", end: "2026-06-03" },
  },
  benchmarkMoments: [
    { label: "post-conferences", description: "After all conference championships conclude" },
    { label: "post-regionals", description: "After NCAA regionals (shows ranking shifts)" },
    { label: "post-nationals", description: "Final season analysis" },
  ],
} as const;

// ---------------------------------------------------------------------------
// Bubble Line / Bubble Zone
// ---------------------------------------------------------------------------

export const BUBBLE_ZONE = {
  description:
    "The bubble line is the cutoff between the last team in the field and " +
    "the first team out. Teams ranked near this line are in the 'bubble zone.'",
  display: {
    lastInCount: 6,
    firstOutCount: 10,
    bubbleLineHighlight: "golden bold border on the cutoff line",
  },
  analysis:
    "The last-in vs first-out comparison is high-value content. " +
    "Automated packets showing 'if you saved 2 strokes here, you'd be in' " +
    "are a potential paid product for coaches.",
} as const;

// ---------------------------------------------------------------------------
// Head-to-Head Rules
// ---------------------------------------------------------------------------

export const HEAD_TO_HEAD = {
  definition:
    "Two teams have a head-to-head result when they compete in the same tournament. " +
    "The team finishing higher wins the head-to-head. " +
    "Ties in tournament placement are counted as ties.",
  relevance:
    "Head-to-head records are used by the committee as a tiebreaker " +
    "and to evaluate bubble teams. A team with a losing record against " +
    "another team in their projected regional may be moved.",
  dataSource: "Clippd team pages (schedule + tournament finishes) or Golfstat",
} as const;

// ---------------------------------------------------------------------------
// Strength of Field (SoF)
// ---------------------------------------------------------------------------

export const STRENGTH_OF_FIELD = {
  description:
    "Strength of Field measures how strong the competition was at a given tournament. " +
    "Higher SoF means the rankings impact of a good finish is greater.",
  broadieMethod:
    "The Broadie/Clippd rankings use weighted points that incorporate SoF. " +
    "A win against a strong field produces more ranking points than " +
    "a win against a weak field.",
  cascadingEffect:
    "SoF calculations cascade: changing one team's score affects the SoF " +
    "of every tournament they played in, which affects every other team's " +
    "weighted points. This makes what-if analysis computationally complex.",
} as const;
