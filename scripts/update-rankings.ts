/**
 * Rankings Update Script
 *
 * Reads a TSV/CSV file (exported from Google Sheets or David's Excel) and
 * generates the TypeScript data files for the Next.js app.
 *
 * Usage:
 *   npx tsx scripts/update-rankings.ts --gender men --input rankings.tsv
 *   npx tsx scripts/update-rankings.ts --gender women --input rankings.tsv
 *
 * Input format (TSV with headers):
 *   rank  team  conference  events  wins  losses  ties  eligible  isAutoQualifier  aqConference  lat  lng
 *
 * The script also supports a simplified format (rank, team, conference only)
 * and will fill in defaults for missing columns.
 *
 * After running, update LAST_UPDATED in src/app/page.tsx with today's date.
 */

import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CONFERENCES = new Set([
  "SEC", "ACC", "B12", "B10", "WCC", "MWC", "AAC", "CAA",
  "SUNBELT", "ASUN", "OVC", "SOCON", "CUSA", "BWEST", "BEAST",
  "PAC12", "AMER", "MAAC", "PATRIOT", "IVY", "MEAC", "SWAC",
  "NEC", "HORIZON", "SOUTHLAND", "WAC", "SUMMIT", "BIG SKY",
]);

// Known school coordinates (campus lat/lng) — extend as needed
const SCHOOL_COORDS: Record<string, { lat: number; lng: number }> = {
  "Auburn": { lat: 32.6034, lng: -85.4808 },
  "Virginia": { lat: 38.0336, lng: -78.5080 },
  "Florida": { lat: 29.6436, lng: -82.3549 },
  "Texas": { lat: 30.2849, lng: -97.7341 },
  "Arkansas": { lat: 36.0686, lng: -94.1748 },
  "Oklahoma State": { lat: 36.1256, lng: -97.0665 },
  "LSU": { lat: 30.4133, lng: -91.1800 },
  "Texas Tech": { lat: 33.5843, lng: -101.8453 },
  "Arizona State": { lat: 33.4242, lng: -111.9281 },
  "Vanderbilt": { lat: 36.1447, lng: -86.8027 },
  "North Carolina": { lat: 35.9049, lng: -79.0469 },
  "Illinois": { lat: 40.1020, lng: -88.2272 },
  "Pepperdine": { lat: 34.0395, lng: -118.7095 },
  "Tennessee": { lat: 35.9544, lng: -83.9295 },
  "Ole Miss": { lat: 34.3655, lng: -89.5386 },
  "Oklahoma": { lat: 35.2058, lng: -97.4457 },
  "Alabama": { lat: 33.2140, lng: -87.5391 },
  "Stanford": { lat: 37.4275, lng: -122.1697 },
  "Georgia Tech": { lat: 33.7756, lng: -84.3963 },
  "New Mexico": { lat: 35.0844, lng: -106.6504 },
  "Charlotte": { lat: 35.3076, lng: -80.7334 },
  "Arizona": { lat: 32.2319, lng: -110.9501 },
  "Georgia": { lat: 33.9480, lng: -83.3773 },
  "BYU": { lat: 40.2519, lng: -111.6493 },
  "Florida State": { lat: 30.4418, lng: -84.2985 },
  "Notre Dame": { lat: 41.7056, lng: -86.2353 },
  "Duke": { lat: 36.0014, lng: -78.9382 },
  "Long Beach State": { lat: 33.7838, lng: -118.1141 },
  "Texas A&M": { lat: 30.6187, lng: -96.3365 },
  "Southern California": { lat: 34.0224, lng: -118.2851 },
  "UCLA": { lat: 34.0689, lng: -118.4452 },
  "Utah": { lat: 40.7649, lng: -111.8421 },
  "Wake Forest": { lat: 36.1335, lng: -80.2768 },
  "Louisville": { lat: 38.2116, lng: -85.7585 },
  "San Diego State": { lat: 32.7757, lng: -117.0719 },
  "Clemson": { lat: 34.6834, lng: -82.8374 },
  "South Carolina": { lat: 33.9940, lng: -81.0301 },
  "TCU": { lat: 32.7098, lng: -97.3628 },
  "Washington": { lat: 47.6553, lng: -122.3035 },
  "Kansas": { lat: 38.9543, lng: -95.2558 },
  "Purdue": { lat: 40.4237, lng: -86.9212 },
  "UNCW": { lat: 34.2274, lng: -77.8729 },
  "Northwestern": { lat: 42.0565, lng: -87.6753 },
  "Colorado": { lat: 40.0076, lng: -105.2659 },
  "SMU": { lat: 32.8432, lng: -96.7853 },
  "Arkansas State": { lat: 35.8423, lng: -90.6849 },
  "Charleston": { lat: 32.7835, lng: -79.9370 },
  "San Diego": { lat: 32.7720, lng: -117.1878 },
  "South Florida": { lat: 28.0587, lng: -82.4139 },
  "UNLV": { lat: 36.1083, lng: -115.1414 },
  "Cincinnati": { lat: 39.1329, lng: -84.5150 },
  "Kentucky": { lat: 38.0317, lng: -84.5040 },
  "Little Rock": { lat: 34.7243, lng: -92.3382 },
  "Georgia Southern": { lat: 32.4227, lng: -81.7832 },
  "Houston": { lat: 29.7199, lng: -95.3422 },
  "Florida Gulf Coast": { lat: 26.4625, lng: -81.7709 },
  "California": { lat: 37.8719, lng: -122.2585 },
  "Oregon State": { lat: 44.5646, lng: -123.2620 },
  "Mississippi State": { lat: 33.4552, lng: -88.7898 },
  "Washington State": { lat: 46.7298, lng: -117.1817 },
  "West Virginia": { lat: 39.6350, lng: -79.9545 },
  "NC State": { lat: 35.7847, lng: -78.6821 },
  "Oregon": { lat: 44.0448, lng: -123.0726 },
  "St Mary's (CA)": { lat: 37.8404, lng: -122.1140 },
  "Rice": { lat: 29.7174, lng: -95.4018 },
  "Ohio State": { lat: 40.0067, lng: -83.0305 },
  "Southern Miss": { lat: 31.3293, lng: -89.3328 },
  "Memphis": { lat: 35.1187, lng: -89.9373 },
  "Michigan State": { lat: 42.7018, lng: -84.4822 },
  "Loyola Marymount": { lat: 33.9700, lng: -118.4175 },
  "Elon": { lat: 36.1033, lng: -79.5023 },
  "Marquette": { lat: 43.0389, lng: -87.9298 },
  "South Alabama": { lat: 30.6966, lng: -88.1780 },
  "Stetson": { lat: 29.0394, lng: -81.3031 },
  "Kansas State": { lat: 39.1836, lng: -96.5717 },
  "Iowa State": { lat: 42.0267, lng: -93.6465 },
  "Chattanooga": { lat: 35.0456, lng: -85.3097 },
  "Coastal Carolina": { lat: 33.7948, lng: -79.0189 },
  "Liberty": { lat: 37.3528, lng: -79.1726 },
  "East Tennessee State": { lat: 36.3024, lng: -82.3688 },
  "Pacific": { lat: 37.9796, lng: -121.3110 },
  // Women's programs (add as needed)
  "USC": { lat: 34.0224, lng: -118.2851 },
  "Michigan": { lat: 42.2780, lng: -83.7382 },
  "Iowa": { lat: 41.6611, lng: -91.5302 },
  "Minnesota": { lat: 44.9740, lng: -93.2277 },
  "Nebraska": { lat: 40.8202, lng: -96.7005 },
  "Penn State": { lat: 40.7982, lng: -77.8599 },
  "Wisconsin": { lat: 43.0766, lng: -89.4125 },
  "Indiana": { lat: 39.1653, lng: -86.5264 },
  "Baylor": { lat: 31.5488, lng: -97.1131 },
  "Texas State": { lat: 29.8884, lng: -97.9384 },
  "Furman": { lat: 34.9252, lng: -82.4390 },
  "Denver": { lat: 39.6780, lng: -104.9618 },
  "Tulane": { lat: 29.9387, lng: -90.1226 },
  "Kent State": { lat: 41.1499, lng: -81.3421 },
  "East Carolina": { lat: 35.6066, lng: -77.3665 },
  "Campbell": { lat: 35.4103, lng: -78.8487 },
  "Kennesaw State": { lat: 34.0379, lng: -84.5811 },
  "Central Florida": { lat: 28.6024, lng: -81.2001 },
  "North Texas": { lat: 33.2068, lng: -97.1522 },
  "Boise State": { lat: 43.6021, lng: -116.2023 },
  "Florida Atlantic": { lat: 26.3718, lng: -80.1018 },
  "Old Dominion": { lat: 36.8848, lng: -76.3057 },
  "James Madison": { lat: 38.4362, lng: -78.8690 },
  "Mercer": { lat: 32.8310, lng: -83.6486 },
  "Wichita State": { lat: 37.7198, lng: -97.2951 },
};

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

interface ParsedTeam {
  rank: number;
  team: string;
  conference: string;
  events: number;
  wins: number;
  losses: number;
  ties: number;
  eligible: boolean;
  isAutoQualifier: boolean;
  aqConference: string | null;
  lat: number;
  lng: number;
}

function parseTsvOrCsv(content: string): ParsedTeam[] {
  const lines = content.trim().split("\n");
  if (lines.length < 2) {
    throw new Error("Input file must have a header row and at least one data row");
  }

  // Detect delimiter
  const headerLine = lines[0];
  const delimiter = headerLine.includes("\t") ? "\t" : ",";

  const headers = headerLine.split(delimiter).map((h) => h.trim().toLowerCase());

  const teams: ParsedTeam[] = [];
  const missingCoords: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = line.split(delimiter).map((c) => c.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] ?? "";
    });

    const teamName = row.team || row.school || row.name || "";
    if (!teamName) continue;

    const coords = SCHOOL_COORDS[teamName];
    if (!coords) {
      missingCoords.push(teamName);
    }

    teams.push({
      rank: parseInt(row.rank || row["#"] || String(i), 10),
      team: teamName,
      conference: (row.conference || row.conf || "").toUpperCase(),
      events: parseInt(row.events || row.tournaments || "0", 10),
      wins: parseInt(row.wins || row.w || "0", 10),
      losses: parseInt(row.losses || row.l || "0", 10),
      ties: parseInt(row.ties || row.t || "0", 10),
      eligible: row.eligible === "false" || row.eligible === "0" ? false : true,
      isAutoQualifier:
        row.isautoqualifier === "true" ||
        row.isautoqualifier === "1" ||
        row.aq === "true" ||
        row.aq === "1" ||
        row.type?.toUpperCase() === "AQ",
      aqConference: row.aqconference || row.aq_conference || null,
      lat: parseFloat(row.lat || "0") || coords?.lat || 0,
      lng: parseFloat(row.lng || row.lon || "0") || coords?.lng || 0,
    });
  }

  if (missingCoords.length > 0) {
    console.warn(
      `\nWARNING: Missing coordinates for ${missingCoords.length} team(s):\n` +
        missingCoords.map((t) => `  - ${t}`).join("\n") +
        "\n\nAdd coordinates to SCHOOL_COORDS in this script, or include lat/lng columns in the input file.\n"
    );
  }

  return teams;
}

// ---------------------------------------------------------------------------
// Generate
// ---------------------------------------------------------------------------

function generateTypescript(teams: ParsedTeam[], gender: "men" | "women"): string {
  const importLine =
    gender === "men"
      ? `export interface TeamData {
  rank: number;
  team: string;
  conference: string;
  events: number;
  wins: number;
  losses: number;
  ties: number;
  eligible: boolean;
  isAutoQualifier: boolean;
  aqConference: string | null;
  lat: number;
  lng: number;
}

export const rankingsMen: TeamData[] = [`
      : `import type { TeamData } from "./rankings-men";

/**
 * NCAA D1 Women's golf rankings.
 * 72 teams selected for the NCAA Championship.
 *
 * Women's NCAA selections: April 29, 2026
 * Women's regionals: May 11-13, 2026
 * Women's nationals: May 17-22, 2026
 */
export const rankingsWomen: TeamData[] = [`;

  const teamLines = teams.map((t) => {
    const aqStr = t.aqConference ? `"${t.aqConference}"` : "null";
    return `  { rank: ${t.rank}, team: "${t.team}", conference: "${t.conference}", events: ${t.events}, wins: ${t.wins}, losses: ${t.losses}, ties: ${t.ties}, eligible: ${t.eligible}, isAutoQualifier: ${t.isAutoQualifier}, aqConference: ${aqStr}, lat: ${t.lat}, lng: ${t.lng} },`;
  });

  return importLine + "\n" + teamLines.join("\n") + "\n];\n";
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const genderIdx = args.indexOf("--gender");
  const inputIdx = args.indexOf("--input");

  if (genderIdx === -1 || inputIdx === -1) {
    console.log(`
Usage: npx tsx scripts/update-rankings.ts --gender <men|women> --input <file.tsv>

Options:
  --gender   men or women
  --input    Path to TSV or CSV file with rankings data

Input columns (TSV/CSV with headers):
  Required: rank, team, conference
  Optional: events, wins, losses, ties, eligible, isAutoQualifier, aqConference, lat, lng

After running:
  1. Review the generated file in src/data/
  2. Update LAST_UPDATED in src/app/page.tsx
  3. Run 'npm run build' to verify
  4. Deploy with 'npx vercel --prod'
`);
    process.exit(1);
  }

  const gender = args[genderIdx + 1] as "men" | "women";
  const inputPath = args[inputIdx + 1];

  if (!["men", "women"].includes(gender)) {
    console.error("Error: --gender must be 'men' or 'women'");
    process.exit(1);
  }

  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(inputPath, "utf-8");
  const teams = parseTsvOrCsv(content);

  console.log(`Parsed ${teams.length} teams from ${inputPath}`);

  const ts = generateTypescript(teams, gender);
  const outFile =
    gender === "men"
      ? path.join(__dirname, "..", "src", "data", "rankings-men.ts")
      : path.join(__dirname, "..", "src", "data", "rankings-women.ts");

  fs.writeFileSync(outFile, ts, "utf-8");
  console.log(`Written to ${outFile}`);

  // Validate
  const zeroCoords = teams.filter((t) => t.lat === 0 || t.lng === 0);
  if (zeroCoords.length > 0) {
    console.warn(
      `\nWARNING: ${zeroCoords.length} team(s) have zero coordinates (distance calculations will be wrong):\n` +
        zeroCoords.map((t) => `  - ${t.team}`).join("\n")
    );
  }

  const dupes = teams.filter(
    (t, i, arr) => arr.findIndex((t2) => t2.team === t.team) !== i
  );
  if (dupes.length > 0) {
    console.warn(
      `\nWARNING: Duplicate team names found:\n` +
        dupes.map((t) => `  - ${t.team} (rank ${t.rank})`).join("\n")
    );
  }

  console.log(`\nDone! Next steps:`);
  console.log(`  1. Update LAST_UPDATED in src/app/page.tsx`);
  console.log(`  2. npm run build`);
  console.log(`  3. npx vercel --prod`);
}

main();
