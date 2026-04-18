"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { ChevronRight, Search, X } from "lucide-react";
import type { Gender, RegionalFinish } from "@/data/records-types";
import { rankingsMen } from "@/data/rankings-men";
import { rankingsWomen } from "@/data/rankings-women";
import { allTeamsMen2026 } from "@/data/all-teams-men-2026";
import { allTeamsWomen2026 } from "@/data/all-teams-women-2026";
import { teamHref } from "@/lib/team-link";
import { useReducedMotion } from "@/lib/animations";

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
  lastAppearance: number | null;
  currentConference: string;
}

type SortKey =
  | "team"
  | "apps"
  | "wins"
  | "nationals"
  | "bestFinish"
  | "lastAppearance"
  | "currentConference";
type SortDir = "asc" | "desc";

interface Decade {
  label: string;
  min: number;
  max: number;
}

function buildDecades(minYear: number, maxYear: number): Decade[] {
  const out: Decade[] = [];
  for (let start = Math.floor(minYear / 10) * 10; start <= maxYear; start += 10) {
    const end = Math.min(start + 9, maxYear);
    const rangeStart = Math.max(start, minYear);
    out.push({
      label: `${String(rangeStart).slice(-2)}–${String(end).slice(-2)}`,
      min: rangeStart,
      max: end,
    });
  }
  return out;
}

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
        lastAppearance: null,
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
    if (r.lastAppearance === null || e.year > r.lastAppearance) {
      r.lastAppearance = e.year;
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
      case "lastAppearance": {
        const ax = a.lastAppearance ?? 0;
        const bx = b.lastAppearance ?? 0;
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
  const [confFilter, setConfFilter] = useState<Set<string>>(new Set());
  const [decadeFilter, setDecadeFilter] = useState<Set<string>>(new Set());
  const reduced = useReducedMotion();

  const conferenceMap = useMemo(() => buildConferenceMap(gender), [gender]);

  const { rows, years } = useMemo(
    () => buildRows(entries.filter((e) => e.gender === gender), conferenceMap),
    [entries, gender, conferenceMap]
  );

  const decades = useMemo(() => {
    if (years.length === 0) return [];
    return buildDecades(years[0], years[years.length - 1]);
  }, [years]);

  const conferencesInData = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) s.add(r.currentConference);
    return [...s].filter((c) => c !== "—").sort();
  }, [rows]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    let r = rows;
    if (q) {
      r = r.filter(
        (row) =>
          row.team.toLowerCase().includes(q) ||
          row.currentConference.toLowerCase().includes(q)
      );
    }
    if (confFilter.size > 0) {
      r = r.filter((row) => confFilter.has(row.currentConference));
    }
    return r;
  }, [rows, q, confFilter]);
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
      setSortDir(
        key === "team" || key === "bestFinish" || key === "currentConference"
          ? "asc"
          : "desc"
      );
    } else {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    }
  };

  const toggleConf = (c: string) => {
    setConfFilter((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

  const toggleDecade = (label: string) => {
    setDecadeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const yearInActiveDecade = (y: number): boolean => {
    if (decadeFilter.size === 0) return true;
    for (const d of decades) {
      if (decadeFilter.has(d.label) && y >= d.min && y <= d.max) return true;
    }
    return false;
  };

  return (
    <div className="space-y-4">
      <div className="sticky top-[var(--nav-height)] z-10 -mx-4 sm:mx-0 bg-background/80 backdrop-blur-xl backdrop-saturate-150 border-b border-border/40 px-4 py-3 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-md border border-border bg-card p-0.5 text-[12px]">
            <button
              type="button"
              onClick={() => {
                setGender("men");
                setExpanded(new Set());
                setConfFilter(new Set());
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
                setConfFilter(new Set());
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
          <div className="relative w-full sm:w-72">
            <Search
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter teams or conferences…"
              className="w-full rounded-md border border-border bg-card py-1 pl-7 pr-7 text-[12px] placeholder:text-text-placeholder focus-visible:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <div className="text-[11px] text-text-tertiary ml-auto">
            {sorted.length} team{sorted.length === 1 ? "" : "s"}
            {years.length > 0 ? ` · ${years[0]}–${years[years.length - 1]}` : ""}
          </div>
        </div>

        {/* Decade filter */}
        {decades.length > 1 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80 mr-1">
              Decades
            </span>
            {decades.map((d) => {
              const active = decadeFilter.has(d.label);
              return (
                <button
                  key={d.label}
                  type="button"
                  onClick={() => toggleDecade(d.label)}
                  className={
                    active
                      ? "btn-lift rounded-full border border-primary/50 bg-primary/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-foreground"
                      : "rounded-full border border-border/60 bg-card px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground hover:border-border-medium transition-colors"
                  }
                >
                  {d.label}
                </button>
              );
            })}
            {decadeFilter.size > 0 && (
              <button
                type="button"
                onClick={() => setDecadeFilter(new Set())}
                className="ml-1 text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
              >
                Clear
              </button>
            )}
          </div>
        )}

        {/* Conference filter */}
        {conferencesInData.length > 0 && (
          <details className="group">
            <summary className="cursor-pointer list-none flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground/80 hover:text-foreground transition-colors">
              <span>Conferences</span>
              <span className="group-open:rotate-90 transition-transform">▸</span>
              {confFilter.size > 0 && (
                <span className="ml-1 text-primary">({confFilter.size} selected)</span>
              )}
            </summary>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {conferencesInData.map((c) => {
                const active = confFilter.has(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggleConf(c)}
                    className={
                      active
                        ? "btn-lift rounded-full border border-primary/50 bg-primary/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-foreground"
                        : "rounded-full border border-border/60 bg-card px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground hover:border-border-medium transition-colors"
                    }
                  >
                    {c}
                  </button>
                );
              })}
              {confFilter.size > 0 && (
                <button
                  type="button"
                  onClick={() => setConfFilter(new Set())}
                  className="ml-1 text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
          </details>
        )}
      </div>

      <div className="overflow-hidden rounded-md border border-border">
        <div className="grid grid-cols-[24px_minmax(140px,1fr)_48px_48px_48px_48px_56px_minmax(80px,1fr)] items-center gap-1 bg-muted px-2 py-2 text-[10px]">
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
            title="Regional wins"
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
            label="Last"
            align="right"
            title="Last year making regionals"
            active={sortKey === "lastAppearance"}
            dir={sortDir}
            onClick={() => toggleSort("lastAppearance")}
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
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleExpand(r.team)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleExpand(r.team);
                    }
                  }}
                  aria-expanded={isOpen}
                  className={
                    isOpen
                      ? "grid w-full grid-cols-[24px_minmax(140px,1fr)_48px_48px_48px_48px_56px_minmax(80px,1fr)] items-center gap-1 bg-[hsl(var(--surface-raised))] px-2 py-1.5 text-left text-[12px] cursor-pointer"
                      : "grid w-full grid-cols-[24px_minmax(140px,1fr)_48px_48px_48px_48px_56px_minmax(80px,1fr)] items-center gap-1 bg-card px-2 py-1.5 text-left text-[12px] hover:bg-[hsl(var(--surface-raised))] transition-colors cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  }
                >
                  <ChevronRight
                    className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`}
                    aria-hidden="true"
                  />
                  <Link
                    href={teamHref(r.team, gender)}
                    onClick={(e) => e.stopPropagation()}
                    className="truncate font-medium hover:text-primary transition-colors"
                  >
                    {r.team}
                  </Link>
                  <span className="text-right font-mono tabular-nums text-foreground">{r.apps}</span>
                  <span className="text-right font-mono tabular-nums text-foreground">{r.nationals}</span>
                  <span className="text-right font-mono tabular-nums font-semibold text-foreground">
                    {r.wins}
                  </span>
                  <span className="text-right font-mono tabular-nums text-foreground">
                    {r.bestFinish ?? "—"}
                  </span>
                  <span className="text-right font-mono tabular-nums text-muted-foreground">
                    {r.lastAppearance ?? "—"}
                  </span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {r.currentConference}
                  </span>
                </div>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      key="expand"
                      initial={reduced ? false : { height: 0, opacity: 0 }}
                      animate={reduced ? undefined : { height: "auto", opacity: 1 }}
                      exit={reduced ? undefined : { height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="bg-background/40 px-3 py-3 border-t border-border/40">
                        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-1.5">
                          {years.map((y) => {
                            const cell = r.byYear.get(y);
                            const dim = !yearInActiveDecade(y);
                            if (!cell) {
                              return (
                                <div
                                  key={y}
                                  className={`rounded border border-dashed border-border/20 px-1.5 py-1 text-center ${dim ? "opacity-25" : ""}`}
                                >
                                  <div className="text-[10px] text-muted-foreground font-mono tabular-nums">
                                    {y}
                                  </div>
                                  <div className="text-[12px] font-mono tabular-nums text-muted-foreground/50">
                                    —
                                  </div>
                                </div>
                              );
                            }
                            return (
                              <div
                                key={y}
                                className={
                                  cell.advanced
                                    ? `rounded border border-emerald-500/30 bg-emerald-500/5 px-1.5 py-1 text-center transition-colors hover:border-emerald-400/70 hover:bg-emerald-500/10 ${dim ? "opacity-25" : ""}`
                                    : `rounded border border-border/40 bg-card px-1.5 py-1 text-center ${dim ? "opacity-25" : ""}`
                                }
                              >
                                <div className="text-[10px] text-muted-foreground font-mono tabular-nums">
                                  {y}
                                </div>
                                <div className="text-[12px] font-mono tabular-nums">
                                  <span
                                    className={
                                      cell.advanced
                                        ? "font-semibold text-emerald-300"
                                        : "text-foreground/85"
                                    }
                                  >
                                    {cell.position}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[11px] text-text-tertiary">
        <span
          aria-hidden="true"
          className="mr-1 inline-block h-[6px] w-[6px] rounded-sm bg-emerald-500/70 align-middle"
        />
        = advanced to Nationals. Tap a team to see year-by-year finishes.
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
