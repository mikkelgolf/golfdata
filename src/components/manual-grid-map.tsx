"use client";

/**
 * ManualGridMap — sibling to USMap but specialised for the user's
 * Head-to-Head selection.
 *
 *  - All teams render as faint dots (everyone is on the map but de-emphasised).
 *  - Team A's dot is rendered in TEAM_A_COLOR; Team B's dot in TEAM_B_COLOR.
 *  - For each selected team, a fan of lines is drawn to every regional site.
 *    Each line is colored by the destination regional and labelled with the
 *    travel distance (great-circle miles).
 *  - Regional site markers render in their own regional color (same as USMap).
 *
 * The map is read-only — no clicks, no hovers, no state. It updates purely
 * from the teamA / teamB props.
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

interface ManualGridMapProps {
  teams: TeamData[];
  regionals: Regional[];
  teamA: string | null;
  teamB: string | null;
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

export default function ManualGridMap({
  teams,
  regionals,
  teamA,
  teamB,
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

  const buildFan = (teamName: string | null): FanLine[] => {
    if (!teamName) return [];
    const team = teamLookup.get(teamName);
    if (!team) return [];
    const teamPos = projectPoint(team.lat, team.lng);
    if (!teamPos) return [];
    return regionalPositions.map((r) => {
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

  const linesA = useMemo(() => buildFan(teamA), [teamA, teamLookup, regionalPositions]); // eslint-disable-line react-hooks/exhaustive-deps
  const linesB = useMemo(() => buildFan(teamB), [teamB, teamLookup, regionalPositions]); // eslint-disable-line react-hooks/exhaustive-deps

  const noSelection = !teamA && !teamB;

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <svg
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          className="w-full h-auto"
          style={{ maxHeight: "520px" }}
          role="img"
          aria-label="Map showing travel distance from selected Head-to-Head teams to each regional site"
        >
          <title>Manual Grid Travel Map</title>
          <desc>
            Map of NCAA regional sites with travel lines drawn from the
            selected Head-to-Head teams to every regional.
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
          {linesA.map((line) => {
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
                  className="text-[9px] font-mono fill-foreground"
                  style={{
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
          {linesB.map((line) => {
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
                  className="text-[9px] font-mono fill-foreground"
                  style={{
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

          {/* Team dots — faint by default, vivid if selected as A/B */}
          {teamPositions.map((team) => {
            const isA = team.team === teamA;
            const isB = team.team === teamB;
            const fill = isA
              ? TEAM_A_COLOR
              : isB
                ? TEAM_B_COLOR
                : "hsl(var(--muted-foreground))";
            const radius = isA || isB ? 6 : 1.6;
            const opacity = isA || isB ? 1 : 0.35;
            return (
              <g key={`team-${team.team}`} className="pointer-events-none">
                <circle
                  cx={team.x}
                  cy={team.y}
                  r={radius}
                  fill={fill}
                  stroke={isA || isB ? "hsl(var(--background))" : undefined}
                  strokeWidth={isA || isB ? 1.5 : 0}
                  opacity={opacity}
                />
                {(isA || isB) && (
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

          {/* Regional site markers */}
          {regionalPositions.map((r) => (
            <g key={`regional-${r.id}`} className="pointer-events-none">
              <circle
                cx={r.x}
                cy={r.y}
                r={9}
                fill={r.color}
                stroke="hsl(var(--background))"
                strokeWidth={2}
              />
              <text
                x={r.x}
                y={r.y + 23}
                textAnchor="middle"
                className="text-[10px] font-semibold fill-foreground"
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
          ))}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[11px] text-muted-foreground flex-wrap">
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
        {noSelection && (
          <span className="text-text-tertiary">
            Long-press a team in the grid to highlight it here.
          </span>
        )}
      </div>
    </div>
  );
}
