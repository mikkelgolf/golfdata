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
          background: "linear-gradient(145deg, #0f1115 0%, #111518 40%, #0d1a14 100%)",
          fontFamily: "system-ui, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Subtle grid pattern */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            opacity: 0.04,
            display: "flex",
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />

        {/* Green glow */}
        <div
          style={{
            position: "absolute",
            top: "-20%",
            left: "30%",
            width: "500px",
            height: "500px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(34, 197, 94, 0.08) 0%, transparent 70%)",
            display: "flex",
          }}
        />

        {/* Content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "24px",
          }}
        >
          {/* Brand */}
          <div
            style={{
              fontSize: "52px",
              fontWeight: 400,
              fontStyle: "italic",
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
              background: "linear-gradient(90deg, transparent, #22c55e, transparent)",
              display: "flex",
            }}
          />

          {/* Subtitle */}
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
          <div
            style={{
              display: "flex",
              gap: "12px",
              marginTop: "8px",
            }}
          >
            {["S-Curve Tool", "81 Teams", "6 Regionals", "Live Rankings"].map(
              (tag) => (
                <div
                  key={tag}
                  style={{
                    padding: "6px 16px",
                    borderRadius: "9999px",
                    border: "1px solid rgba(34, 197, 94, 0.3)",
                    backgroundColor: "rgba(34, 197, 94, 0.08)",
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
