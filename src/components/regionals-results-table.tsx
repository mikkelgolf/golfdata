"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import type { Gender, RegionalFinish } from "@/data/records-types";
import { rankingsMen } from "@/data/rankings-men";
import { rankingsWomen } from "@/data/rankings-women";
import { allTeamsMen2026 } from "@/data/all-teams-men-2026";
import { allTeamsWomen2026 } from "@/data/all-teams-women-2026";

interface Props {
  entries: RegionalFinish[];
}

interface TeamRow {
  team: string;
  byYear: Map<number, { position: string; advanced: boolean }>;
  apps: number;
  wins: number;
  nationals: number;
  bestFinish: number | null;
  currentConference: string;
}

type SortKey = "team" | "apps" | "wins" | "nationals" | "bestFinish" | "currentConference";
type SortDir = "asc" | "desc";

function buildConferenceMap(gender: Gender): Map<string, string> {
  const m = new Map<string, string>();
  for (const t of gender === "men" ? rankingsMen : rankingsWomen) {
    m.set(t.team, t.conference);
  }
  for (const t of gender === "men" ? allTeamsMen2026 : allTeamsWomen2026) {
    if (!m.has(t.team)) m.set(t.team, t.conference);
  }
  return m;
}

function buildRows(
  entries: RegionalFinish[],
  conferenceMap: Map<string, string>
): { rows: TeamRow[]; years: number[] } {
  const years = new Set<number>();
  const byTeam = new Map<string, TeamRow>();
  for (const e of entries) {
    years.add(e.year);
    let r = byTeam.get(e.team);
    if (!r) {
      r = {
        team: e.team,
        byYear: new Map(),
        apps: 0,
        wins: 0,
        nationals: 0,
        bestFinish: null,
        currentConference: conferenceMap.get(e.team) ?? "—",
      };
      byTeam.set(e.team, r);
    }
    r.byYear.set(e.year, { position: e.position, advanced: e.advanced });
    r.apps += 1;
    if (e.position === "1") r.wins += 1;
    if (e.advanced) r.nationals += 1;
    const posNum = parseInt(e.position, 10);
    if (Number.isFinite(posNum) && posNum > 0) {
      if (r.bestFinish === null || posNum < r.bestFinish) r.bestFinish = posNum;
    }
  }
  const rowsArr = [...byTeam.values()];
  return { rows: rowsArr, years: [...years].sort((a, b) => a - b) };
}

function sortRows(rows: TeamRow[], key: SortKey, dir: SortDir): TeamRow[] {
  const factor = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case "team":
        cmp = a.team.localeCompare(b.team);
        break;
      case "apps":
        cmp = a.apps - b.apps;
        break;
      case "wins":
        cmp = a.wins - b.wins;
        break;
      case "nationals":
        cmp = a.nationals - b.nationals;
        break;
      case "bestFinish": {
        const ax = a.bestFinish ?? Number.POSITIVE_INFINITY;
        const bx = b.bestFinish ?? Number.POSITIVE_INFINITY;
        cmp = ax - bx;
        break;
      }
      case "currentConference":
        cmp = a.currentConference.localeCompare(b.currentConference);
        break;
    }
    if (cmp === 0) return a.team.localeCompare(b.team);
    return cmp * factor;
  });
}

export default function RegionalsResultsTable({ entries }: Props) {
  const [gender, setGender] = useState<Gender>("men");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("wins");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const conferenceMap = useMemo(() => buildConferenceMap(gender), [gender]);

  const { rows, years } = useMemo(
    () => buildRows(entries.filter((e) => e.gender === gender), conferenceMap),
    [entries, gender, conferenceMap]
  );

  const q = query.trim().toLowerCase();
  const filtered = q
    ? rows.filter(
        (r) =>
          r.team.toLowerCase().includes(q) ||
          r.currentConference.toLowerCase().includes(q)
      )
    : rows;
  const sorted = sortRows(filtered, sortKey, sortDir);

  const toggleExpand = (team: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(team)) next.delete(team);
      else next.add(team);
      return next;
    });
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir(key === "team" || key === "bestFinish" || key === "currentConference" ? "asc" : "desc");
    } else {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-md border border-border bg-card p-0.5 text-[12px]">
          <button
            type="button"
            onClick={() => {
              setGender("men");
              setExpanded(new Set());
            }}
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
            onClick={() => {
              setGender("women");
              setExpanded(new Set());
            }}
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
            placeholder="Filter teams or conferences…"
            className="w-full rounded-md border border-border bg-card py-1 pl-7 pr-2 text-[12px] placeholder:text-text-placeholder focus-visible:outline-none"
          />
        </div>
        <div className="text-[11px] text-text-tertiary">
          {sorted.length} team{sorted.length === 1 ? "" : "s"}
          {years.length > 0 ? ` · ${years[0]}–${years[years.length - 1]}` : ""}
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-border">
        <div className="grid grid-cols-[24px_minmax(140px,1fr)_56px_56px_56px_56px_minmax(80px,1fr)] items-center gap-1 bg-muted px-2 py-2 text-[10px] sm:text-[11px]">
          <span />
          <SortableHeader
            label="Team"
            active={sortKey === "team"}
            dir={sortDir}
            onClick={() => toggleSort("team")}
          />
          <SortableHeader
            label="Apps"
            align="right"
            active={sortKey === "apps"}
            dir={sortDir}
            onClick={() => toggleSort("apps")}
          />
          <SortableHeader
            label="Nat"
            align="right"
            title="Nationals appearances"
            active={sortKey === "nationals"}
            dir={sortDir}
            onClick={() => toggleSort("nationals")}
          />
          <SortableHeader
            label="Wins"
            align="right"
            title="Regional wins (1st-place finishes)"
            active={sortKey === "wins"}
            dir={sortDir}
            onClick={() => toggleSort("wins")}
          />
          <SortableHeader
            label="Best"
            align="right"
            title="Best regional finish"
            active={sortKey === "bestFinish"}
            dir={sortDir}
            onClick={() => toggleSort("bestFinish")}
          />
          <SortableHeader
            label="Conf."
            title="2025-26 conference (not historical)"
            active={sortKey === "currentConference"}
            dir={sortDir}
            onClick={() => toggleSort("currentConference")}
          />
        </div>

        <div>
          {sorted.length === 0 && (
            <div className="px-3 py-8 text-center text-[12px] text-muted-foreground italic">
              No teams match.
            </div>
          )}
          {sorted.map((r) => {
            const isOpen = expanded.has(r.team);
            return (
              <div key={r.team} className="border-b border-border/40 last:border-b-0">
                <button
                  type="button"
                  onClick={() => toggleExpand(r.team)}
                  aria-expanded={isOpen}
                  className="grid w-full grid-cols-[24px_minmax(140px,1fr)_56px_56px_56px_56px_minmax(80px,1fr)] items-center gap-1 bg-card px-2 py-1.5 text-left text-[12px] hover:bg-[hsl(var(--surface-raised))] transition-colors"
                >
                  <ChevronRight
                    className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`}
                    aria-hidden="true"
                  />
                  <span className="truncate font-medium">{r.team}</span>
                  <span className="text-right font-mono tabular-nums text-foreground">{r.apps}</span>
                  <span className="text-right font-mono tabular-nums text-foreground">{r.nationals}</span>
                  <span className="text-right font-mono tabular-nums font-semibold text-foreground">
                    {r.wins}
                  </span>
                  <span className="text-right font-mono tabular-nums text-foreground">
                    {r.bestFinish ?? "—"}
                  </span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {r.currentConference}
                  </span>
                </button>

                {isOpen && (
                  <div className="bg-background/40 px-3 py-3 border-t border-border/40">
                    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-1.5">
                      {years.map((y) => {
                        const cell = r.byYear.get(y);
                        return (
                          <div
                            key={y}
                            className={
                              cell
                                ? "rounded border border-border/40 bg-card px-1.5 py-1 text-center"
                                : "rounded border border-dashed border-border/20 px-1.5 py-1 text-center"
                            }
                          >
                            <div className="text-[10px] text-muted-foreground font-mono tabular-nums">
                              {y}
                            </div>
                            <div className="text-[12px] font-mono tabular-nums">
                              {cell ? (
                                <span
                                  className={
                                    cell.advanced
                                      ? "font-semibold text-foreground"
                                      : "text-foreground/80"
                                  }
                                >
                                  {cell.position}
                                  {cell.advanced ? (
                                    <span
                                      aria-hidden="true"
                                      className="ml-0.5 inline-block h-[4px] w-[4px] rounded-full bg-primary/70 align-middle"
                                    />
                                  ) : null}
                                </span>
                              ) : (
                                <span className="text-muted-foreground/50">—</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[11px] text-text-tertiary">
        <span
          aria-hidden="true"
          className="mr-1 inline-block h-[4px] w-[4px] rounded-full bg-primary/70 align-middle"
        />
        Top 5 per regional advanced to Nationals. Tap a team to see year-by-year results.
      </p>
    </div>
  );
}

function SortableHeader({
  label,
  align,
  title,
  active,
  dir,
  onClick,
}: {
  label: string;
  align?: "right";
  title?: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  const arrow = active ? (dir === "asc" ? "↑" : "↓") : "↕";
  const arrowClass = active ? "text-foreground/60" : "text-muted-foreground/30";
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`label-caps ${align === "right" ? "text-right" : "text-left"} hover:text-foreground transition-colors`}
    >
      {label}
      <span className={`ml-1 ${arrowClass}`}>{arrow}</span>
    </button>
  );
}
