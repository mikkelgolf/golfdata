import { haversineDistance } from "@/lib/geo";
import type { TeamData } from "@/data/rankings-men";
import type { Championship } from "@/data/championships-men-2026";

export interface ChampionshipAssignment extends TeamData {
  championshipId: number;
  distanceMiles: number;
}

/**
 * Assign every team to its conference championship venue and compute the
 * haversine travel distance from team home to venue. Re-derives AQ status
 * from the full field: the top-ranked team in each conference becomes the
 * predicted automatic qualifier, regardless of how the source data flagged
 * `isAutoQualifier`.
 *
 * Teams whose conference has no championship in the data file are skipped.
 * Teams without coordinates (lat=0 && lng=0) and championships with TBD
 * venues both produce distanceMiles=0 — the UI renders these as "—".
 */
export function assignToChampionships(
  teams: TeamData[],
  championships: Championship[]
): ChampionshipAssignment[] {
  const byConference = new Map<string, Championship>();
  for (const c of championships) byConference.set(c.conference, c);

  const out: ChampionshipAssignment[] = [];
  for (const team of teams) {
    const champ = byConference.get(team.conference);
    if (!champ) continue;
    const teamHasCoords = team.lat !== 0 || team.lng !== 0;
    const venueHasCoords = champ.lat !== 0 || champ.lng !== 0;
    out.push({
      ...team,
      championshipId: champ.id,
      distanceMiles:
        teamHasCoords && venueHasCoords
          ? Math.round(haversineDistance(team.lat, team.lng, champ.lat, champ.lng))
          : 0,
      isAutoQualifier: false,
      aqConference: null,
    });
  }

  // Build confirmed-winner lookup: conference -> winner team name
  const confirmedWinners = new Map<string, string>();
  for (const c of championships) {
    if (c.winner) confirmedWinners.set(c.conference, c.winner);
  }

  // Re-derive AQ: if a championship has a confirmed winner, that team gets
  // the AQ regardless of rank. Otherwise fall back to the top-ranked team
  // per conference (predicted AQ).
  const topByConf = new Map<string, ChampionshipAssignment>();
  for (const a of out) {
    const winner = confirmedWinners.get(a.conference);
    if (winner) {
      // Confirmed winner: match by team name
      if (a.team === winner) topByConf.set(a.conference, a);
    } else {
      // Predicted: top-ranked team
      const cur = topByConf.get(a.conference);
      if (!cur || a.rank < cur.rank) topByConf.set(a.conference, a);
    }
  }
  for (const a of out) {
    if (topByConf.get(a.conference) === a) {
      a.isAutoQualifier = true;
      a.aqConference = a.conference;
    }
  }

  return out;
}
