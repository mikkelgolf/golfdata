"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import type { Gender } from "@/data/records-types";
import type { TeamData } from "@/data/rankings-men";
import { teamHref } from "@/lib/team-link";
import { ConferenceBadge } from "@/components/conference-badge";
import {
  fadeSlideVariants,
  staggerContainerVariants,
  useReducedMotion,
} from "@/lib/animations";

interface Props {
  gender: Gender;
  currentTeam: string;
  peers: TeamData[];
}

export default function RelatedTeams({ gender, currentTeam, peers }: Props) {
  const reduced = useReducedMotion();
  if (peers.length === 0) return null;
  const siblings = peers.filter((t) => t.team !== currentTeam).slice(0, 12);
  if (siblings.length === 0) return null;

  const conference = peers[0]?.conference ?? "";

  const cardClass =
    "rounded-md border border-border/40 bg-card/40 px-3 py-2 transition-colors hover:border-border-medium";

  return (
    <section className="mt-8">
      <h2 className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
        Other {conference} {gender === "men" ? "men's" : "women's"} programs
      </h2>
      {reduced ? (
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {siblings.map((t) => (
            <Link
              key={t.team}
              href={teamHref(t.team, gender)}
              className={cardClass}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-medium text-foreground truncate">
                  {t.team}
                </span>
                <span className="shrink-0 text-[10px] font-mono tabular-nums text-muted-foreground">
                  #{t.rank}
                </span>
              </div>
              <div className="mt-1">
                <ConferenceBadge conference={t.conference} />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <motion.div
          className="mt-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2"
          variants={staggerContainerVariants(0.04, 0.08)}
          initial="hidden"
          animate="visible"
        >
          {siblings.map((t) => (
            <motion.div key={t.team} variants={fadeSlideVariants}>
              <Link href={teamHref(t.team, gender)} className={cardClass}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-medium text-foreground truncate">
                    {t.team}
                  </span>
                  <span className="shrink-0 text-[10px] font-mono tabular-nums text-muted-foreground">
                    #{t.rank}
                  </span>
                </div>
                <div className="mt-1">
                  <ConferenceBadge conference={t.conference} />
                </div>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      )}
    </section>
  );
}
