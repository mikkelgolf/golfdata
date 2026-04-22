import { getTeamBrand } from "@/data/team-colors";

interface Props {
  team: string;
  size?: number;
  className?: string;
}

/**
 * Color-coded monogram badge in lieu of a real team logo — school primary
 * color + 2–4 letter initials. Zero copyright surface vs. hotlinking actual
 * trademarked logos, and renders at build time for SSG.
 */
export default function TeamMonogram({ team, size = 36, className }: Props) {
  const brand = getTeamBrand(team);
  const text = brand.text ?? "#ffffff";
  // Scale font with badge size — longer initials shrink a step to fit.
  const base = size * 0.42;
  const font = brand.initials.length >= 4 ? base * 0.78 : base;
  return (
    <div
      aria-hidden="true"
      className={
        "shrink-0 inline-flex items-center justify-center rounded-md font-semibold tracking-tight select-none " +
        (className ?? "")
      }
      style={{
        width: size,
        height: size,
        backgroundColor: brand.primary,
        color: text,
        fontSize: `${font}px`,
        lineHeight: 1,
        // Subtle inner ring reads as depth against dark bg without needing
        // a second brand color.
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)",
      }}
    >
      {brand.initials}
    </div>
  );
}
