import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, type FakeDb } from "./helpers/fake-db";
import { newSponsorLine, rankNewSponsors, ANOMALY_PER_WEEK, type NewSponsor } from "@/lib/new-sponsors";

let db: FakeDb;
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ adminDb: () => db.database }));
const { newSponsorsFor } = await import("@/lib/server/new-sponsors");

const sp = (over: Partial<NewSponsor>): NewSponsor => ({ id: "x", name: "X Ltd", country: "GB", city: "London", slug: "x-ltd", firstListed: "2026-11-30", rating: "A", routes: ["Skilled Worker"], openRoles: 0, ...over });

describe("rankNewSponsors", () => {
  it("open roles in your field first, then your cities, and never B-rated licences", () => {
    const out = rankNewSponsors([
      sp({ id: "far", city: "Leeds" }),
      sp({ id: "near", city: "London" }),
      sp({ id: "hiring", city: "Leeds", openRoles: 2 }),
      sp({ id: "b", city: "London", openRoles: 9, rating: "B" }),
    ], ["london"], 10);
    expect(out.map((s) => s.id)).toEqual(["hiring", "near", "far"]);
  });
  it("respects the limit", () => {
    expect(rankNewSponsors([sp({ id: "a" }), sp({ id: "b" }), sp({ id: "c" })], [], 2)).toHaveLength(2);
  });
});

describe("newSponsorLine", () => {
  it("says what the register shows and nothing more", () => {
    expect(newSponsorLine(sp({ name: "Acme Robotics", openRoles: 3 }))).toBe("Acme Robotics: new on the UK sponsor register, London (added 30 Nov). 3 open roles in your field.");
    expect(newSponsorLine(sp({ country: "NL", city: null }))).toMatch(/new on the Dutch IND register.*No roles posted yet/);
    expect(newSponsorLine(sp({}))).not.toMatch(/will sponsor|guarantee/i);
  });
});

// An Indian graduate on the UK Graduate visa who also wants the Netherlands.
const student = { work: { citizenship: "IN", visaCountry: "GB", visaSituation: "graduate" as const }, targetCountries: ["GB", "NL", "IE"], families: ["data_analyst"], cities: ["London"] };
const lic = (id: string, over: Record<string, unknown> = {}) => ({ id, name: `${id} Ltd`, display_name: null, country: "GB", city: "London", slug: id, first_listed: "2026-11-30", rating: "A", routes: ["Skilled Worker"], listed: true, ...over });

beforeEach(() => {
  db = createFakeDb({
    sponsor_licences: [
      lic("new-gb"),
      lic("new-nl", { country: "NL", city: null, routes: ["Highly skilled migrant"], rating: null }),
      lic("old", { first_listed: null }),
      lic("before", { first_listed: "2026-11-02" }),
      lic("delisted", { listed: false }),
      lic("temp-only", { routes: ["Temporary Worker"] }),
      lic("hiring", { city: "Manchester" }),
    ],
    jobs: [
      { id: "j1", licence_id: "hiring", licence_match: "exact", family: "data_analyst", active: true },
      { id: "j2", licence_id: "hiring", licence_match: "unique", family: "data_analyst", active: true },
      { id: "j3", licence_id: "hiring", licence_match: "ambiguous", family: "data_analyst", active: true },
      { id: "j4", licence_id: "new-gb", licence_match: "exact", family: "software_engineer", active: true },
    ],
  });
});

describe("newSponsorsFor", () => {
  it("only entries new since the date, still listed, on a route that hires graduates", async () => {
    const out = await newSponsorsFor(student, "2026-11-23T08:00:00Z", 10);
    expect(out.map((s) => s.id).sort()).toEqual(["hiring", "new-gb", "new-nl"]);
  });

  it("counts open roles in the student's field on confirmed board links only", async () => {
    const out = await newSponsorsFor(student, "2026-11-23T08:00:00Z", 10);
    expect(out[0]).toMatchObject({ id: "hiring", openRoles: 2 });
    expect(out.find((s) => s.id === "new-gb")?.openRoles).toBe(0); // its role is in another field
  });

  it("skips markets where the student needs no sponsor", async () => {
    const out = await newSponsorsFor({ ...student, work: { citizenship: "DE", visaCountry: null, visaSituation: null } }, "2026-11-23T08:00:00Z", 10);
    expect(out.every((s) => s.country === "GB")).toBe(true); // a German citizen works freely in NL
  });

  it("a British citizen gets nothing (no sponsor needed in the UK, and Ireland has no register)", async () => {
    expect(await newSponsorsFor({ ...student, work: { citizenship: "GB", visaCountry: null, visaSituation: null }, targetCountries: ["GB", "IE"] }, "2026-11-23T08:00:00Z", 10)).toEqual([]);
  });

  it("a flood of 'new' entries is treated as a matching change and shows none", async () => {
    db.tables.sponsor_licences.push(...Array.from({ length: ANOMALY_PER_WEEK + 5 }, (_, i) => lic(`flood-${i}`)));
    expect(await newSponsorsFor(student, "2026-11-23T08:00:00Z", 10)).toEqual([]);
  });
});
