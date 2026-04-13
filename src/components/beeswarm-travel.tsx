"use client";

import { useMemo, useState } from "react";
import { scaleLinear } from "@visx/scale";
import { forceSimulation, forceX, forceY, forceCollide } from "d3-force";
import type { ScurveAssignment } from "@/lib/scurve";
import type { Regional } from "@/data/regionals-men-2026";
import { SimpleModal } from "@/components/simple-modal";

interface SimNode extends ScurveAssignment {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
}

/**
 * Beeswarm distribution of team-to-host travel distances.
 * Each dot is a team; horizontal position = miles to assigned regional;
 * dot color = destination regional. Forces resolve dot collisions.
 *
 * Click anywhere to open a sorted full-distance modal.
 */
export function BeeswarmTravel({
  assignments,
  regionalMap,
  height = 72,
}: {
  assignments: ScurveAssignment[];
  regionalMap: Map<number, Regional>;
  height?: number;
}) {
  const VBW = 800;
  const PAD_X = 24;
  const PAD_BOTTOM = 18;
  const TICKS = [0, 500, 1000, 1500, 2000, 2500];

  const [modalOpen, setModalOpen] = useState(false);

  const { nodes, xScale } = useMemo(() => {
    const maxMiles = Math.max(2600, ...assignments.map((a) => a.distanceMiles));
    const x = scaleLinear<number>({
      domain: [0, maxMiles],
      range: [PAD_X, VBW - PAD_X],
    });
    const sim: SimNode[] = assignments.map((a) => ({
      ...a,
      x: x(a.distanceMiles),
      y: (height - PAD_BOTTOM) / 2,
    }));
    forceSimulation(sim)
      .force("x", forceX<SimNode>((d) => x(d.distanceMiles)).strength(1))
      .force("y", forceY<SimNode>((height - PAD_BOTTOM) / 2).strength(0.18))
      .force("collide", forceCollide<SimNode>(3.5))
      .stop()
      .tick(140);
    return { nodes: sim, xScale: x };
  }, [assignments, height]);

  const sortedByDistance = useMemo(
    () => [...assignments].sort((a, b) => b.distanceMiles - a.distanceMiles),
    [assignments]
  );

  const totalMiles = useMemo(
    () => sortedByDistance.reduce((sum, t) => sum + t.distanceMiles, 0),
    [sortedByDistance]
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="ring-card px-3 py-2.5 w-full text-left cursor-pointer hover:bg-white/[0.02] transition-colors group"
        aria-label="Open full travel distance breakdown"
      >
        <div className="flex items-baseline justify-between mb-1.5">
          <p className="text-[11px] font-medium text-foreground">
            Travel distribution
            <span className="ml-1.5 text-[10px] text-text-tertiary group-hover:text-foreground transition-colors normal-case font-normal">
              · click to expand
            </span>
          </p>
          <p className="text-[10px] text-text-tertiary tabular-nums">
            {assignments.length} teams &middot; max {Math.max(...assignments.map((a) => a.distanceMiles)).toLocaleString()} mi
          </p>
        </div>
        <svg
          viewBox={`0 0 ${VBW} ${height}`}
          className="w-full h-auto"
          aria-label="Beeswarm distribution of team travel distances"
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
            const r = regionalMap.get(n.regionalId);
            return (
              <circle
                key={n.team}
                cx={n.x}
                cy={n.y}
                r="2.6"
                fill={r?.color ?? "hsl(var(--foreground))"}
                stroke="hsl(var(--background))"
                strokeWidth="0.5"
                opacity="0.9"
              >
                <title>{`#${n.seed} ${n.team} — ${n.distanceMiles.toLocaleString()} mi to ${r?.name ?? ""}`}</title>
              </circle>
            );
          })}
        </svg>
      </button>

      <SimpleModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Travel distribution — by distance"
        subtitle={`${assignments.length} teams · ${totalMiles.toLocaleString()} mi total · sorted descending`}
      >
        <table className="w-full text-[12px] tabular-nums">
          <thead className="bg-card sticky top-0 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-right w-[44px]">Rank</th>
              <th className="px-3 py-2 text-left">Team</th>
              <th className="px-3 py-2 text-left w-[80px]">Conf</th>
              <th className="px-3 py-2 text-left w-[140px]">Regional</th>
              <th className="px-3 py-2 text-right w-[80px]">Distance</th>
            </tr>
          </thead>
          <tbody>
            {sortedByDistance.map((t) => {
              const r = regionalMap.get(t.regionalId);
              return (
                <tr key={t.team} className="border-b border-border/40 hover:bg-white/[0.02]">
                  <td className="px-3 py-1.5 font-mono text-muted-foreground text-right">#{t.rank}</td>
                  <td className="px-3 py-1.5 text-foreground">{t.team}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{t.conference}</td>
                  <td
                    className="px-3 py-1.5 text-muted-foreground"
                    style={{ borderLeft: `2px solid ${r?.color ?? "#888"}`, paddingLeft: "8px" }}
                  >
                    {r?.name.replace(/ Regional$/, "") ?? "—"}
                  </td>
                  <td className="px-3 py-1.5 text-foreground font-mono text-right">
                    {t.distanceMiles.toLocaleString()} mi
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </SimpleModal>
    </>
  );
}
