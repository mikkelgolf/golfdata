/**
 * Pure SVG sparkline. Zero dependencies. ~30 lines.
 *
 * Lower rank = better, so a "trending up" line means the rank number went DOWN.
 * Renders an empty placeholder if data is missing or has < 2 points.
 */
export function Sparkline({
  data,
  w = 56,
  h = 14,
  colorUp = "#5fb7b0",   // teal — improving
  colorDown = "#d68a8a", // rose — declining
  colorFlat = "#5e6068", // muted — no change
}: {
  data: number[];
  w?: number;
  h?: number;
  colorUp?: string;
  colorDown?: string;
  colorFlat?: string;
}) {
  if (!data || data.length < 2) {
    return <div className="inline-block shrink-0" style={{ width: w, height: h }} aria-hidden="true" />;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`)
    .join(" ");

  const first = data[0];
  const last = data[data.length - 1];
  const delta = last - first;
  // Lower rank is better: improving = delta negative
  const stroke = delta < 0 ? colorUp : delta > 0 ? colorDown : colorFlat;
  const lastY = h - ((last - min) / range) * h;

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="inline-block shrink-0 overflow-visible"
      aria-label={`Trend: ${first} to ${last}`}
    >
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts}
      />
      <circle cx={w} cy={lastY} r="1.75" fill={stroke} />
    </svg>
  );
}
