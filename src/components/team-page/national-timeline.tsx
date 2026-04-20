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
  /** Year was cancelled at the NCAA level (e.g., 2020 COVID). Distinct from
   *  `missed` — the team didn't fail to appear, the event wasn't held. */
  cancelled?: boolean;
  /** Which match-play round the team lost in. Null for champions (already
   *  covered by the trophy), teams that didn't reach match play, and
   *  pre-match-play-era years. "qf" = lost quarterfinals, "sf" = won QF but
   *  lost semifinals, "r" = reached the final (runner-up). */
  matchPlayResult?: "qf" | "sf" | "r" | null;
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
        // Neutral cells. Wins get a faint amber wash since the trophy is the
        // story; everything else stays monochrome with semantic text colour.
        const boxClass = r.win
          ? "rounded-sm border border-amber-400/40 bg-amber-400/[0.06] px-1.5 py-0.5 text-center transition-colors duration-100"
          : r.cancelled
            ? "rounded-sm border border-dashed border-border/40 bg-card/20 px-1.5 py-0.5 text-center transition-colors duration-100"
            : r.missed
              ? "rounded-sm border border-dashed border-border/30 bg-card/30 px-1.5 py-0.5 text-center transition-colors duration-100"
              : "rounded-sm border border-border/40 bg-card/40 px-1.5 py-0.5 text-center transition-colors duration-100 hover:border-border-medium";
        const posClass = r.win
          ? "text-amber-300"
          : r.cancelled
            ? "text-text-tertiary/60"
            : r.matchPlay
              ? "text-emerald-400"
              : r.madeCut
                ? "text-foreground/80"
                : r.missedCut
                  ? "text-rose-400/80"
                  : "text-text-tertiary";
        const cellTitle = r.cancelled
          ? "No NCAA Championship (COVID-19)"
          : undefined;

        // Match-play badge: only shown for non-champion qualifiers. Trophy
        // covers champions; DNQ / pre-match-play-era / cancelled years have
        // matchPlayResult = null and show nothing here.
        const mpr = r.matchPlayResult ?? null;
        const badgeText =
          mpr === "r" ? "R" : mpr === "sf" ? "SF" : mpr === "qf" ? "QF" : null;
        const badgeClass =
          mpr === "r"
            ? "text-amber-500"
            : mpr === "sf"
              ? "text-sky-400"
              : mpr === "qf"
                ? "text-emerald-400"
                : "";
        const badgeLabel =
          mpr === "r"
            ? "Runner-up"
            : mpr === "sf"
              ? "Semifinalist"
              : mpr === "qf"
                ? "Quarterfinalist"
                : undefined;

        const cellInner = (
          <>
            <div className="text-[10px] text-text-tertiary font-mono tabular-nums flex items-center justify-center gap-0.5 leading-tight">
              <span>{r.year}</span>
              {r.win ? (
                <Trophy
                  className="h-2.5 w-2.5 text-amber-300"
                  aria-hidden="true"
                />
              ) : badgeText ? (
                <span
                  className={`text-[9px] font-semibold font-mono leading-none ${badgeClass}`}
                  aria-label={badgeLabel}
                  title={badgeLabel}
                >
                  {badgeText}
                </span>
              ) : null}
            </div>
            <div className="text-[12px] font-mono tabular-nums leading-tight">
              <span className={posClass}>{r.missed || r.cancelled ? "—" : r.position}</span>
            </div>
          </>
        );

        if (reduced) {
          return (
            <div key={r.year} dir="ltr" className={boxClass} title={cellTitle}>
              {cellInner}
            </div>
          );
        }

        return (
          <motion.div
            key={r.year}
            dir="ltr"
            className={boxClass}
            title={cellTitle}
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
          className="text-[9px] font-semibold font-mono leading-none text-amber-500"
        >
          R
        </span>
        Runner-up
      </span>
      <span className="inline-flex items-center gap-1">
        <span
          aria-hidden="true"
          className="text-[9px] font-semibold font-mono leading-none text-sky-400"
        >
          SF
        </span>
        Semifinalist
      </span>
      <span className="inline-flex items-center gap-1">
        <span
          aria-hidden="true"
          className="text-[9px] font-semibold font-mono leading-none text-emerald-400"
        >
          QF
        </span>
        Quarterfinalist
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
