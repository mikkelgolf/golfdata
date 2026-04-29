"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Plane, ArrowUp } from "lucide-react";
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

// Layout constants (SVG viewBox units)
const VBW = 800;
const VBH = 700;
const SRC_X = 90;
const SRC_W = 14;
const DST_X = VBW - 90 - 14;
const DST_W = 14;
const REGIONAL_GAP = 14;
const TOP_PAD = 18;
const BOTTOM_PAD = 18;

interface Flow {
  team: AppliedTeam;
  regional: string;
  regionalId: number;
  hostColor?: string;
  // source y (top edge), destination y (top edge), thickness
  sy: number;
  dy: number;
  t: number;
}

export function AdvancementSankey({ regionals, gender, hostColorByTeam }: Props) {
  const ordered = useMemo(() => {
    const byId = new Map(
      PAYLOAD.regionals.filter((r) => r.gender === gender).map((r) => [r.id, r]),
    );
    return regionals.map((r) => byId.get(r.id)).filter(Boolean) as AppliedRegional[];
  }, [regionals, gender]);

  const { flows, regionalRects, dstRect } = useMemo(() => {
    // Build top-5 advancing list per regional, sorted by finalPct desc inside each band
    const perRegional: Array<{ reg: AppliedRegional; teams: AppliedTeam[] }> = ordered.map(
      (reg) => ({
        reg,
        teams: [...reg.teams]
          .sort((a, b) => b.finalPct - a.finalPct)
          .slice(0, TEAMS_ADVANCING),
      }),
    );

    const massPerRegional = perRegional.map((p) =>
      p.teams.reduce((acc, t) => acc + t.finalPct, 0),
    );
    const totalMass = massPerRegional.reduce((a, b) => a + b, 0);

    const usableHeight = VBH - TOP_PAD - BOTTOM_PAD - REGIONAL_GAP * (perRegional.length - 1);
    const scale = totalMass > 0 ? usableHeight / totalMass : 0;

    // Source bands and per-flow source y positions
    const flowList: Flow[] = [];
    const regionalRects: Array<{
      id: number;
      name: string;
      host: string;
      y: number;
      h: number;
    }> = [];

    let cursor = TOP_PAD;
    perRegional.forEach((p, idx) => {
      const bandH = massPerRegional[idx] * scale;
      regionalRects.push({
        id: p.reg.id,
        name: p.reg.name.replace(/ Regional$/, ""),
        host: p.reg.host,
        y: cursor,
        h: bandH,
      });

      let yWithin = cursor;
      for (const t of p.teams) {
        const th = t.finalPct * scale;
        flowList.push({
          team: t,
          regional: p.reg.name.replace(/ Regional$/, ""),
          regionalId: p.reg.id,
          hostColor: hostColorByTeam.get(t.team),
          sy: yWithin,
          dy: 0, // fill below
          t: th,
        });
        yWithin += th;
      }
      cursor += bandH + REGIONAL_GAP;
    });

    // Destination side: stack by finalPct desc (highest at top)
    const sortedForDest = [...flowList].sort((a, b) => b.team.finalPct - a.team.finalPct);
    const dstStart = TOP_PAD;
    let dstCursor = dstStart;
    const destYByTeam = new Map<string, number>();
    for (const f of sortedForDest) {
      destYByTeam.set(`${f.regionalId}-${f.team.team}`, dstCursor);
      dstCursor += f.t;
    }
    const dstHeight = dstCursor - dstStart;

    for (const f of flowList) {
      f.dy = destYByTeam.get(`${f.regionalId}-${f.team.team}`) ?? f.dy;
    }

    return {
      flows: flowList,
      regionalRects,
      dstRect: { y: dstStart, h: dstHeight },
    };
  }, [ordered, hostColorByTeam]);

  const [hoverTeam, setHoverTeam] = useState<string | null>(null);
  const [selected, setSelected] = useState<{
    team: AppliedTeam;
    regional: string;
  } | null>(null);

  return (
    <div className="w-full">
      <Header />

      <div className="overflow-hidden rounded-md border border-border bg-card">
        <svg
          viewBox={`0 0 ${VBW} ${VBH}`}
          className="block h-auto w-full"
          aria-label="Sankey of advancement flow from regionals to La Costa"
        >
          {/* Source bands */}
          {regionalRects.map((rr) => (
            <g key={rr.id}>
              <rect
                x={SRC_X}
                y={rr.y}
                width={SRC_W}
                height={rr.h}
                fill="hsl(var(--foreground))"
                opacity={0.85}
                rx={2}
              />
              {/* Regional label, vertically centered to the band */}
              <text
                x={SRC_X - 6}
                y={rr.y + rr.h / 2 + 3}
                textAnchor="end"
                fontSize={11}
                fill="hsl(var(--foreground))"
                className="font-semibold"
              >
                {rr.name}
              </text>
              <text
                x={SRC_X - 6}
                y={rr.y + rr.h / 2 + 14}
                textAnchor="end"
                fontSize={8}
                fill="hsl(var(--text-tertiary))"
              >
                {rr.host}
              </text>
            </g>
          ))}

          {/* Destination block — La Costa */}
          <rect
            x={DST_X}
            y={dstRect.y}
            width={DST_W}
            height={dstRect.h}
            fill="hsl(var(--foreground))"
            opacity={0.85}
            rx={2}
          />
          <text
            x={DST_X + DST_W + 8}
            y={dstRect.y + 12}
            fontSize={12}
            fill="hsl(var(--foreground))"
            className="font-semibold"
          >
            La Costa
          </text>
          <text
            x={DST_X + DST_W + 8}
            y={dstRect.y + 24}
            fontSize={9}
            fill="hsl(var(--text-tertiary))"
          >
            {flows.length} qualifiers
          </text>

          {/* Flow ribbons */}
          {flows.map((f, i) => {
            const isHover = hoverTeam === f.team.team;
            const cinderella = f.team.seed > TEAMS_ADVANCING;
            const fill = f.hostColor || "hsl(var(--foreground))";
            const path = sankeyPath(SRC_X + SRC_W, f.sy, DST_X, f.dy, f.t);
            const isLabeled = f.t > 7;
            return (
              <motion.g
                key={`${f.regionalId}-${f.team.team}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.1 + i * 0.012, ease: "easeOut" }}
                onMouseEnter={() => setHoverTeam(f.team.team)}
                onMouseLeave={() => setHoverTeam(null)}
                onClick={() => setSelected({ team: f.team, regional: f.regional })}
                style={{ cursor: "pointer" }}
              >
                <title>{`${f.team.team} · ${f.regional} · ${f.team.finalPct.toFixed(1)}%`}</title>
                <path
                  d={path}
                  fill={fill}
                  opacity={isHover ? 0.9 : hoverTeam ? 0.18 : 0.45}
                  stroke={cinderella ? "hsl(var(--foreground))" : "none"}
                  strokeWidth={cinderella ? 0.6 : 0}
                  strokeOpacity={0.8}
                />
                {isLabeled && (
                  <text
                    x={(SRC_X + SRC_W + DST_X) / 2}
                    y={(f.sy + f.dy) / 2 + f.t / 2 + 3}
                    fontSize={Math.min(9, Math.max(6.5, f.t * 0.55))}
                    fill="hsl(var(--background))"
                    textAnchor="middle"
                    className="font-semibold pointer-events-none"
                  >
                    {cinderella ? "↑ " : ""}
                    {abbreviateTeam(f.team.team)} · {f.team.finalPct.toFixed(0)}%
                  </text>
                )}
              </motion.g>
            );
          })}
        </svg>
      </div>

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
        Advancement Model · Flow
      </h2>
      <span className="text-[11px] text-muted-foreground">
        each ribbon = a team advancing · thickness = Final % · 6 regionals → La Costa
      </span>
    </div>
  );
}

// Build a sankey ribbon path from (sx, sy)-(sx, sy+t) to (dx, dy)-(dx, dy+t)
function sankeyPath(sx: number, sy: number, dx: number, dy: number, t: number): string {
  const cpx1 = sx + (dx - sx) * 0.5;
  const cpx2 = sx + (dx - sx) * 0.5;
  const top = `M ${sx} ${sy} C ${cpx1} ${sy} ${cpx2} ${dy} ${dx} ${dy}`;
  const right = `L ${dx} ${dy + t}`;
  const bottom = `C ${cpx2} ${dy + t} ${cpx1} ${sy + t} ${sx} ${sy + t}`;
  return `${top} ${right} ${bottom} Z`;
}

function Legend() {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[10px] text-text-tertiary">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2 w-3 rounded-[2px] bg-foreground opacity-60" />
        ribbon = team flow · thickness = Final %
      </span>
      <span className="inline-flex items-center gap-1.5">
        <ArrowUp className="h-2.5 w-2.5" />
        cinderella ribbon (seed &gt; {TEAMS_ADVANCING})
      </span>
      <span className="ml-auto text-text-tertiary/80">
        hover or tap a ribbon for the model breakdown
      </span>
    </div>
  );
}

function abbreviateTeam(name: string): string {
  const stripped = name
    .replace(/\b(University|College|Univ\.?)\b/g, "")
    .replace(/\b(St\.?|State)\b/g, "St")
    .trim();
  if (stripped.length > 12) {
    const parts = stripped.split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 10);
    return parts[0].slice(0, 8) + " " + parts.slice(1).map((p) => p[0]).join("");
  }
  return stripped;
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
