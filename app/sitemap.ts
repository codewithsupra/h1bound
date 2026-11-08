import type { MetadataRoute } from "next";
import { sitemapSponsorCount, sitemapSponsors } from "@/lib/server/sponsors";
import { listedCount, sitemapLicences } from "@/lib/server/licences";
import { SITE_URL } from "@/lib/site";
import { COUNTRY_PATH, MARKETS } from "@/lib/visa";

// Hourly so a sitemap built while the database was down (empty) heals quickly.
export const revalidate = 3600;

/**
 * Search engines cap a sitemap at 50,000 URLs. Ids 0..n are US sponsor pages (sitemap 0 also carries
 * the static pages); 100+, 200+ and 300+ are the UK, Dutch and Irish register pages.
 */
const PER_SITEMAP = 50_000;
const STATIC = ["/", "/sponsors", "/opt-clock"];
const BASE = { GB: 100, NL: 200, IE: 300 } as const;

/** Ids to use if the database can't be counted at build time: generous, and each one is simply empty if unused. */
const FALLBACK_IDS = [0, 1, 100, 101, 102, 200, 300].map((id) => ({ id }));

export async function generateSitemaps() {
  try {
    return await countSitemaps();
  } catch (e) {
    console.error(`[build] sitemap counts unavailable, using fallback ids: ${(e as Error).message}`);
    return FALLBACK_IDS;
  }
}

async function countSitemaps() {
  const us = Math.max(1, Math.ceil((STATIC.length + (await sitemapSponsorCount())) / PER_SITEMAP));
  const ids = Array.from({ length: us }, (_, id) => ({ id }));
  for (const c of MARKETS) {
    const n = Math.ceil((await listedCount(c)) / PER_SITEMAP);
    for (let p = 0; p < n; p++) ids.push({ id: BASE[c] + p });
  }
  return ids;
}

export default async function sitemap({ id }: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  const i = Number(await id);
  try {
    return await entries(i);
  } catch (e) {
    // A failed read must not fail the build or serve an error to crawlers; the page heals on the next revalidation.
    console.error(`[sitemap ${i}] database unavailable, serving it empty: ${(e as Error).message}`);
    return [];
  }
}

async function entries(i: number): Promise<MetadataRoute.Sitemap> {
  const market = MARKETS.find((c) => i >= BASE[c] && i < BASE[c] + 100);
  if (market) {
    const rows = await sitemapLicences(market, (i - BASE[market]) * PER_SITEMAP, PER_SITEMAP);
    return rows.map((r) => ({ url: `${SITE_URL}/sponsors/${COUNTRY_PATH[market]}/${r.slug}`, lastModified: r.updated_at, changeFrequency: "weekly" as const, priority: 0.5 }));
  }
  const statics = i === 0 ? STATIC.map((p) => ({ url: `${SITE_URL}${p === "/" ? "" : p}`, changeFrequency: "daily" as const, priority: p === "/" ? 1 : 0.8 })) : [];
  const offset = Math.max(0, i * PER_SITEMAP - STATIC.length);
  const sponsors = await sitemapSponsors(offset, PER_SITEMAP - statics.length);
  return [
    ...statics,
    ...sponsors.map((s) => ({ url: `${SITE_URL}/sponsors/${s.slug}`, lastModified: s.updated_at, changeFrequency: "weekly" as const, priority: 0.6 })),
  ];
}
