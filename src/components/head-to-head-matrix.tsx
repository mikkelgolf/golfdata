"use client";

import Link from "next/link";
import h2hData from "@/data/head-to-head-2526.json";
import { cn } from "@/lib/utils";
import { teamHref } from "@/lib/team-link";
import TeamMonogram from "@/components/team-page/team-monogram";
import type { Gender } from "@/data/records-types";
import type {
  TeamHeadToHead,
  StrokeplayBreakdown,
} from "@/lib/head-to-head";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HeadToHeadMatrixProps {
  teams: { team: string; seed: number; rank: number }[];
  /** Regional brand color — used as a subtle tint on the diagonal. */
  regionalColor?: string;
  gender?: Gender;
  /**
   * Visual density. "compact" is the small mobile-card layout used inside
   * `MobileRegionalGroup`; "default" is the desktop expanded panel.
   */
  variant?: "default" | "compact";
}

// ---------------------------------------------------------------------------
// Data lookup
// ---------------------------------------------------------------------------

const byGender = (h2hData as unknown as {
  byGender: Record<Gender, Record<string, TeamHeadToHead>>;
}).byGender;

interface CellRecord {
  meetings: number;
  wins: number;
  losses: number;
  ties: number;
  avgStrokeDiff: number;
}

/**
 * Look up Team A's strokeplay record vs Team B from A's perspective. Returns
 * null if the pair has no recorded strokeplay meetings.
 */
function lookupStrokeplay(
  gender: Gender,
  teamA: string,
  teamB: string
): CellRecord | null {
  const a = byGender[gender]?.[teamA];
  if (!a) return null;
  const opp = a.opponents[teamB];
  if (!opp) return null;
  const sp: StrokeplayBreakdown | undefined = opp.strokeplay;
  if (!sp || sp.meetings === 0) return null;
  return {
    meetings: sp.meetings,
    wins: sp.wins,
    losses: sp.losses,
    ties: sp.ties,
    avgStrokeDiff: sp.avgStrokeDiff,
  };
}

function formatRecord(r: { wins: number; losses: number; ties: number }): string {
  if (r.ties > 0) return `${r.wins}-${r.losses}-${r.ties}`;
  return `${r.wins}-${r.losses}`;
}

function formatAvg(diff: number): string {
  // Lower stroke total = better in golf, so a negative avg-diff means Team A
  // beat Team B by that many strokes per meeting — display unchanged so the
  // sign reads naturally ("-8.5" = A is 8.5 strokes better on average).
  const rounded = Math.round(diff * 10) / 10;
  if (rounded === 0) return "±0";
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

/**
 * Deep-link to the /head-to-head page with both teams pre-populated. The
 * client-side `HeadToHeadBrowser` reads `gender`, `a`, and `b` from the
 * query string on mount and hydrates its selectors from them — see
 * `src/components/head-to-head-browser.tsx`.
 */
function h2hPairHref(gender: Gender, teamA: string, teamB: string): string {
  const qs = new URLSearchParams({ gender, a: teamA, b: teamB });
  return `/head-to-head?${qs.toString()}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HeadToHeadMatrix({
  teams,
  regionalColor,
  gender = "men",
  variant = "default",
}: HeadToHeadMatrixProps) {
  // Order columns + rows by seed so the cross-reference reads top-down by
  // strength.
  const sorted = [...teams].sort((a, b) => a.seed - b.seed);
  const compact = variant === "compact";

  // Sizing tokens. The whole grid uses `width: 100%` with `table-fixed` so
  // every cell scales with the container — this is what keeps it on-screen
  // without horizontal scrolling on phones. Worst case is a 14-team men's
  // regional → 15 columns. On a 360px viewport (after the panel's px-4 padding
  // ≈ 328px usable) every cell gets ~22px, so type and badge sizes are tuned
  // to read at that density.
  const badgeSize = compact ? 16 : 20;
  const cellPad = compact ? "px-0 py-px" : "px-px py-0.5";
  const recordCls = compact
    ? "text-[9px] sm:text-[10px]"
    : "text-[9px] sm:text-[11px]";
  const avgCls = compact
    ? "text-[7px] sm:text-[8px]"
    : "text-[7px] sm:text-[9px]";

  // Detect whether any cell has data. If the regional has zero strokeplay
  // overlap (rare but possible early in the season), keep the placeholder so
  // we don't render an empty grid.
  let anyData = false;
  for (let i = 0; i < sorted.length && !anyData; i++) {
    for (let j = 0; j < sorted.length && !anyData; j++) {
      if (i === j) continue;
      if (lookupStrokeplay(gender, sorted[i].team, sorted[j].team)) {
        anyData = true;
      }
    }
  }

  return (
    <div className={compact ? "mt-1.5" : "mt-4"}>
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Head-to-Head
        </p>
        <p className="text-[9px] text-muted-foreground/70">
          stroke play &middot; row vs column
        </p>
      </div>

      {!anyData ? (
        <div className="rounded-md bg-secondary/30 px-3 py-3 text-center">
          <p className="text-[12px] text-muted-foreground">
            No strokeplay meetings yet between this regional&rsquo;s teams.
          </p>
        </div>
      ) : (
        <table className="w-full table-fixed border-collapse">
          {/* First column reserved for the row-header (regional-seed + badge);
              data columns share the remainder equally so worst-case 14-team
              men's regionals still fit a ~360px viewport. */}
          <colgroup>
            <col style={{ width: compact ? 30 : 40 }} />
            {sorted.map((t) => (
              <col key={t.team} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {/* Empty top-left corner */}
              <th className="p-0" aria-hidden="true" />
              {sorted.map((t) => (
                <th
                  key={t.team}
                  className="p-0.5 align-bottom"
                  title={`${t.team} (rank #${t.rank})`}
                >
                  <Link
                    href={teamHref(t.team, gender)}
                    className="inline-flex flex-col items-center gap-0.5"
                  >
                    <TeamMonogram team={t.team} size={badgeSize} />
                    {/* Sub-label: column team's national rank, e.g. "#5". */}
                    <span className="font-mono tabular-nums text-[8px] text-muted-foreground/80 leading-none">
                      #{t.rank}
                    </span>
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((rowTeam, rowIdx) => (
              <tr key={rowTeam.team}>
                {/* Row header — regional seed on the left of the badge.
                    Regional seed is 1..N within this regional and matches
                    the sorted index because `sorted` is ordered by S-curve
                    seed already. */}
                <th
                  className="p-0.5"
                  title={`${rowTeam.team} (regional seed ${rowIdx + 1})`}
                >
                  <Link
                    href={teamHref(rowTeam.team, gender)}
                    className="inline-flex items-center justify-end gap-0.5"
                  >
                    <span className="font-mono tabular-nums text-[8px] text-muted-foreground/80 leading-none">
                      {rowIdx + 1}
                    </span>
                    <TeamMonogram team={rowTeam.team} size={badgeSize} />
                  </Link>
                </th>
                {sorted.map((colTeam) => {
                  // Diagonal — same team on both axes.
                  if (colTeam.team === rowTeam.team) {
                    return (
                      <td
                        key={colTeam.team}
                        className={cn(
                          cellPad,
                          "text-center text-muted-foreground/40 align-middle"
                        )}
                        style={
                          regionalColor
                            ? { backgroundColor: `${regionalColor}14` }
                            : undefined
                        }
                      >
                        <span className={recordCls}>--</span>
                      </td>
                    );
                  }

                  // Cell shows ROW team's record vs COLUMN team (row vs
                  // column). Reading: "this row's team has gone {W-L} against
                  // each column-team this season." Greens running across a
                  // row mean the row team is dominant; reds running down a
                  // column mean the column team is dominant.
                  const teamA = rowTeam.team;
                  const teamB = colTeam.team;
                  const rec = lookupStrokeplay(gender, teamA, teamB);

                  if (!rec) {
                    return (
                      <td
                        key={colTeam.team}
                        className={cn(
                          cellPad,
                          "text-center align-middle text-muted-foreground/30"
                        )}
                      >
                        <span className={recordCls}>—</span>
                      </td>
                    );
                  }

                  const better = rec.wins > rec.losses;
                  const worse = rec.wins < rec.losses;

                  return (
                    <td
                      key={colTeam.team}
                      className={cn(
                        "p-0 text-center align-middle border border-border/30 leading-tight",
                        better && "bg-primary/15",
                        worse && "bg-destructive/15"
                      )}
                    >
                      <Link
                        href={h2hPairHref(gender, teamA, teamB)}
                        title={`Open head-to-head: ${teamA} vs ${teamB} — ${formatRecord(rec)} (${formatAvg(rec.avgStrokeDiff)} avg over ${rec.meetings} meeting${rec.meetings === 1 ? "" : "s"})`}
                        aria-label={`${teamA} vs ${teamB} head-to-head, ${formatRecord(rec)}`}
                        className={cn(
                          "block w-full h-full transition-colors",
                          cellPad,
                          better && "hover:bg-primary/25",
                          worse && "hover:bg-destructive/25",
                          !better && !worse && "hover:bg-secondary/40"
                        )}
                      >
                        <div
                          className={cn(
                            "font-mono tabular-nums font-semibold truncate",
                            recordCls,
                            better && "text-primary",
                            worse && "text-destructive",
                            !better && !worse && "text-foreground"
                          )}
                        >
                          {formatRecord(rec)}
                        </div>
                        <div
                          className={cn(
                            "font-mono tabular-nums text-muted-foreground truncate",
                            avgCls
                          )}
                        >
                          {formatAvg(rec.avgStrokeDiff)}
                          {/* Hide " avg" suffix below `sm` (≤640px) so the
                              cell content stays inside its 22-24px column on
                              phones. */}
                          <span className="hidden sm:inline text-muted-foreground/60"> avg</span>
                        </div>
                      </Link>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact variant — re-exported as a thin wrapper so the mobile call site in
// `scurve-table.tsx` keeps working without any prop juggling. Same matrix,
// just denser sizing.
// ---------------------------------------------------------------------------

export function HeadToHeadCompact(
  props: Omit<HeadToHeadMatrixProps, "variant">
) {
  return <HeadToHeadMatrix {...props} variant="compact" />;
}
