"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import { useReducedMotion } from "@/lib/animations";

interface YearResult {
  year: number;
  position: string;
  advanced: boolean;
  missed?: boolean;
}

export interface NcaaYearResult {
  year: number;
  /** Stroke-play finish ignoring ties; null when MC or missing. */
  positionNoTies: number | null;
  /** Whether the program was at the Championship that year. */
  appeared: boolean;
  /** Position string as shown ("1", "T3", "10", "MC"). */
  position: string;
  /** Won the championship. */
  win: boolean;
  /** Reached match-play (top 8). */
  advanced: boolean;
  /** Made the 54-hole cut (top 15). */
  madeCut: boolean;
}

// Regionals advancement cutoff: top 5 in each regional advance to nationals.
const ADVANCEMENT_CUT = 5;
// Plot geometry. Viewport is scaled responsively via width="100%".
const VB_W = 800;
const VB_H = 110;
const PAD_L = 32;
const PAD_R = 12;
const PAD_T = 12;
const PAD_B = 22;
const PLOT_W = VB_W - PAD_L - PAD_R;
const PLOT_H = VB_H - PAD_T - PAD_B;
// Position range we map to the y-axis. 1 = top, 15 = bottom (worse than cut
// by a safe margin). Teams outside this range are clamped so the chart stays
// readable — detail lives in the grid below.
const POS_MIN = 1;
const POS_MAX = 15;

// Win tone: warm sand/gold within the sub-brand's allowed palette.
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

export default function ProgramArc({
  timeline,
  ncaaTimeline,
}: {
  timeline: YearResult[];
  /**
   * Optional second series showing NCAA Championship finish per year. When
   * provided, a gold line overlays the primary regional arc, rendering the
   * dual story ("made regionals AND went deep at nationals"). If absent,
   * behavior is unchanged from the original chart.
   */
  ncaaTimeline?: NcaaYearResult[];
}) {
  const reduced = useReducedMotion();

  const { points, segments, minYear, maxYear } = useMemo(() => {
    if (timeline.length === 0) {
      return {
        points: [] as PlotPoint[],
        segments: [] as PlotPoint[][],
        minYear: 0,
        maxYear: 0,
      };
    }
    // Timeline arrives in descending year order; sort ascending for the x-axis.
    const sorted = [...timeline].sort((a, b) => a.year - b.year);
    const minY = sorted[0].year;
    const maxY = sorted[sorted.length - 1].year;
    const span = Math.max(1, maxY - minY);

    const pts: PlotPoint[] = [];
    for (const r of sorted) {
      const x = PAD_L + ((r.year - minY) / span) * PLOT_W;
      if (r.missed) {
        // Missed year — rendered as a gap, no dot.
        pts.push({
          year: r.year,
          x,
          y: PAD_T + PLOT_H, // placeholder, not drawn on path
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
      const y =
        PAD_T +
        ((clamped - POS_MIN) / (POS_MAX - POS_MIN)) * PLOT_H;
      pts.push({
        year: r.year,
        x,
        y,
        pos: clamped,
        position: r.position,
        advanced: r.advanced,
        win: r.position === "1",
        missed: false,
      });
    }

    // Segment the line across missed years so gaps break, not interpolate.
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

  // Second series — NCAA finish. Shares x-axis with the regionals line by
  // reusing minYear/maxYear. Points that missed the cut pin to POS_MAX so
  // the line still conveys "they were there, but way outside the top 5."
  const ncaa = useMemo(() => {
    if (!ncaaTimeline || ncaaTimeline.length === 0 || maxYear === minYear) {
      return { points: [] as PlotPoint[], segments: [] as PlotPoint[][] };
    }
    const span = Math.max(1, maxYear - minYear);
    const pts: PlotPoint[] = [];
    for (const r of ncaaTimeline) {
      if (r.year < minYear || r.year > maxYear) continue;
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
      const y =
        PAD_T +
        ((clamped - POS_MIN) / (POS_MAX - POS_MIN)) * PLOT_H;
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
    return { points: pts, segments: segs };
  }, [ncaaTimeline, minYear, maxYear]);

  if (points.length === 0) return null;

  const cutY =
    PAD_T +
    ((ADVANCEMENT_CUT - POS_MIN) / (POS_MAX - POS_MIN)) * PLOT_H;

  const pathD = (seg: PlotPoint[]) => {
    if (seg.length === 0) return "";
    if (seg.length === 1) {
      // Degenerate single-point "line" — nudge x by 0.5 so path renders.
      const p = seg[0];
      return `M ${p.x - 0.25} ${p.y} L ${p.x + 0.25} ${p.y}`;
    }
    return seg
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(" ");
  };

  // Year tick labels: start, middle-ish, end.
  const midYear = Math.round((minYear + maxYear) / 2);
  const tickYears = Array.from(new Set([minYear, midYear, maxYear])).sort(
    (a, b) => a - b
  );

  return (
    <div className="ring-card shadow-flat hover:shadow-raised transition-shadow duration-150 ease-out p-3 sm:p-4">
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        width="100%"
        height="auto"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Regional finish per year, ${minYear} to ${maxYear}. Lower line = better finish. Gold = win, green = advanced, muted = other.`}
        className="block overflow-visible"
      >
        <title>
          Program arc — best regional finish per year ({minYear}-{maxYear})
        </title>

        {/* Left-edge y-axis labels */}
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

        {/* Advancement cut — dashed destructive line at 5th place */}
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

        {/* X-axis tick labels */}
        {tickYears.map((y) => {
          const x =
            PAD_L +
            ((y - minYear) / Math.max(1, maxYear - minYear)) * PLOT_W;
          return (
            <text
              key={`tick-${y}`}
              x={x}
              y={VB_H - 6}
              textAnchor={
                y === minYear ? "start" : y === maxYear ? "end" : "middle"
              }
              fontSize={9}
              fill="hsl(var(--muted-foreground))"
              className="font-mono tabular-nums"
            >
              {y}
            </text>
          );
        })}

        {/* Line segments */}
        {segments.map((seg, i) =>
          reduced ? (
            <path
              key={`seg-${i}`}
              d={pathD(seg)}
              fill="none"
              stroke="hsl(var(--foreground))"
              strokeOpacity={0.65}
              strokeWidth={1.25}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            <motion.path
              key={`seg-${i}`}
              d={pathD(seg)}
              fill="none"
              stroke="hsl(var(--foreground))"
              strokeOpacity={0.65}
              strokeWidth={1.25}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.55, ease: "easeOut" }}
            />
          )
        )}

        {/* Dots: win = gold r=5, advanced = emerald r=3.5, others = muted r=2 */}
        {points.map((p) => {
          if (p.missed) return null;
          const r = p.win ? 5 : p.advanced ? 3.5 : 2;
          const fill = p.win
            ? WIN_COLOR
            : p.advanced
              ? "hsl(var(--primary))"
              : "hsl(var(--muted-foreground))";
          const stroke = p.win
            ? "hsl(var(--card))"
            : undefined;
          return (
            <circle
              key={`dot-${p.year}`}
              cx={p.x}
              cy={p.y}
              r={r}
              fill={fill}
              stroke={stroke}
              strokeWidth={stroke ? 0.75 : 0}
            >
              <title>
                {p.year}: {p.win ? "won regional" : p.advanced ? `${p.position} (advanced)` : p.position}
              </title>
            </circle>
          );
        })}

        {/* Optional NCAA Championship overlay — gold line + dots */}
        {ncaa.segments.map((seg, i) =>
          reduced ? (
            <path
              key={`ncaa-seg-${i}`}
              d={pathD(seg)}
              fill="none"
              stroke={WIN_COLOR}
              strokeOpacity={0.55}
              strokeWidth={1.25}
              strokeDasharray="2 2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            <motion.path
              key={`ncaa-seg-${i}`}
              d={pathD(seg)}
              fill="none"
              stroke={WIN_COLOR}
              strokeOpacity={0.55}
              strokeWidth={1.25}
              strokeDasharray="2 2"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.55, ease: "easeOut", delay: 0.1 }}
            />
          )
        )}
        {ncaa.points.map((p) => {
          if (p.missed) return null;
          const r = p.win ? 4.5 : p.advanced ? 3 : 2;
          return (
            <circle
              key={`ncaa-dot-${p.year}`}
              cx={p.x}
              cy={p.y}
              r={r}
              fill={WIN_COLOR}
              fillOpacity={p.win ? 1 : 0.75}
              stroke="hsl(var(--card))"
              strokeWidth={p.win ? 0.75 : 0.4}
            >
              <title>
                NCAA {p.year}:{" "}
                {p.win
                  ? "won championship"
                  : p.advanced
                    ? `${p.position} (match play)`
                    : p.position}
              </title>
            </circle>
          );
        })}
      </svg>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span
            aria-hidden="true"
            className="inline-block h-[6px] w-[6px] rounded-full"
            style={{ background: WIN_COLOR }}
          />
          Regional win
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            aria-hidden="true"
            className="inline-block h-[5px] w-[5px] rounded-full bg-primary"
          />
          Advanced
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            aria-hidden="true"
            className="inline-block h-[4px] w-[4px] rounded-full bg-muted-foreground"
          />
          Made regional
        </span>
        {ncaa.points.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <span
              aria-hidden="true"
              className="inline-block h-[1px] w-[10px]"
              style={{
                background: WIN_COLOR,
                opacity: 0.55,
                borderBottom: `1px dashed ${WIN_COLOR}`,
              }}
            />
            NCAA finish
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <span
            aria-hidden="true"
            className="inline-block h-[1px] w-[10px] bg-destructive/40"
          />
          Advance cut
        </span>
      </div>
    </div>
  );
}
