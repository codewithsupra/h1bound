import { describe, expect, it } from "vitest";
import { caseStrength, groupOf, groupRows, nextAction, replyStats, stageOf, tabCounts, visaUrgency, type PipelineRow } from "@/lib/pipeline";

const now = Date.parse("2026-11-01T12:00:00Z");
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();

function row(p: Partial<PipelineRow> = {}): PipelineRow {
  return {
    jobId: Math.random().toString(36).slice(2), title: "Graduate Software Engineer", company: "Monzo", location: "London", country: "GB", remote: false,
    url: "https://x", score: 80, why: null, status: "shown", statusAt: daysAgo(1), shownAt: daysAgo(1), licence: null, contact: null,
    draft: null, askedReplyAt: null, hasNote: false, ...p,
  };
}
const draft = (p: Partial<NonNullable<PipelineRow["draft"]>> = {}) => ({ outreachId: "o", followUpId: "f", sentAt: null, followUpSentAt: null, ...p });

describe("nextAction", () => {
  it("new picks ask Maya for a draft; drafted ones are ready to send", () => {
    expect(nextAction(row(), now)).toBe("write");
    expect(nextAction(row({ draft: draft() }), now)).toBe("draft_ready");
  });
  it("follow-up unlocks 4 days after a tracked send", () => {
    expect(nextAction(row({ status: "emailed", draft: draft({ sentAt: daysAgo(2) }) }), now)).toBe("waiting");
    expect(nextAction(row({ status: "emailed", draft: draft({ sentAt: daysAgo(4) }) }), now)).toBe("follow_up");
  });
  it("asks 'any reply?' a week after the last email, at most weekly", () => {
    const sent = draft({ sentAt: daysAgo(8), followUpSentAt: daysAgo(4) });
    expect(nextAction(row({ status: "emailed", draft: sent }), now)).toBe("ask_reply");
    expect(nextAction(row({ status: "emailed", draft: sent, askedReplyAt: daysAgo(2) }), now)).toBe("waiting");
  });
  it("hand-marked emails check in a week after they were marked", () => {
    expect(nextAction(row({ status: "emailed", statusAt: daysAgo(3) }), now)).toBe("waiting");
    expect(nextAction(row({ status: "emailed", statusAt: daysAgo(9) }), now)).toBe("ask_reply");
  });
  it("later stages", () => {
    expect(nextAction(row({ status: "replied" }), now)).toBe("respond");
    expect(nextAction(row({ status: "interview" }), now)).toBe("prep");
    expect(nextAction(row({ status: "offer" }), now)).toBe("none");
    expect(stageOf("dismissed")).toBe("closed");
  });
});

describe("grouping", () => {
  it("puts actionable rows under Needs you and counts tabs", () => {
    const rows = [row({ draft: draft() }), row(), row({ status: "emailed", draft: draft({ sentAt: daysAgo(1) }) }), row({ status: "interview" }), row({ status: "rejected" })];
    expect(rows.map((r) => groupOf(r, now))).toEqual(["needs_you", "new", "waiting", "interviewing", "closed"]);
    expect(tabCounts(rows, now)).toEqual({ all: 4, needs_you: 1, waiting: 1, interviewing: 1, closed: 1 });
  });
  it("sorts sponsors first when the visa clock is urgent", () => {
    const sponsor = row({ score: 60, licence: { country: "GB", rating: "A", routes: [], permits: {} } });
    const bRated = row({ score: 90, licence: { country: "GB", rating: "B", routes: [], permits: {} } });
    const none = row({ score: 95 });
    expect(groupRows([none, bRated, sponsor], now, false).new.map((r) => r.score)).toEqual([95, 90, 60]);
    expect(groupRows([none, bRated, sponsor], now, true).new[0]).toBe(sponsor);
  });
});

describe("visaUrgency", () => {
  it("levels by days left", () => {
    expect(visaUrgency("2027-06-01", now)?.level).toBe("calm");
    expect(visaUrgency("2027-03-01", now)?.level).toBe("soon");
    expect(visaUrgency("2026-12-31", now)).toEqual({ days: 61, level: "urgent" });
    expect(visaUrgency("2026-10-01", now)).toEqual({ days: 0, level: "expired" });
    expect(visaUrgency(null, now)).toBeNull();
    expect(visaUrgency("soon", now)).toBeNull();
  });
});

describe("replyStats", () => {
  it("is hidden until 5 emails were sent", () => {
    const four = [1, 2, 3, 4].map(() => row({ status: "emailed" }));
    expect(replyStats(four).show).toBe(false);
    const rows = [...four, row({ status: "replied" }), row({ status: "interview" }), row(), row({ status: "dismissed" })];
    expect(replyStats(rows)).toEqual({ sent: 6, replied: 2, interviews: 1, rate: 33, show: true });
  });
});

describe("caseStrength", () => {
  it("only asks for a visa end date from students and graduates", () => {
    const base = { resume: true, citizenship: "IN", visaSituation: "none", visaEndsOn: null, links: 1, pitch: "Backend engineer who ships reliable APIs", targetCountries: 2 };
    expect(caseStrength(base).done).toBe(6);
    expect(caseStrength({ ...base, visaSituation: "graduate" }).done).toBe(5);
    expect(caseStrength({ ...base, pitch: "hi", links: 0 }).done).toBe(4);
  });
});
