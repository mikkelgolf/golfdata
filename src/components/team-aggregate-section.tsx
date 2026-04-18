"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { Gender, TeamAggregateEntry } from "@/data/records-types";
import { teamHref } from "@/lib/team-link";

interface Props {
  entries: TeamAggregateEntry[];
  valueLabel?: string;
  searchable?: boolean;
  gender?: Gender;
}

type SortKey = "value" | "school";
type SortDir = "asc" | "desc";

function compareValues(a: number | string, b: number | string): number {
  const aNum = typeof a === "number" ? a : parseFloat(a);
  const bNum = typeof b === "number" ? b : parseFloat(b);
  const aIsNum = Number.isFinite(aNum);
  const bIsNum = Number.isFinite(bNum);
  if (aIsNum && bIsNum) return aNum - bNum;
  return String(a).localeCompare(String(b));
}

export default function TeamAggregateSection({
  entries,
  valueLabel,
  searchable,
  gender,
}: Props) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = entries;
    if (q) {
      rows = rows.filter(
        (e) =>
          e.school.toLowerCase().includes(q) ||
          (e.detail ?? "").toLowerCase().includes(q)
      );
    }
    if (sortKey) {
      rows = [...rows].sort((a, b) => {
        const cmp =
          sortKey === "school"
            ? a.school.localeCompare(b.school)
            : compareValues(a.value, b.value);
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return rows;
  }, [entries, query, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir(key === "school" ? "asc" : "desc");
    } else {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    }
  };

  const showValueColumn = entries.some((e) => e.value !== "" && e.value !== 0);
  const headerClass =
    "label-caps text-left cursor-pointer select-none hover:text-foreground transition-colors";

  return (
    <div>
      {searchable && (
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${entries.length} teams`}
            className="w-full sm:w-64 rounded-md border border-border/60 bg-card pl-7 pr-2 py-1 text-[12px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      )}

      <div
        className={
          showValueColumn
            ? "grid grid-cols-[48px_1fr_1fr] label-caps py-1 border-b border-border/50"
            : "grid grid-cols-[1fr_1fr] label-caps py-1 border-b border-border/50"
        }
      >
        {showValueColumn && (
          <button
            type="button"
            onClick={() => toggleSort("value")}
            className={`${headerClass} text-right font-mono`}
          >
            {valueLabel || "#"}
            <SortArrow active={sortKey === "value"} dir={sortDir} />
          </button>
        )}
        <button
          type="button"
          onClick={() => toggleSort("school")}
          className={headerClass}
        >
          School
          <SortArrow active={sortKey === "school"} dir={sortDir} />
        </button>
        <span className="label-caps">Detail</span>
      </div>

      {filtered.length === 0 ? (
        <div className="py-3 text-[12px] text-muted-foreground italic">
          No matches.
        </div>
      ) : (
        filtered.map((e, i) => (
          <div
            key={`${e.school}-${i}`}
            className={
              showValueColumn
                ? "grid grid-cols-[48px_1fr_1fr] items-baseline gap-3 py-0.5"
                : "grid grid-cols-[1fr_1fr] items-baseline gap-3 py-0.5"
            }
          >
            {showValueColumn && (
              <span className="font-mono text-[13px] tabular-nums text-right">
                {e.value}
              </span>
            )}
            {gender ? (
              <Link
                href={teamHref(e.school, gender)}
                className="text-[13px] hover:text-primary transition-colors truncate"
              >
                {e.school}
              </Link>
            ) : (
              <span className="text-[13px]">{e.school}</span>
            )}
            <span className="text-[12px] text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis">
              {e.detail ?? ""}
            </span>
          </div>
        ))
      )}

      {searchable && query && (
        <div className="mt-1 text-[11px] text-muted-foreground">
          {filtered.length} of {entries.length} shown
        </div>
      )}
    </div>
  );
}

function SortArrow({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="ml-1 text-muted-foreground/30">↕</span>;
  return (
    <span className="ml-1 text-foreground/60">{dir === "asc" ? "↑" : "↓"}</span>
  );
}
