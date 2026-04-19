"use client";

import { AnimatedNumber } from "@/components/animated-number";
import { InfoTooltip } from "@/components/info-tooltip";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: string | number;
  detail?: string;
  tooltip?: React.ReactNode;
  animate?: boolean;
  accent?: "default" | "primary" | "amber" | "green" | "red";
  /**
   * 0-100 percentile rank within the D1 field for this stat.
   * When provided, renders a 60x4 rail beneath the value with a dot at
   * (percentile / 100) * 60. >=75 uses --primary, else --muted-foreground.
   */
  percentile?: number;
  className?: string;
}

const accentBorder: Record<NonNullable<Props["accent"]>, string> = {
  default: "",
  primary: "border-l-2 border-l-primary",
  amber: "border-l-2 border-l-amber-500/70",
  green: "border-l-2 border-l-emerald-500/70",
  red: "border-l-2 border-l-red-500/70",
};

const RAIL_W = 60;
const RAIL_H = 4;

function PercentileRail({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const cx = (clamped / 100) * RAIL_W;
  const hot = clamped >= 75;
  const dotColor = hot
    ? "hsl(var(--primary))"
    : "hsl(var(--muted-foreground))";
  const topPct = Math.max(1, Math.round(100 - clamped));
  return (
    <svg
      width={RAIL_W}
      height={RAIL_H}
      viewBox={`0 0 ${RAIL_W} ${RAIL_H}`}
      aria-label={`Top ${topPct}% of D1`}
      className="mt-1 block overflow-visible"
    >
      <title>{`Top ${topPct}% of D1`}</title>
      <rect
        x={0}
        y={RAIL_H / 2 - 0.5}
        width={RAIL_W}
        height={1}
        fill="hsl(var(--border))"
      />
      <circle cx={cx} cy={RAIL_H / 2} r={2} fill={dotColor} />
    </svg>
  );
}

export function StatCard({
  label,
  value,
  detail,
  tooltip,
  animate = true,
  accent = "default",
  percentile,
  className,
}: Props) {
  const numericValue = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.-]/g, ""));
  const showAnimated = animate && typeof value === "number" && Number.isFinite(numericValue);
  const prefix = typeof value === "string" && value.startsWith("#") ? "#" : "";
  const hasPercentile = typeof percentile === "number" && Number.isFinite(percentile);

  return (
    <div
      className={cn(
        "ring-card px-3 py-2 shadow-flat hover:shadow-raised transition-shadow duration-150 ease-out",
        accentBorder[accent],
        className
      )}
    >
      <div className="flex items-start gap-1">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80 leading-tight">
          {label}
        </div>
        {tooltip && <InfoTooltip>{tooltip}</InfoTooltip>}
      </div>
      <div className="mt-1 text-[18px] sm:text-[20px] font-semibold text-foreground tabular-nums leading-tight">
        {showAnimated ? (
          <>
            {prefix}
            <AnimatedNumber value={numericValue} />
          </>
        ) : (
          value
        )}
      </div>
      {hasPercentile && <PercentileRail pct={percentile as number} />}
      {detail && (
        <div className="mt-0.5 text-[10px] text-muted-foreground font-mono tabular-nums truncate" title={detail}>
          {detail}
        </div>
      )}
    </div>
  );
}
