import { ImageResponse } from "next/og";

// Twitter/X card image - identical to OG image
export const runtime = "edge";

export const alt = "College Golf Data - NCAA D1 Regional Predictions";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export { default } from "./opengraph-image";
