"use client";

import { useMemo } from "react";
import { geoAlbersUsa, geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";
import type {
  Topology,
  GeometryCollection,
  GeometryObject,
} from "topojson-specification";
import type { FeatureCollection } from "geojson";
import usTopology from "@/data/us-states-10m.json";
import type { ScurveAssignment } from "@/lib/scurve";
import type { Regional } from "@/data/regionals-men-2026";
import type { TeamData } from "@/data/rankings-men";
import type { Gender } from "@/data/records-types";
import {
  STATE_FIPS_TO_TZ,
  TIMEZONE_BAND_NAME,
  formatTzDelta,
  tzBandFromCoord,
  tzDeltaHours,
} from "@/lib/timezone";

const SVG_WIDTH = 975;
const SVG_HEIGHT = 610;
const projection = geoAlbersUsa()
  .scale(1300)
  .translate([SVG_WIDTH / 2, SVG_HEIGHT / 2]);
const pathGen = geoPath(projection);

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

/**
 * Timezone boundary mesh — the subset of state borders that separate
 * states in different May/June timezones. Drawn at module level so the
 * d3-geo work happens once per bundle, not once per team page.
 *
 * Intra-state timezone splits (TN/KY east-west, etc.) are NOT rendered
 * here; that level of detail would need a dedicated timezone polygon
 * dataset. The dots+delta text are still computed at per-campus
 * precision via tzBandFromStateFips.
 */
const timezoneBorderPath = pathGen(
  mesh(
    topo,
    topo.objects.states as GeometryCollection,
    (a: GeometryObject, b: GeometryObject) => {
      const aFips = typeof a.id === "string" ? a.id : String(a.id ?? "");
      const bFips = typeof b.id === "string" ? b.id : String(b.id ?? "");
      if (!aFips || !bFips) return false;
      const aTz = STATE_FIPS_TO_TZ[aFips];
      const bTz = STATE_FIPS_TO_TZ[bFips];
      if (!aTz || !bTz) return false;
      return aTz !== bTz;
    }
  )
);

function projectPoint(lat: number, lng: number): [number, number] | null {
  return projection([lng, lat]) as [number, number] | null;
}

interface Props {
  team: TeamData;
  assignment: ScurveAssignment;
  regional: Regional;
  regionals: Regional[];
  conferencePeers: TeamData[];
  gender: Gender;
}

/**
 * Team-scoped US map. Shows:
 *   - All 6 regional host sites (subdued dots)
 *   - Conference peer schools (small conference-tinted dots)
 *   - This team's home (large highlighted dot)
 *   - One travel arc: team → predicted regional
 *
 * Read-only and non-interactive; this is an at-a-glance geography summary
 * that sits in the above-the-fold dashboard. The full interactive map lives
 * on /scurve.
 */
export default function TeamMap({
  team,
  assignment,
  regional,
  regionals,
  conferencePeers,
}: Props) {
  const teamPos = useMemo(
    () => (team.lat && team.lng ? projectPoint(team.lat, team.lng) : null),
    [team.lat, team.lng]
  );
  const regionalPos = useMemo(
    () => projectPoint(regional.lat, regional.lng),
    [regional.lat, regional.lng]
  );

  const regionalPositions = useMemo(
    () =>
      regionals
        .map((r) => {
          const p = projectPoint(r.lat, r.lng);
          return p ? { ...r, x: p[0], y: p[1] } : null;
        })
        .filter(Boolean) as (Regional & { x: number; y: number })[],
    [regionals]
  );

  const peerPositions = useMemo(
    () =>
      conferencePeers
        .filter((p) => p.team !== team.team && p.lat && p.lng)
        .map((p) => {
          const pos = projectPoint(p.lat, p.lng);
          return pos ? { team: p.team, x: pos[0], y: pos[1] } : null;
        })
        .filter(Boolean) as { team: string; x: number; y: number }[],
    [conferencePeers, team.team]
  );

  // Quadratic Bezier control point for a gentle arc — same math us-map uses.
  const arcPath = useMemo(() => {
    if (!teamPos || !regionalPos) return null;
    const [x1, y1] = teamPos;
    const [x2, y2] = regionalPos;
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2 - 30;
    return `M ${x1} ${y1} Q ${midX} ${midY} ${x2} ${y2}`;
  }, [teamPos, regionalPos]);

  // Timezone-delta computation (May/June offsets). Falls back to the
  // longitude heuristic if either coord doesn't land inside a state polygon.
  const tzInfo = useMemo(() => {
    if (
      team.lat == null ||
      team.lng == null ||
      regional.lat == null ||
      regional.lng == null
    ) {
      return null;
    }
    const fromBand = tzBandFromCoord(team.lat, team.lng, statesGeo);
    const toBand = tzBandFromCoord(regional.lat, regional.lng, statesGeo);
    const hours = tzDeltaHours(fromBand, toBand);
    return {
      fromBand,
      toBand,
      hours,
      label: formatTzDelta(hours),
      tooltip: `${TIMEZONE_BAND_NAME[fromBand]} → ${TIMEZONE_BAND_NAME[toBand]} (May/June DST)`,
    };
  }, [team.lat, team.lng, regional.lat, regional.lng]);

  return (
    <div className="relative rounded-lg border border-border/60 bg-card/40 overflow-hidden">
      <svg
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        className="w-full h-auto block"
        style={{ maxHeight: 260 }}
        role="img"
        aria-label={`Geographic summary: ${team.team} travel to ${regional.name}`}
      >
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
        {stateBorderPath && (
          <path
            d={stateBorderPath}
            fill="none"
            stroke="hsl(var(--foreground))"
            strokeWidth="0.75"
            strokeLinejoin="round"
            opacity="0.18"
          />
        )}
        {/* Timezone boundaries — drawn on top of state borders so they
            read as a separate, slightly bolder visual layer. Dashed to
            distinguish from both state and national borders. */}
        {timezoneBorderPath && (
          <path
            d={timezoneBorderPath}
            fill="none"
            stroke="hsl(var(--foreground))"
            strokeWidth="1"
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray="3 2"
            opacity="0.42"
          />
        )}
        {nationBorderPath && (
          <path
            d={nationBorderPath}
            fill="none"
            stroke="hsl(var(--foreground))"
            strokeWidth="1"
            strokeLinejoin="round"
            opacity="0.35"
          />
        )}

        {/* Other regional host sites — subdued background markers. */}
        {regionalPositions
          .filter((r) => r.id !== regional.id)
          .map((r) => (
            <circle
              key={`other-reg-${r.id}`}
              cx={r.x}
              cy={r.y}
              r={4}
              fill={r.color}
              opacity={0.28}
            />
          ))}

        {/* Conference peers — small dots in accent color. */}
        {peerPositions.map((p) => (
          <circle
            key={`peer-${p.team}`}
            cx={p.x}
            cy={p.y}
            r={2.2}
            fill="hsl(var(--foreground))"
            opacity={0.35}
          >
            <title>{p.team}</title>
          </circle>
        ))}

        {/* Travel arc — prominent single line from team to predicted regional. */}
        {arcPath && (
          <path
            d={arcPath}
            fill="none"
            stroke={regional.color}
            strokeWidth={1.5}
            strokeLinecap="round"
            opacity={0.75}
          />
        )}

        {/* Predicted regional host — large colored marker. */}
        {regionalPos && (
          <g>
            <circle
              cx={regionalPos[0]}
              cy={regionalPos[1]}
              r={8}
              fill={regional.color}
              opacity={0.22}
            />
            <circle
              cx={regionalPos[0]}
              cy={regionalPos[1]}
              r={4.5}
              fill={regional.color}
              stroke="hsl(var(--background))"
              strokeWidth={1}
            >
              <title>{`${regional.name} — ${regional.host}, ${regional.city}`}</title>
            </circle>
          </g>
        )}

        {/* This team's home — emphasised. */}
        {teamPos && (
          <g>
            <circle
              cx={teamPos[0]}
              cy={teamPos[1]}
              r={9}
              fill="hsl(var(--primary))"
              opacity={0.18}
            />
            <circle
              cx={teamPos[0]}
              cy={teamPos[1]}
              r={4.5}
              fill="hsl(var(--primary))"
              stroke="hsl(var(--background))"
              strokeWidth={1.2}
            >
              <title>{team.team}</title>
            </circle>
          </g>
        )}
      </svg>

      <div className="px-3 py-2 border-t border-border/40 bg-background/30 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-text-tertiary">
        <span className="inline-flex items-center gap-1">
          <span
            aria-hidden="true"
            className="inline-block h-[6px] w-[6px] rounded-full"
            style={{ background: "hsl(var(--primary))" }}
          />
          home
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            aria-hidden="true"
            className="inline-block h-[6px] w-[6px] rounded-full"
            style={{ background: regional.color }}
          />
          {regional.name.replace(/ Regional$/, "")}
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            aria-hidden="true"
            className="inline-block h-[4px] w-[4px] rounded-full bg-foreground/40"
          />
          conference peers
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            aria-hidden="true"
            className="inline-block h-0 w-[12px] border-t border-dashed border-foreground/50"
          />
          time zones
        </span>
        <span
          className="ml-auto font-mono tabular-nums text-foreground/80"
          title={tzInfo?.tooltip}
        >
          {Math.round(assignment.distanceMiles).toLocaleString()} mi
          {tzInfo ? ` (${tzInfo.label})` : ""}
        </span>
      </div>
    </div>
  );
}
