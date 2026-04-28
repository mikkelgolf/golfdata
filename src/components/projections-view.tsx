"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { teamHref } from "@/lib/team-link";
import { Plane, MapPin, Info } from "lucide-react";
import perTeamData from "@/data/projections/per-team-2026.json";
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

  return (
    <div className="mt-6 rounded-md border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] font-medium text-foreground hover:bg-muted/30"
      >
        <span className="inline-flex items-center gap-2">
          <Info className="h-3.5 w-3.5" />
          How these numbers are calculated
        </span>
        <span className="text-[11px] text-text-tertiary">{open ? "hide" : "show"}</span>
      </button>
      {open && (
        <div className="space-y-4 border-t border-border px-3 py-3 text-[13px] leading-relaxed text-text-secondary">
          <p>
            Five teams advance from each regional to the NCAA Championship. The
            Final % column is each team&apos;s estimated chance, built from four
            things history says actually matter.
          </p>

          <Section title="1. Seed">
            <p>
              The biggest signal by far. Top seeds advance over 90% of the time;
              5-seeds about half the time; bottom seeds rarely. Every team starts
              from the historical advancement rate for their seed.
            </p>
          </Section>

          <Section title="2. Playing at home">
            <p>
              Hosts advance noticeably more than their seed alone would predict.
              The biggest bump goes to mid-seed hosts (4–7 seeds) — they have the
              most room to outperform. Top-seed hosts are already favored, so the
              extra lift is smaller in absolute terms.
            </p>
          </Section>

          <Section title="3. Travel distance">
            <p>
              Teams within roughly 250 miles of the venue do measurably better.
              Past that, longer trips hurt slightly and consistently — a
              coast-to-coast haul is harder than a regional drive.
            </p>
          </Section>

          <Section title="4. Climate and grass type">
            <p>
              Teams play differently on turf they&apos;re used to. We split college
              golf into four zones by dominant agronomy: <strong>PNW</strong>{" "}
              (Pacific Northwest, bent), <strong>West</strong> (California /
              desert), <strong>South</strong> (warm-season bermuda), and{" "}
              <strong>North</strong> (cool-season interior, Northeast,
              Mid-Atlantic). Crossing zones — especially North ↔ South — costs a
              few percentage points on average.
            </p>
          </Section>

          <Section title="Why each regional sums to 500%">
            <p>
              Five teams advance, so each regional&apos;s column is calibrated to
              total exactly 5.000. A clear favorite — say a top seed who&apos;s also
              the host — gets pinned near 99% rather than dragging the math
              around; the rest of the probability is spread across the more
              contested middle of the field.
            </p>
          </Section>

          <Section title="What this can't tell you">
            <p>
              This is a structural model, not a form model. Two teams with the
              same seed get the same starting point regardless of how they&apos;re
              actually playing right now. A team in late-season form is probably
              underrated here; a slumping favorite is probably overrated. For
              roster strength and current form, look at the head-to-head and
              rankings tabs.
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
