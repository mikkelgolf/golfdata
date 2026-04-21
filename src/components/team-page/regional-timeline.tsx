"use client";

import { Medal } from "lucide-react";
import { motion } from "framer-motion";
import { useReducedMotion } from "@/lib/animations";

interface YearResult {
  year: number;
  position: string;
  advanced: boolean;
  missed?: boolean;
  cancelled?: boolean;
  /** Finished 1st (solo or tied) at the Regional. */
  win?: boolean;
}

export default function RegionalTimeline({ results }: { results: YearResult[] }) {
  const reduced = useReducedMotion();

  const gridInner = (
    <div
      dir="rtl"
      className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-1.5"
    >
      {results.map((r, idx) => {
        // Regional winners (finished 1st, solo or tied) get the same amber
        // wash as NCAA champions for visual parity. Otherwise neutral cells
        // with colour in the position number alone. Cancelled years (e.g.,
        // 2020 COVID) render with a dashed border + muted tone so they can't
        // be misread as a miss.
        const boxClass = r.win
          ? "rounded-sm border border-amber-400/40 bg-amber-400/[0.06] px-1.5 py-0.5 text-center transition-colors duration-100"
          : r.cancelled
            ? "rounded-sm border border-dashed border-border/40 bg-card/20 px-1.5 py-0.5 text-center transition-colors duration-100"
            : "rounded-sm border border-border/40 bg-card/40 px-1.5 py-0.5 text-center transition-colors duration-100 hover:border-border-medium";
        const posClass = r.win
          ? "text-amber-300"
          : r.cancelled
            ? "text-text-tertiary/60"
            : r.advanced
              ? "text-emerald-400"
              : r.missed
                ? "text-rose-400/80"
                : "text-foreground/80";
        const cellTitle = r.cancelled
          ? "No NCAA postseason (COVID-19)"
          : undefined;

        const cellInner = (
          <>
            <div className="text-[10px] text-text-tertiary font-mono tabular-nums flex items-center justify-center gap-0.5 leading-tight">
              <span>{r.year}</span>
              {r.win ? (
                <Medal
                  className="h-2.5 w-2.5 text-amber-300"
                  aria-hidden="true"
                />
              ) : null}
            </div>
            <div className="text-[12px] font-mono tabular-nums leading-tight">
              <span className={posClass}>{r.cancelled ? "—" : r.position}</span>
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

  if (reduced) return gridInner;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
    >
      {gridInner}
    </motion.div>
  );
}
