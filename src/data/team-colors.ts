/**
 * Hand-curated primary colors + monogram initials for a subset of D1 golf
 * programs. Colors are school-primary tones drawn from publicly published
 * identity guides (e.g., sports-reference / Wikipedia school infoboxes).
 * Initials are 2-4 uppercase letters that read as the school's short form
 * (e.g., "Notre Dame" → "ND", "Southern California" → "USC").
 *
 * Unmapped teams render with a neutral-gray fallback and the first 3 letters
 * of the team name. Extend this list as traffic patterns reveal which
 * teams deserve curation.
 */

export interface TeamBrand {
  /** Primary color, hex. */
  primary: string;
  /** Text color for initials. Defaults to white; override for light bgs. */
  text?: string;
  /** 2–4 letter label rendered in the monogram. */
  initials: string;
}

export const TEAM_BRANDS: Record<string, TeamBrand> = {
  // SEC
  "Alabama": { primary: "#9E1B32", initials: "BAMA" },
  "Arkansas": { primary: "#9D2235", initials: "ARK" },
  "Auburn": { primary: "#0C2340", initials: "AUB" },
  "Florida": { primary: "#FA4616", initials: "FLA" },
  "Georgia": { primary: "#BA0C2F", initials: "UGA" },
  "Kentucky": { primary: "#0033A0", initials: "UK" },
  "LSU": { primary: "#461D7C", initials: "LSU" },
  "Mississippi State": { primary: "#660000", initials: "MSU" },
  "Missouri": { primary: "#000000", initials: "MIZ" },
  "Oklahoma": { primary: "#841617", initials: "OU" },
  "Ole Miss": { primary: "#CE1126", initials: "MISS" },
  "South Carolina": { primary: "#73000A", initials: "SC" },
  "Tennessee": { primary: "#FF8200", text: "#ffffff", initials: "TENN" },
  "Texas": { primary: "#BF5700", initials: "TEX" },
  "Texas A&M": { primary: "#500000", initials: "A&M" },
  "Vanderbilt": { primary: "#000000", text: "#C9AE8C", initials: "VAN" },

  // ACC
  "Boston College": { primary: "#862633", initials: "BC" },
  "California": { primary: "#003262", initials: "CAL" },
  "Clemson": { primary: "#F56600", initials: "CLEM" },
  "Duke": { primary: "#00539B", initials: "DUKE" },
  "Florida State": { primary: "#782F40", initials: "FSU" },
  "Georgia Tech": { primary: "#B3A369", text: "#003057", initials: "GT" },
  "Louisville": { primary: "#AD0000", initials: "LOU" },
  "Miami (FL)": { primary: "#F47321", initials: "MIA" },
  "NC State": { primary: "#CC0000", initials: "NCST" },
  "North Carolina": { primary: "#7BAFD4", text: "#13294B", initials: "UNC" },
  "Notre Dame": { primary: "#0C2340", text: "#C99700", initials: "ND" },
  "Pittsburgh": { primary: "#003594", text: "#FFB81C", initials: "PITT" },
  "SMU": { primary: "#0033A0", initials: "SMU" },
  "Stanford": { primary: "#8C1515", initials: "STAN" },
  "Syracuse": { primary: "#F76900", initials: "SYR" },
  "Virginia": { primary: "#232D4B", text: "#E57200", initials: "UVA" },
  "Virginia Tech": { primary: "#630031", text: "#CF4420", initials: "VT" },
  "Wake Forest": { primary: "#000000", text: "#9E7E38", initials: "WAKE" },

  // Big Ten
  "Illinois": { primary: "#13294B", text: "#E84A27", initials: "ILL" },
  "Indiana": { primary: "#990000", initials: "IU" },
  "Iowa": { primary: "#000000", text: "#FFCD00", initials: "IOWA" },
  "Maryland": { primary: "#E03A3E", text: "#FFD520", initials: "MD" },
  "Michigan": { primary: "#00274C", text: "#FFCB05", initials: "MICH" },
  "Michigan State": { primary: "#18453B", initials: "MSU" },
  "Minnesota": { primary: "#7A0019", text: "#FFCC33", initials: "MINN" },
  "Nebraska": { primary: "#E41C38", initials: "NEB" },
  "Northwestern": { primary: "#4E2A84", initials: "NU" },
  "Ohio State": { primary: "#BB0000", initials: "OSU" },
  "Oregon": { primary: "#154733", text: "#FEE123", initials: "ORE" },
  "Penn State": { primary: "#041E42", initials: "PSU" },
  "Purdue": { primary: "#000000", text: "#CEB888", initials: "PUR" },
  "Rutgers": { primary: "#CC0033", initials: "RU" },
  "UCLA": { primary: "#2774AE", text: "#FFD100", initials: "UCLA" },
  "USC": { primary: "#990000", text: "#FFC72C", initials: "USC" },
  "Washington": { primary: "#4B2E83", text: "#B7A57A", initials: "UW" },
  "Wisconsin": { primary: "#C5050C", initials: "WIS" },

  // Big 12
  "Arizona": { primary: "#CC0033", text: "#003366", initials: "ARIZ" },
  "Arizona State": { primary: "#8C1D40", text: "#FFC627", initials: "ASU" },
  "Baylor": { primary: "#154734", text: "#FFB81C", initials: "BU" },
  "BYU": { primary: "#002E5D", initials: "BYU" },
  "Cincinnati": { primary: "#E00122", initials: "CIN" },
  "Colorado": { primary: "#000000", text: "#CFB87C", initials: "COLO" },
  "Houston": { primary: "#C8102E", initials: "UH" },
  "Iowa State": { primary: "#C8102E", text: "#F1BE48", initials: "ISU" },
  "Kansas": { primary: "#0051BA", text: "#E8000D", initials: "KU" },
  "Kansas State": { primary: "#512888", initials: "KSU" },
  "Oklahoma State": { primary: "#FA6400", initials: "OKST" },
  "TCU": { primary: "#4D1979", initials: "TCU" },
  "Texas Tech": { primary: "#CC0000", initials: "TTU" },
  "UCF": { primary: "#000000", text: "#BA9B37", initials: "UCF" },
  "Utah": { primary: "#CC0000", initials: "UTAH" },
  "West Virginia": { primary: "#EAAA00", text: "#002855", initials: "WVU" },

  // Notable non-Power
  "Liberty": { primary: "#002D62", text: "#9E1B32", initials: "LIB" },
  "Pepperdine": { primary: "#00205B", text: "#F58025", initials: "PEP" },
  "San Diego State": { primary: "#A6192E", text: "#000000", initials: "SDSU" },
  "San Francisco": { primary: "#00543C", text: "#FFCD00", initials: "USF" },
  "Santa Clara": { primary: "#AA0000", initials: "SCU" },
  "Southern Methodist": { primary: "#0033A0", initials: "SMU" },
  "UNLV": { primary: "#B10202", text: "#666666", initials: "UNLV" },
  "USF": { primary: "#006747", text: "#CFC493", initials: "USF" },
  "UT-Arlington": { primary: "#0064B1", initials: "UTA" },
  "Wichita State": { primary: "#FFCD00", text: "#000000", initials: "WSU" },
  "Wyoming": { primary: "#492F24", text: "#FFC425", initials: "WYO" },
};

function stripCommonPrefixes(team: string): string {
  return team
    .replace(/^University of\s+/i, "")
    .replace(/^The\s+/i, "")
    .trim();
}

function fallbackInitials(team: string): string {
  const clean = stripCommonPrefixes(team);
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    // Multi-word: first letter of first 2–4 words.
    return words
      .slice(0, 4)
      .map((w) => w[0])
      .join("")
      .toUpperCase();
  }
  // Single word: first 3 letters.
  return clean.slice(0, 3).toUpperCase();
}

/** Look up a team's monogram. Always returns a brand (with fallback). */
export function getTeamBrand(team: string): TeamBrand {
  const hit = TEAM_BRANDS[team];
  if (hit) return hit;
  return {
    primary: "#2A2A30",
    text: "#B8B8C0",
    initials: fallbackInitials(team),
  };
}
