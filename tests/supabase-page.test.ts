import { describe, expect, it } from "vitest";
import { fetchAll, PAGE_SIZE } from "@/lib/supabase/page";

const rows = (n: number) => Array.from({ length: n }, (_, i) => i);
const source = (total: number) => (from: number, to: number) => Promise.resolve({ data: rows(total).slice(from, to + 1), error: null });

describe("fetchAll", () => {
  it("reads every page, so nothing is lost to the 1,000-row cap", async () => {
    expect(await fetchAll<number>(source(2500))).toHaveLength(2500);
    expect(await fetchAll<number>(source(PAGE_SIZE))).toHaveLength(PAGE_SIZE);
    expect(await fetchAll<number>(source(0))).toEqual([]);
  });
  it("stops at max", async () => {
    expect(await fetchAll<number>(source(5000), 1500)).toHaveLength(1500);
  });
  it("fails loudly instead of returning a partial list", async () => {
    let call = 0;
    await expect(fetchAll<number>(async (a, b) => (++call === 2 ? { data: null, error: { message: "timeout" } } : { data: rows(PAGE_SIZE).slice(a, b + 1), error: null }))).rejects.toThrow("timeout");
  });
});
