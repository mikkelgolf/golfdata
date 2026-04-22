"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { RegionalFinishRich, Gender } from "@/data/records-types";

// Lazy-load the rich dataset the same way head-to-head meetings are loaded,
// so the JSON stays out of the base bundle (~500KB uncompressed).
let regionalsRichPromise: Promise<RegionalFinishRich[]> | null = null;
function loadRegionalsRich(): Promise<RegionalFinishRich[]> {
  if (!regionalsRichPromise) {
    regionalsRichPromise = import("@/data/regionals-rich.json").then(
      (mod) => mod.default as unknown as RegionalFinishRich[]
    );
  }
  return regionalsRichPromise;
}

interface Meeting {
  year: number;
  regional: string;
  a: RegionalFinishRich;
  b: RegionalFinishRich;
}

function fmtSg(v: number | null): string {
  if (v === null) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}`;
}

function teamLine(row: RegionalFinishRich): string {
  const parts: string[] = [];
  if (row.seed != null) parts.push(`#${row.seed}`);
  parts.push(`→ ${row.result ?? "—"}`);
  if (row.sgTotal != null) parts.push(`SG ${fmtSg(row.sgTotal)}`);
  return parts.join(" · ");
}

export default function RegionalHistoryH2H({
  teamA,
  teamB,
  gender,
}: {
  teamA: string;
  teamB: string;
  gender: Gender;
}) {
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);

  useEffect(() => {
    if (gender !== "men") {
      // Women's sheet tab is currently empty; surface nothing rather than
      // misleading zeros.
      setMeetings([]);
      return;
    }
    let cancelled = false;
    setMeetings(null);
    loadRegionalsRich().then((rows) => {
      if (cancelled) return;
      const byYearRegional = new Map<string, RegionalFinishRich[]>();
      for (const r of rows) {
        if (r.gender !== "men") continue;
        if (r.team !== teamA && r.team !== teamB) continue;
        const key = `${r.year}|${r.regional}`;
        const arr = byYearRegional.get(key) ?? [];
        arr.push(r);
        byYearRegional.set(key, arr);
      }
      const out: Meeting[] = [];
      for (const [, arr] of byYearRegional) {
        const aRow = arr.find((r) => r.team === teamA);
        const bRow = arr.find((r) => r.team === teamB);
        if (aRow && bRow) {
          out.push({
            year: aRow.year,
            regional: aRow.regional,
            a: aRow,
            b: bRow,
          });
        }
      }
      out.sort((x, y) => y.year - x.year);
      setMeetings(out);
    });
    return () => {
      cancelled = true;
    };
  }, [teamA, teamB, gender]);

  if (gender !== "men") {
    return (
      <div className="rounded border border-border bg-card p-4 text-[12px] text-text-tertiary">
        Historical Regional meeting data is men&apos;s-only right now (women&apos;s sheet is pending).
      </div>
    );
  }

  if (meetings === null) {
    return (
      <div className="rounded border border-border bg-card p-4 text-[12px] text-text-tertiary">
        Loading Regional history…
      </div>
    );
  }

  if (meetings.length === 0) {
    return (
      <div className="rounded border border-border bg-card p-4 text-[12px] text-text-tertiary">
        <span className="text-foreground">{teamA}</span> and{" "}
        <span className="text-foreground">{teamB}</span> have never played the same NCAA Regional (1989–present).
      </div>
    );
  }

  // Aggregate: who finished ahead more often?
  let aAhead = 0;
  let bAhead = 0;
  let ties = 0;
  for (const m of meetings) {
    const aPos = m.a.finalPos;
    const bPos = m.b.finalPos;
    if (aPos == null || bPos == null) continue;
    if (aPos < bPos) aAhead++;
    else if (bPos < aPos) bAhead++;
    else ties++;
  }

  const leadClass =
    aAhead > bAhead
      ? "text-primary"
      : bAhead > aAhead
      ? "text-destructive/80"
      : "text-foreground";

  return (
    <div className="rounded border border-border bg-card p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground/80">
          Regional history
        </div>
        <div
          className={cn(
            "font-mono tabular-nums text-[14px] font-semibold",
            leadClass
          )}
        >
          {aAhead}-{bAhead}
          {ties > 0 ? `-${ties}` : ""}
        </div>
      </div>
      <div className="text-[11px] text-text-tertiary">
        {meetings.length} shared Regional{meetings.length === 1 ? "" : "s"} · record reflects
        who finished higher at each (ties broken by seed when tied).
      </div>

      <ul className="space-y-1.5 text-[12px]">
        {meetings.map((m) => {
          const aBeat =
            m.a.finalPos != null &&
            m.b.finalPos != null &&
            m.a.finalPos < m.b.finalPos;
          const bBeat =
            m.a.finalPos != null &&
            m.b.finalPos != null &&
            m.b.finalPos < m.a.finalPos;
          return (
            <li
              key={`${m.year}-${m.regional}`}
              className="grid grid-cols-[48px_96px_1fr_1fr] gap-2 items-baseline"
            >
              <span className="text-muted-foreground font-mono tabular-nums">
                {m.year}
              </span>
              <span className="text-text-tertiary truncate">{m.regional}</span>
              <span
                className={cn(
                  "font-mono tabular-nums",
                  aBeat ? "text-primary" : bBeat ? "text-text-tertiary" : "text-foreground"
                )}
              >
                <span className="text-foreground">{teamA}:</span>{" "}
                {teamLine(m.a)}
              </span>
              <span
                className={cn(
                  "font-mono tabular-nums",
                  bBeat ? "text-primary" : aBeat ? "text-text-tertiary" : "text-foreground"
                )}
              >
                <span className="text-foreground">{teamB}:</span>{" "}
                {teamLine(m.b)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
