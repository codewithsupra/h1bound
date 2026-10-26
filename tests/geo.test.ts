import { describe, expect, it } from "vitest";
import { statesIn } from "@/lib/geo";

describe("statesIn", () => {
  it.each([
    ["Austin, Texas", ["TX"]],
    ["San Mateo, CA United States", ["CA"]],
    ["New York, NY", ["NY"]],
    ["Remote - US", []],
    ["Washington, DC", ["DC"]],
    ["Seattle; Bay Area", ["WA", "CA"]],
    ["London, UK", []],
  ])("%s", (loc, want) => expect(statesIn(loc).sort()).toEqual([...want].sort()));
});
