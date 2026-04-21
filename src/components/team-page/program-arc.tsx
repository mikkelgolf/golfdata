"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import { useReducedMotion } from "@/lib/animations";
import { isRegionalWin } from "@/lib/streaks";

interface YearResult {
  year: number;
  position: string;
  advanced: boolean;
  missed?: boolean;
  /** Year cancelled at the NCAA level (e.g., 2020 COVID). Skipped from the
   *  arc entirely — the line bridges straight across as if the year didn't
   *  exist, because logically the program's streak does. */
  cancelled?: boolean;
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
  /** Cancelled year — skipped from the line. */
  cancelled?: boolean;
}

// Regionals advancement cutoff: top 5 in each regional advance to nationals.
const ADVANCEMENT_CUT = 5;
// Plot geometry. The SVG is sized to fill a CSS-controlled aspect-box, so we
// pick a viewBox tall enough that the line has vertical breathing room
// without squashing on narrow viewports.
const VB_W = 800;
const VB_H = 240;
const PAD_L = 32;
const PAD_R = 12;
const PAD_T = 16;
const PAD_B = 26;
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
      // Cancelled years are skipped entirely — the line connects the points
      // on either side without a break, reflecting that the program's
      // continuity wasn't actually interrupted.
      if (r.cancelled) continue;
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
        win: isRegionalWin(r.position),
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

  const titleText = `Program arc — best regional finish per year (${minYear}-${maxYear})`;

  return (
    <div className="rounded-lg border border-border/60 bg-card/40 px-3 py-3 sm:px-4 sm:py-3">
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Regional finish per year, ${minYear} to ${maxYear}. Lower line = better finish.`}
        className="block w-full h-[110px] sm:h-[140px] overflow-visible"
      >
        <title>{titleText}</title>

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

        {/* Single thin line — no fill, no gradient. */}
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

        {/* Win-year markers only. Everything else is the line. */}
        {points.map((p) => {
          if (p.missed || !p.win) return null;
          return (
            <circle
              key={`dot-${p.year}`}
              cx={p.x}
              cy={p.y}
              r={2.5}
              fill={WIN_COLOR}
            >
              <title>{`${p.year}: won regional`}</title>
            </circle>
          );
        })}

        {/* NCAA Championship overlay — single dotted gold line, NCAA-win dots only. */}
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
      </svg>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-text-tertiary">
        <span>Line: regional finish (lower = better)</span>
        <span>·</span>
        <span className="inline-flex items-center gap-1">
          <span aria-hidden="true" className="inline-block h-[5px] w-[5px] rounded-full" style={{ background: WIN_COLOR }} />
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
