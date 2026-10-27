import { describe, expect, it } from "vitest";
import { withRetry } from "@/lib/ingest/refresh";

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
