import {
  MOST_RECENT_SEASON,
  computeRegionalStreak,
  computeNationalStreak,
  computeRegionalWins,
  computeAllTeamStats,
} from "../src/lib/streaks";
import { slugify, allSlugs, unslugify } from "../src/lib/team-slug";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("  ok:", msg);
  }
}

console.log(`Data range: ... ${MOST_RECENT_SEASON}`);
console.log("");

console.log("[slug] basic cases");
assert(slugify("Auburn") === "auburn", "Auburn → auburn");
assert(slugify("Brigham Young") === "brigham-young", "Brigham Young → brigham-young");
assert(slugify("Miami (OH)") === "miami-oh", "Miami (OH) → miami-oh");
assert(slugify("St. Mary's (CA)") === "st-marys-ca", "St. Mary's (CA) → st-marys-ca");
assert(slugify("Texas A&M") === "texas-a-m", "Texas A&M → texas-a-m");
assert(slugify("William & Mary") === "william-mary", "William & Mary → william-mary");
assert(slugify("Stephen F. Austin") === "stephen-f-austin", "Stephen F. Austin → stephen-f-austin");

console.log("");
console.log("[slug] round-trip");
for (const gender of ["men", "women"] as const) {
  const slugs = allSlugs(gender);
  let checked = 0;
  for (const s of slugs) {
    const name = unslugify(s, gender);
    assert(name !== null, `${gender}/${s} resolves to a team name`);
    assert(slugify(name!) === s, `${gender}: slugify(unslugify(${s})) === ${s}`);
    checked += 1;
    if (checked >= 5) break;
  }
  console.log(`  (${slugs.length} ${gender} slugs, all unique by construction)`);
}

console.log("");
console.log("[streaks] spot-check");
const oklaSt = computeRegionalStreak("Oklahoma State", "men");
console.log(
  `  Oklahoma State men regional streak: active=${oklaSt.active}, longest=${oklaSt.longest} (${oklaSt.longestSpan?.join("-")})`
);
// Pre-fix this asserted >=5 because the COVID 2020 gap broke every streak
// at five. Post-fix, OK State men have a deep multi-decade run.
assert(oklaSt.longest >= 24, "Oklahoma State men have a 24+-year regional streak (COVID gap bridged)");
assert(oklaSt.active >= 24, "Oklahoma State men's active streak spans the COVID gap");

const auburnNat = computeNationalStreak("Auburn", "men");
console.log(
  `  Auburn men nationals streak: active=${auburnNat.active}, longest=${auburnNat.longest}`
);

const okSt = computeRegionalWins("Oklahoma State", "men");
console.log(`  Oklahoma State men regional wins: ${okSt}`);
assert(okSt > 0, "Oklahoma State has won at least one regional");

console.log("");
console.log("[aggregate] computeAllTeamStats");
const all = computeAllTeamStats();
console.log(`  Total team/gender rows: ${all.length}`);
assert(all.length > 100, "at least 100 distinct team/gender combos");
const withActiveStreak = all.filter((t) => t.regionalStreak.active > 0);
console.log(`  Teams with active regional streak: ${withActiveStreak.length}`);
const topWins = [...all].sort((a, b) => b.regionalWins - a.regionalWins).slice(0, 5);
console.log("  Top-5 regional wins:");
for (const t of topWins) {
  console.log(`    ${t.team} (${t.gender}): ${t.regionalWins}`);
}

console.log("");
console.log(process.exitCode ? "FAIL" : "PASS");
