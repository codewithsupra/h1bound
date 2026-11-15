import { describe, expect, it } from "vitest";
import { digestDue, digestEmail, visaCountdown, visaName, type DigestInput } from "@/lib/digest";

const DAY = 86_400_000;
const now = Date.parse("2026-11-15T08:00:00Z");

describe("digestDue", () => {
  it("paid and trial: once a day", () => {
    expect(digestDue({ paidOrTrial: true, lastAt: null, now })).toBe(true);
    expect(digestDue({ paidOrTrial: true, lastAt: now - 3_600_000, now })).toBe(false);
    expect(digestDue({ paidOrTrial: true, lastAt: now - DAY, now })).toBe(true);
  });
  it("free: once a week, at the same chosen hour", () => {
    expect(digestDue({ paidOrTrial: false, lastAt: null, now })).toBe(true);
    expect(digestDue({ paidOrTrial: false, lastAt: now - DAY, now })).toBe(false);
    expect(digestDue({ paidOrTrial: false, lastAt: now - 6 * DAY, now })).toBe(false);
    expect(digestDue({ paidOrTrial: false, lastAt: now - 7 * DAY, now })).toBe(true);
  });
});

describe("visaName", () => {
  it("names the visa the way the person holds it", () => {
    expect(visaName("graduate", "GB")).toBe("Graduate visa");
    expect(visaName("graduate", "IE")).toBe("Stamp 1G");
    expect(visaName("graduate", "NL")).toBe("orientation year permit");
    expect(visaName("student", "GB")).toBe("UK student visa");
    expect(visaName("none", "GB")).toBeNull();
    expect(visaName(null, null)).toBeNull();
  });
});

describe("visaCountdown", () => {
  it("counts the days to the end date", () => {
    const c = visaCountdown({ visa_ends_on: "2027-04-07", visa_situation: "graduate", visa_country: "GB" }, now);
    expect(c?.days).toBe(144);
    expect(c?.level).toBe("soon");
    expect(c?.line).toBe("144 days left on your Graduate visa (ends 7 Apr 2027).");
  });
  it("under 90 days: says sponsors come first", () => {
    const c = visaCountdown({ visa_ends_on: "2027-01-10", visa_situation: "graduate", visa_country: "GB" }, now);
    expect(c?.level).toBe("urgent");
    expect(c?.line).toMatch(/^57 days left.*licensed sponsor/);
  });
  it("past the end date: asks them to check it rather than counting negative days", () => {
    expect(visaCountdown({ visa_ends_on: "2026-10-01", visa_situation: "student", visa_country: "IE" }, now)?.line).toMatch(/has passed/);
  });
  it("no countdown without an end date or a visa that runs out", () => {
    expect(visaCountdown({ visa_ends_on: null, visa_situation: "graduate", visa_country: "GB" }, now)).toBeNull();
    expect(visaCountdown({ visa_ends_on: "2027-04-07", visa_situation: "none", visa_country: "GB" }, now)).toBeNull();
  });
});

const job = (over: Partial<DigestInput["jobs"][number]> = {}): DigestInput["jobs"][number] => ({
  id: "j1", title: "Graduate Data Analyst", company: "Monzo", location: "London", remote: false, url: "https://jobs.example/1",
  badge: { label: "Licensed sponsor", detail: "On the UK Home Office sponsor register (A-rated, Skilled Worker licence)" }, ...over,
});
const base: DigestInput = {
  firstName: "Asha", paid: true, countdown: visaCountdown({ visa_ends_on: "2027-04-07", visa_situation: "graduate", visa_country: "GB" }, now),
  jobs: [job()], hiddenCount: 0, appUrl: "https://app", siteName: "Sponsorbound", unsubscribeUrl: "https://app/u/t",
};

describe("digestEmail", () => {
  it("opens with the countdown and puts it in the subject", () => {
    const e = digestEmail(base)!;
    expect(e.subject).toBe("144 days left: 1 new job at licensed sponsors");
    expect(e.text.split("\n\n")[1]).toBe("144 days left on your Graduate visa (ends 7 Apr 2027).");
    expect(e.text).toContain("On the UK Home Office sponsor register");
    expect(e.text).toContain("Unsubscribe: https://app/u/t");
  });
  it("shows the pay check on paid digests", () => {
    const e = digestEmail({ ...base, jobs: [job({ salary: { status: "meets", text: "Posted pay £45,000 a year meets the £33,400 Skilled Worker new-entrant rate.", source: "https://www.gov.uk" } })] })!;
    expect(e.text).toContain("Pay meets the visa floor: Posted pay £45,000");
    expect(e.text).not.toContain("/upgrade");
  });
  it("free digest: weekly wording and an honest note of what Pro adds", () => {
    const e = digestEmail({ ...base, paid: false })!;
    expect(e.text).toContain("New this week");
    expect(e.text).toContain("Pro sends these daily and checks each job's posted pay");
  });
  it("free plan out of jobs: still sends the countdown and how many matched", () => {
    const e = digestEmail({ ...base, paid: false, jobs: [], hiddenCount: 6 })!;
    expect(e.subject).toBe("144 days left: 6 new sponsor jobs matched you");
    expect(e.text).toContain("6 more new jobs at licensed sponsors matched you this week");
    expect(e.text).toContain("https://app/upgrade");
  });
  it("asks for the end date when there's no countdown", () => {
    const e = digestEmail({ ...base, countdown: null })!;
    expect(e.subject).toBe("1 new job at licensed sponsors today");
    expect(e.text).toContain("Add your visa end date");
  });
  it("sends nothing when nothing matched", () => {
    expect(digestEmail({ ...base, jobs: [], hiddenCount: 0 })).toBeNull();
  });
  it("never promises sponsorship", () => {
    const e = digestEmail({ ...base, paid: false, jobs: [], hiddenCount: 2 })!;
    for (const t of [digestEmail(base)!.text, e.text]) {
      expect(t).not.toMatch(/will sponsor|guarantee|can sponsor you/i);
      expect(t).toMatch(/not that it will/);
    }
  });
});
