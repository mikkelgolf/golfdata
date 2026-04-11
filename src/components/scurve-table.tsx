"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { computeScurve, type ScurveAssignment, type ScurveMode } from "@/lib/scurve";
import type { TeamData } from "@/data/rankings-men";
import type { Regional } from "@/data/regionals-men-2026";
import {
  Search,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  ChevronRight,
  MapPin,
  Plane,
} from "lucide-react";
import HeadToHeadMatrix, { HeadToHeadCompact } from "@/components/head-to-head-matrix";

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
type ViewMode = "regional" | "scurve" | "visual";
type Gender = "men" | "women";

interface ScurveTableProps {
  menTeams: TeamData[];
  womenTeams: TeamData[];
  menRegionals: Regional[];
  womenRegionals: Regional[];
  lastUpdated: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEAMS_ADVANCING = 5; // top 5 per regional advance to nationals

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
        "px-2 py-2 text-[12px] font-medium text-muted-foreground uppercase tracking-wide cursor-pointer select-none whitespace-nowrap transition-colors hover:text-foreground",
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
  const initialMode = (searchParams.get("mode") as ScurveMode) || "committee";

  const [viewMode, setViewMode] = useState<ViewMode>(initialView);
  const [gender, setGender] = useState<Gender>(initialGender);
  const [scurveMode, setScurveMode] = useState<ScurveMode>(initialMode);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("seed");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const debouncedSearch = useDebounce(search, 300);

  // Persist to URL
  const updateUrl = useCallback(
    (v: ViewMode, g: Gender, m: ScurveMode) => {
      const params = new URLSearchParams();
      params.set("view", v);
      params.set("gender", g);
      params.set("mode", m);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router]
  );

  const handleViewChange = (v: ViewMode) => {
    setViewMode(v);
    setSortKey("seed");
    setSortDir("asc");
    updateUrl(v, gender, scurveMode);
  };

  const handleGenderChange = (g: Gender) => {
    setGender(g);
    updateUrl(viewMode, g, scurveMode);
  };

  const handleModeChange = (m: ScurveMode) => {
    setScurveMode(m);
    updateUrl(viewMode, gender, m);
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
    if (gender === "women") {
      if (womenTeams.length === 0 || womenRegionals.length === 0) return [];
      return computeScurve(womenTeams, womenRegionals, scurveMode);
    }
    return computeScurve(menTeams, menRegionals, scurveMode);
  }, [gender, menTeams, menRegionals, womenTeams, womenRegionals, scurveMode]);

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
    const result: { regional: Regional; teams: ScurveAssignment[] }[] = [];
    const regionals = gender === "men" ? menRegionals : womenRegionals;
    for (const r of regionals) {
      const teams = groups.get(r.id) ?? [];
      if (teams.length > 0) {
        result.push({ regional: r, teams });
      }
    }
    return result;
  }, [viewMode, sorted, gender, menRegionals, womenRegionals]);

  // Women - show data if available, otherwise show timeline
  if (gender === "women" && womenTeams.length === 0) {
    return (
      <div className="w-full">
        <FilterBar
          viewMode={viewMode}
          gender={gender}
          scurveMode={scurveMode}
          search={search}
          resultCount={0}
          lastUpdated={lastUpdated}
          onViewChange={handleViewChange}
          onGenderChange={handleGenderChange}
          onModeChange={handleModeChange}
          onSearchChange={setSearch}
        />
        <div className="mt-12 flex flex-col items-center gap-6 text-center">
          <div className="space-y-2">
            <p className="text-lg font-medium text-foreground">
              Women&apos;s Regional Predictions
            </p>
            <p className="text-sm text-muted-foreground max-w-md">
              Women&apos;s S-curve predictions will be available once
              rankings data is finalized. 72 teams across 6 regionals.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-lg">
            <div className="rounded-md border border-border bg-card px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Selections</p>
              <p className="text-sm font-medium text-foreground mt-0.5">Apr 29</p>
            </div>
            <div className="rounded-md border border-border bg-card px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Regionals</p>
              <p className="text-sm font-medium text-foreground mt-0.5">May 11-13</p>
            </div>
            <div className="rounded-md border border-border bg-card px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Nationals</p>
              <p className="text-sm font-medium text-foreground mt-0.5">May 17-22</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Visual S-curve view
  if (viewMode === "visual") {
    return (
      <div className="w-full">
        <FilterBar
          viewMode={viewMode}
          gender={gender}
          scurveMode={scurveMode}
          search={search}
          resultCount={filtered.length}
          lastUpdated={lastUpdated}
          onViewChange={handleViewChange}
          onGenderChange={handleGenderChange}
          onModeChange={handleModeChange}
          onSearchChange={setSearch}
        />
        <VisualScurve
          assignments={assignments}
          regionals={gender === "men" ? menRegionals : womenRegionals}
          regionalMap={regionalMap}
        />
      </div>
    );
  }

  return (
    <div className="w-full">
      <FilterBar
        viewMode={viewMode}
        gender={gender}
        scurveMode={scurveMode}
        search={search}
        resultCount={filtered.length}
        lastUpdated={lastUpdated}
        onViewChange={handleViewChange}
        onGenderChange={handleGenderChange}
        onModeChange={handleModeChange}
        onSearchChange={setSearch}
      />

      {/* Mode description */}
      <div className="mt-2 mb-1 text-[12px] text-text-tertiary">
        {scurveMode === "committee" ? (
          <span>Showing committee prediction - top seeds assigned by proximity, AQ geographic preference applied</span>
        ) : (
          <span>Showing strict mathematical S-curve - pure serpentine with host swaps only</span>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block mt-2 overflow-x-auto rounded-lg border border-border">
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
                className="w-[70px]"
                align="center"
              />
              <SortTh
                label="Type"
                sortKey="type"
                currentSort={sortKey}
                currentDir={sortDir}
                onSort={handleSort}
                className="w-[60px]"
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
                className="w-[70px]"
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

      {/* Mobile card view */}
      <div className="sm:hidden mt-2 space-y-1.5">
        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-[13px] text-muted-foreground">
            No teams match your search.
          </div>
        ) : viewMode === "regional" && grouped ? (
          grouped.map(({ regional, teams }) => (
            <MobileRegionalGroup
              key={regional.id}
              regional={regional}
              teams={teams}
              regionalMap={regionalMap}
            />
          ))
        ) : (
          sorted.map((team) => (
            <MobileTeamCard
              key={`${team.team}-${team.seed}`}
              team={team}
              regionalMap={regionalMap}
            />
          ))
        )}
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
  scurveMode,
  search,
  resultCount,
  lastUpdated,
  onViewChange,
  onGenderChange,
  onModeChange,
  onSearchChange,
}: {
  viewMode: ViewMode;
  gender: Gender;
  scurveMode: ScurveMode;
  search: string;
  resultCount: number;
  lastUpdated: string;
  onViewChange: (v: ViewMode) => void;
  onGenderChange: (g: Gender) => void;
  onModeChange: (m: ScurveMode) => void;
  onSearchChange: (s: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {/* Desktop */}
      <div className="hidden sm:flex items-center gap-3 flex-wrap">
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
            { value: "visual", label: "Visual" },
          ]}
          value={viewMode}
          onChange={(v) => onViewChange(v as ViewMode)}
        />

        {/* Mode toggle */}
        <SegmentedToggle
          options={[
            { value: "committee", label: "Committee" },
            { value: "strict", label: "Strict" },
          ]}
          value={scurveMode}
          onChange={(m) => onModeChange(m as ScurveMode)}
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
        <div className="flex items-center gap-3">
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
              { value: "visual", label: "Visual" },
            ]}
            value={viewMode}
            onChange={(v) => onViewChange(v as ViewMode)}
          />
        </div>
        <div className="flex items-center gap-3">
          <SegmentedToggle
            options={[
              { value: "committee", label: "Committee" },
              { value: "strict", label: "Strict" },
            ]}
            value={scurveMode}
            onChange={(m) => onModeChange(m as ScurveMode)}
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
// RegionalGroup (Desktop)
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
  const [expanded, setExpanded] = useState(false);
  const totalDistance = teams.reduce((sum, t) => sum + t.distanceMiles, 0);
  const avgDistance = Math.round(totalDistance / teams.length);

  return (
    <>
      {/* Regional header row */}
      <tr>
        <td
          colSpan={7}
          className="px-3 py-3.5 bg-card cursor-pointer hover:bg-card/80 transition-colors"
          style={{ borderLeft: `4px solid ${regional.color}` }}
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-baseline gap-2.5 flex-wrap">
              <span className="flex items-center gap-1.5">
                <ChevronRight
                  className={cn(
                    "h-3.5 w-3.5 text-muted-foreground transition-transform",
                    expanded && "rotate-90"
                  )}
                />
                <span className="font-semibold text-[14px] text-foreground leading-none">
                  {regional.name}
                </span>
              </span>
              <span className="text-[12px] text-muted-foreground leading-none">
                {regional.host} &middot; {regional.city}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-text-tertiary whitespace-nowrap">
              <span className="hidden md:inline">
                <Plane className="inline h-3 w-3 mr-0.5 opacity-60" />
                {avgDistance.toLocaleString()} mi avg
              </span>
              <span>{teams.length} teams</span>
            </div>
          </div>
        </td>
      </tr>

      {/* Expanded detail panel */}
      {expanded && (
        <tr>
          <td colSpan={7} className="p-0">
            <RegionalDetailPanel regional={regional} teams={teams} />
          </td>
        </tr>
      )}

      {/* Team rows with advancement line */}
      {teams.map((team, index) => {
        const rows = [
          <TeamRow
            key={`${team.team}-${team.seed}`}
            team={team}
            regionalMap={regionalMap}
            isHost={team.team === regional.host}
          />,
        ];
        if (index === TEAMS_ADVANCING - 1 && teams.length > TEAMS_ADVANCING) {
          rows.push(
            <tr key={`advancement-line-${regional.id}`}>
              <td colSpan={7} className="p-0">
                <div className="flex items-center gap-2 px-3 py-1">
                  <div className="flex-1 border-t border-dashed border-destructive/40" />
                  <span className="text-[10px] font-medium uppercase tracking-wider text-destructive/70 whitespace-nowrap">
                    Top 5 advance to nationals
                  </span>
                  <div className="flex-1 border-t border-dashed border-destructive/40" />
                </div>
              </td>
            </tr>
          );
        }
        return rows;
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// RegionalDetailPanel
// ---------------------------------------------------------------------------

function RegionalDetailPanel({
  regional,
  teams,
}: {
  regional: Regional;
  teams: ScurveAssignment[];
}) {
  const totalDistance = teams.reduce((sum, t) => sum + t.distanceMiles, 0);
  const avgDistance = Math.round(totalDistance / teams.length);
  const maxTravel = teams.reduce((max, t) => (t.distanceMiles > max.distanceMiles ? t : max), teams[0]);
  const minTravel = teams.reduce((min, t) => (t.distanceMiles < min.distanceMiles ? t : min), teams[0]);
  const aqCount = teams.filter((t) => t.isAutoQualifier).length;
  const hostTeam = teams.find((t) => t.team === regional.host);
  const conferences = [...new Set(teams.map((t) => t.conference))];

  return (
    <div
      className="bg-card/50 border-t border-b border-border/50 px-4 py-4"
      style={{ borderLeft: `4px solid ${regional.color}` }}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <StatBox label="Total Travel" value={`${totalDistance.toLocaleString()} mi`} />
        <StatBox label="Avg Travel" value={`${avgDistance.toLocaleString()} mi`} />
        <StatBox label="Auto Qualifiers" value={String(aqCount)} />
        <StatBox label="Conferences" value={String(conferences.length)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[13px]">
        {/* Travel extremes */}
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Travel</p>
          <p className="text-foreground">
            <MapPin className="inline h-3 w-3 mr-1 opacity-60" />
            <span className="font-medium">Longest:</span>{" "}
            {maxTravel.team} ({maxTravel.distanceMiles.toLocaleString()} mi)
          </p>
          <p className="text-foreground">
            <MapPin className="inline h-3 w-3 mr-1 opacity-60" />
            <span className="font-medium">Shortest:</span>{" "}
            {minTravel.team} ({minTravel.distanceMiles.toLocaleString()} mi)
          </p>
          {hostTeam && (
            <p className="text-foreground">
              <span className="font-medium">Host:</span>{" "}
              {hostTeam.team} (#{hostTeam.rank}, seed {hostTeam.seed})
            </p>
          )}
        </div>

        {/* Field strength */}
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Field Strength</p>
          <p className="text-foreground">
            <span className="font-medium">Highest seed:</span>{" "}
            #{teams[0]?.seed} {teams[0]?.team}
          </p>
          <p className="text-foreground">
            <span className="font-medium">Lowest seed:</span>{" "}
            #{teams[teams.length - 1]?.seed} {teams[teams.length - 1]?.team}
          </p>
          <p className="text-muted-foreground">
            {conferences.join(", ")}
          </p>
        </div>
      </div>

      {/* Head-to-Head Matrix */}
      <HeadToHeadMatrix
        teams={teams.map((t) => ({ team: t.team, seed: t.seed, rank: t.rank }))}
        regionalColor={regional.color}
      />
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-secondary/50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-[15px] font-semibold text-foreground mt-0.5">{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TeamRow (Desktop)
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
    <tr className="h-8 border-b border-border/40 hover:bg-secondary/40 transition-colors duration-100">
      {/* Seed */}
      <td className="px-2 text-center font-mono text-[13px] text-muted-foreground">
        {team.seed}
      </td>
      {/* Team */}
      <td className="px-2 text-left text-[13px] text-foreground whitespace-nowrap">
        <span className="font-medium">{team.team}</span>
        {isHost && (
          <span className="ml-1.5 inline-flex items-center rounded px-1 py-0 text-[9px] font-semibold uppercase tracking-wider bg-gold/15 text-gold">
            Host
          </span>
        )}
      </td>
      {/* Ranking */}
      <td className="px-2 text-center font-mono text-[13px] text-muted-foreground">
        #{team.rank}
      </td>
      {/* Conference */}
      <td className="px-2 text-center text-[13px] text-muted-foreground">
        {team.conference}
      </td>
      {/* Type */}
      <td className="px-2 text-center">
        {team.isAutoQualifier ? (
          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium bg-primary/15 text-primary">
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
          className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
          style={{
            borderLeft: `2px solid ${color}`,
            paddingLeft: "6px",
          }}
        >
          {regionalLabel}
        </span>
      </td>
      {/* Distance */}
      <td className="px-2 text-right font-mono text-[13px] text-muted-foreground whitespace-nowrap">
        {team.distanceMiles.toLocaleString()} mi
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Mobile Components
// ---------------------------------------------------------------------------

function MobileRegionalGroup({
  regional,
  teams,
  regionalMap,
}: {
  regional: Regional;
  teams: ScurveAssignment[];
  regionalMap: Map<number, Regional>;
}) {
  const [expanded, setExpanded] = useState(false);
  const totalDistance = teams.reduce((sum, t) => sum + t.distanceMiles, 0);
  const avgDistance = Math.round(totalDistance / teams.length);

  return (
    <div className="rounded-md border border-border overflow-hidden">
      {/* Regional header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-2.5 py-1.5 bg-card flex items-center justify-between"
        style={{ borderLeft: `3px solid ${regional.color}` }}
      >
        <div className="flex items-center gap-1.5">
          <ChevronRight
            className={cn(
              "h-3 w-3 text-muted-foreground transition-transform",
              expanded && "rotate-90"
            )}
          />
          <div className="text-left">
            <p className="font-semibold text-[13px] text-foreground leading-tight">{regional.name}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">
              {regional.host} &middot; {regional.city}
            </p>
          </div>
        </div>
        <div className="text-right text-[10px] text-text-tertiary leading-tight">
          <p>{teams.length} teams</p>
          <p>{avgDistance.toLocaleString()} mi avg</p>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-2.5 py-2 bg-card/50 border-t border-border/50 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <StatBox label="Total Travel" value={`${totalDistance.toLocaleString()} mi`} />
            <StatBox label="Auto Qualifiers" value={String(teams.filter((t) => t.isAutoQualifier).length)} />
          </div>
          <HeadToHeadCompact
            teams={teams.map((t) => ({ team: t.team, seed: t.seed, rank: t.rank }))}
          />
        </div>
      )}

      {/* Team cards */}
      <div className="divide-y divide-border/30">
        {teams.map((team, index) => (
          <div key={`${team.team}-${team.seed}`}>
            <MobileTeamCard
              team={team}
              regionalMap={regionalMap}
              isHost={team.team === regional.host}
              showRegional={false}
            />
            {index === TEAMS_ADVANCING - 1 && teams.length > TEAMS_ADVANCING && (
              <div className="flex items-center gap-1.5 px-2.5 py-0.5">
                <div className="flex-1 border-t border-dashed border-destructive/40" />
                <span className="text-[8px] font-medium uppercase tracking-wider text-destructive/60">
                  Advancing
                </span>
                <div className="flex-1 border-t border-dashed border-destructive/40" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function MobileTeamCard({
  team,
  regionalMap,
  isHost = false,
  showRegional = true,
}: {
  team: ScurveAssignment;
  regionalMap: Map<number, Regional>;
  isHost?: boolean;
  showRegional?: boolean;
}) {
  const regional = regionalMap.get(team.regionalId);
  const color = regional?.color ?? "#888";
  const regionalLabel = regional?.name.replace(/ Regional$/, "") ?? "";

  return (
    <div className="px-2 h-[30px] flex items-center gap-1.5">
      <span className="font-mono text-[11px] text-muted-foreground w-5 text-right shrink-0">
        {team.seed}
      </span>
      <span className="font-medium text-[12px] text-foreground truncate min-w-0">{team.team}</span>
      {isHost && (
        <span className="shrink-0 text-[7px] font-bold uppercase text-gold">H</span>
      )}
      {team.isAutoQualifier && (
        <span className="shrink-0 text-[7px] font-bold uppercase text-primary">AQ</span>
      )}
      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">#{team.rank}</span>
      <span className="shrink-0 text-[10px] text-muted-foreground">{team.conference}</span>
      {showRegional && (
        <span
          className="shrink-0 text-[9px] text-muted-foreground"
          style={{ borderLeft: `2px solid ${color}`, paddingLeft: "3px" }}
        >
          {regionalLabel}
        </span>
      )}
      <span className="ml-auto font-mono text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
        {team.distanceMiles.toLocaleString()} mi
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Visual S-Curve
// ---------------------------------------------------------------------------

function VisualScurve({
  assignments,
  regionals,
  regionalMap,
}: {
  assignments: ScurveAssignment[];
  regionals: Regional[];
  regionalMap: Map<number, Regional>;
}) {
  const numRegionals = regionals.length;
  const numTiers = Math.ceil(assignments.length / numRegionals);

  // Build the grid: tiers (rows) x regionals (columns)
  const grid: (ScurveAssignment | null)[][] = [];
  for (let tier = 0; tier < numTiers; tier++) {
    const row: (ScurveAssignment | null)[] = new Array(numRegionals).fill(null);
    grid.push(row);
  }

  // Place teams in the grid by their assigned regional
  // Group by regional, then fill tiers top-to-bottom
  const byRegional = new Map<number, ScurveAssignment[]>();
  for (const r of regionals) {
    byRegional.set(r.id, []);
  }
  for (const a of assignments) {
    byRegional.get(a.regionalId)?.push(a);
  }

  // Sort teams within each regional by seed
  for (const [, teams] of byRegional) {
    teams.sort((a, b) => a.seed - b.seed);
  }

  // Place into grid
  for (let colIdx = 0; colIdx < regionals.length; colIdx++) {
    const r = regionals[colIdx];
    const teams = byRegional.get(r.id) ?? [];
    for (let tierIdx = 0; tierIdx < teams.length; tierIdx++) {
      if (tierIdx < grid.length) {
        grid[tierIdx][colIdx] = teams[tierIdx];
      }
    }
  }

  return (
    <div className="mt-4">
      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-3">
        {regionals.map((r) => (
          <div key={r.id} className="flex items-center gap-1.5 text-[11px]">
            <div
              className="w-2 h-2 rounded-sm"
              style={{ backgroundColor: r.color }}
            />
            <span className="text-muted-foreground">{r.name.replace(/ Regional$/, "")}</span>
          </div>
        ))}
      </div>

      {/* Serpentine grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[700px]">
          {/* Regional headers */}
          <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: `repeat(${numRegionals}, 1fr)` }}>
            {regionals.map((r) => (
              <div
                key={r.id}
                className="text-center text-[10px] font-medium uppercase tracking-wide py-1 text-muted-foreground"
                style={{ borderBottom: `2px solid ${r.color}` }}
              >
                {r.name.replace(/ Regional$/, "")}
              </div>
            ))}
          </div>

          {/* Tiers */}
          {grid.map((row, tierIdx) => {
            const isReverse = tierIdx % 2 === 1;
            const displayRow = isReverse ? [...row].reverse() : row;
            const displayRegionals = isReverse ? [...regionals].reverse() : regionals;

            return (
              <div key={tierIdx} className="relative">
                {/* Serpentine direction indicator */}
                <div className="absolute -left-6 top-1/2 -translate-y-1/2 text-[10px] text-text-tertiary hidden lg:block">
                  {isReverse ? "\u2190" : "\u2192"}
                </div>

                <div
                  className="grid gap-1 mb-1"
                  style={{ gridTemplateColumns: `repeat(${numRegionals}, 1fr)` }}
                >
                  {displayRow.map((team, colIdx) => {
                    const r = displayRegionals[colIdx];
                    if (!team) {
                      return <div key={`empty-${tierIdx}-${colIdx}`} className="h-8" />;
                    }

                    const isHost = team.team === r?.host;
                    const isAboveLine = (() => {
                      // Check position within this regional
                      const regionalTeams = byRegional.get(team.regionalId) ?? [];
                      const posInRegional = regionalTeams.findIndex((t) => t.seed === team.seed);
                      return posInRegional < TEAMS_ADVANCING;
                    })();

                    return (
                      <div
                        key={`${team.team}-${team.seed}`}
                        className={cn(
                          "h-8 px-2 flex items-center rounded text-[11px] transition-colors cursor-default group relative",
                          isAboveLine
                            ? "bg-secondary/80 hover:bg-secondary"
                            : "bg-secondary/30 hover:bg-secondary/50"
                        )}
                        style={{ borderLeft: `3px solid ${r?.color ?? "#888"}` }}
                        title={`#${team.seed} ${team.team} (${team.conference}) - ${team.distanceMiles.toLocaleString()} mi to ${r?.name ?? ""}`}
                      >
                        <span className="font-mono text-[10px] text-muted-foreground mr-1.5 shrink-0 w-4">
                          {team.seed}
                        </span>
                        <span className={cn(
                          "truncate font-medium",
                          isAboveLine ? "text-foreground" : "text-muted-foreground"
                        )}>
                          {team.team}
                        </span>
                        {isHost && (
                          <span className="ml-auto shrink-0 text-[8px] font-bold text-gold uppercase">
                            H
                          </span>
                        )}
                        {team.isAutoQualifier && !isHost && (
                          <span className="ml-auto shrink-0 text-[8px] font-bold text-primary">
                            AQ
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Advancement line after tier containing 5th team */}
                {tierIdx === Math.floor((TEAMS_ADVANCING - 1)) && (
                  <div className="flex items-center gap-2 px-1 py-0.5">
                    <div className="flex-1 border-t border-dashed border-destructive/40" />
                    <span className="text-[9px] font-medium uppercase tracking-wider text-destructive/70">
                      Top {TEAMS_ADVANCING} advance
                    </span>
                    <div className="flex-1 border-t border-dashed border-destructive/40" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Summary stats */}
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        {regionals.map((r) => {
          const teams = byRegional.get(r.id) ?? [];
          const totalDist = teams.reduce((sum, t) => sum + t.distanceMiles, 0);
          const avgDist = teams.length > 0 ? Math.round(totalDist / teams.length) : 0;

          return (
            <div
              key={r.id}
              className="rounded-lg px-3 py-3 bg-card"
              style={{ borderLeft: `3px solid ${r.color}` }}
            >
              <p className="text-[11px] font-medium text-foreground">{r.name.replace(/ Regional$/, "")}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{r.host}</p>
              <div className="mt-2 space-y-0.5">
                <p className="text-[11px] text-muted-foreground">
                  <Plane className="inline h-3 w-3 mr-0.5 opacity-60" />
                  {avgDist.toLocaleString()} mi avg
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {totalDist.toLocaleString()} mi total
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
