/**
 * Regionals Update Script
 *
 * Reads a TSV/CSV of regional site data and generates the TypeScript data file.
 *
 * Usage:
 *   npx tsx scripts/update-regionals.ts --gender men --input regionals.tsv
 *   npx tsx scripts/update-regionals.ts --gender women --input regionals.tsv
 *
 * Input format (TSV with headers):
 *   id  name  host  city  lat  lng  color
 *
 * Colors should be hex values (e.g., #22c55e).
 */

import * as fs from "fs";
import * as path from "path";

const DEFAULT_COLORS = [
  "#22c55e", // green
  "#3b82f6", // blue
  "#f59e0b", // amber
  "#ef4444", // red
  "#a855f7", // purple
  "#06b6d4", // cyan
];

interface ParsedRegional {
  id: number;
  name: string;
  host: string;
  city: string;
  lat: number;
  lng: number;
  color: string;
}

function parseTsvOrCsv(content: string): ParsedRegional[] {
  const lines = content.trim().split("\n");
  if (lines.length < 2) {
    throw new Error("Input must have a header row and at least one data row");
  }

  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const headers = lines[0].split(delimiter).map((h) => h.trim().toLowerCase());

  const regionals: ParsedRegional[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = line.split(delimiter).map((c) => c.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] ?? "";
    });

    regionals.push({
      id: parseInt(row.id || String(i), 10),
      name: row.name || `Regional ${i}`,
      host: row.host || "",
      city: row.city || "",
      lat: parseFloat(row.lat || "0"),
      lng: parseFloat(row.lng || row.lon || "0"),
      color: row.color || DEFAULT_COLORS[(i - 1) % DEFAULT_COLORS.length],
    });
  }

  return regionals;
}

function generateTypescript(
  regionals: ParsedRegional[],
  gender: "men" | "women"
): string {
  const varName = gender === "men" ? "regionalsMen2026" : "regionalsWomen2026";
  const importLine =
    gender === "men"
      ? `export interface Regional {
  id: number;
  name: string;
  host: string;
  city: string;
  lat: number;
  lng: number;
  color: string;
}

export const ${varName}: Regional[] = [`
      : `import type { Regional } from "./regionals-men-2026";

/**
 * NCAA D1 Women's Golf Regional Sites for 2025-26.
 * 72 teams across 6 regionals (12 teams per regional).
 */
export const ${varName}: Regional[] = [`;

  const lines = regionals.map(
    (r) =>
      `  {\n    id: ${r.id},\n    name: "${r.name}",\n    host: "${r.host}",\n    city: "${r.city}",\n    lat: ${r.lat},\n    lng: ${r.lng},\n    color: "${r.color}",\n  },`
  );

  return importLine + "\n" + lines.join("\n") + "\n];\n";
}

function main() {
  const args = process.argv.slice(2);
  const genderIdx = args.indexOf("--gender");
  const inputIdx = args.indexOf("--input");

  if (genderIdx === -1 || inputIdx === -1) {
    console.log(`
Usage: npx tsx scripts/update-regionals.ts --gender <men|women> --input <file.tsv>

Options:
  --gender   men or women
  --input    Path to TSV or CSV file with regional site data

Input columns (TSV/CSV with headers):
  Required: name, host, city, lat, lng
  Optional: id, color
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
  const regionals = parseTsvOrCsv(content);

  console.log(`Parsed ${regionals.length} regional sites from ${inputPath}`);

  const ts = generateTypescript(regionals, gender);
  const outFile =
    gender === "men"
      ? path.join(__dirname, "..", "src", "data", "regionals-men-2026.ts")
      : path.join(__dirname, "..", "src", "data", "regionals-women-2026.ts");

  fs.writeFileSync(outFile, ts, "utf-8");
  console.log(`Written to ${outFile}`);
  console.log(`\nDone! Run 'npm run build' to verify.`);
}

main();
