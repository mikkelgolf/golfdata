// Re-exports the generated championships-history.json with the correct type.
// The JSON is emitted by scripts/build-championships-history.ts.

import type { ChampionshipFinish } from "./records-types";
import data from "./championships-history.json";

export const championshipsHistory = data as ChampionshipFinish[];
