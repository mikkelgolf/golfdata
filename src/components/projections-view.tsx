"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { teamHref } from "@/lib/team-link";
import { Plane, Info, ChevronDown, ArrowUp, Trophy } from "lucide-react";
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

  const ordered = useMemo(() => {
    const byId = new Map(genderRegionals.map((r) => [r.id, r]));
    return regionals.map((r) => byId.get(r.id)).filter(Boolean) as AppliedRegional[];
  }, [regionals, genderRegionals]);

  return (
    <div className="w-full">
      <Header />
      <div className="space-y-3">
        {ordered.map((reg) => (
          <RegionalCard
            key={`${reg.gender}-${reg.id}`}
            reg={reg}
            gender={gender}
            hostColorByTeam={hostColorByTeam}
          />
        ))}
      </div>
      <NationalField regionals={ordered} gender={gender} hostColorByTeam={hostColorByTeam} />
      <Methodology />
    </div>
  );
}

function Header() {
  return (
    <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
        Advancement Model
      </h2>
      <span className="text-[11px] text-muted-foreground">
        seed baseline · host · travel · climate · top {TEAMS_ADVANCING} per regional advance
      </span>
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
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-border bg-muted/20 px-2.5 py-1.5">
        <h3 className="text-[12px] font-semibold tracking-tight text-foreground">
          {reg.name.replace(/ Regional$/, "")}
        </h3>
        <span className="text-[10px] text-muted-foreground">
          {reg.host} · {reg.city} · zone {reg.venueZone}
        </span>
      </div>

      {/* Desktop table — full model breakdown */}
      <div className="hidden sm:block">
        <table className="w-full text-[11px] tabular-nums">
          <thead className="text-text-tertiary">
            <tr className="text-left">
              <Th className="w-8 text-right">Seed</Th>
              <Th className="min-w-[150px]">Team</Th>
              <Th className="w-16 text-right">Travel</Th>
              <Th className="w-24">Zone</Th>
              <Th className="w-12 text-right">Base</Th>
              <Th className="w-12 text-right">+Host</Th>
              <Th className="w-12 text-right">+Dist</Th>
              <Th className="w-14 text-right">+Climate</Th>
              <Th className="w-14 text-right font-medium text-foreground">Final</Th>
            </tr>
          </thead>
          <tbody>
            {reg.teams.map((t, i) => (
              <DesktopRow
                key={t.team}
                t={t}
                gender={gender}
                idx={i}
                advances={i < TEAMS_ADVANCING}
                hostColor={hostColorByTeam.get(t.team)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile — compact, tap to expand model breakdown */}
      <div className="sm:hidden">
        {reg.teams.map((t, i) => (
          <MobileRow
            key={t.team}
            t={t}
            gender={gender}
            idx={i}
            advances={i < TEAMS_ADVANCING}
            hostColor={hostColorByTeam.get(t.team)}
            isLastAdvancing={i === TEAMS_ADVANCING - 1 && reg.teams.length > TEAMS_ADVANCING}
          />
        ))}
      </div>
    </div>
  );
}

function DesktopRow({
  t,
  gender,
  idx,
  advances,
  hostColor,
}: {
  t: AppliedTeam;
  gender: Gender;
  idx: number;
  advances: boolean;
  hostColor?: string;
}) {
  const cinderella = advances && t.seed > TEAMS_ADVANCING;
  const [from, to] = t.zoneCrossing.split("->");
  const isCrossing = from !== to;
  return (
    <motion.tr
      initial={{ opacity: 0, x: -3 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.18, ease: "easeOut", delay: idx * 0.012 }}
      className={cn(
        "border-t border-border/50 transition-colors",
        advances && "border-l-2 border-l-foreground",
        !advances && "border-l-2 border-l-transparent",
      )}
    >
      <td className="px-2 py-1 text-right tabular-nums text-text-secondary">
        <span className="inline-flex items-center justify-end gap-0.5">
          {cinderella && (
            <ArrowUp className="h-2.5 w-2.5 text-foreground" aria-label="outperforming seed" />
          )}
          {t.seed}
        </span>
      </td>
      <td className="px-2 py-1">
        <Link
          href={teamHref(t.team, gender)}
          className={cn(
            "hover:underline",
            advances ? "font-semibold text-foreground" : "text-foreground",
          )}
          style={hostColor ? { color: hostColor } : undefined}
        >
          {t.team}
        </Link>
        {t.isHost && (
          <span className="ml-1 text-[9px] font-bold text-text-tertiary">H</span>
        )}
        <span className="ml-1.5 text-[10px] text-text-tertiary">
          #{t.rank} · {t.conference}
        </span>
      </td>
      <td className="px-2 py-1 text-right tabular-nums text-text-secondary">
        <span className="inline-flex items-center gap-0.5">
          {t.travelMi >= 750 && <Plane className="h-2.5 w-2.5 opacity-50" />}
          {t.travelMi.toLocaleString()}
        </span>
      </td>
      <td className="px-2 py-1 text-text-secondary">
        <span
          className={cn(
            "rounded px-1 py-0.5 text-[10px]",
            isCrossing
              ? "bg-muted/40 text-foreground"
              : "text-text-tertiary",
          )}
        >
          {t.zoneCrossing}
        </span>
      </td>
      <td className="px-2 py-1 text-right text-text-tertiary">
        {t.baseRatePct.toFixed(0)}%
      </td>
      <td className="px-2 py-1 text-right text-text-tertiary">
        {t.afterHostPct.toFixed(0)}%
      </td>
      <td className="px-2 py-1 text-right text-text-tertiary">
        {t.afterDistancePct.toFixed(0)}%
      </td>
      <td className="px-2 py-1 text-right text-text-tertiary">
        {t.afterZonePct.toFixed(0)}%
      </td>
      <td
        className={cn(
          "px-2 py-1 text-right tabular-nums",
          advances ? "font-semibold text-foreground" : "text-foreground",
        )}
      >
        {t.finalPct.toFixed(1)}%
      </td>
    </motion.tr>
  );
}

function MobileRow({
  t,
  gender,
  idx,
  advances,
  hostColor,
  isLastAdvancing,
}: {
  t: AppliedTeam;
  gender: Gender;
  idx: number;
  advances: boolean;
  hostColor?: string;
  isLastAdvancing: boolean;
}) {
  const [open, setOpen] = useState(false);
  const cinderella = advances && t.seed > TEAMS_ADVANCING;
  const [from, to] = t.zoneCrossing.split("->");
  const isCrossing = from !== to;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, x: -3 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.18, ease: "easeOut", delay: idx * 0.012 }}
        className={cn(
          "border-t border-border/50 first:border-t-0",
          advances ? "border-l-2 border-l-foreground" : "border-l-2 border-l-transparent",
        )}
      >
        <button
          type="button"
          onClick={() => setOpen((s) => !s)}
          className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left"
          aria-expanded={open}
        >
          <span className="w-6 shrink-0 text-right text-[11px] tabular-nums text-text-secondary">
            <span className="inline-flex items-center justify-end gap-0.5">
              {cinderella && <ArrowUp className="h-2.5 w-2.5 text-foreground" />}
              {t.seed}
            </span>
          </span>
          <span className="min-w-0 flex-1 truncate">
            <Link
              href={teamHref(t.team, gender)}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "text-[12px] hover:underline",
                advances ? "font-semibold text-foreground" : "text-foreground",
              )}
              style={hostColor ? { color: hostColor } : undefined}
            >
              {t.team}
            </Link>
            {t.isHost && (
              <span className="ml-1 text-[9px] font-bold text-text-tertiary">H</span>
            )}
            <span className="ml-1 text-[10px] text-text-tertiary">
              #{t.rank}
            </span>
          </span>
          <span
            className={cn(
              "shrink-0 text-right text-[12px] tabular-nums",
              advances ? "font-semibold text-foreground" : "text-foreground",
            )}
          >
            {t.finalPct.toFixed(1)}%
          </span>
          <ChevronDown
            className={cn(
              "h-3 w-3 shrink-0 text-text-tertiary transition-transform",
              open && "rotate-180",
            )}
          />
        </button>

        {open && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 border-t border-border/40 bg-muted/15 px-2 py-1.5 text-[10px] text-text-tertiary">
            <div className="flex justify-between">
              <span>Conference</span>
              <span className="text-foreground">{t.conference}</span>
            </div>
            <div className="flex justify-between">
              <span>Travel</span>
              <span className="text-foreground">
                {t.travelMi >= 750 && <Plane className="mr-0.5 inline h-2.5 w-2.5 opacity-50" />}
                {t.travelMi.toLocaleString()} mi
              </span>
            </div>
            <div className="flex justify-between">
              <span>Zone</span>
              <span className={cn(isCrossing ? "text-foreground" : "text-text-tertiary")}>
                {t.zoneCrossing}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Base</span>
              <span className="text-foreground">{t.baseRatePct.toFixed(0)}%</span>
            </div>
            <div className="flex justify-between">
              <span>+Host</span>
              <span className="text-foreground">{t.afterHostPct.toFixed(0)}%</span>
            </div>
            <div className="flex justify-between">
              <span>+Dist</span>
              <span className="text-foreground">{t.afterDistancePct.toFixed(0)}%</span>
            </div>
            <div className="flex justify-between">
              <span>+Climate</span>
              <span className="text-foreground">{t.afterZonePct.toFixed(0)}%</span>
            </div>
            <div className="flex justify-between">
              <span>Final</span>
              <span className="font-semibold text-foreground">{t.finalPct.toFixed(1)}%</span>
            </div>
          </div>
        )}
      </motion.div>
      {isLastAdvancing && (
        <div className="flex items-center gap-1 border-t border-dashed border-border/60 px-2 py-0.5">
          <span className="text-[8px] font-medium uppercase tracking-wider text-text-tertiary">
            advancing
          </span>
        </div>
      )}
    </>
  );
}

function NationalField({
  regionals,
  gender,
  hostColorByTeam,
}: {
  regionals: AppliedRegional[];
  gender: Gender;
  hostColorByTeam: Map<string, string>;
}) {
  const field = useMemo(() => {
    const advancing: Array<AppliedTeam & { regional: string }> = [];
    for (const r of regionals) {
      r.teams.slice(0, TEAMS_ADVANCING).forEach((t) =>
        advancing.push({ ...t, regional: r.name.replace(/ Regional$/, "") }),
      );
    }
    return advancing.sort((a, b) => b.finalPct - a.finalPct);
  }, [regionals]);

  if (field.length === 0) return null;

  return (
    <div className="mt-4 overflow-hidden rounded-md border border-border bg-card">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-border bg-muted/20 px-2.5 py-1.5">
        <Trophy className="h-3 w-3 text-foreground" />
        <h3 className="text-[12px] font-semibold tracking-tight text-foreground">
          Projected La Costa Field
        </h3>
        <span className="text-[10px] text-muted-foreground">
          Omni La Costa · Carlsbad, CA · {field.length} teams from {regionals.length} regionals · ranked by Final %
        </span>
      </div>

      {/* Desktop */}
      <div className="hidden sm:block">
        <table className="w-full text-[11px] tabular-nums">
          <thead className="text-text-tertiary">
            <tr className="text-left">
              <Th className="w-8 text-right">#</Th>
              <Th className="min-w-[150px]">Team</Th>
              <Th className="w-12 text-right">Seed</Th>
              <Th className="w-32">From</Th>
              <Th className="w-20">Conference</Th>
              <Th className="w-14 text-right font-medium text-foreground">Final</Th>
            </tr>
          </thead>
          <tbody>
            {field.map((t, i) => (
              <motion.tr
                key={`${t.team}-${t.regional}`}
                initial={{ opacity: 0, x: -3 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.18, ease: "easeOut", delay: i * 0.008 }}
                className="border-t border-border/50"
              >
                <td className="px-2 py-1 text-right text-text-tertiary tabular-nums">{i + 1}</td>
                <td className="px-2 py-1">
                  <Link
                    href={teamHref(t.team, gender)}
                    className="font-medium text-foreground hover:underline"
                    style={hostColorByTeam.get(t.team) ? { color: hostColorByTeam.get(t.team) } : undefined}
                  >
                    {t.team}
                  </Link>
                </td>
                <td className="px-2 py-1 text-right tabular-nums text-text-secondary">{t.seed}</td>
                <td className="px-2 py-1 text-text-secondary text-[10px]">{t.regional}</td>
                <td className="px-2 py-1 text-text-tertiary text-[10px]">{t.conference}</td>
                <td className="px-2 py-1 text-right font-semibold text-foreground tabular-nums">
                  {t.finalPct.toFixed(1)}%
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <div className="sm:hidden">
        {field.map((t, i) => (
          <motion.div
            key={`${t.team}-${t.regional}`}
            initial={{ opacity: 0, x: -3 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.18, ease: "easeOut", delay: i * 0.008 }}
            className="flex items-center gap-1.5 border-t border-border/50 px-2 py-1.5 first:border-t-0"
          >
            <span className="w-5 shrink-0 text-right text-[10px] tabular-nums text-text-tertiary">
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 truncate">
              <Link
                href={teamHref(t.team, gender)}
                className="text-[12px] font-medium text-foreground hover:underline"
                style={hostColorByTeam.get(t.team) ? { color: hostColorByTeam.get(t.team) } : undefined}
              >
                {t.team}
              </Link>
              <span className="ml-1 text-[10px] text-text-tertiary">
                #{t.seed} · {t.regional}
              </span>
            </span>
            <span className="shrink-0 text-right text-[12px] font-semibold tabular-nums text-foreground">
              {t.finalPct.toFixed(1)}%
            </span>
          </motion.div>
        ))}
      </div>
    </div>
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
        "px-2 py-1 text-[10px] font-medium uppercase tracking-wide",
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
    <div className="mt-4 rounded-md border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[12px] font-medium text-foreground hover:bg-muted/30"
      >
        <span className="inline-flex items-center gap-2">
          <Info className="h-3.5 w-3.5" />
          How the Advancement Model works
        </span>
        <span className="text-[10px] text-text-tertiary">{open ? "hide" : "show"}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-border px-3 py-3 text-[12px] leading-relaxed text-text-secondary">
          <p>
            Five teams advance from each regional to the NCAA Championship at Omni
            La Costa. Final % is each team&apos;s estimated chance, built from four
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
              The biggest bump goes to mid-seed hosts (4-7 seeds) - they have the
              most room to outperform. Top-seed hosts are already favored, so the
              extra lift is smaller in absolute terms.
            </p>
          </Section>

          <Section title="3. Travel distance">
            <p>
              Teams within roughly 250 miles of the venue do measurably better.
              Past that, longer trips hurt slightly and consistently - a
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
              Mid-Atlantic). Crossing zones - especially North to South - costs a
              few percentage points on average.
            </p>
          </Section>

          <Section title="Why each regional sums to 500%">
            <p>
              Five teams advance, so each regional&apos;s column is calibrated to
              total exactly 5.000. A clear favorite - say a top seed who&apos;s also
              the host - gets pinned near 99% rather than dragging the math
              around; the rest of the probability is spread across the more
              contested middle of the field.
            </p>
          </Section>

          <Section title="Highlighting">
            <p>
              The left-margin bar marks the projected top {TEAMS_ADVANCING} - the
              teams the model expects to advance. The <ArrowUp className="inline h-3 w-3" /> arrow
              flags teams seeded outside the top {TEAMS_ADVANCING} but still
              projected to advance: the model&apos;s upset picks.
            </p>
          </Section>

          <Section title="What this can&apos;t tell you">
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
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
        {title}
      </h4>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
