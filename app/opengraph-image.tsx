import { OG_SIZE, ogCard } from "@/lib/og/card";

export const alt = "H1Bound: jobs at companies that actually sponsor H-1Bs";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogCard({ kicker: "AI job buddy for international students", title: "Apply where you can actually stay.", sub: "Open US jobs at employers with real H-1B filings. Free to start." });
}
