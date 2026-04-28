"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { teamHref } from "@/lib/team-link";
import { Plane, MapPin, Info } from "lucide-react";
import perTeamData from "@/data/projections/per-team-2026.json";
import seedBaseline from "@/data/projections/seed-baseline.json";
import hostLift from "@/data/projections/host-lift.json";
import distanceLift from "@/data/projections/distance-lift.json";
import zoneLift from "@/data/projections/zone-lift.json";
import type { Regional } from "@/data/regionals-men-2026";

type Gender = "men" | "women";

interface AppliedTeam {
  team: string;
  rank: number;
  conference: string;
  seed: number;
  isHost: boolean;
  travelMi: number;
  zoneCrossing: string;
  baseRatePct: number;
  afterHostPct: number;
  afterDistancePct: number;
  afterZonePct: number;
  finalPct: number;
}

interface AppliedRegional {
  id: number;
  gender: Gender;
  name: string;
  host: string;
  city: string;
  venueLat: number;
  venueLng: number;
  venueZone: string;
  teams: AppliedTeam[];
}

interface PerTeamPayload {
  builtAt: string;
  teamsAdvancing: number;
  regionals: AppliedRegional[];
}

const PAYLOAD = perTeamData as PerTeamPayload;
const TEAMS_ADVANCING = PAYLOAD.teamsAdvancing;

interface Props {
  regionals: Regional[];
  gender: Gender;
  hostColorByTeam: Map<string, string>;
}

export function ProjectionsView({ regionals, gender, hostColorByTeam }: Props) {
  const genderRegionals = useMemo(
    () => PAYLOAD.regionals.filter((r) => r.gender === gender),
    [gender],
  );

  // Order to match the visible regionals list (which is already strength-sorted)
  const ordered = useMemo(() => {
    const byId = new Map(genderRegionals.map((r) => [r.id, r]));
    return regionals.map((r) => byId.get(r.id)).filter(Boolean) as AppliedRegional[];
  }, [regionals, genderRegionals]);

  return (
    <div className="w-full">
      <Header />
      <div className="space-y-6">
        {ordered.map((reg) => (
          <RegionalCard
            key={`${reg.gender}-${reg.id}`}
            reg={reg}
            gender={gender}
            hostColorByTeam={hostColorByTeam}
          />
        ))}
      </div>
      <Methodology />
    </div>
  );
}

function Header() {
  return (
    <div className="mb-4 rounded-md border border-border bg-card p-3 text-[12px] text-muted-foreground">
      <p>
        Per-team probability of advancing to the NCAA Championship. Built from
        the historical seed baseline (Layer 1), then adjusted multiplicatively
        for host school (Layer 2), travel distance (Layer 3), and climate-zone
        crossing (Layer 4). Each regional&apos;s column is normalized to sum to{" "}
        <span className="font-medium text-foreground">{TEAMS_ADVANCING}.000</span>{" "}
        (the five advancing spots). Top {TEAMS_ADVANCING} per regional are
        highlighted.
      </p>
    </div>
  );
}

function RegionalCard({
  reg,
  gender,
  hostColorByTeam,
}: {
  reg: AppliedRegional;
  gender: Gender;
  hostColorByTeam: Map<string, string>;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border bg-muted/30 px-3 py-2">
        <h3 className="text-[14px] font-semibold tracking-tight text-foreground">
          {reg.name}
        </h3>
        <span className="text-[12px] text-muted-foreground">
          {reg.host} · {reg.city} · zone {reg.venueZone}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] tabular-nums">
          <thead className="bg-muted/20 text-text-tertiary">
            <tr className="text-left">
              <Th className="w-10 text-right">Seed</Th>
              <Th className="min-w-[160px]">Team</Th>
              <Th className="w-16">Host</Th>
              <Th className="w-20 text-right">Travel</Th>
              <Th className="w-32">Zone</Th>
              <Th className="w-14 text-right">Base</Th>
              <Th className="w-14 text-right">+Host</Th>
              <Th className="w-14 text-right">+Dist</Th>
              <Th className="w-14 text-right">+Climate</Th>
              <Th className="w-16 text-right font-medium text-foreground">Final</Th>
            </tr>
          </thead>
          <tbody>
            {reg.teams.map((t, i) => (
              <Row
                key={t.team}
                t={t}
                gender={gender}
                advances={i < TEAMS_ADVANCING}
                hostColor={hostColorByTeam.get(t.team)}
              />
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-muted/10 text-text-tertiary">
              <td colSpan={9} className="px-2 py-1.5 text-right text-[11px]">
                sum
              </td>
              <td className="px-2 py-1.5 text-right font-medium text-foreground">
                {reg.teams.reduce((s, t) => s + t.finalPct, 0).toFixed(1)}%
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function Row({
  t,
  gender,
  advances,
  hostColor,
}: {
  t: AppliedTeam;
  gender: Gender;
  advances: boolean;
  hostColor?: string;
}) {
  const [from, to] = t.zoneCrossing.split("->");
  const isCrossing = from !== to;
  return (
    <tr
      className={cn(
        "border-t border-border/60 transition-colors",
        advances && "bg-muted/30",
      )}
    >
      <td className="px-2 py-1.5 text-right tabular-nums text-text-secondary">
        {t.seed}
      </td>
      <td className="px-2 py-1.5">
        <Link
          href={teamHref(t.team, gender)}
          className={cn(
            "hover:underline",
            advances ? "font-medium text-foreground" : "text-foreground",
          )}
          style={hostColor ? { color: hostColor } : undefined}
        >
          {t.team}
        </Link>
        <span className="ml-1.5 text-[11px] text-text-tertiary">
          #{t.rank} · {t.conference}
        </span>
      </td>
      <td className="px-2 py-1.5">
        {t.isHost && (
          <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
            <MapPin className="h-3 w-3" /> host
          </span>
        )}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-text-secondary">
        <span className="inline-flex items-center gap-1">
          {t.travelMi >= 750 && <Plane className="h-3 w-3 opacity-60" />}
          {t.travelMi.toLocaleString()} mi
        </span>
      </td>
      <td className="px-2 py-1.5 text-text-secondary">
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[11px]",
            isCrossing ? "bg-rose-500/10 text-rose-600 dark:text-rose-400" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
          )}
        >
          {t.zoneCrossing}
        </span>
      </td>
      <td className="px-2 py-1.5 text-right text-text-tertiary">
        {t.baseRatePct.toFixed(0)}%
      </td>
      <td className="px-2 py-1.5 text-right text-text-tertiary">
        {t.afterHostPct.toFixed(0)}%
      </td>
      <td className="px-2 py-1.5 text-right text-text-tertiary">
        {t.afterDistancePct.toFixed(0)}%
      </td>
      <td className="px-2 py-1.5 text-right text-text-tertiary">
        {t.afterZonePct.toFixed(0)}%
      </td>
      <td
        className={cn(
          "px-2 py-1.5 text-right tabular-nums",
          advances ? "font-semibold text-foreground" : "text-foreground",
        )}
      >
        {t.finalPct.toFixed(1)}%
      </td>
    </tr>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide",
        className,
      )}
    >
      {children}
    </th>
  );
}

function Methodology() {
  const [open, setOpen] = useState(false);

  const seedRange = (g: Gender) => {
    const cells = (seedBaseline as { gender: Gender; seed: number; n_apps: number }[]).filter(
      (c) => c.gender === g,
    );
    const seasons =
      g === "men" ? "2009–2025 excl. 2020 (16 seasons, 6×14 format)" : "2022–2025 (4 seasons, 6×12 format)";
    const nMax = Math.max(...cells.map((c) => c.n_apps));
    return `${seasons}, n up to ${nMax} per seed cell`;
  };

  const hostRow = (g: Gender) => (hostLift as any[]).find((c) => c.gender === g);
  const distRows = (g: Gender) => (distanceLift as any[]).filter((c) => c.gender === g);
  const zoneAgg = (g: Gender, io: "in" | "out") =>
    (zoneLift as any[]).find((c) => c.gender === g && c.level === "aggregate" && c.in_or_out === io);

  return (
    <div className="mt-6 rounded-md border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] font-medium text-foreground hover:bg-muted/30"
      >
        <span className="inline-flex items-center gap-2">
          <Info className="h-3.5 w-3.5" />
          Methodology
        </span>
        <span className="text-[11px] text-text-tertiary">{open ? "hide" : "show"}</span>
      </button>
      {open && (
        <div className="space-y-4 border-t border-border px-3 py-3 text-[12px] leading-relaxed text-text-secondary">
          <Section title="Layer 1 — Seed baseline">
            <p>
              For each (gender, regional seed) cell, advancement rate over the
              format-stable era. Modern era only because field size and the
              meaning of &quot;seed N&quot; depend on it. Men: {seedRange("men")}. Women:{" "}
              {seedRange("women")}.
            </p>
            <p className="text-text-tertiary">
              Advancement defined as finish ≤ 5. Ties at 5th flatten to 5 and
              count as advanced (uniform across history).
            </p>
          </Section>

          <Section title="Layer 2 — Host school lift">
            {(["men", "women"] as const).map((g) => {
              const c = hostRow(g);
              if (!c) return null;
              return (
                <p key={g}>
                  <span className="font-medium text-foreground">{g}:</span> n={c.n} host
                  appearances; observed {(c.observed * 100).toFixed(0)}% advance vs
                  seed-matched expected {(c.expected * 100).toFixed(0)}%. Odds-ratio{" "}
                  <span className="font-medium text-foreground">{c.oddsRatio.toFixed(2)}×</span>.
                </p>
              );
            })}
            <p className="text-text-tertiary">
              Host detection by campus-to-venue distance &lt; 30 miles.
            </p>
          </Section>

          <Section title="Layer 3 — Travel distance lift">
            {(["men", "women"] as const).map((g) => (
              <div key={g}>
                <p className="font-medium text-foreground">{g}:</p>
                <ul className="ml-4 list-disc">
                  {distRows(g).map((c) => (
                    <li key={c.bucket}>
                      {c.bucket} mi — n={c.n}, observed {(c.observed * 100).toFixed(0)}%, OR{" "}
                      {c.oddsRatio.toFixed(2)}×
                      {c.n < 15 && (
                        <span className="ml-1 text-text-tertiary">(sparse → no effect applied)</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </Section>

          <Section title="Layer 4 — Climate / agronomy zone">
            <p>
              Four zones: PNW (WA + OR, bent-dominant), WEST (CA / AZ / NV / NM / HI,
              poa + desert overseed), SOUTH (warm-season bermuda), NORTH (cool-season
              interior + Northeast + Mid-Atlantic).
            </p>
            {(["men", "women"] as const).map((g) => {
              const inZ = zoneAgg(g, "in");
              const outZ = zoneAgg(g, "out");
              if (!inZ || !outZ) return null;
              return (
                <p key={g}>
                  <span className="font-medium text-foreground">{g}:</span>{" "}
                  in-zone n={inZ.n} OR={inZ.oddsRatio.toFixed(2)}× · out-of-zone n=
                  {outZ.n} OR={outZ.oddsRatio.toFixed(2)}×. Specific zone-pair lifts are
                  used when n ≥ 15, else the in/out aggregate.
                </p>
              );
            })}
            <p className="text-text-tertiary">
              PNW vs WEST split because Pacific Northwest leans bent rather than poa
              and isn&apos;t equivalent to California / desert overseed for visiting teams.
            </p>
          </Section>

          <Section title="Combination + normalization">
            <p>
              Layers stacked as multiplicative odds-ratios on the seed baseline.
              Pseudo-counts (Laplace α=0.5) avoid 0% / 100% edge cases. Within each
              regional, probabilities are renormalized (log-odds shift) so the column
              sums to {TEAMS_ADVANCING}.000 — the five advancing spots.
            </p>
            <p className="text-text-tertiary">
              Built {new Date(PAYLOAD.builtAt).toLocaleString()}. Re-run{" "}
              <code className="rounded bg-muted px-1 py-0.5">npx tsx
              scripts/build-projections-data.ts</code> after a rankings refresh.
            </p>
          </Section>

          <Section title="Future extensions (not in v1)">
            <p>
              Elevation effects (Layer 5: Albuquerque / Mountain West regionals).
              Roster-strength adjustment (current model is structural only).
              PNW women&apos;s baseline tightening as 2026/2027 seasons accumulate (current
              n=24 per seed).
            </p>
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <h4 className="text-[12px] font-semibold uppercase tracking-wide text-text-tertiary">
        {title}
      </h4>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
