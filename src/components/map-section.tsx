"use client";

import { useMemo } from "react";
import USMap from "@/components/us-map";
import { computeScurve, computeRegionalSeeds } from "@/lib/scurve";
import type { TeamData } from "@/data/rankings-men";
import type { Regional } from "@/data/regionals-men-2026";

interface MapSectionProps {
  menTeams: TeamData[];
  menRegionals: Regional[];
}

export default function MapSection({ menTeams, menRegionals }: MapSectionProps) {
  const assignments = useMemo(
    () => computeScurve(menTeams, menRegionals, "committee"),
    [menTeams, menRegionals]
  );

  const regionalSeeds = useMemo(() => computeRegionalSeeds(assignments), [assignments]);

  return <USMap assignments={assignments} regionals={menRegionals} regionalSeeds={regionalSeeds} />;
}
