"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import type { Gender } from "@/data/records-types";

export interface TeamsIndexRow {
  team: string;
  slug: string;
  rank: number;
  conference: string;
  wins: number;
  losses: number;
  ties: number;
  eligible: boolean;
  isAutoQualifier: boolean;
  apps: number;
  nationals: number;
  regionalWins: number;
  bestFinish: number | null;
}

type GenderSel = Gender | "both";
type SortKey = "rank" | "team" | "apps" | "nationals" | "regionalWins" | "bestFinish" | "conference";
type SortDir = "asc" | "desc";

interface Props {
  menRows: TeamsIndexRow[];
  womenRows: TeamsIndexRow[];
}

function sortRows(rows: TeamsIndexRow[], key: SortKey, dir: SortDir): TeamsIndexRow[] {
  const factor = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case "rank":
        cmp = a.rank - b.rank;
        break;
      case "team":
        cmp = a.team.localeCompare(b.team);
        break;
      case "apps":
        cmp = a.apps - b.apps;
        break;
      case "nationals":
        cmp = a.nationals - b.nationals;
        break;
      case "regionalWins":
        cmp = a.regionalWins - b.regionalWins;
        break;
      case "bestFinish": {
        const ax = a.bestFinish ?? Number.POSITIVE_INFINITY;
        const bx = b.bestFinish ?? Number.POSITIVE_INFINITY;
        cmp = ax - bx;
        break;
      }
      case "conference":
        cmp = a.conference.localeCompare(b.conference);
        break;
    }
    if (cmp === 0) return a.rank - b.rank;
    return cmp * factor;
  });
}

export default function TeamsIndex({ menRows, womenRows }: Props) {
  const [gender, setGender] = useState<GenderSel>("both");
  const [query, setQuery] = useState("");
  const [conferences, setConferences] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const confList = useMemo(() => {
    const s = new Set<string>();
    const source =
      gender === "men" ? menRows : gender === "women" ? womenRows : [...menRows, ...womenRows];
    for (const r of source) s.add(r.conference);
    return [...s].sort();
  }, [gender, menRows, womenRows]);

  const filter = (rows: TeamsIndexRow[]) => {
    const q = query.trim().toLowerCase();
    let r = rows;
    if (q) {
      r = r.filter(
        (row) =>
          row.team.toLowerCase().includes(q) ||
          row.conference.toLowerCase().includes(q)
      );
    }
    if (conferences.size > 0) {
      r = r.filter((row) => conferences.has(row.conference));
    }
    return sortRows(r, sortKey, sortDir);
  };

  const toggleConf = (c: string) => {
    setConferences((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir(key === "team" || key === "conference" || key === "rank" || key === "bestFinish" ? "asc" : "desc");
    } else {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    }
  };

  const showMen = gender === "men" || gender === "both";
  const showWomen = gender === "women" || gender === "both";
  const filteredMen = showMen ? filter(menRows) : [];
  const filteredWomen = showWomen ? filter(womenRows) : [];

  return (
    <div className="space-y-5">
      {/* Filter bar */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-md border border-border bg-card p-0.5 text-[12px]">
            {(["both", "men", "women"] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGender(g)}
                className={
                  gender === g
                    ? "btn-lift rounded px-3 py-1 font-medium text-foreground"
                    : "rounded px-3 py-1 text-muted-foreground hover:text-foreground transition-colors"
                }
              >
                {g === "both" ? "All" : g === "men" ? "Men's" : "Women's"}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-80">
            <Search
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search team or conference…"
              className="w-full rounded-md border border-border bg-card py-1 pl-7 pr-7 text-[12px] placeholder:text-text-placeholder focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
          {conferences.size > 0 && (
            <button
              type="button"
              onClick={() => setConferences(new Set())}
              className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            >
              Clear {conferences.size} conference filter{conferences.size === 1 ? "" : "s"}
            </button>
          )}
        </div>

        {/* Conference chips */}
        <div className="flex flex-wrap gap-1">
          {confList.map((c) => {
            const active = conferences.has(c);
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
        </div>
      </div>

      {/* Tables */}
      <div className={gender === "both" ? "grid grid-cols-1 lg:grid-cols-2 gap-5" : ""}>
        {showMen && (
          <TableBlock
            title="Men's"
            rows={filteredMen}
            totalRows={menRows.length}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={toggleSort}
            gender="men"
          />
        )}
        {showWomen && (
          <TableBlock
            title="Women's"
            rows={filteredWomen}
            totalRows={womenRows.length}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={toggleSort}
            gender="women"
          />
        )}
      </div>
    </div>
  );
}

function TableBlock({
  title,
  rows,
  totalRows,
  sortKey,
  sortDir,
  onSort,
  gender,
}: {
  title: string;
  rows: TeamsIndexRow[];
  totalRows: number;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  gender: Gender;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-[12px] font-semibold uppercase tracking-wider text-foreground">
          {title}
        </h2>
        <span className="text-[11px] text-text-tertiary tabular-nums">
          {rows.length} of {totalRows}
        </span>
      </div>

      <div className="overflow-hidden rounded-md border border-border">
        <div className="grid grid-cols-[44px_minmax(140px,1.2fr)_minmax(60px,0.7fr)_44px_44px_44px_44px] items-center gap-1 bg-muted px-2 py-2 text-[10px]">
          <SortableHeader
            label="Rank"
            align="right"
            active={sortKey === "rank"}
            dir={sortDir}
            onClick={() => onSort("rank")}
          />
          <SortableHeader
            label="Team"
            active={sortKey === "team"}
            dir={sortDir}
            onClick={() => onSort("team")}
          />
          <SortableHeader
            label="Conf."
            active={sortKey === "conference"}
            dir={sortDir}
            onClick={() => onSort("conference")}
          />
          <SortableHeader
            label="Apps"
            align="right"
            title="NCAA regional appearances since 1989"
            active={sortKey === "apps"}
            dir={sortDir}
            onClick={() => onSort("apps")}
          />
          <SortableHeader
            label="Nat"
            align="right"
            title="Nationals appearances"
            active={sortKey === "nationals"}
            dir={sortDir}
            onClick={() => onSort("nationals")}
          />
          <SortableHeader
            label="Wins"
            align="right"
            title="Regional wins"
            active={sortKey === "regionalWins"}
            dir={sortDir}
            onClick={() => onSort("regionalWins")}
          />
          <SortableHeader
            label="Best"
            align="right"
            title="Best regional finish"
            active={sortKey === "bestFinish"}
            dir={sortDir}
            onClick={() => onSort("bestFinish")}
          />
        </div>
        <div>
          {rows.length === 0 ? (
            <div className="px-3 py-8 text-center text-[12px] text-muted-foreground italic">
              No teams match.
            </div>
          ) : (
            rows.map((r) => (
              <Link
                key={r.slug}
                href={`/teams/${gender}/${r.slug}`}
                className="grid grid-cols-[44px_minmax(140px,1.2fr)_minmax(60px,0.7fr)_44px_44px_44px_44px] items-center gap-1 bg-card px-2 py-1.5 text-[12px] border-b border-border/40 last:border-b-0 hover:bg-[hsl(var(--surface-raised))] transition-colors"
              >
                <span className="text-right font-mono tabular-nums text-muted-foreground">
                  #{r.rank}
                </span>
                <span className="truncate font-medium text-foreground">
                  {r.team}
                  {r.isAutoQualifier && (
                    <span className="ml-1.5 text-[9px] font-semibold text-primary uppercase">
                      AQ
                    </span>
                  )}
                </span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {r.conference}
                </span>
                <span className="text-right font-mono tabular-nums text-foreground">{r.apps}</span>
                <span className="text-right font-mono tabular-nums text-foreground">{r.nationals}</span>
                <span className="text-right font-mono tabular-nums font-semibold text-foreground">
                  {r.regionalWins}
                </span>
                <span className="text-right font-mono tabular-nums text-foreground">
                  {r.bestFinish ?? "—"}
                </span>
              </Link>
            ))
          )}
        </div>
      </div>
    </section>
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
