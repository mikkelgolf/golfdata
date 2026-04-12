"use client";

import { useMemo } from "react";
import { scaleLinear } from "@visx/scale";
import { forceSimulation, forceX, forceY, forceCollide } from "d3-force";
import type { ChampionshipAssignment } from "@/lib/championships";
import type { Championship } from "@/data/championships-men-2026";

interface SimNode extends ChampionshipAssignment {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
}

/**
 * Beeswarm distribution of team-to-championship-venue travel distances.
 * Each dot is a team; horizontal position = miles to assigned championship;
 * dot color = destination championship. Forces resolve dot collisions.
 *
 * Teams without coordinates (lat=0 && lng=0) are filtered out — they have
 * no meaningful distance to plot.
 */
export function ChampionshipsBeeswarm({
  assignments,
  championshipMap,
  height = 72,
}: {
  assignments: ChampionshipAssignment[];
  championshipMap: Map<number, Championship>;
  height?: number;
}) {
  const VBW = 800;
  const PAD_X = 24;
  const PAD_BOTTOM = 18;
  const TICKS = [0, 500, 1000, 1500, 2000, 2500];

  const { nodes, xScale, totalShown, maxMiles } = useMemo(() => {
    const mappable = assignments.filter(
      (a) => (a.lat !== 0 || a.lng !== 0) && a.distanceMiles > 0
    );
    const max = Math.max(2600, ...mappable.map((a) => a.distanceMiles));
    const x = scaleLinear<number>({
      domain: [0, max],
      range: [PAD_X, VBW - PAD_X],
    });
    const sim: SimNode[] = mappable.map((a) => ({
      ...a,
      x: x(a.distanceMiles),
      y: (height - PAD_BOTTOM) / 2,
    }));
    forceSimulation(sim)
      .force("x", forceX<SimNode>((d) => x(d.distanceMiles)).strength(1))
      .force("y", forceY<SimNode>((height - PAD_BOTTOM) / 2).strength(0.18))
      .force("collide", forceCollide<SimNode>(2.8))
      .stop()
      .tick(140);
    return { nodes: sim, xScale: x, totalShown: mappable.length, maxMiles: max };
  }, [assignments, height]);

  const skipped = assignments.length - totalShown;

  return (
    <div className="ring-card px-3 py-2.5">
      <div className="flex items-baseline justify-between mb-1.5">
        <p className="text-[11px] font-medium text-foreground">Travel distribution</p>
        <p className="text-[10px] text-text-tertiary tabular-nums">
          {totalShown} teams &middot; max {Math.round(maxMiles).toLocaleString()} mi
          {skipped > 0 ? ` · ${skipped} no coords` : ""}
        </p>
      </div>
      <svg
        viewBox={`0 0 ${VBW} ${height}`}
        className="w-full h-auto"
        aria-label="Beeswarm distribution of team travel distances to conference championships"
      >
        <line
          x1={PAD_X}
          x2={VBW - PAD_X}
          y1={height - PAD_BOTTOM + 2}
          y2={height - PAD_BOTTOM + 2}
          stroke="hsl(var(--border))"
          strokeWidth="1"
        />
        {TICKS.map((tick) => (
          <g key={tick}>
            <line
              x1={xScale(tick)}
              x2={xScale(tick)}
              y1={height - PAD_BOTTOM + 2}
              y2={height - PAD_BOTTOM + 5}
              stroke="hsl(var(--border-medium))"
              strokeWidth="0.75"
            />
            <text
              x={xScale(tick)}
              y={height - 2}
              fontSize="9"
              fill="hsl(var(--text-tertiary))"
              textAnchor="middle"
            >
              {tick === 0 ? "0 mi" : tick.toLocaleString()}
            </text>
          </g>
        ))}
        {nodes.map((n) => {
          const c = championshipMap.get(n.championshipId);
          return (
            <circle
              key={n.team}
              cx={n.x}
              cy={n.y}
              r="2.2"
              fill={c?.color ?? "hsl(var(--foreground))"}
              stroke="hsl(var(--background))"
              strokeWidth="0.4"
              opacity="0.85"
            >
              <title>{`#${n.rank} ${n.team} — ${n.distanceMiles.toLocaleString()} mi to ${c?.name ?? ""}`}</title>
            </circle>
          );
        })}
      </svg>
    </div>
  );
}
