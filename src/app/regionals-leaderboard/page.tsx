import type { Metadata } from "next";
import Link from "next/link";
import { regionalsRich } from "@/data/regionals-rich";
import { championshipsHistory } from "@/data/championships-history";
import { slugify } from "@/lib/team-slug";
import type { RegionalFinishRich } from "@/data/records-types";

export const metadata: Metadata = {
  title: "Regionals Leaderboard",
  description:
    "Site-wide leaderboards for NCAA Division I Men's Regionals 1989-2025 — titles, committee seeding, strokes-gained performance, and underdog advances.",
};

const MIN_APPEARANCES_FOR_RATE = 5;

interface TeamAgg {
  team: string;
  appearances: number;
  titles: number;
  seededAppearances: number;
  avgSeed: number | null;
  sgSum: number;
  sgCount: number;
  avgSg: number | null;
  bestSg: number | null;
  bestSgYear: number | null;
  bestSgRegional: string | null;
  beatSeedCount: number;
  underdogAdvanceCount: number;
  ncaaYears: Set<number>;
}

function buildAggregates(rows: RegionalFinishRich[]): Map<string, TeamAgg> {
  const out = new Map<string, TeamAgg>();
  for (const r of rows) {
    if (r.gender !== "men") continue;
    const key = r.team;
    let agg = out.get(key);
    if (!agg) {
      agg = {
        team: r.team,
        appearances: 0,
        titles: 0,
        seededAppearances: 0,
        avgSeed: null,
        sgSum: 0,
        sgCount: 0,
        avgSg: null,
        bestSg: null,
        bestSgYear: null,
        bestSgRegional: null,
        beatSeedCount: 0,
        underdogAdvanceCount: 0,
        ncaaYears: new Set<number>(),
      };
      out.set(key, agg);
    }
    agg.appearances += 1;
    if (r.finalPos === 1 || r.result === "1" || r.result === "T1") {
      agg.titles += 1;
    }
    if (r.seed != null) {
      agg.seededAppearances += 1;
    }
    if (r.sgTotal != null) {
      agg.sgSum += r.sgTotal;
      agg.sgCount += 1;
      if (agg.bestSg == null || r.sgTotal > agg.bestSg) {
        agg.bestSg = r.sgTotal;
        agg.bestSgYear = r.year;
        agg.bestSgRegional = r.regional;
      }
    }
    if (r.seed != null && r.finalPos != null && r.finalPos < r.seed) {
      agg.beatSeedCount += 1;
    }
  }

  // Second pass for avgSeed + avgSg
  for (const agg of out.values()) {
    if (agg.seededAppearances > 0) {
      // Use a re-scan to keep this readable; perf is fine at ~2700 rows.
      let sum = 0;
      let count = 0;
      for (const r of rows) {
        if (r.gender !== "men" || r.team !== agg.team || r.seed == null) continue;
        sum += r.seed;
        count += 1;
      }
      agg.avgSeed = count > 0 ? sum / count : null;
    }
    if (agg.sgCount > 0) {
      agg.avgSg = agg.sgSum / agg.sgCount;
    }
  }

  // "Advanced as underdog" needs NCAA appearance truth (seed data alone
  // can be misleading). Pre-index championship appearances by team/year.
  const ncaaByTeamYear = new Set<string>();
  for (const r of championshipsHistory) {
    if (r.gender === "men") ncaaByTeamYear.add(`${r.team}|${r.year}`);
  }
  for (const r of rows) {
    if (r.gender !== "men") continue;
    if (r.seed == null || r.seed < 5) continue;
    if (ncaaByTeamYear.has(`${r.team}|${r.year}`)) {
      const agg = out.get(r.team);
      if (agg) agg.underdogAdvanceCount += 1;
    }
  }

  return out;
}

function TeamLink({ team }: { team: string }) {
  return (
    <Link
      href={`/teams/men/${slugify(team)}`}
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
}: {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: Array<{ team: string; cells: Array<string | number> }>;
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
                  <TeamLink team={r.team} />
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
    </section>
  );
}

function fmtSg(v: number | null): string {
  if (v === null) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}`;
}

export default function RegionalsLeaderboardPage() {
  const aggregates = buildAggregates(regionalsRich);
  const teams = Array.from(aggregates.values());

  const topTitles = [...teams]
    .filter((t) => t.titles > 0)
    .sort((a, b) => b.titles - a.titles || b.appearances - a.appearances)
    .slice(0, 15);

  const bestAvgSeed = [...teams]
    .filter(
      (t) => t.avgSeed !== null && t.seededAppearances >= MIN_APPEARANCES_FOR_RATE
    )
    .sort((a, b) => (a.avgSeed as number) - (b.avgSeed as number))
    .slice(0, 15);

  const bestAvgSg = [...teams]
    .filter((t) => t.avgSg !== null && t.sgCount >= MIN_APPEARANCES_FOR_RATE)
    .sort((a, b) => (b.avgSg as number) - (a.avgSg as number))
    .slice(0, 15);

  const mostBeatSeed = [...teams]
    .filter((t) => t.beatSeedCount > 0)
    .sort(
      (a, b) =>
        b.beatSeedCount - a.beatSeedCount || b.seededAppearances - a.seededAppearances
    )
    .slice(0, 15);

  const mostUnderdogAdvance = [...teams]
    .filter((t) => t.underdogAdvanceCount > 0)
    .sort(
      (a, b) =>
        b.underdogAdvanceCount - a.underdogAdvanceCount ||
        b.appearances - a.appearances
    )
    .slice(0, 15);

  return (
    <div className="mx-auto max-w-6xl px-3 sm:px-4 pt-2 sm:pt-4 pb-8">
      <div className="mb-4">
        <h1 className="text-[15px] sm:text-lg font-semibold tracking-tight text-foreground">
          Regionals Leaderboard
        </h1>
        <p className="hidden sm:block text-[12px] text-text-tertiary mt-1">
          NCAA Division I Men&apos;s · 1989–2025 · titles, seeding, strokes-gained,
          and underdog advances. Minimum {MIN_APPEARANCES_FOR_RATE} appearances
          on rate-based rankings. Women&apos;s data pending.
        </p>
      </div>

      <div className="space-y-4">
        <LeaderboardSection
          title="Most Regional titles"
          subtitle="Solo or tied 1st finishes. Ties broken by total appearances."
          headers={["Titles", "Appearances"]}
          rows={topTitles.map((t) => ({
            team: t.team,
            cells: [t.titles, t.appearances],
          }))}
        />

        <LeaderboardSection
          title="Best average committee seed"
          subtitle={`Lower is better. Minimum ${MIN_APPEARANCES_FOR_RATE} seeded appearances. Seeding era began roughly 2002.`}
          headers={["Avg Seed", "Seeded Yrs"]}
          rows={bestAvgSeed.map((t) => ({
            team: t.team,
            cells: [(t.avgSeed as number).toFixed(2), t.seededAppearances],
          }))}
        />

        <LeaderboardSection
          title="Best average Regional SG"
          subtitle={`Average team strokes-gained total vs field across all appearances. Minimum ${MIN_APPEARANCES_FOR_RATE} appearances.`}
          headers={["Avg SG", "Best SG", "Appearances"]}
          rows={bestAvgSg.map((t) => ({
            team: t.team,
            cells: [
              fmtSg(t.avgSg),
              t.bestSg !== null
                ? `${fmtSg(t.bestSg)} (${t.bestSgYear})`
                : "—",
              t.sgCount,
            ],
          }))}
        />

        <LeaderboardSection
          title="Most times beat the seed"
          subtitle="Final position strictly better than committee seed — the classic overachievement count."
          headers={["Beat Seed", "Seeded Yrs"]}
          rows={mostBeatSeed.map((t) => ({
            team: t.team,
            cells: [t.beatSeedCount, t.seededAppearances],
          }))}
        />

        <LeaderboardSection
          title="Most advanced as underdog"
          subtitle="Seeded 5 or lower and still made it to the NCAA Championship."
          headers={["Underdog Advances", "Appearances"]}
          rows={mostUnderdogAdvance.map((t) => ({
            team: t.team,
            cells: [t.underdogAdvanceCount, t.appearances],
          }))}
        />
      </div>

      <p className="mt-6 text-[11px] text-text-tertiary">
        Source: aggregated Regional tournament history, 1989–2025. Raw dataset
        is private; only derived per-team summaries are shown here.
      </p>
    </div>
  );
}
