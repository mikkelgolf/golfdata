import type { TeamData } from "./rankings-men";

/**
 * NCAA D1 Women's golf rankings.
 * 72 teams are selected for the NCAA Championship, distributed across 6 regionals.
 *
 * Women's NCAA selections: April 29, 2026
 * Women's regionals: May 11-13, 2026
 * Women's nationals: May 17-22, 2026
 *
 * Update this file with latest Broadie/Clippd rankings when available.
 * Data format matches men's rankings for S-curve algorithm compatibility.
 */
export const rankingsWomen: TeamData[] = [
  // Data pending — update with Broadie/Clippd women's rankings
  // when David's spreadsheet is ready.
  //
  // Format:
  // { rank: 1, team: "Stanford", conference: "ACC", events: 9, wins: 0, losses: 0, ties: 0, eligible: true, isAutoQualifier: true, aqConference: "ACC", lat: 37.4275, lng: -122.1697 },
];
