import { cn } from "@/lib/utils";
import { canonicalConferenceLabel } from "@/data/conference-codes";

const CONFERENCE_ACCENTS: Record<string, string> = {
  SEC: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  ACC: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  B12: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  B10: "border-indigo-500/40 bg-indigo-500/10 text-indigo-300",
  BIG10: "border-indigo-500/40 bg-indigo-500/10 text-indigo-300",
  WCC: "border-rose-400/40 bg-rose-400/10 text-rose-200",
  BE: "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300",
  BEAST: "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300",
  AAC: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
  MWC: "border-orange-500/40 bg-orange-500/10 text-orange-300",
  MAC: "border-red-500/40 bg-red-500/10 text-red-300",
  CUSA: "border-violet-500/40 bg-violet-500/10 text-violet-300",
  SUNBELT: "border-yellow-500/40 bg-yellow-500/10 text-yellow-200",
  BIGSKY: "border-teal-500/40 bg-teal-500/10 text-teal-300",
  "BIG SKY": "border-teal-500/40 bg-teal-500/10 text-teal-300",
  BSKY: "border-teal-500/40 bg-teal-500/10 text-teal-300",
  PATRIOT: "border-slate-500/40 bg-slate-500/10 text-slate-300",
  MAAC: "border-lime-500/40 bg-lime-500/10 text-lime-300",
  SOCON: "border-pink-500/40 bg-pink-500/10 text-pink-300",
  SWAC: "border-purple-500/40 bg-purple-500/10 text-purple-300",
  NEC: "border-blue-500/40 bg-blue-500/10 text-blue-300",
  ASUN: "border-green-500/40 bg-green-500/10 text-green-300",
};

const DEFAULT_ACCENT =
  "border-border bg-card text-muted-foreground";

export function ConferenceBadge({
  conference,
  className,
  size = "sm",
}: {
  conference: string;
  className?: string;
  size?: "sm" | "md";
}) {
  // Fold known Clippd variants (e.g. "NEC - Northeast Conference",
  // "Northeast Women's Golf Conference", "The Ivy League") to their
  // canonical short code so both the displayed label and the accent
  // colour are consistent regardless of which variant the upstream
  // caller passed in.
  const label = canonicalConferenceLabel(conference);
  const key = label.toUpperCase().replace(/\s+/g, " ").trim();
  const compactKey = key.replace(/\s+/g, "");
  const accent = CONFERENCE_ACCENTS[key] ?? CONFERENCE_ACCENTS[compactKey] ?? DEFAULT_ACCENT;
  const sizing = size === "md" ? "px-2.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-[10px]";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-medium uppercase tracking-wider whitespace-nowrap",
        sizing,
        accent,
        className
      )}
    >
      {label}
    </span>
  );
}
