import { describe, expect, it } from "vitest";
import { feedJobUseful, fetchRemoteOk, fromHimalayas } from "@/lib/ingest/feeds";
import { fromGreenhouse, fromRecruitee, keepJob } from "@/lib/ingest/ats";

describe("job countries from boards", () => {
  it("keeps London jobs from a US company's board and tags them GB", () => {
    const j = fromGreenhouse("stripe", "Stripe", { id: 9, title: "Software Engineer, New Grad", absolute_url: "u", location: { name: "London, UK" }, content: "" });
    expect(j).toMatchObject({ country: "GB", isUs: false, remoteScope: null, seniority: "graduate" });
    expect(keepJob(j)).toBe(true);
  });
  it("drops jobs outside our markets", () => {
    expect(keepJob(fromGreenhouse("x", "X", { id: 1, title: "Engineer", absolute_url: "u", location: { name: "Berlin, Germany" } }))).toBe(false);
  });
  it("reads Recruitee country codes", () => {
    const j = fromRecruitee("bunq", "bunq", { id: 2800490, title: "Data Scientist Marketing", careers_url: "c", location: "Amsterdam, Noord-Holland, Netherlands", country_code: "NL", published_at: "2026-10-28 13:21:58 UTC", description: "<p>Kennismigrant visa support available.</p>" });
    expect(j).toMatchObject({ source: "recruitee", country: "NL", jdSponsorship: "yes" });
    expect(j.postedAt).toBe("2026-10-28T13:21:58.000Z");
  });
});

describe("remote feeds", () => {
  it("filters noisy listings", () => {
    expect(feedJobUseful("Vertriebsmitarbeiter Innendienst (m/w/d)")).toBe(false);
    expect(feedJobUseful("Online Maths Tutor – Flexible Remote Role")).toBe(false);
    expect(feedJobUseful("Junior Data Analyst")).toBe(true);
  });
  it("reads Himalayas location restrictions", () => {
    const uk = fromHimalayas({ title: "Junior Data Analyst", companyName: "Acme", guid: "g1", applicationLink: "a", locationRestrictions: ["United Kingdom"], pubDate: 1793377128 });
    expect(uk).toMatchObject({ country: "GB", remote: true, remoteScope: "country", source: "himalayas" });
    const ww = fromHimalayas({ title: "Backend Developer", companyName: "Acme", guid: "g2", applicationLink: "a", locationRestrictions: [] });
    expect(ww).toMatchObject({ country: null, remoteScope: "anywhere" });
    expect(keepJob(ww)).toBe(true);
    const de = fromHimalayas({ title: "Backend Developer", companyName: "Acme", guid: "g3", applicationLink: "a", locationRestrictions: ["Germany"] });
    expect(de.country).toBeNull();
  });
  it("skips the Remote OK legal notice", async () => {
    const f = async () => ({ ok: true, status: 200, json: async () => [{ legal: "API Terms", id: "" }, { id: 1, position: "Python Developer", company: "Co", location: "Worldwide", url: "https://remoteok.com/remote-jobs/1" }] });
    const jobs = await fetchRemoteOk(f);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ source: "remoteok", remoteScope: "anywhere" });
  });
});

describe("long Himalayas location lists", () => {
  it("puts our markets first and shortens the rest", () => {
    const j = fromHimalayas({ title: "Backend Engineer", companyName: "Acme", guid: "g9", applicationLink: "a", locationRestrictions: ["Albania", "Andorra", "Ireland", "Netherlands", "United Kingdom", "Spain"] });
    expect(j.location).toBe("Remote (Ireland, Netherlands, United Kingdom + 3 more)");
    expect(j.country).toBe("GB");
  });
});
