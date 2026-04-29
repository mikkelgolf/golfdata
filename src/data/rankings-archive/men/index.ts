// AUTO-GENERATED — do not edit by hand.
// Regenerate with: npx tsx scripts/snapshot-rankings.ts --regen-index
//
// Maps date (YYYY-MM-DD) → snapshot for the men's rankings archive.
// `latestDateMen` is the most recent date present (lexicographic sort
// works because all keys are ISO YYYY-MM-DD).

import type { RankingsSnapshot } from "@/lib/rankings-archive";
import snap_2026_04_12 from "./2026-04-12";
import snap_2026_04_13 from "./2026-04-13";
import snap_2026_04_15 from "./2026-04-15";
import snap_2026_04_23 from "./2026-04-23";
import snap_2026_04_27 from "./2026-04-27";
import snap_2026_04_28 from "./2026-04-28";

export const archiveMen: Record<string, RankingsSnapshot> = {
  "2026-04-12": snap_2026_04_12,
  "2026-04-13": snap_2026_04_13,
  "2026-04-15": snap_2026_04_15,
  "2026-04-23": snap_2026_04_23,
  "2026-04-27": snap_2026_04_27,
  "2026-04-28": snap_2026_04_28,
};

export const latestDateMen: string = "2026-04-28";
