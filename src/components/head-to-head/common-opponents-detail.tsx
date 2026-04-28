"use client";

/**
 * CommonOpponentsDetail
 *
 * Drilldown panel that lives directly under the CommonOpponents strip.
 * For the currently-selected common opponent, it shows two collapsible
 * sections — Team A vs Opponent and Team B vs Opponent. Each section's
 * header summarises the record (W-L-T); tapping the header expands the
 * section to reveal every meeting (date, format, tournament, score).
 *
 * Both sections start collapsed. Selection is driven from the
 * CommonOpponents strip above.
 */

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getMeetings,
  getTeam,
  type Gender,
  type Meeting,
  type OpponentRecord,
} from "@/lib/head-to-head";

interface Props {
  teamA: string | null;
  teamB: string | null;
  gender: Gender;
  opponent: string | null;
}

export default function CommonOpponentsDetail({
  teamA,
  teamB,
  gender,
  opponent,
}: Props) {
  if (!teamA || !teamB || !opponent) {
    return (
      <div className="rounded border border-border bg-card p-4 text-[12px] text-text-tertiary">
        Pick two teams to see common-opponent breakdowns. Tap a column above
        to choose which opponent to drill into.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground/80">
        Common opponent: <span className="text-foreground">{opponent}</span>
      </div>
      <TeamVsOpponentSection
        team={teamA}
        opponent={opponent}
        gender={gender}
        accent="primary"
      />
      <TeamVsOpponentSection
        team={teamB}
        opponent={opponent}
        gender={gender}
        accent="destructive"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// One team's record vs the opponent (collapsible).
// ---------------------------------------------------------------------------

function TeamVsOpponentSection({
  team,
  opponent,
  gender,
  accent,
}: {
  team: string;
  opponent: string;
  gender: Gender;
  accent: "primary" | "destructive";
}) {
  const [open, setOpen] = useState(false);
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);
  const [loading, setLoading] = useState(false);

  const teamData = useMemo(() => getTeam(team, gender), [team, gender]);
  const opponentData = useMemo(
    () => getTeam(opponent, gender),
    [opponent, gender]
  );

  const record: OpponentRecord | null = useMemo(() => {
    if (!teamData) return null;
    return teamData.opponents[opponent] ?? null;
  }, [teamData, opponent]);

  // Re-collapse when the opponent or team changes.
  useEffect(() => {
    setOpen(false);
    setMeetings(null);
  }, [team, opponent, gender]);

  // Lazy-load meetings the first time the section is expanded.
  useEffect(() => {
    if (!open || meetings !== null || !teamData || !opponentData) return;
    let cancelled = false;
    setLoading(true);
    getMeetings(teamData.unitid, opponentData.unitid, gender)
      .then((m) => {
        if (!cancelled) setMeetings(m);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, meetings, teamData, opponentData, gender]);

  if (!record || record.meetings === 0) {
    return (
      <div className="rounded border border-border bg-card p-3 text-[12px]">
        <div className="flex items-baseline justify-between">
          <span className="text-foreground font-medium">{team}</span>
          <span className="text-text-tertiary">
            No meetings vs {opponent}
          </span>
        </div>
      </div>
    );
  }

  const recordStr = formatOpponentRecord(record);
  const recordClass =
    record.wins > record.losses
      ? accent === "primary"
        ? "text-primary"
        : "text-primary"
      : record.wins < record.losses
        ? "text-destructive"
        : "text-foreground";

  return (
    <div className="rounded border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "w-full text-left px-3 py-2 flex items-center gap-2",
          "hover:bg-card/70 transition-colors"
        )}
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        <span className="font-medium text-[13px] text-foreground">{team}</span>
        <span className="text-text-tertiary text-[11px]">vs</span>
        <span className="text-foreground/80 text-[13px]">{opponent}</span>
        <span className="ml-auto flex items-center gap-2 text-[11px]">
          <span className="text-text-tertiary tabular-nums">
            {record.meetings} meeting{record.meetings === 1 ? "" : "s"}
          </span>
          <span
            className={cn(
              "font-mono tabular-nums font-semibold text-[13px]",
              recordClass
            )}
          >
            {recordStr}
          </span>
        </span>
      </button>

      {open && (
        <div className="border-t border-border px-3 py-2">
          {loading && meetings === null ? (
            <div className="text-[12px] text-text-tertiary italic py-2">
              Loading meetings…
            </div>
          ) : meetings === null || meetings.length === 0 ? (
            <div className="text-[12px] text-text-tertiary italic py-2">
              No per-meeting detail available.
            </div>
          ) : (
            <ul className="space-y-1.5 text-[12px]">
              {meetings.map((m, i) => (
                <li
                  key={`${m.tournamentId}-${i}`}
                  className="flex items-baseline gap-3"
                >
                  <span className="text-muted-foreground font-mono tabular-nums w-[80px] shrink-0">
                    {m.startDate ?? "—"}
                  </span>
                  <span
                    className={cn(
                      "inline-block w-[11px] uppercase text-[9px] font-semibold shrink-0",
                      m.format === "strokeplay"
                        ? "text-sky-400/80"
                        : "text-amber-400/80"
                    )}
                  >
                    {m.format === "strokeplay" ? "S" : "M"}
                  </span>
                  <span className="flex-1 text-foreground truncate">
                    {m.tournamentName}
                  </span>
                  <MeetingResultCompact
                    meeting={m}
                    team={team}
                    opponent={opponent}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline result badge — adapted from MeetingResult in head-to-head-browser.
// "A" winner = team, "B" winner = opponent (per getMeetings perspective).
// ---------------------------------------------------------------------------

function MeetingResultCompact({
  meeting,
  team,
  opponent,
}: {
  meeting: Meeting;
  team: string;
  opponent: string;
}) {
  const winnerLabel =
    meeting.winner === "A"
      ? team
      : meeting.winner === "B"
        ? opponent
        : "Tie";
  const badgeClass = cn(
    "text-[10px] font-mono tabular-nums px-1.5 py-[1px] rounded",
    meeting.winner === "A" && "bg-primary/15 text-primary",
    meeting.winner === "B" && "bg-destructive/15 text-destructive",
    meeting.winner === "T" && "bg-muted/30 text-muted-foreground"
  );
  const badge =
    meeting.winner === "A" ? "W" : meeting.winner === "B" ? "L" : "T";

  if (meeting.format === "strokeplay") {
    return (
      <span className="flex items-center gap-2 font-mono tabular-nums shrink-0">
        <span className="text-muted-foreground">
          {meeting.aToPar ?? "—"} vs {meeting.bToPar ?? "—"}
        </span>
        <span className={badgeClass} title={`Winner: ${winnerLabel}`}>
          {badge}
        </span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2 font-mono tabular-nums shrink-0">
      <span className="text-muted-foreground">
        {meeting.aPoints ?? "—"}–{meeting.bPoints ?? "—"}
      </span>
      <span className={badgeClass} title={`Winner: ${winnerLabel}`}>
        {badge}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatOpponentRecord(rec: OpponentRecord): string {
  if (rec.ties > 0) return `${rec.wins}-${rec.losses}-${rec.ties}`;
  return `${rec.wins}-${rec.losses}`;
}
