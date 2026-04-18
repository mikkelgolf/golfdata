/**
 * Regionals History Builder
 *
 * Reads the D1 Regional Team Results xlsx (David Tenneson's CGB_RegNCAA sheet)
 * and emits src/data/regionals-history.ts — a flat list of (year, gender, team,
 * position, advanced) rows that the /regionals page pivots into a matrix.
 *
 * Run: npx tsx scripts/build-regionals-history.ts
 */

import * as XLSX from "xlsx";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { RegionalFinish, Gender } from "../src/data/records-types";

interface SheetSpec {
  name: string;
  gender: Gender;
  /** 0-based row index where the year columns live. */
  headerRow: number;
  /** 0-based row index of the first team row. */
  dataStartRow: number;
}

const SHEETS: SheetSpec[] = [
  { name: "MEN - Final Results Only", gender: "men", headerRow: 1, dataStartRow: 2 },
  { name: "WOMEN - Final Results Only", gender: "women", headerRow: 0, dataStartRow: 1 },
];

function isYear(v: unknown): number | null {
  if (typeof v === "number" && v >= 1989 && v <= 2100) return v;
  if (typeof v === "string" && /^\d{4}$/.test(v.trim())) return Number(v.trim());
  return null;
}

function parseSheet(rows: unknown[][], spec: SheetSpec): RegionalFinish[] {
  const header = rows[spec.headerRow] ?? [];
  const yearCols: Array<{ col: number; year: number }> = [];
  for (let i = 0; i < header.length; i++) {
    const y = isYear(header[i]);
    if (y !== null) yearCols.push({ col: i, year: y });
  }
  if (yearCols.length === 0) {
    throw new Error(`No year columns found on ${spec.name}`);
  }

  const entries: RegionalFinish[] = [];
  for (let r = spec.dataStartRow; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const team = String(row[0] ?? "").trim();
    if (!team) continue;
    // Skip rows that aren't team data (e.g., summary rows)
    if (/^field count$/i.test(team)) continue;
    for (const { col, year } of yearCols) {
      const raw = row[col];
      if (raw === "" || raw === null || raw === undefined) continue;
      const position = String(raw).trim();
      if (!position) continue;
      const n = Number(position);
      if (!Number.isFinite(n)) continue;
      entries.push({
        year,
        gender: spec.gender,
        site: "",
        team,
        position,
        advanced: n <= 5,
      });
    }
  }
  return entries;
}

function run() {
  const root = resolve(__dirname, "..");
  const xlsxPath = resolve(root, "data/source/D1 Regional Team Results.xlsx");
  const wb = XLSX.readFile(xlsxPath);

  const all: RegionalFinish[] = [];
  for (const spec of SHEETS) {
    const sheet = wb.Sheets[spec.name];
    if (!sheet) {
      throw new Error(`Missing sheet: ${spec.name}`);
    }
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
    const parsed = parseSheet(rows, spec);
    all.push(...parsed);
    console.log(`${spec.name}: ${parsed.length} entries (${spec.gender})`);
  }

  // Sort deterministically
  all.sort(
    (a, b) =>
      a.gender.localeCompare(b.gender) ||
      a.year - b.year ||
      a.team.localeCompare(b.team),
  );

  writeFileSync(
    resolve(root, "src/data/regionals-history.json"),
    JSON.stringify(all),
  );
  const loader = [
    `// Re-exports the generated regionals-history.json with the correct type.`,
    `// The JSON is emitted by scripts/build-regionals-history.ts.`,
    ``,
    `import type { RegionalFinish } from "./records-types";`,
    `import data from "./regionals-history.json";`,
    ``,
    `export const regionalsHistory = data as RegionalFinish[];`,
    ``,
  ].join("\n");
  writeFileSync(resolve(root, "src/data/regionals-history.ts"), loader);

  const menCount = all.filter((a) => a.gender === "men").length;
  const womenCount = all.filter((a) => a.gender === "women").length;
  const advanceCount = all.filter((a) => a.advanced).length;
  const years = [...new Set(all.map((a) => a.year))].sort();
  const teams = new Set(all.map((a) => a.team));
  console.log(`\nTOTAL ${all.length} entries  (men ${menCount} / women ${womenCount})`);
  console.log(`Years ${years[0]}–${years[years.length - 1]}, ${teams.size} distinct teams`);
  console.log(`Advanced to Nationals: ${advanceCount}`);
}

run();
