// Re-exports the generated regionals-rich.json with the correct type.
// The JSON is emitted by scripts/build-regional-history.py, which reads
// David's private Google Sheet (D1 MEN tab). The sheet itself is NOT
// committed — only the derived per-row fields below.

import type { RegionalFinishRich } from "./records-types";
import data from "./regionals-rich.json";

export const regionalsRich = data as RegionalFinishRich[];
