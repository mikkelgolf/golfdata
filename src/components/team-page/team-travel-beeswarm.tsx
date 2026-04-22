"use client";

import { useMemo } from "react";
import { BeeswarmTravel } from "@/components/beeswarm-travel";
import type { ScurveAssignment } from "@/lib/scurve";
import type { Regional } from "@/data/regionals-men-2026";

interface Props {
  assignments: ScurveAssignment[];
  regionals: Regional[];
  highlightTeam: string;
}

/**
 * Team-scoped travel beeswarm. Shows this team's predicted travel distance
 * relative to the field; peers dim, the team's own dot renders larger with
 * a foreground ring so the eye locks on immediately.
 */
export default function TeamTravelBeeswarm({
  assignments,
  regionals,
  highlightTeam,
}: Props) {
  const regionalMap = useMemo(() => {
    const m = new Map<number, Regional>();
    for (const r of regionals) m.set(r.id, r);
    return m;
  }, [regionals]);
  return (
    <BeeswarmTravel
      assignments={assignments}
      regionalMap={regionalMap}
      highlightTeam={highlightTeam}
    />
  );
}
