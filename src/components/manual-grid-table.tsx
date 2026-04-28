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
  PointerSensor,
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
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  buildInitialGridState,
  clearGridState,
  defaultGridFromAssignments,
  linearizeGrid,
  relinearizeGrid,
  saveGridState,
  serpentineIndex,
  unserpentineIndex,
  type ManualGridState,
} from "@/lib/manual-grid";
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
  /** Notifies parent when state changes — used to drive Breakdown view. */
  onChange?: (assignments: ScurveAssignment[]) => void;
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
    touchAction: "none",
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

function SortableCell({
  slot,
  team,
  seed,
  regionalColor,
  isAboveLine,
  hostColor,
}: {
  slot: Slot;
  team: TeamData | undefined;
  seed: number | null;
  regionalColor: string;
  isAboveLine: boolean;
  hostColor: string | undefined;
}) {
  const sortable = useSortable({ id: slot.id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.4 : 1,
    cursor: slot.team ? (sortable.isDragging ? "grabbing" : "grab") : "default",
    touchAction: "none",
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
  return (
    <td
      ref={sortable.setNodeRef}
      className="p-0 align-middle"
      style={style}
      {...sortable.attributes}
      {...sortable.listeners}
    >
      <div
        className={cn(
          "h-6 px-1 flex items-center text-[10px] rounded-sm whitespace-nowrap select-none",
          isAboveLine ? "bg-secondary/70" : "bg-secondary/25"
        )}
        style={{ borderLeft: `2px solid ${regionalColor}` }}
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
}: ManualGridTableProps) {
  // Build initial state (committee defaults merged with localStorage if any)
  const [internal, setInternal] = useState<InternalState>(() => {
    return toInternal(buildInitialGridState(teams, regionals, championships, gender));
  });

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

  // Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
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
      if (activeIsHeader) {
        // Reorder regionalIds AND apply same permutation to each cell row
        const headerIds = prev.regionalIds.map((id) => `header:${id}`);
        const fromIdx = headerIds.indexOf(activeId);
        const toIdx = headerIds.indexOf(overId);
        if (fromIdx === -1 || toIdx === -1) return prev;
        const newRegionalIds = arrayMove(prev.regionalIds, fromIdx, toIdx);
        const newSlots = prev.slots.map((row) => arrayMove(row, fromIdx, toIdx));
        return { regionalIds: newRegionalIds, slots: newSlots };
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
        return { regionalIds: prev.regionalIds, slots: newSlots };
      }
    });
  }, []);

  // Reset button — wipe localStorage and rebuild from committee defaults
  const handleReset = useCallback(() => {
    clearGridState(gender);
    const assignments = computeScurve(teams, regionals, "committee", gender, championships);
    const fresh = defaultGridFromAssignments(assignments, regionals);
    setInternal(toInternal(fresh));
  }, [gender, teams, regionals, championships]);

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

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-[11px] text-text-tertiary leading-snug">
          Drag any team or regional header to rearrange. Changes are saved to this browser.
        </p>
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border bg-background text-[11px] text-foreground hover:bg-secondary/50 transition-colors"
          title="Reset to Committee S-curve defaults"
        >
          <RotateCcw className="h-3 w-3" />
          Reset
        </button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="overflow-x-auto">
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
                          return (
                            <SortableCell
                              key={slot.id}
                              slot={slot}
                              team={team}
                              seed={seed}
                              regionalColor={r?.color ?? "#888"}
                              isAboveLine={isAboveLine}
                              hostColor={slot.team ? hostColorByTeam.get(slot.team) : undefined}
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
