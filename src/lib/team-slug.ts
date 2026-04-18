import { rankingsMen } from "@/data/rankings-men";
import { rankingsWomen } from "@/data/rankings-women";
import { allTeamsMen2026 } from "@/data/all-teams-men-2026";
import { allTeamsWomen2026 } from "@/data/all-teams-women-2026";
import type { Gender } from "@/data/records-types";

export function slugify(teamName: string): string {
  return teamName
    .toLowerCase()
    .replace(/[\u2018\u2019']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildSlugMap(gender: Gender): Map<string, string> {
  const rankings = gender === "men" ? rankingsMen : rankingsWomen;
  const allTeams = gender === "men" ? allTeamsMen2026 : allTeamsWomen2026;
  const map = new Map<string, string>();
  for (const src of [rankings, allTeams]) {
    for (const t of src) {
      const slug = slugify(t.team);
      const existing = map.get(slug);
      if (existing && existing !== t.team) {
        throw new Error(
          `Slug collision for ${gender}: "${existing}" and "${t.team}" both slugify to "${slug}"`
        );
      }
      map.set(slug, t.team);
    }
  }
  return map;
}

const menMap = buildSlugMap("men");
const womenMap = buildSlugMap("women");

export function unslugify(slug: string, gender: Gender): string | null {
  const map = gender === "men" ? menMap : womenMap;
  return map.get(slug) ?? null;
}

export function allSlugs(gender: Gender): string[] {
  const map = gender === "men" ? menMap : womenMap;
  return [...map.keys()].sort();
}
