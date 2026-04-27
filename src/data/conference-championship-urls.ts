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
// David's URL pattern hint (2026-04-27): most conferences use
// `[conferencedomain]/sports/mgolf` and `/sports/wgolf`. A handful of
// exceptions exist (SEC/ACC have a /championships/ or /feature/ landing
// page, SOCON drops the /sports/ prefix, AAC + PATRIOT combine men's
// and women's into one /sports/golf hub, Big 12 uses tournament-specific
// URLs that may need rotating each year).

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
  // Big 12 — David, 2026-04-27 confirmed: tournament-specific URLs
  // (the women's URL is year-stamped, will need a refresh each spring).
  "men:B12": "https://big12sports.com/tournaments/?id=1062&path=golf",
  "women:B12": "https://big12sports.com/feature/2026-womens-golf-tournament",

  // Other major D1 (David-confirmed)
  "men:AAC": "https://theamerican.org/sports/golf",
  "women:AAC": "https://theamerican.org/sports/golf",
  "men:MWC": "https://themw.com/sports/mgolf/",
  "women:MWC": "https://themw.com/sports/wgolf/",
  "men:A10": "https://atlantic10.com/sports/mgolf",
  "women:A10": "https://atlantic10.com/sports/wgolf",
  "men:CUSA": "https://conferenceusa.com/sports/mgolf",
  "women:CUSA": "https://conferenceusa.com/sports/wgolf",
  "men:MAC": "https://getsomemaction.com/sports/mgolf",
  "women:MAC": "https://getsomemaction.com/sports/wgolf",
  "men:SUNBELT": "https://sunbeltsports.org/sports/mgolf",
  "women:SUNBELT": "https://sunbeltsports.org/sports/wgolf",
  // Big East — note men's code "BE", women's code "BEAST" in the data files.
  "men:BE": "https://www.bigeast.com/sports/mgolf",
  "women:BEAST": "https://www.bigeast.com/sports/wgolf",
  "men:WCC": "https://wccsports.com/sports/mgolf",
  "women:WCC": "https://wccsports.com/sports/wgolf",
  "men:IVY": "https://ivyleague.com/sports/mgolf",
  "women:IVY": "https://ivyleague.com/sports/wgolf",
  "men:PATRIOT": "https://patriotleague.org/sports/golf",
  "women:PATRIOT": "https://patriotleague.org/sports/golf",
  "men:SOCON": "https://soconsports.com/mgolf/",
  "women:SOCON": "https://soconsports.com/wgolf/",

  // Smaller D1 — inferred from David's [conferencedomain]/sports/{m,w}golf
  // pattern. If any conference uses a different URL shape, swap that entry.
  "men:ASUN": "https://asunsports.org/sports/mgolf",
  "women:ASUN": "https://asunsports.org/sports/wgolf",
  // Big South — men's code "BIGSOUTH", women's code "BSOUTH".
  "men:BIGSOUTH": "https://bigsouthsports.com/sports/mgolf",
  "women:BSOUTH": "https://bigsouthsports.com/sports/wgolf",
  // Big Sky — men's code "BIGSKY", women's code "BSKY".
  "men:BIGSKY": "https://bigskyconf.com/sports/mgolf",
  "women:BSKY": "https://bigskyconf.com/sports/wgolf",
  "men:BWEST": "https://bigwestsports.com/sports/mgolf",
  "women:BWEST": "https://bigwestsports.com/sports/wgolf",
  "men:CAA": "https://caasports.com/sports/mgolf",
  "women:CAA": "https://caasports.com/sports/wgolf",
  "men:HORIZON": "https://horizonleague.org/sports/mgolf",
  "women:HORIZON": "https://horizonleague.org/sports/wgolf",
  "men:MAAC": "https://maacsports.com/sports/mgolf",
  "women:MAAC": "https://maacsports.com/sports/wgolf",
  "men:MVC": "https://mvc-sports.com/sports/mgolf",
  "women:MVC": "https://mvc-sports.com/sports/wgolf",
  "men:NEC": "https://northeastconference.org/sports/mgolf",
  "women:NEC": "https://northeastconference.org/sports/wgolf",
  "men:OVC": "https://ovcsports.com/sports/mgolf",
  "women:OVC": "https://ovcsports.com/sports/wgolf",
  "men:SOUTHLAND": "https://southland.org/sports/mgolf",
  "women:SOUTHLAND": "https://southland.org/sports/wgolf",
  "men:SUMMIT": "https://thesummitleague.org/sports/mgolf",
  "women:SUMMIT": "https://thesummitleague.org/sports/wgolf",
  "men:SWAC": "https://swac.org/sports/mgolf",
  "women:SWAC": "https://swac.org/sports/wgolf",
  "men:WAC": "https://wacsports.com/sports/mgolf",
  "women:WAC": "https://wacsports.com/sports/wgolf",
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
