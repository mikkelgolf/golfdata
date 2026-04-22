"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/lib/animations";
import { getTeam, type Gender } from "@/lib/head-to-head";

// ---------------------------------------------------------------------------
// Common-opponents strip
//
// For every opponent BOTH teams played this season, render one column:
//   - Opponent name (11px, monospace tabular-nums)
//   - Upper dot  = teamA's H2H result vs this opponent
//   - Lower dot  = teamB's H2H result vs this opponent
//   - Dot colors: primary win / destructive loss / muted tie (hollow) /
//     transparent didn't-play.
//
// Data comes from the pre-aggregated head-to-head-2526.json via getTeam(),
// the same primitive head-to-head-matrix.tsx consumes. Intersection is the
// set of opponent board-names present in BOTH teams' opponents records.
// ---------------------------------------------------------------------------

interface CommonOpponentsProps {
  teamA: string | null;
  teamB: string | null;
  gender: Gender;
}

type DotState = "win" | "loss" | "tie" | "none";

interface CommonOpponentCell {
  opponent: string;
  a: DotState;
  b: DotState;
  aLabel: string; // "W" / "L" / "T" for title tooltips
  bLabel: string;
  aRec: string; // "2-0" summary per opponent for title tooltip
  bRec: string;
}

function stateOf(rec: { wins: number; losses: number; ties: number } | undefined): DotState {
  if (!rec) return "none";
  if (rec.wins > rec.losses) return "win";
  if (rec.wins < rec.losses) return "loss";
  if (rec.wins === 0 && rec.losses === 0 && rec.ties === 0) return "none";
  return "tie";
}

function recString(rec: { wins: number; losses: number; ties: number } | undefined): string {
  if (!rec) return "-";
  if (rec.ties > 0) return `${rec.wins}-${rec.losses}-${rec.ties}`;
  return `${rec.wins}-${rec.losses}`;
}

export default function CommonOpponents({
  teamA,
  teamB,
  gender,
}: CommonOpponentsProps) {
  const reduced = useReducedMotion();

  const data = useMemo(() => {
    if (!teamA || !teamB) return null;
    const a = getTeam(teamA, gender);
    const b = getTeam(teamB, gender);
    if (!a || !b) return null;

    const aOpps = a.opponents;
    const bOpps = b.opponents;

    // Intersect: an opponent both teams played (neither side is the other team).
    const common: CommonOpponentCell[] = [];
    for (const name of Object.keys(aOpps)) {
      if (name === teamB) continue;
      if (!(name in bOpps)) continue;
      const aRec = aOpps[name];
      const bRec = bOpps[name];
      // If neither side actually has meetings, skip.
      if ((!aRec || aRec.meetings === 0) && (!bRec || bRec.meetings === 0)) continue;

      common.push({
        opponent: name,
        a: stateOf(aRec),
        b: stateOf(bRec),
        aLabel: aRec ? `${aRec.wins}W ${aRec.losses}L${aRec.ties ? ` ${aRec.ties}T` : ""}` : "—",
        bLabel: bRec ? `${bRec.wins}W ${bRec.losses}L${bRec.ties ? ` ${bRec.ties}T` : ""}` : "—",
        aRec: recString(aRec),
        bRec: recString(bRec),
      });
    }

    // Sort: opponents both teams played first (neither "none"), then alpha.
    common.sort((x, y) => {
      const xFull = x.a !== "none" && x.b !== "none" ? 0 : 1;
      const yFull = y.a !== "none" && y.b !== "none" ? 0 : 1;
      if (xFull !== yFull) return xFull - yFull;
      return x.opponent.localeCompare(y.opponent);
    });

    // Aggregate summary scoped to common-opponent meetings only.
    let aWins = 0;
    let aLosses = 0;
    let bWins = 0;
    let bLosses = 0;
    for (const c of common) {
      const aRec = aOpps[c.opponent];
      const bRec = bOpps[c.opponent];
      if (aRec) {
        aWins += aRec.wins;
        aLosses += aRec.losses;
      }
      if (bRec) {
        bWins += bRec.wins;
        bLosses += bRec.losses;
      }
    }

    return {
      cells: common,
      summary: {
        a: `${aWins}-${aLosses}`,
        b: `${bWins}-${bLosses}`,
        aEdge: aWins > aLosses ? "primary" : aWins < aLosses ? "destructive" : "neutral",
        bEdge: bWins > bLosses ? "primary" : bWins < bLosses ? "destructive" : "neutral",
      },
    };
  }, [teamA, teamB, gender]);

  if (!teamA || !teamB || !data || data.cells.length === 0) {
    return null;
  }

  const shapeInitial = reduced ? false : { opacity: 0, y: 8 };
  const shapeAnimate = { opacity: 1, y: 0 };

  return (
    <motion.section
      initial={shapeInitial}
      animate={shapeAnimate}
      transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
      className="ring-card shadow-flat px-3 py-3 sm:px-4 sm:py-3"
      aria-label="Common opponents"
    >
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Common opponents
        </p>
        <div className="flex items-center gap-2 text-[11px] font-mono tabular-nums">
          <span className="text-text-tertiary truncate max-w-[120px]" title={teamA}>
            {teamA}
          </span>
          <span
            className={cn(
              "px-1.5 py-[1px] rounded",
              data.summary.aEdge === "primary" && "bg-primary/15 text-primary",
              data.summary.aEdge === "destructive" && "bg-destructive/15 text-destructive",
              data.summary.aEdge === "neutral" && "bg-muted/30 text-muted-foreground"
            )}
          >
            {data.summary.a}
          </span>
          <span className="text-muted-foreground/50">vs</span>
          <span
            className={cn(
              "px-1.5 py-[1px] rounded",
              data.summary.bEdge === "primary" && "bg-primary/15 text-primary",
              data.summary.bEdge === "destructive" && "bg-destructive/15 text-destructive",
              data.summary.bEdge === "neutral" && "bg-muted/30 text-muted-foreground"
            )}
          >
            {data.summary.b}
          </span>
          <span className="text-text-tertiary truncate max-w-[120px] text-right" title={teamB}>
            {teamB}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto -mx-1 px-1">
        <div className="flex items-stretch gap-1 min-w-max">
          {data.cells.map((c, idx) => (
            <OpponentColumn
              key={c.opponent}
              cell={c}
              teamA={teamA}
              teamB={teamB}
              idx={idx}
              reduced={reduced}
            />
          ))}
        </div>
      </div>
    </motion.section>
  );
}

// ---------------------------------------------------------------------------
// Single column (one opponent)
// ---------------------------------------------------------------------------

function OpponentColumn({
  cell,
  teamA,
  teamB,
  idx,
  reduced,
}: {
  cell: CommonOpponentCell;
  teamA: string;
  teamB: string;
  idx: number;
  reduced: boolean;
}) {
  const title =
    `${cell.opponent}\n` +
    `${teamA}: ${cell.aRec}\n` +
    `${teamB}: ${cell.bRec}`;

  const abbr = abbreviate(cell.opponent);

  const initial = reduced ? false : { opacity: 0, scale: 0.94 };
  const animate = { opacity: 1, scale: 1 };

  return (
    <motion.div
      initial={initial}
      animate={animate}
      transition={{
        duration: 0.22,
        ease: "easeOut",
        delay: reduced ? 0 : idx * 0.02,
      }}
      title={title}
      className={cn(
        "ring-card shadow-flat hover:shadow-raised transition-shadow duration-150 ease-out",
        "flex flex-col items-center justify-between",
        "w-[44px] shrink-0 px-1 py-1.5"
      )}
    >
      <Dot state={cell.a} />
      <Dot state={cell.b} />
      <span className="mt-1 block w-full text-center font-mono tabular-nums text-[10px] leading-tight text-muted-foreground truncate">
        {abbr}
      </span>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Dot
// ---------------------------------------------------------------------------

function Dot({ state }: { state: DotState }) {
  // Pure SVG — no CSS animation, no pulse, no glow.
  const size = 10;
  const cx = size / 2;
  const cy = size / 2;
  const r = 3.5;

  if (state === "none") {
    return (
      <svg width={size} height={size} aria-hidden="true" className="block">
        <circle cx={cx} cy={cy} r={r} fill="transparent" stroke="transparent" />
      </svg>
    );
  }

  if (state === "tie") {
    return (
      <svg width={size} height={size} aria-hidden="true" className="block">
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="transparent"
          stroke="hsl(var(--muted-foreground))"
          strokeWidth={1.25}
        />
      </svg>
    );
  }

  const fill =
    state === "win" ? "hsl(var(--primary))" : "hsl(var(--destructive))";

  return (
    <svg width={size} height={size} aria-hidden="true" className="block">
      <circle cx={cx} cy={cy} r={r} fill={fill} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Abbreviation — mirrors head-to-head-matrix.tsx so same strings render.
// ---------------------------------------------------------------------------

function abbreviate(name: string): string {
  const abbrevs: Record<string, string> = {
    "Oklahoma State": "OKST",
    "Arizona State": "ASU",
    "Georgia Tech": "GT",
    "North Carolina": "UNC",
    "Texas Tech": "TTU",
    "Texas A&M": "TAMU",
    "South Carolina": "SCAR",
    "Ohio State": "OSU",
    "Michigan State": "MSU",
    "Kennesaw State": "KSU",
    "Florida State": "FSU",
    "Wake Forest": "WAKE",
    "Old Dominion": "ODU",
    "East Tennessee State": "ETSU",
    "Sam Houston": "SHSU",
    "New Mexico": "UNM",
    "San Diego State": "SDSU",
    "Southern California": "USC",
    "Coastal Carolina": "CCU",
    "South Florida": "USF",
    "Kansas State": "KST",
    "San Jose State": "SJSU",
  };
  if (abbrevs[name]) return abbrevs[name];
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) {
    return words
      .slice(0, 4)
      .map((w) => w[0])
      .join("")
      .toUpperCase();
  }
  return name.slice(0, 4).toUpperCase();
}
