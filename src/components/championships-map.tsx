"use client";

import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { ChampionshipAssignment } from "@/lib/championships";
import type { Championship } from "@/data/championships-men-2026";
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

function projectPoint(
  lat: number,
  lng: number
): { x: number; y: number } | null {
  const p = projection([lng, lat]);
  return p ? { x: p[0], y: p[1] } : null;
}

function formatDateRange(start: string, end: string): string {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const monthShort = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short" });
  if (s.getMonth() === e.getMonth()) {
    return `${monthShort(s)} ${s.getDate()}\u2013${e.getDate()}`;
  }
  return `${monthShort(s)} ${s.getDate()}\u2013${monthShort(e)} ${e.getDate()}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
interface ChampionshipsMapProps {
  assignments: ChampionshipAssignment[];
  championships: Championship[];
  activeChampionship: number | null;
  onActiveChampionshipChange: (id: number | null) => void;
}

export default function ChampionshipsMap({
  assignments,
  championships,
  activeChampionship,
  onActiveChampionshipChange,
}: ChampionshipsMapProps) {
  const [hoveredTeam, setHoveredTeam] = useState<string | null>(null);

  // Blur-up animation on first paint
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setLoaded(true), 60);
    return () => clearTimeout(t);
  }, []);

  // Filter out championships with TBD coordinates (lat=0,lng=0) — they
  // appear in chronological/byChampionship views but not on the map.
  const mappableChampionships = useMemo(
    () => championships.filter((c) => c.lat !== 0 || c.lng !== 0),
    [championships]
  );

  // Lookup: championship id -> Championship
  const championshipById = useMemo(() => {
    const m = new Map<number, Championship>();
    for (const c of mappableChampionships) m.set(c.id, c);
    return m;
  }, [mappableChampionships]);

  // Group assignments by championship
  const byChampionship = useMemo(() => {
    const map = new Map<number, ChampionshipAssignment[]>();
    for (const c of mappableChampionships) map.set(c.id, []);
    for (const a of assignments) {
      if (map.has(a.championshipId)) {
        map.get(a.championshipId)?.push(a);
      }
    }
    return map;
  }, [assignments, mappableChampionships]);

  // Project championship venue positions
  const championshipPositions = useMemo(
    () =>
      mappableChampionships
        .map((c) => {
          const pos = projectPoint(c.lat, c.lng);
          return pos ? { ...c, x: pos.x, y: pos.y } : null;
        })
        .filter(Boolean) as (Championship & { x: number; y: number })[],
    [mappableChampionships]
  );

  // Project team positions (only those whose championship is mappable AND
  // which have non-zero coordinates — schools without coords still appear
  // in card lists but get skipped on the map)
  const teamPositions = useMemo(
    () =>
      assignments
        .filter((a) => championshipById.has(a.championshipId))
        .filter((a) => a.lat !== 0 || a.lng !== 0)
        .map((a) => {
          const pos = projectPoint(a.lat, a.lng);
          return pos ? { ...a, x: pos.x, y: pos.y } : null;
        })
        .filter(Boolean) as (ChampionshipAssignment & {
        x: number;
        y: number;
      })[],
    [assignments, championshipById]
  );

  const activeChampionshipData =
    activeChampionship !== null
      ? mappableChampionships.find((c) => c.id === activeChampionship)
      : null;
  const activeTeams =
    activeChampionship !== null
      ? byChampionship.get(activeChampionship) ?? []
      : [];
  const activeTotalDist = activeTeams.reduce(
    (sum, t) => sum + t.distanceMiles,
    0
  );

  return (
    <div className="space-y-4">
      <div className="relative rounded-lg border border-border bg-card overflow-hidden">
        <svg
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          className="w-full h-auto"
          style={{ maxHeight: "520px" }}
          role="img"
          aria-label="Interactive map of D1 conference championship venues with team travel lines"
        >
          <title>D1 Conference Championships Map</title>
          <desc>Interactive map showing every conference championship venue and the travel paths of competing teams</desc>

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

          {/* Nation outline */}
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

          <g
            style={{
              opacity: loaded ? 1 : 0,
              filter: loaded ? "blur(0px)" : "blur(8px)",
              transition: "opacity 600ms ease-out, filter 600ms ease-out",
            }}
          >
            {/* Travel lines: every team to its conference championship venue.
                Default opacity is lower than the predictions map because we
                have ~5x more lines (~300 vs ~80). Active championship lines
                animate draw-on. */}
            {teamPositions.map((team) => {
              const c = championshipById.get(team.championshipId);
              if (!c) return null;
              const cPos = projectPoint(c.lat, c.lng);
              if (!cPos) return null;
              const midX = (team.x + cPos.x) / 2;
              const midY = (team.y + cPos.y) / 2 - 30;
              const isInActive =
                activeChampionship !== null &&
                team.championshipId === activeChampionship;
              const isOtherActive =
                activeChampionship !== null &&
                team.championshipId !== activeChampionship;
              const isHovered = hoveredTeam === team.team;

              const opacity = isHovered
                ? 0.9
                : isInActive
                  ? 0.75
                  : isOtherActive
                    ? 0.025
                    : 0.09;
              const strokeWidth = isHovered ? 1.5 : isInActive ? 1.2 : 0.45;
              const dash = isInActive || isHovered ? "none" : "2,2";
              const d = `M ${team.x} ${team.y} Q ${midX} ${midY} ${cPos.x} ${cPos.y}`;

              if (isInActive) {
                return (
                  <motion.path
                    key={`line-active-${activeChampionship}-${team.team}`}
                    d={d}
                    fill="none"
                    stroke={c.color}
                    strokeWidth={strokeWidth}
                    strokeDasharray={dash}
                    opacity={opacity}
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{
                      duration: 0.55,
                      ease: "easeOut",
                      delay: (team.rank % 14) * 0.04,
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
                  stroke={c.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={dash}
                  opacity={opacity}
                  className="transition-all duration-200 pointer-events-none"
                />
              );
            })}

            {/* Team dots */}
            {teamPositions.map((team) => {
              const c = championshipById.get(team.championshipId);
              const dotColor = c?.color ?? "hsl(var(--foreground))";
              const isActive =
                activeChampionship === null ||
                team.championshipId === activeChampionship;
              const isHovered = hoveredTeam === team.team;

              return (
                <g
                  key={`team-${team.team}`}
                  role="listitem"
                  aria-label={`${team.team}, rank ${team.rank}, ${team.distanceMiles.toLocaleString()} miles to ${c?.name ?? ""}`}
                >
                  <circle
                    cx={team.x}
                    cy={team.y}
                    r={20}
                    fill="transparent"
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredTeam(team.team)}
                    onMouseLeave={() => setHoveredTeam(null)}
                    onTouchStart={() =>
                      setHoveredTeam(hoveredTeam === team.team ? null : team.team)
                    }
                  />
                  <circle
                    cx={team.x}
                    cy={team.y}
                    r={isHovered ? 4.5 : 2.8}
                    fill={dotColor}
                    stroke="hsl(var(--background))"
                    strokeWidth={0.5}
                    opacity={isActive ? (isHovered ? 1 : 0.78) : 0.12}
                    className="transition-opacity duration-150 pointer-events-none"
                  />
                  {isHovered && (
                    <text
                      x={team.x}
                      y={team.y - 9}
                      textAnchor="middle"
                      className="text-[10px] font-medium fill-foreground pointer-events-none"
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
          </g>

          {/* Championship venue markers — smaller than predictions map
              (4-7px vs 9-11px) because there are ~30 of them and the East
              Coast crowds heavily */}
          {championshipPositions.map((c) => {
            const isActive =
              activeChampionship === null || activeChampionship === c.id;
            const isSelected = activeChampionship === c.id;
            const teams = byChampionship.get(c.id) ?? [];

            return (
              <g
                key={`champ-${c.id}`}
                className="cursor-pointer"
                role="button"
                tabIndex={0}
                aria-label={`${c.name}: ${c.courseName}, ${c.city} - ${teams.length} teams${isSelected ? " (selected)" : ""}`}
                aria-pressed={isSelected}
                onClick={() =>
                  onActiveChampionshipChange(isSelected ? null : c.id)
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onActiveChampionshipChange(isSelected ? null : c.id);
                  }
                }}
              >
                <circle cx={c.x} cy={c.y} r={20} fill="transparent" />
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={isSelected ? 7.5 : 5}
                  fill={c.color}
                  stroke="hsl(var(--background))"
                  strokeWidth="1.5"
                  opacity={isActive ? 1 : 0.25}
                  className="transition-opacity duration-150 pointer-events-none"
                />
                {/* Only label the active championship — labeling all 30
                    would be unreadable */}
                {isSelected && (
                  <text
                    x={c.x}
                    y={c.y + 17}
                    textAnchor="middle"
                    className="text-[10px] font-semibold fill-foreground pointer-events-none"
                    style={{
                      paintOrder: "stroke",
                      stroke: "hsl(var(--background))",
                      strokeWidth: 3,
                      strokeLinejoin: "round",
                    }}
                  >
                    {c.conference}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Desktop info overlay */}
        {activeChampionshipData && (
          <div
            className="hidden sm:block absolute top-3 right-3 rounded-md bg-background/85 backdrop-blur-xl backdrop-saturate-150 p-3 max-w-[260px] shadow-overlay"
            role="status"
            aria-live="polite"
            aria-label={`${activeChampionshipData.name} details`}
            style={{ borderLeft: `3px solid ${activeChampionshipData.color}` }}
          >
            <p className="font-semibold text-[13px] text-foreground">
              {activeChampionshipData.name}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {activeChampionshipData.courseName}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {activeChampionshipData.city}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1 font-mono">
              {formatDateRange(
                activeChampionshipData.startDate,
                activeChampionshipData.endDate
              )}
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
                .slice()
                .sort((a, b) => a.rank - b.rank)
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
                    #{t.rank} {t.team}{" "}
                    <span className="opacity-60">
                      ({t.distanceMiles.toLocaleString()} mi)
                    </span>
                  </p>
                ))}
            </div>
            <button
              onClick={() => onActiveChampionshipChange(null)}
              className="mt-2 text-[10px] text-primary hover:underline transition-colors"
            >
              Clear selection
            </button>
          </div>
        )}
      </div>

      {/* Mobile bottom sheet */}
      <div
        className={cn(
          "sm:hidden fixed inset-x-0 bottom-0 z-40 transition-transform duration-200 ease-out",
          activeChampionshipData
            ? "translate-y-0"
            : "translate-y-full pointer-events-none"
        )}
        aria-hidden={!activeChampionshipData}
      >
        {activeChampionshipData && (
          <div
            className="mx-2 mb-2 rounded-t-xl rounded-b-md bg-background/85 backdrop-blur-xl backdrop-saturate-150 shadow-overlay overflow-hidden"
            style={{ borderLeft: `3px solid ${activeChampionshipData.color}` }}
            role="dialog"
            aria-label={`${activeChampionshipData.name} details`}
          >
            <div className="flex justify-center pt-2 pb-1">
              <div className="h-1 w-10 rounded-full bg-border-medium" />
            </div>
            <div className="px-4 pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-[14px] text-foreground truncate">
                    {activeChampionshipData.name}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {activeChampionshipData.courseName}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {activeChampionshipData.city} ·{" "}
                    {formatDateRange(
                      activeChampionshipData.startDate,
                      activeChampionshipData.endDate
                    )}
                  </p>
                </div>
                <button
                  onClick={() => onActiveChampionshipChange(null)}
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
                  .slice()
                  .sort((a, b) => a.rank - b.rank)
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
                      <span className="font-mono tabular-nums mr-1.5">
                        #{t.rank}
                      </span>
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
    </div>
  );
}
