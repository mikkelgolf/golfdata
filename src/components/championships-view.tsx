"use client";

import {
  useState,
  useMemo,
  useCallback,
  useTransition,
  useDeferredValue,
} from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  assignToChampionships,
  type ChampionshipAssignment,
} from "@/lib/championships";
import type { TeamData } from "@/data/rankings-men";
import type { Championship } from "@/data/championships-men-2026";
import { Search, ChevronRight, Plane, Calendar } from "lucide-react";
import ChampionshipsMap from "@/components/championships-map";
import { ChampionshipsBeeswarm } from "@/components/championships-beeswarm";
import { AnimatedNumber } from "@/components/animated-number";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ViewMode = "byChampionship" | "chronological" | "map";
type Gender = "men" | "women";

interface ChampionshipsViewProps {
  menTeams: TeamData[];
  womenTeams: TeamData[];
  menChampionships: Championship[];
  womenChampionships: Championship[];
  lastUpdated: string;
  todayISO: string; // YYYY-MM-DD passed from server to avoid hydration mismatch
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function parseISO(s: string): Date {
  return new Date(s + "T00:00:00");
}

function formatDateRange(start: string, end: string): string {
  const s = parseISO(start);
  const e = parseISO(end);
  const monthShort = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short" });
  if (s.getMonth() === e.getMonth()) {
    return `${monthShort(s)} ${s.getDate()}\u2013${e.getDate()}`;
  }
  return `${monthShort(s)} ${s.getDate()}\u2013${monthShort(e)} ${e.getDate()}`;
}

function isVenueTBD(c: Championship): boolean {
  return c.lat === 0 && c.lng === 0;
}

function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

function classifyByDate(
  championship: Championship,
  today: Date
): "inProgress" | "thisWeek" | "later" | "past" {
  const start = parseISO(championship.startDate);
  const end = parseISO(championship.endDate);
  if (today >= start && today <= end) return "inProgress";
  if (today > end) return "past";
  const daysUntilStart = daysBetween(today, start);
  if (daysUntilStart <= 7 && daysUntilStart >= 0) return "thisWeek";
  return "later";
}

// ---------------------------------------------------------------------------
// SegmentedToggle (inlined to avoid touching scurve-table.tsx)
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
    <div className="inline-flex h-8 items-center rounded-md border border-white/[0.06] bg-secondary/40 p-0.5 shadow-flat">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "h-7 min-w-[44px] px-2.5 text-[12px] font-medium rounded-[4px] whitespace-nowrap transition-colors",
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
// Component
// ---------------------------------------------------------------------------

export default function ChampionshipsView({
  menTeams,
  womenTeams,
  menChampionships,
  womenChampionships,
  lastUpdated,
  todayISO,
}: ChampionshipsViewProps) {
  const today = useMemo(() => parseISO(todayISO), [todayISO]);
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialView =
    (searchParams.get("view") as ViewMode) || "map";
  const initialGender = (searchParams.get("gender") as Gender) || "men";

  const [viewMode, setViewMode] = useState<ViewMode>(initialView);
  const [gender, setGender] = useState<Gender>(initialGender);
  const [search, setSearch] = useState("");

  const [isPending, startTransition] = useTransition();
  const deferredSearch = useDeferredValue(search);
  const isStale = deferredSearch !== search;

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
      updateUrl(v, gender);
    });
  };

  const handleGenderChange = (g: Gender) => {
    startTransition(() => {
      setGender(g);
      updateUrl(viewMode, g);
    });
  };

  const activeChampionships =
    gender === "men" ? menChampionships : womenChampionships;
  const activeTeams = gender === "men" ? menTeams : womenTeams;

  // Compute team-to-championship assignments
  const assignments = useMemo(
    () => assignToChampionships(activeTeams, activeChampionships),
    [activeTeams, activeChampionships]
  );

  // Lookup map
  const championshipMap = useMemo(() => {
    const m = new Map<number, Championship>();
    for (const c of activeChampionships) m.set(c.id, c);
    return m;
  }, [activeChampionships]);

  // Filter by search
  const filtered = useMemo(() => {
    if (!deferredSearch) return assignments;
    const q = deferredSearch.toLowerCase();
    return assignments.filter((t) => {
      const champ = championshipMap.get(t.championshipId);
      return (
        t.team.toLowerCase().includes(q) ||
        t.conference.toLowerCase().includes(q) ||
        (champ?.name ?? "").toLowerCase().includes(q) ||
        (champ?.conferenceFull ?? "").toLowerCase().includes(q) ||
        (champ?.courseName ?? "").toLowerCase().includes(q) ||
        (champ?.city ?? "").toLowerCase().includes(q)
      );
    });
  }, [assignments, deferredSearch, championshipMap]);

  // Group filtered teams by championship
  const groupedByChampionship = useMemo(() => {
    const groups = new Map<number, ChampionshipAssignment[]>();
    for (const a of filtered) {
      const arr = groups.get(a.championshipId) ?? [];
      arr.push(a);
      groups.set(a.championshipId, arr);
    }
    for (const [, arr] of groups) {
      arr.sort((a, b) => a.rank - b.rank);
    }

    const lowerSearch = deferredSearch.toLowerCase();
    const result: { championship: Championship; teams: ChampionshipAssignment[] }[] = [];
    for (const c of activeChampionships) {
      const teams = groups.get(c.id) ?? [];
      const championshipMatchesSearch =
        deferredSearch &&
        (c.name.toLowerCase().includes(lowerSearch) ||
          c.conference.toLowerCase().includes(lowerSearch) ||
          c.conferenceFull.toLowerCase().includes(lowerSearch) ||
          c.courseName.toLowerCase().includes(lowerSearch) ||
          c.city.toLowerCase().includes(lowerSearch));
      if (teams.length === 0 && !championshipMatchesSearch && deferredSearch) {
        continue;
      }
      result.push({ championship: c, teams });
    }
    return result;
  }, [filtered, activeChampionships, deferredSearch]);

  // Sort variants for the two grouped views
  const groupedAlphabetical = useMemo(
    () =>
      [...groupedByChampionship].sort((a, b) =>
        a.championship.conference.localeCompare(b.championship.conference)
      ),
    [groupedByChampionship]
  );

  const groupedChronological = useMemo(
    () =>
      [...groupedByChampionship].sort(
        (a, b) =>
          parseISO(a.championship.startDate).getTime() -
          parseISO(b.championship.startDate).getTime()
      ),
    [groupedByChampionship]
  );

  // Lifted state: which championship is focused (shared between map + table)
  const [activeChampionship, setActiveChampionship] = useState<number | null>(null);

  // Empty-state for genders/datasets without data
  if (activeChampionships.length === 0) {
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
        <div className="mt-10 text-center text-[13px] text-muted-foreground">
          {gender === "men" ? "Men's" : "Women's"} conference championship data
          is not yet available for this season.
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-full transition-opacity duration-200 data-[pending=true]:opacity-60 data-[stale=true]:opacity-70"
      data-pending={isPending}
      data-stale={isStale}
    >
      <ThisWeekBanner
        championships={activeChampionships}
        today={today}
      />
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

      {viewMode === "map" && (
        <>
          <div className="mt-2 sm:mt-3">
            <p className="hidden sm:block text-[12px] text-text-tertiary mb-2">
              Tap a championship to focus its travel lines. Team dots are
              colored by their conference championship.
            </p>
            <ChampionshipsMap
              assignments={assignments}
              championships={activeChampionships}
              activeChampionship={activeChampionship}
              onActiveChampionshipChange={setActiveChampionship}
            />
          </div>
          {assignments.length > 0 && (
            <div className="mt-3 sm:mt-4">
              <ChampionshipsBeeswarm
                assignments={assignments}
                championshipMap={championshipMap}
              />
            </div>
          )}
          <PredictedAQSection
            grouped={groupedChronological}
            assignments={assignments}
            activeChampionship={activeChampionship}
            onActiveChampionshipChange={setActiveChampionship}
          />
        </>
      )}

      {viewMode === "byChampionship" && (
        <ChampionshipGroupView
          groups={groupedAlphabetical}
          mode="alphabetical"
          totalShown={filtered.length}
          today={today}
        />
      )}

      {viewMode === "chronological" && (
        <ChampionshipGroupView
          groups={groupedChronological}
          mode="chronological"
          totalShown={filtered.length}
          today={today}
        />
      )}
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
      <div className="hidden sm:flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search teams, conferences, courses..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search championships"
            className="h-8 w-64 rounded-md border border-border bg-background pl-8 pr-3 text-[13px] text-foreground placeholder:text-text-placeholder focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <SegmentedToggle
          options={[
            { value: "map", label: "Map" },
            { value: "byChampionship", label: "By Championship" },
            { value: "chronological", label: "Chronological" },
          ]}
          value={viewMode}
          onChange={(v) => onViewChange(v as ViewMode)}
        />

        <SegmentedToggle
          options={[
            { value: "men", label: "Men" },
            { value: "women", label: "Women" },
          ]}
          value={gender}
          onChange={(g) => onGenderChange(g as Gender)}
        />

        <div className="ml-auto flex items-center gap-3 text-[12px] text-muted-foreground">
          <span className="tabular-nums">
            <AnimatedNumber
              value={resultCount}
              className="text-foreground !font-normal !tracking-normal"
            />{" "}
            teams
          </span>
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
              { value: "map", label: "Map" },
              { value: "byChampionship", label: "Champ" },
              { value: "chronological", label: "Date" },
            ]}
            value={viewMode}
            onChange={(v) => onViewChange(v as ViewMode)}
          />
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search teams, conferences..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search championships"
            className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-3 text-[13px] text-foreground placeholder:text-text-placeholder focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="tabular-nums">
            <AnimatedNumber
              value={resultCount}
              className="text-foreground !font-normal !tracking-normal"
            />{" "}
            teams
          </span>
          <span className="text-text-tertiary">Updated {lastUpdated}</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ThisWeekBanner
// ---------------------------------------------------------------------------

function ThisWeekBanner({
  championships,
  today,
}: {
  championships: Championship[];
  today: Date;
}) {
  const { inProgress, thisWeek } = useMemo(() => {
    const ip: Championship[] = [];
    const tw: Championship[] = [];
    for (const c of championships) {
      const status = classifyByDate(c, today);
      if (status === "inProgress") ip.push(c);
      else if (status === "thisWeek") tw.push(c);
    }
    ip.sort(
      (a, b) =>
        parseISO(a.startDate).getTime() - parseISO(b.startDate).getTime()
    );
    tw.sort(
      (a, b) =>
        parseISO(a.startDate).getTime() - parseISO(b.startDate).getTime()
    );
    return { inProgress: ip, thisWeek: tw };
  }, [championships, today]);

  if (inProgress.length === 0 && thisWeek.length === 0) return null;

  return (
    <div className="mb-2 sm:mb-3 rounded-lg border border-border bg-card/40 px-3 py-2">
      <div className="flex items-start gap-2">
        <Calendar className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-4 min-w-0 flex-1">
          {inProgress.length > 0 && (
            <div className="text-[12px] text-foreground">
              <span className="text-[10px] uppercase tracking-wide font-semibold text-primary mr-1.5">
                In progress
              </span>
              {inProgress.map((c, i) => (
                <span key={c.id}>
                  <span className="font-medium">{c.conference}</span>
                  <span className="text-text-tertiary ml-1 font-mono tabular-nums text-[11px]">
                    {formatDateRange(c.startDate, c.endDate)}
                  </span>
                  {i < inProgress.length - 1 && (
                    <span className="text-text-tertiary mx-1.5">·</span>
                  )}
                </span>
              ))}
            </div>
          )}
          {thisWeek.length > 0 && (
            <div className="text-[12px] text-foreground">
              <span className="text-[10px] uppercase tracking-wide font-semibold text-amber-400/80 mr-1.5">
                This week
              </span>
              {thisWeek.map((c, i) => (
                <span key={c.id}>
                  <span className="font-medium">{c.conference}</span>
                  <span className="text-text-tertiary ml-1 font-mono tabular-nums text-[11px]">
                    {formatDateRange(c.startDate, c.endDate)}
                  </span>
                  {i < thisWeek.length - 1 && (
                    <span className="text-text-tertiary mx-1.5">·</span>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChampionshipGroupView (used by byChampionship + chronological)
// ---------------------------------------------------------------------------

function ChampionshipGroupView({
  groups,
  mode,
  totalShown,
  today,
}: {
  groups: { championship: Championship; teams: ChampionshipAssignment[] }[];
  mode: "alphabetical" | "chronological";
  totalShown: number;
  today: Date;
}) {
  if (groups.length === 0) {
    return (
      <div className="mt-6 px-4 py-12 text-center text-[13px] text-muted-foreground">
        No championships match your search.
      </div>
    );
  }

  return (
    <div className="mt-3 sm:mt-4 space-y-2">
      {mode === "chronological" && (
        <p className="hidden sm:block text-[12px] text-text-tertiary">
          {groups.length} championships · {totalShown} teams · ordered by start
          date
        </p>
      )}
      {groups.map(({ championship, teams }) => (
        <ChampionshipCard
          key={championship.id}
          championship={championship}
          teams={teams}
          showDate={mode === "chronological"}
          status={classifyByDate(championship, today)}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChampionshipCard
// ---------------------------------------------------------------------------

function ChampionshipCard({
  championship,
  teams,
  showDate,
  status,
}: {
  championship: Championship;
  teams: ChampionshipAssignment[];
  showDate: boolean;
  status: "inProgress" | "thisWeek" | "later" | "past";
}) {
  const [expanded, setExpanded] = useState(false);
  const tbd = isVenueTBD(championship);
  const teamsWithCoords = teams.filter((t) => t.lat !== 0 || t.lng !== 0);
  const totalDistance = teamsWithCoords.reduce(
    (sum, t) => sum + t.distanceMiles,
    0
  );
  const avgDistance =
    teamsWithCoords.length > 0
      ? Math.round(totalDistance / teamsWithCoords.length)
      : 0;
  const top = teams[0];

  const ringClass =
    status === "inProgress"
      ? "ring-1 ring-primary/40"
      : status === "thisWeek"
        ? "ring-1 ring-amber-500/30"
        : "";

  return (
    <div
      className={cn(
        "rounded-lg border border-border overflow-hidden",
        ringClass
      )}
      style={{ borderLeft: `3px solid ${championship.color}` }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-3 text-left bg-card hover:bg-card/80 transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 flex-wrap">
              <ChevronRight
                className={cn(
                  "h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform",
                  expanded && "rotate-90"
                )}
              />
              <span className="font-semibold text-[14px] text-foreground leading-none">
                {championship.name}
              </span>
              {showDate && (
                <span className="text-[11px] font-mono tabular-nums text-foreground/80 leading-none">
                  {formatDateRange(
                    championship.startDate,
                    championship.endDate
                  )}
                </span>
              )}
              {status === "inProgress" && (
                <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider bg-primary/15 text-primary leading-none">
                  Live
                </span>
              )}
              {status === "thisWeek" && (
                <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider bg-amber-500/15 text-amber-400 leading-none">
                  This week
                </span>
              )}
            </div>
            <div className="mt-1.5 ml-5 text-[12px] text-muted-foreground leading-tight">
              {tbd ? (
                <span className="italic">Venue TBD</span>
              ) : (
                <>
                  {championship.courseName}
                  {championship.host && championship.host !== "TBD" && (
                    <>
                      <span className="opacity-50"> · </span>
                      <span>Host: {championship.host}</span>
                    </>
                  )}
                </>
              )}
              {!tbd && (
                <>
                  <span className="opacity-50"> · </span>
                  <span>{championship.city}</span>
                </>
              )}
            </div>
            {!showDate && (
              <div className="mt-1 ml-5 text-[11px] font-mono tabular-nums text-text-tertiary">
                {formatDateRange(championship.startDate, championship.endDate)}
              </div>
            )}
          </div>
          <div className="flex flex-col items-end text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
            <span className="tabular-nums">{teams.length} teams</span>
            {teams.length > 0 && !tbd && (
              <span className="hidden sm:inline tabular-nums text-text-tertiary mt-0.5">
                <Plane className="inline h-3 w-3 mr-0.5 opacity-60" />
                {avgDistance.toLocaleString()} mi avg
              </span>
            )}
            {top && (
              <span className="text-[10px] mt-0.5 text-foreground/70 truncate max-w-[120px]">
                AQ: {top.team}
              </span>
            )}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="bg-card/30 border-t border-border/50">
          {championship.notes && (
            <p className="px-4 py-2 text-[11px] text-text-tertiary border-b border-border/30">
              {championship.notes}
            </p>
          )}
          {teams.length === 0 ? (
            <p className="px-4 py-3 text-[12px] text-text-tertiary italic">
              No ranked teams from this conference appear in the current
              rankings.
            </p>
          ) : (
            <table
              className="w-full text-[12px]"
              aria-label={`Teams competing in ${championship.name}`}
            >
              <thead className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                <tr className="border-b border-border/40">
                  <th className="px-3 py-1 text-left font-medium w-[44px]">
                    Rank
                  </th>
                  <th className="px-3 py-1 text-left font-medium">Team</th>
                  <th className="px-3 py-1 text-center font-medium w-[60px]">
                    Type
                  </th>
                  <th className="px-3 py-1 text-right font-medium w-[80px]">
                    Distance
                  </th>
                </tr>
              </thead>
              <tbody>
                {teams.map((t) => (
                  <tr
                    key={t.team}
                    className="border-b border-border/20 last:border-b-0 hover:bg-white/[0.02]"
                  >
                    <td className="px-3 py-1.5 font-mono tabular-nums text-muted-foreground">
                      #{t.rank}
                    </td>
                    <td className="px-3 py-1.5 text-foreground">
                      {t.team}
                      {!t.eligible && (
                        <span className="ml-1.5 text-[9px] font-semibold text-amber-500/80 uppercase">
                          Ineligible
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      {t.isAutoQualifier ? (
                        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-primary/15 text-primary">
                          AQ
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-secondary text-muted-foreground">
                          AL
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 font-mono tabular-nums text-muted-foreground text-right">
                      {tbd || (t.lat === 0 && t.lng === 0)
                        ? "—"
                        : `${t.distanceMiles.toLocaleString()} mi`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PredictedAQSection
// ---------------------------------------------------------------------------

function PredictedAQSection({
  grouped,
  assignments,
  activeChampionship,
  onActiveChampionshipChange,
}: {
  grouped: { championship: Championship; teams: ChampionshipAssignment[] }[];
  assignments: ChampionshipAssignment[];
  activeChampionship: number | null;
  onActiveChampionshipChange: (id: number | null) => void;
}) {
  const totalChampionships = grouped.length;
  const championshipsWithTeams = grouped.filter((g) => g.teams.length > 0);

  if (totalChampionships === 0) return null;

  return (
    <section className="mt-6">
      <div className="flex items-baseline gap-2 mb-2">
        <h3 className="text-[13px] font-semibold text-foreground">
          Predicted AQ Winners
        </h3>
        <span className="text-[11px] text-text-tertiary tabular-nums">
          <AnimatedNumber
            value={totalChampionships}
            className="!font-normal !tracking-normal text-text-tertiary"
          />{" "}
          championships ·{" "}
          <AnimatedNumber
            value={assignments.length}
            className="!font-normal !tracking-normal text-text-tertiary"
          />{" "}
          ranked teams
        </span>
      </div>
      <p className="text-[11px] text-text-tertiary mb-2">
        The top-ranked team in each conference based on the current rankings.
        Conference championship winners earn an automatic NCAA regional bid
        regardless of season record.
      </p>

      <div className="rounded-lg border border-border overflow-hidden">
        <div
          className="px-3 py-1.5 bg-card text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 90px 60px",
            gap: "6px",
          }}
        >
          <span>Championship</span>
          <span>Predicted AQ</span>
          <span>Dates</span>
          <span className="text-right">Rank</span>
        </div>
        {grouped.map(({ championship, teams }) => {
          const top = teams[0] ?? null;
          const tbd = isVenueTBD(championship);
          const isSelected = activeChampionship === championship.id;
          const isMappable = !tbd;
          return (
            <button
              key={championship.id}
              onClick={() => {
                if (!isMappable) return;
                onActiveChampionshipChange(isSelected ? null : championship.id);
              }}
              className={cn(
                "w-full h-9 items-center text-[12px] px-3 border-b border-border/40 last:border-b-0 text-left transition-colors",
                isMappable ? "cursor-pointer hover:bg-white/[0.03]" : "cursor-default",
                isSelected && "bg-white/[0.04]"
              )}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 90px 60px",
                gap: "6px",
                borderLeft: `2px solid ${championship.color}`,
                paddingLeft: "8px",
              }}
            >
              <span className="truncate font-medium text-foreground">
                {championship.conference}
                {tbd && (
                  <span className="ml-1.5 text-[9px] text-amber-500/80 uppercase">
                    TBD
                  </span>
                )}
              </span>
              <span className="text-foreground/90 truncate">
                {top ? top.team : <span className="text-text-tertiary">—</span>}
              </span>
              <span className="font-mono tabular-nums text-[11px] text-muted-foreground">
                {formatDateRange(championship.startDate, championship.endDate)}
              </span>
              <span className="font-mono tabular-nums text-[11px] text-muted-foreground text-right">
                {top ? `#${top.rank}` : "—"}
              </span>
            </button>
          );
        })}
        {championshipsWithTeams.length < totalChampionships && (
          <div className="px-3 py-2 bg-card/50 border-t border-border text-[11px] text-text-tertiary">
            {totalChampionships - championshipsWithTeams.length} championship
            {totalChampionships - championshipsWithTeams.length === 1
              ? ""
              : "s"}{" "}
            with no ranked teams in the current rankings.
          </div>
        )}
      </div>
    </section>
  );
}
