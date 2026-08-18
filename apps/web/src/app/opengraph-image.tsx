import { ImageResponse } from "next/og";
import { site } from "../lib/site";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: "linear-gradient(135deg, #1c2129 0%, #2c3340 55%, #1a3a3a 100%)",
          color: "#f4f8fb",
        }}
      >
        <div style={{ fontSize: 28, letterSpacing: 4, opacity: 0.7 }}>VPN</div>
        <div style={{ fontSize: 88, fontWeight: 800, letterSpacing: -2, marginTop: 12 }}>
          {site.brand}
        </div>
        <div style={{ fontSize: 36, marginTop: 18, opacity: 0.88 }}>{site.slogan}</div>
      </div>
    ),
    size,
  );
}
