import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/insforge/admin", () => ({ createAdminInsForge: () => ({}) }));
import { keywordTerms } from "@/lib/server/jobs";

describe("keywordTerms", () => {
  it("drops filler words the model adds", () => {
    expect(keywordTerms("backend full-time")).toEqual(["backend"]);
    expect(keywordTerms("Data engineer roles")).toEqual(["data", "engineer"]);
    expect(keywordTerms("C++ remote jobs")).toEqual(["c++"]);
    expect(keywordTerms(undefined)).toEqual([]);
  });
});
