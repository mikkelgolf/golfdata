/**
 * Highlight colors for the user's selected Head-to-Head teams in the Manual
 * Grid + Map. Picked to stand apart from the muted regional palette
 * (mid-saturation earth tones) — bright cyan for A, bright magenta for B.
 *
 * If you add new uses, keep both colors in sync.
 */

export const TEAM_A_COLOR = "#06B6D4"; // Tailwind cyan-500
export const TEAM_B_COLOR = "#EC4899"; // Tailwind pink-500

/** Faint background tint for grid cells highlighting Team A. */
export const TEAM_A_BG = "rgba(6, 182, 212, 0.18)";
/** Faint background tint for grid cells highlighting Team B. */
export const TEAM_B_BG = "rgba(236, 72, 153, 0.18)";
