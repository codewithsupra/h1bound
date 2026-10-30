/** Absolute origin for canonical URLs, sitemaps and robots.txt. */
export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://h1bound.vercel.app").replace(/\/$/, "");

/** Product name, in one place for the rebrand. */
export const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? "Sponsorbound";
