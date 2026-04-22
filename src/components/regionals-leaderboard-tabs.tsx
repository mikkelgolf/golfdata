"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import type { Gender } from "@/data/records-types";
import { slugify } from "@/lib/team-slug";

export interface LeaderboardRow {
  team: string;
  cells: Array<string | number>;
}

export interface LeaderboardBoards {
  teamCount: number;
  topTitles: LeaderboardRow[];
  bestAvgSeed: LeaderboardRow[];
  bestAvgSg: LeaderboardRow[];
  mostBeatSeed: LeaderboardRow[];
  mostUnderdogAdvance: LeaderboardRow[];
}

interface Props {
  men: LeaderboardBoards;
  women: LeaderboardBoards;
  minAppearances: number;
}

function TeamLink({ team, gender }: { team: string; gender: Gender }) {
  return (
    <Link
      href={`/teams/${gender}/${slugify(team)}`}
      className="text-foreground hover:text-primary transition-colors"
    >
      {team}
    </Link>
  );
}

function LeaderboardSection({
  title,
  subtitle,
  headers,
  rows,
  gender,
}: {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: LeaderboardRow[];
  gender: Gender;
}) {
  return (
    <section className="rounded border border-border bg-card/40 p-3 sm:p-4">
      <div className="mb-2">
        <h2 className="text-[13px] sm:text-[14px] font-semibold text-foreground">
          {title}
        </h2>
        {subtitle ? (
          <p className="text-[11px] text-text-tertiary mt-0.5">{subtitle}</p>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="text-[12px] text-text-tertiary italic py-2">
          No qualifying teams yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-text-tertiary border-b border-border/60">
                <th className="text-left font-medium py-1 pr-3 w-[32px]">#</th>
                <th className="text-left font-medium py-1 pr-3">Team</th>
                {headers.map((h) => (
                  <th
                    key={h}
                    className="text-right font-medium py-1 pl-3 font-mono tabular-nums"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.team}
                  className="border-b border-border/30 last:border-b-0"
                >
                  <td className="py-1 pr-3 text-text-tertiary font-mono tabular-nums">
                    {i + 1}
                  </td>
                  <td className="py-1 pr-3">
                    <TeamLink team={r.team} gender={gender} />
                  </td>
                  {r.cells.map((c, j) => (
                    <td
                      key={j}
                      className="py-1 pl-3 text-right font-mono tabular-nums text-foreground"
                    >
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Boards({
  boards,
  gender,
  minAppearances,
}: {
  boards: LeaderboardBoards;
  gender: Gender;
  minAppearances: number;
}) {
  if (boards.teamCount === 0) {
    return (
      <div className="rounded border border-border bg-card/40 p-6 text-center">
        <p className="text-[13px] text-text-tertiary">
          {gender === "women" ? "Women's" : "Men's"} Regionals data is not yet
          loaded.
        </p>
        <p className="text-[11px] text-text-tertiary mt-1">
          Check back once the source sheet is ingested.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <LeaderboardSection
        gender={gender}
        title="Most Regional titles"
        subtitle="Solo or tied 1st finishes. Ties broken by total appearances."
        headers={["Titles", "Appearances"]}
        rows={boards.topTitles}
      />
      <LeaderboardSection
        gender={gender}
        title="Best average committee seed"
        subtitle={`Lower is better. Minimum ${minAppearances} seeded appearances. Seeding era began roughly 2002.`}
        headers={["Avg Seed", "Seeded Yrs"]}
        rows={boards.bestAvgSeed}
      />
      <LeaderboardSection
        gender={gender}
        title="Best average Regional SG"
        subtitle={`Average team strokes-gained total vs field across all appearances. Minimum ${minAppearances} appearances.`}
        headers={["Avg SG", "Best SG", "Appearances"]}
        rows={boards.bestAvgSg}
      />
      <LeaderboardSection
        gender={gender}
        title="Most times beat the seed"
        subtitle="Final position strictly better than committee seed — the classic overachievement count."
        headers={["Beat Seed", "Seeded Yrs"]}
        rows={boards.mostBeatSeed}
      />
      <LeaderboardSection
        gender={gender}
        title="Most advanced as underdog"
        subtitle="Seeded 5 or lower and still made it to the NCAA Championship."
        headers={["Underdog Advances", "Appearances"]}
        rows={boards.mostUnderdogAdvance}
      />
    </div>
  );
}

export default function RegionalsLeaderboardTabs({
  men,
  women,
  minAppearances,
}: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const gender: Gender = useMemo(() => {
    const g = searchParams.get("gender");
    return g === "women" ? "women" : "men";
  }, [searchParams]);

  const setGender = useCallback(
    (g: Gender) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("gender", g);
      router.replace(`/regionals-leaderboard?${params.toString()}`, {
        scroll: false,
      });
    },
    [router, searchParams]
  );

  const boards = gender === "men" ? men : women;

  return (
    <div>
      <div className="mb-3 flex items-center gap-1 rounded-md border border-border bg-card/30 p-1 w-fit">
        {(["men", "women"] as const).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGender(g)}
            aria-pressed={gender === g}
            className={
              "px-3 py-1 text-[12px] font-medium rounded transition-colors " +
              (gender === g
                ? "bg-primary/15 text-primary"
                : "text-text-tertiary hover:text-foreground")
            }
          >
            {g === "men" ? "Men" : "Women"}
          </button>
        ))}
      </div>
      <Boards boards={boards} gender={gender} minAppearances={minAppearances} />
    </div>
  );
}
