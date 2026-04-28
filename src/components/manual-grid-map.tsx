"use client";

/**
 * ManualGridMap — sibling to USMap but specialised for the user's
 * Manual Grid interactions.
 *
 * Two display modes, mutually exclusive:
 *
 *  1. **Head-to-Head mode** (default — `selectedRegionalId === null`):
 *     - Team A's dot rendered in TEAM_A_COLOR; Team B's dot in TEAM_B_COLOR.
 *     - For each selected team, a fan of lines is drawn to every regional
 *       site. Each line is colored by the destination regional and labelled
 *       with the travel distance (great-circle miles).
 *     - Distance summary table shows one row per selected team, one column
 *       per regional site (in the manual grid's header order).
 *
 *  2. **Regional-selected mode** (`selectedRegionalId` set):
 *     - The selected regional is highlighted; clicking again clears it.
 *     - Team A / Team B are cleared by the parent before this mode is
 *       entered, so no per-team fans are drawn.
 *     - Lines fan from the regional's site to every team currently placed
 *       in that regional on the manual grid above.
 *     - Distance summary table becomes a single column (Team / Distance)
 *       listing those teams.
 *
 * The map does not own any state — both modes are controlled by props.
 * Regional dots are clickable; team dots are not.
 */

import { useMemo } from "react";
import {
  SVG_WIDTH,
  SVG_HEIGHT,
  pathGen,
  statesGeo,
  stateBorderPath,
  nationBorderPath,
  projectPoint,
} from "@/lib/us-projection";
import { haversineDistance } from "@/lib/geo";
import { TEAM_A_COLOR, TEAM_B_COLOR } from "@/lib/manual-grid-colors";
import type { TeamData } from "@/data/rankings-men";
import type { Regional } from "@/data/regionals-men-2026";
import type { ScurveAssignment } from "@/lib/scurve";

interface ManualGridMapProps {
  teams: TeamData[];
  regionals: Regional[];
  /**
   * Regional IDs in the order they appear as columns in the manual grid
   * above. Drives the distance-grid column order. Falls back to the
   * source-regional order if empty.
   */
  regionalIds?: number[];
  /**
   * Current grid assignments (team → regional). Used to render the
   * regional-selected mode and to know which team is in which regional.
   */
  assignments?: ScurveAssignment[];
  teamA: string | null;
  teamB: string | null;
  /**
   * Regional whose teams are highlighted on the map. When set, A/B fans
   * are suppressed; the regional fans lines to its placed teams.
   */
  selectedRegionalId?: number | null;
  /** Click handler on regional dots. Toggle behavior is the parent's job. */
  onSelectRegional?: (id: number) => void;
}

interface ProjectedTeam extends TeamData {
  x: number;
  y: number;
}

interface ProjectedRegional extends Regional {
  x: number;
  y: number;
}

interface FanLine {
  regional: ProjectedRegional;
  fromX: number;
  fromY: number;
  midX: number;
  midY: number;
  dist: number;
}

interface RegionalFanLine {
  team: ProjectedTeam;
  fromX: number;
  fromY: number;
  midX: number;
  midY: number;
  dist: number;
}

export default function ManualGridMap({
  teams,
  regionals,
  regionalIds,
  assignments,
  teamA,
  teamB,
  selectedRegionalId = null,
  onSelectRegional,
}: ManualGridMapProps) {
  const teamLookup = useMemo(() => {
    const m = new Map<string, TeamData>();
    for (const t of teams) m.set(t.team, t);
    return m;
  }, [teams]);

  const teamPositions = useMemo<ProjectedTeam[]>(() => {
    return teams
      .map((t) => {
        const p = projectPoint(t.lat, t.lng);
        return p ? { ...t, x: p.x, y: p.y } : null;
      })
      .filter((v): v is ProjectedTeam => v !== null);
  }, [teams]);

  const regionalPositions = useMemo<ProjectedRegional[]>(() => {
    return regionals
      .map((r) => {
        const p = projectPoint(r.lat, r.lng);
        return p ? { ...r, x: p.x, y: p.y } : null;
      })
      .filter((v): v is ProjectedRegional => v !== null);
  }, [regionals]);

  // Re-order regionalPositions by `regionalIds` for the distance-grid
  // header. Falls back to source order if no override was passed (or the
  // override is stale relative to the regionals array).
  const orderedRegionals = useMemo<ProjectedRegional[]>(() => {
    if (!regionalIds || regionalIds.length === 0) return regionalPositions;
    const byId = new Map<number, ProjectedRegional>();
    for (const r of regionalPositions) byId.set(r.id, r);
    const out: ProjectedRegional[] = [];
    for (const id of regionalIds) {
      const hit = byId.get(id);
      if (hit) out.push(hit);
    }
    // Append any regionals missing from `regionalIds` so we never lose data
    // if the parent's order is stale.
    for (const r of regionalPositions) {
      if (!regionalIds.includes(r.id)) out.push(r);
    }
    return out;
  }, [regionalPositions, regionalIds]);

  // Build a fan of lines from the given team to every regional site.
  // Used in Head-to-Head mode.
  const buildFan = (teamName: string | null): FanLine[] => {
    if (!teamName) return [];
    const team = teamLookup.get(teamName);
    if (!team) return [];
    const teamPos = projectPoint(team.lat, team.lng);
    if (!teamPos) return [];
    return orderedRegionals.map((r) => {
      const dist = Math.round(
        haversineDistance(team.lat, team.lng, r.lat, r.lng)
      );
      // Quadratic Bezier control point above the midpoint, gives the line
      // a gentle arc (matches USMap's flight-path aesthetic).
      const midX = (teamPos.x + r.x) / 2;
      const midY = (teamPos.y + r.y) / 2 - 25;
      return {
        regional: r,
        fromX: teamPos.x,
        fromY: teamPos.y,
        midX,
        midY,
        dist,
      };
    });
  };

  const linesA = useMemo(
    () => (selectedRegionalId === null ? buildFan(teamA) : []),
    [teamA, selectedRegionalId, teamLookup, orderedRegionals] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const linesB = useMemo(
    () => (selectedRegionalId === null ? buildFan(teamB) : []),
    [teamB, selectedRegionalId, teamLookup, orderedRegionals] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Regional-selected fan: lines from the selected regional to every team
  // currently placed in that regional on the manual grid above.
  const selectedRegional = useMemo<ProjectedRegional | null>(() => {
    if (selectedRegionalId === null) return null;
    return regionalPositions.find((r) => r.id === selectedRegionalId) ?? null;
  }, [selectedRegionalId, regionalPositions]);

  const regionalTeams = useMemo<ProjectedTeam[]>(() => {
    if (selectedRegionalId === null || !assignments) return [];
    const teamPosByName = new Map<string, ProjectedTeam>();
    for (const t of teamPositions) teamPosByName.set(t.team, t);
    const out: ProjectedTeam[] = [];
    for (const a of assignments) {
      if (a.regionalId !== selectedRegionalId) continue;
      const t = teamPosByName.get(a.team);
      if (t) out.push(t);
    }
    return out;
  }, [selectedRegionalId, assignments, teamPositions]);

  const regionalLines = useMemo<RegionalFanLine[]>(() => {
    if (!selectedRegional) return [];
    return regionalTeams.map((team) => {
      const dist = Math.round(
        haversineDistance(team.lat, team.lng, selectedRegional.lat, selectedRegional.lng)
      );
      const midX = (team.x + selectedRegional.x) / 2;
      const midY = (team.y + selectedRegional.y) / 2 - 25;
      return {
        team,
        fromX: selectedRegional.x,
        fromY: selectedRegional.y,
        midX,
        midY,
        dist,
      };
    });
  }, [selectedRegional, regionalTeams]);

  const noSelection = !teamA && !teamB && selectedRegionalId === null;
  const showA = selectedRegionalId === null && !!teamA;
  const showB = selectedRegionalId === null && !!teamB;

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <svg
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          className="w-full h-auto"
          style={{ maxHeight: "520px" }}
          role="img"
          aria-label="Map showing travel distance from selected Manual Grid teams or regional"
        >
          <title>Manual Grid Travel Map</title>
          <desc>
            Map of NCAA regional sites with travel lines drawn either from
            the selected Head-to-Head teams to every regional, or from a
            selected regional site to every team placed in that regional.
          </desc>

          {/* States */}
          {statesGeo.features.map((feat) => {
            const d = pathGen(feat);
            if (!d) return null;
            const id = feat.id ?? feat.properties?.name ?? d.slice(0, 20);
            return (
              <path
                key={`state-${id}`}
                d={d}
                fill="hsl(var(--secondary))"
                stroke="none"
              />
            );
          })}

          {stateBorderPath && (
            <path
              d={stateBorderPath}
              fill="none"
              stroke="hsl(var(--foreground))"
              strokeWidth="0.75"
              strokeLinejoin="round"
              opacity="0.2"
            />
          )}
          {nationBorderPath && (
            <path
              d={nationBorderPath}
              fill="none"
              stroke="hsl(var(--foreground))"
              strokeWidth="1"
              strokeLinejoin="round"
              opacity="0.4"
            />
          )}

          {/* Lines for Team A — solid */}
          {showA &&
            linesA.map((line) => {
              const d = `M ${line.fromX} ${line.fromY} Q ${line.midX} ${line.midY} ${line.regional.x} ${line.regional.y}`;
              return (
                <g key={`lineA-${line.regional.id}`} className="pointer-events-none">
                  <path
                    d={d}
                    fill="none"
                    stroke={line.regional.color}
                    strokeWidth={1.6}
                    opacity={0.85}
                  />
                  <text
                    x={line.midX}
                    y={line.midY - 2}
                    textAnchor="middle"
                    className="text-[9px] font-mono font-semibold"
                    style={{
                      fill: line.regional.color,
                      paintOrder: "stroke",
                      stroke: "hsl(var(--background))",
                      strokeWidth: 3,
                      strokeLinejoin: "round",
                    }}
                  >
                    {line.dist.toLocaleString()} mi
                  </text>
                </g>
              );
            })}

          {/* Lines for Team B — dashed, label offset slightly so it doesn't
              collide with A's label when both are selected. */}
          {showB &&
            linesB.map((line) => {
              const d = `M ${line.fromX} ${line.fromY} Q ${line.midX} ${line.midY} ${line.regional.x} ${line.regional.y}`;
              return (
                <g key={`lineB-${line.regional.id}`} className="pointer-events-none">
                  <path
                    d={d}
                    fill="none"
                    stroke={line.regional.color}
                    strokeWidth={1.6}
                    opacity={0.85}
                    strokeDasharray="5,3"
                  />
                  <text
                    x={line.midX}
                    y={line.midY + 11}
                    textAnchor="middle"
                    className="text-[9px] font-mono font-semibold"
                    style={{
                      fill: line.regional.color,
                      paintOrder: "stroke",
                      stroke: "hsl(var(--background))",
                      strokeWidth: 3,
                      strokeLinejoin: "round",
                    }}
                  >
                    {line.dist.toLocaleString()} mi
                  </text>
                </g>
              );
            })}

          {/* Regional-selected mode: lines from the regional to its teams */}
          {selectedRegional &&
            regionalLines.map((line) => {
              const d = `M ${line.fromX} ${line.fromY} Q ${line.midX} ${line.midY} ${line.team.x} ${line.team.y}`;
              return (
                <g key={`lineR-${line.team.team}`} className="pointer-events-none">
                  <path
                    d={d}
                    fill="none"
                    stroke={selectedRegional.color}
                    strokeWidth={1.6}
                    opacity={0.85}
                  />
                  <text
                    x={line.midX}
                    y={line.midY - 2}
                    textAnchor="middle"
                    className="text-[9px] font-mono font-semibold"
                    style={{
                      fill: selectedRegional.color,
                      paintOrder: "stroke",
                      stroke: "hsl(var(--background))",
                      strokeWidth: 3,
                      strokeLinejoin: "round",
                    }}
                  >
                    {line.dist.toLocaleString()} mi
                  </text>
                </g>
              );
            })}

          {/* Team dots — faint by default, vivid if selected as A/B, or
              vivid+labelled if they're in the selected regional. */}
          {teamPositions.map((team) => {
            const isA = showA && team.team === teamA;
            const isB = showB && team.team === teamB;
            const isInSelectedRegional =
              selectedRegional !== null &&
              regionalTeams.some((t) => t.team === team.team);
            const fill = isA
              ? TEAM_A_COLOR
              : isB
                ? TEAM_B_COLOR
                : isInSelectedRegional
                  ? selectedRegional!.color
                  : "hsl(var(--muted-foreground))";
            const highlighted = isA || isB || isInSelectedRegional;
            const radius = highlighted ? 6 : 1.6;
            const opacity = highlighted ? 1 : 0.35;
            return (
              <g key={`team-${team.team}`} className="pointer-events-none">
                <circle
                  cx={team.x}
                  cy={team.y}
                  r={radius}
                  fill={fill}
                  stroke={highlighted ? "hsl(var(--background))" : undefined}
                  strokeWidth={highlighted ? 1.5 : 0}
                  opacity={opacity}
                />
                {highlighted && (
                  <text
                    x={team.x}
                    y={team.y - 10}
                    textAnchor="middle"
                    className="text-[10px] font-semibold fill-foreground"
                    style={{
                      paintOrder: "stroke",
                      stroke: "hsl(var(--background))",
                      strokeWidth: 3,
                      strokeLinejoin: "round",
                    }}
                  >
                    {team.team}
                  </text>
                )}
              </g>
            );
          })}

          {/* Regional site markers — clickable. The selected one gets a
              wider stroke; tapping it again clears the selection (handled
              by the parent). */}
          {regionalPositions.map((r) => {
            const isSelected = r.id === selectedRegionalId;
            return (
              <g
                key={`regional-${r.id}`}
                onClick={() => onSelectRegional?.(r.id)}
                style={{ cursor: onSelectRegional ? "pointer" : undefined }}
                role={onSelectRegional ? "button" : undefined}
                aria-label={
                  onSelectRegional
                    ? `${r.name}${isSelected ? " — selected, tap to clear" : ""}`
                    : undefined
                }
              >
                {/* Wider invisible hit target so taps are easy on mobile */}
                {onSelectRegional && (
                  <circle
                    cx={r.x}
                    cy={r.y}
                    r={16}
                    fill="transparent"
                  />
                )}
                <circle
                  cx={r.x}
                  cy={r.y}
                  r={isSelected ? 11 : 9}
                  fill={r.color}
                  stroke="hsl(var(--background))"
                  strokeWidth={isSelected ? 3 : 2}
                />
                <text
                  x={r.x}
                  y={r.y + 23}
                  textAnchor="middle"
                  className="text-[10px] font-semibold fill-foreground pointer-events-none"
                  style={{
                    paintOrder: "stroke",
                    stroke: "hsl(var(--background))",
                    strokeWidth: 3,
                    strokeLinejoin: "round",
                  }}
                >
                  {r.name.replace(/ Regional$/, "")}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Distance summary table — Head-to-Head mode: one row per selected
          team, one col per regional site (in manual-grid header order).
          Regional-selected mode: a single (Team / Distance) column. */}
      {selectedRegional ? (
        <div className="rounded border border-border bg-card overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr>
                <th
                  className="px-2 py-1 text-left text-[10px] uppercase tracking-wider whitespace-nowrap font-semibold"
                  style={{
                    color: selectedRegional.color,
                    borderBottom: `2px solid ${selectedRegional.color}`,
                  }}
                  colSpan={2}
                >
                  {selectedRegional.name.replace(/ Regional$/, "")} Regional
                </th>
              </tr>
              <tr>
                <th className="text-left px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/80 font-medium border-b border-border whitespace-nowrap">
                  Team
                </th>
                <th className="text-right px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/80 font-medium border-b border-border whitespace-nowrap">
                  Distance
                </th>
              </tr>
            </thead>
            <tbody>
              {regionalLines.length === 0 ? (
                <tr>
                  <td
                    colSpan={2}
                    className="px-2 py-2 text-center text-text-tertiary italic"
                  >
                    No teams placed in this regional yet.
                  </td>
                </tr>
              ) : (
                regionalLines.map((line) => (
                  <tr
                    key={line.team.team}
                    className="border-t border-border/40"
                  >
                    <td
                      className="px-2 py-1.5 font-medium whitespace-nowrap"
                      style={{ color: selectedRegional.color }}
                    >
                      {line.team.team}
                    </td>
                    <td
                      className="px-2 py-1.5 text-right font-mono tabular-nums"
                      style={{ color: selectedRegional.color }}
                    >
                      {line.dist.toLocaleString()} mi
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        (showA || showB) && (
          <div className="rounded border border-border bg-card overflow-x-auto">
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr>
                  <th className="text-left px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/80 font-medium border-b border-border whitespace-nowrap">
                    Team
                  </th>
                  {orderedRegionals.map((r) => (
                    <th
                      key={r.id}
                      className="px-2 py-1 text-center text-[10px] uppercase tracking-wider whitespace-nowrap font-semibold"
                      style={{
                        color: r.color,
                        borderBottom: `2px solid ${r.color}`,
                      }}
                    >
                      {r.name.replace(/ Regional$/, "")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {showA && (
                  <tr>
                    <td
                      className="px-2 py-1.5 font-medium whitespace-nowrap"
                      style={{ color: TEAM_A_COLOR }}
                    >
                      {teamA}
                    </td>
                    {linesA.map((line) => (
                      <td
                        key={line.regional.id}
                        className="px-2 py-1.5 text-center font-mono tabular-nums"
                        style={{ color: line.regional.color }}
                      >
                        {line.dist.toLocaleString()} mi
                      </td>
                    ))}
                  </tr>
                )}
                {showB && (
                  <tr className={showA ? "border-t border-border/40" : ""}>
                    <td
                      className="px-2 py-1.5 font-medium whitespace-nowrap"
                      style={{ color: TEAM_B_COLOR }}
                    >
                      {teamB}
                    </td>
                    {linesB.map((line) => (
                      <td
                        key={line.regional.id}
                        className="px-2 py-1.5 text-center font-mono tabular-nums"
                        style={{ color: line.regional.color }}
                      >
                        {line.dist.toLocaleString()} mi
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 text-[11px] text-muted-foreground flex-wrap">
        {!selectedRegional && (
          <>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-4 rounded-sm"
                style={{ backgroundColor: TEAM_A_COLOR }}
                aria-hidden="true"
              />
              Team A — solid lines
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-4 rounded-sm"
                style={{
                  backgroundImage: `repeating-linear-gradient(90deg, ${TEAM_B_COLOR} 0 5px, transparent 5px 8px)`,
                }}
                aria-hidden="true"
              />
              Team B — dashed lines
            </span>
          </>
        )}
        {selectedRegional && (
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: selectedRegional.color }}
              aria-hidden="true"
            />
            Showing all teams placed in {selectedRegional.name.replace(/ Regional$/, "")} — tap the regional again to clear.
          </span>
        )}
        {noSelection && (
          <span className="text-text-tertiary">
            Long-press a team in the grid to highlight it here, or tap a regional site on the map.
          </span>
        )}
      </div>
    </div>
  );
}
