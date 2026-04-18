import Link from "next/link";
import type { Gender } from "@/data/records-types";
import type { TeamData } from "@/data/rankings-men";
import { teamHref } from "@/lib/team-link";
import { ConferenceBadge } from "@/components/conference-badge";

interface Props {
  gender: Gender;
  currentTeam: string;
  peers: TeamData[];
}

export default function RelatedTeams({ gender, currentTeam, peers }: Props) {
  if (peers.length === 0) return null;
  const siblings = peers.filter((t) => t.team !== currentTeam).slice(0, 12);
  if (siblings.length === 0) return null;

  const conference = peers[0]?.conference ?? "";

  return (
    <section className="mt-10">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Other {conference} {gender === "men" ? "men's" : "women's"} programs
      </h2>
      <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {siblings.map((t) => (
          <Link
            key={t.team}
            href={teamHref(t.team, gender)}
            className="rounded-md border border-border bg-card px-3 py-2 hover:bg-[hsl(var(--surface-raised))] hover:border-border-medium transition-colors"
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
    </section>
  );
}
