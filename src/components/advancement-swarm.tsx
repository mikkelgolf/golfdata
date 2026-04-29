"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { forceSimulation, forceX, forceY, forceCollide } from "d3-force";
import { Plane, ArrowUp, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { teamHref } from "@/lib/team-link";
import { SimpleModal } from "@/components/simple-modal";
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

export function AdvancementSwarm({ regionals, gender, hostColorByTeam }: Props) {
  const ordered = useMemo(() => {
    const byId = new Map(
      PAYLOAD.regionals.filter((r) => r.gender === gender).map((r) => [r.id, r]),
    );
    return regionals.map((r) => byId.get(r.id)).filter(Boolean) as AppliedRegional[];
  }, [regionals, gender]);

  const [selected, setSelected] = useState<{
    team: AppliedTeam;
    regional: string;
  } | null>(null);

  return (
    <div className="w-full">
      <Header />
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-3">
        {ordered.map((reg) => (
          <RegionalSwarm
            key={`${reg.gender}-${reg.id}`}
            reg={reg}
            hostColorByTeam={hostColorByTeam}
            onPick={(team) =>
              setSelected({ team, regional: reg.name.replace(/ Regional$/, "") })
            }
          />
        ))}
      </div>
      <NationalSwarm
        regionals={ordered}
        hostColorByTeam={hostColorByTeam}
        onPick={(team, regional) => setSelected({ team, regional })}
      />
      <Legend />

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
        Advancement Model · Visual
      </h2>
      <span className="text-[11px] text-muted-foreground">
        each dot is a team · vertical position = chance to advance · dashed line
        = top {TEAMS_ADVANCING} cutline
      </span>
    </div>
  );
}

const COL_WIDTH = 120;
const COL_HEIGHT = 280;
const PAD_TOP = 18;
const PAD_BOTTOM = 22;
const PAD_X = 24;

function RegionalSwarm({
  reg,
  hostColorByTeam,
  onPick,
}: {
  reg: AppliedRegional;
  hostColorByTeam: Map<string, string>;
  onPick: (t: AppliedTeam) => void;
}) {
  const { nodes, cutline } = useMemo(() => {
    const yFor = (pct: number) =>
      PAD_TOP + (1 - pct / 100) * (COL_HEIGHT - PAD_TOP - PAD_BOTTOM);

    type Node = AppliedTeam & {
      x: number;
      y: number;
      vx?: number;
      vy?: number;
      idx: number;
    };

    const sim: Node[] = reg.teams.map((t, i) => ({
      ...t,
      idx: i,
      x: COL_WIDTH / 2,
      y: yFor(t.finalPct),
    }));

    forceSimulation(sim)
      .force(
        "y",
        forceY<Node>((d) => yFor(d.finalPct)).strength(1),
      )
      .force("x", forceX<Node>(COL_WIDTH / 2).strength(0.18))
      .force("collide", forceCollide<Node>(6.5))
      .stop()
      .tick(180);

    // 5th-place team's finalPct = cutline
    const top5 = [...reg.teams].slice(0, TEAMS_ADVANCING);
    const cutPct = top5.length
      ? top5[top5.length - 1].finalPct
      : 0;

    return { nodes: sim, cutline: yFor(cutPct) };
  }, [reg]);

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

      <div className="relative">
        <svg
          viewBox={`0 0 ${COL_WIDTH} ${COL_HEIGHT}`}
          className="block h-auto w-full"
          aria-label={`${reg.name} advancement probabilities`}
        >
          {/* Y-axis ticks at 0/25/50/75/100% */}
          {[0, 25, 50, 75, 100].map((pct) => {
            const y =
              PAD_TOP + (1 - pct / 100) * (COL_HEIGHT - PAD_TOP - PAD_BOTTOM);
            return (
              <g key={pct}>
                <line
                  x1={PAD_X / 2}
                  x2={COL_WIDTH - PAD_X / 2}
                  y1={y}
                  y2={y}
                  stroke="hsl(var(--border))"
                  strokeWidth={0.4}
                  opacity={0.4}
                />
                <text
                  x={2}
                  y={y + 2}
                  fontSize={6}
                  fill="hsl(var(--text-tertiary))"
                  className="tabular-nums"
                >
                  {pct}
                </text>
              </g>
            );
          })}

          {/* Cutline */}
          <line
            x1={4}
            x2={COL_WIDTH - 4}
            y1={cutline}
            y2={cutline}
            stroke="hsl(var(--destructive))"
            strokeWidth={0.8}
            strokeDasharray="3 2"
            opacity={0.55}
          />
          <text
            x={COL_WIDTH - 4}
            y={cutline - 2}
            fontSize={6}
            textAnchor="end"
            fill="hsl(var(--destructive))"
            opacity={0.7}
            className="font-medium uppercase tracking-wider"
          >
            top {TEAMS_ADVANCING}
          </text>

          {/* Dots */}
          {nodes.map((n) => {
            const advances = n.idx < TEAMS_ADVANCING;
            const cinderella = advances && n.seed > TEAMS_ADVANCING;
            const hostColor = hostColorByTeam.get(n.team);
            const fill = advances
              ? hostColor || "hsl(var(--foreground))"
              : "hsl(var(--text-tertiary))";
            const r = advances ? 4.5 : 2.8;
            return (
              <motion.g
                key={n.team}
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  duration: 0.35,
                  delay: 0.04 + n.idx * 0.025,
                  ease: "easeOut",
                }}
                style={{ cursor: "pointer", transformOrigin: `${n.x}px ${n.y}px` }}
                onClick={() => onPick(n)}
              >
                <title>{`${n.team} · seed ${n.seed} · ${n.finalPct.toFixed(1)}%`}</title>
                {cinderella && (
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={r + 2}
                    fill="none"
                    stroke="hsl(var(--foreground))"
                    strokeWidth={0.8}
                    opacity={0.9}
                  />
                )}
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={r}
                  fill={fill}
                  opacity={advances ? 1 : 0.55}
                />
                {advances && (
                  <text
                    x={n.x + r + 2}
                    y={n.y + 2.2}
                    fontSize={6.5}
                    fill="hsl(var(--foreground))"
                    className="font-medium"
                  >
                    {abbreviateTeam(n.team)}
                  </text>
                )}
              </motion.g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

const NAT_HEIGHT = 130;
const NAT_PAD_X = 32;
const NAT_PAD_Y = 26;

function NationalSwarm({
  regionals,
  hostColorByTeam,
  onPick,
}: {
  regionals: AppliedRegional[];
  hostColorByTeam: Map<string, string>;
  onPick: (t: AppliedTeam, regional: string) => void;
}) {
  const NAT_VBW = 800;

  const { field, nodes } = useMemo(() => {
    const advancing: Array<AppliedTeam & { regional: string }> = [];
    for (const r of regionals) {
      r.teams.slice(0, TEAMS_ADVANCING).forEach((t) =>
        advancing.push({ ...t, regional: r.name.replace(/ Regional$/, "") }),
      );
    }
    advancing.sort((a, b) => b.finalPct - a.finalPct);

    const maxPct = Math.max(100, ...advancing.map((t) => t.finalPct));
    const minPct = Math.min(0, ...advancing.map((t) => t.finalPct));
    const xFor = (pct: number) =>
      NAT_PAD_X +
      ((pct - minPct) / (maxPct - minPct || 1)) *
        (NAT_VBW - NAT_PAD_X * 2);

    type Node = (AppliedTeam & { regional: string }) & {
      x: number;
      y: number;
      vx?: number;
      vy?: number;
      idx: number;
    };

    const sim: Node[] = advancing.map((t, i) => ({
      ...t,
      idx: i,
      x: xFor(t.finalPct),
      y: NAT_HEIGHT / 2,
    }));

    forceSimulation(sim)
      .force("x", forceX<Node>((d) => xFor(d.finalPct)).strength(1))
      .force("y", forceY<Node>(NAT_HEIGHT / 2).strength(0.22))
      .force("collide", forceCollide<Node>(7))
      .stop()
      .tick(200);

    return { field: advancing, nodes: sim };
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
          {field.length} teams · positioned by Final %
        </span>
      </div>
      <div className="px-1 py-2">
        <svg
          viewBox={`0 0 ${NAT_VBW} ${NAT_HEIGHT}`}
          className="block h-auto w-full"
          aria-label="Beeswarm of projected La Costa field"
        >
          {/* x-axis ticks */}
          {[0, 25, 50, 75, 100].map((pct) => {
            const x =
              NAT_PAD_X +
              (pct / 100) * (NAT_VBW - NAT_PAD_X * 2);
            return (
              <g key={pct}>
                <line
                  x1={x}
                  x2={x}
                  y1={NAT_PAD_Y}
                  y2={NAT_HEIGHT - NAT_PAD_Y / 2}
                  stroke="hsl(var(--border))"
                  strokeWidth={0.4}
                  opacity={0.4}
                />
                <text
                  x={x}
                  y={NAT_HEIGHT - 6}
                  fontSize={8}
                  textAnchor="middle"
                  fill="hsl(var(--text-tertiary))"
                  className="tabular-nums"
                >
                  {pct}%
                </text>
              </g>
            );
          })}

          {nodes.map((n) => {
            const cinderella = n.seed > TEAMS_ADVANCING;
            const hostColor = hostColorByTeam.get(n.team);
            const fill = hostColor || "hsl(var(--foreground))";
            return (
              <motion.g
                key={`${n.team}-${n.regional}`}
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  duration: 0.4,
                  delay: 0.05 + n.idx * 0.018,
                  ease: "easeOut",
                }}
                style={{
                  cursor: "pointer",
                  transformOrigin: `${n.x}px ${n.y}px`,
                }}
                onClick={() => onPick(n, n.regional)}
              >
                <title>{`${n.team} · ${n.regional} · ${n.finalPct.toFixed(1)}%`}</title>
                {cinderella && (
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={6.5}
                    fill="none"
                    stroke="hsl(var(--foreground))"
                    strokeWidth={0.9}
                    opacity={0.9}
                  />
                )}
                <circle cx={n.x} cy={n.y} r={4.5} fill={fill} />
                <text
                  x={n.x}
                  y={n.y - 7}
                  fontSize={7}
                  textAnchor="middle"
                  fill="hsl(var(--foreground))"
                  className="font-medium"
                >
                  {abbreviateTeam(n.team)}
                </text>
              </motion.g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[10px] text-text-tertiary">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full bg-foreground" />
        projected to advance
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full bg-text-tertiary opacity-55" />
        not advancing
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full border border-foreground" />
        cinderella (seed &gt; {TEAMS_ADVANCING})
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-px w-3 border-t border-dashed border-destructive" />
        cutline
      </span>
      <span className="ml-auto text-text-tertiary/80">
        tap any dot for the model breakdown
      </span>
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
            {team.isHost && (
              <span className="ml-1 font-bold text-foreground">HOST</span>
            )}
          </span>
        </div>
        <div className="text-right">
          <div className="text-[18px] font-semibold tabular-nums text-foreground">
            {team.finalPct.toFixed(1)}%
          </div>
          <div className="text-[9px] uppercase tracking-wide text-text-tertiary">
            Final
          </div>
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
          value={
            <span className={cn(isCrossing ? "text-foreground" : "")}>
              {team.zoneCrossing}
            </span>
          }
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

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[10px] uppercase tracking-wider text-text-tertiary">
        {label}
      </span>
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

function abbreviateTeam(name: string): string {
  // Compact name for inside-svg labels. Strip "State", "University", common suffixes.
  const stripped = name
    .replace(/\b(University|College|Univ\.?)\b/g, "")
    .replace(/\b(St\.?|State)\b/g, "St")
    .trim();
  // If still long, take first word + initials of rest.
  if (stripped.length > 12) {
    const parts = stripped.split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 10);
    return parts[0].slice(0, 8) + " " + parts.slice(1).map((p) => p[0]).join("");
  }
  return stripped;
}
