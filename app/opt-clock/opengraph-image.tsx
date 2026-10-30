import { OG_SIZE, ogCard } from "@/lib/og/card";

export const alt = "OPT unemployment day calculator";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogCard({ kicker: "Free OPT clock", title: "How many OPT days do you have left?", sub: "90 days on OPT, 150 with STEM. Check yours in 10 seconds." });
}
