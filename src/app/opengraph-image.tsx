import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "College Golf Data - NCAA D1 Regional Predictions";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#111115",
          fontFamily: "system-ui, sans-serif",
          position: "relative",
        }}
      >
        {/* Content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "24px",
          }}
        >
          <div
            style={{
              fontSize: "52px",
              fontWeight: 600,
              color: "#fafafa",
              letterSpacing: "-1px",
              display: "flex",
            }}
          >
            College Golf Data
          </div>

          {/* Divider */}
          <div
            style={{
              width: "80px",
              height: "2px",
              backgroundColor: "#22c55e",
              display: "flex",
            }}
          />

          <div
            style={{
              fontSize: "24px",
              color: "#a1a1aa",
              fontWeight: 500,
              display: "flex",
            }}
          >
            NCAA D1 Regional Predictions
          </div>

          {/* Tags */}
          <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
            {["S-Curve Tool", "81 Teams", "6 Regionals", "Live Rankings"].map(
              (tag) => (
                <div
                  key={tag}
                  style={{
                    padding: "6px 16px",
                    borderRadius: "9999px",
                    border: "1px solid rgba(34, 197, 94, 0.3)",
                    color: "#22c55e",
                    fontSize: "14px",
                    fontWeight: 500,
                    display: "flex",
                  }}
                >
                  {tag}
                </div>
              )
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            position: "absolute",
            bottom: "32px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            color: "#71717a",
            fontSize: "14px",
          }}
        >
          <span>collegegolfdata.com</span>
          <span style={{ display: "flex" }}>-</span>
          <span>David Tenneson & Mikkel Bjerch-Andresen</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
