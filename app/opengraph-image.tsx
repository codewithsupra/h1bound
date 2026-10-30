import { OG_SIZE, ogCard } from "@/lib/og/card";
import { SITE_NAME } from "@/lib/site";

export const alt = `${SITE_NAME}: jobs in the UK, Netherlands and Ireland at licensed visa sponsors`;
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogCard({ kicker: "AI job buddy for international students", title: "Apply where you can actually stay.", sub: "Jobs in the UK, Netherlands and Ireland at licensed visa sponsors, plus remote. Free to start." });
}
