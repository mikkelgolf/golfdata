"use client";

import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
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
  regionalSeeds: Map<number, number>;
}

export default function USMap({ assignments, regionals, regionalSeeds }: USMapProps) {
  const [activeRegional, setActiveRegional] = useState<number | null>(null);
  const [hoveredTeam, setHoveredTeam] = useState<string | null>(null);

  // Blur-up: dots + lines start blurred & invisible, fade in over 600ms
  // after hydration. State outline + regional markers paint instantly.
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setLoaded(true), 60);
    return () => clearTimeout(t);
  }, []);

  // Lookup: regional id -> Regional (for color + position)
  const regionalById = useMemo(() => {
    const m = new Map<number, Regional>();
    for (const r of regionals) m.set(r.id, r);
    return m;
  }, [regionals]);

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
          role="img"
          aria-label="Interactive map of NCAA regional site assignments showing team locations and travel lines"
        >
          <title>NCAA Regional Assignments Map</title>
          <desc>Interactive map showing team assignments to regional sites with travel distances</desc>

          {/* State fills */}
          {statesGeo.features.map((feat) => {
            const d = pathGen(feat);
            if (!d) return null;
            const featureId = feat.id ?? feat.properties?.name ?? d.slice(0, 20);
            return (
              <path
                key={`state-${featureId}`}
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

          {/* Blur-up wrapper: dots + lines fade in over 600ms after hydration.
              State outline + regional markers paint instantly. */}
          <g
            style={{
              opacity: loaded ? 1 : 0,
              filter: loaded ? "blur(0px)" : "blur(8px)",
              transition: "opacity 600ms ease-out, filter 600ms ease-out",
            }}
          >

          {/* Travel lines: all teams to their assigned regional, always rendered.
              Default very low opacity; brighten on hover/selection. When a regional
              is activated, its lines animate (pathLength 0→1) in seed order so the
              flights "fan out" from the host site. */}
          {teamPositions.map((team, idx) => {
            const r = regionalById.get(team.regionalId);
            if (!r) return null;
            const rPos = projectPoint(r.lat, r.lng);
            if (!rPos) return null;
            const midX = (team.x + rPos.x) / 2;
            const midY = (team.y + rPos.y) / 2 - 30;
            const isInActiveRegional =
              activeRegional !== null && team.regionalId === activeRegional;
            const isOtherActive =
              activeRegional !== null && team.regionalId !== activeRegional;
            const isHovered = hoveredTeam === team.team;

            const opacity = isHovered
              ? 0.85
              : isInActiveRegional
                ? 0.7
                : isOtherActive
                  ? 0.04
                  : 0.18;
            const strokeWidth = isHovered ? 1.5 : isInActiveRegional ? 1.2 : 0.5;
            const dash = isInActiveRegional || isHovered ? "none" : "2,2";
            const d = `M ${team.x} ${team.y} Q ${midX} ${midY} ${rPos.x} ${rPos.y}`;

            // Active regional lines animate draw-on. Background lines render plain.
            if (isInActiveRegional) {
              return (
                <motion.path
                  key={`line-active-${activeRegional}-${team.team}`}
                  d={d}
                  fill="none"
                  stroke={r.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={dash}
                  opacity={opacity}
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{
                    duration: 0.55,
                    ease: "easeOut",
                    delay: (team.seed % 14) * 0.04,
                  }}
                  className="pointer-events-none"
                />
              );
            }
            return (
              <path
                key={`line-${team.team}`}
                d={d}
                fill="none"
                stroke={r.color}
                strokeWidth={strokeWidth}
                strokeDasharray={dash}
                opacity={opacity}
                className="transition-all duration-200 pointer-events-none"
              />
            );
          })}

          {/* Team dots: colored by destination regional */}
          {teamPositions.map((team) => {
            const r = regionalById.get(team.regionalId);
            const dotColor = r?.color ?? "hsl(var(--foreground))";
            const isActive =
              activeRegional === null || team.regionalId === activeRegional;
            const isHovered = hoveredTeam === team.team;

            return (
              <g key={`team-${team.team}`} role="listitem" aria-label={`${team.team}, seed ${team.seed}, ${team.distanceMiles.toLocaleString()} miles`}>
                {/* Invisible touch target (44px minimum) */}
                <circle
                  cx={team.x}
                  cy={team.y}
                  r={22}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredTeam(team.team)}
                  onMouseLeave={() => setHoveredTeam(null)}
                  onTouchStart={() => setHoveredTeam(hoveredTeam === team.team ? null : team.team)}
                />
                {/* Visible dot — colored by regional */}
                <circle
                  cx={team.x}
                  cy={team.y}
                  r={isHovered ? 5 : 3.2}
                  fill={dotColor}
                  stroke="hsl(var(--background))"
                  strokeWidth={0.6}
                  opacity={isActive ? (isHovered ? 1 : 0.85) : 0.18}
                  className="transition-opacity duration-150 pointer-events-none"
                />
                {isHovered && (
                  <text
                    x={team.x}
                    y={team.y - 10}
                    textAnchor="middle"
                    className="text-[10px] font-medium fill-foreground pointer-events-none"
                    style={{ paintOrder: "stroke", stroke: "hsl(var(--background))", strokeWidth: 3, strokeLinejoin: "round" }}
                  >
                    {team.team}
                  </text>
                )}
              </g>
            );
          })}
          </g>
          {/* /blur-up wrapper */}

          {/* Regional site markers */}
          {regionalPositions.map((r) => {
            const isActive =
              activeRegional === null || activeRegional === r.id;
            const isSelected = activeRegional === r.id;
            const teams = byRegional.get(r.id) ?? [];

            return (
              <g
                key={`regional-${r.id}`}
                className="cursor-pointer"
                role="button"
                tabIndex={0}
                aria-label={`${r.name}: ${r.host}, ${r.city} - ${teams.length} teams${isSelected ? " (selected)" : ""}`}
                aria-pressed={isSelected}
                onClick={() =>
                  setActiveRegional(isSelected ? null : r.id)
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setActiveRegional(isSelected ? null : r.id);
                  }
                }}
              >
                {/* Invisible touch target (44px minimum) */}
                <circle
                  cx={r.x}
                  cy={r.y}
                  r={22}
                  fill="transparent"
                />
                {/* Main marker */}
                <circle
                  cx={r.x}
                  cy={r.y}
                  r={isSelected ? 11 : 9}
                  fill={r.color}
                  stroke="hsl(var(--background))"
                  strokeWidth="2"
                  opacity={isActive ? 1 : 0.3}
                  className="transition-opacity duration-150 pointer-events-none"
                />
                {/* Regional label */}
                <text
                  x={r.x}
                  y={r.y + (isSelected ? 25 : 23)}
                  textAnchor="middle"
                  className={cn(
                    "text-[10px] font-semibold pointer-events-none",
                    isActive ? "fill-foreground" : "fill-muted-foreground"
                  )}
                >
                  {regionalSeeds.get(r.id) !== undefined
                    ? `#${regionalSeeds.get(r.id)} ${r.name.replace(/ Regional$/, "")}`
                    : r.name.replace(/ Regional$/, "")}
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

        {/* Desktop info overlay (absolute, top-right) */}
        {activeRegionalData && (
          <div
            className="hidden sm:block absolute top-3 right-3 rounded-md bg-background/85 backdrop-blur-xl backdrop-saturate-150 p-3 max-w-[220px] shadow-overlay"
            role="status"
            aria-live="polite"
            aria-label={`${activeRegionalData.name} details`}
            style={{ borderLeft: `3px solid ${activeRegionalData.color}` }}
          >
            <p className="font-semibold text-[13px] text-foreground">
              {regionalSeeds.get(activeRegionalData.id) !== undefined && (
                <span className="font-mono tabular-nums text-muted-foreground mr-1">
                  #{regionalSeeds.get(activeRegionalData.id)}
                </span>
              )}
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
                      "text-[10px] cursor-pointer",
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

      {/* Mobile bottom sheet (peek drawer, no backdrop so map stays visible) */}
      <div
        className={cn(
          "sm:hidden fixed inset-x-0 bottom-0 z-40 transition-transform duration-200 ease-out",
          activeRegionalData ? "translate-y-0" : "translate-y-full pointer-events-none"
        )}
        aria-hidden={!activeRegionalData}
      >
        {activeRegionalData && (
          <div
            className="mx-2 mb-2 rounded-t-xl rounded-b-md bg-background/85 backdrop-blur-xl backdrop-saturate-150 shadow-overlay overflow-hidden"
            style={{ borderLeft: `3px solid ${activeRegionalData.color}` }}
            role="dialog"
            aria-label={`${activeRegionalData.name} details`}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-2 pb-1">
              <div className="h-1 w-10 rounded-full bg-border-medium" />
            </div>
            <div className="px-4 pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-[14px] text-foreground truncate">
                    {regionalSeeds.get(activeRegionalData.id) !== undefined && (
                      <span className="font-mono tabular-nums text-muted-foreground mr-1">
                        #{regionalSeeds.get(activeRegionalData.id)}
                      </span>
                    )}
                    {activeRegionalData.name}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {activeRegionalData.host} &middot; {activeRegionalData.city}
                  </p>
                </div>
                <button
                  onClick={() => setActiveRegional(null)}
                  className="shrink-0 text-[11px] text-primary px-2 py-1 -mr-2 -mt-1"
                  aria-label="Close"
                >
                  Close
                </button>
              </div>
              <div className="mt-1.5 flex items-center gap-3">
                <p className="text-[11px] text-muted-foreground">
                  {activeTeams.length} teams
                </p>
                <p className="text-[11px] text-muted-foreground">
                  <Plane className="inline h-3 w-3 mr-0.5" />
                  {activeTotalDist.toLocaleString()} mi
                </p>
              </div>
              <div className="mt-2 max-h-[28vh] overflow-y-auto pr-1 -mr-1">
                {activeTeams
                  .sort((a, b) => a.seed - b.seed)
                  .map((t) => (
                    <button
                      key={t.team}
                      onClick={() =>
                        setHoveredTeam(hoveredTeam === t.team ? null : t.team)
                      }
                      className={cn(
                        "block w-full text-left text-[11px] py-1 border-b border-border/30 last:border-b-0",
                        hoveredTeam === t.team
                          ? "text-foreground font-medium"
                          : "text-muted-foreground"
                      )}
                    >
                      <span className="font-mono tabular-nums mr-1.5">#{t.seed}</span>
                      {t.team}{" "}
                      <span className="opacity-60 font-mono tabular-nums">
                        ({t.distanceMiles.toLocaleString()} mi)
                      </span>
                    </button>
                  ))}
              </div>
            </div>
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
              data-active={activeRegional === r.id}
              className="ring-card text-left transition-colors px-2.5 py-2 hover:bg-surface-raised/40 data-[active=true]:bg-surface-raised/60"
              style={{ borderLeft: `3px solid ${r.color}`, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
              onClick={() =>
                setActiveRegional(activeRegional === r.id ? null : r.id)
              }
            >
              <p className="text-[11px] font-medium text-foreground">
                {regionalSeeds.get(r.id) !== undefined && (
                  <span className="font-mono tabular-nums text-muted-foreground mr-1">
                    #{regionalSeeds.get(r.id)}
                  </span>
                )}
                {r.name.replace(/ Regional$/, "")}
              </p>
              <div className="mt-1 space-y-0.5">
                <p className="text-[10px] text-muted-foreground tabular-nums">
                  {avgDist.toLocaleString()} mi avg
                </p>
                {maxTravel && (
                  <p className="text-[10px] text-text-tertiary truncate">
                    {maxTravel.team}
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
