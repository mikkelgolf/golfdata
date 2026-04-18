"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { Gender, RegionalFinish } from "@/data/records-types";

interface Props {
  entries: RegionalFinish[];
}

interface TeamRow {
  team: string;
  byYear: Map<number, { position: string; advanced: boolean }>;
  apps: number;
  wins: number;
}

function buildRows(entries: RegionalFinish[]): { rows: TeamRow[]; years: number[] } {
  const years = new Set<number>();
  const byTeam = new Map<string, TeamRow>();
  for (const e of entries) {
    years.add(e.year);
    let r = byTeam.get(e.team);
    if (!r) {
      r = { team: e.team, byYear: new Map(), apps: 0, wins: 0 };
      byTeam.set(e.team, r);
    }
    r.byYear.set(e.year, { position: e.position, advanced: e.advanced });
    r.apps++;
    if (e.position === "1" || e.position === "T1") r.wins++;
  }
  const rowsArr = [...byTeam.values()].sort((a, b) => {
    if (a.wins !== b.wins) return b.wins - a.wins;
    if (a.apps !== b.apps) return b.apps - a.apps;
    return a.team.localeCompare(b.team);
  });
  return { rows: rowsArr, years: [...years].sort((a, b) => a - b) };
}

export default function RegionalsResultsTable({ entries }: Props) {
  const [gender, setGender] = useState<Gender>("men");
  const [query, setQuery] = useState("");

  const { rows, years } = useMemo(() => {
    return buildRows(entries.filter((e) => e.gender === gender));
  }, [entries, gender]);

  const q = query.trim().toLowerCase();
  const visible = q ? rows.filter((r) => r.team.toLowerCase().includes(q)) : rows;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-md border border-border bg-card p-0.5 text-[12px]">
          <button
            type="button"
            onClick={() => setGender("men")}
            className={
              gender === "men"
                ? "btn-lift rounded px-3 py-1 font-medium text-foreground"
                : "rounded px-3 py-1 text-muted-foreground hover:text-foreground transition-colors"
            }
          >
            Men&apos;s
          </button>
          <button
            type="button"
            onClick={() => setGender("women")}
            className={
              gender === "women"
                ? "btn-lift rounded px-3 py-1 font-medium text-foreground"
                : "rounded px-3 py-1 text-muted-foreground hover:text-foreground transition-colors"
            }
          >
            Women&apos;s
          </button>
        </div>
        <div className="relative w-full max-w-xs">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter teams…"
            className="w-full rounded-md border border-border bg-card py-1 pl-7 pr-2 text-[12px] placeholder:text-text-placeholder focus-visible:outline-none"
          />
        </div>
        <div className="text-[11px] text-text-tertiary">
          {visible.length} team{visible.length === 1 ? "" : "s"}
          {years.length > 0 ? ` · ${years[0]}–${years[years.length - 1]}` : ""}
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-muted">
              <th
                scope="col"
                className="sticky left-0 z-10 bg-muted label-caps px-3 py-2 text-left min-w-[160px]"
              >
                Team
              </th>
              {years.map((y) => (
                <th
                  key={y}
                  scope="col"
                  className="label-caps whitespace-nowrap px-1.5 py-2 text-center font-mono text-[10px] tabular-nums"
                >
                  {y}
                </th>
              ))}
              <th
                scope="col"
                className="label-caps whitespace-nowrap px-3 py-2 text-right"
              >
                Apps
              </th>
              <th
                scope="col"
                className="label-caps whitespace-nowrap px-3 py-2 text-right"
              >
                Wins
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.team} className="border-b border-border/60 hover:bg-[hsl(var(--surface-raised))] transition-colors">
                <th
                  scope="row"
                  className="sticky left-0 z-10 whitespace-nowrap bg-card px-3 py-1.5 text-[13px] font-medium"
                >
                  {r.team}
                </th>
                {years.map((y) => {
                  const cell = r.byYear.get(y);
                  if (!cell) {
                    return (
                      <td
                        key={y}
                        className="px-1.5 py-1.5 text-center font-mono text-[11px] tabular-nums text-text-tertiary"
                      >
                        —
                      </td>
                    );
                  }
                  return (
                    <td
                      key={y}
                      className="px-1.5 py-1.5 text-center font-mono text-[11px] tabular-nums whitespace-nowrap"
                    >
                      <span className={cell.advanced ? "font-bold text-foreground" : "text-muted-foreground"}>
                        {cell.position}
                      </span>
                      {cell.advanced ? (
                        <span
                          aria-hidden="true"
                          className="ml-1 inline-block h-[4px] w-[4px] rounded-full bg-foreground/60 align-middle"
                        />
                      ) : null}
                    </td>
                  );
                })}
                <td className="px-3 py-1.5 text-right font-mono text-[12px] tabular-nums text-foreground">
                  {r.apps}
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-[12px] tabular-nums font-semibold text-foreground">
                  {r.wins}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-text-tertiary">
        <span
          aria-hidden="true"
          className="mr-1 inline-block h-[4px] w-[4px] rounded-full bg-foreground/60 align-middle"
        />
        Top 5 per regional advanced to Nationals.
      </p>
    </div>
  );
}
