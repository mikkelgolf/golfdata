"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  getAllOpponents,
  getMeetings,
  getTeam,
  formatRecord,
  formatStrokeDiff,
  type Gender,
  type Meeting,
  type OpponentRecord,
} from "@/lib/head-to-head";

// ---------------------------------------------------------------------------
// Team drill-down: full head-to-head record across every opponent this team
// has played, grouped by the opponent's conference. Meeting detail is
// dynamic-imported on first expand.
// ---------------------------------------------------------------------------

interface TeamDrillDownProps {
  teamBoardName: string;
  gender: Gender;
}

export default function TeamDrillDown({ teamBoardName, gender }: TeamDrillDownProps) {
  const team = getTeam(teamBoardName, gender);
  const opponents = useMemo(
    () => getAllOpponents(teamBoardName, gender),
    [teamBoardName, gender]
  );

  const grouped = useMemo(() => {
    const byConf = new Map<string, typeof opponents>();
    for (const entry of opponents) {
      const confKey = entry.record.unitid ? opponentConference(entry.opponent, gender) : "—";
      const bucket = byConf.get(confKey) ?? [];
      bucket.push(entry);
      byConf.set(confKey, bucket);
    }
    const order = [...byConf.keys()].sort((a, b) => {
      if (a === "—") return 1;
      if (b === "—") return -1;
      return a.localeCompare(b);
    });
    return order.map((conf) => ({
      conference: conf,
      entries: (byConf.get(conf) ?? []).sort((x, y) => {
        const xAdv = (x.record.wins + x.record.ties * 0.5) / Math.max(x.record.meetings, 1);
        const yAdv = (y.record.wins + y.record.ties * 0.5) / Math.max(y.record.meetings, 1);
        if (yAdv !== xAdv) return yAdv - xAdv;
        return x.opponent.localeCompare(y.opponent);
      }),
    }));
  }, [opponents, gender]);

  if (!team) {
    return (
      <div className="px-4 py-3 text-[12px] text-text-tertiary italic">
        No head-to-head data for {teamBoardName}.
      </div>
    );
  }

  if (opponents.length === 0) {
    return (
      <div className="px-4 py-3 text-[12px] text-text-tertiary italic">
        {teamBoardName} has no recorded meetings this season.
      </div>
    );
  }

  return (
    <div className="bg-background/60 border-t border-border/40">
      <div className="px-4 py-2 flex items-center justify-between border-b border-border/30">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground/80">
          {teamBoardName} · Full 25-26 head-to-head
        </div>
        <div className="text-[11px] text-muted-foreground">
          {opponents.length} opponents
        </div>
      </div>

      <table className="w-full text-[12px]">
        <thead className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
          <tr className="border-b border-border/30">
            <th className="px-3 py-1 text-left font-medium">Opponent</th>
            <th className="px-3 py-1 text-right font-medium w-[90px]" title="All formats combined">
              Overall
            </th>
            <th className="px-3 py-1 text-right font-medium w-[90px]" title="Strokeplay only">
              SP
            </th>
            <th className="px-3 py-1 text-right font-medium w-[70px]" title="Average stroke differential per strokeplay meeting">
              Δ str
            </th>
            <th className="px-3 py-1 text-right font-medium w-[90px]" title="Matchplay only">
              MP
            </th>
          </tr>
        </thead>
        <tbody>
          {grouped.map((group) => (
            <ConferenceGroup
              key={group.conference}
              conference={group.conference}
              entries={group.entries}
              teamUnitid={team.unitid}
              gender={gender}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Conference group — a header row + opponent rows
// ---------------------------------------------------------------------------

function ConferenceGroup({
  conference,
  entries,
  teamUnitid,
  gender,
}: {
  conference: string;
  entries: Array<{ opponent: string; record: OpponentRecord }>;
  teamUnitid: number;
  gender: Gender;
}) {
  return (
    <>
      <tr className="bg-muted/20">
        <td
          colSpan={5}
          className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium"
        >
          {conference}
        </td>
      </tr>
      {entries.map((entry) => (
        <OpponentRow
          key={entry.opponent}
          opponent={entry.opponent}
          record={entry.record}
          teamUnitid={teamUnitid}
          gender={gender}
        />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Individual opponent row — clickable to reveal per-meeting detail
// ---------------------------------------------------------------------------

function OpponentRow({
  opponent,
  record,
  teamUnitid,
  gender,
}: {
  opponent: string;
  record: OpponentRecord;
  teamUnitid: number;
  gender: Gender;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasWinning = record.wins > record.losses;
  const hasLosing = record.wins < record.losses;
  const spAdvantage = (record.strokeplay?.avgStrokeDiff ?? 0) < 0;
  const spDisadvantage = (record.strokeplay?.avgStrokeDiff ?? 0) > 0;

  return (
    <>
      <tr
        className="border-b border-border/15 last:border-b-0 hover:bg-white/[0.03] cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <td className="px-3 py-1.5 text-foreground">
          <span className="inline-block w-3 text-muted-foreground/60 text-[10px]">
            {expanded ? "▾" : "▸"}
          </span>{" "}
          {opponent}
        </td>
        <td
          className={cn(
            "px-3 py-1.5 font-mono tabular-nums text-right text-muted-foreground",
            hasWinning && "text-primary",
            hasLosing && "text-destructive/80"
          )}
          title={`${record.meetings} meeting${record.meetings === 1 ? "" : "s"}`}
        >
          {formatRecord(record)}
        </td>
        <td className="px-3 py-1.5 font-mono tabular-nums text-right text-muted-foreground">
          {record.strokeplay ? formatRecord(record.strokeplay) : "—"}
        </td>
        <td
          className={cn(
            "px-3 py-1.5 font-mono tabular-nums text-right text-muted-foreground",
            spAdvantage && "text-primary",
            spDisadvantage && "text-destructive/80"
          )}
        >
          {record.strokeplay ? formatStrokeDiff(record.strokeplay.avgStrokeDiff) : "—"}
        </td>
        <td className="px-3 py-1.5 font-mono tabular-nums text-right text-muted-foreground">
          {record.matchplay ? formatRecord(record.matchplay) : "—"}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-background/80">
          <td colSpan={5} className="px-3 py-2">
            <MeetingsList
              teamUnitid={teamUnitid}
              opponentUnitid={record.unitid}
              gender={gender}
            />
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Meetings list — lazy-loaded from head-to-head-meetings-2526.json
// ---------------------------------------------------------------------------

function MeetingsList({
  teamUnitid,
  opponentUnitid,
  gender,
}: {
  teamUnitid: number;
  opponentUnitid: number;
  gender: Gender;
}) {
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMeetings(teamUnitid, opponentUnitid, gender)
      .then((data) => {
        if (!cancelled) setMeetings(data);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [teamUnitid, opponentUnitid, gender]);

  if (error) return <div className="text-[11px] text-destructive">Failed to load meetings.</div>;
  if (meetings === null) {
    return <div className="text-[11px] text-text-tertiary">Loading meetings…</div>;
  }
  if (meetings.length === 0) {
    return <div className="text-[11px] text-text-tertiary italic">No detail available.</div>;
  }

  return (
    <ul className="space-y-1 text-[11px]">
      {meetings.map((m, i) => (
        <li key={i} className="flex items-baseline gap-2">
          <span className="text-muted-foreground/70 font-mono tabular-nums w-[70px]">
            {m.startDate ?? ""}
          </span>
          <span
            className={cn(
              "inline-block w-[10px] uppercase text-[9px] font-semibold",
              m.format === "strokeplay" ? "text-sky-400/80" : "text-amber-400/80"
            )}
            title={m.format === "strokeplay" ? "Strokeplay" : "Matchplay"}
          >
            {m.format === "strokeplay" ? "S" : "M"}
          </span>
          <span className="text-foreground flex-1 truncate">
            {m.tournamentName}
          </span>
          <MeetingResult meeting={m} />
        </li>
      ))}
    </ul>
  );
}

function MeetingResult({ meeting }: { meeting: Meeting }) {
  if (meeting.format === "strokeplay") {
    const wonBy = meeting.strokeDiff;
    const badgeClass = cn(
      "text-[10px] font-mono tabular-nums px-1 py-[1px] rounded",
      meeting.winner === "A" && "bg-primary/15 text-primary",
      meeting.winner === "B" && "bg-destructive/15 text-destructive",
      meeting.winner === "T" && "bg-muted/30 text-muted-foreground"
    );
    return (
      <span className="flex items-center gap-2 font-mono tabular-nums">
        <span className="text-muted-foreground">
          {meeting.aToPar ?? "—"} vs {meeting.bToPar ?? "—"}
        </span>
        <span className={badgeClass}>
          {meeting.winner === "T" ? "T" : wonBy !== null ? formatDiff(wonBy) : "—"}
        </span>
      </span>
    );
  }
  // matchplay
  const badgeClass = cn(
    "text-[10px] font-mono tabular-nums px-1 py-[1px] rounded",
    meeting.winner === "A" && "bg-primary/15 text-primary",
    meeting.winner === "B" && "bg-destructive/15 text-destructive",
    meeting.winner === "T" && "bg-muted/30 text-muted-foreground"
  );
  return (
    <span className="flex items-center gap-2 font-mono tabular-nums">
      <span className="text-muted-foreground">
        {meeting.aPoints ?? "—"}–{meeting.bPoints ?? "—"}
      </span>
      <span className={badgeClass}>
        {meeting.winner === "A" ? "W" : meeting.winner === "B" ? "L" : "T"}
      </span>
    </span>
  );
}

function formatDiff(n: number): string {
  if (n === 0) return "T";
  return n < 0 ? `W${-n}` : `L${n}`;
}

// ---------------------------------------------------------------------------
// Conference lookup — we store each team's own conference but not the opponent's
// conference at the opponent-record level; look it up via the byGender map.
// ---------------------------------------------------------------------------

function opponentConference(opponentBoardName: string, gender: Gender): string {
  const team = getTeam(opponentBoardName, gender);
  return team?.conference ?? "Unaffiliated";
}
