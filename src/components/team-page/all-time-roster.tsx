import * as fs from "fs";
import * as path from "path";
import Link from "next/link";

interface PlayerIndexEntry {
  player_id: string;
  raw_name: string;
  normalized_name: string;
  school_slug: string;
  school_name: string;
  gender: "m" | "w";
  primary_gender?: "m" | "w" | null;
  contamination_score?: number | null;
  events_total: number;
  best_finish: number | null;
  first_season: number | null;
  last_season: number | null;
}

const INDEX_PATH = path.join(process.cwd(), "src", "data", "players", "index.json");

function readIndex(): PlayerIndexEntry[] {
  if (!fs.existsSync(INDEX_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8"));
  } catch {
    return [];
  }
}

interface Props {
  schoolSlug: string;
  gender: "men" | "women";
}

export default function AllTimeRoster({ schoolSlug, gender }: Props) {
  const idx = readIndex();
  const g: "m" | "w" = gender === "men" ? "m" : "w";
  const rows = idx
    .filter((e) => e.school_slug === schoolSlug && e.gender === g)
    // Exclude entries whose primary gender (from global division split) is
    // the opposite of this team page's gender — those are mis-attributed.
    .filter((e) => !e.primary_gender || e.primary_gender === g)
    .sort(
      (a, b) =>
        b.events_total - a.events_total ||
        (a.best_finish ?? 999) - (b.best_finish ?? 999) ||
        a.raw_name.localeCompare(b.raw_name)
    );

  if (rows.length === 0) return null;

  return (
    <section className="mt-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold tracking-tight">
          All-time roster <span className="text-text-tertiary">({rows.length})</span>
        </h2>
        <Link
          href={`/teams/${gender}/${schoolSlug}/record-book`}
          className="text-[12px] text-blue-600 hover:underline"
        >
          Open the full record book →
        </Link>
      </div>
      <p className="mt-1 text-[12px] text-text-tertiary">
        Compiled from BigQuery <code>granular_master</code> (GolfStat + Clippd) and the NCAA Record
        Book. Pre-2010 coverage is sparse — the M5 backfill phase will close that gap.
      </p>
      <div className="mt-3 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-[12px]">
          <thead className="bg-card/50 text-left text-text-tertiary">
            <tr>
              <th className="px-3 py-2 font-medium">Player</th>
              <th className="px-3 py-2 font-medium">Events</th>
              <th className="px-3 py-2 font-medium">Best</th>
              <th className="px-3 py-2 font-medium">Seasons</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.player_id} className="border-t border-border hover:bg-card/30">
                <td className="px-3 py-2">
                  <Link
                    href={`/players/${r.player_id}`}
                    className="font-medium text-foreground hover:underline"
                  >
                    {r.raw_name}
                  </Link>
                </td>
                <td className="px-3 py-2">{r.events_total}</td>
                <td className="px-3 py-2">{r.best_finish ?? "—"}</td>
                <td className="px-3 py-2 text-text-tertiary">
                  {r.first_season && r.last_season
                    ? r.first_season === r.last_season
                      ? r.first_season
                      : `${r.first_season}–${r.last_season}`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
