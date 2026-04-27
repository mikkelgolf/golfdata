import { Medal, Trophy } from "lucide-react";

import { cn } from "@/lib/utils";
import type { TeamHonours } from "@/lib/conference-results-2026";

/**
 * Renders the trio of conference-championship honour icons for a team:
 *   - Gold medal  → stroke-play winner in a mixed (SP + MP) format
 *   - Gold trophy → match-play champion (mixed) OR stroke-play champion (stroke-only)
 *   - Silver trophy → match-play runner-up
 *
 * Uses the same icons / colours as the conference championships chronological
 * tab so the visual language stays consistent. Renders nothing when the team
 * has no honours.
 *
 * `size`:
 *   - "sm" (default): 14px (h-3.5 w-3.5) — matches the team-page header next
 *                     to the conference badge.
 *   - "xs": 12px (h-3 w-3) — for dense lists / map popups.
 */
export function TeamHonoursIcons({
  honours,
  conferenceFull,
  size = "sm",
  className,
}: {
  honours: TeamHonours;
  /** Used in the icon's title/aria-label, e.g. "Stroke-play winner — Atlantic Coast Conference". */
  conferenceFull?: string;
  size?: "sm" | "xs";
  className?: string;
}) {
  if (
    !honours.strokeplayMedal &&
    !honours.matchplayChampion &&
    !honours.matchplayRunnerUp &&
    !honours.strokeplayChampion
  ) {
    return null;
  }

  const iconSize = size === "xs" ? "h-3 w-3" : "h-3.5 w-3.5";
  const suffix = conferenceFull ? ` — ${conferenceFull}` : "";

  return (
    <span className={cn("inline-flex items-center", className)}>
      {honours.strokeplayMedal && (
        <span
          className="ml-1 inline-flex items-center align-middle"
          title={`Stroke-play winner${suffix}`}
          aria-label="Stroke-play winner"
        >
          <Medal className={cn(iconSize, "text-amber-300")} aria-hidden="true" />
        </span>
      )}
      {honours.matchplayChampion && (
        <span
          className="ml-1 inline-flex items-center align-middle"
          title={`Match-play champion${suffix}`}
          aria-label="Match-play champion"
        >
          <Trophy className={cn(iconSize, "text-amber-300")} aria-hidden="true" />
        </span>
      )}
      {honours.matchplayRunnerUp && (
        <span
          className="ml-1 inline-flex items-center align-middle"
          title={`Match-play runner-up${suffix}`}
          aria-label="Match-play runner-up"
        >
          <Trophy className={cn(iconSize, "text-slate-400")} aria-hidden="true" />
        </span>
      )}
      {honours.strokeplayChampion && (
        <span
          className="ml-1 inline-flex items-center align-middle"
          title={`Conference champion${suffix}`}
          aria-label="Conference champion"
        >
          <Trophy className={cn(iconSize, "text-amber-300")} aria-hidden="true" />
        </span>
      )}
    </span>
  );
}
