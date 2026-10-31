import type { MetadataRoute } from "next";
import { generateSitemaps } from "./sitemap";
import { SITE_URL } from "@/lib/site";

export const revalidate = 86400;

export default async function robots(): Promise<MetadataRoute.Robots> {
  const maps = await generateSitemaps();
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/chat", "/account", "/pipeline", "/case", "/settings", "/u/", "/upgrade"] },
    sitemap: maps.map(({ id }) => `${SITE_URL}/sitemap/${id}.xml`),
  };
}
