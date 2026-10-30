import { describe, expect, it } from "vitest";
import { inShard, withRetry } from "@/lib/ingest/refresh";

const noSleep = async () => {};

describe("withRetry", () => {
  it("retries transient failures then succeeds", async () => {
    let n = 0;
    expect(await withRetry(async () => { if (++n < 3) throw new Error("timeout"); return "ok"; }, 3, noSleep)).toBe("ok");
    expect(n).toBe(3);
  });
  it("gives up after the last try with the last error", async () => {
    let n = 0;
    await expect(withRetry(async () => { n++; throw new Error(`fail ${n}`); }, 3, noSleep)).rejects.toThrow("fail 3");
  });
});

describe("inShard", () => {
  it("puts every id in exactly one shard", () => {
    const ids = Array.from({ length: 200 }, () => crypto.randomUUID());
    for (const id of ids) expect([0, 1, 2, 3].filter((s) => inShard(id, s, 4))).toHaveLength(1);
  });
  it("keeps everything when unsharded", () => {
    expect(inShard(crypto.randomUUID(), 0, 1)).toBe(true);
  });
});

import { boardPattern, licenceFor } from "@/lib/ingest/refresh";
import { fromGreenhouse } from "@/lib/ingest/ats";

describe("licenceFor", () => {
  const idx = new Map([["GB:stripe", "lic-gb"], ["IE:stripe technology", "lic-ie"]]);
  const job = (location: string) => fromGreenhouse("stripe", "Stripe", { id: 1, title: "Engineer", absolute_url: "u", location: { name: location } });
  it("links a London job to the UK register entry by name", () => {
    expect(licenceFor(job("London, UK"), ["Stripe, Inc."], idx)).toBe("lic-gb");
  });
  it("tries every known name for the employer", () => {
    expect(licenceFor(job("Dublin"), ["Stripe Technology Europe Limited"], idx)).toBe("lic-ie");
  });
  it("prefers the board's own licence when the country matches", () => {
    expect(licenceFor(job("London"), [], idx, { id: "own", country: "GB" })).toBe("own");
    expect(licenceFor(job("Dublin"), ["Stripe Technology Europe Limited"], idx, { id: "own", country: "GB" })).toBe("lic-ie");
  });
  it("has no licence for US jobs", () => {
    expect(licenceFor(job("San Francisco, CA"), ["Stripe"], idx)).toBeNull();
  });
});

describe("boardPattern", () => {
  it("escapes LIKE wildcards in slugs", () => {
    expect(boardPattern("stripe")).toBe("stripe:%");
    expect(boardPattern("my_co%")).toBe("my\\_co\\%:%");
  });
});
