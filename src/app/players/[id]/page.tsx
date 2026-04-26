import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import * as fs from "fs";
import * as path from "path";

interface PlayerEvent {
  tournament_id: string;
  tournament: string;
  course: string | null;
  start_date: string | null;
  season: number | null;
  rounds: { round: number; rd_total: number | null; round_to_par: number | null }[];
  individual_position: string | number | null;
  team_position: string | number | null;
  total_to_par: number | null;
  sources: string[];
}

interface SeasonAgg {
  season: number;
  events: number;
  best_finish: number | null;
  scoring_avg_to_par: number | null;
}

interface PlayerExport {
  player_id: string;
  raw_name: string;
  normalized_name: string;
  school_slug: string;
  school_name: string;
  gender: "m" | "w";
  built_at: string;
  identity_confidence: number;
  source_summary: string[];
  identity_notes: string[];
  career: {
    events_total: number;
    seasons: SeasonAgg[];
    events: PlayerEvent[];
  };
  record_book_mentions: { context: string; detail?: string }[];
}

interface PlayerIndexEntry {
  player_id: string;
  raw_name: string;
  normalized_name: string;
  school_slug: string;
  school_name: string;
  gender: "m" | "w";
  events_total: number;
  best_finish: number | null;
  first_season: number | null;
  last_season: number | null;
}

const PLAYERS_DIR = path.join(process.cwd(), "src", "data", "players");
const EVENTS_DIR = path.join(process.cwd(), "src", "data", "events");

function readIndex(): PlayerIndexEntry[] {
  const p = path.join(PLAYERS_DIR, "index.json");
  if (!fs.existsSync(p)) return [];
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function readEventTidMap(): Map<string, string> {
  const p = path.join(EVENTS_DIR, "index.json");
  if (!fs.existsSync(p)) return new Map();
  const arr: { tournament_id: string; file: string }[] = JSON.parse(fs.readFileSync(p, "utf-8"));
  const out = new Map<string, string>();
  for (const e of arr) out.set(String(e.tournament_id), e.file.replace(/\.json$/, ""));
  return out;
}

function readPlayer(id: string): PlayerExport | null {
  const p = path.join(PLAYERS_DIR, `${id}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

export async function generateStaticParams(): Promise<{ id: string }[]> {
  return readIndex().map((e) => ({ id: e.player_id }));
}

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const p = readPlayer(params.id);
  if (!p) return { title: "Player not found" };
  return {
    title: `${p.raw_name} — ${p.school_name} | College Golf Data`,
    description: `Career record for ${p.raw_name} at ${p.school_name}.`,
  };
}

function fmtPos(p: string | number | null): string {
  if (p === null || p === undefined) return "—";
  return String(p);
}

function fmtToPar(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n === 0) return "E";
  return n > 0 ? `+${n}` : String(n);
}

export default function PlayerPage({ params }: { params: { id: string } }) {
  const player = readPlayer(params.id);
  if (!player) notFound();

  const teamSlug = player.school_slug;
  const genderPath = player.gender === "m" ? "men" : "women";
  const eventTidMap = readEventTidMap();

  const careerBest =
    player.career.events
      .map((e) =>
        typeof e.individual_position === "string"
          ? parseInt(e.individual_position.replace(/[^0-9]/g, ""), 10) || null
          : (e.individual_position as number | null)
      )
      .filter((n): n is number => n !== null && !Number.isNaN(n))
      .reduce<number | null>((acc, n) => (acc === null ? n : Math.min(acc, n)), null) ?? null;

  const seasons = player.career.seasons;
  const events = player.career.events;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-6">
        <Link
          href={`/teams/${genderPath}/${teamSlug}`}
          className="text-sm text-blue-600 hover:underline"
        >
          ← {player.school_name} {genderPath === "men" ? "Men's" : "Women's"} Golf
        </Link>
      </div>

      <header className="mb-8 border-b border-neutral-200 pb-6">
        <h1 className="text-3xl font-semibold tracking-tight">{player.raw_name}</h1>
        <p className="mt-1 text-neutral-600">
          {player.school_name} · {genderPath === "men" ? "Men's" : "Women's"} Golf
        </p>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Events" value={String(player.career.events_total)} />
          <Stat label="Seasons" value={String(seasons.length)} />
          <Stat label="Career best" value={careerBest !== null ? `${careerBest}` : "—"} />
          <Stat
            label="First → last"
            value={
              seasons.length
                ? `${seasons[0].season} → ${seasons[seasons.length - 1].season}`
                : "—"
            }
          />
        </div>
      </header>

      {player.identity_notes.length > 0 && (
        <div className="mb-6 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <strong>Notes:</strong>
          <ul className="mt-1 ml-4 list-disc">
            {player.identity_notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      {seasons.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-xl font-semibold">Season-by-season</h2>
          <div className="overflow-x-auto rounded border border-neutral-200">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-neutral-600">
                <tr>
                  <th className="px-3 py-2">Season</th>
                  <th className="px-3 py-2">Events</th>
                  <th className="px-3 py-2">Best finish</th>
                  <th className="px-3 py-2">Avg score to par</th>
                </tr>
              </thead>
              <tbody>
                {seasons.map((s) => (
                  <tr key={s.season} className="border-t border-neutral-100">
                    <td className="px-3 py-2 font-medium">{s.season}</td>
                    <td className="px-3 py-2">{s.events}</td>
                    <td className="px-3 py-2">{s.best_finish ?? "—"}</td>
                    <td className="px-3 py-2">{fmtToPar(s.scoring_avg_to_par)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {events.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-xl font-semibold">Every event</h2>
          <div className="overflow-x-auto rounded border border-neutral-200">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-neutral-600">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Tournament</th>
                  <th className="px-3 py-2">Course</th>
                  <th className="px-3 py-2">Pos</th>
                  <th className="px-3 py-2">To par</th>
                  <th className="px-3 py-2">Rds</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e, i) => {
                  const evtSlug = eventTidMap.get(String(e.tournament_id));
                  return (
                    <tr key={`${e.tournament_id}-${i}`} className="border-t border-neutral-100">
                      <td className="px-3 py-2 whitespace-nowrap">{e.start_date ?? "—"}</td>
                      <td className="px-3 py-2">
                        {evtSlug ? (
                          <Link
                            href={`/events/${evtSlug}`}
                            className="text-blue-600 hover:underline"
                          >
                            {e.tournament}
                          </Link>
                        ) : (
                          e.tournament
                        )}
                      </td>
                      <td className="px-3 py-2 text-neutral-600">{e.course ?? "—"}</td>
                      <td className="px-3 py-2 font-medium">{fmtPos(e.individual_position)}</td>
                      <td className="px-3 py-2">{fmtToPar(e.total_to_par)}</td>
                      <td className="px-3 py-2 text-neutral-600">{e.rounds.length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {player.record_book_mentions.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-xl font-semibold">NCAA Record Book</h2>
          <ul className="ml-5 list-disc text-sm text-neutral-700">
            {player.record_book_mentions.map((m, i) => (
              <li key={i}>
                {m.context}
                {m.detail ? ` — ${m.detail}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="mt-10 border-t border-neutral-200 pt-4 text-xs text-neutral-500">
        Sources: {player.source_summary.join(", ") || "—"} · Identity confidence:{" "}
        {player.identity_confidence.toFixed(2)} · Built {player.built_at}
        <br />
        Player ID is a deterministic placeholder until the canonical identity resolver lands. URLs
        will remain stable across re-runs of the M0/M1 build.
      </footer>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-neutral-200 px-3 py-2">
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
