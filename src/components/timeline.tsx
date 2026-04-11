"use client";

import { cn } from "@/lib/utils";
import type { SnapshotMeta, SnapshotDiff, RankChange } from "@/data/snapshots";
import { ChevronUp, ChevronDown, Minus } from "lucide-react";

interface TimelineProps {
  snapshots: SnapshotMeta[];
  diffs: SnapshotDiff[];
}

export default function Timeline({ snapshots, diffs }: TimelineProps) {
  if (snapshots.length <= 1 && diffs.length === 0) {
    return (
      <div className="space-y-6">
        {/* Current snapshot */}
        <div className="flex items-start gap-4">
          <div className="flex flex-col items-center">
            <div className="w-3 h-3 rounded-full bg-primary" />
            <div className="w-0.5 h-16 bg-border" />
          </div>
          <div>
            <p className="text-[13px] font-medium text-foreground">
              {snapshots[0]?.date ?? "Apr 10, 2026"}
            </p>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              {snapshots[0]?.label ?? "Initial launch"}
            </p>
            {snapshots[0]?.notes && (
              <p className="text-[12px] text-text-tertiary mt-1">
                {snapshots[0].notes}
              </p>
            )}
            <p className="text-[11px] text-text-tertiary mt-1">
              {snapshots[0]?.teamCount ?? 81} teams in field
            </p>
          </div>
        </div>

        {/* Upcoming */}
        <div className="flex items-start gap-4">
          <div className="flex flex-col items-center">
            <div className="w-3 h-3 rounded-full border-2 border-border bg-background" />
          </div>
          <div>
            <p className="text-[13px] font-medium text-muted-foreground">
              Next update
            </p>
            <p className="text-[12px] text-text-tertiary mt-0.5">
              New rankings typically drop on Wednesdays. Check back after the
              next Broadie/Clippd update to see how the S-curve changes.
            </p>
          </div>
        </div>

        {/* Key dates */}
        <div className="mt-8 card-gradient p-4">
          <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground mb-3">
            Key Dates Ahead
          </p>
          <div className="space-y-2">
            <DateItem date="Apr 29" label="Women's NCAA Selections" />
            <DateItem date="May 6" label="Men's NCAA Selections" />
            <DateItem date="May 11-13" label="Women's Regionals" />
            <DateItem date="May 18-20" label="Men's Regionals" />
            <DateItem date="May 29" label="NCAA Championship begins" />
          </div>
        </div>
      </div>
    );
  }

  // Full timeline with diffs
  return (
    <div className="space-y-1">
      {snapshots.map((snapshot, idx) => {
        const diff = diffs.find((d) => d.toDate === snapshot.date);
        const isFirst = idx === snapshots.length - 1;
        const isLatest = idx === 0;

        return (
          <div key={snapshot.date} className="flex items-start gap-4">
            <div className="flex flex-col items-center shrink-0">
              <div
                className={cn(
                  "w-3 h-3 rounded-full",
                  isLatest ? "bg-primary" : "bg-muted-foreground/50"
                )}
              />
              {!isFirst && <div className="w-0.5 flex-1 min-h-[40px] bg-border" />}
            </div>
            <div className="pb-6">
              <div className="flex items-baseline gap-2">
                <p className="text-[13px] font-medium text-foreground">
                  {snapshot.date}
                </p>
                <span className="text-[11px] text-muted-foreground">
                  {snapshot.label}
                </span>
                {isLatest && (
                  <span className="text-[10px] font-medium text-primary">
                    Latest
                  </span>
                )}
              </div>

              {snapshot.notes && (
                <p className="text-[12px] text-text-tertiary mt-0.5">
                  {snapshot.notes}
                </p>
              )}

              {/* Diff details */}
              {diff && (
                <div className="mt-2 space-y-2">
                  {diff.rankChanges.length > 0 && (
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
                        Biggest Movers
                      </p>
                      <div className="space-y-0.5">
                        {diff.rankChanges
                          .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
                          .slice(0, 8)
                          .map((change) => (
                            <MoverRow key={change.team} change={change} />
                          ))}
                      </div>
                    </div>
                  )}

                  {diff.regionalChanges.length > 0 && (
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
                        Regional Changes
                      </p>
                      <div className="space-y-0.5">
                        {diff.regionalChanges.map((rc) => (
                          <p
                            key={rc.team}
                            className="text-[12px] text-muted-foreground"
                          >
                            <span className="text-foreground font-medium">
                              #{rc.seed} {rc.team}
                            </span>{" "}
                            {rc.fromRegional} &rarr; {rc.toRegional}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  {diff.newTeams.length > 0 && (
                    <p className="text-[12px] text-muted-foreground">
                      <span className="text-emerald-400">New:</span>{" "}
                      {diff.newTeams.join(", ")}
                    </p>
                  )}

                  {diff.droppedTeams.length > 0 && (
                    <p className="text-[12px] text-muted-foreground">
                      <span className="text-red-400">Dropped:</span>{" "}
                      {diff.droppedTeams.join(", ")}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MoverRow({ change }: { change: RankChange }) {
  return (
    <p className="text-[12px] text-muted-foreground flex items-center gap-1">
      {change.delta > 0 ? (
        <ChevronUp className="h-3 w-3 text-emerald-400 shrink-0" />
      ) : change.delta < 0 ? (
        <ChevronDown className="h-3 w-3 text-red-400 shrink-0" />
      ) : (
        <Minus className="h-3 w-3 text-muted-foreground shrink-0" />
      )}
      <span className="text-foreground font-medium">{change.team}</span>
      <span className="text-text-tertiary">
        #{change.from} &rarr; #{change.to}
      </span>
      <span
        className={cn(
          "text-[10px] font-mono",
          change.delta > 0 ? "text-emerald-400" : "text-red-400"
        )}
      >
        ({change.delta > 0 ? "+" : ""}
        {change.delta})
      </span>
    </p>
  );
}

function DateItem({ date, label }: { date: string; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[12px] font-mono text-muted-foreground w-16 shrink-0">
        {date}
      </span>
      <span className="text-[12px] text-foreground">{label}</span>
    </div>
  );
}
