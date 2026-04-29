"use client";

import { useSearchParams } from "next/navigation";

interface Props {
  /** Already-formatted date string for the men's active snapshot, e.g. "Apr 29, 26". */
  menDate: string;
  /** Already-formatted date string for the women's active snapshot, e.g. "Apr 28, 26". */
  womenDate: string;
}

/**
 * Renders the active rankings date for the gender currently selected on the
 * Regional Predictions homepage. Reads the `?gender=` URL query param which
 * `ScurveTable` keeps in sync via `router.replace`, so this stays in lockstep
 * with the active tab — flipping Men/Women updates the date here too.
 *
 * Defaults to men when the param is absent or anything other than "women",
 * matching `ScurveTable`'s `initialGender` fallback.
 */
export function ActiveRankingsDate({ menDate, womenDate }: Props) {
  const searchParams = useSearchParams();
  const gender = searchParams.get("gender") === "women" ? "women" : "men";
  return <>{gender === "men" ? menDate : womenDate}</>;
}
