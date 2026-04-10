"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { computeScurve, type ScurveAssignment } from "@/lib/scurve";
import type { TeamData } from "@/data/rankings-men";
import type { Regional } from "@/data/regionals-men-2026";
import {
  Search,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SortKey =
  | "seed"
  | "team"
  | "rank"
  | "conference"
  | "type"
  | "regional"
  | "distance";
type SortDir = "asc" | "desc";
type ViewMode = "regional" | "scurve";
type Gender = "men" | "women";

interface ScurveTableProps {
  menTeams: TeamData[];
  womenTeams: TeamData[];
  menRegionals: Regional[];
  womenRegionals: Regional[];
  lastUpdated: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ---------------------------------------------------------------------------
// SortTh
// ---------------------------------------------------------------------------

function SortTh({
  label,
  sortKey,
  currentSort,
  currentDir,
  onSort,
  className,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  currentSort: SortKey;
  currentDir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
  align?: "left" | "center" | "right";
}) {
  const active = currentSort === sortKey;
  const alignClass =
    align === "center"
      ? "justify-center"
      : align === "right"
        ? "justify-end"
        : "justify-start";

  return (
    <th
      role="columnheader"
      aria-sort={active ? (currentDir === "asc" ? "ascending" : "descending") : "none"}
      tabIndex={0}
      className={cn(
        "px-2 py-1.5 text-[12px] font-medium text-muted-foreground uppercase tracking-wide cursor-pointer select-none whitespace-nowrap transition-colors hover:text-foreground",
        className
      )}
      onClick={() => onSort(sortKey)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSort(sortKey);
        }
      }}
    >
      <span className={cn("inline-flex items-center gap-0.5", alignClass)}>
        {label}
        {active ? (
          currentDir === "asc" ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-40" />
        )}
      </span>
    </th>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ScurveTable({
  menTeams,
  womenTeams,
  menRegionals,
  womenRegionals,
  lastUpdated,
}: ScurveTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL-persisted state
  const initialView = (searchParams.get("view") as ViewMode) || "regional";
  const initialGender = (searchParams.get("gender") as Gender) || "men";

  const [viewMode, setViewMode] = useState<ViewMode>(initialView);
  const [gender, setGender] = useState<Gender>(initialGender);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("seed");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const debouncedSearch = useDebounce(search, 300);

  // Persist to URL
  const updateUrl = useCallback(
    (v: ViewMode, g: Gender) => {
      const params = new URLSearchParams();
      params.set("view", v);
      params.set("gender", g);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router]
  );

  const handleViewChange = (v: ViewMode) => {
    setViewMode(v);
    // Reset sort when changing view
    setSortKey("seed");
    setSortDir("asc");
    updateUrl(v, gender);
  };

  const handleGenderChange = (g: Gender) => {
    setGender(g);
    updateUrl(viewMode, g);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  // Compute S-curve
  const assignments = useMemo(() => {
    if (gender === "women") return [];
    return computeScurve(menTeams, menRegionals);
  }, [gender, menTeams, menRegionals]);

  // Regional map for colors / names
  const regionalMap = useMemo(() => {
    const regs = gender === "men" ? menRegionals : womenRegionals;
    const map = new Map<number, Regional>();
    for (const r of regs) map.set(r.id, r);
    return map;
  }, [gender, menRegionals, womenRegionals]);

  // Filter
  const filtered = useMemo(() => {
    if (!debouncedSearch) return assignments;
    const q = debouncedSearch.toLowerCase();
    return assignments.filter(
      (t) =>
        t.team.toLowerCase().includes(q) ||
        t.conference.toLowerCase().includes(q) ||
        (regionalMap.get(t.regionalId)?.name ?? "").toLowerCase().includes(q)
    );
  }, [assignments, debouncedSearch, regionalMap]);

  // Sort
  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;

    arr.sort((a, b) => {
      switch (sortKey) {
        case "seed":
          return (a.seed - b.seed) * dir;
        case "team":
          return a.team.localeCompare(b.team) * dir;
        case "rank":
          return (a.rank - b.rank) * dir;
        case "conference":
          return a.conference.localeCompare(b.conference) * dir;
        case "type": {
          const aVal = a.isAutoQualifier ? 0 : 1;
          const bVal = b.isAutoQualifier ? 0 : 1;
          return (aVal - bVal) * dir;
        }
        case "regional":
          return (a.regionalId - b.regionalId) * dir;
        case "distance":
          return (a.distanceMiles - b.distanceMiles) * dir;
        default:
          return 0;
      }
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  // Group by regional
  const grouped = useMemo(() => {
    if (viewMode !== "regional") return null;
    const groups = new Map<number, ScurveAssignment[]>();
    for (const t of sorted) {
      const arr = groups.get(t.regionalId) ?? [];
      arr.push(t);
      groups.set(t.regionalId, arr);
    }
    // Sort groups by regional ID, respect user sort within each group
    const result: { regional: Regional; teams: ScurveAssignment[] }[] = [];
    const regionals = gender === "men" ? menRegionals : womenRegionals;
    for (const r of regionals) {
      const teams = groups.get(r.id) ?? [];
      // Don't re-sort — sorted memo already applied user's sort preference
      if (teams.length > 0) {
        result.push({ regional: r, teams });
      }
    }
    return result;
  }, [viewMode, sorted, gender, menRegionals, womenRegionals]);

  // Women placeholder
  if (gender === "women") {
    return (
      <div className="w-full">
        <FilterBar
          viewMode={viewMode}
          gender={gender}
          search={search}
          resultCount={0}
          lastUpdated={lastUpdated}
          onViewChange={handleViewChange}
          onGenderChange={handleGenderChange}
          onSearchChange={setSearch}
        />
        <div className="mt-16 flex flex-col items-center gap-3 text-center">
          <p className="text-lg font-medium text-foreground">
            Women&apos;s predictions coming soon
          </p>
          <p className="text-sm text-muted-foreground max-w-md">
            We&apos;re working on adding women&apos;s D1 rankings and regional
            predictions. Check back soon.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <FilterBar
        viewMode={viewMode}
        gender={gender}
        search={search}
        resultCount={filtered.length}
        lastUpdated={lastUpdated}
        onViewChange={handleViewChange}
        onGenderChange={handleGenderChange}
        onSearchChange={setSearch}
      />

      <div className="mt-3 overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-[13px]" aria-label="NCAA D1 Regional S-Curve Predictions">
          <thead className="sticky top-[var(--nav-height)] z-10 bg-background">
            <tr className="border-b border-border">
              <SortTh
                label="Seed"
                sortKey="seed"
                currentSort={sortKey}
                currentDir={sortDir}
                onSort={handleSort}
                className="w-[50px]"
                align="center"
              />
              <SortTh
                label="Team"
                sortKey="team"
                currentSort={sortKey}
                currentDir={sortDir}
                onSort={handleSort}
                className="min-w-[140px]"
              />
              <SortTh
                label="Ranking"
                sortKey="rank"
                currentSort={sortKey}
                currentDir={sortDir}
                onSort={handleSort}
                className="w-[60px]"
                align="center"
              />
              <SortTh
                label="Conf"
                sortKey="conference"
                currentSort={sortKey}
                currentDir={sortDir}
                onSort={handleSort}
                className="w-[70px] hidden md:table-cell"
                align="center"
              />
              <SortTh
                label="Type"
                sortKey="type"
                currentSort={sortKey}
                currentDir={sortDir}
                onSort={handleSort}
                className="w-[60px] hidden sm:table-cell"
                align="center"
              />
              <SortTh
                label="Regional"
                sortKey="regional"
                currentSort={sortKey}
                currentDir={sortDir}
                onSort={handleSort}
                className="w-[120px]"
              />
              <SortTh
                label="Distance"
                sortKey="distance"
                currentSort={sortKey}
                currentDir={sortDir}
                onSort={handleSort}
                className="w-[70px] hidden sm:table-cell"
                align="right"
              />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-[13px] text-muted-foreground">
                  No teams match your search.
                </td>
              </tr>
            ) : viewMode === "regional" && grouped
              ? grouped.map(({ regional, teams }) => (
                  <RegionalGroup
                    key={regional.id}
                    regional={regional}
                    teams={teams}
                    regionalMap={regionalMap}
                  />
                ))
              : sorted.map((team) => (
                  <TeamRow
                    key={`${team.team}-${team.seed}`}
                    team={team}
                    regionalMap={regionalMap}
                  />
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FilterBar
// ---------------------------------------------------------------------------

function FilterBar({
  viewMode,
  gender,
  search,
  resultCount,
  lastUpdated,
  onViewChange,
  onGenderChange,
  onSearchChange,
}: {
  viewMode: ViewMode;
  gender: Gender;
  search: string;
  resultCount: number;
  lastUpdated: string;
  onViewChange: (v: ViewMode) => void;
  onGenderChange: (g: Gender) => void;
  onSearchChange: (s: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {/* Desktop */}
      <div className="hidden sm:flex items-center gap-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search teams..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search teams"
            className="h-8 w-48 rounded-md border border-border bg-background pl-8 pr-3 text-[13px] text-foreground placeholder:text-text-placeholder focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {/* View toggle */}
        <SegmentedToggle
          options={[
            { value: "regional", label: "By Regional" },
            { value: "scurve", label: "S-Curve Order" },
          ]}
          value={viewMode}
          onChange={(v) => onViewChange(v as ViewMode)}
        />

        {/* Gender toggle */}
        <SegmentedToggle
          options={[
            { value: "men", label: "Men" },
            { value: "women", label: "Women" },
          ]}
          value={gender}
          onChange={(g) => onGenderChange(g as Gender)}
        />

        {/* Result count + last updated */}
        <div className="ml-auto flex items-center gap-3 text-[12px] text-muted-foreground">
          <span>{resultCount} teams</span>
          <span className="text-text-tertiary">Updated {lastUpdated}</span>
        </div>
      </div>

      {/* Mobile */}
      <div className="flex sm:hidden flex-col gap-2">
        <div className="flex items-center gap-2">
          <SegmentedToggle
            options={[
              { value: "men", label: "Men" },
              { value: "women", label: "Women" },
            ]}
            value={gender}
            onChange={(g) => onGenderChange(g as Gender)}
          />
          <SegmentedToggle
            options={[
              { value: "regional", label: "Regional" },
              { value: "scurve", label: "S-Curve" },
            ]}
            value={viewMode}
            onChange={(v) => onViewChange(v as ViewMode)}
          />
          <span className="ml-auto text-[11px] text-muted-foreground">
            {resultCount} teams
          </span>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search teams..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-3 text-[13px] text-foreground placeholder:text-text-placeholder focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SegmentedToggle
// ---------------------------------------------------------------------------

function SegmentedToggle({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex h-7 items-center rounded-md border border-border bg-secondary/50 p-0.5">
      {options.map((opt, i) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "h-6 px-2.5 text-[12px] font-medium rounded-[4px] transition-colors whitespace-nowrap",
            value === opt.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
            i > 0 && "border-l border-border/0"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// RegionalGroup
// ---------------------------------------------------------------------------

function RegionalGroup({
  regional,
  teams,
  regionalMap,
}: {
  regional: Regional;
  teams: ScurveAssignment[];
  regionalMap: Map<number, Regional>;
}) {
  return (
    <>
      {/* Regional header row */}
      <tr>
        <td
          colSpan={7}
          className="px-3 py-3.5 bg-card"
          style={{ borderLeft: `4px solid ${regional.color}` }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-baseline gap-2.5 flex-wrap">
              <span className="font-semibold text-[14px] text-foreground leading-none">
                {regional.name}
              </span>
              <span className="text-[12px] text-muted-foreground leading-none">
                {regional.host} &middot; {regional.city}
              </span>
            </div>
            <span className="text-[11px] text-text-tertiary whitespace-nowrap">
              {teams.length} teams
            </span>
          </div>
        </td>
      </tr>
      {teams.map((team) => (
        <TeamRow
          key={`${team.team}-${team.seed}`}
          team={team}
          regionalMap={regionalMap}
          isHost={team.team === regional.host}
        />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// TeamRow
// ---------------------------------------------------------------------------

function TeamRow({
  team,
  regionalMap,
  isHost = false,
}: {
  team: ScurveAssignment;
  regionalMap: Map<number, Regional>;
  isHost?: boolean;
}) {
  const regional = regionalMap.get(team.regionalId);
  const color = regional?.color ?? "#888";
  const regionalLabel = regional?.name.replace(/ Regional$/, "") ?? "";

  return (
    <tr className="h-9 border-b border-border/40 hover:bg-secondary/50 transition-colors duration-150">
      {/* Seed */}
      <td className="px-2 text-center font-mono text-[13px] text-muted-foreground">
        {team.seed}
      </td>
      {/* Team */}
      <td className="px-2 text-left text-[13px] text-foreground whitespace-nowrap">
        <span className="font-medium">{team.team}</span>
        {isHost && (
          <span className="ml-1.5 inline-flex items-center rounded px-1 py-0 text-[9px] font-semibold uppercase tracking-wider bg-amber-500/15 text-amber-400">
            Host
          </span>
        )}
      </td>
      {/* Ranking */}
      <td className="px-2 text-center font-mono text-[13px] text-muted-foreground">
        #{team.rank}
      </td>
      {/* Conference — hidden on mobile */}
      <td className="px-2 text-center text-[13px] text-muted-foreground hidden md:table-cell">
        {team.conference}
      </td>
      {/* Type — hidden on mobile */}
      <td className="px-2 text-center hidden sm:table-cell">
        {team.isAutoQualifier ? (
          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium bg-emerald-500/15 text-emerald-400">
            AQ
          </span>
        ) : (
          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium bg-secondary text-muted-foreground">
            AL
          </span>
        )}
      </td>
      {/* Regional */}
      <td className="px-2">
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{
            backgroundColor: `${color}20`,
            color: color,
          }}
        >
          {regionalLabel}
        </span>
      </td>
      {/* Distance — hidden on mobile */}
      <td className="px-2 text-right font-mono text-[13px] text-muted-foreground whitespace-nowrap hidden sm:table-cell">
        {team.distanceMiles.toLocaleString()} mi
      </td>
    </tr>
  );
}
