"use client";

import { Trophy } from "lucide-react";
import { motion } from "framer-motion";
import { useReducedMotion } from "@/lib/animations";

export interface NationalYearResult {
  year: number;
  /** "1" / "T3" / "10" / "MC" / "--" */
  position: string;
  win: boolean;
  /** Reached the post-2009 match-play bracket (top 8). */
  matchPlay: boolean;
  /** Made the 54-hole cut but didn't reach match play (pre-2009 too). */
  madeCut: boolean;
  /** Position === "MC". */
  missedCut: boolean;
  /** No NCAA appearance at all that year. */
  missed: boolean;
}

export default function NationalTimeline({
  results,
}: {
  results: NationalYearResult[];
}) {
  const reduced = useReducedMotion();

  const gridInner = (
    <div
      dir="rtl"
      className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-1.5"
    >
      {results.map((r, idx) => {
        let boxClass: string;
        let posClass: string;
        if (r.win) {
          boxClass =
            "rounded border border-amber-400/60 bg-amber-400/10 px-1.5 py-1 text-center transition-shadow duration-150 ease-out hover:shadow-raised hover:border-amber-300/80 hover:bg-amber-400/20";
          posClass = "font-semibold text-amber-300";
        } else if (r.matchPlay) {
          boxClass =
            "rounded border border-primary/40 bg-primary/5 px-1.5 py-1 text-center transition-shadow duration-150 ease-out hover:shadow-raised hover:border-primary/70 hover:bg-primary/10";
          posClass = "font-semibold text-primary";
        } else if (r.madeCut) {
          boxClass =
            "rounded border border-primary/20 bg-card px-1.5 py-1 text-center transition-shadow duration-150 ease-out hover:shadow-raised hover:border-primary/40";
          posClass = "text-foreground/85";
        } else if (r.missedCut) {
          boxClass =
            "rounded border border-rose-500/30 bg-rose-500/5 px-1.5 py-1 text-center transition-shadow duration-150 ease-out hover:shadow-raised hover:border-rose-400/60";
          posClass = "text-rose-300/90";
        } else {
          // Didn't appear at NCAAs that year.
          boxClass =
            "rounded border border-dashed border-border/30 bg-card/40 px-1.5 py-1 text-center transition-shadow duration-150 ease-out hover:border-border-medium";
          posClass = "text-muted-foreground/50";
        }

        const cellInner = (
          <>
            <div className="text-[10px] text-muted-foreground font-mono tabular-nums flex items-center justify-center gap-0.5">
              {r.win && (
                <Trophy
                  className="h-2.5 w-2.5 text-amber-300"
                  aria-hidden="true"
                />
              )}
              <span>{r.year}</span>
            </div>
            <div className="text-[12px] font-mono tabular-nums">
              <span className={posClass}>{r.missed ? "—" : r.position}</span>
            </div>
          </>
        );

        if (reduced) {
          return (
            <div key={r.year} dir="ltr" className={boxClass}>
              {cellInner}
            </div>
          );
        }

        return (
          <motion.div
            key={r.year}
            dir="ltr"
            className={boxClass}
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              duration: 0.22,
              ease: "easeOut",
              delay: idx * 0.012,
            }}
          >
            {cellInner}
          </motion.div>
        );
      })}
    </div>
  );

  const legend = (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-tertiary">
      <span className="inline-flex items-center gap-1">
        <Trophy className="h-3 w-3 text-amber-300" aria-hidden="true" />
        won championship
      </span>
      <span className="inline-flex items-center gap-1">
        <span
          aria-hidden="true"
          className="inline-block h-[6px] w-[6px] rounded-sm bg-primary/70"
        />
        reached match-play (top 8)
      </span>
      <span className="inline-flex items-center gap-1">
        <span
          aria-hidden="true"
          className="inline-block h-[6px] w-[6px] rounded-sm border border-primary/40"
        />
        made cut
      </span>
      <span className="inline-flex items-center gap-1">
        <span
          aria-hidden="true"
          className="inline-block h-[6px] w-[6px] rounded-sm bg-rose-500/60"
        />
        missed cut
      </span>
      <span className="inline-flex items-center gap-1">
        <span
          aria-hidden="true"
          className="inline-block h-[6px] w-[6px] rounded-sm border border-dashed border-border/60"
        />
        no appearance
      </span>
    </div>
  );

  if (reduced) {
    return (
      <div>
        {gridInner}
        {legend}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
    >
      {gridInner}
      {legend}
    </motion.div>
  );
}
