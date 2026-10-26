/**
 * Pro catalog. Client-safe: price IDs are public identifiers, set per environment via env vars
 * once the Stripe products exist (see README). Price is always chosen server-side by country.
 */

export type Currency = "usd" | "inr";

export const PAYMENTS_ENV: "test" | "live" = process.env.NEXT_PUBLIC_PAYMENTS_ENV === "live" ? "live" : "test";

export const PRICES: Record<Currency, { id: string | undefined; label: string }> = {
  usd: { id: process.env.NEXT_PUBLIC_PRICE_USD_MONTH, label: "$12/month" },
  inr: { id: process.env.NEXT_PUBLIC_PRICE_INR_MONTH, label: "₹399/month" },
};

export const currencyForCountry = (country: string | null | undefined): Currency => ((country ?? "").toUpperCase() === "IN" ? "inr" : "usd");
