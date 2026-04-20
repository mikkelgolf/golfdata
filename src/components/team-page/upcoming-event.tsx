"use client";

import { useEffect, useState } from "react";
import type { Championship } from "@/data/championships-men-2026";

type EventState =
  | { kind: "upcoming"; daysUntil: number }
  | { kind: "live" }
  | { kind: "concluded"; daysSince: number };

function eventStateOn(
  startIso: string,
  endIso: string,
  today: Date
): EventState {
  const start = new Date(startIso + "T00:00:00");
  const end = new Date(endIso + "T23:59:59");
  const MS = 24 * 60 * 60 * 1000;
  if (today < start) {
    const diff = Math.ceil((start.getTime() - today.getTime()) / MS);
    return { kind: "upcoming", daysUntil: diff };
  }
  if (today > end) {
    const diff = Math.floor((today.getTime() - end.getTime()) / MS);
    return { kind: "concluded", daysSince: diff };
  }
  return { kind: "live" };
}

export default function UpcomingEvent({
  championship,
}: {
  championship: Championship;
}) {
  const [state, setState] = useState<EventState | null>(null);

  useEffect(() => {
    setState(eventStateOn(championship.startDate, championship.endDate, new Date()));
    const interval = setInterval(() => {
      setState(eventStateOn(championship.startDate, championship.endDate, new Date()));
    }, 60_000);
    return () => clearInterval(interval);
  }, [championship.startDate, championship.endDate]);

  const pill =
    state?.kind === "live"
      ? {
          label: "Live now",
          // No pulse (banned). Static red ring + tinted fill instead.
          className:
            "bg-red-500/15 text-red-300 border-red-500/40",
        }
      : state?.kind === "upcoming"
        ? {
            label:
              state.daysUntil === 0
                ? "Starts today"
                : state.daysUntil === 1
                  ? "Starts tomorrow"
                  : `Starts in ${state.daysUntil} days`,
            className: "bg-emerald-500/10 text-emerald-300 border-emerald-500/40",
          }
        : state?.kind === "concluded"
          ? {
              label:
                state.daysSince === 0
                  ? "Concluded today"
                  : state.daysSince === 1
                    ? "Concluded yesterday"
                    : `Concluded ${state.daysSince} days ago`,
              className: "bg-slate-500/10 text-slate-300 border-slate-500/40",
            }
          : null;

  // Flat container — single hairline border, faint card tint. When live,
  // overlay a static 1px red ring so the card reads as "active" without any
  // pulse. Drops the previous ring-card mask-composite gradient.
  const liveShell =
    state?.kind === "live"
      ? "rounded-lg border border-border/60 bg-card/40 ring-1 ring-red-500/40 px-3 py-2 transition-colors"
      : "rounded-lg border border-border/60 bg-card/40 px-3 py-2 transition-colors hover:border-border-medium";

  return (
    <div className={liveShell}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-foreground leading-tight">
            {championship.name}
          </div>
          <div className="mt-0.5 text-[11px] text-text-tertiary">
            {championship.courseName} · {championship.city}
            {championship.state ? `, ${championship.state}` : ""}
            <span className="mx-1">·</span>
            <span className="font-mono tabular-nums">
              {championship.startDate} → {championship.endDate}
            </span>
          </div>
        </div>
        {pill && (
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap ${pill.className}`}
          >
            {pill.label}
          </span>
        )}
      </div>
      {championship.winner && (
        <div className="mt-1 text-[11px] text-primary">
          Winner: {championship.winner}
        </div>
      )}
    </div>
  );
}
