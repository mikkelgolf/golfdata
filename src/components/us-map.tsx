"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { ScurveAssignment } from "@/lib/scurve";
import type { Regional } from "@/data/regionals-men-2026";
import { Plane } from "lucide-react";

// ---------------------------------------------------------------------------
// US Map SVG coordinates
// ---------------------------------------------------------------------------

// Convert lat/lng to SVG x/y within continental US bounds
// Bounds: lat 24.5-49.5, lng -125 to -66.5
const US_BOUNDS = {
  minLat: 24.5,
  maxLat: 49.5,
  minLng: -125,
  maxLng: -66.5,
};

const SVG_WIDTH = 960;
const SVG_HEIGHT = 600;
const PADDING = 40;

function geoToSvg(lat: number, lng: number): { x: number; y: number } {
  const x =
    PADDING +
    ((lng - US_BOUNDS.minLng) / (US_BOUNDS.maxLng - US_BOUNDS.minLng)) *
      (SVG_WIDTH - 2 * PADDING);
  // Invert Y because SVG y goes down, lat goes up
  const y =
    PADDING +
    ((US_BOUNDS.maxLat - lat) / (US_BOUNDS.maxLat - US_BOUNDS.minLat)) *
      (SVG_HEIGHT - 2 * PADDING);
  return { x, y };
}

// Simplified US outline path (continental US)
const US_OUTLINE = `M 80,120 L 120,100 L 160,95 L 200,100 L 240,90 L 280,85 L 320,88 L 360,90 L 400,92 L 440,88 L 480,85 L 520,90 L 560,95 L 600,100 L 640,110 L 680,115 L 720,120 L 760,130 L 800,140 L 840,155 L 870,170 L 880,200 L 885,230 L 880,260 L 870,290 L 855,320 L 835,345 L 820,365 L 800,380 L 790,400 L 785,420 L 790,440 L 800,460 L 810,475 L 805,490 L 790,500 L 770,510 L 750,505 L 730,500 L 720,485 L 700,475 L 680,470 L 660,465 L 640,460 L 620,455 L 600,460 L 580,465 L 560,468 L 540,470 L 520,475 L 500,478 L 480,480 L 460,485 L 440,490 L 420,492 L 400,495 L 380,498 L 360,500 L 340,498 L 320,495 L 300,490 L 280,488 L 260,490 L 240,495 L 220,498 L 200,500 L 180,502 L 160,505 L 140,508 L 120,510 L 100,512 L 80,510 L 65,505 L 55,495 L 50,480 L 48,460 L 50,440 L 52,420 L 50,400 L 48,380 L 50,360 L 52,340 L 50,320 L 48,300 L 50,280 L 52,260 L 55,240 L 58,220 L 60,200 L 62,180 L 65,160 L 70,140 Z`;

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

  // Regional positions
  const regionalPositions = useMemo(
    () =>
      regionals.map((r) => ({
        ...r,
        ...geoToSvg(r.lat, r.lng),
      })),
    [regionals]
  );

  // Team positions
  const teamPositions = useMemo(
    () =>
      assignments.map((a) => ({
        ...a,
        ...geoToSvg(a.lat, a.lng),
      })),
    [assignments]
  );

  // Active regional data
  const activeRegionalData = activeRegional !== null
    ? regionals.find((r) => r.id === activeRegional)
    : null;
  const activeTeams = activeRegional !== null
    ? byRegional.get(activeRegional) ?? []
    : [];
  const activeTotalDist = activeTeams.reduce((sum, t) => sum + t.distanceMiles, 0);

  return (
    <div className="space-y-4">
      {/* Map */}
      <div className="relative rounded-lg border border-border bg-card overflow-hidden">
        <svg
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          className="w-full h-auto"
          style={{ maxHeight: "500px" }}
        >
          {/* US outline */}
          <path
            d={US_OUTLINE}
            fill="hsl(var(--secondary))"
            stroke="hsl(var(--border))"
            strokeWidth="1.5"
            opacity="0.6"
          />

          {/* Travel lines (only when a regional is selected) */}
          {activeRegional !== null && activeRegionalData && (
            <>
              {teamPositions
                .filter((t) => t.regionalId === activeRegional)
                .map((team) => {
                  const rPos = geoToSvg(activeRegionalData.lat, activeRegionalData.lng);
                  // Create a curved line
                  const midX = (team.x + rPos.x) / 2;
                  const midY = (team.y + rPos.y) / 2 - 30;
                  const isHovered = hoveredTeam === team.team;

                  return (
                    <g key={`line-${team.team}`}>
                      <path
                        d={`M ${team.x} ${team.y} Q ${midX} ${midY} ${rPos.x} ${rPos.y}`}
                        fill="none"
                        stroke={activeRegionalData.color}
                        strokeWidth={isHovered ? 2.5 : 1.5}
                        strokeDasharray={isHovered ? "none" : "4,4"}
                        opacity={isHovered ? 0.9 : 0.4}
                        className="transition-all duration-200"
                      />
                    </g>
                  );
                })}
            </>
          )}

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

          {/* Regional site markers (larger, on top) */}
          {regionalPositions.map((r) => {
            const isActive = activeRegional === null || activeRegional === r.id;
            const teams = byRegional.get(r.id) ?? [];

            return (
              <g
                key={`regional-${r.id}`}
                className="cursor-pointer"
                onClick={() =>
                  setActiveRegional(activeRegional === r.id ? null : r.id)
                }
              >
                {/* Pulse ring when active */}
                {activeRegional === r.id && (
                  <circle
                    cx={r.x}
                    cy={r.y}
                    r={18}
                    fill="none"
                    stroke={r.color}
                    strokeWidth="2"
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
                  strokeWidth="2"
                  opacity={isActive ? 1 : 0.3}
                  className="transition-all duration-200"
                />
                {/* Regional label */}
                <text
                  x={r.x}
                  y={r.y + (activeRegional === r.id ? 24 : 22)}
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
            className="absolute top-3 right-3 rounded-lg bg-background/95 border border-border p-3 max-w-[200px] backdrop-blur-sm"
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
            <div className="mt-2 space-y-0.5">
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
                    <span className="text-text-tertiary">
                      ({t.distanceMiles.toLocaleString()} mi)
                    </span>
                  </p>
                ))}
            </div>
            <button
              onClick={() => setActiveRegional(null)}
              className="mt-2 text-[10px] text-primary hover:text-primary-hover transition-colors"
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
          const totalDist = teams.reduce((sum, t) => sum + t.distanceMiles, 0);
          const avgDist = teams.length > 0 ? Math.round(totalDist / teams.length) : 0;
          const maxTravel = teams.reduce(
            (max, t) => (t.distanceMiles > max.distanceMiles ? t : max),
            teams[0]
          );

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
                  <p className="text-[10px] text-text-tertiary truncate">
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
