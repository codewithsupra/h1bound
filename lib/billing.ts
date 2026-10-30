/**
 * Pro catalog. Client-safe: price IDs are public identifiers, set per environment via env vars
 * once the Stripe products exist (see README). Price is always chosen server-side by country.
 */

export type Currency = "usd" | "eur" | "inr";

export const PAYMENTS_ENV: "test" | "live" = process.env.NEXT_PUBLIC_PAYMENTS_ENV === "live" ? "live" : "test";

export const PRICES: Record<Currency, { id: string | undefined; label: string }> = {
  usd: { id: process.env.NEXT_PUBLIC_PRICE_USD_MONTH, label: "$12/month" },
  eur: { id: process.env.NEXT_PUBLIC_PRICE_EUR_MONTH, label: "€10/month" },
  inr: { id: process.env.NEXT_PUBLIC_PRICE_INR_MONTH, label: "₹399/month" },
};

// Euro for the EU/EEA and the UK (no pound price by decision; € reads naturally to UK students and Stripe converts).
const EUR = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  "IS", "LI", "NO", "CH", "GB",
]);

export function currencyForCountry(country: string | null | undefined): Currency {
  const c = (country ?? "").toUpperCase();
  if (c === "IN") return "inr";
  return EUR.has(c) ? "eur" : "usd";
}

/** Falls back to USD while a currency's Stripe price isn't created yet. */
export function priceForCountry(country: string | null | undefined) {
  const cur = currencyForCountry(country);
  return PRICES[cur].id || cur === "usd" ? { currency: cur, ...PRICES[cur] } : { currency: "usd" as const, ...PRICES.usd };
}
