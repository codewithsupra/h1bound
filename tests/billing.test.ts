import { describe, expect, it } from "vitest";
import { currencyForCountry } from "@/lib/billing";

describe("currencyForCountry", () => {
  it("prices India in rupees, Europe and the UK in euros, everyone else in dollars", () => {
    expect(currencyForCountry("IN")).toBe("inr");
    expect(currencyForCountry("nl")).toBe("eur");
    expect(currencyForCountry("GB")).toBe("eur");
    expect(currencyForCountry("IE")).toBe("eur");
    expect(currencyForCountry("US")).toBe("usd");
    expect(currencyForCountry("NG")).toBe("usd");
    expect(currencyForCountry(null)).toBe("usd");
  });
});
