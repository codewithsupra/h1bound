import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };

/** Shared share-card frame: night sky, the wordmark, one big line and one supporting line. */
export function ogCard({ kicker, title, sub }: { kicker: string; title: string; sub: string }) {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "radial-gradient(120% 90% at 50% 100%, #1d2760 0%, #0d1330 60%)", color: "#edf0fb", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", fontSize: 34, fontWeight: 700 }}>
          H1Bound<span style={{ color: "#ffb547" }}>.</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 30, color: "#ffb547" }}>{kicker}</div>
          <div style={{ fontSize: title.length > 28 ? 72 : 92, fontWeight: 700, letterSpacing: -3, lineHeight: 1.02, marginTop: 14 }}>{title}</div>
          <div style={{ fontSize: 32, color: "#98a1c8", marginTop: 22 }}>{sub}</div>
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
