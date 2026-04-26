import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

interface RoundDetail {
  round: number;
  rd_total: number | null;
  round_to_par: number | null;
}

interface Competitor {
  raw_name: string;
  team: string;
  division: string;
  rounds: RoundDetail[];
  individual_position: string | number | null;
  team_position: string | number | null;
  total_to_par: number | null;
  sources: string[];
}

interface EventExport {
  tournament_id: string;
  tournament: string;
  course: string | null;
  start_date: string | null;
  season_year: number | null;
  gender: "m" | "w" | null;
  division: string | null;
  competitors: Competitor[];
  competitor_count: number;
  team_count: number;
  built_at: string;
}

interface EventIndexEntry {
  file: string;
  tournament_id: string;
  tournament: string;
  course: string | null;
  start_date: string | null;
  season_year: number | null;
  gender: "m" | "w" | null;
  competitor_count: number;
  team_count: number;
}

interface PlayerIndexEntry {
  player_id: string;
  raw_name: string;
  normalized_name: string;
  school_slug: string;
  school_name: string;
  gender: "m" | "w";
  primary_gender?: "m" | "w" | null;
  events_total: number;
  best_finish: number | null;
}

const EVENTS_DIR = path.join(process.cwd(), "src", "data", "events");
const PLAYERS_DIR = path.join(process.cwd(), "src", "data", "players");

function readEventIndex(): EventIndexEntry[] {
  const p = path.join(EVENTS_DIR, "index.json");
  if (!fs.existsSync(p)) return [];
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function readEvent(id: string): EventExport | null {
  // id is the filename minus .json
  const p = path.join(EVENTS_DIR, `${id}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function readPlayerIndex(): PlayerIndexEntry[] {
  const p = path.join(PLAYERS_DIR, "index.json");
  if (!fs.existsSync(p)) return [];
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

// Mirror the deterministic player_id from build-player-exports.ts.
// We can't re-derive a player's id without their school_slug, but we can
// look them up in the player index by normalized name when both the
// competitor's team string maps to a known school slug.
function normalizeNameForLookup(raw: string): string {
  let s = raw.normalize("NFD").replace(/[̀-ͯ]/g, "");
  // Mirror the splitCamelCase + nickname behavior loosely; for the lookup
  // here we don't need full fidelity, just a key that matches what
  // build-player-exports wrote into index.json.
  s = s.replace(/([a-z])([A-Z])/g, "$1 $2");
  s = s.toLowerCase().trim().replace(/\s+/g, " ");
  s = s.replace(/[,.\s]+(jr|sr|ii|iii|iv)$/i, "");
  s = s.replace(/[.\-']/g, " ").replace(/\s+/g, " ").trim();
  return s;
}

function deterministicId(normalized: string, schoolSlug: string): string {
  return crypto.createHash("sha1").update(`${normalized}:${schoolSlug}`).digest("hex").slice(0, 12);
}

export async function generateStaticParams(): Promise<{ id: string }[]> {
  return readEventIndex().map((e) => ({ id: e.file.replace(/\.json$/, "") }));
}

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const ev = readEvent(params.id);
  if (!ev) return { title: "Event not found" };
  return {
    title: `${ev.tournament} (${ev.season_year ?? ""}) | College Golf Data`,
    description: `Leaderboard archive for ${ev.tournament}${ev.course ? ` at ${ev.course}` : ""}.`,
  };
}

function fmtPos(p: string | number | null): string {
  if (p === null || p === undefined || p === "") return "—";
  return String(p);
}

function fmtToPar(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n === 0) return "E";
  return n > 0 ? `+${n}` : String(n);
}

function buildPlayerIdLookup(playerIdx: PlayerIndexEntry[]): (raw: string) => string | null {
  // Index by normalized name → list of (school_slug, player_id).
  const byNorm = new Map<string, PlayerIndexEntry[]>();
  for (const e of playerIdx) {
    const arr = byNorm.get(e.normalized_name) || [];
    arr.push(e);
    byNorm.set(e.normalized_name, arr);
  }
  return (raw: string) => {
    const key = normalizeNameForLookup(raw);
    const arr = byNorm.get(key);
    if (!arr || arr.length === 0) return null;
    // If multiple matches across schools, just return the first (M1 will
    // disambiguate via school context here).
    return arr[0].player_id;
  };
}

export default function EventPage({ params }: { params: { id: string } }) {
  const event = readEvent(params.id);
  if (!event) notFound();

  const playerIdx = readPlayerIndex();
  const lookup = buildPlayerIdLookup(playerIdx);

  // Sort competitors: have-position first by position, then by total_to_par.
  const ranked = [...event.competitors].sort((a, b) => {
    const ap = parsePos(a.individual_position);
    const bp = parsePos(b.individual_position);
    if (ap !== null && bp !== null) return ap - bp;
    if (ap !== null) return -1;
    if (bp !== null) return 1;
    return (a.total_to_par ?? 999) - (b.total_to_par ?? 999);
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-6 border-b border-neutral-200 pb-5">
        <h1 className="text-3xl font-semibold tracking-tight">{event.tournament}</h1>
        <p className="mt-1 text-neutral-600">
          {event.course ? `${event.course} · ` : ""}
          {event.start_date ?? "date unknown"}
          {event.gender ? ` · ${event.gender === "m" ? "Men" : "Women"}'s D-I` : ""}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Competitors" value={String(event.competitor_count)} />
          <Stat label="Teams" value={String(event.team_count)} />
          <Stat label="Tournament ID" value={event.tournament_id} />
        </div>
      </header>

      <section>
        <h2 className="mb-3 text-xl font-semibold">Leaderboard</h2>
        <div className="overflow-x-auto rounded border border-neutral-200">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-neutral-600">
              <tr>
                <th className="px-3 py-2">Pos</th>
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2">To par</th>
                <th className="px-3 py-2">Rounds</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((c, i) => {
                const pid = lookup(c.raw_name);
                return (
                  <tr key={`${c.raw_name}-${c.team}-${i}`} className="border-t border-neutral-100">
                    <td className="px-3 py-2 font-medium">{fmtPos(c.individual_position)}</td>
                    <td className="px-3 py-2">
                      {pid ? (
                        <Link href={`/players/${pid}`} className="text-blue-600 hover:underline">
                          {c.raw_name}
                        </Link>
                      ) : (
                        c.raw_name
                      )}
                    </td>
                    <td className="px-3 py-2 text-neutral-600">{c.team || "—"}</td>
                    <td className="px-3 py-2">{fmtToPar(c.total_to_par)}</td>
                    <td className="px-3 py-2 text-neutral-600">
                      {c.rounds
                        .map((r) => (r.rd_total !== null && r.rd_total !== undefined ? r.rd_total : "—"))
                        .join(" / ")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="mt-8 text-xs text-neutral-500">
        Data: granular_master (GolfStat + Clippd). Leaderboards are full-field — covers every team
        present, not just collegegolfdata-tracked teams. Built {event.built_at}.
      </footer>
    </main>
  );
}

function parsePos(p: string | number | null): number | null {
  if (p === null || p === undefined || p === "") return null;
  if (typeof p === "number") return p;
  const m = String(p).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-neutral-200 px-3 py-2">
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="text-base font-semibold">{value}</div>
    </div>
  );
}
