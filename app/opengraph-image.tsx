import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Greenroom — software for independent music venues";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background:
            "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(16, 185, 129, 0.18), transparent 60%), #faf7f0",
          display: "flex",
          flexDirection: "column",
          padding: "80px",
          fontFamily: "system-ui",
        }}
      >
        {/* Mark */}
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <svg width="72" height="72" viewBox="0 0 40 40">
            <defs>
              <linearGradient
                id="gr-bg"
                x1="0"
                y1="0"
                x2="40"
                y2="40"
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0" stopColor="#059669" />
                <stop offset="1" stopColor="#047857" />
              </linearGradient>
            </defs>
            <rect width="40" height="40" rx="9" fill="url(#gr-bg)" />
            <g
              stroke="white"
              strokeWidth="2.6"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M 27 13.4 A 8 8 0 1 0 27 26.6" />
              <line x1="27" y1="20" x2="20.5" y2="20" />
            </g>
          </svg>
          <span
            style={{
              fontSize: 38,
              fontWeight: 600,
              color: "#181712",
              letterSpacing: "-0.02em",
            }}
          >
            Greenroom
          </span>
        </div>

        {/* Headline */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: "auto",
            gap: "16px",
          }}
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 600,
              color: "#047857",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            Operating system for independent music venues
          </div>
          <div
            style={{
              fontSize: 72,
              fontWeight: 600,
              color: "#181712",
              letterSpacing: "-0.025em",
              lineHeight: 1.05,
            }}
          >
            Bookings, settlement, advancing —
            <br />
            in one place.
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
