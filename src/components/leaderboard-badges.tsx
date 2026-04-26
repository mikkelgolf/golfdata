"use client";

import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConferenceResult2026 } from "@/lib/conference-results-2026";

/**
 * Renders one or two soft-coloured Clippd-leaderboard badges for a
 * conference championship — soft-blue for stroke play, soft-red for
 * match play. A badge only appears when the corresponding URL exists
 * on the result. Render-nothing if neither URL is present.
 *
 * The badges are anchors to the public Clippd scoreboard. They stop
 * click propagation so they don't accidentally toggle expandable
 * parents (cards / popups).
 *
 * `size`:
 *   - "sm" (default): meant for inside dense popups (map overlay).
 *   - "md": slightly larger, used in the conference-card header.
 */
export function LeaderboardBadges({
  result,
  size = "sm",
  className,
}: {
  result: ConferenceResult2026 | undefined;
  size?: "sm" | "md";
  className?: string;
}) {
  if (!result) return null;
  if (!result.strokeplayUrl && !result.matchplayUrl) return null;

  const sizeClasses =
    size === "md"
      ? "text-[10px] px-1.5 py-0.5 gap-0.5"
      : "text-[9px] px-1 py-0.5 gap-0.5";
  const iconSize = size === "md" ? "h-2.5 w-2.5" : "h-2 w-2";

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {result.strokeplayUrl && (
        <a
          href={result.strokeplayUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          aria-label="Open stroke-play leaderboard on Clippd"
          title="Stroke-play leaderboard (Clippd)"
          className={cn(
            "inline-flex items-center rounded font-medium uppercase tracking-wide",
            "bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 hover:text-sky-200",
            "transition-colors whitespace-nowrap",
            sizeClasses
          )}
        >
          Stroke Play
          <ExternalLink className={cn(iconSize, "opacity-70")} />
        </a>
      )}
      {result.matchplayUrl && (
        <a
          href={result.matchplayUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          aria-label="Open match-play leaderboard on Clippd"
          title="Match-play leaderboard (Clippd)"
          className={cn(
            "inline-flex items-center rounded font-medium uppercase tracking-wide",
            "bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 hover:text-rose-200",
            "transition-colors whitespace-nowrap",
            sizeClasses
          )}
        >
          Match Play
          <ExternalLink className={cn(iconSize, "opacity-70")} />
        </a>
      )}
    </span>
  );
}
