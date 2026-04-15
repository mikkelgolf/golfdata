/**
 * Regional Preview Content Generator
 *
 * Computes the S-curve assignments and generates rich markdown previews
 * for each regional. These previews can be published alongside the dashboard.
 *
 * Usage:
 *   npx tsx scripts/generate-regional-previews.ts --gender men
 *   npx tsx scripts/generate-regional-previews.ts --gender women
 *   npx tsx scripts/generate-regional-previews.ts --gender both
 *
 * Output: markdown files in previews/ directory, one per regional.
 */

import * as fs from "fs";
import * as path from "path";

// We can't directly import .ts data files from scripts easily,
// so we duplicate the essential types and load data inline.
// In production, this would import from src/data/ and src/lib/.

// ---------------------------------------------------------------------------
// Types (mirrored from src/)
// ---------------------------------------------------------------------------

interface TeamData {
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

interface Regional {
  id: number;
  name: string;
  host: string;
  city: string;
  lat: number;
  lng: number;
  color: string;
}

interface ScurveAssignment extends TeamData {
  seed: number;
  regionalId: number;
  distanceMiles: number;
}

// ---------------------------------------------------------------------------
// Haversine (copied from src/lib/geo.ts)
// ---------------------------------------------------------------------------

function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// AQ derivation (top-ranked team per conference = predicted champion)
// ---------------------------------------------------------------------------

function deriveAutoQualifiers(teams: TeamData[]): TeamData[] {
  const topByConf = new Map<string, number>();
  for (let i = 0; i < teams.length; i++) {
    const cur = topByConf.get(teams[i].conference);
    if (cur === undefined || teams[i].rank < teams[cur].rank) {
      topByConf.set(teams[i].conference, i);
    }
  }
  return teams.map((t, i) => ({
    ...t,
    isAutoQualifier: topByConf.get(t.conference) === i,
    aqConference: topByConf.get(t.conference) === i ? t.conference : null,
  }));
}

// ---------------------------------------------------------------------------
// S-curve computation (simplified committee mode)
// ---------------------------------------------------------------------------

function computeCommitteeScurve(
  teams: TeamData[],
  regionals: Regional[]
): ScurveAssignment[] {
  const teamsWithAqs = deriveAutoQualifiers(teams);
  const numR = regionals.length;
  const eligible = teamsWithAqs.filter((t) => t.eligible || t.isAutoQualifier);
  const regionalMap = new Map(regionals.map((r) => [r.id, r]));

  const assignments: ScurveAssignment[] = eligible.map((team, i) => ({
    ...team,
    seed: i + 1,
    regionalId: -1,
    distanceMiles: 0,
  }));

  const hostToRegional = new Map<string, number>();
  for (const r of regionals) hostToRegional.set(r.host, r.id);

  // Phase 1: Top seeds to closest regional
  const topSeeds = assignments.slice(0, numR);
  const available = new Set(regionals.map((r) => r.id));

  for (const team of topSeeds) {
    const homeId = hostToRegional.get(team.team);
    if (homeId !== undefined && available.has(homeId)) {
      team.regionalId = homeId;
      available.delete(homeId);
    }
  }

  const unassigned = topSeeds.filter((t) => t.regionalId === -1);
  unassigned.sort((a, b) => a.seed - b.seed);

  for (const team of unassigned) {
    let bestId = -1;
    let bestDist = Infinity;
    for (const rId of available) {
      const r = regionalMap.get(rId)!;
      const d = haversineDistance(team.lat, team.lng, r.lat, r.lng);
      if (d < bestDist) {
        bestDist = d;
        bestId = rId;
      }
    }
    team.regionalId = bestId;
    available.delete(bestId);
  }

  // Phase 2: Serpentine for seeds 7+ (hosts placed first, rest fill in S-curve order)
  const strengthOrder = assignments
    .slice(0, numR)
    .sort((a, b) => a.seed - b.seed)
    .map((a) => a.regionalId);

  for (let tier = 1; tier * numR < assignments.length; tier++) {
    const tierStart = tier * numR;
    const tierEnd = Math.min(tierStart + numR, assignments.length);
    const isReverseTier = tier % 2 === 1;

    const tierRegionalOrder: number[] = [];
    for (let p = 0; p < numR; p++) {
      const idx = isReverseTier ? numR - 1 - p : p;
      tierRegionalOrder.push(strengthOrder[idx]);
    }

    const hostAssignedRegionals = new Set<number>();
    for (let i = tierStart; i < tierEnd; i++) {
      const homeId = hostToRegional.get(assignments[i].team);
      if (homeId !== undefined) {
        assignments[i].regionalId = homeId;
        hostAssignedRegionals.add(homeId);
      }
    }

    const remainingRegionals = tierRegionalOrder.filter(
      (r) => !hostAssignedRegionals.has(r)
    );
    let rIdx = 0;
    for (let i = tierStart; i < tierEnd; i++) {
      if (assignments[i].regionalId !== -1) continue;
      assignments[i].regionalId = remainingRegionals[rIdx++];
    }
  }

  // Phase 4: Geographic preference for regional position 12+
  for (let i = numR; i < assignments.length; i++) {
    const team = assignments[i];
    const tier = Math.floor(i / numR);
    const regionalPosition = tier + 1;
    if (regionalPosition < 12) continue;
    if (team.lat === 0 && team.lng === 0) continue;
    const r = regionalMap.get(team.regionalId)!;
    const dist = haversineDistance(team.lat, team.lng, r.lat, r.lng);
    if (dist <= 1200) continue;

    const tStart = tier * numR;
    const tEnd = Math.min(tStart + numR, assignments.length);
    let bestJ = -1;
    let bestImpr = 0;

    for (let j = tStart; j < tEnd; j++) {
      if (j === i) continue;
      const other = assignments[j];
      if (hostToRegional.has(other.team) && hostToRegional.get(other.team) === other.regionalId)
        continue;
      const otherR = regionalMap.get(other.regionalId)!;
      const teamToOther = haversineDistance(team.lat, team.lng, otherR.lat, otherR.lng);
      const otherToTeam = haversineDistance(other.lat, other.lng, r.lat, r.lng);
      const impr = dist - teamToOther;
      const penalty =
        otherToTeam - haversineDistance(other.lat, other.lng, otherR.lat, otherR.lng);
      if (impr > 200 && impr > penalty && impr > bestImpr) {
        bestJ = j;
        bestImpr = impr;
      }
    }

    if (bestJ !== -1) {
      const tmp = assignments[bestJ].regionalId;
      assignments[bestJ].regionalId = team.regionalId;
      team.regionalId = tmp;
    }
  }

  // Calculate distances
  for (const a of assignments) {
    const r = regionalMap.get(a.regionalId)!;
    a.distanceMiles = Math.round(haversineDistance(a.lat, a.lng, r.lat, r.lng));
  }

  return assignments;
}

// ---------------------------------------------------------------------------
// Preview generation
// ---------------------------------------------------------------------------

interface RegionalPreviewData {
  regional: Regional;
  teams: ScurveAssignment[];
  advancing: ScurveAssignment[];
  eliminated: ScurveAssignment[];
  avgDistance: number;
  maxDistance: { team: string; miles: number };
  minDistance: { team: string; miles: number };
  conferences: Map<string, number>;
  autoQualifiers: ScurveAssignment[];
  hostTeam: ScurveAssignment | undefined;
  topSeed: ScurveAssignment;
}

function analyzeRegional(
  regional: Regional,
  assignments: ScurveAssignment[]
): RegionalPreviewData {
  const teams = assignments
    .filter((a) => a.regionalId === regional.id)
    .sort((a, b) => a.seed - b.seed);

  const advancing = teams.slice(0, 5);
  const eliminated = teams.slice(5);

  const distances = teams.map((t) => t.distanceMiles);
  const avgDistance = Math.round(distances.reduce((a, b) => a + b, 0) / distances.length);

  const farthest = teams.reduce((a, b) => (a.distanceMiles > b.distanceMiles ? a : b));
  const closest = teams.reduce((a, b) => (a.distanceMiles < b.distanceMiles ? a : b));

  const conferences = new Map<string, number>();
  for (const t of teams) {
    conferences.set(t.conference, (conferences.get(t.conference) ?? 0) + 1);
  }

  const autoQualifiers = teams.filter((t) => t.isAutoQualifier);
  const hostTeam = teams.find((t) => t.team === regional.host);

  return {
    regional,
    teams,
    advancing,
    eliminated,
    avgDistance,
    maxDistance: { team: farthest.team, miles: farthest.distanceMiles },
    minDistance: { team: closest.team, miles: closest.distanceMiles },
    conferences,
    autoQualifiers,
    hostTeam,
    topSeed: teams[0],
  };
}

function generateMarkdown(data: RegionalPreviewData, gender: string): string {
  const { regional, teams, advancing, eliminated } = data;
  const lines: string[] = [];

  lines.push(`# ${regional.name} Preview`);
  lines.push(`**${regional.city}** | Host: ${regional.host} | ${gender === "men" ? "Men's" : "Women's"} D1`);
  lines.push("");

  // Field overview
  lines.push("## Field Overview");
  lines.push("");
  lines.push(`| Seed | Team | Rank | Conf | Distance |`);
  lines.push(`|------|------|------|------|----------|`);
  for (const t of teams) {
    const badges: string[] = [];
    if (t.isAutoQualifier) badges.push("AQ");
    if (t.team === regional.host) badges.push("HOST");
    const badgeStr = badges.length ? ` (${badges.join(", ")})` : "";
    lines.push(
      `| ${t.seed} | ${t.team}${badgeStr} | #${t.rank} | ${t.conference} | ${t.distanceMiles} mi |`
    );
  }
  lines.push("");

  // Advancement line
  lines.push("## Advancement Projections");
  lines.push("");
  lines.push("**Advancing to Nationals (Top 5):**");
  for (const t of advancing) {
    lines.push(`- ${t.seed}. ${t.team} (#${t.rank}) - ${t.conference}`);
  }
  lines.push("");
  lines.push("**Eliminated:**");
  for (const t of eliminated) {
    const note = t.isAutoQualifier ? " [AQ]" : "";
    lines.push(`- ${t.seed}. ${t.team} (#${t.rank}) - ${t.conference}${note}`);
  }
  lines.push("");

  // Conference breakdown
  lines.push("## Conference Breakdown");
  lines.push("");
  const sortedConfs = [...data.conferences.entries()].sort((a, b) => b[1] - a[1]);
  for (const [conf, count] of sortedConfs) {
    const confTeams = teams.filter((t) => t.conference === conf).map((t) => t.team);
    lines.push(`- **${conf}** (${count}): ${confTeams.join(", ")}`);
  }
  lines.push("");

  // Travel analysis
  lines.push("## Travel Analysis");
  lines.push("");
  lines.push(`- **Average distance:** ${data.avgDistance} miles`);
  lines.push(`- **Farthest team:** ${data.maxDistance.team} (${data.maxDistance.miles} mi)`);
  lines.push(`- **Closest team:** ${data.minDistance.team} (${data.minDistance.miles} mi)`);
  lines.push(`- **Total field travel:** ${teams.reduce((s, t) => s + t.distanceMiles, 0).toLocaleString()} miles`);
  lines.push("");

  // Host advantage
  if (data.hostTeam) {
    lines.push("## Host Advantage");
    lines.push("");
    lines.push(
      `${data.hostTeam.team} plays at home as the ${ordinal(data.hostTeam.seed)} seed ` +
      `(ranked #${data.hostTeam.rank}). Home course familiarity and fan support ` +
      `give them a measurable edge, particularly in stroke play.`
    );
    lines.push("");
  }

  // Storylines
  lines.push("## Key Storylines");
  lines.push("");

  // Biggest upset potential: lowest-seeded team with best record
  const highWinPct = [...teams]
    .map((t) => ({
      ...t,
      winPct: t.wins / (t.wins + t.losses + t.ties),
    }))
    .sort((a, b) => b.winPct - a.winPct);

  if (highWinPct[0].seed > 3) {
    const t = highWinPct[0];
    lines.push(
      `- **${t.team}** has the best win rate in this regional ` +
      `(${t.wins}-${t.losses}-${t.ties}) despite being seeded ${ordinal(t.seed)}.`
    );
  }

  // AQ storylines
  for (const aq of data.autoQualifiers) {
    if (aq.rank > 50) {
      lines.push(
        `- **${aq.team}** (${aq.aqConference} champion) enters as the ${ordinal(aq.seed)} seed. ` +
        `Ranked #${aq.rank}, they face a steep challenge against higher-ranked opponents.`
      );
    }
  }

  // Travel extreme
  if (data.maxDistance.miles > 1500) {
    lines.push(
      `- **${data.maxDistance.team}** faces the longest trip in this regional ` +
      `at ${data.maxDistance.miles} miles - a significant cross-country journey.`
    );
  }

  // SEC/ACC dominance
  const secCount = data.conferences.get("SEC") ?? 0;
  const accCount = data.conferences.get("ACC") ?? 0;
  if (secCount >= 4) {
    lines.push(
      `- The SEC sends ${secCount} teams to this regional - an SEC-heavy field ` +
      `that creates multiple familiar matchups.`
    );
  }
  if (accCount >= 4) {
    lines.push(
      `- ${accCount} ACC teams in this regional means plenty of conference rivalry rematches.`
    );
  }

  // Bubble battle (5th vs 6th seed)
  const fifth = teams[4];
  const sixth = teams[5];
  if (fifth && sixth) {
    const rankGap = sixth.rank - fifth.rank;
    if (rankGap <= 5) {
      lines.push(
        `- The advancement line battle between **${fifth.team}** (${ordinal(fifth.seed)} seed, #${fifth.rank}) ` +
        `and **${sixth.team}** (${ordinal(sixth.seed)} seed, #${sixth.rank}) is razor-thin ` +
        `(just ${rankGap} spots in the rankings).`
      );
    }
  }

  lines.push("");
  lines.push("---");
  lines.push(`*Generated ${new Date().toISOString().split("T")[0]} by College Golf Data*`);

  return lines.join("\n");
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ---------------------------------------------------------------------------
// Data loading (inline require since we're running via tsx)
// ---------------------------------------------------------------------------

async function loadData(gender: string): Promise<{
  teams: TeamData[];
  regionals: Regional[];
}> {
  // Use dynamic import for .ts files via tsx
  const dataDir = path.join(__dirname, "..", "src", "data");

  if (gender === "men") {
    const allTeams = await import(path.join(dataDir, "all-teams-men-2026"));
    const regs = await import(path.join(dataDir, "regionals-men-2026"));
    return { teams: allTeams.allTeamsMen2026, regionals: regs.regionalsMen2026 };
  } else {
    const allTeams = await import(path.join(dataDir, "all-teams-women-2026"));
    const regs = await import(path.join(dataDir, "regionals-women-2026"));
    return { teams: allTeams.allTeamsWomen2026, regionals: regs.regionalsWomen2026 };
  }
}

// ---------------------------------------------------------------------------
// Summary generation (cross-regional analysis)
// ---------------------------------------------------------------------------

function generateSummary(
  allPreviews: RegionalPreviewData[],
  gender: string
): string {
  const lines: string[] = [];
  const gLabel = gender === "men" ? "Men's" : "Women's";

  lines.push(`# ${gLabel} NCAA D1 Regional Predictions - Summary`);
  lines.push("");
  lines.push(`*Based on Broadie/Clippd rankings as of ${new Date().toISOString().split("T")[0]}*`);
  lines.push("");

  // Regional strength comparison
  lines.push("## Regional Strength Comparison");
  lines.push("");
  lines.push("| Regional | Top Seed | Avg Rank | Avg Distance | Strongest Conf |");
  lines.push("|----------|----------|----------|--------------|----------------|");

  for (const p of allPreviews) {
    const avgRank = Math.round(
      p.teams.reduce((s, t) => s + t.rank, 0) / p.teams.length
    );
    const topConf = [...p.conferences.entries()].sort((a, b) => b[1] - a[1])[0];
    lines.push(
      `| ${p.regional.name} | ${p.topSeed.team} (#${p.topSeed.rank}) | ${avgRank} | ${p.avgDistance} mi | ${topConf[0]} (${topConf[1]}) |`
    );
  }
  lines.push("");

  // Travel fairness
  lines.push("## Travel Fairness");
  lines.push("");
  const byAvgDist = [...allPreviews].sort((a, b) => a.avgDistance - b.avgDistance);
  lines.push(
    `- **Least travel:** ${byAvgDist[0].regional.name} (avg ${byAvgDist[0].avgDistance} mi)`
  );
  lines.push(
    `- **Most travel:** ${byAvgDist[byAvgDist.length - 1].regional.name} (avg ${byAvgDist[byAvgDist.length - 1].avgDistance} mi)`
  );
  lines.push("");

  // Conference distribution
  lines.push("## Conference Distribution Across Regionals");
  lines.push("");
  const confTotals = new Map<string, number>();
  for (const p of allPreviews) {
    for (const [conf, count] of p.conferences) {
      confTotals.set(conf, (confTotals.get(conf) ?? 0) + count);
    }
  }
  const topConfs = [...confTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  for (const [conf, total] of topConfs) {
    const distribution = allPreviews
      .map((p) => `${p.regional.name.replace(" Regional", "")}: ${p.conferences.get(conf) ?? 0}`)
      .join(", ");
    lines.push(`- **${conf}** (${total} teams): ${distribution}`);
  }
  lines.push("");

  lines.push("---");
  lines.push(`*Generated ${new Date().toISOString().split("T")[0]} by College Golf Data*`);

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const genderArg = args.find((a) => a !== "--gender") ?? "both";
  const genderIdx = args.indexOf("--gender");
  const gender = genderIdx >= 0 ? args[genderIdx + 1] : genderArg;

  const genders = gender === "both" ? ["men", "women"] : [gender];
  const outputDir = path.join(__dirname, "..", "previews");

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  for (const g of genders) {
    console.log(`\n=== Generating ${g}'s regional previews ===\n`);

    const { teams, regionals } = await loadData(g);
    console.log(`  Loaded ${teams.length} teams, ${regionals.length} regionals`);

    const assignments = computeCommitteeScurve(teams, regionals);
    console.log(`  Computed S-curve: ${assignments.length} assignments`);

    const allPreviews: RegionalPreviewData[] = [];

    for (const regional of regionals) {
      const preview = analyzeRegional(regional, assignments);
      allPreviews.push(preview);

      const markdown = generateMarkdown(preview, g);
      const filename = `${g}-${regional.name.toLowerCase().replace(/\s+/g, "-")}.md`;
      const outPath = path.join(outputDir, filename);
      fs.writeFileSync(outPath, markdown);
      console.log(`  Written: ${filename} (${preview.teams.length} teams)`);
    }

    // Generate summary
    const summary = generateSummary(allPreviews, g);
    const summaryPath = path.join(outputDir, `${g}-summary.md`);
    fs.writeFileSync(summaryPath, summary);
    console.log(`  Written: ${g}-summary.md`);
  }

  console.log(`\nAll previews saved to ${outputDir}/`);
}

main().catch(console.error);
