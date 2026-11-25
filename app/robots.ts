import type { MetadataRoute } from "next";
import { generateSitemaps } from "./sitemap";
import { SITE_URL } from "@/lib/site";

export const revalidate = 86400;

const PRIVATE = ["/api/", "/chat", "/account", "/pipeline", "/case", "/settings", "/u/", "/upgrade"];
const AI_SCRAPERS = ["GPTBot", "CCBot", "ClaudeBot", "anthropic-ai", "Google-Extended", "Bytespider", "Amazonbot", "meta-externalagent", "FacebookBot", "Applebot-Extended", "PerplexityBot", "cohere-ai", "Diffbot", "Omgilibot", "ImagesiftBot", "Timpibot"];

export default async function robots(): Promise<MetadataRoute.Robots> {
  const maps = await generateSitemaps();
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE },
      // AI training and bulk scrapers: no search traffic, and crawling ~150,000 pages cost real hosting.
      { userAgent: AI_SCRAPERS, disallow: "/" },
    ],
    sitemap: maps.map(({ id }) => `${SITE_URL}/sitemap/${id}.xml`),
  };
}
