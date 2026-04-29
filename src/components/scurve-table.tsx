"use client";

import { Fragment, useState, useMemo, useCallback, useEffect, useRef, useTransition, useDeferredValue } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { teamHref } from "@/lib/team-link";
import { computeScurve, computeRegionalSeeds, computeRegionalPositions, type ScurveAssignment, type ScurveMode } from "@/lib/scurve";
import { ManualGridTable } from "@/components/manual-grid-table";
import ManualGridMap from "@/components/manual-grid-map";
import HeadToHeadBrowser from "@/components/head-to-head-browser";
import { AdvancementBars } from "@/components/advancement-bars";
import type { TeamData } from "@/data/rankings-men";
import type { Regional } from "@/data/regionals-men-2026";
import type { Championship } from "@/data/championships-men-2026";
import type { ActualSelection } from "@/data/regionals-actual-men-2026";
import {
  Search,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  ChevronRight,
  Info,
  MapPin,
  Plane,
  ExternalLink,
} from "lucide-react";
import HeadToHeadMatrix from "@/components/head-to-head-matrix";
import { ConferenceBadge } from "@/components/conference-badge";
import USMap from "@/components/us-map";
import { Sparkline } from "@/components/sparkline";
import { AnimatedNumber } from "@/components/animated-number";
import { BeeswarmTravel } from "@/components/beeswarm-travel";
import { getRankHistory } from "@/lib/rank-history";

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
type ViewMode = "regional" | "scurve" | "visual" | "breakdown" | "map" | "manual" | "advancement";
type Gender = "men" | "women";

interface ScurveTableProps {
  menTeams: TeamData[];
  womenTeams: TeamData[];
  menRegionals: Regional[];
  womenRegionals: Regional[];
  menChampionships?: Championship[];
  womenChampionships?: Championship[];
  /** Empty until the men's selection committee announces its field. */
  menActual?: ActualSelection[];
  /** Empty until the women's selection committee announces its field. */
  womenActual?: ActualSelection[];
  /** Pre-formatted (e.g. "Apr 29, 26") date of the men's active rankings snapshot. */
  lastUpdatedMen: string;
  /** Pre-formatted (e.g. "Apr 28, 26") date of the women's active rankings snapshot. */
  lastUpdatedWomen: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEAMS_ADVANCING = 5; // top 5 per regional advance to nationals

// ---------------------------------------------------------------------------
// Shared data prep — single source of truth for both desktop & mobile visual
// ---------------------------------------------------------------------------

function useScurveGrid(
  assignments: ScurveAssignment[],
  regionals: Regional[],
  regionalSeeds: Map<number, number>
) {
  const orderedRegionals = useMemo(
    () =>
      [...regionals].sort(
        (a, b) => (regionalSeeds.get(a.id) ?? 99) - (regionalSeeds.get(b.id) ?? 99)
      ),
    [regionals, regionalSeeds]
  );

  const byRegional = useMemo(() => {
    const map = new Map<number, ScurveAssignment[]>();
    for (const r of orderedRegionals) map.set(r.id, []);
    for (const a of assignments) map.get(a.regionalId)?.push(a);
    for (const [, teams] of map) teams.sort((a, b) => a.seed - b.seed);
    return map;
  }, [assignments, orderedRegionals]);

  const numRegionals = regionals.length;
  const numTiers = Math.ceil(assignments.length / numRegionals);

  const grid = useMemo(() => {
    const g: (ScurveAssignment | null)[][] = [];
    for (let tier = 0; tier < numTiers; tier++) {
      g.push(new Array(numRegionals).fill(null));
    }
    for (let colIdx = 0; colIdx < orderedRegionals.length; colIdx++) {
      const r = orderedRegionals[colIdx];
      const teams = byRegional.get(r.id) ?? [];
      for (let tierIdx = 0; tierIdx < teams.length; tierIdx++) {
        if (tierIdx < g.length) {
          g[tierIdx][colIdx] = teams[tierIdx];
        }
      }
    }
    return g;
  }, [byRegional, orderedRegionals, numRegionals, numTiers]);

  return { orderedRegionals, byRegional, grid, numRegionals, numTiers };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Links a team name to its team page. Default styling is inherited from the
 * parent so we don't disturb existing typography — we just add a subtle hover
 * color shift and stopPropagation so the link works inside rows that have
 * their own onClick (e.g. the RegionalGroup header expands on click; inner
 * team rows don't, but this keeps the helper safe to drop anywhere).
 */
function TeamLink({
  team,
  gender,
  className,
  children,
  hostColor,
}: {
  team: string;
  gender: Gender;
  className?: string;
  children: React.ReactNode;
  /**
   * When set, the team hosts a regional — render the name in that regional's
   * color and bold, so the host stands out on every tab except Map. This
   * applies even when the host team is assigned elsewhere (Strict mode).
   */
  hostColor?: string;
}) {
  return (
    <Link
      href={teamHref(team, gender)}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "hover:text-primary transition-colors",
        hostColor && "font-bold",
        className
      )}
      style={hostColor ? { color: hostColor } : undefined}
    >
      {children}
    </Link>
  );
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ---------------------------------------------------------------------------
// InfoTooltip — accessible hover/focus tooltip with no extra deps
// ---------------------------------------------------------------------------

function InfoTooltip({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative inline-flex items-center align-middle group ml-1" tabIndex={0}>
      <Info className="h-3 w-3 text-text-tertiary cursor-help group-hover:text-foreground group-focus:text-foreground transition-colors" />
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-[60]",
          "w-[260px] px-2.5 py-2 rounded-md border border-border bg-background shadow-overlay",
          "text-[11px] text-foreground leading-snug font-normal normal-case tracking-normal text-left",
          "opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus:opacity-100 group-focus:visible",
          "transition-opacity duration-150"
        )}
      >
        {children}
      </span>
    </span>
  );
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
  menChampionships,
  womenChampionships,
  menActual,
  womenActual,
  lastUpdatedMen,
  lastUpdatedWomen,
}: ScurveTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Has the selection committee published this gender's bracket yet? Drives
  // both tab visibility and the default-mode logic below.
  const hasActualMen = (menActual?.length ?? 0) > 0;
  const hasActualWomen = (womenActual?.length ?? 0) > 0;

  // URL-persisted state
  const rawView = searchParams.get("view");
  const legacyAdvancementViews = new Set([
    "projections",
    "advancement-visual",
    "advancement-bars",
    "advancement-sankey",
  ]);
  const initialView: ViewMode =
    rawView && legacyAdvancementViews.has(rawView)
      ? "advancement"
      : ((rawView as ViewMode) || "map");
  const initialGender = (searchParams.get("gender") as Gender) || "men";
  const hasActualForInitialGender =
    initialGender === "men" ? hasActualMen : hasActualWomen;
  // Mode is intentionally NOT URL-persisted (unlike view + gender). The site
  // default — "actual" when that gender's bracket has been published,
  // "committee" otherwise — should win on every fresh mount: page refresh,
  // navigate-away-and-back, even an old shared `?mode=` link. User overrides
  // (clicking Committee or Strict) are session-only and reset on the next
  // gender flip or reload.
  const initialMode: ScurveMode = hasActualForInitialGender ? "actual" : "committee";

  const [viewMode, setViewMode] = useState<ViewMode>(initialView);
  const [gender, setGender] = useState<Gender>(initialGender);
  const [scurveMode, setScurveMode] = useState<ScurveMode>(initialMode);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("seed");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Date label that follows the gender toggle: men sees the men's active
  // snapshot date, women sees the women's. Today they often differ — women
  // is pinned to a frozen-for-regionals date while men keeps tracking the
  // latest pull. Future historical-snapshot picker will replace these props
  // with whichever snapshot the user selects per gender.
  const activeLastUpdated = gender === "men" ? lastUpdatedMen : lastUpdatedWomen;

  // useTransition lets the old view stay on screen at reduced opacity
  // while React computes the new one — no flash, no skeleton on swap.
  const [isPending, startTransition] = useTransition();

  // useDeferredValue dims the table while a filter resolves — premium
  // alternative to a debounce + spinner.
  const deferredSearch = useDeferredValue(search);
  const isStale = deferredSearch !== search;

  // Persist view + gender to URL (mode is intentionally session-only — see
  // initialMode comment above).
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
    startTransition(() => {
      setViewMode(v);
      setSortKey("seed");
      setSortDir("asc");
      updateUrl(v, gender);
    });
  };

  const handleGenderChange = (g: Gender) => {
    startTransition(() => {
      // Always reset to the new gender's site default — actual if its
      // committee has published, committee otherwise. Any user override
      // from the previous gender does not carry over. This matches the
      // "any reload-triggering action returns to default" rule.
      const hasActualForG = g === "men" ? hasActualMen : hasActualWomen;
      const defaultMode: ScurveMode = hasActualForG ? "actual" : "committee";
      setGender(g);
      setScurveMode(defaultMode);
      updateUrl(viewMode, g);
    });
  };

  const handleModeChange = (m: ScurveMode) => {
    startTransition(() => {
      // Session-only — no URL write. Reload, gender flip, or nav-away-and-back
      // returns to default.
      setScurveMode(m);
    });
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  // Mode tabs visible for the active gender. "Actual" only appears once that
  // gender's committee has published its bracket; when present it leads the
  // list (and is the default — see initialMode + handleGenderChange).
  const availableModes = useMemo<ScurveMode[]>(() => {
    const hasActual = gender === "men" ? hasActualMen : hasActualWomen;
    return hasActual
      ? ["actual", "committee", "strict"]
      : ["committee", "strict"];
  }, [gender, hasActualMen, hasActualWomen]);

  // Compute S-curve
  const assignments = useMemo(() => {
    if (gender === "women") {
      if (womenTeams.length === 0 || womenRegionals.length === 0) return [];
      return computeScurve(womenTeams, womenRegionals, scurveMode, "women", womenChampionships, womenActual);
    }
    return computeScurve(menTeams, menRegionals, scurveMode, "men", menChampionships, menActual);
  }, [gender, menTeams, menRegionals, womenTeams, womenRegionals, scurveMode, menChampionships, womenChampionships, menActual, womenActual]);

  // Regional map for colors / names
  const regionalMap = useMemo(() => {
    const regs = gender === "men" ? menRegionals : womenRegionals;
    const map = new Map<number, Regional>();
    for (const r of regs) map.set(r.id, r);
    return map;
  }, [gender, menRegionals, womenRegionals]);

  // Host-team → the color of the regional they host. Used across every tab
  // except Map to highlight host teams (coloured + bold) regardless of where
  // they're currently assigned. In Strict mode a host can land in a different
  // regional; we still want them to stand out in their host colour.
  const hostColorByTeam = useMemo(() => {
    const regs = gender === "men" ? menRegionals : womenRegionals;
    const map = new Map<string, string>();
    for (const r of regs) map.set(r.host, r.color);
    return map;
  }, [gender, menRegionals, womenRegionals]);

  const regionalSeeds = useMemo(() => computeRegionalSeeds(assignments), [assignments]);
  const regionalPositions = useMemo(() => computeRegionalPositions(assignments), [assignments]);

  // Filter — uses deferredSearch so React can keep the old result up
  // while typing and dim the table to indicate "computing"
  const filtered = useMemo(() => {
    if (!deferredSearch) return assignments;
    const q = deferredSearch.toLowerCase();
    return assignments.filter(
      (t) =>
        t.team.toLowerCase().includes(q) ||
        t.conference.toLowerCase().includes(q) ||
        (regionalMap.get(t.regionalId)?.name ?? "").toLowerCase().includes(q)
    );
  }, [assignments, deferredSearch, regionalMap]);

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
    if (scurveMode === "strict") {
      result.sort((a, b) => a.regional.name.localeCompare(b.regional.name));
    } else {
      result.sort((a, b) => {
        const aTop = Math.min(...a.teams.map((t) => t.seed));
        const bTop = Math.min(...b.teams.map((t) => t.seed));
        return aTop - bTop;
      });
    }
    return result;
  }, [viewMode, sorted, gender, menRegionals, womenRegionals, scurveMode]);

  // Women - show data if available, otherwise show timeline
  if (gender === "women" && womenTeams.length === 0) {
    return (
      <div
        className="w-full transition-opacity duration-200 data-[pending=true]:opacity-60 data-[stale=true]:opacity-70"
        data-pending={isPending}
        data-stale={isStale}
      >
        <FilterBar
          viewMode={viewMode}
          gender={gender}
          scurveMode={scurveMode}
          search={search}
          resultCount={0}
          lastUpdated={activeLastUpdated}
          onViewChange={handleViewChange}
          onGenderChange={handleGenderChange}
          onModeChange={handleModeChange}
          onSearchChange={setSearch}
          availableModes={availableModes}
        />
        <div className="mt-6 sm:mt-10 flex flex-col items-center gap-5 text-center">
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
    const activeRegionals = gender === "men" ? menRegionals : womenRegionals;
    return (
      <div
        className="w-full transition-opacity duration-200 data-[pending=true]:opacity-60 data-[stale=true]:opacity-70"
        data-pending={isPending}
        data-stale={isStale}
      >
        <FilterBar
          viewMode={viewMode}
          gender={gender}
          scurveMode={scurveMode}
          search={search}
          resultCount={filtered.length}
          lastUpdated={activeLastUpdated}
          onViewChange={handleViewChange}
          onGenderChange={handleGenderChange}
          onModeChange={handleModeChange}
          onSearchChange={setSearch}
          availableModes={availableModes}
        />
        {/* Desktop */}
        <div className="hidden sm:block">
          <VisualScurve
            assignments={assignments}
            regionals={activeRegionals}
            regionalMap={regionalMap}
            regionalSeeds={regionalSeeds}
            hostColorByTeam={hostColorByTeam}
            gender={gender}
          />
        </div>
        {/* Mobile */}
        <div className="sm:hidden">
          <MobileVisualScurve
            assignments={assignments}
            regionals={activeRegionals}
            regionalMap={regionalMap}
            regionalSeeds={regionalSeeds}
            hostColorByTeam={hostColorByTeam}
            gender={gender}
          />
        </div>
        <BubbleSection
          teams={gender === "men" ? menTeams : womenTeams}
          assignments={assignments}
          regionalMap={regionalMap}
          hostColorByTeam={hostColorByTeam}
          gender={gender}
        />
      </div>
    );
  }

  // Breakdown view — bubble-focused table with rank, W-L-T, ±.500, AWP
  if (viewMode === "breakdown") {
    return (
      <div
        className="w-full transition-opacity duration-200 data-[pending=true]:opacity-60 data-[stale=true]:opacity-70"
        data-pending={isPending}
        data-stale={isStale}
      >
        <FilterBar
          viewMode={viewMode}
          gender={gender}
          scurveMode={scurveMode}
          search={search}
          resultCount={filtered.length}
          lastUpdated={activeLastUpdated}
          onViewChange={handleViewChange}
          onGenderChange={handleGenderChange}
          onModeChange={handleModeChange}
          onSearchChange={setSearch}
          availableModes={availableModes}
        />
        <BreakdownView
          teams={gender === "men" ? menTeams : womenTeams}
          assignments={assignments}
          regionalMap={regionalMap}
          regionalSeeds={regionalSeeds}
          regionalPositions={regionalPositions}
          hostColorByTeam={hostColorByTeam}
          gender={gender}
        />
      </div>
    );
  }

  // Manual Grid — drag-and-drop S-curve seeded from Committee, persists per browser
  if (viewMode === "manual") {
    const activeTeams = gender === "men" ? menTeams : womenTeams;
    const activeRegionals = gender === "men" ? menRegionals : womenRegionals;
    const activeChampionships = gender === "men" ? menChampionships : womenChampionships;
    return (
      <div
        className="w-full transition-opacity duration-200 data-[pending=true]:opacity-60 data-[stale=true]:opacity-70"
        data-pending={isPending}
        data-stale={isStale}
      >
        <FilterBar
          viewMode={viewMode}
          gender={gender}
          scurveMode={scurveMode}
          search={search}
          resultCount={filtered.length}
          lastUpdated={activeLastUpdated}
          onViewChange={handleViewChange}
          onGenderChange={handleGenderChange}
          onModeChange={handleModeChange}
          onSearchChange={setSearch}
          availableModes={availableModes}
        />
        <ManualGridSection
          teams={activeTeams}
          regionals={activeRegionals}
          championships={activeChampionships}
          gender={gender}
        />
      </div>
    );
  }

  // Advancement Model — horizontal bar stack per regional + La Costa field
  if (viewMode === "advancement") {
    const activeRegionals = gender === "men" ? menRegionals : womenRegionals;
    // Strength-order the regionals to match the rest of the page.
    const orderedRegionals = [...activeRegionals].sort(
      (a, b) => (regionalSeeds.get(a.id) ?? 99) - (regionalSeeds.get(b.id) ?? 99),
    );
    return (
      <div
        className="w-full transition-opacity duration-200 data-[pending=true]:opacity-60 data-[stale=true]:opacity-70"
        data-pending={isPending}
        data-stale={isStale}
      >
        <FilterBar
          viewMode={viewMode}
          gender={gender}
          scurveMode={scurveMode}
          search={search}
          resultCount={filtered.length}
          lastUpdated={activeLastUpdated}
          onViewChange={handleViewChange}
          onGenderChange={handleGenderChange}
          onModeChange={handleModeChange}
          onSearchChange={setSearch}
          availableModes={availableModes}
        />
        <AdvancementBars
          regionals={orderedRegionals}
          gender={gender}
          hostColorByTeam={hostColorByTeam}
        />
      </div>
    );
  }

  // S-Curve snake table view
  if (viewMode === "scurve") {
    const activeRegionals = gender === "men" ? menRegionals : womenRegionals;
    return (
      <div
        className="w-full transition-opacity duration-200 data-[pending=true]:opacity-60 data-[stale=true]:opacity-70"
        data-pending={isPending}
        data-stale={isStale}
      >
        <FilterBar
          viewMode={viewMode}
          gender={gender}
          scurveMode={scurveMode}
          search={search}
          resultCount={filtered.length}
          lastUpdated={activeLastUpdated}
          onViewChange={handleViewChange}
          onGenderChange={handleGenderChange}
          onModeChange={handleModeChange}
          onSearchChange={setSearch}
          availableModes={availableModes}
        />
        <ScurveSnakeTable
          assignments={assignments}
          regionals={activeRegionals}
          regionalMap={regionalMap}
          regionalSeeds={regionalSeeds}
          hostColorByTeam={hostColorByTeam}
          gender={gender}
        />
        <BubbleSection
          teams={gender === "men" ? menTeams : womenTeams}
          assignments={assignments}
          regionalMap={regionalMap}
          hostColorByTeam={hostColorByTeam}
          gender={gender}
        />
      </div>
    );
  }

  // Map view
  if (viewMode === "map") {
    const activeRegionals = gender === "men" ? menRegionals : womenRegionals;
    return (
      <div
        className="w-full transition-opacity duration-200 data-[pending=true]:opacity-60 data-[stale=true]:opacity-70"
        data-pending={isPending}
        data-stale={isStale}
      >
        <FilterBar
          viewMode={viewMode}
          gender={gender}
          scurveMode={scurveMode}
          search={search}
          resultCount={filtered.length}
          lastUpdated={activeLastUpdated}
          onViewChange={handleViewChange}
          onGenderChange={handleGenderChange}
          onModeChange={handleModeChange}
          onSearchChange={setSearch}
          availableModes={availableModes}
        />
        <div className="mt-2 sm:mt-3">
          <p className="hidden sm:block text-[12px] text-text-tertiary mb-2">
            Tap a regional to focus its travel lines. Team dots are colored by their assigned regional.
          </p>
          <USMap assignments={assignments} regionals={activeRegionals} regionalSeeds={regionalSeeds} />
        </div>
        {assignments.length > 0 && (
          <div className="mt-3 sm:mt-4">
            <BeeswarmTravel assignments={assignments} regionalMap={regionalMap} />
          </div>
        )}
        <BubbleSection
          teams={gender === "men" ? menTeams : womenTeams}
          assignments={assignments}
          regionalMap={regionalMap}
          gender={gender}
        />
      </div>
    );
  }

  return (
    <div
      className="w-full transition-opacity duration-200 data-[pending=true]:opacity-60 data-[stale=true]:opacity-70"
      data-pending={isPending}
      data-stale={isStale}
    >
      <FilterBar
        viewMode={viewMode}
        gender={gender}
        scurveMode={scurveMode}
        search={search}
        resultCount={filtered.length}
        lastUpdated={activeLastUpdated}
        onViewChange={handleViewChange}
        onGenderChange={handleGenderChange}
        onModeChange={handleModeChange}
        onSearchChange={setSearch}
        availableModes={availableModes}
      />

      {/* Mode description — desktop only to save mobile space */}
      <div className="hidden sm:block mt-2 mb-1 text-[12px] text-text-tertiary">
        {scurveMode === "committee" ? (
          <span>Showing committee prediction - top seeds assigned by proximity, AQ geographic preference applied</span>
        ) : (
          <span>Showing strict mathematical S-curve - pure serpentine with host swaps only</span>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block mt-2 overflow-x-clip rounded-lg border border-border">
        <table className="w-full border-collapse text-[13px]" aria-label="NCAA D1 Regional S-Curve Predictions">
          <thead className="sticky top-[var(--nav-height)] z-10 bg-background shadow-[0_1px_0_hsl(var(--border))]">
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
                    regionalSeed={regionalSeeds.get(regional.id)}
                    hostColorByTeam={hostColorByTeam}
                    gender={gender}
                  />
                ))
              : sorted.map((team) => {
                  const numRegionals = (gender === "men" ? menRegionals : womenRegionals).length;
                  const cutSeed = TEAMS_ADVANCING * numRegionals;
                  const rows = [
                    <TeamRow
                      key={`${team.team}-${team.seed}`}
                      team={team}
                      regionalMap={regionalMap}
                      hostColor={hostColorByTeam.get(team.team)}
                      gender={gender}
                    />,
                  ];
                  if (team.seed === cutSeed && sorted.length > cutSeed) {
                    rows.push(
                      <tr key="scurve-advancement-line">
                        <td colSpan={7} className="p-0">
                          <div className="flex items-center gap-2 px-3 py-1">
                            <div className="flex-1 border-t border-dashed border-destructive/40" />
                            <span className="text-[9px] font-medium uppercase tracking-wider text-destructive/70 whitespace-nowrap">
                              Advancing
                            </span>
                            <div className="flex-1 border-t border-dashed border-destructive/40" />
                          </div>
                        </td>
                      </tr>
                    );
                  }
                  return rows;
                })}
          </tbody>
        </table>
      </div>

      {/* Mobile card view */}
      <div className="sm:hidden mt-1">
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
              regionalSeed={regionalSeeds.get(regional.id)}
              hostColorByTeam={hostColorByTeam}
              gender={gender}
            />
          ))
        ) : (
          sorted.map((team) => {
            const numRegionals = (gender === "men" ? menRegionals : womenRegionals).length;
            const cutSeed = TEAMS_ADVANCING * numRegionals;
            return (
              <div key={`${team.team}-${team.seed}`}>
                <MobileTeamCard
                  team={team}
                  regionalMap={regionalMap}
                  hostColor={hostColorByTeam.get(team.team)}
                  gender={gender}
                />
                {team.seed === cutSeed && sorted.length > cutSeed && (
                  <div className="flex items-center gap-1 px-0.5 py-px">
                    <div className="flex-1 border-t border-dashed border-destructive/30" />
                    <span className="text-[7px] font-medium uppercase tracking-wider text-destructive/50">
                      Advancing
                    </span>
                    <div className="flex-1 border-t border-dashed border-destructive/30" />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Bubble Zone */}
      <BubbleSection
        teams={gender === "men" ? menTeams : womenTeams}
        assignments={assignments}
        regionalMap={regionalMap}
        gender={gender}
      />
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
  availableModes,
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
  /** Modes visible in the toggle. Order is preserved. "actual" appears only
   *  when the current gender's committee bracket has been published. */
  availableModes: ScurveMode[];
}) {
  const allModeOptions: { value: ScurveMode; label: string }[] = [
    { value: "actual", label: "Actual" },
    { value: "committee", label: "Committee" },
    { value: "strict", label: "Strict" },
  ];
  const modeOptions = availableModes
    .map((m) => allModeOptions.find((opt) => opt.value === m))
    .filter((opt): opt is { value: ScurveMode; label: string } => opt !== undefined);
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
            { value: "map", label: "Map" },
            { value: "regional", label: "By Regional" },
            { value: "scurve", label: "S-Curve" },
            { value: "visual", label: "Visual" },
            { value: "breakdown", label: "Breakdown" },
            { value: "manual", label: "Manual Grid" },
            { value: "advancement", label: "Advancement Model" },
          ]}
          value={viewMode}
          onChange={(v) => onViewChange(v as ViewMode)}
        />

        {/* Mode toggle */}
        <SegmentedToggle
          options={modeOptions}
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
          <span className="tabular-nums">
            <AnimatedNumber value={resultCount} className="text-foreground !font-normal !tracking-normal" /> teams
          </span>
          <span className="text-text-tertiary">Latest Rankings: {lastUpdated}</span>
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
              { value: "map", label: "Map" },
              { value: "regional", label: "Reg" },
              { value: "scurve", label: "S-C" },
              { value: "visual", label: "Vis" },
              { value: "breakdown", label: "Brk" },
              { value: "manual", label: "Manual" },
              { value: "advancement", label: "Adv. Model" },
            ]}
            value={viewMode}
            onChange={(v) => onViewChange(v as ViewMode)}
          />
        </div>
        <div className="flex items-center gap-3">
          <SegmentedToggle
            options={modeOptions}
            value={scurveMode}
            onChange={(m) => onModeChange(m as ScurveMode)}
          />
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="tabular-nums">
            <AnimatedNumber value={resultCount} className="text-foreground !font-normal !tracking-normal" /> teams
          </span>
          <span className="text-text-tertiary">Latest Rankings: {lastUpdated}</span>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search teams..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search teams"
            className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-3 text-[13px] text-foreground placeholder:text-text-placeholder focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BubbleSection
// ---------------------------------------------------------------------------

function BubbleSection({
  teams,
  assignments,
  regionalMap,
  hostColorByTeam,
  gender = "men",
}: {
  teams: TeamData[];
  assignments: ScurveAssignment[];
  regionalMap: Map<number, Regional>;
  /**
   * Map of host team name → host regional colour. Omit (e.g. from the Map tab)
   * to skip the host highlight treatment.
   */
  hostColorByTeam?: Map<string, string>;
  gender?: Gender;
}) {
  const LAST_IN = 6;
  const FIRST_OUT = 6;
  const totalInField = assignments.length;
  if (totalInField === 0) return null;

  const assignmentMap = new Map<string, ScurveAssignment>();
  for (const a of assignments) assignmentMap.set(a.team, a);

  const subFiveHundredAqs = assignments.filter(
    (a) => !a.eligible && a.isAutoQualifier
  );

  // Only at-large teams are actually on the bubble. AQs are locked in by
  // their conference finish regardless of rank, so they can't be "last in".
  const atLargeInField = assignments.filter((a) => !a.isAutoQualifier);

  const lastIn = atLargeInField
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .slice(-LAST_IN);

  // "Magic Number" = worst-ranked at-large that still made the field.
  const magicNumberRank =
    atLargeInField.length > 0
      ? Math.max(...atLargeInField.map((a) => a.rank))
      : 0;

  const teamsOut = teams
    .filter((t) => !assignmentMap.has(t.team))
    .sort((a, b) => a.rank - b.rank);

  // Teams ranked above the at-large cutoff but sub-.500 — they'd make it on
  // rank alone. Shown in their own watch section, separate from firstOut.
  const fiveHundredWatch = teamsOut.filter(
    (t) => t.rank <= magicNumberRank && !t.eligible && !t.isAutoQualifier
  );

  // First Out = top at-large candidates that just missed the cutoff. Must be
  // above .500 — sub-.500 teams can't be at-large regardless of rank.
  const firstOut = teamsOut
    .filter((t) => t.eligible && !t.isAutoQualifier)
    .slice(0, FIRST_OUT);

  if (lastIn.length === 0 && firstOut.length === 0 && fiveHundredWatch.length === 0 && subFiveHundredAqs.length === 0) {
    return null;
  }

  return (
    <section className="mt-6">
      <div className="flex items-baseline gap-2 mb-2">
        <h3 className="text-[11px] font-semibold text-foreground inline-flex items-center">
          Magic Number
          <InfoTooltip>
            <strong>Magic Number</strong> = the lowest-ranked at-large team that still made the field.
            Teams above the line are <em>in</em>; the next at-large is the <em>first out</em>.
            Coaches watch this line to know who&apos;s on the bubble.
          </InfoTooltip>
        </h3>
        <span className="text-[9px] text-text-tertiary tabular-nums">
          <AnimatedNumber value={totalInField} className="!font-normal !tracking-normal text-text-tertiary" /> teams in field
        </span>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        {/* Column headers */}
        <div
          className="h-7 items-center px-3 bg-card text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
          style={{ display: "grid", gridTemplateColumns: "40px 1fr 50px 50px 100px", gap: "6px" }}
        >
          <span>Rank</span>
          <span>Team</span>
          <span className="text-right">AWP</span>
          <span className="text-right">vs .500</span>
          <span>Regional</span>
        </div>

        {/* Last N In */}
        <div className="px-3 py-1 bg-card/60 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-t border-border">
          Last {lastIn.length} In
        </div>
        {lastIn.map((team) => {
          const regional = regionalMap.get(team.regionalId);
          return (
            <div
              key={team.team}
              className="h-7 items-center text-[10px] px-3 border-b border-border/40 tabular-nums"
              style={{ display: "grid", gridTemplateColumns: "40px 1fr 50px 50px 100px", gap: "6px" }}
            >
              <span className="font-mono text-muted-foreground">
                #{team.rank}
              </span>
              <span className="font-medium text-foreground truncate">
                <TeamLink team={team.team} gender={gender} hostColor={hostColorByTeam?.get(team.team)}>
                  {team.team}
                </TeamLink>
              </span>
              <span className="font-mono text-foreground/80 text-right">
                {fmtAwp(team.avgPoints)}
              </span>
              <span className={cn("font-mono text-right", team.wins - team.losses >= 0 ? "text-muted-foreground" : "text-destructive/80")}>
                {team.wins - team.losses >= 0 ? "+" : ""}{team.wins - team.losses}
              </span>
              <span
                className="text-muted-foreground truncate"
                style={{ borderLeft: `2px solid ${regional?.color ?? "#888"}`, paddingLeft: "6px" }}
              >
                {regional?.name.replace(/ Regional$/, "")}
              </span>
            </div>
          );
        })}

        <div className="relative flex items-center gap-2 px-3 py-2 bg-amber-500/10 border-y-2 border-amber-500/60">
          <div className="flex-1 border-t-2 border-dashed border-amber-500/50" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 whitespace-nowrap">
            Magic Number &middot; Field Cutoff
          </span>
          <div className="flex-1 border-t-2 border-dashed border-amber-500/50" />
        </div>

        {/* .500 Watch */}
        {fiveHundredWatch.length > 0 && (
          <>
            <div className="px-3 py-1 bg-card/60 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-t border-border">
              .500 Watch
              <span className="ml-1 font-normal text-text-tertiary">
                — ranked in field, excluded by .500 rule
              </span>
            </div>
            {fiveHundredWatch.map((team) => (
              <div
                key={team.team}
                className="h-7 items-center text-[10px] px-3 border-b border-border/40 tabular-nums border-l-2 border-l-amber-500/60"
                style={{ display: "grid", gridTemplateColumns: "40px 1fr 50px 50px 100px", gap: "6px" }}
              >
                <span className="font-mono text-muted-foreground">
                  #{team.rank}
                </span>
                <span className="text-muted-foreground truncate">
                  <TeamLink team={team.team} gender={gender} hostColor={hostColorByTeam?.get(team.team)}>
                    {team.team}
                  </TeamLink>
                  <span className="ml-1 text-[8px] font-semibold text-amber-500/70 uppercase">
                    {team.wins}-{team.losses}
                  </span>
                </span>
                <span className="font-mono text-foreground/70 text-right">
                  {fmtAwp(team.avgPoints)}
                </span>
                <span className="font-mono text-right text-destructive/80">
                  {team.wins - team.losses}
                </span>
                <span className="text-text-tertiary truncate">
                  {team.conference}
                </span>
              </div>
            ))}
          </>
        )}

        {/* First N Out */}
        {firstOut.length > 0 && (
          <>
            <div className="px-3 py-1 bg-card/60 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-t border-border">
              First {firstOut.length} Out
            </div>
            {firstOut.map((team, idx) => (
              <div
                key={team.team}
                className={cn(
                  "h-7 items-center text-[10px] px-3 border-b border-border/40 tabular-nums",
                  idx < 3 ? "opacity-85" : "opacity-70"
                )}
                style={{ display: "grid", gridTemplateColumns: "40px 1fr 50px 50px 100px", gap: "6px" }}
              >
                <span className="font-mono text-muted-foreground">
                  #{team.rank}
                </span>
                <span className="text-muted-foreground truncate">
                  <TeamLink team={team.team} gender={gender} hostColor={hostColorByTeam?.get(team.team)}>
                    {team.team}
                  </TeamLink>
                </span>
                <span className="font-mono text-foreground/70 text-right">
                  {fmtAwp(team.avgPoints)}
                </span>
                <span className={cn("font-mono text-right", team.wins - team.losses >= 0 ? "text-muted-foreground" : "text-destructive/80")}>
                  {team.wins - team.losses >= 0 ? "+" : ""}{team.wins - team.losses}
                </span>
                <span className="text-text-tertiary truncate">
                  {team.conference}
                </span>
              </div>
            ))}
          </>
        )}

        {subFiveHundredAqs.length > 0 && (
          <div className="px-3 py-2 bg-card/50 border-t border-border">
            <p className="text-[10px] text-text-tertiary">
              <span className="font-medium text-amber-500/80">{subFiveHundredAqs.length} sub-.500 AQ{subFiveHundredAqs.length > 1 ? "s" : ""}</span>
              {" "}in field (below .500 but won conference auto-qualifier):{" "}
              {subFiveHundredAqs.map((t, i) => (
                <Fragment key={t.team}>
                  {i > 0 && ", "}
                  <TeamLink team={t.team} gender={gender} hostColor={hostColorByTeam?.get(t.team)}>
                    {t.team}
                  </TeamLink>
                </Fragment>
              ))}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// BreakdownView — David's "what's the differentiator" table
// ---------------------------------------------------------------------------
// Shows Last 6 In + First 6 Out with the metrics that matter:
// regional seed (1-6), rank, W-L-T, ± on .500, Average Weighted Points (AWP).
// Below, a full S-curve table so you can scan every team end-to-end.

function fmtAwp(v: number | undefined): string {
  if (v === undefined || v === null || Number.isNaN(v)) return "—";
  return v.toFixed(2);
}

function fmtDiff(wins: number, losses: number): { label: string; positive: boolean } {
  const diff = wins - losses;
  const sign = diff > 0 ? "+" : "";
  return { label: `${sign}${diff}`, positive: diff >= 0 };
}

function BreakdownView({
  teams,
  assignments,
  regionalMap,
  regionalSeeds,
  regionalPositions,
  hostColorByTeam,
  gender = "men",
}: {
  teams: TeamData[];
  assignments: ScurveAssignment[];
  regionalMap: Map<number, Regional>;
  regionalSeeds: Map<number, number>;
  regionalPositions: Map<string, number>;
  hostColorByTeam?: Map<string, string>;
  gender?: Gender;
}) {
  const LAST_IN = 6;
  const FIRST_OUT = 6;

  if (assignments.length === 0) {
    return (
      <p className="mt-6 text-[12px] text-text-tertiary">
        No teams to break down. Pick the other gender or wait for rankings.
      </p>
    );
  }

  const assignmentMap = new Map<string, ScurveAssignment>();
  for (const a of assignments) assignmentMap.set(a.team, a);

  // Last N In: worst-ranked at-large teams in the field. AQs are locked in
  // by their conference finish, so they can't be "last in" even when their
  // rank is low — filter them out.
  const atLargeInField = assignments.filter((a) => !a.isAutoQualifier);

  const lastIn = atLargeInField
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .slice(-LAST_IN);

  // "Magic Number" = worst-ranked at-large that still made the field.
  const magicNumberRank =
    atLargeInField.length > 0
      ? Math.max(...atLargeInField.map((a) => a.rank))
      : 0;

  const teamsOut = teams
    .filter((t) => !assignmentMap.has(t.team))
    .sort((a, b) => a.rank - b.rank);

  const fiveHundredWatch = teamsOut.filter(
    (t) => t.rank <= magicNumberRank && !t.eligible && !t.isAutoQualifier
  );

  const firstOut = teamsOut
    .filter((t) => t.eligible && !t.isAutoQualifier)
    .slice(0, FIRST_OUT);

  const subFiveHundredAqs = assignments.filter((a) => !a.eligible && a.isAutoQualifier);

  // Full table sorted by overall seed
  const allSorted = assignments.slice().sort((a, b) => a.seed - b.seed);

  return (
    <section className="mt-3">
      <div className="flex items-baseline gap-2 mb-2">
        <h3 className="text-[13px] font-semibold text-foreground">Bubble Breakdown</h3>
        <span className="text-[11px] text-text-tertiary">
          Why teams are in or out &middot; <AnimatedNumber value={assignments.length} className="text-foreground !font-normal !tracking-normal" /> teams in field
        </span>
      </div>

      <p className="text-[11px] text-text-tertiary mb-3 leading-snug max-w-2xl">
        AWP = NCAA&apos;s Average Weighted Points (the underlying ranking score, weighted by field strength).
        ± .500 = wins minus losses. The teams ranked closest to the Magic Number are the bubble.
      </p>

      {/* Last 6 In / First 6 Out card */}
      <div className="rounded-lg border border-border overflow-hidden">
        {/* Column header row */}
        <div
          className="px-3 py-1.5 bg-card text-[10px] font-medium uppercase tracking-wide text-muted-foreground items-center grid grid-cols-[30px_1fr_35px_45px_70px] md:grid-cols-[32px_1fr_50px_70px_60px_60px_110px] gap-1 md:gap-2"
        >
          <span className="text-center">
            <span className="md:hidden">#</span>
            <span className="hidden md:inline">Reg</span>
          </span>
          <span>Team</span>
          <div className="hidden md:contents">
            <span className="text-right">Rank</span>
            <span className="text-center">W-L-T</span>
          </div>
          <span className="text-right">+/&minus;</span>
          <span className="text-right">AWP</span>
          <span className="truncate">Regional</span>
        </div>

        {/* Last N In */}
        <div className="px-3 py-1 bg-card/60 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-t border-border">
          Last {lastIn.length} In
        </div>
        {lastIn.map((team) => {
          const regional = regionalMap.get(team.regionalId);
          const posInRegional = regionalPositions.get(team.team);
          const diff = fmtDiff(team.wins, team.losses);
          return (
            <div
              key={team.team}
              className="h-8 items-center text-[10px] px-3 border-b border-border/40 tabular-nums grid grid-cols-[30px_1fr_35px_45px_70px] md:grid-cols-[32px_1fr_50px_70px_60px_60px_110px] gap-1 md:gap-2"
            >
              <span className="font-mono text-muted-foreground text-center">
                <span className="md:hidden">#{team.rank}</span>
                <span className="hidden md:inline">{posInRegional ?? "—"}</span>
              </span>
              <span className="font-medium text-foreground truncate">
                <TeamLink team={team.team} gender={gender} hostColor={hostColorByTeam?.get(team.team)}>
                  {team.team}
                </TeamLink>
              </span>
              <div className="hidden md:contents">
                <span className="font-mono text-muted-foreground text-right">
                  #{team.rank}
                </span>
                <span className="font-mono text-muted-foreground text-center">
                  {team.wins}-{team.losses}{team.ties > 0 ? `-${team.ties}` : ""}
                </span>
              </div>
              <span className={cn("font-mono text-right", diff.positive ? "text-foreground/80" : "text-destructive/80")}>
                {diff.label}
              </span>
              <span className="font-mono text-foreground text-right">
                {fmtAwp(team.avgPoints)}
              </span>
              <span
                className="text-muted-foreground truncate"
                style={{ borderLeft: `2px solid ${regional?.color ?? "#888"}`, paddingLeft: "6px" }}
              >
                {regional?.name.replace(/ Regional$/, "") ?? "—"}
              </span>
            </div>
          );
        })}

        {/* Magic Number cutoff */}
        <div className="relative flex items-center gap-2 px-3 py-2 bg-red-500/10 border-y-2 border-red-500/60">
          <div className="flex-1 border-t-2 border-dashed border-red-500/60" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-red-400 whitespace-nowrap">
            Magic Number &middot; Field Cutoff
          </span>
          <div className="flex-1 border-t-2 border-dashed border-red-500/60" />
        </div>

        {/* .500 Watch */}
        {fiveHundredWatch.length > 0 && (
          <>
            <div className="px-3 py-1 bg-card/60 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              .500 Watch
              <span className="ml-1 font-normal text-text-tertiary">
                — ranked in field, excluded by .500 rule
              </span>
            </div>
            {fiveHundredWatch.map((team) => {
              const diff = fmtDiff(team.wins, team.losses);
              return (
                <div
                  key={team.team}
                  className="h-8 items-center text-[10px] px-3 border-b border-border/40 tabular-nums border-l-2 border-l-amber-500/60 grid grid-cols-[30px_1fr_35px_45px_70px] md:grid-cols-[32px_1fr_50px_70px_60px_60px_110px] gap-1 md:gap-2"
                >
                  <span className="font-mono text-muted-foreground text-center">
                    <span className="md:hidden">#{team.rank}</span>
                    <span className="hidden md:inline">—</span>
                  </span>
                  <span className="text-muted-foreground truncate">
                    <TeamLink team={team.team} gender={gender} hostColor={hostColorByTeam?.get(team.team)}>
                      {team.team}
                    </TeamLink>
                    <span className="ml-1.5 text-[8px] font-semibold text-amber-500/70 uppercase">
                      {team.wins}-{team.losses}
                    </span>
                  </span>
                  <div className="hidden md:contents">
                    <span className="font-mono text-muted-foreground text-right">#{team.rank}</span>
                    <span className="font-mono text-muted-foreground text-center">
                      {team.wins}-{team.losses}{team.ties > 0 ? `-${team.ties}` : ""}
                    </span>
                  </div>
                  <span className="font-mono text-right text-destructive/80">
                    {diff.label}
                  </span>
                  <span className="font-mono text-muted-foreground text-right">
                    {fmtAwp(team.avgPoints)}
                  </span>
                  <span className="text-text-tertiary truncate">
                    {team.conference}
                  </span>
                </div>
              );
            })}
          </>
        )}

        {/* First N Out */}
        {firstOut.length > 0 && (
          <>
            <div className="px-3 py-1 bg-card/60 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              First {firstOut.length} Out
            </div>
            {firstOut.map((team, idx) => {
              const diff = fmtDiff(team.wins, team.losses);
              return (
                <div
                  key={team.team}
                  className={cn(
                    "h-8 items-center text-[10px] px-3 border-b border-border/40 tabular-nums grid grid-cols-[30px_1fr_35px_45px_70px] md:grid-cols-[32px_1fr_50px_70px_60px_60px_110px] gap-1 md:gap-2",
                    idx < 3 ? "opacity-90" : "opacity-75"
                  )}
                >
                  <span className="font-mono text-text-tertiary text-center">
                    <span className="md:hidden">#{team.rank}</span>
                    <span className="hidden md:inline">—</span>
                  </span>
                  <span className="text-muted-foreground truncate">
                    <TeamLink team={team.team} gender={gender} hostColor={hostColorByTeam?.get(team.team)}>
                      {team.team}
                    </TeamLink>
                  </span>
                  <div className="hidden md:contents">
                    <span className="font-mono text-muted-foreground text-right">#{team.rank}</span>
                    <span className="font-mono text-muted-foreground text-center">
                      {team.wins}-{team.losses}{team.ties > 0 ? `-${team.ties}` : ""}
                    </span>
                  </div>
                  <span className={cn("font-mono text-right", diff.positive ? "text-muted-foreground" : "text-destructive/80")}>
                    {diff.label}
                  </span>
                  <span className="font-mono text-muted-foreground text-right">
                    {fmtAwp(team.avgPoints)}
                  </span>
                  <span className="text-text-tertiary truncate">
                    {team.conference}
                  </span>
                </div>
              );
            })}
          </>
        )}

        {subFiveHundredAqs.length > 0 && (
          <div className="px-3 py-2 bg-card/50 border-t border-border">
            <p className="text-[10px] text-text-tertiary">
              <span className="font-medium text-amber-500/80">{subFiveHundredAqs.length} sub-.500 AQ{subFiveHundredAqs.length > 1 ? "s" : ""}</span>
              {" "}in field (below .500 but won conference auto-qualifier):{" "}
              {subFiveHundredAqs.map((t, i) => (
                <Fragment key={t.team}>
                  {i > 0 && ", "}
                  <TeamLink team={t.team} gender={gender} hostColor={hostColorByTeam?.get(t.team)}>
                    {t.team}
                  </TeamLink>
                </Fragment>
              ))}
            </p>
          </div>
        )}
      </div>

      {/* Full D1 breakdown table */}
      <div className="mt-6">
        <div className="flex items-baseline gap-2 mb-2 flex-wrap">
          <h3 className="text-[13px] font-semibold text-foreground scroll-mt-[var(--nav-height)]">Full D1 Breakdown</h3>
          <span className="text-[11px] text-text-tertiary">
            <AnimatedNumber value={assignments.length} className="text-foreground !font-normal !tracking-normal" /> in the field &middot; <AnimatedNumber value={teamsOut.length} className="text-foreground !font-normal !tracking-normal" /> below the cutline
          </span>
        </div>
        <div className="overflow-x-clip rounded-lg border border-border">
          <table className="w-full text-[12px] tabular-nums">
            <thead className="bg-card sticky top-[var(--nav-height)] z-10">
              <tr className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-2 py-2 text-center w-[40px]">Seed</th>
                <th className="px-2 py-2 text-center w-[40px] hidden md:table-cell">Reg</th>
                <th className="px-2 py-2 text-left">Team</th>
                <th className="px-2 py-2 text-center w-[60px] hidden md:table-cell">Conf</th>
                <th className="px-2 py-2 text-right w-[50px]">Rank</th>
                <th className="px-2 py-2 text-center w-[80px]">W-L-T</th>
                <th className="px-2 py-2 text-right w-[60px]">±.500</th>
                <th className="px-2 py-2 text-left w-[120px] hidden md:table-cell">Regional</th>
              </tr>
            </thead>
            <tbody>
              {allSorted.map((team) => {
                const regional = regionalMap.get(team.regionalId);
                const regionalSeed = regionalSeeds.get(team.regionalId);
                const posInRegional = regionalPositions.get(team.team);
                const diff = fmtDiff(team.wins, team.losses);
                const isSubFiveHundredAq = !team.eligible && team.isAutoQualifier;
                return (
                  <tr
                    key={team.team}
                    className={cn(
                      "h-7 border-b border-border/40 hover:bg-white/[0.02] transition-colors",
                      isSubFiveHundredAq && "bg-amber-500/[0.04]"
                    )}
                  >
                    <td className="px-2 text-center font-mono text-muted-foreground">{posInRegional ?? "—"}</td>
                    <td className="px-2 text-center font-mono text-muted-foreground hidden md:table-cell">{regionalSeed ?? "—"}</td>
                    <td className="px-2 text-foreground">
                      <TeamLink team={team.team} gender={gender} className="font-medium" hostColor={hostColorByTeam?.get(team.team)}>
                        {team.team}
                      </TeamLink>
                      {isSubFiveHundredAq && (
                        <span className="ml-1.5 text-[9px] font-semibold text-amber-500/80 uppercase">
                          Sub-.500 AQ
                        </span>
                      )}
                      {team.isAutoQualifier && !isSubFiveHundredAq && (
                        <span className="ml-1.5 text-[9px] font-semibold text-primary uppercase">AQ</span>
                      )}
                    </td>
                    <td className="px-2 text-center text-muted-foreground hidden md:table-cell">{team.conference}</td>
                    <td className="px-2 text-right font-mono text-muted-foreground">#{team.rank}</td>
                    <td className="px-2 text-center font-mono text-muted-foreground">
                      {team.wins}-{team.losses}{team.ties > 0 ? `-${team.ties}` : ""}
                    </td>
                    <td className={cn("px-2 text-right font-mono", diff.positive ? "text-muted-foreground" : "text-destructive/80")}>
                      {diff.label}
                    </td>
                    <td
                      className="px-2 text-left text-muted-foreground hidden md:table-cell"
                      style={{ borderLeft: `2px solid ${regional?.color ?? "#888"}`, paddingLeft: "6px" }}
                    >
                      {regional?.name.replace(/ Regional$/, "") ?? "—"}
                    </td>
                  </tr>
                );
              })}
              {teamsOut.length > 0 && (
                <tr className="border-y-2 border-red-500/60 bg-red-500/10">
                  <td colSpan={8} className="px-3 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider text-red-400">
                    Magic Number · Teams Below Did Not Qualify
                  </td>
                </tr>
              )}
              {teamsOut.map((team) => {
                const diff = fmtDiff(team.wins, team.losses);
                return (
                  <tr
                    key={`out-${team.team}`}
                    className="h-7 border-b border-border/40 hover:bg-white/[0.02] transition-colors opacity-75"
                  >
                    <td className="px-2 text-center font-mono text-muted-foreground">—</td>
                    <td className="px-2 text-center font-mono text-muted-foreground hidden md:table-cell">—</td>
                    <td className="px-2 text-muted-foreground">
                      <TeamLink team={team.team} gender={gender} hostColor={hostColorByTeam?.get(team.team)}>
                        {team.team}
                      </TeamLink>
                      {!team.eligible && (
                        <span className="ml-1.5 text-[9px] font-semibold text-amber-500/80 uppercase">
                          Sub-.500
                        </span>
                      )}
                    </td>
                    <td className="px-2 text-center text-muted-foreground hidden md:table-cell">{team.conference}</td>
                    <td className="px-2 text-right font-mono text-muted-foreground">#{team.rank}</td>
                    <td className="px-2 text-center font-mono text-muted-foreground">
                      {team.wins}-{team.losses}{team.ties > 0 ? `-${team.ties}` : ""}
                    </td>
                    <td className={cn("px-2 text-right font-mono", diff.positive ? "text-muted-foreground" : "text-destructive/80")}>
                      {diff.label}
                    </td>
                    <td className="px-2 text-left text-muted-foreground hidden md:table-cell">
                      —
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
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
    <div className="inline-flex h-6 items-center rounded border border-white/[0.06] bg-secondary/40 p-0.5 shadow-flat">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "h-5 min-w-[32px] px-1.5 text-[10px] font-medium rounded-[3px] whitespace-nowrap transition-colors",
            value === opt.value
              ? "btn-lift text-foreground"
              : "text-muted-foreground hover:text-foreground"
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
  regionalSeed,
  hostColorByTeam,
  gender = "men",
}: {
  regional: Regional;
  teams: ScurveAssignment[];
  regionalMap: Map<number, Regional>;
  regionalSeed: number | undefined;
  hostColorByTeam?: Map<string, string>;
  gender?: Gender;
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
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="flex items-center gap-2">
                <ChevronRight
                  className={cn(
                    "h-6 w-6 text-muted-foreground transition-transform",
                    expanded && "rotate-90"
                  )}
                  style={{ color: regional.color }}
                />
                <span
                  className="font-bold text-[28px] leading-none"
                  style={{ color: regional.color }}
                >
                  {regionalSeed !== undefined && (
                    <span className="font-mono tabular-nums text-muted-foreground mr-2">#{regionalSeed}</span>
                  )}
                  {regional.name}
                </span>
              </span>
              <span className="text-[24px] text-muted-foreground leading-none">
                {regional.host} &middot; {regional.city}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-text-tertiary whitespace-nowrap">
              <span className="hidden md:inline">
                <Plane className="inline h-3 w-3 mr-0.5 opacity-60" />
                {avgDistance.toLocaleString()} mi avg
              </span>
              <span>{teams.length} teams</span>
              {regional.clippdUrl && (
                <a
                  href={regional.clippdUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-text-tertiary hover:text-foreground underline decoration-dotted underline-offset-2"
                  title="Live scoreboard on Clippd"
                  aria-label={`Live scoreboard for ${regional.name} on Clippd`}
                >
                  Live scoreboard
                  <ExternalLink className="h-3 w-3 opacity-70" />
                </a>
              )}
            </div>
          </div>
        </td>
      </tr>

      {/* Expanded detail panel */}
      {expanded && (
        <tr>
          <td colSpan={7} className="p-0">
            <RegionalDetailPanel
              regional={regional}
              teams={teams}
              hostColorByTeam={hostColorByTeam}
              gender={gender}
            />
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
            hostColor={hostColorByTeam?.get(team.team)}
            gender={gender}
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
                    Advancing
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
  hostColorByTeam,
  gender = "men",
}: {
  regional: Regional;
  teams: ScurveAssignment[];
  hostColorByTeam?: Map<string, string>;
  gender?: Gender;
}) {
  return (
    <div
      className="bg-card/50 border-t border-b border-border/50 px-4 py-4"
      style={{ borderLeft: `4px solid ${regional.color}` }}
    >
      <RegionalDetailContent
        regional={regional}
        teams={teams}
        hostColorByTeam={hostColorByTeam}
        gender={gender}
      />
    </div>
  );
}

/**
 * Inner content of the regional expansion, shared between desktop
 * (`RegionalDetailPanel`) and mobile (`MobileRegionalGroup`). Layout uses
 * tailwind responsive classes so a single render works at all widths — the
 * caller only owns the wrapper chrome (border, padding, regional color
 * stripe), not the content.
 */
function RegionalDetailContent({
  regional,
  teams,
  hostColorByTeam,
  gender = "men",
  compact = false,
}: {
  regional: Regional;
  teams: ScurveAssignment[];
  hostColorByTeam?: Map<string, string>;
  gender?: Gender;
  /** Tighten padding + matrix density for mobile cards. */
  compact?: boolean;
}) {
  const totalDistance = teams.reduce((sum, t) => sum + t.distanceMiles, 0);
  const avgDistance = Math.round(totalDistance / teams.length);
  const maxTravel = teams.reduce(
    (max, t) => (t.distanceMiles > max.distanceMiles ? t : max),
    teams[0]
  );
  const minTravel = teams.reduce(
    (min, t) => (t.distanceMiles < min.distanceMiles ? t : min),
    teams[0]
  );
  const aqTeams = teams.filter((t) => t.isAutoQualifier);
  const aqConfs = [
    ...new Set(aqTeams.map((t) => t.aqConference ?? t.conference)),
  ];
  const hostTeam = teams.find((t) => t.team === regional.host);
  // `teams` arrives sorted ascending by S-curve seed → array index + 1 is the
  // "true" regional seed (1..N within this regional), the same value the H2H
  // matrix uses on its row labels.
  const hostRegionalSeed = hostTeam ? teams.indexOf(hostTeam) + 1 : null;
  const conferences = [...new Set(teams.map((t) => t.conference))];
  // Highest/Lowest *Rank* — derived from national rank, not S-curve seed,
  // because David wants the headline to be national-rank based and a team's
  // rank can diverge from its seed (auto-qualifier carve-outs etc.).
  const highestRankTeam = teams.reduce(
    (best, t) => (t.rank < best.rank ? t : best),
    teams[0]
  );
  const lowestRankTeam = teams.reduce(
    (worst, t) => (t.rank > worst.rank ? t : worst),
    teams[0]
  );

  const gapCls = compact ? "gap-2" : "gap-4";
  const blockGap = compact ? "mb-3" : "mb-4";
  const lineGap = compact ? "space-y-1" : "space-y-1.5";
  const textCls = compact ? "text-[12px]" : "text-[13px]";

  return (
    <>
      <div className={cn("grid grid-cols-2 md:grid-cols-4", gapCls, blockGap)}>
        <StatBox
          label="Total Travel"
          value={`${totalDistance.toLocaleString()} mi`}
        />
        <StatBox
          label="Avg Travel"
          value={`${avgDistance.toLocaleString()} mi`}
        />
        <StatBox
          label="Auto Qualifiers"
          value={String(aqTeams.length)}
          tail={
            aqConfs.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {aqConfs.map((c) => (
                  <ConferenceBadge key={c} conference={c} size="sm" />
                ))}
              </div>
            ) : null
          }
        />
        <StatBox
          label="Conferences"
          value={String(conferences.length)}
          tail={
            <div className="flex flex-wrap gap-1">
              {conferences.map((c) => (
                <ConferenceBadge key={c} conference={c} size="sm" />
              ))}
            </div>
          }
        />
      </div>

      <div className={cn("grid grid-cols-1 md:grid-cols-2", gapCls, textCls)}>
        {/* Travel extremes */}
        <div className={lineGap}>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Travel
          </p>
          <p className="text-foreground">
            <MapPin className="inline h-3 w-3 mr-1 opacity-60" />
            <span className="font-medium">Longest:</span>{" "}
            <TeamLink
              team={maxTravel.team}
              gender={gender}
              hostColor={hostColorByTeam?.get(maxTravel.team)}
            >
              {maxTravel.team}
            </TeamLink>{" "}
            ({maxTravel.distanceMiles.toLocaleString()} mi)
          </p>
          <p className="text-foreground">
            <MapPin className="inline h-3 w-3 mr-1 opacity-60" />
            <span className="font-medium">Shortest:</span>{" "}
            <TeamLink
              team={minTravel.team}
              gender={gender}
              hostColor={hostColorByTeam?.get(minTravel.team)}
            >
              {minTravel.team}
            </TeamLink>{" "}
            ({minTravel.distanceMiles.toLocaleString()} mi)
          </p>
          {hostTeam && (
            <p className="text-foreground">
              <span className="font-medium">Host:</span>{" "}
              <TeamLink
                team={hostTeam.team}
                gender={gender}
                hostColor={hostColorByTeam?.get(hostTeam.team)}
              >
                {hostTeam.team}
              </TeamLink>{" "}
              <span className="text-muted-foreground">
                (#{hostRegionalSeed} seed, #{hostTeam.rank} rank)
              </span>
            </p>
          )}
        </div>

        {/* Field strength */}
        <div className={lineGap}>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Field Strength
          </p>
          {highestRankTeam && (
            <p className="text-foreground">
              <span className="font-medium">Highest Rank:</span>{" "}
              #{highestRankTeam.rank}{" "}
              <TeamLink
                team={highestRankTeam.team}
                gender={gender}
                hostColor={hostColorByTeam?.get(highestRankTeam.team)}
              >
                {highestRankTeam.team}
              </TeamLink>{" "}
              <span className="text-muted-foreground">
                (#{highestRankTeam.seed})
              </span>
            </p>
          )}
          {lowestRankTeam && (
            <p className="text-foreground">
              <span className="font-medium">Lowest Rank:</span>{" "}
              #{lowestRankTeam.rank}{" "}
              <TeamLink
                team={lowestRankTeam.team}
                gender={gender}
                hostColor={hostColorByTeam?.get(lowestRankTeam.team)}
              >
                {lowestRankTeam.team}
              </TeamLink>{" "}
              <span className="text-muted-foreground">
                (#{lowestRankTeam.seed})
              </span>
            </p>
          )}
        </div>
      </div>

      {/* Head-to-Head Matrix */}
      <HeadToHeadMatrix
        teams={teams.map((t) => ({ team: t.team, seed: t.seed, rank: t.rank }))}
        regionalColor={regional.color}
        gender={gender}
        variant={compact ? "compact" : "default"}
      />
    </>
  );
}

function StatBox({
  label,
  value,
  tail,
}: {
  label: string;
  value: string;
  /** Optional content rendered below the value — used for conference badges. */
  tail?: React.ReactNode;
}) {
  return (
    <div className="ring-card px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-[15px] font-semibold text-foreground mt-0.5 display-num">{value}</p>
      {tail && <div className="mt-1.5">{tail}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TeamRow (Desktop)
// ---------------------------------------------------------------------------

function TeamRow({
  team,
  regionalMap,
  gender = "men",
  isHost = false,
  hostColor,
}: {
  team: ScurveAssignment;
  regionalMap: Map<number, Regional>;
  gender?: Gender;
  isHost?: boolean;
  /** When set, render the team name in this colour + bold — the team hosts a regional. */
  hostColor?: string;
}) {
  const regional = regionalMap.get(team.regionalId);
  const color = regional?.color ?? "#888";
  const regionalLabel = regional?.name.replace(/ Regional$/, "") ?? "";
  const history = getRankHistory(team.team, team.rank, gender);

  return (
    <tr className="h-8 border-b border-border/40 hover:bg-white/[0.02] transition-colors duration-100">
      {/* Seed */}
      <td className="px-2 text-center font-mono tabular-nums text-[13px] text-muted-foreground">
        {team.seed}
      </td>
      {/* Team */}
      <td className="px-2 text-left text-[13px] text-foreground whitespace-nowrap">
        <TeamLink team={team.team} gender={gender} className="font-medium" hostColor={hostColor}>
          {team.team}
        </TeamLink>
        {isHost && (
          <span className="ml-1.5 inline-flex items-center rounded px-1 py-0 text-[9px] font-semibold uppercase tracking-wider bg-secondary text-muted-foreground">
            Host
          </span>
        )}
      </td>
      {/* Ranking + sparkline */}
      <td className="px-2 text-center font-mono tabular-nums text-[13px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span>#{team.rank}</span>
          <Sparkline data={history} />
        </span>
      </td>
      {/* Conference */}
      <td className="px-2 text-center text-[13px] text-foreground">
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
      <td className="px-2 text-right font-mono tabular-nums text-[13px] text-muted-foreground whitespace-nowrap">
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
  regionalSeed,
  hostColorByTeam,
  gender = "men",
}: {
  regional: Regional;
  teams: ScurveAssignment[];
  regionalMap: Map<number, Regional>;
  regionalSeed: number | undefined;
  hostColorByTeam?: Map<string, string>;
  gender?: Gender;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-1 first:mt-0">
      {/* Regional header - single line, bottom border only, no background */}
      <div
        className="w-full flex items-center gap-1.5 px-0.5 py-1 border-b border-border/40"
        style={{ borderLeftColor: regional.color, borderLeftWidth: "2px", paddingLeft: "4px" }}
      >
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-1 min-w-0 flex items-center gap-1.5 text-left"
        >
          <ChevronRight
            className={cn(
              "h-5 w-5 shrink-0 transition-transform",
              expanded && "rotate-90"
            )}
            style={{ color: regional.color }}
          />
          <span
            className="font-bold text-[22px] leading-none"
            style={{ color: regional.color }}
          >
            {regionalSeed !== undefined && (
              <span className="font-mono tabular-nums text-muted-foreground mr-1">#{regionalSeed}</span>
            )}
            {regional.name.replace(/ Regional$/, "")}
          </span>
          <span className="text-[16px] text-muted-foreground">{regional.city}</span>
          <span className="ml-auto text-[16px] text-muted-foreground tabular-nums shrink-0">
            {teams.length}t
          </span>
        </button>
        {regional.clippdUrl && (
          <a
            href={regional.clippdUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 px-1.5 py-1 text-text-tertiary hover:text-foreground"
            title="Live scoreboard on Clippd"
            aria-label={`Live scoreboard for ${regional.name} on Clippd`}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {/* Expanded detail — full content, same shape as desktop. */}
      {expanded && (
        <div
          className="px-1.5 py-1.5 border-b border-border/40 space-y-2"
          style={{ borderLeft: `2px solid ${regional.color}` }}
        >
          <RegionalDetailContent
            regional={regional}
            teams={teams}
            hostColorByTeam={hostColorByTeam}
            gender={gender}
            compact
          />
        </div>
      )}

      {/* Column headers */}
      <div
        className="text-[7px] uppercase tracking-wider text-muted-foreground/50 px-0.5 pt-0.5 items-center"
        style={{ display: "grid", gridTemplateColumns: "20px 1fr 24px 32px 42px", gap: "0px" }}
      >
        <span className="text-right">#</span>
        <span className="pl-1">Team</span>
        <span className="text-right">Rk</span>
        <span className="text-center">Conf</span>
        <span className="text-right pr-0.5">Dist</span>
      </div>

      {/* Team rows */}
      <div className="pb-0.5">
        {teams.map((team, index) => (
          <div key={`${team.team}-${team.seed}`}>
            <MobileTeamCard
              team={team}
              regionalMap={regionalMap}
              gender={gender}
              isHost={team.team === regional.host}
              hostColor={hostColorByTeam?.get(team.team)}
              showRegional={false}
            />
            {index === TEAMS_ADVANCING - 1 && teams.length > TEAMS_ADVANCING && (
              <div className="flex items-center gap-1 px-0.5 py-px">
                <div className="flex-1 border-t border-dashed border-destructive/30" />
                <span className="text-[7px] font-medium uppercase tracking-wider text-destructive/50">
                  Advancing
                </span>
                <div className="flex-1 border-t border-dashed border-destructive/30" />
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
  gender = "men",
  isHost = false,
  showRegional = true,
  hostColor,
}: {
  team: ScurveAssignment;
  regionalMap: Map<number, Regional>;
  gender?: Gender;
  isHost?: boolean;
  showRegional?: boolean;
  /** When set, render the team name in this colour + bold — the team hosts a regional. */
  hostColor?: string;
}) {
  const regional = regionalMap.get(team.regionalId);
  const color = regional?.color ?? "#888";
  const regionalLabel = regional?.name.replace(/ Regional$/, "") ?? "";

  const gridColumns = showRegional
    ? "20px 1fr 24px 38px auto 42px"
    : "20px 1fr 24px 38px 42px";

  return (
    <div
      className="h-[18px] items-center text-[10px] leading-none px-0.5 overflow-hidden"
      style={{ display: "grid", gridTemplateColumns: gridColumns, gap: "2px" }}
    >
      <span className="font-mono text-[9px] text-muted-foreground text-right tabular-nums">
        {team.seed}
      </span>
      <span className="font-medium text-foreground truncate pl-1 text-[10px] overflow-hidden whitespace-nowrap">
        <TeamLink team={team.team} gender={gender} hostColor={hostColor}>
          {team.team}
        </TeamLink>
        {isHost && <span className="text-[6px] font-bold uppercase text-muted-foreground ml-0.5">H</span>}
        {team.isAutoQualifier && <span className="text-[6px] font-bold uppercase text-primary ml-0.5">AQ</span>}
      </span>
      <span className="font-mono text-[8px] text-muted-foreground text-right tabular-nums">#{team.rank}</span>
      <span className="text-[8px] text-foreground/50 text-center truncate min-w-0">{team.conference}</span>
      {showRegional && (
        <span
          className="text-[7px] text-muted-foreground overflow-hidden whitespace-nowrap min-w-0 text-ellipsis"
          style={{ borderLeft: `2px solid ${color}`, paddingLeft: "2px" }}
        >
          {regionalLabel}
        </span>
      )}
      <span className="font-mono text-[8px] text-muted-foreground text-right tabular-nums pr-0.5">
        {team.distanceMiles.toLocaleString()}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile Visual S-Curve
// ---------------------------------------------------------------------------

function MobileVisualScurve({
  assignments,
  regionals,
  regionalMap,
  regionalSeeds,
  hostColorByTeam,
  gender = "men",
}: {
  assignments: ScurveAssignment[];
  regionals: Regional[];
  regionalMap: Map<number, Regional>;
  regionalSeeds: Map<number, number>;
  hostColorByTeam?: Map<string, string>;
  gender?: Gender;
}) {
  const { orderedRegionals, byRegional } = useScurveGrid(assignments, regionals, regionalSeeds);

  return (
    <div
      className="mt-3 grid gap-1.5"
      style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" }}
    >
      {orderedRegionals.map((r) => {
        const teams = byRegional.get(r.id) ?? [];
        return (
          <div
            key={r.id}
            className="min-w-0 rounded border border-border/60 overflow-hidden"
            style={{ borderLeftColor: r.color, borderLeftWidth: "2px" }}
          >
            {/* Regional header — fixed height + single-line truncate so every
                box stays the same size and team rows align across the 2-col grid */}
            {r.clippdUrl ? (
              <a
                href={r.clippdUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="h-[22px] px-1.5 flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wide bg-card/60 overflow-hidden hover:opacity-80"
                style={{ borderBottom: `1px solid ${r.color}30`, color: r.color }}
                title={`Live scoreboard for ${r.name} on Clippd`}
                aria-label={`Live scoreboard for ${r.name} on Clippd`}
              >
                {regionalSeeds.get(r.id) !== undefined && (
                  <span className="shrink-0">#{regionalSeeds.get(r.id)}</span>
                )}
                <span className="truncate">{r.name.replace(/ Regional$/, "")}</span>
                <ExternalLink className="ml-auto h-2.5 w-2.5 shrink-0 opacity-70" />
              </a>
            ) : (
              <div
                className="h-[22px] px-1.5 flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wide bg-card/60 overflow-hidden"
                style={{ borderBottom: `1px solid ${r.color}30`, color: r.color }}
              >
                {regionalSeeds.get(r.id) !== undefined && (
                  <span className="shrink-0">#{regionalSeeds.get(r.id)}</span>
                )}
                <span className="truncate">{r.name.replace(/ Regional$/, "")}</span>
              </div>
            )}

            {/* Column headers */}
            <div
              className="text-[6px] uppercase tracking-wider text-muted-foreground/40 px-0.5 pt-px"
              style={{ display: "grid", gridTemplateColumns: "16px minmax(0, 1fr) 20px" }}
            >
              <span className="text-right">#</span>
              <span className="pl-0.5 truncate">Team</span>
              <span className="text-right pr-0.5">Rk</span>
            </div>

            {/* Team rows */}
            <div className="pb-px">
              {teams.map((team, index) => {
                const isHost = team.team === r.host;
                const isAboveLine = index < TEAMS_ADVANCING;

                return (
                  <div key={`${team.team}-${team.seed}`}>
                    <motion.div
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        duration: 0.18,
                        ease: "easeOut",
                        delay: team.seed * 0.012,
                      }}
                      className={cn(
                        "h-[15px] items-center leading-none px-0.5 overflow-hidden",
                        isAboveLine ? "bg-secondary/40" : ""
                      )}
                      style={{ display: "grid", gridTemplateColumns: "16px minmax(0, 1fr) 20px" }}
                    >
                      <span className="font-mono text-[7px] text-muted-foreground text-right tabular-nums">
                        {index + 1}
                      </span>
                      <span className="min-w-0 font-medium text-foreground truncate pl-0.5 text-[8px] overflow-hidden whitespace-nowrap">
                        <TeamLink team={team.team} gender={gender} hostColor={hostColorByTeam?.get(team.team)}>
                          {team.team}
                        </TeamLink>
                        {isHost && <span className="text-[5px] font-bold text-muted-foreground ml-0.5">H</span>}
                        {team.isAutoQualifier && <span className="text-[5px] font-bold text-primary ml-0.5">AQ</span>}
                      </span>
                      <span className="font-mono text-[7px] text-muted-foreground text-right tabular-nums pr-0.5 overflow-hidden">
                        {team.rank}
                      </span>
                    </motion.div>
                    {index === TEAMS_ADVANCING - 1 && teams.length > TEAMS_ADVANCING && (
                      <div className="flex items-center gap-0.5 px-0.5">
                        <div className="flex-1 border-t border-dashed border-destructive/30" />
                        <span className="text-[5px] font-medium uppercase text-destructive/50">Advancing</span>
                        <div className="flex-1 border-t border-dashed border-destructive/30" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Manual Grid Section — wraps ManualGridTable with a live BreakdownView
// driven by the user's edits.
// ---------------------------------------------------------------------------

function ManualGridSection({
  teams,
  regionals,
  championships,
  gender,
}: {
  teams: TeamData[];
  regionals: Regional[];
  championships?: Championship[];
  gender: Gender;
}) {
  // Live H2H slots fed by long-press placements from the grid above. A first,
  // then B if A is filled (and the placement isn't a duplicate of A).
  const [teamA, setTeamA] = useState<string | null>(null);
  const [teamB, setTeamB] = useState<string | null>(null);
  const [tab, setTab] = useState<"h2h" | "map">("h2h");
  // Regional selection on the Map tab — clicking a regional dot fans
  // lines to all teams placed in that regional and clears A/B. Tapping
  // the same regional again clears the selection.
  const [selectedRegionalId, setSelectedRegionalId] = useState<number | null>(null);

  // Mirror state from the manual grid so the map's distance table follows
  // the user's column order, and so we know which teams sit in each regional.
  const [gridAssignments, setGridAssignments] = useState<ScurveAssignment[]>([]);
  const [gridRegionalIds, setGridRegionalIds] = useState<number[]>([]);

  // Reset slots on gender switch — H2H data is gender-specific.
  const lastGenderRef = useRef<Gender>(gender);
  useEffect(() => {
    if (lastGenderRef.current !== gender) {
      lastGenderRef.current = gender;
      setTeamA(null);
      setTeamB(null);
      setSelectedRegionalId(null);
    }
  }, [gender]);

  // Long-press placement. Rules (in priority order):
  //   1. If the team is currently highlighted as A → unhighlight A. If B
  //      was filled, promote B → A so the slots stay packed left-to-right.
  //   2. If the team is currently highlighted as B → unhighlight B (A stays).
  //   3. If A is empty and B is filled → promote B → A, place new team in B.
  //      (Maintains the "A always filled before B" invariant.)
  //   4. If A is empty and B is empty → place team in A.
  //   5. Else (A is filled with a different team) → place team in B.
  // Any of these actions cancels the regional-selection mode on the map.
  const handlePlaceTeam = useCallback(
    (teamName: string) => {
      setSelectedRegionalId(null);
      if (teamA === teamName) {
        setTeamA(teamB);
        setTeamB(null);
        return;
      }
      if (teamB === teamName) {
        setTeamB(null);
        return;
      }
      if (teamA === null) {
        if (teamB !== null) {
          setTeamA(teamB);
          setTeamB(teamName);
        } else {
          setTeamA(teamName);
        }
        return;
      }
      setTeamB(teamName);
    },
    [teamA, teamB]
  );

  // Map-tab regional click. Tapping the same regional again clears the
  // selection. Selecting a new one clears A/B (the fan now belongs to
  // every team in that regional, so a single highlighted team would be
  // visually ambiguous).
  const handleSelectRegional = useCallback((id: number) => {
    setSelectedRegionalId((prev) => {
      if (prev === id) return null;
      setTeamA(null);
      setTeamB(null);
      return id;
    });
  }, []);

  return (
    <>
      <ManualGridTable
        teams={teams}
        regionals={regionals}
        championships={championships}
        gender={gender}
        onChange={setGridAssignments}
        onRegionalsOrderChange={setGridRegionalIds}
        onPlaceTeam={handlePlaceTeam}
        teamA={teamA}
        teamB={teamB}
      />
      <div className="mt-6">
        {/* Tab switcher */}
        <div
          role="tablist"
          aria-label="Manual Grid detail tabs"
          className="inline-flex rounded border border-border overflow-hidden text-[12px] mb-3"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "h2h"}
            onClick={() => setTab("h2h")}
            className={cn(
              "px-3 py-1 transition-colors",
              tab === "h2h"
                ? "bg-primary/20 text-primary"
                : "bg-card text-muted-foreground hover:bg-card/80"
            )}
          >
            Head-to-Head
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "map"}
            onClick={() => setTab("map")}
            className={cn(
              "px-3 py-1 transition-colors border-l border-border",
              tab === "map"
                ? "bg-primary/20 text-primary"
                : "bg-card text-muted-foreground hover:bg-card/80"
            )}
          >
            Map
          </button>
        </div>

        {tab === "h2h" ? (
          <div role="tabpanel">
            <h3 className="text-[13px] font-semibold text-foreground mb-3">
              Head-to-Head
              <span className="ml-2 text-[11px] font-normal text-text-tertiary">
                Hold ~½s on a team above to send it here
              </span>
            </h3>
            <HeadToHeadBrowser
              embedded={{
                gender,
                teamA,
                teamB,
                onTeamAChange: setTeamA,
                onTeamBChange: setTeamB,
              }}
            />
          </div>
        ) : (
          <div role="tabpanel">
            <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
              <h3 className="text-[13px] font-semibold text-foreground">
                Travel Map
                <span className="ml-2 text-[11px] font-normal text-text-tertiary">
                  Distances from each selected team to every regional site
                </span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  setTeamA(null);
                  setTeamB(null);
                  setSelectedRegionalId(null);
                }}
                disabled={!teamA && !teamB && selectedRegionalId === null}
                title="Clear Team A, Team B, and any selected regional"
                aria-label="Clear Team A, Team B, and any selected regional"
                className={cn(
                  "h-[26px] px-2.5 rounded border border-border bg-card text-[12px]",
                  "text-muted-foreground hover:bg-card/80 hover:text-foreground transition-colors",
                  "disabled:opacity-40 disabled:cursor-not-allowed"
                )}
              >
                Clear Teams
              </button>
            </div>
            <ManualGridMap
              teams={teams}
              regionals={regionals}
              regionalIds={gridRegionalIds}
              assignments={gridAssignments}
              teamA={teamA}
              teamB={teamB}
              selectedRegionalId={selectedRegionalId}
              onSelectRegional={handleSelectRegional}
            />
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// S-Curve Snake Table
// ---------------------------------------------------------------------------

function ScurveSnakeTable({
  assignments,
  regionals,
  regionalMap,
  regionalSeeds,
  hostColorByTeam,
  gender = "men",
}: {
  assignments: ScurveAssignment[];
  regionals: Regional[];
  regionalMap: Map<number, Regional>;
  regionalSeeds: Map<number, number>;
  hostColorByTeam?: Map<string, string>;
  gender?: Gender;
}) {
  const orderedRegionals = useMemo(() => {
    return [...regionals].sort((a, b) => {
      return (regionalSeeds.get(a.id) ?? 99) - (regionalSeeds.get(b.id) ?? 99);
    });
  }, [regionals, regionalSeeds]);

  const numRegionals = orderedRegionals.length;

  const byRegional = useMemo(() => {
    const map = new Map<number, ScurveAssignment[]>();
    for (const r of orderedRegionals) map.set(r.id, []);
    for (const a of assignments) map.get(a.regionalId)?.push(a);
    for (const [, teams] of map) teams.sort((a, b) => a.seed - b.seed);
    return map;
  }, [assignments, orderedRegionals]);

  const numTiers = useMemo(() => {
    return Math.max(...[...byRegional.values()].map(t => t.length), 0);
  }, [byRegional]);

  const grid = useMemo(() => {
    const rows: (ScurveAssignment | null)[][] = [];
    for (let tier = 0; tier < numTiers; tier++) {
      rows.push(orderedRegionals.map(r => {
        const teams = byRegional.get(r.id) ?? [];
        return teams[tier] ?? null;
      }));
    }
    return rows;
  }, [orderedRegionals, byRegional, numTiers]);

  return (
    <div className="mt-3 overflow-x-auto">
      {/*
        Use a real <table> so each column is auto-sized by the browser to the
        widest cell in that column (header included) and every row reuses the
        same column tracks. With independent CSS-grid rows, a long team name
        in one tier (e.g. "Southern Illinois" in Athens, tier 12) only
        widened that single row's track, leaving headers + other rows
        misaligned. table-layout: auto fixes that for free.
      */}
      <table
        className="border-separate"
        style={{
          minWidth: `${numRegionals * 105 + 28}px`,
          borderSpacing: "2px 2px",
          tableLayout: "auto",
        }}
      >
        <thead>
          <tr>
            <th className="w-6 p-0" aria-hidden="true" />
            {orderedRegionals.map((r) => {
              const label = r.name.replace(/ Regional$/, "");
              return (
                <th
                  key={r.id}
                  scope="col"
                  className="text-center text-[11px] font-semibold uppercase tracking-wide py-1 px-1 whitespace-nowrap"
                  style={{ borderBottom: `2px solid ${r.color}`, color: r.color }}
                >
                  {r.clippdUrl ? (
                    <a
                      href={r.clippdUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 hover:opacity-80"
                      title={`Live scoreboard for ${r.name} on Clippd`}
                      aria-label={`Live scoreboard for ${r.name} on Clippd`}
                      style={{ color: r.color }}
                    >
                      {label}
                      <ExternalLink className="h-3 w-3 opacity-70" />
                    </a>
                  ) : (
                    label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {grid.map((row, tierIdx) => {
            const isSnakeBack = tierIdx % 2 === 1;
            const showAdvanceLine =
              tierIdx === TEAMS_ADVANCING - 1 && grid.length > TEAMS_ADVANCING;

            return (
              <Fragment key={tierIdx}>
                <tr>
                  <td className="p-0 text-center align-middle text-[9px] font-mono tabular-nums text-muted-foreground whitespace-nowrap">
                    {tierIdx + 1}
                    <span className="ml-px text-[7px] text-text-tertiary">{isSnakeBack ? "\u2190" : "\u2192"}</span>
                  </td>
                  {row.map((team, colIdx) => {
                    if (!team) {
                      return <td key={`empty-${tierIdx}-${colIdx}`} className="p-0 h-6" />;
                    }

                    const r = orderedRegionals[colIdx];
                    const isAboveLine = tierIdx < TEAMS_ADVANCING;

                    return (
                      <td key={`${team.team}-${team.seed}`} className="p-0 align-middle">
                        <motion.div
                          initial={{ opacity: 0, scale: 0.92 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{
                            duration: 0.22,
                            ease: "easeOut",
                            delay: team.seed * 0.018,
                          }}
                          className={cn(
                            "h-6 px-1 flex items-center text-[10px] rounded-sm whitespace-nowrap",
                            isAboveLine ? "bg-secondary/70" : "bg-secondary/25"
                          )}
                          style={{ borderLeft: `2px solid ${r?.color ?? "#888"}` }}
                          title={`#${team.seed} ${team.team} - Rank ${team.rank}`}
                        >
                          <span className="font-mono tabular-nums text-[8px] text-muted-foreground shrink-0 w-3.5 text-right mr-1">
                            {team.seed}
                          </span>
                          <span
                            className={cn(
                              "font-medium",
                              isAboveLine ? "text-foreground" : "text-muted-foreground"
                            )}
                          >
                            <TeamLink team={team.team} gender={gender} hostColor={hostColorByTeam?.get(team.team)}>
                              {team.team}
                            </TeamLink>
                          </span>
                          <span className="ml-auto pl-1 font-mono tabular-nums text-[8px] text-muted-foreground shrink-0">
                            {team.rank}
                          </span>
                        </motion.div>
                      </td>
                    );
                  })}
                </tr>

                {showAdvanceLine && (
                  <tr>
                    <td colSpan={numRegionals + 1} className="px-1 py-0.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 border-t border-dashed border-destructive/40" />
                        <span className="text-[8px] font-medium uppercase tracking-wider text-destructive/70">
                          Advancing
                        </span>
                        <div className="flex-1 border-t border-dashed border-destructive/40" />
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
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
  regionalSeeds,
  hostColorByTeam,
  gender = "men",
}: {
  assignments: ScurveAssignment[];
  regionals: Regional[];
  regionalMap: Map<number, Regional>;
  regionalSeeds: Map<number, number>;
  hostColorByTeam?: Map<string, string>;
  gender?: Gender;
}) {
  const { orderedRegionals, byRegional, grid, numRegionals, numTiers } = useScurveGrid(assignments, regionals, regionalSeeds);

  return (
    <div className="mt-3">
      {/* Serpentine grid (legend removed — column header borders label regionals) */}
      <div className="overflow-x-auto relative">
        <div className="min-w-[700px]">
          {/* Regional headers */}
          <div className="grid gap-0.5 mb-0.5" style={{ gridTemplateColumns: `repeat(${numRegionals}, 1fr)` }}>
            {orderedRegionals.map((r) => {
              const label = r.name.replace(/ Regional$/, "");
              const seed = regionalSeeds.get(r.id);
              const inner = (
                <>
                  {seed !== undefined && (
                    <span className="mr-1 font-mono tabular-nums">#{seed}</span>
                  )}
                  {label}
                  {r.clippdUrl && (
                    <ExternalLink className="inline h-3 w-3 ml-1 opacity-70 align-[-1px]" />
                  )}
                </>
              );
              return (
                <div
                  key={r.id}
                  className="text-center text-[12px] font-semibold uppercase tracking-wide py-1"
                  style={{ borderBottom: `2px solid ${r.color}`, color: r.color }}
                >
                  {r.clippdUrl ? (
                    <a
                      href={r.clippdUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center hover:opacity-80"
                      title={`Live scoreboard for ${r.name} on Clippd`}
                      aria-label={`Live scoreboard for ${r.name} on Clippd`}
                      style={{ color: r.color }}
                    >
                      {inner}
                    </a>
                  ) : (
                    inner
                  )}
                </div>
              );
            })}
          </div>

          {/* Tiers */}
          {grid.map((row, tierIdx) => {
            return (
              <div key={tierIdx} className="relative">
                <div
                  className="grid gap-0.5 mb-0.5"
                  style={{ gridTemplateColumns: `repeat(${numRegionals}, minmax(0, 1fr))` }}
                >
                  {row.map((team, colIdx) => {
                    const r = orderedRegionals[colIdx];
                    if (!team) {
                      return <div key={`empty-${tierIdx}-${colIdx}`} className="h-7" />;
                    }

                    const isHost = team.team === r?.host;
                    const isAboveLine = (() => {
                      const regionalTeams = byRegional.get(team.regionalId) ?? [];
                      const posInRegional = regionalTeams.findIndex((t) => t.seed === team.seed);
                      return posInRegional < TEAMS_ADVANCING;
                    })();

                    return (
                      <motion.div
                        key={`${team.team}-${team.seed}`}
                        initial={{ opacity: 0, scale: 0.92 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{
                          duration: 0.22,
                          ease: "easeOut",
                          delay: team.seed * 0.018,
                        }}
                        className={cn(
                          "h-7 px-2 flex items-center rounded text-[11px] transition-colors group relative",
                          isAboveLine
                            ? "bg-secondary/80 hover:bg-secondary"
                            : "bg-secondary/30 hover:bg-secondary/50"
                        )}
                        style={{ borderLeft: `3px solid ${r?.color ?? "#888"}` }}
                        title={`Seed ${tierIdx + 1} of ${r?.name ?? ""} \u00b7 ${team.team} (${team.conference}) \u00b7 #${team.rank} overall \u00b7 ${team.distanceMiles.toLocaleString()} mi`}
                      >
                        <span className="font-mono tabular-nums text-[10px] text-muted-foreground mr-1.5 shrink-0 w-4">
                          {tierIdx + 1}
                        </span>
                        <span className={cn(
                          "truncate font-medium flex-1 min-w-0",
                          isAboveLine ? "text-foreground" : "text-muted-foreground"
                        )}>
                          <TeamLink team={team.team} gender={gender} hostColor={hostColorByTeam?.get(team.team)}>
                            {team.team}
                          </TeamLink>
                          {isHost && <span className="text-[8px] font-bold text-muted-foreground uppercase ml-1">H</span>}
                          {team.isAutoQualifier && !isHost && <span className="text-[8px] font-bold text-primary ml-1">AQ</span>}
                        </span>
                        <span className="font-mono tabular-nums text-[10px] text-muted-foreground shrink-0 ml-1">
                          #{team.rank}
                        </span>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Advancement line after tier containing 5th team */}
                {tierIdx === TEAMS_ADVANCING - 1 && (
                  <div className="flex items-center gap-2 px-1 py-0.5">
                    <div className="flex-1 border-t border-dashed border-destructive/40" />
                    <span className="text-[9px] font-medium uppercase tracking-wider text-destructive/70">
                      Advancing
                    </span>
                    <div className="flex-1 border-t border-dashed border-destructive/40" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Summary stats — compact, always visible */}
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 sm:gap-3">
        {orderedRegionals.map((r) => {
          const teams = byRegional.get(r.id) ?? [];
          const totalDist = teams.reduce((sum, t) => sum + t.distanceMiles, 0);
          const avgDist = teams.length > 0 ? Math.round(totalDist / teams.length) : 0;

          return (
            <div
              key={r.id}
              className="ring-card px-2.5 py-2"
              style={{ borderLeft: `3px solid ${r.color}`, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
            >
              <p className="text-[11px] font-medium text-foreground truncate">{r.name.replace(/ Regional$/, "")}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{r.host}</p>
              <p className="text-[10px] text-muted-foreground mt-1 tabular-nums">
                <Plane className="inline h-3 w-3 mr-0.5 opacity-60" />
                {avgDist.toLocaleString()} mi avg
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
