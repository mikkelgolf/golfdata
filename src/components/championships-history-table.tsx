"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  Search,
  Trophy,
  X,
} from "lucide-react";
import type {
  ChampionshipFinish,
  Gender,
} from "@/data/records-types";
import { rankingsMen } from "@/data/rankings-men";
import { rankingsWomen } from "@/data/rankings-women";
import { allTeamsMen2026 } from "@/data/all-teams-men-2026";
import { allTeamsWomen2026 } from "@/data/all-teams-women-2026";
import { teamHref } from "@/lib/team-link";
import { fadeSlideVariants, useReducedMotion } from "@/lib/animations";
import { isChampion } from "@/lib/streaks";

interface Props {
  entries: ChampionshipFinish[];
}

interface TeamCell {
  position: string;
  positionNoTies: number | null;
  madeCut: boolean;
  matchPlayEra: boolean;
  matchPlaySeed: number | null;
  wonQuarterfinal: boolean | null;
  wonSemifinal: boolean | null;
  wonChampionship: boolean | null;
  /** Won the Championship (pre-2009 stroke-play OR post-2009 match-play). */
  champion: boolean;
}

interface TeamRow {
  team: string;
  byYear: Map<number, TeamCell>;
  apps: number;
  wins: number;
  /** Made match play bracket (top 8 of the stroke-play field). */
  topEight: number;
  /** Sum of quarterfinal + semifinal wins across appearances. */
  matchPlayWins: number;
  bestFinish: number | null;
  lastAppearance: number | null;
  currentConference: string;
}

type SortKey =
  | "team"
  | "apps"
  | "wins"
  | "topEight"
  | "matchPlayWins"
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
  entries: ChampionshipFinish[],
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
        topEight: 0,
        matchPlayWins: 0,
        bestFinish: null,
        lastAppearance: null,
        currentConference: conferenceMap.get(e.team) ?? "—",
      };
      byTeam.set(e.team, r);
    }
    const champion = isChampion(e);
    r.byYear.set(e.year, {
      position: e.position,
      positionNoTies: e.positionNoTies,
      madeCut: e.madeCut,
      matchPlayEra: e.matchPlayEra,
      matchPlaySeed: e.matchPlaySeed,
      wonQuarterfinal: e.wonQuarterfinal,
      wonSemifinal: e.wonSemifinal,
      wonChampionship: e.wonChampionship,
      champion,
    });
    r.apps += 1;
    if (champion) r.wins += 1;
    if (e.matchPlaySeed !== null) r.topEight += 1;
    if (e.wonQuarterfinal === true) r.matchPlayWins += 1;
    if (e.wonSemifinal === true) r.matchPlayWins += 1;
    if (e.positionNoTies !== null) {
      if (r.bestFinish === null || e.positionNoTies < r.bestFinish)
        r.bestFinish = e.positionNoTies;
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
      case "topEight":
        cmp = a.topEight - b.topEight;
        break;
      case "matchPlayWins":
        cmp = a.matchPlayWins - b.matchPlayWins;
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
    if (cmp === 0) {
      // Default secondary sort: apps desc within tie.
      cmp = a.apps !== b.apps ? (a.apps - b.apps) * (-1) : 0;
      if (cmp === 0) return a.team.localeCompare(b.team);
      // The outer factor still needs to flip only on the primary key, so
      // return cmp without factor multiplication here.
      return cmp;
    }
    return cmp * factor;
  });
}

/** Formats "T3" as just "T3", but for a win ("1") upgrades to the trophy variant. */
function formatRunSummary(cell: TeamCell): string | null {
  if (!cell.matchPlayEra) return null;
  if (cell.matchPlaySeed === null) return null;
  const qf = cell.wonQuarterfinal === true ? 1 : 0;
  const sf = cell.wonSemifinal === true ? 1 : 0;
  const ch = cell.wonChampionship === true ? 1 : 0;
  const ql = cell.wonQuarterfinal === false ? 1 : 0;
  const sl = cell.wonSemifinal === false ? 1 : 0;
  const cl = cell.wonChampionship === false ? 1 : 0;
  const wins = qf + sf + ch;
  const losses = ql + sl + cl;
  if (wins === 0 && losses === 0) return null;
  // W-L-T pattern trimmed to wins-losses.
  return `Match-play run ${wins}-${losses} · #${cell.matchPlaySeed} seed`;
}

export default function ChampionshipsHistoryTable({ entries }: Props) {
  const [gender, setGender] = useState<Gender>("men");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("wins");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confFilter, setConfFilter] = useState<Set<string>>(new Set());
  const [decadeFilter, setDecadeFilter] = useState<Set<string>>(new Set());
  const reduced = useReducedMotion();

  // Blur-up intro on the outer table container.
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setLoaded(true), 60);
    return () => clearTimeout(t);
  }, []);

  // Gate row stagger to the initial mount only.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 1200);
    return () => clearTimeout(t);
  }, []);

  const conferenceMap = useMemo(() => buildConferenceMap(gender), [gender]);

  const { rows, years } = useMemo(
    () =>
      buildRows(entries.filter((e) => e.gender === gender), conferenceMap),
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

      <div
        className="overflow-hidden rounded-md border border-border"
        style={
          reduced
            ? undefined
            : {
                opacity: loaded ? 1 : 0,
                filter: loaded ? "blur(0px)" : "blur(8px)",
                transition:
                  "opacity 600ms ease-out, filter 600ms ease-out",
              }
        }
      >
        <div className="grid grid-cols-[24px_minmax(140px,1fr)_44px_44px_44px_48px_44px_48px_minmax(80px,1fr)] items-center gap-1 bg-muted px-2 py-2 text-[10px]">
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
            label="Wins"
            align="right"
            title="Championship wins"
            active={sortKey === "wins"}
            dir={sortDir}
            onClick={() => toggleSort("wins")}
          />
          <SortableHeader
            label="Top 8"
            align="right"
            title="Match-play berths (top 8 of the stroke-play field)"
            active={sortKey === "topEight"}
            dir={sortDir}
            onClick={() => toggleSort("topEight")}
          />
          <SortableHeader
            label="MP W"
            align="right"
            title="Match-play wins (QF + SF)"
            active={sortKey === "matchPlayWins"}
            dir={sortDir}
            onClick={() => toggleSort("matchPlayWins")}
          />
          <SortableHeader
            label="Best"
            align="right"
            title="Best stroke-play finish (ignoring ties)"
            active={sortKey === "bestFinish"}
            dir={sortDir}
            onClick={() => toggleSort("bestFinish")}
          />
          <SortableHeader
            label="Last"
            align="right"
            title="Last appearance"
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
          {sorted.map((r, rowIdx) => {
            const isOpen = expanded.has(r.team);
            const rowBase =
              "grid w-full grid-cols-[24px_minmax(140px,1fr)_44px_44px_44px_48px_44px_48px_minmax(80px,1fr)] items-center gap-1 px-2 py-1.5 text-left text-[12px] cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-ring ring-card shadow-flat transition-shadow duration-150 ease-out data-[active=true]:shadow-raised";
            const rowCls = isOpen ? rowBase : `${rowBase} hover:shadow-raised`;
            const shouldStagger = !reduced && !mounted && rowIdx < 24;
            const rowInner = (
              <>
                <ChevronRight
                  className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-150 ${isOpen ? "rotate-90" : ""}`}
                  aria-hidden="true"
                />
                <Link
                  href={teamHref(r.team, gender)}
                  onClick={(e) => e.stopPropagation()}
                  className="truncate font-medium hover:text-primary transition-colors"
                >
                  {r.team}
                </Link>
                <span className="text-right font-mono tabular-nums text-foreground">
                  {r.apps}
                </span>
                <span className="text-right font-mono tabular-nums font-semibold text-amber-300">
                  {r.wins > 0 ? r.wins : <span className="text-muted-foreground/60">—</span>}
                </span>
                <span className="text-right font-mono tabular-nums text-foreground">
                  {r.topEight > 0 ? r.topEight : <span className="text-muted-foreground/60">—</span>}
                </span>
                <span className="text-right font-mono tabular-nums text-foreground">
                  {r.matchPlayWins > 0
                    ? r.matchPlayWins
                    : <span className="text-muted-foreground/60">—</span>}
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
              </>
            );
            return (
              <div key={r.team} className="border-b border-border/40 last:border-b-0">
                {shouldStagger ? (
                  <motion.div
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
                    data-active={isOpen}
                    className={rowCls}
                    variants={fadeSlideVariants}
                    initial="hidden"
                    animate="visible"
                    transition={{
                      duration: 0.25,
                      ease: [0.32, 0.72, 0, 1],
                      delay: rowIdx * 0.015,
                    }}
                  >
                    {rowInner}
                  </motion.div>
                ) : (
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
                    data-active={isOpen}
                    className={rowCls}
                  >
                    {rowInner}
                  </div>
                )}

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
                          {years.map((y, idx) => {
                            const cell = r.byYear.get(y);
                            const dim = !yearInActiveDecade(y);
                            const cellTransition = {
                              duration: 0.22,
                              ease: "easeOut" as const,
                              delay: reduced ? 0 : idx * 0.012,
                            };
                            if (!cell) {
                              return (
                                <motion.div
                                  key={y}
                                  initial={{ opacity: 0, scale: 0.94 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  transition={cellTransition}
                                  className={`rounded border border-dashed border-border/20 px-1.5 py-1 text-center ${dim ? "opacity-25" : ""}`}
                                >
                                  <div className="text-[10px] text-muted-foreground font-mono tabular-nums">
                                    {y}
                                  </div>
                                  <div className="text-[12px] font-mono tabular-nums text-muted-foreground/50">
                                    —
                                  </div>
                                </motion.div>
                              );
                            }
                            const isWin = cell.champion;
                            const madeMP = cell.matchPlaySeed !== null;
                            const advanced = madeMP && !isWin; // top-8 reach, not the winner
                            let cellCls: string;
                            let posCls: string;
                            if (isWin) {
                              cellCls = `rounded border border-amber-400/50 bg-amber-400/5 px-1.5 py-1 text-center transition-shadow duration-150 ease-out hover:border-amber-300/70 hover:bg-amber-400/10 hover:shadow-raised ${dim ? "opacity-25" : ""}`;
                              posCls = "font-semibold text-amber-300";
                            } else if (advanced) {
                              cellCls = `rounded border border-primary/40 bg-primary/5 px-1.5 py-1 text-center transition-shadow duration-150 ease-out hover:border-primary/70 hover:bg-primary/10 hover:shadow-raised ${dim ? "opacity-25" : ""}`;
                              posCls = "font-semibold text-primary";
                            } else if (cell.madeCut) {
                              cellCls = `rounded border border-primary/20 bg-card px-1.5 py-1 text-center transition-shadow duration-150 ease-out hover:border-primary/40 hover:shadow-raised ${dim ? "opacity-25" : ""}`;
                              posCls = "text-foreground/85";
                            } else {
                              // MC
                              cellCls = `rounded border border-border/40 bg-card/40 px-1.5 py-1 text-center transition-shadow duration-150 ease-out hover:border-border-medium hover:shadow-raised ${dim ? "opacity-25" : ""}`;
                              posCls = "text-muted-foreground";
                            }
                            return (
                              <motion.div
                                key={y}
                                initial={{ opacity: 0, scale: 0.94 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={cellTransition}
                                className={cellCls}
                                title={
                                  formatRunSummary(cell) ??
                                  (cell.madeCut
                                    ? `${y} · finish ${cell.position}`
                                    : `${y} · missed cut`)
                                }
                              >
                                <div className="text-[10px] text-muted-foreground font-mono tabular-nums flex items-center justify-center gap-0.5">
                                  {isWin && (
                                    <Trophy
                                      className="h-2.5 w-2.5 text-amber-300"
                                      aria-hidden="true"
                                    />
                                  )}
                                  <span>{y}</span>
                                </div>
                                <div className="text-[12px] font-mono tabular-nums">
                                  <span className={posCls}>{cell.position}</span>
                                </div>
                              </motion.div>
                            );
                          })}
                        </div>
                        {/* Readable run summaries for any match-play bracket years */}
                        {(() => {
                          const runs: string[] = [];
                          for (const y of years) {
                            const cell = r.byYear.get(y);
                            if (!cell) continue;
                            const summary = formatRunSummary(cell);
                            if (summary) runs.push(`${y}: ${summary}`);
                          }
                          if (runs.length === 0) return null;
                          return (
                            <div className="mt-3 text-[11px] text-muted-foreground flex flex-wrap gap-x-4 gap-y-0.5">
                              {runs.map((s) => (
                                <span key={s} className="font-mono tabular-nums">
                                  {s}
                                </span>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-tertiary">
        <span className="inline-flex items-center gap-1">
          <Trophy className="h-3 w-3 text-amber-300" aria-hidden="true" />
          won championship
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            aria-hidden="true"
            className="inline-block h-[6px] w-[6px] rounded-sm bg-primary/70"
          />
          reached match-play (top 8)
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            aria-hidden="true"
            className="inline-block h-[6px] w-[6px] rounded-sm border border-primary/40"
          />
          made 54-hole cut
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            aria-hidden="true"
            className="inline-block h-[6px] w-[6px] rounded-sm bg-muted-foreground/30"
          />
          missed cut (MC)
        </span>
      </div>
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
  const Icon = active
    ? dir === "asc"
      ? ChevronUp
      : ChevronDown
    : ChevronsUpDown;
  const iconClass = active ? "text-foreground/70" : "text-muted-foreground/40";
  const base = `label-caps inline-flex items-center gap-1 ${align === "right" ? "justify-end text-right ml-auto" : "justify-start text-left"} hover:text-foreground transition-colors rounded px-1 py-0.5`;
  const cls = active ? `${base} btn-lift` : base;
  return (
    <button type="button" onClick={onClick} title={title} className={cls}>
      <span>{label}</span>
      <Icon
        className={`h-3 w-3 transition-transform duration-150 ${iconClass}`}
        aria-hidden="true"
      />
    </button>
  );
}
