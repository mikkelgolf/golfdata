/**
 * audit-team-coords.ts
 *
 * Cross-checks each team's stored lat/lng against the school's state (from
 * supabase-schools.json). Any coordinate outside its state's bounding box is
 * flagged as a confirmed bug. Prints a Markdown table for human review.
 *
 * Does NOT modify any data files.
 *
 * Run: npx tsx scripts/audit-team-coords.ts
 */
import fs from "node:fs";
import path from "node:path";

import { rankingsMen } from "../src/data/rankings-men";
import { rankingsWomen } from "../src/data/rankings-women";
import { allTeamsMen2026 } from "../src/data/all-teams-men-2026";
import { allTeamsWomen2026 } from "../src/data/all-teams-women-2026";

interface School {
  school_name: string;
  city: string;
  state: string;
  has_mens_golf: boolean;
  has_womens_golf: boolean;
}

const schools: School[] = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "cache/supabase-schools.json"),
    "utf-8",
  ),
);

// ---- US state bounding boxes (approximate, generous) --------------------
// Format: [minLat, maxLat, minLng, maxLng]
const stateBbox: Record<string, [number, number, number, number]> = {
  AL: [30.1, 35.1, -88.6, -84.8],
  AK: [51.0, 71.5, -180, -130],
  AZ: [31.3, 37.1, -114.9, -109.0],
  AR: [33.0, 36.6, -94.7, -89.6],
  CA: [32.5, 42.1, -124.5, -114.1],
  CO: [36.9, 41.1, -109.1, -102.0],
  CT: [40.9, 42.1, -73.8, -71.7],
  DE: [38.4, 39.9, -75.8, -74.9],
  DC: [38.7, 39.0, -77.2, -76.9],
  FL: [24.4, 31.1, -87.7, -79.9],
  GA: [30.3, 35.1, -85.7, -80.7],
  HI: [18.8, 22.3, -160.3, -154.7],
  ID: [41.9, 49.1, -117.3, -110.9],
  IL: [36.9, 42.6, -91.6, -87.4],
  IN: [37.7, 41.8, -88.2, -84.7],
  IA: [40.3, 43.6, -96.7, -90.1],
  KS: [36.9, 40.1, -102.1, -94.5],
  KY: [36.4, 39.2, -89.7, -81.9],
  LA: [28.8, 33.1, -94.1, -88.8],
  ME: [42.9, 47.6, -71.2, -66.8],
  MD: [37.8, 39.8, -79.6, -75.0],
  MA: [41.2, 42.9, -73.6, -69.8],
  MI: [41.6, 48.4, -90.5, -82.1],
  MN: [43.4, 49.5, -97.3, -89.4],
  MS: [30.1, 35.1, -91.7, -88.0],
  MO: [35.9, 40.7, -95.8, -89.0],
  MT: [44.2, 49.1, -116.1, -104.0],
  NE: [39.9, 43.1, -104.1, -95.2],
  NV: [35.0, 42.1, -120.1, -114.0],
  NH: [42.6, 45.4, -72.7, -70.6],
  NJ: [38.8, 41.4, -75.6, -73.8],
  NM: [31.2, 37.1, -109.1, -102.9],
  NY: [40.4, 45.1, -79.8, -71.8],
  NC: [33.7, 36.7, -84.4, -75.4],
  ND: [45.8, 49.1, -104.1, -96.5],
  OH: [38.3, 42.1, -84.9, -80.4],
  OK: [33.5, 37.1, -103.1, -94.3],
  OR: [41.9, 46.3, -124.6, -116.3],
  PA: [39.6, 42.4, -80.6, -74.5],
  RI: [41.0, 42.1, -71.9, -71.0],
  SC: [32.0, 35.3, -83.4, -78.4],
  SD: [42.4, 45.9, -104.1, -96.3],
  TN: [34.9, 36.7, -90.4, -81.5],
  TX: [25.7, 36.6, -106.7, -93.4],
  UT: [36.9, 42.1, -114.1, -108.9],
  VT: [42.6, 45.1, -73.5, -71.4],
  VA: [36.4, 39.6, -83.7, -75.2],
  WA: [45.4, 49.1, -124.9, -116.8],
  WV: [37.1, 40.8, -82.7, -77.6],
  WI: [42.4, 47.1, -92.9, -86.6],
  WY: [40.9, 45.1, -111.1, -103.9],
};

// ---- Name normalization & matching -------------------------------------

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[.'’]/g, "")
    .replace(/[-/,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Manual alias table. Maps team-name-as-it-appears-in-data-files →
// school_name as it appears in supabase-schools.json.
const aliases: Record<string, string> = {
  "SIU Edwardsville": "Southern Illinois University-Edwardsville",
  "SIU Carbondale": "Southern Illinois University-Carbondale",
  "Southern Illinois": "Southern Illinois University-Carbondale",
  "Idaho": "University of Idaho",
  "Idaho State": "Idaho State University",
  "Hawaii": "University of Hawaii at Manoa",
  "Loyola Maryland": "Loyola University Maryland",
  "Loyola Marymount": "Loyola Marymount University",
  "Loyola (IL)": "Loyola University Chicago",
  "Long Island": "Long Island University",
  "Miami (FL)": "University of Miami",
  "Miami (OH)": "Miami University-Oxford",
  "Miami (Ohio)": "Miami University-Oxford",
  "Utah Tech": "Utah Tech University",
  "West Georgia": "University of West Georgia",
  "UT Arlington": "The University of Texas at Arlington",
  "UT Martin": "The University of Tennessee at Martin",
  "UT Rio Grande Valley": "The University of Texas Rio Grande Valley",
  "UTRGV": "The University of Texas Rio Grande Valley",
  "UTSA": "The University of Texas at San Antonio",
  "UTEP": "The University of Texas at El Paso",
  "UMass": "University of Massachusetts-Amherst",
  "UMass Lowell": "University of Massachusetts-Lowell",
  "UMBC": "University of Maryland-Baltimore County",
  "UMKC": "University of Missouri-Kansas City",
  "UMES": "University of Maryland Eastern Shore",
  "UNLV": "University of Nevada-Las Vegas",
  "UNI": "University of Northern Iowa",
  "UNCW": "University of North Carolina Wilmington",
  "UNCG": "University of North Carolina at Greensboro",
  "UNC Asheville": "University of North Carolina Asheville",
  "UNC Greensboro": "University of North Carolina at Greensboro",
  "UNC Wilmington": "University of North Carolina Wilmington",
  "Charlotte": "University of North Carolina at Charlotte",
  "UCF": "University of Central Florida",
  "UCSB": "University of California-Santa Barbara",
  "UCSC": "University of California-Santa Cruz",
  "UCSD": "University of California-San Diego",
  "UC San Diego": "University of California-San Diego",
  "UCLA": "University of California-Los Angeles",
  "UC Davis": "University of California-Davis",
  "UC Irvine": "University of California-Irvine",
  "UC Riverside": "University of California-Riverside",
  "USC": "University of Southern California",
  "USC Upstate": "University of South Carolina-Upstate",
  "USF": "University of South Florida",
  "BYU": "Brigham Young University",
  "TCU": "Texas Christian University",
  "SMU": "Southern Methodist University",
  "FIU": "Florida International University",
  "Florida Intl.": "Florida International University",
  "FAU": "Florida Atlantic University",
  "FGCU": "Florida Gulf Coast University",
  "LSU": "Louisiana State University and Agricultural & Mechanical College",
  "NJIT": "New Jersey Institute of Technology",
  "NC State": "North Carolina State University at Raleigh",
  "North Carolina A&T": "North Carolina Agricultural and Technical State University",
  "NC A&T": "North Carolina Agricultural and Technical State University",
  "N. Carolina Central": "North Carolina Central University",
  "NC Central": "North Carolina Central University",
  "ETSU": "East Tennessee State University",
  "VCU": "Virginia Commonwealth University",
  "VMI": "Virginia Military Institute",
  "BU": "Boston University",
  "Boston": "Boston University",
  "IUPUI": "Indiana University-Purdue University-Indianapolis",
  "IU Indy": "Indiana University-Indianapolis",
  "CSU Bakersfield": "California State University-Bakersfield",
  "CSU Fullerton": "California State University-Fullerton",
  "CSUN": "California State University-Northridge",
  "CSU Northridge": "California State University-Northridge",
  "Cal Poly": "California Polytechnic State University-San Luis Obispo",
  "Cal State Fullerton": "California State University-Fullerton",
  "Cal State Northridge": "California State University-Northridge",
  "Cal Baptist": "California Baptist University",
  "Cal": "University of California-Berkeley",
  "California": "University of California-Berkeley",
  "Cal State LA": "California State University-Los Angeles",
  "Cal State East Bay": "California State University-East Bay",
  "Texas A&M": "Texas A & M University-College Station",
  "Texas A&M-C. Christi": "Texas A & M University-Corpus Christi",
  "Texas A&M Corpus Christi": "Texas A & M University-Corpus Christi",
  "Texas A&M-Commerce": "East Texas A&M University",
  "East Texas A&M": "East Texas A&M University",
  "Prairie View A&M": "Prairie View A & M University",
  "Alabama A&M": "Alabama A & M University",
  "Florida A&M": "Florida A & M University",
  "Houston Christian": "Houston Christian University",
  "Sam Houston": "Sam Houston State University",
  "Stephen F. Austin": "Stephen F Austin State University",
  "Mississippi State": "Mississippi State University",
  "Ole Miss": "University of Mississippi",
  "Penn State": "Pennsylvania State University-Main Campus",
  "Saint Louis": "Saint Louis University",
  "Saint Mary's": "Saint Mary's College of California",
  "St. Mary's (CA)": "Saint Mary's College of California",
  "St. John's": "St. John's University-New York",
  "St. Thomas (MN)": "University of St. Thomas",
  "St. Francis (PA)": "Saint Francis University",
  "Saint Francis": "Saint Francis University",
  "St. Bonaventure": "St. Bonaventure University",
  "Mount St. Mary's": "Mount St. Mary's University",
  "Saint Joseph's (PA)": "Saint Joseph's University",
  "Saint Joseph's": "Saint Joseph's University",
  "Holy Cross (MA)": "College of the Holy Cross",
  "William & Mary": "William & Mary",
  "Rhode Island": "University of Rhode Island",
  "Pittsburgh": "University of Pittsburgh-Pittsburgh Campus",
  "Oklahoma State": "Oklahoma State University-Main Campus",
  "Ohio State": "Ohio State University-Main Campus",
  "Arizona State": "Arizona State University Campus Immersion",
  "Louisville": "University of Louisville",
  "Louisiana": "University of Louisiana at Lafayette",
  "Louisiana Monroe": "University of Louisiana at Monroe",
  "ULM": "University of Louisiana at Monroe",
  "Appalachian State": "Appalachian State University",
  "Eastern Michigan": "Eastern Michigan University",
  "Western Michigan": "Western Michigan University",
  "Central Michigan": "Central Michigan University",
  "Northern Illinois": "Northern Illinois University",
  "Illinois State": "Illinois State University",
  "Eastern Illinois": "Eastern Illinois University",
  "Western Illinois": "Western Illinois University",
  "Colorado State": "Colorado State University-Fort Collins",
  "Weber State": "Weber State University",
  "Portland State": "Portland State University",
  "Sacramento State": "California State University-Sacramento",
  "Sac State": "California State University-Sacramento",
  "Nicholls State": "Nicholls State University",
  "Nicholls": "Nicholls State University",
  "Alcorn State": "Alcorn State University",
  "Jackson State": "Jackson State University",
  "Mississippi Valley State": "Mississippi Valley State University",
  "Alabama State": "Alabama State University",
  "Grambling": "Grambling State University",
  "Southern": "Southern University and A & M College",
  "Texas Southern": "Texas Southern University",
  "Bethune-Cookman": "Bethune-Cookman University",
  "South Carolina State": "South Carolina State University",
  "Howard": "Howard University",
  "Hampton": "Hampton University",
  "Coppin State": "Coppin State University",
  "Morgan State": "Morgan State University",
  "Delaware State": "Delaware State University",
  "Norfolk State": "Norfolk State University",
  "Savannah State": "Savannah State University",
  "Kentucky State": "Kentucky State University",
  "Chicago State": "Chicago State University",
  "Cleveland State": "Cleveland State University",
  "Tennessee State": "Tennessee State University",
  "Tennessee Tech": "Tennessee Technological University",
  "Louisiana Tech": "Louisiana Tech University",
  "Virginia Tech": "Virginia Polytechnic Institute and State University",
  "Texas Tech": "Texas Tech University",
  "Georgia Tech": "Georgia Institute of Technology-Main Campus",
  "Harvard": "Harvard University",
  "Yale": "Yale University",
  "Princeton": "Princeton University",
  "Brown": "Brown University",
  "Columbia": "Columbia University in the City of New York",
  "Cornell": "Cornell University",
  "Dartmouth": "Dartmouth College",
  "Penn": "University of Pennsylvania",
  "Duke": "Duke University",
  "Stanford": "Stanford University",
  "Vanderbilt": "Vanderbilt University",
  "Rice": "William Marsh Rice University",
  "Baylor": "Baylor University",
  "Creighton": "Creighton University",
  "Drake": "Drake University",
  "Marquette": "Marquette University",
  "Butler": "Butler University",
  "Xavier": "Xavier University",
  "Gonzaga": "Gonzaga University",
  "Villanova": "Villanova University",
  "Georgetown": "Georgetown University",
  "DePaul": "DePaul University",
  "Northwestern": "Northwestern University",
  "Notre Dame": "University of Notre Dame",
  "Wake Forest": "Wake Forest University",
  "Davidson": "Davidson College",
  "Furman": "Furman University",
  "Samford": "Samford University",
  "Mercer": "Mercer University",
  "Belmont": "Belmont University",
  "Lipscomb": "Lipscomb University",
  "Campbell": "Campbell University",
  "Jacksonville": "Jacksonville University",
  "Stetson": "Stetson University",
  "Liberty": "Liberty University",
  "Radford": "Radford University",
  "Longwood": "Longwood University",
  "High Point": "High Point University",
  "Gardner-Webb": "Gardner-Webb University",
  "Charleston Southern": "Charleston Southern University",
  "Presbyterian": "Presbyterian College",
  "Wofford": "Wofford College",
  "The Citadel": "The Citadel",
  "Citadel": "The Citadel",
  "Elon": "Elon University",
  "Winthrop": "Winthrop University",
  "Kennesaw State": "Kennesaw State University",
  "Georgia Southern": "Georgia Southern University",
  "Georgia State": "Georgia State University",
  "Augusta": "Augusta University",
  "Columbus State": "Columbus State University",
  "Troy": "Troy University",
  "South Alabama": "University of South Alabama",
  "North Alabama": "University of North Alabama",
  "Jacksonville State": "Jacksonville State University",
  "Jax State": "Jacksonville State University",
  "UAH": "University of Alabama in Huntsville",
  "UAB": "University of Alabama at Birmingham",
  "UTC": "University of Tennessee at Chattanooga",
  "Chattanooga": "University of Tennessee at Chattanooga",
  "Austin Peay": "Austin Peay State University",
  "Murray State": "Murray State University",
  "Eastern Kentucky": "Eastern Kentucky University",
  "Western Kentucky": "Western Kentucky University",
  "Morehead State": "Morehead State University",
  "Bellarmine": "Bellarmine University",
  "Northern Kentucky": "Northern Kentucky University",
  "NKU": "Northern Kentucky University",
  "Cincinnati": "University of Cincinnati-Main Campus",
  "Dayton": "University of Dayton",
  "Toledo": "University of Toledo",
  "Akron": "University of Akron Main Campus",
  "Bowling Green": "Bowling Green State University-Main Campus",
  "Kent State": "Kent State University at Kent",
  "Youngstown State": "Youngstown State University",
  "Wright State": "Wright State University-Main Campus",
  "Oakland": "Oakland University",
  "Detroit Mercy": "University of Detroit Mercy",
  "Green Bay": "University of Wisconsin-Green Bay",
  "Milwaukee": "University of Wisconsin-Milwaukee",
  "Northern Iowa": "University of Northern Iowa",
  "Iowa State": "Iowa State University",
  "Kansas State": "Kansas State University",
  "Wichita State": "Wichita State University",
  "Missouri State": "Missouri State University-Springfield",
  "Southeast Missouri": "Southeast Missouri State University",
  "SEMO": "Southeast Missouri State University",
  "Omaha": "University of Nebraska at Omaha",
  "South Dakota": "University of South Dakota",
  "South Dakota State": "South Dakota State University",
  "North Dakota": "University of North Dakota",
  "North Dakota State": "North Dakota State University",
  "Denver": "University of Denver",
  "Air Force": "United States Air Force Academy",
  "Army": "United States Military Academy",
  "Navy": "United States Naval Academy",
  "Army West Point": "United States Military Academy",
  "Colgate": "Colgate University",
  "Bucknell": "Bucknell University",
  "Lafayette": "Lafayette College",
  "Lehigh": "Lehigh University",
  "Boston College": "Boston College",
  "Fordham": "Fordham University",
  "Rider": "Rider University",
  "Monmouth": "Monmouth University",
  "Wagner": "Wagner College",
  "Robert Morris": "Robert Morris University",
  "Duquesne": "Duquesne University",
  "La Salle": "La Salle University",
  "LaSalle": "La Salle University",
  "Drexel": "Drexel University",
  "Temple": "Temple University",
  "Delaware": "University of Delaware",
  "Binghamton": "Binghamton University",
  "Albany": "University at Albany",
  "Stony Brook": "Stony Brook University",
  "Buffalo": "University at Buffalo",
  "Siena": "Siena College",
  "Marist": "Marist College",
  "Iona": "Iona University",
  "Quinnipiac": "Quinnipiac University",
  "Sacred Heart": "Sacred Heart University",
  "Central Connecticut": "Central Connecticut State University",
  "Bryant": "Bryant University",
  "Maine": "University of Maine",
  "New Hampshire": "University of New Hampshire-Main Campus",
  "Hartford": "University of Hartford",
  "Vermont": "University of Vermont",
  "UConn": "University of Connecticut",
  "Northeastern": "Northeastern University",
  "Providence": "Providence College",
  "Central Arkansas": "University of Central Arkansas",
  "Arkansas State": "Arkansas State University",
  "Little Rock": "University of Arkansas at Little Rock",
  "Kansas": "University of Kansas",
  "Oklahoma": "University of Oklahoma-Norman Campus",
  "Texas": "The University of Texas at Austin",
  "Texas State": "Texas State University",
  "North Texas": "University of North Texas",
  "Lamar": "Lamar University",
  "Incarnate Word": "University of the Incarnate Word",
  "Abilene Christian": "Abilene Christian University",
  "New Orleans": "University of New Orleans",
  "Northwestern State": "Northwestern State University of Louisiana",
  "SE Louisiana": "Southeastern Louisiana University",
  "McNeese": "McNeese State University",
  "Tulane": "Tulane University of Louisiana",
  "Montana": "University of Montana",
  "Montana State": "Montana State University",
  "Wyoming": "University of Wyoming",
  "Utah": "The University of Utah",
  "Utah State": "Utah State University",
  "Utah Valley": "Utah Valley University",
  "New Mexico": "University of New Mexico-Main Campus",
  "New Mexico State": "New Mexico State University-Main Campus",
  "Arizona": "University of Arizona",
  "Grand Canyon": "Grand Canyon University",
  "Northern Arizona": "Northern Arizona University",
  "Nevada": "University of Nevada-Reno",
  "San Diego State": "San Diego State University",
  "San Jose State": "San Jose State University",
  "San Diego": "University of San Diego",
  "San Francisco": "University of San Francisco",
  "Pacific": "University of the Pacific",
  "Pepperdine": "Pepperdine University",
  "Santa Clara": "Santa Clara University",
  "Fresno State": "California State University-Fresno",
  "Oregon": "University of Oregon",
  "Oregon State": "Oregon State University",
  "Washington": "University of Washington-Seattle Campus",
  "Washington State": "Washington State University",
  "Seattle U": "Seattle University",
  "Portland": "University of Portland",
  "Eastern Washington": "Eastern Washington University",
  "Boise State": "Boise State University",
  "Northern Colorado": "University of Northern Colorado",
  "Colorado": "University of Colorado Boulder",
  "Ohio": "Ohio University-Main Campus",
  "Ball State": "Ball State University",
  "Indiana": "Indiana University-Bloomington",
  "Purdue": "Purdue University-Main Campus",
  "Purdue Fort Wayne": "Purdue University Fort Wayne",
  "Evansville": "University of Evansville",
  "Indiana State": "Indiana State University",
  "Valparaiso": "Valparaiso University",
  "Iowa": "University of Iowa",
  "Missouri": "University of Missouri-Columbia",
  "Kentucky": "University of Kentucky",
  "Tennessee": "The University of Tennessee-Knoxville",
  "Florida": "University of Florida",
  "Florida State": "Florida State University",
  "Alabama": "The University of Alabama",
  "Auburn": "Auburn University",
  "Georgia": "University of Georgia",
  "Clemson": "Clemson University",
  "South Carolina": "University of South Carolina-Columbia",
  "Virginia": "University of Virginia",
  "North Carolina": "The University of North Carolina at Chapel Hill",
  "Maryland": "University of Maryland-College Park",
  "Rutgers": "Rutgers University-New Brunswick",
  "Michigan": "University of Michigan-Ann Arbor",
  "Michigan State": "Michigan State University",
  "Minnesota": "University of Minnesota-Twin Cities",
  "Nebraska": "University of Nebraska-Lincoln",
  "Illinois": "University of Illinois Urbana-Champaign",
  "Wisconsin": "University of Wisconsin-Madison",
  "Syracuse": "Syracuse University",
  "Old Dominion": "Old Dominion University",
  "James Madison": "James Madison University",
  "George Mason": "George Mason University",
  "George Washington": "George Washington University",
  "American": "American University",
  "Towson": "Towson University",
  "Memphis": "The University of Memphis",
  "Arkansas": "University of Arkansas",
  "Houston": "University of Houston",
  "Tarleton": "Tarleton State University",
  "Tarleton State": "Tarleton State University",
  "Le Moyne": "Le Moyne College",
  "Queens (NC)": "Queens University of Charlotte",
  "Lindenwood": "Lindenwood University",
  "Central Florida": "University of Central Florida",
  "Florida Southern": "Florida Southern College",
  "Florida Gulf Coast": "Florida Gulf Coast University",
  "South Florida": "University of South Florida",
  "Merrimack": "Merrimack College",
  "Charleston": "College of Charleston",
  "UIC": "University of Illinois at Chicago",
  "West Virginia": "West Virginia University",
};

// Build normalized name lookup
const schoolByNormName = new Map<string, School>();
for (const s of schools) {
  schoolByNormName.set(normalize(s.school_name), s);
}

function findSchool(team: string): School | null {
  if (aliases[team]) {
    const s = schoolByNormName.get(normalize(aliases[team]));
    if (s) return s;
  }
  const exact = schoolByNormName.get(normalize(team));
  if (exact) return exact;
  return null;
}

// ---- Ingest team coords --------------------------------------------------

interface Row {
  team: string;
  lat: number;
  lng: number;
  sources: Set<string>;
}
const byTeam = new Map<string, Row>();
function ingest(team: string, lat: number, lng: number, src: string) {
  const prev = byTeam.get(team);
  if (prev) {
    prev.sources.add(src);
    if (prev.lat === 0 && prev.lng === 0 && !(lat === 0 && lng === 0)) {
      prev.lat = lat;
      prev.lng = lng;
    }
  } else {
    byTeam.set(team, { team, lat, lng, sources: new Set([src]) });
  }
}
for (const t of rankingsMen) ingest(t.team, t.lat, t.lng, "rankings-men");
for (const t of rankingsWomen) ingest(t.team, t.lat, t.lng, "rankings-women");
for (const t of allTeamsMen2026) ingest(t.team, t.lat, t.lng, "all-teams-men");
for (const t of allTeamsWomen2026)
  ingest(t.team, t.lat, t.lng, "all-teams-women");

// ---- Audit: flag coords outside their school's state bbox ----------------

interface Issue {
  team: string;
  currentLat: number;
  currentLng: number;
  city: string;
  state: string;
  sources: string;
}

const issues: Issue[] = [];
const unmatched: Row[] = [];
const noStateBbox: { team: string; state: string }[] = [];

for (const r of byTeam.values()) {
  if (r.lat === 0 && r.lng === 0) continue; // known-missing, not wrong
  const school = findSchool(r.team);
  if (!school) {
    unmatched.push(r);
    continue;
  }
  const bbox = stateBbox[school.state];
  if (!bbox) {
    noStateBbox.push({ team: r.team, state: school.state });
    continue;
  }
  const [minLat, maxLat, minLng, maxLng] = bbox;
  const inside =
    r.lat >= minLat && r.lat <= maxLat && r.lng >= minLng && r.lng <= maxLng;
  if (!inside) {
    issues.push({
      team: r.team,
      currentLat: r.lat,
      currentLng: r.lng,
      city: school.city,
      state: school.state,
      sources: [...r.sources].join(","),
    });
  }
}

issues.sort((a, b) => (a.state + a.team).localeCompare(b.state + b.team));

console.log(`\n# Team coordinate audit\n`);
console.log(
  `Scanned ${byTeam.size} unique team names. Flagging any whose stored coord falls outside the school's state bounding box (state from supabase-schools.json).\n`,
);
console.log(`## Confirmed bugs (${issues.length})\n`);
if (issues.length === 0) {
  console.log("None.\n");
} else {
  console.log(
    "| Team | Current (lat, lng) | Expected location | Sources |",
  );
  console.log("| --- | --- | --- | --- |");
  for (const i of issues) {
    console.log(
      `| ${i.team} | ${i.currentLat.toFixed(4)}, ${i.currentLng.toFixed(4)} | ${i.city}, ${i.state} | ${i.sources} |`,
    );
  }
  console.log();
}

console.log(
  `## Unmatched team names (${unmatched.length}) — no alias / school_name match, skipped\n`,
);
for (const r of unmatched) {
  console.log(`- ${r.team}  (coord: ${r.lat.toFixed(4)}, ${r.lng.toFixed(4)})`);
}

if (noStateBbox.length) {
  console.log(
    `\n## Missing state bbox (${noStateBbox.length}) — probably non-US or unexpected state code\n`,
  );
  for (const x of noStateBbox) console.log(`- ${x.team} (state=${x.state})`);
}
