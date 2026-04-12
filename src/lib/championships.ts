import { haversineDistance } from "@/lib/geo";
import type { TeamData } from "@/data/rankings-men";
import type { Championship } from "@/data/championships-men-2026";

export interface ChampionshipAssignment extends TeamData {
  championshipId: number;
  distanceMiles: number;
}

/**
 * Assign every ranked team to its conference championship venue and
 * compute the haversine travel distance from team home to venue.
 *
 * Teams whose conference has no championship in the data file are skipped
 * (this happens for unranked-conference teams or for conferences whose
 * 2026 venue is genuinely TBD and excluded from the source data).
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
    out.push({
      ...team,
      championshipId: champ.id,
      distanceMiles: haversineDistance(team.lat, team.lng, champ.lat, champ.lng),
    });
  }
  return out;
}
