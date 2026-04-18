"use client";

import { motion } from "framer-motion";
import { useReducedMotion } from "@/lib/animations";

interface YearResult {
  year: number;
  position: string;
  advanced: boolean;
  missed?: boolean;
}

export default function RegionalTimeline({ results }: { results: YearResult[] }) {
  const reduced = useReducedMotion();

  const content = (
    <div
      dir="rtl"
      className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-1.5"
    >
      {results.map((r) => {
        const boxClass = r.advanced
          ? "rounded border border-emerald-500/30 bg-emerald-500/5 px-1.5 py-1 text-center transition-colors hover:border-emerald-400/70 hover:bg-emerald-500/10"
          : r.missed
            ? "rounded border border-rose-500/30 bg-rose-500/5 px-1.5 py-1 text-center transition-colors hover:border-rose-400/70 hover:bg-rose-500/10"
            : "rounded border border-border/40 bg-card px-1.5 py-1 text-center transition-colors hover:border-border-medium";
        const posClass = r.advanced
          ? "font-semibold text-emerald-300"
          : r.missed
            ? "font-semibold text-rose-300"
            : "text-foreground/85";
        return (
          <div key={r.year} dir="ltr" className={boxClass}>
            <div className="text-[10px] text-muted-foreground font-mono tabular-nums">
              {r.year}
            </div>
            <div className="text-[12px] font-mono tabular-nums">
              <span className={posClass}>{r.position}</span>
            </div>
          </div>
        );
      })}
    </div>
  );

  if (reduced) return content;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
    >
      {content}
    </motion.div>
  );
}
