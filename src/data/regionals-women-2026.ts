import type { Regional } from "./regionals-men-2026";

/**
 * NCAA D1 Women's Golf Regional Sites for 2025-26.
 * 72 teams across 6 regionals (12 teams per regional).
 *
 * IDs match the NCAA selection committee's official Regional Site Number
 * ordering (Stanford=1, Ann Arbor=2, Tallahassee=3, Waco=4, Chapel Hill=5,
 * Simpsonville=6). Bracket uses these IDs in `regionals-actual-women-2026.ts`.
 *
 * Source: David Tenneson's NCAA D1 Women Regionals S-curve spreadsheet.
 *
 * Women's selections: April 29, 2026
 * Women's regionals: May 11-13, 2026
 */
// Same tuned palette as men's; consistent across genders so the colors
// keep meaning if a coach toggles between Men and Women — palette is
// applied in id order, not pinned to a specific host.
export const regionalsWomen2026: Regional[] = [
  {
    id: 1,
    name: "Stanford Regional",
    host: "Stanford",
    city: "Stanford, CA",
    lat: 37.4275,
    lng: -122.1697,
    color: "#5fb7b0",
    clippdUrl: "https://scoreboard.clippd.com/tournaments/243262",
  },
  {
    id: 2,
    name: "Ann Arbor Regional",
    host: "Michigan",
    city: "Ann Arbor, MI",
    lat: 42.2808,
    lng: -83.7430,
    color: "#7ba8d3",
    clippdUrl: "https://scoreboard.clippd.com/tournaments/243256",
  },
  {
    id: 3,
    name: "Tallahassee Regional",
    host: "Florida State",
    city: "Tallahassee, FL",
    lat: 30.4418,
    lng: -84.2985,
    color: "#92c785",
    clippdUrl: "https://scoreboard.clippd.com/tournaments/243263",
  },
  {
    id: 4,
    name: "Waco Regional",
    host: "Baylor",
    city: "Waco, TX",
    lat: 31.5497,
    lng: -97.1143,
    color: "#d6b173",
    clippdUrl: "https://scoreboard.clippd.com/tournaments/243265",
  },
  {
    id: 5,
    name: "Chapel Hill Regional",
    host: "North Carolina",
    city: "Chapel Hill, NC",
    lat: 35.9049,
    lng: -79.0469,
    color: "#d68a8a",
    clippdUrl: "https://scoreboard.clippd.com/tournaments/243257",
  },
  {
    id: 6,
    name: "Simpsonville Regional",
    host: "Louisville",
    city: "Simpsonville, KY",
    lat: 38.2226,
    lng: -85.3554,
    color: "#a895c9",
    clippdUrl: "https://scoreboard.clippd.com/tournaments/243260",
  },
];
