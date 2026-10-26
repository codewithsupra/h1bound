import { describe, expect, it } from "vitest";
import { boardSlugs, fetchBoard, fromAshby, fromGreenhouse, fromLever, htmlToText } from "@/lib/ingest/ats";
import { jobBadge } from "@/lib/sponsor";

describe("htmlToText", () => {
  it("decodes Greenhouse's escaped HTML", () => {
    expect(htmlToText("&lt;h2&gt;Who we are&lt;/h2&gt;&lt;p&gt;We &amp;amp; you&lt;/p&gt;")).toBe("Who we are\nWe & you");
  });
});

describe("normalizers", () => {
  it("greenhouse", () => {
    const j = fromGreenhouse("stripe", "Stripe", { id: 1, title: " Software Engineer ", absolute_url: "u", location: { name: "Remote - US" }, content: "&lt;p&gt;We can't sponsor visas&lt;/p&gt;", first_published: "2026-10-01T00:00:00Z" });
    expect(j).toMatchObject({ sourceId: "stripe:1", title: "Software Engineer", remote: true, isUs: true, jdSponsorship: "no" });
  });
  it("lever", () => {
    const j = fromLever("palantir", "Palantir", { id: "x", text: "FDSE", hostedUrl: "h", categories: { location: "Singapore, Singapore" }, workplaceType: "onsite", createdAt: 1786469891368, descriptionPlain: "Build" });
    expect(j).toMatchObject({ sourceId: "palantir:x", isUs: false, remote: false });
    expect(j.postedAt).toMatch(/^2026-/);
  });
  it("ashby", () => {
    const j = fromAshby("ramp", "Ramp", { id: "y", title: "Security Engineer", jobUrl: "j", location: "New York, NY (HQ)", isRemote: true, descriptionPlain: "Visa sponsorship is available." });
    expect(j).toMatchObject({ isUs: true, remote: true, jdSponsorship: "yes" });
  });
});

describe("fetchBoard", () => {
  it("returns null on 404 and normalizes on 200", async () => {
    const f404 = async () => ({ ok: false, status: 404, json: async () => ({}) });
    expect(await fetchBoard("greenhouse", "nope", "Nope", f404)).toBeNull();
    const fOk = async () => ({ ok: true, status: 200, json: async () => ({ jobs: [{ id: "a", title: "SWE", jobUrl: "u", isListed: true }, { id: "b", title: "Hidden", jobUrl: "u", isListed: false }] }) });
    expect((await fetchBoard("ashby", "ramp", "Ramp", fOk))!.map((j) => j.title)).toEqual(["SWE"]);
  });
});

describe("boardSlugs / jobBadge", () => {
  it("guesses slugs", () => expect(boardSlugs("Scale AI")).toEqual(["scaleai", "scale-ai", "scale"]));
  it("posting refusal overrides strong company history", () => {
    const strong = { fiscalYear: 2026, total: 900, byFamily: {}, lastFiled: null };
    expect(jobBadge(strong, "software_engineer", "no").level).toBe("none");
    expect(jobBadge(null, "software_engineer", "yes").level).toBe("some");
  });
});
