"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { ScurveAssignment } from "@/lib/scurve";
import type { Regional } from "@/data/regionals-men-2026";
import { Plane } from "lucide-react";
import { geoAlbersUsa, geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { FeatureCollection } from "geojson";
import usTopology from "@/data/us-states-10m.json";

// ---------------------------------------------------------------------------
// Albers USA projection (standard for US maps - handles AK/HI insets)
// ---------------------------------------------------------------------------
const SVG_WIDTH = 975;
const SVG_HEIGHT = 610;
const projection = geoAlbersUsa()
  .scale(1300)
  .translate([SVG_WIDTH / 2, SVG_HEIGHT / 2]);
const pathGen = geoPath(projection);

// ---------------------------------------------------------------------------
// Extract real state boundaries from TopoJSON
// ---------------------------------------------------------------------------
const topo = usTopology as unknown as Topology;
const statesGeo = feature(
  topo,
  topo.objects.states as GeometryCollection
) as FeatureCollection;
const stateBorderPath = pathGen(
  mesh(topo, topo.objects.states as GeometryCollection, (a, b) => a !== b)
);
const nationBorderPath = pathGen(
  mesh(topo, topo.objects.nation as GeometryCollection)
);

// ---------------------------------------------------------------------------
// Project lat/lng to SVG coordinates using the Albers USA projection
// ---------------------------------------------------------------------------
function projectPoint(
  lat: number,
  lng: number
): { x: number; y: number } | null {
  const p = projection([lng, lat]);
  return p ? { x: p[0], y: p[1] } : null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
interface USMapProps {
  assignments: ScurveAssignment[];
  regionals: Regional[];
}

export default function USMap({ assignments, regionals }: USMapProps) {
  const [activeRegional, setActiveRegional] = useState<number | null>(null);
  const [hoveredTeam, setHoveredTeam] = useState<string | null>(null);

  // Group assignments by regional
  const byRegional = useMemo(() => {
    const map = new Map<number, ScurveAssignment[]>();
    for (const r of regionals) {
      map.set(r.id, []);
    }
    for (const a of assignments) {
      map.get(a.regionalId)?.push(a);
    }
    return map;
  }, [assignments, regionals]);

  // Project regional site positions
  const regionalPositions = useMemo(
    () =>
      regionals
        .map((r) => {
          const pos = projectPoint(r.lat, r.lng);
          return pos ? { ...r, x: pos.x, y: pos.y } : null;
        })
        .filter(Boolean) as (Regional & { x: number; y: number })[],
    [regionals]
  );

  // Project team positions
  const teamPositions = useMemo(
    () =>
      assignments
        .map((a) => {
          const pos = projectPoint(a.lat, a.lng);
          return pos ? { ...a, x: pos.x, y: pos.y } : null;
        })
        .filter(Boolean) as (ScurveAssignment & { x: number; y: number })[],
    [assignments]
  );

  // Active regional data for info overlay
  const activeRegionalData =
    activeRegional !== null
      ? regionals.find((r) => r.id === activeRegional)
      : null;
  const activeTeams =
    activeRegional !== null ? byRegional.get(activeRegional) ?? [] : [];
  const activeTotalDist = activeTeams.reduce(
    (sum, t) => sum + t.distanceMiles,
    0
  );

  return (
    <div className="space-y-4">
      {/* Map */}
      <div className="relative rounded-lg border border-border bg-card overflow-hidden">
        <svg
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          className="w-full h-auto"
          style={{ maxHeight: "520px" }}
        >
          {/* State fills */}
          {statesGeo.features.map((feat, i) => {
            const d = pathGen(feat);
            if (!d) return null;
            return (
              <path
                key={`state-${i}`}
                d={d}
                fill="hsl(var(--secondary))"
                stroke="none"
              />
            );
          })}

          {/* State borders */}
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

          {/* Nation outline (thicker outer border) */}
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

          {/* Travel lines (only when a regional is selected) */}
          {activeRegional !== null &&
            activeRegionalData &&
            (() => {
              const rPos = projectPoint(
                activeRegionalData.lat,
                activeRegionalData.lng
              );
              if (!rPos) return null;
              return teamPositions
                .filter((t) => t.regionalId === activeRegional)
                .map((team) => {
                  const midX = (team.x + rPos.x) / 2;
                  const midY = (team.y + rPos.y) / 2 - 30;
                  const isHovered = hoveredTeam === team.team;
                  return (
                    <path
                      key={`line-${team.team}`}
                      d={`M ${team.x} ${team.y} Q ${midX} ${midY} ${rPos.x} ${rPos.y}`}
                      fill="none"
                      stroke={activeRegionalData.color}
                      strokeWidth={isHovered ? 2.5 : 1.5}
                      strokeDasharray={isHovered ? "none" : "4,4"}
                      opacity={isHovered ? 0.9 : 0.4}
                      className="transition-all duration-200"
                    />
                  );
                });
            })()}

          {/* Team dots */}
          {teamPositions.map((team) => {
            const regional = regionals.find((r) => r.id === team.regionalId);
            const color = regional?.color ?? "#888";
            const isActive =
              activeRegional === null || team.regionalId === activeRegional;
            const isHovered = hoveredTeam === team.team;

            return (
              <g key={`team-${team.team}`}>
                <circle
                  cx={team.x}
                  cy={team.y}
                  r={isHovered ? 6 : 4}
                  fill={color}
                  opacity={isActive ? (isHovered ? 1 : 0.7) : 0.15}
                  className="transition-all duration-200 cursor-pointer"
                  onMouseEnter={() => setHoveredTeam(team.team)}
                  onMouseLeave={() => setHoveredTeam(null)}
                />
                {isHovered && (
                  <text
                    x={team.x}
                    y={team.y - 10}
                    textAnchor="middle"
                    className="text-[10px] font-medium fill-foreground pointer-events-none"
                  >
                    {team.team}
                  </text>
                )}
              </g>
            );
          })}

          {/* Regional site markers */}
          {regionalPositions.map((r) => {
            const isActive =
              activeRegional === null || activeRegional === r.id;
            const teams = byRegional.get(r.id) ?? [];

            return (
              <g
                key={`regional-${r.id}`}
                className="cursor-pointer"
                onClick={() =>
                  setActiveRegional(activeRegional === r.id ? null : r.id)
                }
              >
                {/* Outer glow when active */}
                {activeRegional === r.id && (
                  <circle
                    cx={r.x}
                    cy={r.y}
                    r={20}
                    fill={r.color}
                    opacity="0.15"
                  />
                )}
                {/* Pulse ring when active */}
                {activeRegional === r.id && (
                  <circle
                    cx={r.x}
                    cy={r.y}
                    r={18}
                    fill="none"
                    stroke={r.color}
                    strokeWidth="1.5"
                    opacity="0.3"
                    className="animate-pulse"
                  />
                )}
                {/* Main marker */}
                <circle
                  cx={r.x}
                  cy={r.y}
                  r={activeRegional === r.id ? 12 : 10}
                  fill={r.color}
                  stroke="hsl(var(--background))"
                  strokeWidth="2.5"
                  opacity={isActive ? 1 : 0.3}
                  className="transition-all duration-200"
                />
                {/* Regional label */}
                <text
                  x={r.x}
                  y={r.y + (activeRegional === r.id ? 25 : 23)}
                  textAnchor="middle"
                  className={cn(
                    "text-[10px] font-semibold pointer-events-none",
                    isActive ? "fill-foreground" : "fill-muted-foreground"
                  )}
                >
                  {r.name.replace(/ Regional$/, "")}
                </text>
                {/* Team count inside marker */}
                <text
                  x={r.x}
                  y={r.y + 4}
                  textAnchor="middle"
                  className="text-[9px] font-bold fill-background pointer-events-none"
                >
                  {teams.length}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Info overlay when a regional is selected */}
        {activeRegionalData && (
          <div
            className="absolute top-3 right-3 rounded-lg bg-background/95 border border-border p-3 max-w-[220px] backdrop-blur-sm"
            style={{ borderLeft: `3px solid ${activeRegionalData.color}` }}
          >
            <p className="font-semibold text-[13px] text-foreground">
              {activeRegionalData.name}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {activeRegionalData.host} &middot; {activeRegionalData.city}
            </p>
            <div className="mt-2 space-y-1">
              <p className="text-[11px] text-muted-foreground">
                {activeTeams.length} teams
              </p>
              <p className="text-[11px] text-muted-foreground">
                <Plane className="inline h-3 w-3 mr-0.5" />
                {activeTotalDist.toLocaleString()} mi total travel
              </p>
            </div>
            <div className="mt-2 space-y-0.5 max-h-[200px] overflow-y-auto">
              {activeTeams
                .sort((a, b) => a.seed - b.seed)
                .map((t) => (
                  <p
                    key={t.team}
                    className={cn(
                      "text-[10px]",
                      hoveredTeam === t.team
                        ? "text-foreground font-medium"
                        : "text-muted-foreground"
                    )}
                    onMouseEnter={() => setHoveredTeam(t.team)}
                    onMouseLeave={() => setHoveredTeam(null)}
                  >
                    #{t.seed} {t.team}{" "}
                    <span className="opacity-60">
                      ({t.distanceMiles.toLocaleString()} mi)
                    </span>
                  </p>
                ))}
            </div>
            <button
              onClick={() => setActiveRegional(null)}
              className="mt-2 text-[10px] text-primary hover:underline transition-colors"
            >
              Clear selection
            </button>
          </div>
        )}
      </div>

      {/* Regional travel summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        {regionals.map((r) => {
          const teams = byRegional.get(r.id) ?? [];
          const totalDist = teams.reduce(
            (sum, t) => sum + t.distanceMiles,
            0
          );
          const avgDist =
            teams.length > 0 ? Math.round(totalDist / teams.length) : 0;
          const maxTravel = teams.length > 0
            ? teams.reduce(
                (max, t) => (t.distanceMiles > max.distanceMiles ? t : max),
                teams[0]
              )
            : null;

          return (
            <button
              key={r.id}
              className={cn(
                "rounded-lg px-3 py-3 bg-card text-left transition-all",
                activeRegional === r.id
                  ? "ring-1 ring-offset-1 ring-offset-background"
                  : "hover:bg-card/80"
              )}
              style={{
                borderLeft: `3px solid ${r.color}`,
                ...(activeRegional === r.id ? { ringColor: r.color } : {}),
              }}
              onClick={() =>
                setActiveRegional(activeRegional === r.id ? null : r.id)
              }
            >
              <p className="text-[12px] font-medium text-foreground">
                {r.name.replace(/ Regional$/, "")}
              </p>
              <div className="mt-1.5 space-y-0.5">
                <p className="text-[11px] text-muted-foreground">
                  {avgDist.toLocaleString()} mi avg
                </p>
                {maxTravel && (
                  <p className="text-[10px] text-muted-foreground/70 truncate">
                    Farthest: {maxTravel.team}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
