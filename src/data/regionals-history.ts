// Re-exports the generated regionals-history.json with the correct type.
// The JSON is emitted by scripts/build-regionals-history.ts.

import type { RegionalFinish } from "./records-types";
import data from "./regionals-history.json";

export const regionalsHistory = data as RegionalFinish[];
