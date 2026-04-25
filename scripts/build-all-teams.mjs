#!/usr/bin/env node
// Build src/data/all-teams-{men,women}-2026.ts from the latest Clippd JSON.
//
// This script is the source of truth for the Conference Championships page.
// It pulls every D1 team from the cached Clippd scrape, resolves coordinates
// via a 4-tier fallback chain (campus → Supabase city/state + Census centroid
// → manual override → none), and emits TypeScript data files matching the
// existing rankings-men.ts shape.
//
// SAFETY: This script is strictly READ-ONLY against the caddie-project
// Supabase. It only ever calls the Supabase REST endpoint with GET. Any
// attempt to call POST/PATCH/DELETE will throw immediately. The schools
// and teams tables are populated weekly from BigQuery via mikkel-system —
// manual writes would be overwritten anyway.
//
// Usage:
//   node scripts/build-all-teams.mjs
//   node scripts/build-all-teams.mjs --refresh-supabase
//   node scripts/build-all-teams.mjs --refresh-census
//   node scripts/build-all-teams.mjs --refresh-supabase --refresh-census

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");
const CACHE_DIR = join(REPO_ROOT, "scripts", "cache");
const DATA_DIR = join(REPO_ROOT, "src", "data");

const argv = new Set(process.argv.slice(2));
const REFRESH_SUPABASE = argv.has("--refresh-supabase");
const REFRESH_CENSUS = argv.has("--refresh-census");

// ---------------------------------------------------------------------------
// SAFETY: read-only HTTP wrapper
// ---------------------------------------------------------------------------
async function safeGet(url, headers = {}) {
  const resp = await fetch(url, { method: "GET", headers });
  if (!resp.ok) {
    throw new Error(`GET ${url.slice(0, 80)}... failed: ${resp.status} ${resp.statusText}`);
  }
  return resp;
}

// ---------------------------------------------------------------------------
// Load .env from mikkel-system (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
// ---------------------------------------------------------------------------
function loadMikkelSystemEnv() {
  const envPath = join(process.env.HOME, "projects", "mikkel-system", ".env");
  if (!existsSync(envPath)) {
    throw new Error(`Cannot find ${envPath}`);
  }
  const text = readFileSync(envPath, "utf8");
  const env = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    env[key] = value;
  }
  return env;
}

// ---------------------------------------------------------------------------
// Find newest Clippd JSON
// ---------------------------------------------------------------------------
function findNewestClippdJson() {
  const dir = join(REPO_ROOT, "data", "clippd");
  const files = readdirSync(dir).filter((f) => /^rankings-\d{4}-\d{2}-\d{2}\.json$/.test(f));
  files.sort();
  if (files.length === 0) throw new Error("No rankings-*.json in data/clippd/");
  return join(dir, files[files.length - 1]);
}

// ---------------------------------------------------------------------------
// Conference codes (mirror of src/data/conference-codes.ts to keep this
// script dependency-free; kept in sync by hand)
// ---------------------------------------------------------------------------
const SHARED_CONF = {
  "Southeastern Conference": "SEC",
  "Atlantic Coast Conference": "ACC",
  "Big 12 Conference": "B12",
  "Big Ten Conference": "B10",
  "American Athletic Conference": "AAC",
  "Mountain West Conference": "MWC",
  "West Coast Conference": "WCC",
  "Big West Conference": "BWEST",
  "Atlantic 10 Conference": "A10",
  "Missouri Valley Conference": "MVC",
  "ASUN Conference": "ASUN",
  "Sun Belt Conference": "SUNBELT",
  "Conference USA": "CUSA",
  "Southern Conference": "SOCON",
  "Ohio Valley Conference": "OVC",
  "Coastal Athletic Association": "CAA",
  "Patriot League": "PATRIOT",
  "The Ivy League": "IVY",
  "Northeast Conference": "NEC",
  "NEC - Northeast Conference": "NEC",
  "Metro Atlantic Athletic Conference": "MAAC",
  "Mid-American Conference": "MAC",
  "Southwestern Athletic Conference": "SWAC",
  "The Summit League": "SUMMIT",
  "Western Athletic Conference": "WAC",
  "Horizon League": "HORIZON",
  "Southland Conference": "SOUTHLAND",
  "": null,
};
const CONF_MEN = {
  ...SHARED_CONF,
  "Big East Conference": "BE",
  "Big Sky Conference": "BIGSKY",
  "Big Sky": "BIGSKY",
  "Big South Conference": "BIGSOUTH",
};
const CONF_WOMEN = {
  ...SHARED_CONF,
  "Big East Conference": "BEAST",
  "Big Sky Conference": "BSKY",
  "Big Sky": "BSKY",
  "Big South Conference": "BSOUTH",
  "Northeast Women's Golf Conference": "NEC",
};

function normalizeConference(fullName, gender) {
  const map = gender === "men" ? CONF_MEN : CONF_WOMEN;
  const trimmed = (fullName || "").trim();
  if (trimmed in map) return map[trimmed];
  return null;
}

// ---------------------------------------------------------------------------
// Campus-precise SCHOOL_COORDS (union of update-rankings.ts and
// scrape-clippd-teams.ts, deduped). Keyed by Clippd `boardName`.
// ---------------------------------------------------------------------------
const CAMPUS_COORDS = {
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
  "Ohio State": { lat: 40.0067, lng: -83.0305 },
  "Oregon": { lat: 44.0448, lng: -123.0726 },
  "Oregon State": { lat: 44.5646, lng: -123.2620 },
  "Michigan": { lat: 42.2780, lng: -83.7382 },
  "Michigan State": { lat: 42.7018, lng: -84.4822 },
  "Baylor": { lat: 31.5497, lng: -97.1143 },
  "San Jose State": { lat: 37.3382, lng: -121.8863 },
  "UNLV": { lat: 36.1083, lng: -115.1390 },
  "Minnesota": { lat: 44.9740, lng: -93.2277 },
  "Iowa": { lat: 41.6611, lng: -91.5302 },
  "SMU": { lat: 32.8428, lng: -96.7835 },
  "UCF": { lat: 28.6024, lng: -81.2001 },
  "Memphis": { lat: 35.1175, lng: -89.9372 },
  "NC State": { lat: 35.7872, lng: -78.6706 },
  "East Tennessee State": { lat: 36.3032, lng: -82.3678 },
  "Mississippi State": { lat: 33.4557, lng: -88.7890 },
  "Arkansas State": { lat: 35.8423, lng: -90.6849 },
  "Charleston": { lat: 32.7835, lng: -79.9370 },
  "San Diego": { lat: 32.7720, lng: -117.1878 },
  "South Florida": { lat: 28.0587, lng: -82.4139 },
  "Cincinnati": { lat: 39.1329, lng: -84.5150 },
  "Kentucky": { lat: 38.0317, lng: -84.5040 },
  "Little Rock": { lat: 34.7243, lng: -92.3382 },
  "Georgia Southern": { lat: 32.4227, lng: -81.7832 },
  "Houston": { lat: 29.7199, lng: -95.3422 },
  "Florida Gulf Coast": { lat: 26.4625, lng: -81.7709 },
  "California": { lat: 37.8719, lng: -122.2585 },
  "Washington State": { lat: 46.7298, lng: -117.1817 },
  "West Virginia": { lat: 39.6350, lng: -79.9545 },
  "St Mary's (CA)": { lat: 37.8404, lng: -122.1140 },
  "Rice": { lat: 29.7174, lng: -95.4018 },
  "Southern Miss": { lat: 31.3293, lng: -89.3328 },
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
  "Pacific": { lat: 37.9796, lng: -121.3110 },
  "Nebraska": { lat: 40.8202, lng: -96.7005 },
  "Penn State": { lat: 40.7982, lng: -77.8599 },
  "Wisconsin": { lat: 43.0766, lng: -89.4125 },
  "Indiana": { lat: 39.1653, lng: -86.5264 },
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
  "Hawaii": { lat: 21.2972, lng: -157.8167 },
  "CSU Northridge": { lat: 34.2381, lng: -118.5290 },  // Northridge, CA — avoids geocoder collision with Northridge, Nova Scotia
};

// ---------------------------------------------------------------------------
// boardName aliases — Clippd uses one form, our SCHOOL_COORDS uses another.
// ---------------------------------------------------------------------------
const BOARDNAME_ALIASES = {
  "USC": "Southern California",
  "UNC": "North Carolina",
  "Brigham Young": "BYU",
  "St. Mary's (CA)": "St Mary's (CA)",
  "Saint Mary's (CA)": "St Mary's (CA)",
  "UC San Diego": "San Diego",
  "Cal": "California",
  "UMass": "Massachusetts",
  "Pitt": "Pittsburgh",
  "UConn": "Connecticut",
  "Mississippi": "Ole Miss",
};

// ---------------------------------------------------------------------------
// Manual coordinate overrides for schools whose Clippd name doesn't match
// Supabase or whose city/state isn't resolvable. Keyed by Clippd boardName.
// Coordinates are campus-precise from Google Maps.
// ---------------------------------------------------------------------------
const MANUAL_OVERRIDES = {
  "Southern Illinois": { lat: 37.7099, lng: -89.2186 },        // Carbondale, IL
  "Maryland": { lat: 38.9869, lng: -76.9426 },                  // College Park, MD
  "Nevada": { lat: 39.5450, lng: -119.8146 },                   // Reno, NV
  "Louisiana": { lat: 30.2138, lng: -92.0181 },                 // Lafayette, LA (UL Lafayette)
  "Virginia Tech": { lat: 37.2296, lng: -80.4139 },             // Blacksburg, VA
  "UNCG": { lat: 36.0626, lng: -79.8074 },                      // Greensboro, NC
  "William & Mary": { lat: 37.2710, lng: -76.7075 },            // Williamsburg, VA
  "Colorado State": { lat: 40.5734, lng: -105.0865 },           // Fort Collins, CO
  "Miami (OH)": { lat: 39.5070, lng: -84.7350 },                // Oxford, OH
  "Sam Houston": { lat: 30.7136, lng: -95.5499 },               // Huntsville, TX
  "Fresno State": { lat: 36.8133, lng: -119.7456 },             // Fresno, CA
  "Cal Poly": { lat: 35.3050, lng: -120.6625 },                 // San Luis Obispo, CA
  "UT Martin": { lat: 36.3409, lng: -88.8508 },                 // Martin, TN
  "Navy": { lat: 38.9844, lng: -76.4870 },                      // Annapolis, MD
  "St. John's": { lat: 40.7223, lng: -73.7937 },                // Queens, NY
  "St. Thomas (MN)": { lat: 44.9415, lng: -93.1856 },           // St. Paul, MN
  "ULM": { lat: 32.5304, lng: -92.0763 },                       // Monroe, LA
  "Wright State": { lat: 39.7805, lng: -84.0639 },              // Dayton, OH (Fairborn)
  "Army West Point": { lat: 41.3812, lng: -73.9747 },           // West Point, NY
  "North Carolina A&T": { lat: 36.0721, lng: -79.7720 },        // Greensboro, NC
  "LaSalle": { lat: 40.0418, lng: -75.1522 },                   // Philadelphia, PA
  "Florida A&M": { lat: 30.4239, lng: -84.2876 },               // Tallahassee, FL
  "Saint Joseph's (PA)": { lat: 40.0354, lng: -75.2435 },       // Philadelphia, PA
  "Columbia": { lat: 40.8075, lng: -73.9626 },                  // New York, NY
  "Purdue Fort Wayne": { lat: 41.0828, lng: -85.1290 },         // Fort Wayne, IN
  "FDU": { lat: 40.7575, lng: -74.4118 },                       // Madison, NJ
  "IU Indy": { lat: 39.7754, lng: -86.1816 },                   // Indianapolis, IN
  "Air Force": { lat: 38.9956, lng: -104.8615 },                // Colorado Springs, CO
  "Missouri State": { lat: 37.2010, lng: -93.2810 },            // Springfield, MO
  "Prairie View A&M": { lat: 30.0883, lng: -95.9881 },          // Prairie View, TX
  "Arkansas-Pine Bluff": { lat: 34.2715, lng: -91.9819 },       // Pine Bluff, AR
  "Alabama A&M": { lat: 34.7831, lng: -86.5712 },               // Huntsville, AL
  "Southern": { lat: 30.5247, lng: -91.1969 },                  // Baton Rouge, LA
  "Miami": { lat: 25.7174, lng: -80.2792 },                     // Coral Gables, FL (women's: U of Miami)
  "Montana State": { lat: 45.6669, lng: -111.0429 },            // Bozeman, MT
  "Akron": { lat: 41.0763, lng: -81.5102 },                     // Akron, OH
  "Texas A&M-C. Christi": { lat: 27.7136, lng: -97.3258 },      // Corpus Christi, TX
  "The Citadel": { lat: 32.7960, lng: -79.9613 },               // Charleston, SC
};

// ---------------------------------------------------------------------------
// Step 1: Load Clippd JSON
// ---------------------------------------------------------------------------
function loadClippd() {
  const path = findNewestClippdJson();
  console.log(`📂 Reading Clippd JSON: ${path}`);
  const data = JSON.parse(readFileSync(path, "utf8"));
  console.log(`   pulled at: ${data.pulledAt}`);
  console.log(`   season:    ${data.season}`);
  console.log(`   men:       ${data.men.length} teams`);
  console.log(`   women:     ${data.women.length} teams`);
  return { data, sourceFile: path };
}

// ---------------------------------------------------------------------------
// Step 2: Pull Supabase schools (or load cache)
// ---------------------------------------------------------------------------
async function loadSupabaseSchools() {
  const cachePath = join(CACHE_DIR, "supabase-schools.json");
  if (!REFRESH_SUPABASE && existsSync(cachePath)) {
    console.log(`📂 Reading Supabase schools cache: ${cachePath}`);
    return JSON.parse(readFileSync(cachePath, "utf8"));
  }
  console.log("🌐 Pulling schools from Supabase (read-only)...");
  const env = loadMikkelSystemEnv();
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL/SERVICE_KEY missing in mikkel-system .env");
  if (!url.startsWith("https://")) throw new Error(`SUPABASE_URL must be https://: ${url.slice(0, 30)}...`);

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
    "Accept-Profile": "public",
  };

  // Pull in pages of 1000 (Supabase default cap)
  const all = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const endpoint =
      `${url}/rest/v1/schools` +
      `?select=unitid,school_name,city,state,has_mens_golf,has_womens_golf` +
      `&or=(has_mens_golf.eq.true,has_womens_golf.eq.true)`;
    const pageHeaders = { ...headers, Range: `${from}-${from + PAGE - 1}` };
    const resp = await safeGet(endpoint, pageHeaders);
    const rows = await resp.json();
    all.push(...rows);
    console.log(`   fetched ${rows.length} rows (offset ${from}, total so far ${all.length})`);
    if (rows.length < PAGE) break;
    from += PAGE;
    if (from > 20000) throw new Error("safety: pagination loop exceeded 20k rows");
  }

  writeFileSync(cachePath, JSON.stringify(all, null, 2));
  console.log(`💾 Cached ${all.length} schools to ${cachePath}`);
  return all;
}

// ---------------------------------------------------------------------------
// Step 3: Geocode unique (city, state) pairs via Photon (Komoot, OSM-based)
// Photon is free, no API key, no strict rate limit. Be polite (~5 req/s).
// ---------------------------------------------------------------------------
async function loadCityCentroids(schools) {
  const cachePath = join(CACHE_DIR, "city-centroids.json");
  let cache = {};
  if (!REFRESH_CENSUS && existsSync(cachePath)) {
    console.log(`📂 Reading city centroids cache: ${cachePath}`);
    cache = JSON.parse(readFileSync(cachePath, "utf8"));
  }

  // Build deduplicated list of (city, state) we still need (or that previously failed)
  const needed = new Set();
  for (const s of schools) {
    if (!s.city || !s.state) continue;
    const key = `${s.city}|${s.state}`;
    if (cache[key] == null) needed.add(key);
  }

  if (needed.size === 0) {
    const ok = Object.values(cache).filter((v) => v != null).length;
    console.log(`   ${ok}/${Object.keys(cache).length} cities already cached, no fetches needed`);
    return cache;
  }

  console.log(`🌐 Geocoding ${needed.size} cities via Photon (OSM)...`);
  let i = 0;
  for (const key of needed) {
    i++;
    const [city, state] = key.split("|");
    // Photon takes a free-text query. "City, ST, USA" works well.
    const q = `${city}, ${state}, USA`;
    const url =
      `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1` +
      `&osm_tag=place:city&osm_tag=place:town&osm_tag=place:village`;
    try {
      const resp = await safeGet(url, { Accept: "application/json" });
      const json = await resp.json();
      const features = json?.features ?? [];
      // Pick first feature whose state matches (Photon sometimes returns same-name cities in other states)
      const stateName = US_STATE_NAMES[state] || state;
      const match = features.find(
        (f) => f.properties?.country === "United States" && (f.properties?.state === stateName || f.properties?.state === state)
      ) || features[0];
      if (match) {
        const [lng, lat] = match.geometry.coordinates;
        cache[key] = { lat: Number(lat), lng: Number(lng) };
      } else {
        // Retry without the strict tag filter (some are villages/hamlets)
        const fallback = await safeGet(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1`,
          { Accept: "application/json" }
        );
        const fjson = await fallback.json();
        const ff = fjson?.features?.[0];
        if (ff) {
          const [lng, lat] = ff.geometry.coordinates;
          cache[key] = { lat: Number(lat), lng: Number(lng) };
        } else {
          cache[key] = null;
        }
      }
    } catch (e) {
      console.warn(`   ⚠️  geocode failed for ${q}: ${e.message}`);
      cache[key] = null;
    }
    if (i % 25 === 0) {
      const ok = Object.values(cache).filter((v) => v != null).length;
      console.log(`   ${i}/${needed.size}... (${ok} resolved so far)`);
      writeFileSync(cachePath, JSON.stringify(cache, null, 2));
    }
    // ~5 req/s pacing
    await new Promise((r) => setTimeout(r, 200));
  }
  writeFileSync(cachePath, JSON.stringify(cache, null, 2));
  const okFinal = Object.values(cache).filter((v) => v != null).length;
  console.log(`💾 Cached ${okFinal}/${Object.keys(cache).length} city centroids to ${cachePath}`);
  return cache;
}

// ---------------------------------------------------------------------------
// US state code -> full name (Photon returns full state names)
// ---------------------------------------------------------------------------
const US_STATE_NAMES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  PR: "Puerto Rico",
};

// ---------------------------------------------------------------------------
// Step 4: Build a Clippd schoolName → Supabase school_name index
// (normalized name → school row)
// ---------------------------------------------------------------------------
function normalizeSchoolName(s) {
  return s
    .toLowerCase()
    .replace(/\buniversity of\b/g, "")
    .replace(/\bthe\s+/g, "")
    .replace(/\buniversity\b/g, "")
    .replace(/\bcollege\b/g, "")
    .replace(/[,.()'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSchoolIndex(schools) {
  const idx = new Map();
  for (const s of schools) {
    if (!s.school_name) continue;
    const norm = normalizeSchoolName(s.school_name);
    // First entry wins on collision (Supabase has stub Canadian schools after the ~4000 mark)
    if (!idx.has(norm)) idx.set(norm, s);
  }
  return idx;
}

// ---------------------------------------------------------------------------
// Step 5: Resolve coordinates per Clippd team
// ---------------------------------------------------------------------------
function resolveCoords(team, schoolIdx, cityCentroids, diagnostics) {
  // Tier 1: campus precision via boardName
  const board = team.boardName || team.schoolName;
  if (board in CAMPUS_COORDS) {
    return { lat: CAMPUS_COORDS[board].lat, lng: CAMPUS_COORDS[board].lng, source: "campus" };
  }
  // Tier 1b: alias
  const aliased = BOARDNAME_ALIASES[board];
  if (aliased && aliased in CAMPUS_COORDS) {
    return { lat: CAMPUS_COORDS[aliased].lat, lng: CAMPUS_COORDS[aliased].lng, source: "alias" };
  }
  // Tier 2: Supabase schools by full schoolName + Census city centroid
  const norm = normalizeSchoolName(team.schoolName);
  const school = schoolIdx.get(norm);
  if (school && school.city && school.state) {
    const key = `${school.city}|${school.state}`;
    const centroid = cityCentroids[key];
    if (centroid) {
      return { lat: centroid.lat, lng: centroid.lng, source: "city" };
    }
    diagnostics.cityMissing.push({
      team: board,
      schoolName: team.schoolName,
      conference: team.conference,
      city: school.city,
      state: school.state,
    });
  } else {
    diagnostics.schoolUnmatched.push({
      team: board,
      schoolName: team.schoolName,
      conference: team.conference,
      normalized: norm,
    });
  }
  // Tier 3: manual override
  if (board in MANUAL_OVERRIDES) {
    const m = MANUAL_OVERRIDES[board];
    return { lat: m.lat, lng: m.lng, source: "manual" };
  }
  // Tier 4: skip
  return { lat: 0, lng: 0, source: "none" };
}

// ---------------------------------------------------------------------------
// Step 6: Parse winLossTie ("119-19-2")
// ---------------------------------------------------------------------------
function parseWLT(s) {
  if (!s) return { wins: 0, losses: 0, ties: 0 };
  const m = String(s).match(/(\d+)-(\d+)-(\d+)/);
  if (!m) return { wins: 0, losses: 0, ties: 0 };
  return { wins: Number(m[1]), losses: Number(m[2]), ties: Number(m[3]) };
}

function isEligible(wins, losses, ties) {
  const total = wins + losses + ties;
  if (total === 0) return false;
  return (wins + ties * 0.5) / total >= 0.5;
}

// ---------------------------------------------------------------------------
// Step 7: Build per-gender team rows
// ---------------------------------------------------------------------------
function buildTeams(rawTeams, gender, schoolIdx, cityCentroids, diagnostics) {
  const out = [];
  const droppedNoConf = [];
  const seenBoardNames = new Set();
  const collisions = [];

  for (const t of rawTeams) {
    const conf = normalizeConference(t.conference, gender);
    if (conf === null) {
      droppedNoConf.push({ team: t.boardName, schoolName: t.schoolName, conference: t.conference });
      continue;
    }
    const board = t.boardName || t.schoolName;
    if (seenBoardNames.has(board)) {
      collisions.push(board);
    }
    seenBoardNames.add(board);

    const wlt = parseWLT(t.winLossTie);
    const eligible = isEligible(wlt.wins, wlt.losses, wlt.ties);
    const coords = resolveCoords(t, schoolIdx, cityCentroids, diagnostics);

    out.push({
      rank: Number(t.rank),
      team: board,
      conference: conf,
      events: Number(t.strokePlayEvents ?? 0) + Number(t.matchPlayEvents ?? 0),
      wins: wlt.wins,
      losses: wlt.losses,
      ties: wlt.ties,
      eligible,
      isAutoQualifier: false,
      aqConference: null,
      lat: coords.lat,
      lng: coords.lng,
      _coordSource: coords.source,
    });
  }

  out.sort((a, b) => a.rank - b.rank);
  diagnostics.droppedNoConf.push(...droppedNoConf);
  if (collisions.length > 0) {
    console.warn(`   ⚠️  ${collisions.length} boardName collisions in ${gender}: ${collisions.slice(0, 5).join(", ")}`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Step 8: Emit TS data file
// ---------------------------------------------------------------------------
function emitDataFile(teams, gender, generatedAt, sourceFile) {
  const path = join(DATA_DIR, `all-teams-${gender}-2026.ts`);
  const lines = [];
  lines.push(`// AUTO-GENERATED by scripts/build-all-teams.mjs — do not edit by hand.`);
  lines.push(`// Source: ${sourceFile.replace(REPO_ROOT + "/", "")}`);
  lines.push(`// Run \`npm run build:teams\` to refresh after a Clippd pull.`);
  lines.push(`//`);
  lines.push(`// ${teams.length} D1 ${gender}'s golf teams. Coordinates resolved via:`);
  lines.push(`//   1) campus-precise SCHOOL_COORDS lookup`);
  lines.push(`//   2) Supabase schools city/state + Census Geocoding centroid`);
  lines.push(`//   3) {lat:0,lng:0} for unresolved (rendered in cards but not on map)`);
  lines.push(``);
  lines.push(`import type { TeamData } from "@/data/rankings-men";`);
  lines.push(``);
  lines.push(`export const ALL_TEAMS_GENERATED_AT = "${generatedAt}";`);
  lines.push(``);
  lines.push(`export const allTeams${gender === "men" ? "Men" : "Women"}2026: TeamData[] = [`);
  for (const t of teams) {
    const escapedTeam = JSON.stringify(t.team);
    lines.push(
      `  { rank: ${t.rank}, team: ${escapedTeam}, conference: ${JSON.stringify(t.conference)}, events: ${t.events}, wins: ${t.wins}, losses: ${t.losses}, ties: ${t.ties}, eligible: ${t.eligible}, isAutoQualifier: false, aqConference: null, lat: ${t.lat}, lng: ${t.lng} },`
    );
  }
  lines.push(`];`);
  lines.push(``);
  writeFileSync(path, lines.join("\n"));
  console.log(`💾 Wrote ${teams.length} teams to ${path}`);
}

// ---------------------------------------------------------------------------
// Step 9: Coverage summary
// ---------------------------------------------------------------------------
function summary(teamsMen, teamsWomen, diagnostics) {
  console.log("");
  console.log("📊 Coverage summary");
  for (const [label, teams] of [["men", teamsMen], ["women", teamsWomen]]) {
    const total = teams.length;
    const counts = { campus: 0, alias: 0, city: 0, manual: 0, none: 0 };
    for (const t of teams) counts[t._coordSource]++;
    console.log(`   ${label}: ${total} teams`);
    console.log(`     campus: ${counts.campus} (${pct(counts.campus, total)}%)`);
    console.log(`     alias:  ${counts.alias} (${pct(counts.alias, total)}%)`);
    console.log(`     city:   ${counts.city} (${pct(counts.city, total)}%)`);
    console.log(`     manual: ${counts.manual} (${pct(counts.manual, total)}%)`);
    console.log(`     none:   ${counts.none} (${pct(counts.none, total)}%)`);
  }

  console.log("");
  if (diagnostics.droppedNoConf.length > 0) {
    console.log(`⚠️  ${diagnostics.droppedNoConf.length} teams dropped (no conference mapping):`);
    for (const d of diagnostics.droppedNoConf.slice(0, 10)) {
      console.log(`     ${d.team} — "${d.conference}"`);
    }
    if (diagnostics.droppedNoConf.length > 10) console.log(`     ... and ${diagnostics.droppedNoConf.length - 10} more`);
  }
  if (diagnostics.schoolUnmatched.length > 0) {
    console.log(`⚠️  ${diagnostics.schoolUnmatched.length} teams couldn't match Supabase school_name:`);
    for (const d of diagnostics.schoolUnmatched.slice(0, 10)) {
      console.log(`     ${d.team} (${d.schoolName}) → norm "${d.normalized}"`);
    }
    if (diagnostics.schoolUnmatched.length > 10) console.log(`     ... and ${diagnostics.schoolUnmatched.length - 10} more`);
  }
  if (diagnostics.cityMissing.length > 0) {
    console.log(`⚠️  ${diagnostics.cityMissing.length} teams matched Supabase but city centroid is missing:`);
    for (const d of diagnostics.cityMissing.slice(0, 10)) {
      console.log(`     ${d.team} → ${d.city}, ${d.state}`);
    }
  }
  // Persist diagnostics
  const diagPath = join(CACHE_DIR, "match-diagnostics.json");
  writeFileSync(diagPath, JSON.stringify(diagnostics, null, 2));
  console.log(`💾 Diagnostics: ${diagPath}`);
}

function pct(n, total) {
  if (total === 0) return "0";
  return ((n / total) * 100).toFixed(0);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const { data, sourceFile } = loadClippd();
  const schools = await loadSupabaseSchools();
  const cityCentroids = await loadCityCentroids(schools);
  const schoolIdx = buildSchoolIndex(schools);

  const diagnostics = { droppedNoConf: [], schoolUnmatched: [], cityMissing: [] };

  const menD1 = data.men.filter((t) => t.division === "NCAA Division I");
  const womenD1 = data.women.filter((t) => t.division === "NCAA Division I");

  console.log("");
  console.log(`🏗  Building men's data file (${menD1.length} teams)...`);
  const teamsMen = buildTeams(menD1, "men", schoolIdx, cityCentroids, diagnostics);
  console.log(`🏗  Building women's data file (${womenD1.length} teams)...`);
  const teamsWomen = buildTeams(womenD1, "women", schoolIdx, cityCentroids, diagnostics);

  // Strip _coordSource before emitting
  const cleanMen = teamsMen.map(({ _coordSource, ...rest }) => rest);
  const cleanWomen = teamsWomen.map(({ _coordSource, ...rest }) => rest);

  // Use Clippd's `rankingDate` (when Clippd actually published the snapshot)
  // rather than `pulledAt` (when our cron ran). The two diverge whenever we
  // pull on a day Clippd hasn't refreshed yet, and the user-facing "Updated"
  // line should match what Clippd shows on their site. Falls back to pulledAt
  // and then to today as a defensive last resort.
  //
  // NOTE: Clippd serializes rankingDate as a naive datetime ("2026-04-24T01:24:34")
  // with no timezone marker. JS would parse that as local time and then drift the
  // calendar date when we convert to UTC. Slice the string directly to keep the
  // calendar date Clippd intended.
  const sampleRankingDate =
    data.women?.[0]?.rankingDate ?? data.men?.[0]?.rankingDate ?? null;
  const generatedAt = sampleRankingDate
    ? sampleRankingDate.slice(0, 10)
    : data.pulledAt
      ? new Date(data.pulledAt).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

  emitDataFile(cleanMen, "men", generatedAt, sourceFile);
  emitDataFile(cleanWomen, "women", generatedAt, sourceFile);

  summary(teamsMen, teamsWomen, diagnostics);
  console.log("");
  console.log("✅ Done.");
}

main().catch((err) => {
  console.error("❌", err);
  process.exit(1);
});
