"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import TeamMonogram from "@/components/team-page/team-monogram";
import type { Gender } from "@/data/records-types";
import { teamHref } from "@/lib/team-link";
import { useReducedMotion } from "@/lib/animations";

/**
 * One row per year. `winners` is the ordered list of team names that won
 * that year (empty = no winner recorded / no event that year). `cancelled`
 * distinguishes a suspended year (e.g., 2020 COVID) from merely missing data.
 */
export interface YearWinners {
  year: number;
  winners: string[];
  cancelled?: boolean;
}

interface Props {
  /** Years to render. Caller is responsible for ordering/range; component
   *  handles the RTL reversal so newest lands top-right. */
  results: YearWinners[];
  /** Used to deep-link each monogram to the right team page. Omit to
   *  render non-clickable badges (useful for future Regionals page where
   *  a single year may mix men's/women's hosts). */
  gender?: Gender;
  /** Dim cells whose year falls outside the active filter. Pass a predicate
   *  or omit to never dim. */
  isYearActive?: (year: number) => boolean;
  /** Optional label surfaced via cell `title` for cancelled years. */
  cancelledTitle?: string;
}

/**
 * Shrinks the monogram as the number of co-winners in a single cell grows.
 * Tuned so 1-winner cells read as "hero badge" while 6+ winners (Regionals
 * hosts case) still fit side-by-side in a narrow mobile cell without
 * wrapping. Font scaling in TeamMonogram handles the rest.
 */
function badgeSize(count: number): number {
  if (count <= 1) return 30;
  if (count === 2) return 22;
  if (count === 3) return 18;
  if (count === 4) return 15;
  if (count === 5) return 13;
  return 11;
}

/**
 * RTL grid of year cells, each showing the team monogram(s) of that year's
 * winner(s). Designed as a flexible template: same shape works for NCAA
 * Championship champions (usually 1/year) and Regionals hosts (6+/year).
 *
 * Visual style mirrors the team-page national timeline and the expanded
 * per-team grid on the championships page so the page reads as a family.
 * Unlike those, this grid intentionally has no trophy icons, match-play
 * badges, or semantic colouring — every cell here represents a "win", so
 * the team badge itself is the information.
 */
export default function YearByYearWinnersGrid({
  results,
  gender,
  isYearActive,
  cancelledTitle = "No championship this year",
}: Props) {
  const reduced = useReducedMotion();
  // Reverse for RTL: we want newest year to land in the top-right corner,
  // oldest in the bottom-left. Render order is newest-first, and `dir="rtl"`
  // on the grid flips horizontal flow so the first item sits top-right.
  const cells = [...results].reverse();

  return (
    <div
      dir="rtl"
      className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-1.5"
    >
      {cells.map((r, idx) => {
        const dim = isYearActive && !isYearActive(r.year);
        const transition = {
          duration: 0.22,
          ease: "easeOut" as const,
          delay: reduced ? 0 : idx * 0.012,
        };

        // Empty state: cancelled year OR no recorded winner. Both render
        // as a muted em-dash so the grid stays a perfect rectangle.
        if (r.cancelled || r.winners.length === 0) {
          const cellCls = r.cancelled
            ? `rounded-sm border border-dashed border-border/40 bg-card/20 px-1.5 py-1 text-center transition-colors ${dim ? "opacity-25" : ""}`
            : `rounded-sm border border-dashed border-border/20 px-1.5 py-1 text-center transition-colors ${dim ? "opacity-25" : ""}`;
          const title = r.cancelled ? cancelledTitle : undefined;
          const inner = (
            <>
              <div className="text-[10px] text-text-tertiary font-mono tabular-nums leading-tight">
                {r.year}
              </div>
              <div className="mt-1 flex items-center justify-center h-[30px]">
                <span className="text-[12px] font-mono tabular-nums text-text-tertiary/60">
                  —
                </span>
              </div>
            </>
          );
          if (reduced) {
            return (
              <div key={r.year} dir="ltr" className={cellCls} title={title}>
                {inner}
              </div>
            );
          }
          return (
            <motion.div
              key={r.year}
              dir="ltr"
              className={cellCls}
              title={title}
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={transition}
            >
              {inner}
            </motion.div>
          );
        }

        const size = badgeSize(r.winners.length);
        const cellCls = `rounded-sm border border-border/40 bg-card/40 px-1.5 py-1 text-center transition-shadow duration-150 ease-out hover:border-border-medium hover:shadow-raised ${dim ? "opacity-25" : ""}`;
        const title = r.winners.join(" · ");

        const badges = (
          <div
            className="mt-1 flex items-center justify-center gap-0.5"
            style={{ minHeight: 30 }}
          >
            {r.winners.map((team) => {
              const mono = <TeamMonogram team={team} size={size} />;
              if (gender) {
                return (
                  <Link
                    key={team}
                    href={teamHref(team, gender)}
                    aria-label={`${team} — ${r.year} champion`}
                    title={team}
                    className="inline-flex"
                  >
                    {mono}
                  </Link>
                );
              }
              return (
                <span key={team} title={team} className="inline-flex">
                  {mono}
                </span>
              );
            })}
          </div>
        );

        const inner = (
          <>
            <div className="text-[10px] text-text-tertiary font-mono tabular-nums leading-tight">
              {r.year}
            </div>
            {badges}
          </>
        );

        if (reduced) {
          return (
            <div key={r.year} dir="ltr" className={cellCls} title={title}>
              {inner}
            </div>
          );
        }

        return (
          <motion.div
            key={r.year}
            dir="ltr"
            className={cellCls}
            title={title}
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={transition}
          >
            {inner}
          </motion.div>
        );
      })}
    </div>
  );
}
