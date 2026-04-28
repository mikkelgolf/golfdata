"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  Medal,
  Search,
  X,
} from "lucide-react";
import type {
  Gender,
  RegionalFinish,
  RegionalFinishRich,
} from "@/data/records-types";
import { rankingsMen } from "@/data/rankings-men";
import { rankingsWomen } from "@/data/rankings-women";
import { allTeamsMen2026 } from "@/data/all-teams-men-2026";
import { allTeamsWomen2026 } from "@/data/all-teams-women-2026";
import { regionalsRich } from "@/data/regionals-rich";
import { championshipsHistory } from "@/data/championships-history";
import { getSeedingWindow } from "@/data/regionals-seeding";
import { teamHref } from "@/lib/team-link";
import { didAdvanceFromRegional, isRegionalWin } from "@/lib/streaks";
import { fadeSlideVariants, useReducedMotion } from "@/lib/animations";
import YearByYearWinnersGrid, {
  type YearWinners,
} from "@/components/year-by-year-winners-grid";

/** Year the NCAA Regionals/Championships were cancelled (COVID-19). */
const CANCELLED_YEAR = 2020;

interface Props {
  entries: RegionalFinish[];
}

interface YearCell {
  position: string;
  advanced: boolean;
  win: boolean;
}

interface TeamRow {
  team: string;
  byYear: Map<number, YearCell>;
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

function ordinalSuffix(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** Mirrors the tooltip built by team-page/regional-timeline.tsx so the same
 *  visual language reads the same verbal story on hover. Falls back to a
 *  short summary when the rich data (seed/SG/margin) isn't available — i.e.
 *  pre-seeding-era years. */
function buildRegionalTooltip(
  cell: YearCell,
  rich: RegionalFinishRich | undefined
): string | undefined {
  const parts: string[] = [];
  if (rich?.regional) parts.push(`Regional: ${rich.regional}`);
  if (rich?.seed != null) parts.push(`Seed #${rich.seed}`);
  if (rich?.sgTotal != null) {
    const sign = rich.sgTotal > 0 ? "+" : "";
    parts.push(`Team SG ${sign}${rich.sgTotal.toFixed(1)}`);
  }
  if (cell.win && rich?.margin != null && rich.margin > 0) {
    parts.push(`Won by ${rich.margin}`);
  }
  if (cell.win && rich?.titleCount != null) {
    parts.push(`${ordinalSuffix(rich.titleCount)} Regional title`);
  }
  if (parts.length === 0) {
    // Fallback when no rich row joined — still give the user something useful.
    if (cell.win) return "Regional title";
    if (cell.advanced) return `Finished ${cell.position} · advanced to Nationals`;
    return `Finished ${cell.position}`;
  }
  return parts.join(" · ");
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
  conferenceMap: Map<string, string>,
  ncaaByTeamYear: Set<string>,
  richAdvancedByTeamYear: Map<string, boolean | null>,
  seedingYears: Set<number>
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
    const win = isRegionalWin(e.position);
    // Combined advance truth — same precedence as the Team page's
    // PROGRAM HISTORY > Advanced stat, so the table's NAT count agrees
    // with the per-team page. See didAdvanceFromRegional in lib/streaks.
    const key = `${e.team}|${e.year}`;
    const advanced = didAdvanceFromRegional({
      richTeamAdvanced: richAdvancedByTeamYear.get(key) ?? null,
      ncaaAppearance: ncaaByTeamYear.has(key),
      basicAdvanced: e.advanced,
      yearInSeedingWindow: seedingYears.has(e.year),
    });
    r.byYear.set(e.year, { position: e.position, advanced, win });
    r.apps += 1;
    if (win) r.wins += 1;
    if (advanced) r.nationals += 1;
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

/**
 * Derives the regional winner(s) for each year from a flat list of regional
 * finishes. "Win" = position "1" or "T1" (tie handled by isRegionalWin).
 * Most modern years produce ~6 winners (one per regional site). Early years
 * had fewer sites, so fewer winners. Ties produce additional winners per
 * site. 2020 was cancelled (COVID) → surfaced as a dashed cell.
 */
function buildWinnersByYear(
  entries: RegionalFinish[],
  years: number[]
): YearWinners[] {
  const byYear = new Map<number, string[]>();
  for (const e of entries) {
    if (!isRegionalWin(e.position)) continue;
    const arr = byYear.get(e.year);
    if (arr) arr.push(e.team);
    else byYear.set(e.year, [e.team]);
  }
  return years.map((y) => ({
    year: y,
    winners: byYear.get(y) ?? [],
    cancelled: y === CANCELLED_YEAR,
  }));
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
  const [winnersOpen, setWinnersOpen] = useState(false);
  const reduced = useReducedMotion();

  // Blur-up intro on the outer table container.
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setLoaded(true), 60);
    return () => clearTimeout(t);
  }, []);

  // Gate row stagger to the initial mount only — re-renders from filter/sort
  // changes must not re-trigger the entrance stagger.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 1200);
    return () => clearTimeout(t);
  }, []);

  const conferenceMap = useMemo(() => buildConferenceMap(gender), [gender]);

  // (team|year) sets used by buildRows to compute the combined "advanced"
  // signal — keeps the NAT count in sync with the Team page's PROGRAM
  // HISTORY > Advanced stat.
  const ncaaByTeamYear = useMemo(() => {
    const s = new Set<string>();
    for (const c of championshipsHistory) {
      if (c.gender === gender) s.add(`${c.team}|${c.year}`);
    }
    return s;
  }, [gender]);

  const richAdvancedByTeamYear = useMemo(() => {
    const m = new Map<string, boolean | null>();
    for (const r of regionalsRich) {
      if (r.gender !== gender) continue;
      m.set(`${r.team}|${r.year}`, r.teamAdvanced ?? null);
    }
    return m;
  }, [gender]);

  // Inside the seeding-data window the rich sheet's "Team Advanced"
  // column is authoritative; outside it we fall back to the OR of all
  // signals. See didAdvanceFromRegional in lib/streaks.
  const seedingYears = useMemo(() => getSeedingWindow(gender).years, [gender]);

  const { rows, years } = useMemo(
    () =>
      buildRows(
        entries.filter((e) => e.gender === gender),
        conferenceMap,
        ncaaByTeamYear,
        richAdvancedByTeamYear,
        seedingYears
      ),
    [entries, gender, conferenceMap, ncaaByTeamYear, richAdvancedByTeamYear, seedingYears]
  );

  const winnersByYear = useMemo(
    () =>
      buildWinnersByYear(
        entries.filter((e) => e.gender === gender),
        years
      ),
    [entries, gender, years]
  );

  // Rich-detail join by (team|year) for the current gender. Seed + SG + margin
  // + regional site come from here — lossy before the seeding era (~2002),
  // tiles gracefully fall back to no badge / short tooltip when missing.
  const richByTeamYear = useMemo(() => {
    const m = new Map<string, RegionalFinishRich>();
    for (const r of regionalsRich) {
      if (r.gender !== gender) continue;
      m.set(`${r.team}|${r.year}`, r);
    }
    return m;
  }, [gender]);

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

  // Per-winner predicate for the winners grid: when the conference filter
  // is active, non-matching winners' badges are replaced with an em-dash.
  // Mirrors the NCAA championships page pattern.
  const winnerMatchesConfFilter = (team: string): boolean => {
    if (confFilter.size === 0) return true;
    return confFilter.has(conferenceMap.get(team) ?? "—");
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

        {/* Decade filter temporarily removed — see NCAA championships page.
            State + yearInActiveDecade are kept so the per-team expanded
            grid's dim behavior returns as soon as the filter does. */}

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

      {winnersByYear.length > 0 && (
        <section
          aria-label="Winners By Year"
          className="overflow-hidden rounded-md border border-border bg-card/20"
        >
          <button
            type="button"
            onClick={() => setWinnersOpen((o) => !o)}
            aria-expanded={winnersOpen}
            aria-controls="regional-winners-by-year-grid"
            className="w-full flex items-start gap-2 p-3 sm:p-4 text-left hover:bg-card/30 transition-colors"
          >
            <ChevronRight
              className={`mt-[3px] h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150 ${winnersOpen ? "rotate-90" : ""}`}
              aria-hidden="true"
            />
            <h2 className="text-[13px] sm:text-[14px] font-semibold text-foreground">
              Winners By Year
            </h2>
          </button>
          <AnimatePresence initial={false}>
            {winnersOpen && (
              <motion.div
                key="regional-winners-grid"
                id="regional-winners-by-year-grid"
                initial={reduced ? false : { height: 0, opacity: 0 }}
                animate={reduced ? undefined : { height: "auto", opacity: 1 }}
                exit={reduced ? undefined : { height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
                className="overflow-hidden"
              >
                <div className="px-3 sm:px-4 pb-3 sm:pb-4">
                  <YearByYearWinnersGrid
                    results={winnersByYear}
                    gender={gender}
                    isWinnerActive={winnerMatchesConfFilter}
                    cancelledTitle="No NCAA Regionals (COVID-19)"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      )}

      <div
        className="overflow-x-auto overflow-y-hidden rounded-md border border-border"
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
        <div className="grid min-w-[660px] grid-cols-[24px_minmax(140px,1fr)_96px_96px_56px_48px_56px_minmax(80px,1fr)] items-center gap-1 bg-muted px-2 py-2 text-[10px]">
          <span />
          <SortableHeader
            label="Team"
            active={sortKey === "team"}
            dir={sortDir}
            onClick={() => toggleSort("team")}
          />
          <SortableHeader
            label="Regional Appearances"
            align="center"
            title="Total Regional appearances"
            active={sortKey === "apps"}
            dir={sortDir}
            onClick={() => toggleSort("apps")}
          />
          <SortableHeader
            label="Adv to NCAAs"
            align="center"
            title="Times advanced from Regional to the NCAA Championship"
            active={sortKey === "nationals"}
            dir={sortDir}
            onClick={() => toggleSort("nationals")}
          />
          <SortableHeader
            label="Wins"
            align="center"
            title="Regional wins"
            active={sortKey === "wins"}
            dir={sortDir}
            onClick={() => toggleSort("wins")}
          />
          <SortableHeader
            label="Best"
            align="center"
            title="Best regional finish"
            active={sortKey === "bestFinish"}
            dir={sortDir}
            onClick={() => toggleSort("bestFinish")}
          />
          <SortableHeader
            label="Last"
            align="center"
            title="Last year making regionals"
            active={sortKey === "lastAppearance"}
            dir={sortDir}
            onClick={() => toggleSort("lastAppearance")}
          />
          <SortableHeader
            label="Conf."
            align="center"
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
              "grid w-full min-w-[660px] grid-cols-[24px_minmax(140px,1fr)_96px_96px_56px_48px_56px_minmax(80px,1fr)] items-center gap-1 px-2 py-1.5 text-left text-[12px] cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-ring ring-card shadow-flat transition-shadow duration-150 ease-out data-[active=true]:shadow-raised";
            const rowCls = isOpen ? rowBase : `${rowBase} hover:shadow-raised`;
            // Only stagger the first 24 rows, and only on initial mount.
            const shouldStagger =
              !reduced && !mounted && rowIdx < 24;
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
                <span className="text-center font-mono tabular-nums text-foreground">{r.apps}</span>
                <span className="text-center font-mono tabular-nums text-foreground">{r.nationals}</span>
                <span className="text-center font-mono tabular-nums font-semibold text-foreground">
                  {r.wins}
                </span>
                <span className="text-center font-mono tabular-nums text-foreground">
                  {r.bestFinish ?? "—"}
                </span>
                <span className="text-center font-mono tabular-nums text-muted-foreground">
                  {r.lastAppearance ?? "—"}
                </span>
                <span className="truncate text-center text-[11px] text-muted-foreground">
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
                        <div
                          dir="rtl"
                          className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-1.5"
                        >
                          {/* Render newest-first so the RTL grid places
                              the most recent year in the top-right corner,
                              matching team-page regional-timeline. */}
                          {[...years].reverse().map((y, idx) => {
                            const cell = r.byYear.get(y);
                            const dim = !yearInActiveDecade(y);
                            const cellTransition = {
                              duration: 0.22,
                              ease: "easeOut" as const,
                              delay: reduced ? 0 : idx * 0.012,
                            };
                            const cancelled = y === CANCELLED_YEAR;
                            const rich = cell
                              ? richByTeamYear.get(`${r.team}|${y}`)
                              : undefined;

                            // Cancelled year: dashed + muted "—" regardless of
                            // whether the team had an entry that year (they
                            // can't — the tournament didn't happen).
                            if (cancelled) {
                              return (
                                <motion.div
                                  key={y}
                                  dir="ltr"
                                  initial={{ opacity: 0, scale: 0.94 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  transition={cellTransition}
                                  title="No NCAA postseason (COVID-19)"
                                  className={`rounded border border-dashed border-border/40 bg-card/20 px-1.5 py-1 text-center ${dim ? "opacity-25" : ""}`}
                                >
                                  <div className="text-[10px] text-text-tertiary font-mono tabular-nums">
                                    {y}
                                  </div>
                                  <div className="text-[12px] font-mono tabular-nums text-text-tertiary/60">
                                    —
                                  </div>
                                </motion.div>
                              );
                            }

                            // No appearance that year → dashed empty cell.
                            if (!cell) {
                              return (
                                <motion.div
                                  key={y}
                                  dir="ltr"
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

                            const win = cell.win;
                            const missed = !cell.advanced && !win;
                            const expectedAdv = rich?.expectedAdv ?? null;
                            const boxClass = win
                              ? `rounded border border-amber-400/40 bg-amber-400/[0.06] px-1.5 py-1 text-center transition-colors duration-100 hover:border-amber-300/70 hover:bg-amber-400/10 hover:shadow-raised ${dim ? "opacity-25" : ""}`
                              : `rounded border border-border/40 bg-card/40 px-1.5 py-1 text-center transition-colors duration-100 hover:border-border-medium hover:shadow-raised ${dim ? "opacity-25" : ""}`;
                            // Position color precedence — same rules as
                            // team-page/regional-timeline:
                            //   win → amber, advanced → emerald,
                            //   missed → muted rose,
                            //   appeared but expected to advance and didn't → red,
                            //   appeared but not expected and didn't → neutral.
                            const posClass = win
                              ? "text-amber-300"
                              : cell.advanced
                                ? "text-emerald-400"
                                : missed
                                  ? "text-rose-400/80"
                                  : expectedAdv === true
                                    ? "text-rose-400"
                                    : "text-foreground/80";
                            // Seed color tracks committee expectation:
                            // true → green, false → red, null → muted.
                            const seedClass =
                              expectedAdv === true
                                ? "text-emerald-400/90"
                                : expectedAdv === false
                                  ? "text-rose-400/90"
                                  : "text-text-tertiary/80";
                            const cellTitle = buildRegionalTooltip(
                              cell,
                              rich
                            );
                            const seed = rich?.seed;
                            // Prefer the rich sheet's "Team Result" string
                            // (e.g. "T5") so ties are visible; fall back to
                            // the basic numeric position when rich data is
                            // absent (older rows / unmatched edge cases).
                            const positionLabel = rich?.result ?? cell.position;
                            // Seed is shown whenever the team appeared that
                            // year and we have seed data (seeding era ~2002+).
                            // This matches team-page/regional-timeline, which
                            // only hides the seed for true no-appearance /
                            // cancelled years, not for non-advancing teams.
                            const showSeed = seed != null;

                            return (
                              <motion.div
                                key={y}
                                dir="ltr"
                                initial={{ opacity: 0, scale: 0.94 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={cellTransition}
                                title={cellTitle}
                                className={boxClass}
                              >
                                <div className="text-[10px] text-text-tertiary font-mono tabular-nums flex items-center justify-center gap-0.5 leading-tight">
                                  <span>{y}</span>
                                  {win ? (
                                    <Medal
                                      className="h-2.5 w-2.5 text-amber-300"
                                      aria-hidden="true"
                                    />
                                  ) : null}
                                </div>
                                <div className="text-[12px] font-mono tabular-nums leading-tight">
                                  <span className={posClass}>
                                    {positionLabel}
                                  </span>
                                </div>
                                {showSeed ? (
                                  <div className={`text-[9px] font-mono tabular-nums leading-none ${seedClass}`}>
                                    #{seed}
                                  </div>
                                ) : null}
                              </motion.div>
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

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-tertiary">
        <span className="inline-flex items-center gap-1">
          <Medal className="h-3 w-3 text-amber-300" aria-hidden="true" />
          Regional title
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            aria-hidden="true"
            className="inline-block h-[6px] w-[6px] rounded-sm bg-emerald-400/70"
          />
          advanced to Nationals
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            aria-hidden="true"
            className="inline-block h-[6px] w-[6px] rounded-sm bg-rose-400/70"
          />
          did not advance
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            aria-hidden="true"
            className="inline-block h-[6px] w-[6px] rounded-sm border border-dashed border-border/60"
          />
          no appearance / cancelled
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            aria-hidden="true"
            className="font-mono tabular-nums text-emerald-400/90"
          >
            #
          </span>
          Regional seed, expected to advance
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            aria-hidden="true"
            className="font-mono tabular-nums text-rose-400/90"
          >
            #
          </span>
          underdog
        </span>
        <span className="text-text-tertiary/80">
          Tap a team to see year-by-year finishes.
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
  align?: "right" | "center";
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
  const alignCls =
    align === "right"
      ? "justify-end text-right ml-auto"
      : align === "center"
        ? "justify-center text-center mx-auto"
        : "justify-start text-left";
  // `flex` (not inline-flex) + min-w-0 lets the label span wrap onto a
  // second line when the column is narrower than the label. Short labels
  // ("Wins", "Best") still render single-line; longer ones ("Regional
  // Appearances", "Adv to NCAAs") wrap cleanly with the icon next to the
  // wrapped block.
  const base = `label-caps flex max-w-full items-center gap-1 ${alignCls} hover:text-foreground transition-colors rounded px-1 py-0.5 leading-tight`;
  const cls = active ? `${base} btn-lift` : base;
  return (
    <button type="button" onClick={onClick} title={title} className={cls}>
      <span className="min-w-0 whitespace-normal break-words">{label}</span>
      <Icon
        className={`h-3 w-3 shrink-0 transition-transform duration-150 ${iconClass}`}
        aria-hidden="true"
      />
    </button>
  );
}
