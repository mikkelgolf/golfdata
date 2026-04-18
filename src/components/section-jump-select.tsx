"use client";

interface Chip {
  slug: string;
  title: string;
}

export default function SectionJumpSelect({ chips }: { chips: Chip[] }) {
  return (
    <select
      aria-label="Jump to section"
      defaultValue=""
      onChange={(e) => {
        if (e.target.value) {
          window.location.hash = e.target.value;
          e.target.value = "";
        }
      }}
      className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
    >
      <option value="" disabled>
        Jump to section…
      </option>
      {chips.map((c) => (
        <option key={c.slug} value={c.slug}>
          {c.title}
        </option>
      ))}
    </select>
  );
}
