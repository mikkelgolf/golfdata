"use client";

import { motion } from "framer-motion";
import { useMemo, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/animations";
import { isRegionalWin } from "@/lib/streaks";
import type { NcaaYearResult } from "./program-arc";

interface YearResult {
  year: number;
  position: string;
  advanced: boolean;
  missed?: boolean;
  cancelled?: boolean;
}

const ADVANCEMENT_CUT = 5;
const VB_W = 800;
const VB_H = 240;
const PAD_L = 32;
const PAD_R = 12;
const PAD_T = 16;
const PAD_B = 26;
const PLOT_W = VB_W - PAD_L - PAD_R;
const PLOT_H = VB_H - PAD_T - PAD_B;
const POS_MIN = 1;
const POS_MAX = 15;
const WIN_COLOR = "oklch(0.82 0.11 85)";

interface PlotPoint {
  year: number;
  x: number;
  y: number;
  pos: number;
  position: string;
  advanced: boolean;
  win: boolean;
  missed: boolean;
}

/**
 * Hover-interactive variant of ProgramArc. Same geometry/rendering, plus:
 *  - nearest-year crosshair that follows the mouse along the x-axis
 *  - floating tooltip with the year's regional + NCAA result
 *  - keyboard focus not wired (chart is a supplementary visualization; all
 *    data is also available in the year-by-year grids below)
 *
 * Cancelled years (COVID 2020) are skipped entirely — the line bridges
 * straight across them, and they're not reachable via the crosshair.
 */
export default function InteractiveProgramArc({
  timeline,
  ncaaTimeline,
}: {
  timeline: YearResult[];
  ncaaTimeline?: NcaaYearResult[];
}) {
  const reduced = useReducedMotion();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverYear, setHoverYear] = useState<number | null>(null);

  const { points, segments, minYear, maxYear } = useMemo(() => {
    if (timeline.length === 0) {
      return {
        points: [] as PlotPoint[],
        segments: [] as PlotPoint[][],
        minYear: 0,
        maxYear: 0,
      };
    }
    const sorted = [...timeline].sort((a, b) => a.year - b.year);
    const minY = sorted[0].year;
    const maxY = sorted[sorted.length - 1].year;
    const span = Math.max(1, maxY - minY);

    const pts: PlotPoint[] = [];
    for (const r of sorted) {
      if (r.cancelled) continue;
      const x = PAD_L + ((r.year - minY) / span) * PLOT_W;
      if (r.missed) {
        pts.push({
          year: r.year,
          x,
          y: PAD_T + PLOT_H,
          pos: NaN,
          position: r.position,
          advanced: false,
          win: false,
          missed: true,
        });
        continue;
      }
      const parsedRaw = parseInt(r.position, 10);
      const parsed = Number.isFinite(parsedRaw) && parsedRaw > 0 ? parsedRaw : POS_MAX;
      const clamped = Math.max(POS_MIN, Math.min(POS_MAX, parsed));
      const y = PAD_T + ((clamped - POS_MIN) / (POS_MAX - POS_MIN)) * PLOT_H;
      pts.push({
        year: r.year,
        x,
        y,
        pos: clamped,
        position: r.position,
        advanced: r.advanced,
        win: isRegionalWin(r.position),
        missed: false,
      });
    }

    const segs: PlotPoint[][] = [];
    let cur: PlotPoint[] = [];
    for (const p of pts) {
      if (p.missed) {
        if (cur.length > 0) segs.push(cur);
        cur = [];
      } else {
        cur.push(p);
      }
    }
    if (cur.length > 0) segs.push(cur);

    return { points: pts, segments: segs, minYear: minY, maxYear: maxY };
  }, [timeline]);

  const ncaa = useMemo(() => {
    if (!ncaaTimeline || ncaaTimeline.length === 0 || maxYear === minYear) {
      return {
        points: [] as PlotPoint[],
        segments: [] as PlotPoint[][],
        byYear: new Map<number, PlotPoint>(),
      };
    }
    const span = Math.max(1, maxYear - minYear);
    const pts: PlotPoint[] = [];
    for (const r of ncaaTimeline) {
      if (r.year < minYear || r.year > maxYear) continue;
      if (r.cancelled) continue;
      const x = PAD_L + ((r.year - minYear) / span) * PLOT_W;
      if (!r.appeared) {
        pts.push({
          year: r.year,
          x,
          y: PAD_T + PLOT_H,
          pos: NaN,
          position: r.position,
          advanced: false,
          win: false,
          missed: true,
        });
        continue;
      }
      const parsed =
        r.positionNoTies !== null && r.positionNoTies > 0
          ? r.positionNoTies
          : POS_MAX;
      const clamped = Math.max(POS_MIN, Math.min(POS_MAX, parsed));
      const y = PAD_T + ((clamped - POS_MIN) / (POS_MAX - POS_MIN)) * PLOT_H;
      pts.push({
        year: r.year,
        x,
        y,
        pos: clamped,
        position: r.position,
        advanced: r.advanced,
        win: r.win,
        missed: false,
      });
    }
    pts.sort((a, b) => a.year - b.year);
    const segs: PlotPoint[][] = [];
    let cur: PlotPoint[] = [];
    for (const p of pts) {
      if (p.missed) {
        if (cur.length > 0) segs.push(cur);
        cur = [];
      } else {
        cur.push(p);
      }
    }
    if (cur.length > 0) segs.push(cur);

    const byYear = new Map<number, PlotPoint>();
    for (const p of pts) byYear.set(p.year, p);
    return { points: pts, segments: segs, byYear };
  }, [ncaaTimeline, minYear, maxYear]);

  const regionalByYear = useMemo(() => {
    const m = new Map<number, PlotPoint>();
    for (const p of points) m.set(p.year, p);
    return m;
  }, [points]);

  if (points.length === 0) return null;

  const cutY = PAD_T + ((ADVANCEMENT_CUT - POS_MIN) / (POS_MAX - POS_MIN)) * PLOT_H;

  const pathD = (seg: PlotPoint[]) => {
    if (seg.length === 0) return "";
    if (seg.length === 1) {
      const p = seg[0];
      return `M ${p.x - 0.25} ${p.y} L ${p.x + 0.25} ${p.y}`;
    }
    return seg
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(" ");
  };

  const midYear = Math.round((minYear + maxYear) / 2);
  const tickYears = Array.from(new Set([minYear, midYear, maxYear])).sort(
    (a, b) => a - b
  );

  const titleText = `Program arc — best regional finish per year (${minYear}-${maxYear})`;

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    // Convert clientX to the SVG's internal viewBox coordinate system.
    const xPct = (e.clientX - rect.left) / rect.width;
    const vbX = xPct * VB_W;
    // Find the point with smallest |p.x - vbX|.
    let best: PlotPoint | null = null;
    let bestDist = Infinity;
    for (const p of points) {
      const d = Math.abs(p.x - vbX);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    setHoverYear(best?.year ?? null);
  }

  function handleMouseLeave() {
    setHoverYear(null);
  }

  const hoveredRegional = hoverYear !== null ? regionalByYear.get(hoverYear) : undefined;
  const hoveredNcaa = hoverYear !== null ? ncaa.byYear.get(hoverYear) : undefined;

  // Tooltip position: center of badge sits above the hovered x.
  const tooltipLeftPct =
    hoveredRegional !== undefined ? (hoveredRegional.x / VB_W) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className="relative rounded-lg border border-border/60 bg-card/40 px-3 py-3 sm:px-4 sm:py-3"
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Regional finish per year, ${minYear} to ${maxYear}. Lower line = better finish.`}
        className="block w-full h-[120px] sm:h-[150px] overflow-visible cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <title>{titleText}</title>

        <text
          x={PAD_L - 6}
          y={PAD_T + 4}
          textAnchor="end"
          fontSize={9}
          fill="hsl(var(--muted-foreground))"
          className="font-mono tabular-nums"
        >
          1st
        </text>
        <text
          x={PAD_L - 6}
          y={cutY + 3}
          textAnchor="end"
          fontSize={9}
          fill="hsl(var(--muted-foreground))"
          className="font-mono tabular-nums"
        >
          5th
        </text>

        <line
          x1={PAD_L}
          x2={VB_W - PAD_R}
          y1={cutY}
          y2={cutY}
          stroke="hsl(var(--destructive))"
          strokeOpacity={0.35}
          strokeDasharray="3 3"
          strokeWidth={0.75}
        />
        <text
          x={VB_W - PAD_R}
          y={cutY - 3}
          textAnchor="end"
          fontSize={8}
          fill="hsl(var(--destructive))"
          fillOpacity={0.65}
          className="uppercase tracking-wider"
        >
          Advance cut
        </text>

        {tickYears.map((y) => {
          const x = PAD_L + ((y - minYear) / Math.max(1, maxYear - minYear)) * PLOT_W;
          return (
            <text
              key={`tick-${y}`}
              x={x}
              y={VB_H - 6}
              textAnchor={y === minYear ? "start" : y === maxYear ? "end" : "middle"}
              fontSize={9}
              fill="hsl(var(--muted-foreground))"
              className="font-mono tabular-nums"
            >
              {y}
            </text>
          );
        })}

        {segments.map((seg, i) =>
          reduced ? (
            <path
              key={`seg-${i}`}
              d={pathD(seg)}
              fill="none"
              stroke="hsl(var(--foreground))"
              strokeOpacity={0.55}
              strokeWidth={1}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            <motion.path
              key={`seg-${i}`}
              d={pathD(seg)}
              fill="none"
              stroke="hsl(var(--foreground))"
              strokeOpacity={0.55}
              strokeWidth={1}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.55, ease: "easeOut" }}
            />
          )
        )}

        {points.map((p) => {
          if (p.missed || !p.win) return null;
          return (
            <circle key={`dot-${p.year}`} cx={p.x} cy={p.y} r={2.5} fill={WIN_COLOR}>
              <title>{`${p.year}: won regional`}</title>
            </circle>
          );
        })}

        {ncaa.segments.map((seg, i) =>
          reduced ? (
            <path
              key={`ncaa-seg-${i}`}
              d={pathD(seg)}
              fill="none"
              stroke={WIN_COLOR}
              strokeOpacity={0.4}
              strokeWidth={0.75}
              strokeDasharray="2 3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            <motion.path
              key={`ncaa-seg-${i}`}
              d={pathD(seg)}
              fill="none"
              stroke={WIN_COLOR}
              strokeOpacity={0.4}
              strokeWidth={0.75}
              strokeDasharray="2 3"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.55, ease: "easeOut", delay: 0.1 }}
            />
          )
        )}
        {ncaa.points.map((p) => {
          if (p.missed || !p.win) return null;
          return (
            <circle
              key={`ncaa-dot-${p.year}`}
              cx={p.x}
              cy={p.y}
              r={3}
              fill={WIN_COLOR}
              stroke="hsl(var(--card))"
              strokeWidth={0.75}
            >
              <title>{`NCAA ${p.year}: won championship`}</title>
            </circle>
          );
        })}

        {/* Hover crosshair + highlight dots — rendered last so they sit on top. */}
        {hoveredRegional && !hoveredRegional.missed && (
          <>
            <line
              x1={hoveredRegional.x}
              x2={hoveredRegional.x}
              y1={PAD_T}
              y2={PAD_T + PLOT_H}
              stroke="hsl(var(--foreground))"
              strokeOpacity={0.25}
              strokeWidth={0.75}
              strokeDasharray="2 2"
            />
            <circle
              cx={hoveredRegional.x}
              cy={hoveredRegional.y}
              r={3.5}
              fill="hsl(var(--foreground))"
              fillOpacity={0.9}
            />
            {hoveredNcaa && !hoveredNcaa.missed && (
              <circle
                cx={hoveredNcaa.x}
                cy={hoveredNcaa.y}
                r={3.5}
                fill={WIN_COLOR}
                stroke="hsl(var(--card))"
                strokeWidth={0.75}
              />
            )}
          </>
        )}
      </svg>

      {/* Floating tooltip — positioned above the SVG, anchored to the crosshair. */}
      {hoveredRegional !== undefined && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border border-border/80 bg-background/95 backdrop-blur px-2 py-1.5 text-[11px] shadow-sm"
          style={{
            left: `calc(${tooltipLeftPct}% * (100% - 2rem) / 100% + 1rem)`,
            top: 6,
          }}
        >
          <div className="font-mono tabular-nums text-foreground font-medium">
            {hoveredRegional.year}
          </div>
          <div className="text-text-tertiary">
            Regional:{" "}
            <span className="text-foreground font-mono tabular-nums">
              {hoveredRegional.missed
                ? "did not make"
                : hoveredRegional.position}
            </span>
            {!hoveredRegional.missed && hoveredRegional.advanced && (
              <span className="ml-1 text-emerald-400">→ advanced</span>
            )}
            {!hoveredRegional.missed && hoveredRegional.win && (
              <span className="ml-1 text-amber-300">· won</span>
            )}
          </div>
          {hoveredNcaa && !hoveredNcaa.missed && (
            <div className="text-text-tertiary">
              NCAA:{" "}
              <span className="text-foreground font-mono tabular-nums">
                {hoveredNcaa.position}
              </span>
              {hoveredNcaa.win && (
                <span className="ml-1 text-amber-300">· won championship</span>
              )}
              {hoveredNcaa.advanced && !hoveredNcaa.win && (
                <span className="ml-1 text-emerald-400">· match-play</span>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-text-tertiary">
        <span>Line: regional finish (lower = better)</span>
        <span>·</span>
        <span className="inline-flex items-center gap-1">
          <span
            aria-hidden="true"
            className="inline-block h-[5px] w-[5px] rounded-full"
            style={{ background: WIN_COLOR }}
          />
          regional win
        </span>
        {ncaa.points.length > 0 && (
          <>
            <span>·</span>
            <span>dotted: NCAA finish</span>
          </>
        )}
      </div>
    </div>
  );
}
