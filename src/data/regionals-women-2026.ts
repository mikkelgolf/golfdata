import type { Regional } from "./regionals-men-2026";

/**
 * NCAA D1 Women's Golf Regional Sites for 2025-26.
 * 72 teams across 6 regionals (12 teams per regional).
 *
 * Source: David Tenneson's NCAA D1 Women Regionals S-curve spreadsheet.
 * Rankings as of 4/8/2026.
 *
 * Women's selections: April 29, 2026
 * Women's regionals: May 11-13, 2026
 */
export const regionalsWomen2026: Regional[] = [
  {
    id: 1,
    name: "Stanford Regional",
    host: "Stanford",
    city: "Stanford, CA",
    lat: 37.4275,
    lng: -122.1697,
    color: "#4a9070",
  },
  {
    id: 2,
    name: "Chapel Hill Regional",
    host: "North Carolina",
    city: "Chapel Hill, NC",
    lat: 35.9049,
    lng: -79.0469,
    color: "#2e7d5a",
  },
  {
    id: 3,
    name: "Waco Regional",
    host: "Baylor",
    city: "Waco, TX",
    lat: 31.5497,
    lng: -97.1143,
    color: "#7cb896",
  },
  {
    id: 4,
    name: "Ann Arbor Regional",
    host: "Michigan",
    city: "Ann Arbor, MI",
    lat: 42.2808,
    lng: -83.7430,
    color: "#888888",
  },
  {
    id: 5,
    name: "Tallahassee Regional",
    host: "Florida State",
    city: "Tallahassee, FL",
    lat: 30.4418,
    lng: -84.2985,
    color: "#5c5c5c",
  },
  {
    id: 6,
    name: "Simpsonville Regional",
    host: "Louisville",
    city: "Simpsonville, KY",
    lat: 38.2226,
    lng: -85.3554,
    color: "#aaaaaa",
  },
];
