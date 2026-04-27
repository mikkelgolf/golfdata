// Per-conference championship landing pages on the conference's own
// website. Used by the Team page's "2026 Conference Championship"
// section to link the championship name to the conference's own page
// (NOT the venue/course URL — that's `championship.sourceUrl`).
//
// Mikkel + David's preferred convention is to point at the conference's
// championship landing page (e.g. https://www.secsports.com/championships/womens-golf)
// rather than the sport hub. When such a URL doesn't exist or is hard to
// find, leave the entry out — the Team page falls back to plain text
// (no link) rather than linking to the wrong destination.
//
// Add new entries by inserting them into URLS keyed as `${gender}:${conference}`,
// using the same conference codes as `championships-{men,women}-2026.ts`.

type Gender = "men" | "women";
type Key = `${Gender}:${string}`;

const URLS: Partial<Record<Key, string>> = {
  // Power 4
  "men:SEC": "https://www.secsports.com/championships/mens-golf",
  "women:SEC": "https://www.secsports.com/championships/womens-golf",
  "men:ACC": "https://theacc.com/feature/mens-golf-championship",
  "women:ACC": "https://theacc.com/feature/womens-golf-championship",
  "men:B10": "https://bigten.org/mgolf/championship/",
  "women:B10": "https://bigten.org/wgolf/championship/",
  // TODO(David, 2026-04-27): Big 12 (B12) men + women — couldn't confirm a stable
  // championship landing-page URL on big12sports.com. Awaiting confirmation.
};

/**
 * Returns the conference's own championship landing-page URL for a given
 * (gender, conference). `undefined` when not yet recorded.
 */
export function getConferenceChampionshipUrl(
  gender: Gender,
  conference: string
): string | undefined {
  return URLS[`${gender}:${conference}`];
}
