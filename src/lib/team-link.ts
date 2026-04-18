import type { Gender } from "@/data/records-types";
import { slugify } from "@/lib/team-slug";

export function teamHref(team: string, gender: Gender): string {
  return `/teams/${gender}/${slugify(team)}`;
}
