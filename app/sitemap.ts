import type { MetadataRoute } from "next";
import { sitemapSponsorCount, sitemapSponsors } from "@/lib/server/sponsors";
import { SITE_URL } from "@/lib/site";

export const revalidate = 86400;

/** Search engines cap a sitemap at 50,000 URLs; sitemap 0 also carries the static pages. */
const PER_SITEMAP = 50_000;
const STATIC = ["/", "/sponsors", "/opt-clock"];

export async function generateSitemaps() {
  const n = Math.max(1, Math.ceil((STATIC.length + (await sitemapSponsorCount())) / PER_SITEMAP));
  return Array.from({ length: n }, (_, id) => ({ id }));
}

export default async function sitemap({ id }: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  const i = Number(await id);
  const statics = i === 0 ? STATIC.map((p) => ({ url: `${SITE_URL}${p === "/" ? "" : p}`, changeFrequency: "daily" as const, priority: p === "/" ? 1 : 0.8 })) : [];
  const offset = Math.max(0, i * PER_SITEMAP - STATIC.length);
  const sponsors = await sitemapSponsors(offset, PER_SITEMAP - statics.length);
  return [
    ...statics,
    ...sponsors.map((s) => ({ url: `${SITE_URL}/sponsors/${s.slug}`, lastModified: s.updated_at, changeFrequency: "weekly" as const, priority: 0.6 })),
  ];
}
