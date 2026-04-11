"use client";

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HeadToHeadRecord {
  teamA: string;
  teamB: string;
  meetings: number;
  teamAWins: number;
  teamBWins: number;
}

interface HeadToHeadMatrixProps {
  teams: { team: string; seed: number; rank: number }[];
  records?: HeadToHeadRecord[];
  regionalColor: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRecord(
  records: HeadToHeadRecord[],
  teamA: string,
  teamB: string
): { wins: number; losses: number; meetings: number } | null {
  const rec = records.find(
    (r) =>
      (r.teamA === teamA && r.teamB === teamB) ||
      (r.teamA === teamB && r.teamB === teamA)
  );
  if (!rec) return null;
  if (rec.teamA === teamA) {
    return { wins: rec.teamAWins, losses: rec.teamBWins, meetings: rec.meetings };
  }
  return { wins: rec.teamBWins, losses: rec.teamAWins, meetings: rec.meetings };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HeadToHeadMatrix({
  teams,
  records,
  regionalColor,
}: HeadToHeadMatrixProps) {
  const hasData = records && records.length > 0;

  // Sort teams by seed for consistent display
  const sorted = [...teams].sort((a, b) => a.seed - b.seed);

  return (
    <div className="mt-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-2">
        Head-to-Head
      </p>

      {hasData ? (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr>
                <th className="px-1.5 py-1.5 text-left text-muted-foreground font-medium w-[100px]">
                  Team
                </th>
                {sorted.map((t) => (
                  <th
                    key={t.team}
                    className="px-1 py-1.5 text-center text-muted-foreground font-medium"
                    title={t.team}
                  >
                    <span className="hidden md:inline">{abbreviate(t.team)}</span>
                    <span className="md:hidden text-[10px]">{abbreviate(t.team)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.team} className="border-t border-border/30">
                  <td className="px-1.5 py-1.5 text-foreground font-medium truncate max-w-[100px]">
                    <span className="text-muted-foreground font-mono mr-1">
                      {row.seed}
                    </span>
                    {row.team}
                  </td>
                  {sorted.map((col) => {
                    if (row.team === col.team) {
                      return (
                        <td
                          key={col.team}
                          className="px-1 py-1.5 text-center"
                          style={{ backgroundColor: `${regionalColor}10` }}
                        >
                          <span className="text-muted-foreground/40">-</span>
                        </td>
                      );
                    }
                    const rec = getRecord(records!, row.team, col.team);
                    if (!rec || rec.meetings === 0) {
                      return (
                        <td
                          key={col.team}
                          className="px-1 py-1.5 text-center text-muted-foreground/40"
                        >
                          -
                        </td>
                      );
                    }
                    const isWinning = rec.wins > rec.losses;
                    const isLosing = rec.wins < rec.losses;
                    return (
                      <td
                        key={col.team}
                        className={cn(
                          "px-1 py-1.5 text-center font-mono whitespace-nowrap",
                          isWinning && "text-primary",
                          isLosing && "text-destructive",
                          !isWinning && !isLosing && "text-muted-foreground"
                        )}
                      >
                        {rec.wins}-{rec.losses}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-md bg-secondary/30 px-3 py-3 text-center">
          <p className="text-[12px] text-muted-foreground">
            Head-to-head records will appear here once tournament data is available.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile variant
// ---------------------------------------------------------------------------

export function HeadToHeadCompact({
  teams,
  records,
}: Omit<HeadToHeadMatrixProps, "regionalColor">) {
  const hasData = records && records.length > 0;
  const sorted = [...teams].sort((a, b) => a.seed - b.seed);

  if (!hasData) {
    return (
      <div className="mt-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-2">
          Head-to-Head
        </p>
        <div className="rounded-md bg-secondary/30 px-3 py-3 text-center">
          <p className="text-[12px] text-muted-foreground">
            Available once tournament data is loaded.
          </p>
        </div>
      </div>
    );
  }

  // On mobile, show a list of notable matchups instead of a full matrix
  const matchups: {
    teamA: string;
    teamB: string;
    seedA: number;
    seedB: number;
    wins: number;
    losses: number;
    meetings: number;
  }[] = [];

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const rec = getRecord(records!, sorted[i].team, sorted[j].team);
      if (rec && rec.meetings > 0) {
        matchups.push({
          teamA: sorted[i].team,
          teamB: sorted[j].team,
          seedA: sorted[i].seed,
          seedB: sorted[j].seed,
          wins: rec.wins,
          losses: rec.losses,
          meetings: rec.meetings,
        });
      }
    }
  }

  if (matchups.length === 0) {
    return (
      <div className="mt-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-2">
          Head-to-Head
        </p>
        <p className="text-[12px] text-muted-foreground">
          No head-to-head meetings found this season.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-2">
        Head-to-Head ({matchups.length} matchups)
      </p>
      <div className="space-y-1">
        {matchups.map((m) => (
          <div
            key={`${m.teamA}-${m.teamB}`}
            className="flex items-center justify-between text-[12px] px-2 py-1.5 rounded bg-secondary/30"
          >
            <span className="text-foreground truncate flex-1">
              <span className="font-mono text-muted-foreground mr-1">{m.seedA}</span>
              {m.teamA}
            </span>
            <span
              className={cn(
                "font-mono px-2 whitespace-nowrap",
                m.wins > m.losses && "text-primary",
                m.wins < m.losses && "text-destructive",
                m.wins === m.losses && "text-muted-foreground"
              )}
            >
              {m.wins}-{m.losses}
            </span>
            <span className="text-foreground truncate flex-1 text-right">
              {m.teamB}
              <span className="font-mono text-muted-foreground ml-1">{m.seedB}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

function abbreviate(name: string): string {
  const abbrevs: Record<string, string> = {
    "Oklahoma State": "OKST",
    "Arizona State": "ASU",
    "Georgia Tech": "GT",
    "North Carolina": "UNC",
    "Texas Tech": "TTU",
    "Texas A&M": "TAMU",
    "South Carolina": "SCAR",
    "Ohio State": "OSU",
    "Michigan State": "MSU",
    "Kennesaw State": "KSU",
    "Florida State": "FSU",
    "Wake Forest": "WAKE",
    "Old Dominion": "ODU",
    "East Tennessee State": "ETSU",
    "Sam Houston": "SHSU",
    "New Mexico": "UNM",
    "San Diego State": "SDSU",
    "Southern California": "USC",
    "Coastal Carolina": "CCU",
    "South Florida": "USF",
    "Kansas State": "KST",
    "San Jose State": "SJSU",
  };
  return abbrevs[name] || name.slice(0, 4).toUpperCase();
}
