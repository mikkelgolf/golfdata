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
  className?: string;
}

const accentBorder: Record<NonNullable<Props["accent"]>, string> = {
  default: "border-border",
  primary: "border-l-2 border-l-primary border-border",
  amber: "border-l-2 border-l-amber-500/70 border-border",
  green: "border-l-2 border-l-emerald-500/70 border-border",
  red: "border-l-2 border-l-red-500/70 border-border",
};

export function StatCard({
  label,
  value,
  detail,
  tooltip,
  animate = true,
  accent = "default",
  className,
}: Props) {
  const numericValue = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.-]/g, ""));
  const showAnimated = animate && typeof value === "number" && Number.isFinite(numericValue);
  const prefix = typeof value === "string" && value.startsWith("#") ? "#" : "";

  return (
    <div
      className={cn(
        "rounded-md bg-card px-3 py-2 transition-colors hover:bg-[hsl(var(--surface-raised))]",
        accentBorder[accent],
        accent === "default" && "border",
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
      {detail && (
        <div className="mt-0.5 text-[10px] text-muted-foreground font-mono tabular-nums truncate" title={detail}>
          {detail}
        </div>
      )}
    </div>
  );
}
