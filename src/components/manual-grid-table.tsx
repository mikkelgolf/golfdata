"use client";

/**
 * ManualGridTable — user-editable Regional S-curve grid.
 *
 * Visually mirrors ScurveSnakeTable but every cell + header is drag-and-
 * droppable and contains no outbound links. Cells linearise in snake-
 * serpentine order; dragging a cell to a new slot calls arrayMove on the
 * linearised array and re-packs into the 2D grid (so cross-row drops
 * naturally cause cells to flow up/down). Dragging a header reorders the
 * column AND moves the cells underneath with it.
 *
 * State persists per-gender to localStorage. A Reset button restores the
 * Committee S-curve defaults.
 */

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  KeyboardSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { RotateCcw, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  buildInitialGridState,
  clearGridState,
  defaultGridFromAssignments,
  linearizeGrid,
  saveGridState,
  serpentineIndex,
  unserpentineIndex,
  type ManualGridState,
} from "@/lib/manual-grid";
import {
  applyTravelBalance,
  computeAffectedScope,
  reorientCellsToColumns,
  type CutoffMode,
} from "@/lib/manual-grid-balance";
import {
  TEAM_A_BG,
  TEAM_A_COLOR,
  TEAM_B_BG,
  TEAM_B_COLOR,
} from "@/lib/manual-grid-colors";
import { computeScurve, type ScurveAssignment } from "@/lib/scurve";
import type { TeamData } from "@/data/rankings-men";
import type { Regional } from "@/data/regionals-men-2026";
import type { Championship } from "@/data/championships-men-2026";

// ---------------------------------------------------------------------------
// Internal state — wraps the persisted ManualGridState with stable per-slot
// IDs so dnd-kit can track items across drags (including empty slots).
// ---------------------------------------------------------------------------

interface Slot {
  id: string; // stable across drags
  team: string | null;
}

interface InternalState {
  regionalIds: number[];
  slots: Slot[][]; // [tier][col]
}

let emptyIdCounter = 0;
function newEmptyId(): string {
  emptyIdCounter += 1;
  return `__empty-${emptyIdCounter}`;
}

function toInternal(state: ManualGridState): InternalState {
  const slots = state.cells.map((row) =>
    row.map<Slot>((teamName) =>
      teamName
        ? { id: `team:${teamName}`, team: teamName }
        : { id: newEmptyId(), team: null }
    )
  );
  return { regionalIds: [...state.regionalIds], slots };
}

function toPersisted(state: InternalState): ManualGridState {
  return {
    regionalIds: [...state.regionalIds],
    cells: state.slots.map((row) => row.map((s) => s.team)),
  };
}

// ---------------------------------------------------------------------------
// Constants — match scurve-table.tsx
// ---------------------------------------------------------------------------

const TEAMS_ADVANCING = 5;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Gender = "men" | "women";

export interface ManualGridTableProps {
  teams: TeamData[];
  regionals: Regional[];
  championships?: Championship[];
  gender: Gender;
  /** Notifies parent when state changes — used to drive Breakdown / H2H view. */
  onChange?: (assignments: ScurveAssignment[]) => void;
  /**
   * Long-press (~1s hold + release) on a team fires this with the team name.
   * The parent decides where the team lands (typically: A first, B as fallback).
   */
  onPlaceTeam?: (teamName: string) => void;
  /** Currently-selected Team A (highlighted in cyan in the grid). */
  teamA?: string | null;
  /** Currently-selected Team B (highlighted in magenta in the grid). */
  teamB?: string | null;
}

// ---------------------------------------------------------------------------
// Header cell — sortable
// ---------------------------------------------------------------------------

function SortableHeader({
  regional,
  isDragging,
}: {
  regional: Regional;
  isDragging: boolean;
}) {
  const sortable = useSortable({ id: `header:${regional.id}` });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.4 : 1,
    cursor: sortable.isDragging ? "grabbing" : "grab",
    borderBottom: `2px solid ${regional.color}`,
    color: regional.color,
    // Default touch-action so scroll works during the pre-drag delay.
  };
  const label = regional.name.replace(/ Regional$/, "");
  return (
    <th
      ref={sortable.setNodeRef}
      scope="col"
      className={cn(
        "text-center text-[11px] font-semibold uppercase tracking-wide py-1 px-1 whitespace-nowrap select-none",
        isDragging && "ring-1 ring-foreground/30"
      )}
      style={style}
      {...sortable.attributes}
      {...sortable.listeners}
    >
      {label}
    </th>
  );
}

// ---------------------------------------------------------------------------
// Body cell — sortable
// ---------------------------------------------------------------------------

/**
 * Long-press window: a press-and-release within this range fires onPlaceTeam.
 * Below LONG_PRESS_MIN_MS it counts as a tap (no-op). At/above DRAG_DELAY_MS
 * the TouchSensor takes over and a drag begins instead of a placement.
 *
 * DRAG_DELAY_MS is aligned with iOS's built-in long-press haptic (~500ms),
 * so on mobile the haptic feedback coincides with drag activation.
 *
 * MOVEMENT_THRESHOLD_PX: if the pointer moves more than this during the
 * press, we treat it as a scroll attempt rather than a placement. The
 * TouchSensor's `tolerance` does the same job for drag activation.
 */
const LONG_PRESS_MIN_MS = 200;
const LONG_PRESS_MAX_MS = 480;
const DRAG_DELAY_MS = 500;
const MOVEMENT_THRESHOLD_PX = 6;

function SortableCell({
  slot,
  team,
  seed,
  regionalColor,
  isAboveLine,
  hostColor,
  onPlaceTeam,
  isLongPressArmed,
  setLongPressArmedSlotId,
  selectedAs,
}: {
  slot: Slot;
  team: TeamData | undefined;
  seed: number | null;
  regionalColor: string;
  isAboveLine: boolean;
  hostColor: string | undefined;
  onPlaceTeam?: (teamName: string) => void;
  isLongPressArmed: boolean;
  setLongPressArmedSlotId: (id: string | null) => void;
  /** "A" or "B" if this team is currently the H2H selection; null otherwise. */
  selectedAs: "A" | "B" | null;
}) {
  const sortable = useSortable({ id: slot.id });
  const pressStartRef = useRef<number | null>(null);
  const pressStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const pressMovedRef = useRef(false);
  const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearArmTimer = () => {
    if (armTimerRef.current) {
      clearTimeout(armTimerRef.current);
      armTimerRef.current = null;
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!slot.team || !onPlaceTeam) {
      sortable.listeners?.onPointerDown?.(e);
      return;
    }
    pressStartRef.current = Date.now();
    pressStartPosRef.current = { x: e.clientX, y: e.clientY };
    pressMovedRef.current = false;
    clearArmTimer();
    armTimerRef.current = setTimeout(() => {
      // Don't visually arm if the user has started scrolling.
      if (!pressMovedRef.current) setLongPressArmedSlotId(slot.id);
    }, LONG_PRESS_MIN_MS);
    // Compose with dnd-kit's listener (it also wants pointerdown)
    sortable.listeners?.onPointerDown?.(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const startPos = pressStartPosRef.current;
    if (!startPos) return;
    const dx = e.clientX - startPos.x;
    const dy = e.clientY - startPos.y;
    if (Math.hypot(dx, dy) > MOVEMENT_THRESHOLD_PX) {
      pressMovedRef.current = true;
      // Cancel the visual arming if we've started moving.
      clearArmTimer();
      setLongPressArmedSlotId(null);
    }
  };

  const handlePointerUpOrCancel = () => {
    const start = pressStartRef.current;
    const moved = pressMovedRef.current;
    pressStartRef.current = null;
    pressStartPosRef.current = null;
    pressMovedRef.current = false;
    clearArmTimer();
    setLongPressArmedSlotId(null);
    if (start === null) return;
    if (sortable.isDragging) return; // dnd-kit took over — skip placement
    if (moved) return; // user was scrolling, not pressing
    const elapsed = Date.now() - start;
    if (
      slot.team &&
      onPlaceTeam &&
      elapsed >= LONG_PRESS_MIN_MS &&
      elapsed < LONG_PRESS_MAX_MS
    ) {
      onPlaceTeam(slot.team);
    }
  };

  const style: CSSProperties = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.4 : 1,
    cursor: slot.team ? (sortable.isDragging ? "grabbing" : "grab") : "default",
    // Default touch-action so scroll works during the pre-drag delay.
  };
  if (!slot.team) {
    // Empty slot: still a drop target (so cross-row insert works) but not
    // draggable on its own. We omit the drag listeners.
    return (
      <td
        ref={sortable.setNodeRef}
        className="p-0 h-6"
        style={{ ...style, cursor: "default" }}
        {...sortable.attributes}
      >
        <div className="h-6 rounded-sm border border-dashed border-border/40" />
      </td>
    );
  }
  // Spread sortable.listeners but override pointerdown so we can also fire
  // our long-press timer alongside dnd-kit's drag detection.
  const composedListeners = {
    ...sortable.listeners,
    onPointerDown: handlePointerDown,
  };
  return (
    <td
      ref={sortable.setNodeRef}
      className="p-0 align-middle"
      style={style}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUpOrCancel}
      onPointerCancel={handlePointerUpOrCancel}
      onPointerLeave={handlePointerUpOrCancel}
      {...sortable.attributes}
      {...composedListeners}
    >
      <div
        className={cn(
          "h-6 px-1 flex items-center text-[10px] rounded-sm whitespace-nowrap select-none transition-shadow",
          !selectedAs && (isAboveLine ? "bg-secondary/70" : "bg-secondary/25"),
          selectedAs && "ring-2",
          isLongPressArmed && "ring-1 ring-primary/70 shadow-[0_0_0_2px_rgba(99,102,241,0.25)]"
        )}
        style={{
          borderLeft: `2px solid ${regionalColor}`,
          ...(selectedAs === "A"
            ? {
                backgroundColor: TEAM_A_BG,
                ["--tw-ring-color" as string]: TEAM_A_COLOR,
              }
            : selectedAs === "B"
              ? {
                  backgroundColor: TEAM_B_BG,
                  ["--tw-ring-color" as string]: TEAM_B_COLOR,
                }
              : undefined),
        }}
        title={team ? `#${seed} ${team.team} - Rank ${team.rank}` : slot.team}
      >
        <span className="font-mono tabular-nums text-[8px] text-muted-foreground shrink-0 w-3.5 text-right mr-1">
          {seed ?? ""}
        </span>
        <span
          className={cn(
            "font-medium",
            isAboveLine ? "text-foreground" : "text-muted-foreground",
            hostColor && "font-semibold"
          )}
          style={hostColor ? { color: hostColor } : undefined}
        >
          {slot.team}
        </span>
        <span className="ml-auto pl-1 font-mono tabular-nums text-[8px] text-muted-foreground shrink-0">
          {team?.rank ?? ""}
        </span>
      </div>
    </td>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ManualGridTable({
  teams,
  regionals,
  championships,
  gender,
  onChange,
  onPlaceTeam,
  teamA = null,
  teamB = null,
}: ManualGridTableProps) {
  // Build initial state (committee defaults merged with localStorage if any)
  const [internal, setInternal] = useState<InternalState>(() => {
    return toInternal(buildInitialGridState(teams, regionals, championships, gender));
  });

  // Undo stack — every state change pushes the previous state. Cleared on
  // gender/teams switch and on Reset All. Page reload also clears it (state
  // is in component memory, not localStorage).
  const [history, setHistory] = useState<InternalState[]>([]);

  // If gender / teams switch, rebuild from new defaults + new localStorage
  // bucket. We key on gender and the eligible-team-set hash to avoid
  // resetting on every minor render.
  const lastInputRef = useRef<{ gender: Gender; teamHash: string } | null>(null);
  useEffect(() => {
    const teamHash = teams.map((t) => t.team).join("|");
    const last = lastInputRef.current;
    if (last && last.gender === gender && last.teamHash === teamHash) return;
    lastInputRef.current = { gender, teamHash };
    setInternal(toInternal(buildInitialGridState(teams, regionals, championships, gender)));
    setHistory([]);
  }, [teams, regionals, championships, gender]);

  // Persist + notify parent on every change
  useEffect(() => {
    const persisted = toPersisted(internal);
    saveGridState(gender, persisted);
  }, [internal, gender]);

  const teamLookup = useMemo(() => {
    const map = new Map<string, TeamData>();
    for (const t of teams) map.set(t.team, t);
    return map;
  }, [teams]);

  const regionalMap = useMemo(() => {
    const map = new Map<number, Regional>();
    for (const r of regionals) map.set(r.id, r);
    return map;
  }, [regionals]);

  const hostColorByTeam = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of regionals) map.set(r.host, r.color);
    return map;
  }, [regionals]);

  // Derive ScurveAssignment[] for breakdown view (and seed display)
  const derivedAssignments = useMemo<ScurveAssignment[]>(() => {
    const numCols = internal.regionalIds.length;
    if (numCols === 0) return [];
    const linearTeams = linearizeGrid(
      internal.slots.map((row) => row.map((s) => s.team)),
      numCols
    );
    const out: ScurveAssignment[] = [];
    let seed = 0;
    for (let i = 0; i < linearTeams.length; i++) {
      const teamName = linearTeams[i];
      if (!teamName) continue;
      const team = teamLookup.get(teamName);
      if (!team) continue;
      const { col } = unserpentineIndex(i, numCols);
      const regionalId = internal.regionalIds[col];
      seed += 1;
      out.push({
        ...team,
        seed,
        regionalId,
        distanceMiles: 0, // not needed for breakdown
      });
    }
    return out;
  }, [internal, teamLookup]);

  // Notify parent
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    onChangeRef.current?.(derivedAssignments);
  }, [derivedAssignments]);

  // Seed-by-team for cell rendering
  const seedByTeam = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of derivedAssignments) map.set(a.team, a.seed);
    return map;
  }, [derivedAssignments]);

  // Sensors. Mouse uses a small distance threshold (so a click doesn't
  // accidentally drag); touch requires a 3-second hold so horizontal scroll
  // still works and accidental swipes don't move cells.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: DRAG_DELAY_MS, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Track active drag for overlay
  const [activeId, setActiveId] = useState<string | null>(null);
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    const activeIsHeader = activeId.startsWith("header:");
    const overIsHeader = overId.startsWith("header:");

    // Cross-type drop: ignore (cells can't go to header row, headers only swap with headers)
    if (activeIsHeader !== overIsHeader) return;

    setInternal((prev) => {
      let next: InternalState | null = null;
      if (activeIsHeader) {
        // Reorder regionalIds. Other cells stay put — but the moved
        // regional's host team follows the header so it stays under "its"
        // column (the host doesn't travel).
        const headerIds = prev.regionalIds.map((id) => `header:${id}`);
        const fromIdx = headerIds.indexOf(activeId);
        const toIdx = headerIds.indexOf(overId);
        if (fromIdx === -1 || toIdx === -1) return prev;
        const newRegionalIds = arrayMove(prev.regionalIds, fromIdx, toIdx);

        const movedRegionalId = prev.regionalIds[fromIdx];
        const movedRegional = regionals.find((r) => r.id === movedRegionalId);
        const hostTeam = movedRegional?.host;

        let newSlots = prev.slots;
        if (hostTeam) {
          // Locate the host team in the current grid (if it's there).
          let hostRow = -1;
          let hostCol = -1;
          outer: for (let r = 0; r < prev.slots.length; r++) {
            for (let c = 0; c < prev.slots[r].length; c++) {
              if (prev.slots[r][c].team === hostTeam) {
                hostRow = r;
                hostCol = c;
                break outer;
              }
            }
          }
          // Swap (hostRow, hostCol) with (hostRow, toIdx) so the host
          // ends up under the regional's new column. Skip if the host is
          // already there or not on the grid.
          if (hostRow !== -1 && hostCol !== toIdx) {
            newSlots = prev.slots.map((row) => row.slice());
            const tmp = newSlots[hostRow][hostCol];
            newSlots[hostRow][hostCol] = newSlots[hostRow][toIdx];
            newSlots[hostRow][toIdx] = tmp;
          }
        }

        next = { regionalIds: newRegionalIds, slots: newSlots };
      } else {
        // Cell move — operate on the linearised array
        const numCols = prev.regionalIds.length;
        const linear: Slot[] = [];
        for (let r = 0; r < prev.slots.length; r++) {
          for (let c = 0; c < numCols; c++) {
            linear[serpentineIndex(r, c, numCols)] = prev.slots[r][c];
          }
        }
        const fromIdx = linear.findIndex((s) => s.id === activeId);
        const toIdx = linear.findIndex((s) => s.id === overId);
        if (fromIdx === -1 || toIdx === -1) return prev;
        const moved = arrayMove(linear, fromIdx, toIdx);

        // Re-pack
        const numRows = prev.slots.length;
        const newSlots: Slot[][] = [];
        for (let r = 0; r < numRows; r++) {
          newSlots.push(new Array<Slot>(numCols));
        }
        for (let i = 0; i < moved.length; i++) {
          const { row, col } = unserpentineIndex(i, numCols);
          if (row < numRows && col < numCols) newSlots[row][col] = moved[i];
        }
        next = { regionalIds: prev.regionalIds, slots: newSlots };
      }
      if (next) {
        setHistory((h) => [...h, prev]);
      }
      return next ?? prev;
    });
  }, [regionals]);

  // Undo the most recent change (one step back).
  const handleResetLast = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const last = h[h.length - 1];
      setInternal(last);
      return h.slice(0, -1);
    });
  }, []);

  // Wipe history + localStorage and rebuild from committee defaults.
  const handleResetAll = useCallback(() => {
    clearGridState(gender);
    const assignments = computeScurve(teams, regionals, "committee", gender, championships);
    const fresh = defaultGridFromAssignments(assignments, regionals);
    setInternal(toInternal(fresh));
    setHistory([]);
  }, [gender, teams, regionals, championships]);

  // ---------------------------------------------------------------------
  // Travel-balance optimizer (David, 2026-04-28).
  // Reassigns teams within each affected tier so total mileage of that row
  // is minimised. Hosts stay at their own regional; manual swaps are
  // preserved unless overrideSwaps=true.
  // ---------------------------------------------------------------------

  // Committee defaults (used for swap-detection).
  const committeeState = useMemo(() => {
    const assignments = computeScurve(teams, regionals, "committee", gender, championships);
    return defaultGridFromAssignments(assignments, regionals);
  }, [teams, regionals, gender, championships]);

  // Magic Number = worst-ranked at-large currently in the field. This is
  // the same value rendered above the "Magic Number · Field Cutoff" line in
  // the Bubble Breakdown (men: 68; women: 51 in the 2025-26 cycle). Used
  // as the default value of the Overall Seed input.
  const magicNumberRank = useMemo(() => {
    let worst = -Infinity;
    for (const row of internal.slots) {
      for (const slot of row) {
        if (!slot.team) continue;
        const t = teamLookup.get(slot.team);
        if (!t || t.isAutoQualifier) continue;
        if (t.rank > worst) worst = t.rank;
      }
    }
    return worst > 0 ? worst : 1;
  }, [internal, teamLookup]);

  const totalSeats = useMemo(() => {
    return internal.slots.length * (internal.regionalIds.length || 1);
  }, [internal]);

  const numTiers = internal.slots.length;

  const [balanceOpen, setBalanceOpen] = useState(false);
  const [balanceMode, setBalanceMode] = useState<CutoffMode>("regional");
  const [regionalSeedInput, setRegionalSeedInput] = useState<number>(8);
  const [overallSeedInput, setOverallSeedInput] = useState<number>(magicNumberRank);
  const [overrideSwaps, setOverrideSwaps] = useState<boolean>(false);

  // Keep the Overall Seed input in sync with the magic number when the user
  // hasn't customised it yet (i.e., default state). We track whether the
  // user has touched the field.
  const userTouchedOverallRef = useRef(false);
  useEffect(() => {
    if (!userTouchedOverallRef.current) {
      setOverallSeedInput(magicNumberRank);
    }
  }, [magicNumberRank]);

  // Live "affects N teams · Y rows" preview.
  const balancePreview = useMemo(() => {
    const cells = internal.slots.map((row) => row.map((s) => s.team));
    const defaultCells = reorientCellsToColumns(
      committeeState.cells,
      committeeState.regionalIds,
      internal.regionalIds
    );
    const cutoffValue =
      balanceMode === "regional" ? regionalSeedInput : overallSeedInput;
    return computeAffectedScope({
      cells,
      regionalIds: internal.regionalIds,
      regionals,
      teamLookup,
      cutoffMode: balanceMode,
      cutoffValue,
      overrideSwaps,
      defaultCells,
    });
  }, [internal, committeeState, regionals, teamLookup, balanceMode, regionalSeedInput, overallSeedInput, overrideSwaps]);

  const handleApplyBalance = useCallback(() => {
    setInternal((prev) => {
      const cells = prev.slots.map((row) => row.map((s) => s.team));
      const defaultCells = reorientCellsToColumns(
        committeeState.cells,
        committeeState.regionalIds,
        prev.regionalIds
      );
      const cutoffValue =
        balanceMode === "regional" ? regionalSeedInput : overallSeedInput;
      const balanced = applyTravelBalance({
        cells,
        regionalIds: prev.regionalIds,
        regionals,
        teamLookup,
        cutoffMode: balanceMode,
        cutoffValue,
        overrideSwaps,
        defaultCells,
      });
      // Detect no-op: if balanced cells equal current cells, skip the
      // history push so the undo stack doesn't fill with empty steps.
      let changed = false;
      outer: for (let r = 0; r < cells.length; r++) {
        for (let c = 0; c < cells[r].length; c++) {
          if (cells[r][c] !== balanced[r][c]) {
            changed = true;
            break outer;
          }
        }
      }
      if (!changed) return prev;
      // Re-attach slot IDs so dnd-kit's keys stay stable for moved teams.
      const slotByTeam = new Map<string, Slot>();
      for (const row of prev.slots) {
        for (const slot of row) {
          if (slot.team) slotByTeam.set(slot.team, slot);
        }
      }
      const newSlots: Slot[][] = balanced.map((row) =>
        row.map((teamName) =>
          teamName
            ? slotByTeam.get(teamName) ?? { id: `team:${teamName}`, team: teamName }
            : { id: newEmptyId(), team: null }
        )
      );
      setHistory((h) => [...h, prev]);
      return { regionalIds: prev.regionalIds, slots: newSlots };
    });
    setBalanceOpen(false);
  }, [committeeState, regionals, teamLookup, balanceMode, regionalSeedInput, overallSeedInput, overrideSwaps]);

  // Flatten header SortableContext items
  const headerItems = useMemo(
    () => internal.regionalIds.map((id) => `header:${id}`),
    [internal.regionalIds]
  );

  // Linearised slot IDs for the cell SortableContext
  const cellItems = useMemo(() => {
    const numCols = internal.regionalIds.length;
    const out: string[] = [];
    for (let r = 0; r < internal.slots.length; r++) {
      for (let c = 0; c < numCols; c++) {
        out[serpentineIndex(r, c, numCols)] = internal.slots[r][c].id;
      }
    }
    return out;
  }, [internal]);

  const numRegionals = internal.regionalIds.length;
  const grid = internal.slots; // already 2D in [tier][col]
  const isDragging = activeId !== null;

  // Slot ID currently armed for placement (visual ring while held).
  const [longPressArmedSlotId, setLongPressArmedSlotId] = useState<string | null>(null);

  return (
    <div className="mt-3">
      <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
        <div className="text-[11px] text-text-tertiary leading-snug max-w-[640px] space-y-1.5">
          <p>
            Long-press a team to highlight it as Team A or B for the
            Head-to-Head + Travel Map below; long-press the same team again
            to clear it. Keep holding past the haptic to drag a team to a
            different cell. On desktop, click and drag works immediately.
            All changes here are saved to this browser only.
          </p>
          <p>
            The number to the <span className="text-foreground/80">left</span>{" "}
            of each team is its overall seed; the number to the{" "}
            <span className="text-foreground/80">right</span> is its true
            ranking.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleResetLast}
            disabled={history.length === 0}
            className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border bg-background text-[11px] text-foreground hover:bg-secondary/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title={
              history.length === 0
                ? "Nothing to undo"
                : `Undo last change (${history.length} step${history.length === 1 ? "" : "s"} available)`
            }
          >
            <RotateCcw className="h-3 w-3" />
            Reset Last
          </button>
          <button
            type="button"
            onClick={handleResetAll}
            className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border bg-background text-[11px] text-foreground hover:bg-secondary/50 transition-colors"
            title="Reset every cell to the Committee S-curve defaults"
          >
            <RotateCcw className="h-3 w-3" />
            Reset All
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setBalanceOpen((o) => !o)}
              aria-expanded={balanceOpen}
              className={cn(
                "inline-flex items-center gap-1 h-7 px-2 rounded-md border text-[11px] transition-colors",
                balanceOpen
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-foreground hover:bg-secondary/50"
              )}
              title="Optimize travel from a chosen seed onward"
            >
              <Sparkles className="h-3 w-3" />
              Balance Travel
            </button>
            {balanceOpen && (
              <BalancePopover
                mode={balanceMode}
                onModeChange={setBalanceMode}
                regionalSeed={regionalSeedInput}
                onRegionalSeedChange={(v) => {
                  setRegionalSeedInput(v);
                }}
                overallSeed={overallSeedInput}
                onOverallSeedChange={(v) => {
                  userTouchedOverallRef.current = true;
                  setOverallSeedInput(v);
                }}
                magicNumberRank={magicNumberRank}
                overrideSwaps={overrideSwaps}
                onOverrideSwapsChange={setOverrideSwaps}
                numTiers={numTiers}
                totalSeats={totalSeats}
                preview={balancePreview}
                onCancel={() => setBalanceOpen(false)}
                onApply={handleApplyBalance}
              />
            )}
          </div>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div
          className={cn(
            "overflow-x-auto transition-opacity duration-150",
            isDragging && "opacity-70"
          )}
          data-dragging={isDragging || undefined}
        >
          <table
            className="border-separate"
            style={{
              minWidth: `${numRegionals * 105 + 28}px`,
              borderSpacing: "2px 2px",
              tableLayout: "auto",
            }}
          >
            <thead>
              <SortableContext items={headerItems} strategy={horizontalListSortingStrategy}>
                <tr>
                  <th className="w-6 p-0" aria-hidden="true" />
                  {internal.regionalIds.map((id) => {
                    const r = regionalMap.get(id);
                    if (!r) return <th key={id} />;
                    return (
                      <SortableHeader
                        key={id}
                        regional={r}
                        isDragging={activeId === `header:${id}`}
                      />
                    );
                  })}
                </tr>
              </SortableContext>
            </thead>
            <SortableContext items={cellItems} strategy={rectSortingStrategy}>
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
                          <span className="ml-px text-[7px] text-text-tertiary">
                            {isSnakeBack ? "\u2190" : "\u2192"}
                          </span>
                        </td>
                        {row.map((slot, colIdx) => {
                          const regionalId = internal.regionalIds[colIdx];
                          const r = regionalMap.get(regionalId);
                          const team = slot.team ? teamLookup.get(slot.team) : undefined;
                          const seed = slot.team ? seedByTeam.get(slot.team) ?? null : null;
                          const isAboveLine = tierIdx < TEAMS_ADVANCING;
                          const selectedAs: "A" | "B" | null =
                            slot.team && slot.team === teamA
                              ? "A"
                              : slot.team && slot.team === teamB
                                ? "B"
                                : null;
                          return (
                            <SortableCell
                              key={slot.id}
                              slot={slot}
                              team={team}
                              seed={seed}
                              regionalColor={r?.color ?? "#888"}
                              isAboveLine={isAboveLine}
                              hostColor={slot.team ? hostColorByTeam.get(slot.team) : undefined}
                              onPlaceTeam={onPlaceTeam}
                              isLongPressArmed={longPressArmedSlotId === slot.id}
                              setLongPressArmedSlotId={setLongPressArmedSlotId}
                              selectedAs={selectedAs}
                            />
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
            </SortableContext>
          </table>
        </div>

        <DragOverlay>
          {activeId && activeId.startsWith("team:") ? (
            <div className="h-6 px-1 flex items-center text-[10px] rounded-sm whitespace-nowrap bg-secondary border border-border shadow-lg">
              <span className="font-medium text-foreground">
                {activeId.replace(/^team:/, "")}
              </span>
            </div>
          ) : activeId && activeId.startsWith("header:") ? (
            <div className="text-center text-[11px] font-semibold uppercase tracking-wide py-1 px-2 bg-card border border-border rounded shadow-lg">
              {(() => {
                const id = Number(activeId.replace(/^header:/, ""));
                const r = regionalMap.get(id);
                return r ? r.name.replace(/ Regional$/, "") : "";
              })()}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Travel-balance popover — UI for picking the cutoff + applying the optimizer.
// ---------------------------------------------------------------------------

interface BalancePopoverProps {
  mode: CutoffMode;
  onModeChange: (m: CutoffMode) => void;
  regionalSeed: number;
  onRegionalSeedChange: (v: number) => void;
  overallSeed: number;
  onOverallSeedChange: (v: number) => void;
  magicNumberRank: number;
  overrideSwaps: boolean;
  onOverrideSwapsChange: (v: boolean) => void;
  numTiers: number;
  totalSeats: number;
  preview: {
    teams: number;
    rows: number;
    lockedHosts: number;
    lockedSwaps: number;
  };
  onCancel: () => void;
  onApply: () => void;
}

function BalancePopover({
  mode,
  onModeChange,
  regionalSeed,
  onRegionalSeedChange,
  overallSeed,
  onOverallSeedChange,
  magicNumberRank,
  overrideSwaps,
  onOverrideSwapsChange,
  numTiers,
  totalSeats,
  preview,
  onCancel,
  onApply,
}: BalancePopoverProps) {
  const clamp = (v: number, min: number, max: number) =>
    Math.max(min, Math.min(max, v));

  return (
    <>
      {/* Backdrop captures clicks outside the popover */}
      <button
        type="button"
        aria-label="Close"
        onClick={onCancel}
        className="fixed inset-0 z-10 cursor-default"
        tabIndex={-1}
      />
      <div
        role="dialog"
        aria-label="Balance travel"
        className="fixed left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 w-[min(320px,calc(100vw-1.5rem))] max-h-[calc(100vh-2rem)] overflow-y-auto rounded-md border border-border bg-card shadow-xl p-3 space-y-3 text-foreground"
      >
        <div className="text-[12px] font-semibold flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Balance travel
        </div>
        <p className="text-[11px] text-muted-foreground leading-snug">
          Pick a cutoff. Teams from there to the bottom of the grid get
          reassigned within their tier so the row&apos;s total mileage is
          minimised. Hosts always stay at their own site.
        </p>

        {/* Mode + numeric input rows */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-2 text-[11px] cursor-pointer">
            <input
              type="radio"
              name="balance-mode"
              checked={mode === "regional"}
              onChange={() => onModeChange("regional")}
              className="accent-primary"
            />
            <span className="w-[110px]">Regional seed</span>
            <input
              type="number"
              min={1}
              max={numTiers}
              value={regionalSeed}
              onFocus={() => onModeChange("regional")}
              onChange={(e) =>
                onRegionalSeedChange(
                  clamp(parseInt(e.target.value || "1", 10) || 1, 1, numTiers)
                )
              }
              className={cn(
                "w-[60px] h-7 px-1.5 rounded border bg-background text-center font-mono tabular-nums text-[12px]",
                mode === "regional" ? "border-primary/60" : "border-border opacity-60"
              )}
              disabled={mode !== "regional"}
            />
            <span className="text-[10px] text-text-tertiary">of {numTiers}</span>
          </label>
          <label className="flex items-center gap-2 text-[11px] cursor-pointer">
            <input
              type="radio"
              name="balance-mode"
              checked={mode === "overall"}
              onChange={() => onModeChange("overall")}
              className="accent-primary"
            />
            <span className="w-[110px]">Overall seed</span>
            <input
              type="number"
              min={1}
              max={totalSeats}
              value={overallSeed}
              onFocus={() => onModeChange("overall")}
              onChange={(e) =>
                onOverallSeedChange(
                  clamp(
                    parseInt(e.target.value || "1", 10) || 1,
                    1,
                    totalSeats
                  )
                )
              }
              className={cn(
                "w-[60px] h-7 px-1.5 rounded border bg-background text-center font-mono tabular-nums text-[12px]",
                mode === "overall" ? "border-primary/60" : "border-border opacity-60"
              )}
              disabled={mode !== "overall"}
            />
            <span className="text-[10px] text-text-tertiary">
              of {totalSeats} · magic # {magicNumberRank}
            </span>
          </label>
        </div>

        {/* Override Manual Swaps toggle */}
        <label className="flex items-start gap-2 text-[11px] cursor-pointer pt-1 border-t border-border/40">
          <input
            type="checkbox"
            checked={overrideSwaps}
            onChange={(e) => onOverrideSwapsChange(e.target.checked)}
            className="accent-primary mt-[3px]"
          />
          <span className="leading-snug text-foreground/90">
            Override manual swaps
            <span className="block text-[10px] text-text-tertiary">
              When off, slots you&apos;ve already moved stay put even inside
              the affected range.
            </span>
          </span>
        </label>

        {/* Preview */}
        <div className="rounded border border-border/60 bg-background/50 px-2.5 py-1.5 text-[11px] font-mono tabular-nums text-muted-foreground">
          Affects{" "}
          <span className="text-foreground">{preview.teams}</span>{" "}
          team{preview.teams === 1 ? "" : "s"} ·{" "}
          <span className="text-foreground">{preview.rows}</span>{" "}
          row{preview.rows === 1 ? "" : "s"}
          {(preview.lockedHosts > 0 || preview.lockedSwaps > 0) && (
            <span className="block text-[10px] text-text-tertiary mt-0.5">
              {preview.lockedHosts > 0 && (
                <>{preview.lockedHosts} host-locked</>
              )}
              {preview.lockedHosts > 0 && preview.lockedSwaps > 0 && " · "}
              {preview.lockedSwaps > 0 && (
                <>{preview.lockedSwaps} swap-locked</>
              )}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="h-7 px-2.5 rounded-md border border-border bg-background text-[11px] text-foreground hover:bg-secondary/50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={preview.teams < 2}
            className="h-7 px-2.5 rounded-md border border-primary bg-primary/10 text-[11px] text-primary hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed"
            title={
              preview.teams < 2
                ? "Need at least 2 free teams to optimize"
                : "Apply the travel-balanced reassignment"
            }
          >
            Apply
          </button>
        </div>
      </div>
    </>
  );
}
