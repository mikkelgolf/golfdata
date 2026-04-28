"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  getAllTeamNames,
  getTeam,
  getMeetings,
  formatRecord,
  formatStrokeDiff,
  isMeetingInSeason,
  computeRecordFromMeetings,
  AVAILABLE_SEASONS,
  CURRENT_SEASON,
  type Gender,
  type Meeting,
  type OpponentRecord,
  type Season,
} from "@/lib/head-to-head";
import CommonOpponents from "@/components/head-to-head/common-opponents";
import CommonOpponentsDetail from "@/components/head-to-head/common-opponents-detail";

// ---------------------------------------------------------------------------
// Full-page team-vs-team head-to-head browser. URL params drive state so links
// are shareable: /head-to-head?gender=men&a=Auburn&b=Florida&season=2025-26
//
// Also supports an `embedded` mode used by the Manual Grid tab, where the
// parent owns gender + teamA/teamB state, drives them via long-press, and
// the gender toggle / season selector / URL sync are suppressed.
// ---------------------------------------------------------------------------

function isSeason(value: string | null): value is Season {
  return !!value && (AVAILABLE_SEASONS as readonly string[]).includes(value);
}

export interface HeadToHeadEmbedded {
  gender: Gender;
  teamA: string | null;
  teamB: string | null;
  onTeamAChange: (t: string | null) => void;
  onTeamBChange: (t: string | null) => void;
}

interface HeadToHeadBrowserProps {
  embedded?: HeadToHeadEmbedded;
}

export default function HeadToHeadBrowser(props: HeadToHeadBrowserProps = {}) {
  const { embedded } = props;
  const router = useRouter();
  const params = useSearchParams();

  const genderParam = (params.get("gender") ?? "men") as Gender;
  const aParam = params.get("a");
  const bParam = params.get("b");
  const seasonParam = params.get("season");

  const [internalGender, setInternalGender] = useState<Gender>(
    genderParam === "women" ? "women" : "men"
  );
  const [internalTeamA, setInternalTeamA] = useState<string | null>(aParam);
  const [internalTeamB, setInternalTeamB] = useState<string | null>(bParam);
  const [season, setSeason] = useState<Season>(
    isSeason(seasonParam) ? seasonParam : CURRENT_SEASON
  );

  const gender = embedded ? embedded.gender : internalGender;
  const setGender = embedded ? () => {} : setInternalGender;
  const teamA = embedded ? embedded.teamA : internalTeamA;
  const teamB = embedded ? embedded.teamB : internalTeamB;
  const setTeamA = embedded ? embedded.onTeamAChange : setInternalTeamA;
  const setTeamB = embedded ? embedded.onTeamBChange : setInternalTeamB;

  // Keep URL in sync when user picks teams (page mode only).
  useEffect(() => {
    if (embedded) return;
    const next = new URLSearchParams();
    next.set("gender", gender);
    if (teamA) next.set("a", teamA);
    if (teamB) next.set("b", teamB);
    if (season !== CURRENT_SEASON) next.set("season", season);
    const qs = next.toString();
    router.replace(`/head-to-head${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [embedded, gender, teamA, teamB, season, router]);

  const allTeams = useMemo(() => getAllTeamNames(gender), [gender]);

  const teamAData = teamA ? getTeam(teamA, gender) : null;
  const teamBData = teamB ? getTeam(teamB, gender) : null;

  const swapTeams = () => {
    setTeamA(teamB);
    setTeamB(teamA);
  };

  const clearTeams = () => {
    setTeamA(null);
    setTeamB(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-end flex-wrap">
        {!embedded && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80 mb-1">
              Division
            </div>
            <div className="inline-flex rounded border border-border overflow-hidden text-[12px]">
              <button
                onClick={() => {
                  setGender("men");
                  setTeamA(null);
                  setTeamB(null);
                }}
                className={cn(
                  "px-3 py-1 transition-colors",
                  gender === "men"
                    ? "bg-primary/20 text-primary"
                    : "bg-card text-muted-foreground hover:bg-card/80"
                )}
              >
                Men
              </button>
              <button
                onClick={() => {
                  setGender("women");
                  setTeamA(null);
                  setTeamB(null);
                }}
                className={cn(
                  "px-3 py-1 transition-colors border-l border-border",
                  gender === "women"
                    ? "bg-primary/20 text-primary"
                    : "bg-card text-muted-foreground hover:bg-card/80"
                )}
              >
                Women
              </button>
            </div>
          </div>
        )}

        {!embedded && <SeasonSelector value={season} onChange={setSeason} />}

        <div className="flex items-end gap-2 flex-wrap">
          <TeamSelector
            label="Team A"
            value={teamA}
            onChange={setTeamA}
            options={allTeams}
            excluded={teamB}
          />
          <button
            type="button"
            onClick={swapTeams}
            disabled={!teamA && !teamB}
            title="Swap Team A and Team B"
            aria-label="Swap Team A and Team B"
            className={cn(
              "h-[26px] px-2 rounded border border-border bg-card text-[12px]",
              "text-muted-foreground hover:bg-card/80 hover:text-foreground transition-colors",
              "disabled:opacity-40 disabled:cursor-not-allowed",
              "self-end"
            )}
          >
            ⇄
          </button>
          <TeamSelector
            label="Team B"
            value={teamB}
            onChange={setTeamB}
            options={allTeams}
            excluded={teamA}
          />
          <button
            type="button"
            onClick={clearTeams}
            disabled={!teamA && !teamB}
            title="Clear both Team A and Team B"
            aria-label="Clear both Team A and Team B"
            className={cn(
              "h-[26px] px-2.5 rounded border border-border bg-card text-[12px]",
              "text-muted-foreground hover:bg-card/80 hover:text-foreground transition-colors",
              "disabled:opacity-40 disabled:cursor-not-allowed",
              "self-end"
            )}
          >
            Clear Teams
          </button>
        </div>
      </div>

      {!teamA || !teamB ? (
        <div className="rounded border border-border bg-card p-4 text-[12px] text-text-tertiary">
          Pick two teams to see their head-to-head across strokeplay and matchplay this season.
        </div>
      ) : !teamAData || !teamBData ? (
        <div className="rounded border border-border bg-card p-4 text-[12px] text-text-tertiary">
          Team data unavailable for the current selection.
        </div>
      ) : (
        <PairSummary
          teamA={teamA}
          teamB={teamB}
          teamAUnitid={teamAData.unitid}
          teamBUnitid={teamBData.unitid}
          gender={gender}
          season={season}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SeasonSelector
// ---------------------------------------------------------------------------

function SeasonSelector({
  value,
  onChange,
}: {
  value: Season;
  onChange: (s: Season) => void;
}) {
  // Single-season case: render a static label so the UI shows what's selected
  // without exposing a no-op dropdown.
  if (AVAILABLE_SEASONS.length <= 1) {
    return (
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80 mb-1">
          Season
        </div>
        <div className="px-3 py-1 rounded border border-border bg-card text-[12px] text-foreground">
          {value}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80 mb-1">
        Season
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Season)}
        className="px-2 py-1 rounded border border-border bg-card text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      >
        {AVAILABLE_SEASONS.map((s) => (
          <option key={s} value={s}>
            {s}
            {s === CURRENT_SEASON ? " (current)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TeamSelector — searchable dropdown
// ---------------------------------------------------------------------------

function TeamSelector({
  label,
  value,
  onChange,
  options,
  excluded,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  options: string[];
  excluded: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return options
      .filter((t) => t !== excluded)
      .filter((t) => !q || t.toLowerCase().includes(q))
      .slice(0, 30);
  }, [options, query, excluded]);

  return (
    <div className="relative min-w-[180px]">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80 mb-1">
        {label}
      </div>
      <button
        type="button"
        className={cn(
          "w-full text-left px-3 py-1 rounded border border-border bg-card text-[13px]",
          value ? "text-foreground" : "text-muted-foreground",
          "hover:bg-card/80 transition-colors"
        )}
        onClick={() => setOpen((o) => !o)}
      >
        {value ?? "Select team…"}
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-full rounded border border-border bg-card shadow-lg">
          <input
            type="text"
            autoFocus
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full px-3 py-1.5 text-[12px] bg-background border-b border-border focus:outline-none"
          />
          <ul className="max-h-64 overflow-y-auto">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-[12px] text-text-tertiary italic">
                No matches.
              </li>
            )}
            {filtered.map((t) => (
              <li key={t}>
                <button
                  className="w-full text-left px-3 py-1.5 text-[12px] text-foreground hover:bg-white/[0.03]"
                  onClick={() => {
                    onChange(t);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  {t}
                </button>
              </li>
            ))}
          </ul>
          {value && (
            <button
              className="w-full border-t border-border px-3 py-1.5 text-[11px] text-destructive hover:bg-white/[0.03]"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PairSummary — all the stats + meetings for one team-pair
//
// Loads meetings, filters them to the selected season window (Aug 1 → Jul 31),
// and re-aggregates totals from the filtered list. We do NOT trust the
// pre-computed OpponentRecord on the team because the upstream BigQuery view
// can leak prior-season events (e.g. May 2025 NCAA matchplay) into the
// 2025-26 bucket.
// ---------------------------------------------------------------------------

function PairSummary({
  teamA,
  teamB,
  teamAUnitid,
  teamBUnitid,
  gender,
  season,
}: {
  teamA: string;
  teamB: string;
  teamAUnitid: number;
  teamBUnitid: number;
  gender: Gender;
  season: Season;
}) {
  const [allMeetings, setAllMeetings] = useState<Meeting[] | null>(null);
  const [selectedOpponent, setSelectedOpponent] = useState<string | null>(null);

  // Reset the selected common opponent whenever the team pair changes.
  useEffect(() => {
    setSelectedOpponent(null);
  }, [teamA, teamB, gender]);

  useEffect(() => {
    let cancelled = false;
    setAllMeetings(null);
    getMeetings(teamAUnitid, teamBUnitid, gender).then((data) => {
      if (!cancelled) setAllMeetings(data);
    });
    return () => {
      cancelled = true;
    };
  }, [teamAUnitid, teamBUnitid, gender]);

  const meetings = useMemo(() => {
    if (!allMeetings) return null;
    return allMeetings
      .filter((m) => isMeetingInSeason(m, season))
      .sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""));
  }, [allMeetings, season]);

  const record: OpponentRecord | null = useMemo(() => {
    if (!meetings || meetings.length === 0) return null;
    return computeRecordFromMeetings(meetings);
  }, [meetings]);

  if (meetings === null) {
    return (
      <div className="rounded border border-border bg-card p-4 text-[12px] text-text-tertiary">
        Loading meetings…
      </div>
    );
  }

  if (!record) {
    return (
      <div className="rounded border border-border bg-card p-4 text-[12px] text-text-tertiary">
        <span className="text-foreground">{teamA}</span> and{" "}
        <span className="text-foreground">{teamB}</span> haven&apos;t met in the{" "}
        {season} season.
      </div>
    );
  }

  const leadClass =
    record.wins > record.losses
      ? "text-primary"
      : record.wins < record.losses
      ? "text-destructive/80"
      : "text-foreground";

  return (
    <div className="space-y-4">
      <div className="rounded border border-border bg-card p-4">
        <div className="flex items-baseline justify-between">
          <div className="text-[14px] sm:text-[16px] font-semibold text-foreground">
            {teamA} <span className="text-muted-foreground">vs</span> {teamB}
          </div>
          <div
            className={cn(
              "font-mono tabular-nums text-[18px] sm:text-[20px] font-semibold",
              leadClass
            )}
          >
            {formatRecord(record)}
          </div>
        </div>
        <div className="mt-1 text-[11px] text-text-tertiary">
          {season} season · {record.meetings} meeting
          {record.meetings === 1 ? "" : "s"}
        </div>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <BreakdownCard
            title="Strokeplay"
            subtitle={
              record.strokeplay
                ? `Δ strokes: ${formatStrokeDiff(record.strokeplay.avgStrokeDiff)} per meeting`
                : "No strokeplay meetings"
            }
            record={record.strokeplay ?? null}
            accent="text-sky-400/80"
          />
          <BreakdownCard
            title="Matchplay"
            subtitle={
              record.matchplay
                ? `${record.matchplay.meetings} bracket meeting${
                    record.matchplay.meetings === 1 ? "" : "s"
                  }`
                : "No matchplay meetings"
            }
            record={record.matchplay ?? null}
            accent="text-amber-400/80"
          />
        </div>
      </div>

      <div className="rounded border border-border bg-card p-4">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground/80 mb-2">
          Every meeting in {season}
        </div>
        {meetings.length === 0 ? (
          <div className="text-[12px] text-text-tertiary italic">
            No per-meeting detail available.
          </div>
        ) : (
          <ul className="space-y-1.5 text-[12px]">
            {meetings.map((m, i) => (
              <li key={i} className="flex items-baseline gap-3">
                <span className="text-muted-foreground font-mono tabular-nums w-[80px]">
                  {m.startDate ?? "—"}
                </span>
                <span
                  className={cn(
                    "inline-block w-[11px] uppercase text-[9px] font-semibold",
                    m.format === "strokeplay"
                      ? "text-sky-400/80"
                      : "text-amber-400/80"
                  )}
                >
                  {m.format === "strokeplay" ? "S" : "M"}
                </span>
                <span className="flex-1 text-foreground">{m.tournamentName}</span>
                <MeetingResult meeting={m} teamA={teamA} teamB={teamB} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <CommonOpponents
        teamA={teamA}
        teamB={teamB}
        gender={gender}
        selectedOpponent={selectedOpponent}
        onSelectOpponent={setSelectedOpponent}
      />

      <CommonOpponentsDetail
        teamA={teamA}
        teamB={teamB}
        gender={gender}
        opponent={selectedOpponent}
      />
    </div>
  );
}

function BreakdownCard({
  title,
  subtitle,
  record,
  accent,
}: {
  title: string;
  subtitle: string;
  record: { meetings: number; wins: number; losses: number; ties: number } | null;
  accent: string;
}) {
  return (
    <div className="rounded border border-border/50 bg-background/40 p-3">
      <div className={cn("text-[11px] uppercase tracking-wider font-semibold", accent)}>
        {title}
      </div>
      <div className="mt-1 font-mono tabular-nums text-[18px] text-foreground">
        {record ? formatRecord(record) : "—"}
      </div>
      <div className="mt-0.5 text-[11px] text-text-tertiary">{subtitle}</div>
    </div>
  );
}

function MeetingResult({
  meeting,
  teamA,
  teamB,
}: {
  meeting: Meeting;
  teamA: string;
  teamB: string;
}) {
  const badgeClass = cn(
    "text-[10px] font-mono tabular-nums px-1.5 py-[1px] rounded",
    meeting.winner === "A" && "bg-primary/15 text-primary",
    meeting.winner === "B" && "bg-destructive/15 text-destructive",
    meeting.winner === "T" && "bg-muted/30 text-muted-foreground"
  );
  const winnerLabel =
    meeting.winner === "A" ? teamA : meeting.winner === "B" ? teamB : "Tie";

  if (meeting.format === "strokeplay") {
    return (
      <span className="flex items-center gap-2 font-mono tabular-nums">
        <span className="text-muted-foreground">
          {meeting.aToPar ?? "—"} vs {meeting.bToPar ?? "—"}
        </span>
        <span className={badgeClass} title={`Winner: ${winnerLabel}`}>
          {meeting.winner === "A" ? "A" : meeting.winner === "B" ? "B" : "T"}
        </span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2 font-mono tabular-nums">
      <span className="text-muted-foreground">
        {meeting.aPoints ?? "—"}–{meeting.bPoints ?? "—"}
      </span>
      <span className={badgeClass} title={`Winner: ${winnerLabel}`}>
        {meeting.winner === "A" ? "A" : meeting.winner === "B" ? "B" : "T"}
      </span>
    </span>
  );
}
