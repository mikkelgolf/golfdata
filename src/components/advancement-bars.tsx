"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Plane, ArrowUp, Trophy, Info, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { teamHref } from "@/lib/team-link";
import { SimpleModal } from "@/components/simple-modal";
import hostLiftData from "@/data/projections/host-lift.json";
import distLiftData from "@/data/projections/distance-lift.json";
import zoneLiftData from "@/data/projections/zone-lift.json";
import seedBaselineData from "@/data/projections/seed-baseline.json";
import {
  applyProjection,
  type AppliedRegional,
  type AppliedTeam,
  type Gender,
  type SeedCell,
} from "@/lib/projections-apply";
import { TEAMS_ADVANCING as MODEL_TEAMS_ADVANCING } from "@/lib/projections";
import type { ScurveAssignment } from "@/lib/scurve";
import type { Regional } from "@/data/regionals-men-2026";

const TEAMS_ADVANCING = MODEL_TEAMS_ADVANCING;

/**
 * Glyph used to mark a team that is geographically close to the regional
 * venue (within HOST_RADIUS_MILES) but is not the designated host school.
 * Swap this constant to change the icon project-wide — anything from
 * `lucide-react` works.
 */
const NEAR_HOST_ICON = MapPin;

interface Props {
  regionals: Regional[];
  gender: Gender;
  hostColorByTeam: Map<string, string>;
  /**
   * Live S-curve assignments for the active mode. The Advancement Model
   * recomputes its per-team probabilities from these so it tracks whichever
   * bracket (committee / strict / actual) the user has selected — instead
   * of always reading the build-time committee snapshot.
   */
  assignments: ScurveAssignment[];
}

export function AdvancementBars({ regionals, gender, hostColorByTeam, assignments }: Props) {
  const ordered = useMemo(() => {
    if (assignments.length === 0) return [] as AppliedRegional[];
    const applied = applyProjection({
      assignments,
      regionals,
      gender,
      hostLift: hostLiftData,
      distLift: distLiftData,
      zoneLift: zoneLiftData,
      seedBaseline: seedBaselineData as SeedCell[],
    });
    const byId = new Map(applied.map((r) => [r.id, r]));
    return regionals
      .map((r) => byId.get(r.id))
      .filter(Boolean) as AppliedRegional[];
  }, [assignments, regionals, gender]);

  const [selected, setSelected] = useState<{
    team: AppliedTeam;
    regional: string;
  } | null>(null);

  return (
    <div className="w-full">
      <Header />
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 sm:gap-2 lg:grid-cols-6 lg:gap-2.5">
        {ordered.map((reg) => (
          <RegionalBars
            key={`${reg.gender}-${reg.id}`}
            reg={reg}
            hostColorByTeam={hostColorByTeam}
            onPick={(team) =>
              setSelected({ team, regional: reg.name.replace(/ Regional$/, "") })
            }
          />
        ))}
      </div>
      <NationalBars
        regionals={ordered}
        hostColorByTeam={hostColorByTeam}
        onPick={(team, regional) => setSelected({ team, regional })}
      />
      <Legend />
      <Methodology />

      <SimpleModal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.team.team}
        subtitle={
          selected
            ? `${selected.regional} Regional · seed ${selected.team.seed} · ${selected.team.conference}`
            : undefined
        }
        widthClass="max-w-md"
      >
        {selected && (
          <TeamDetail
            team={selected.team}
            gender={gender}
            hostColor={hostColorByTeam.get(selected.team.team)}
          />
        )}
      </SimpleModal>
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
        each bar = chance to advance · top {TEAMS_ADVANCING} highlighted · sorted by Final %
      </span>
    </div>
  );
}

function RegionalBars({
  reg,
  hostColorByTeam,
  onPick,
}: {
  reg: AppliedRegional;
  hostColorByTeam: Map<string, string>;
  onPick: (t: AppliedTeam) => void;
}) {
  const sorted = useMemo(
    () => [...reg.teams].sort((a, b) => b.finalPct - a.finalPct),
    [reg],
  );
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card min-w-0">
      <div className="border-b border-border bg-muted/20 px-1.5 py-1 sm:px-2.5 sm:py-1.5">
        <h3 className="truncate text-[10px] font-semibold uppercase tracking-wide text-foreground sm:text-[12px] sm:normal-case sm:tracking-tight">
          {reg.name.replace(/ Regional$/, "")}
        </h3>
        <p className="truncate text-[8px] text-text-tertiary sm:text-[10px]">
          {reg.host} · zone {reg.venueZone}
        </p>
      </div>

      <ColumnHeader />
      <div className="relative px-1 py-1">
        <div className="space-y-[2px]">
          {sorted.map((t, idx) => {
            const placing = idx + 1;
            const advances = placing <= TEAMS_ADVANCING;
            const cinderella = advances && t.seed > TEAMS_ADVANCING;
            const hostColor = hostColorByTeam.get(t.team);
            return (
              <div key={t.team}>
                <BarRow
                  team={t}
                  idx={idx}
                  placing={placing}
                  advances={advances}
                  cinderella={cinderella}
                  hostColor={hostColor}
                  onClick={() => onPick(t)}
                />
                {idx === TEAMS_ADVANCING - 1 && (
                  <div className="mt-[2px] mb-[1px] flex items-center gap-1">
                    <div className="h-px flex-1 border-t border-dashed border-destructive/55" />
                    <span className="text-[7px] font-semibold uppercase tracking-wider text-destructive/85">
                      advancing
                    </span>
                    <div className="h-px flex-1 border-t border-dashed border-destructive/55" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ColumnHeader() {
  return (
    <div className="flex items-center gap-1 border-b border-border/50 bg-muted/10 px-1 py-0.5 text-[7px] font-medium uppercase tracking-wider text-text-tertiary leading-tight">
      <span className="w-5 shrink-0 text-right" title="Tournament seed">Seed</span>
      <span className="w-6 shrink-0 text-right" title="Projected placing">Place</span>
      <span className="w-5 shrink-0 text-right" title="Seed minus projected placing">Δ</span>
      <span className="min-w-0 flex-1">Team</span>
      <span className="w-[28px] shrink-0 text-right sm:w-[32px]">Final</span>
    </div>
  );
}

function BarRow({
  team,
  idx,
  placing,
  advances,
  cinderella,
  hostColor,
  onClick,
}: {
  team: AppliedTeam;
  idx: number;
  placing: number;
  advances: boolean;
  cinderella: boolean;
  hostColor?: string;
  onClick: () => void;
}) {
  const fill = advances ? hostColor || "hsl(var(--foreground))" : "hsl(var(--text-tertiary))";
  const diff = team.seed - placing;
  const diffStr = diff > 0 ? `+${diff}` : diff === 0 ? "0" : `${diff}`;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex w-full items-center gap-1 text-left focus:outline-none"
    >
      <span className="w-5 shrink-0 text-right text-[8.5px] tabular-nums text-text-secondary sm:text-[10px]">
        <span className="inline-flex items-center justify-end gap-0.5">
          {cinderella && <ArrowUp className="h-2 w-2 text-foreground" aria-label="outperforming seed" />}
          {team.seed}
        </span>
      </span>
      <span className="w-6 shrink-0 text-right text-[8.5px] tabular-nums text-text-secondary sm:text-[10px]">
        {placing}
      </span>
      <span
        className={cn(
          "w-5 shrink-0 text-right text-[8.5px] tabular-nums sm:text-[10px]",
          diff > 0 ? "font-semibold text-foreground" : "text-text-tertiary",
        )}
      >
        {diffStr}
      </span>
      {/* Bar track with team name overlaid; advancing rows get a dashed red border to match cutline */}
      <div
        className={cn(
          "relative h-[14px] min-w-0 flex-1 overflow-hidden rounded-[2px] bg-muted/30",
          advances && "border border-dashed border-destructive/65",
        )}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(team.finalPct, 0.5)}%` }}
          transition={{ duration: 0.55, delay: 0.04 + idx * 0.025, ease: "easeOut" }}
          style={{ backgroundColor: fill, opacity: advances ? 0.32 : 0.18 }}
          className="absolute inset-y-0 left-0"
        />
        <div className="relative flex h-full items-center px-1.5">
          <span
            className={cn(
              "truncate text-[8.5px] tracking-tight sm:text-[10px]",
              advances ? "font-semibold text-foreground" : "font-medium text-foreground/80",
            )}
          >
            {team.team}
            {team.isHost && hostColor && (
              <span
                className="ml-1 text-[7px] font-bold text-text-tertiary sm:text-[8px]"
                title="Tournament host"
              >
                H
              </span>
            )}
            {team.isHost && !hostColor && (
              <span
                className="ml-1 inline-flex items-center align-middle text-text-tertiary"
                title={`${team.travelMi.toFixed(0)} mi from venue (within host radius, not the host school)`}
                aria-label={`Within host radius — ${team.travelMi.toFixed(0)} miles from venue`}
              >
                <NEAR_HOST_ICON className="h-2 w-2 sm:h-2.5 sm:w-2.5" />
              </span>
            )}
          </span>
        </div>
      </div>
      <span
        className={cn(
          "w-[28px] shrink-0 text-right text-[8.5px] tabular-nums sm:w-[32px] sm:text-[10px]",
          advances ? "font-semibold text-foreground" : "text-text-tertiary",
        )}
      >
        {team.finalPct.toFixed(1)}
      </span>
    </button>
  );
}

function NationalBars({
  regionals,
  hostColorByTeam,
  onPick,
}: {
  regionals: AppliedRegional[];
  hostColorByTeam: Map<string, string>;
  onPick: (t: AppliedTeam, regional: string) => void;
}) {
  const field = useMemo(() => {
    const advancing: Array<AppliedTeam & { regional: string }> = [];
    for (const r of regionals) {
      r.teams
        .slice()
        .sort((a, b) => b.finalPct - a.finalPct)
        .slice(0, TEAMS_ADVANCING)
        .forEach((t) =>
          advancing.push({ ...t, regional: r.name.replace(/ Regional$/, "") }),
        );
    }
    advancing.sort((a, b) => b.finalPct - a.finalPct);
    return advancing;
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
          {field.length} teams · sorted by Final %
        </span>
      </div>
      <div className="px-2 py-1 sm:columns-2 sm:gap-x-3">
        {field.map((t, idx) => {
          const hostColor = hostColorByTeam.get(t.team);
          const fill = hostColor || "hsl(var(--foreground))";
          return (
            <button
              type="button"
              key={`${t.team}-${t.regional}`}
              onClick={() => onPick(t, t.regional)}
              className="group flex w-full items-center gap-1 break-inside-avoid py-[1px] text-left focus:outline-none"
            >
              <div className="relative h-[14px] min-w-0 flex-1 overflow-hidden rounded-[2px] bg-muted/30">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(t.finalPct, 0.5)}%` }}
                  transition={{
                    duration: 0.5,
                    delay: 0.05 + idx * 0.012,
                    ease: "easeOut",
                  }}
                  style={{ backgroundColor: fill, opacity: 0.32 }}
                  className="absolute inset-y-0 left-0"
                />
                <div className="relative flex h-full items-center px-1.5">
                  <span className="truncate text-[8.5px] font-semibold tracking-tight text-foreground sm:text-[10px]">
                    {t.team}
                  </span>
                </div>
              </div>
              <span className="w-[36px] shrink-0 text-right text-[8.5px] font-semibold tabular-nums text-foreground sm:w-[42px] sm:text-[10px]">
                {t.finalPct.toFixed(1)}%
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[10px] text-text-tertiary">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2 w-3 rounded-[2px] border border-dashed border-destructive/65 bg-foreground/20" />
        projected to advance
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2 w-3 rounded-[2px] bg-text-tertiary opacity-50" />
        not advancing
      </span>
      <span className="inline-flex items-center gap-1.5">
        <ArrowUp className="h-2.5 w-2.5" />
        cinderella (seed &gt; {TEAMS_ADVANCING})
      </span>
      <span className="ml-auto text-text-tertiary/80">tap any bar for the model breakdown</span>
    </div>
  );
}

function TeamDetail({
  team,
  gender,
  hostColor,
}: {
  team: AppliedTeam;
  gender: Gender;
  hostColor?: string;
}) {
  const [from, to] = team.zoneCrossing.split("->");
  const isCrossing = from !== to;
  return (
    <div className="space-y-3 px-4 pb-4 text-[12px]">
      <div className="flex items-baseline justify-between border-b border-border pb-2">
        <div>
          <Link
            href={teamHref(team.team, gender)}
            className="text-[14px] font-semibold text-foreground hover:underline"
            style={hostColor ? { color: hostColor } : undefined}
          >
            {team.team}
          </Link>
          <span className="ml-2 text-[10px] text-text-tertiary">
            #{team.rank} · {team.conference}
            {team.isHost && <span className="ml-1 font-bold text-foreground">HOST</span>}
          </span>
        </div>
        <div className="text-right">
          <div className="text-[18px] font-semibold tabular-nums text-foreground">
            {team.finalPct.toFixed(1)}%
          </div>
          <div className="text-[9px] uppercase tracking-wide text-text-tertiary">Final</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        <DetailRow label="Seed" value={String(team.seed)} />
        <DetailRow
          label="Travel"
          value={
            <span className="inline-flex items-center gap-1">
              {team.travelMi >= 750 && <Plane className="h-3 w-3 opacity-60" />}
              {team.travelMi.toLocaleString()} mi
            </span>
          }
        />
        <DetailRow
          label="Zone"
          value={<span className={cn(isCrossing ? "text-foreground" : "")}>{team.zoneCrossing}</span>}
        />
        <DetailRow
          label="Outperforming"
          value={
            team.seed > TEAMS_ADVANCING ? (
              <span className="inline-flex items-center gap-0.5 font-semibold text-foreground">
                <ArrowUp className="h-3 w-3" />
                yes
              </span>
            ) : (
              <span className="text-text-tertiary">no</span>
            )
          }
        />
      </div>

      <div className="rounded border border-border/60 bg-muted/20 p-2">
        <div className="mb-1 text-[9px] font-medium uppercase tracking-wider text-text-tertiary">
          Model build-up
        </div>
        <div className="space-y-1 text-[11px]">
          <BuildRow label="Base (seed only)" value={team.baseRatePct} />
          <BuildRow label="+ Host bump" value={team.afterHostPct} />
          <BuildRow label="+ Travel" value={team.afterDistancePct} />
          <BuildRow label="+ Climate / zone" value={team.afterZonePct} />
          <BuildRow label="Final (calibrated)" value={team.finalPct} bold />
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[10px] uppercase tracking-wider text-text-tertiary">{label}</span>
      <span className="tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function BuildRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: number;
  bold?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-text-tertiary">{label}</span>
      <span
        className={cn(
          "tabular-nums",
          bold ? "font-semibold text-foreground" : "text-foreground/80",
        )}
      >
        {value.toFixed(1)}%
      </span>
    </div>
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
              The dashed red border wraps the projected top {TEAMS_ADVANCING} - the
              teams the model expects to advance. The{" "}
              <ArrowUp className="inline h-3 w-3" /> arrow flags teams seeded
              outside the top {TEAMS_ADVANCING} but still projected to advance:
              the model&apos;s upset picks.
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
