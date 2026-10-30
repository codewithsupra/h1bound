import { describe, expect, it } from "vitest";
import { buildMime, isEmail, parseDraft } from "@/lib/email-draft";

const decode = (b64url: string) => Buffer.from(b64url, "base64url").toString("utf8");

describe("parseDraft", () => {
  it("splits subject, body and follow-up", () => {
    const d = parseDraft("Subject: Graduate data role at Monzo\n\nHi Sam,\n\nI built X.\n\nBest,\nPriya\n\nFollow-up (send after 5 business days):\nHi Sam, just checking in.");
    expect(d.subject).toBe("Graduate data role at Monzo");
    expect(d.body).toBe("Hi Sam,\n\nI built X.\n\nBest,\nPriya");
    expect(d.followUp).toBe("Hi Sam, just checking in.");
  });
  it("copes with no subject or follow-up", () => {
    expect(parseDraft("Hi there")).toEqual({ subject: "", body: "Hi there", followUp: null });
  });
});

describe("buildMime", () => {
  const base = { from: "priya@gmail.com", fromName: "Priya Shah", to: "sam@monzo.com", subject: "Hello", body: "Hi Sam,\nThanks." };
  it("builds a plain-text message", () => {
    const raw = decode(buildMime(base));
    expect(raw).toContain("From: Priya Shah <priya@gmail.com>\r\nTo: sam@monzo.com\r\nSubject: Hello\r\n");
    const body = raw.split("\r\n\r\n")[1];
    expect(Buffer.from(body, "base64").toString("utf8")).toBe("Hi Sam,\r\nThanks.");
  });
  it("blocks header injection through the subject", () => {
    const raw = decode(buildMime({ ...base, subject: "Hi\r\nBcc: everyone@x.com" }));
    expect(raw).not.toMatch(/\r\nBcc:/);
    expect(raw).toContain("Subject: Hi Bcc: everyone@x.com");
  });
  it("encodes non-ASCII subjects", () => {
    expect(decode(buildMime({ ...base, subject: "Café role" }))).toContain("Subject: =?UTF-8?B?");
  });
  it("rejects bad addresses and empty messages", () => {
    expect(() => buildMime({ ...base, to: "sam@monzo.com, boss@x.com" })).toThrow();
    expect(() => buildMime({ ...base, to: "sam@monzo.com\r\nBcc: x@y.com" })).toThrow();
    expect(() => buildMime({ ...base, body: "  " })).toThrow();
    expect(isEmail("a@b.co")).toBe(true);
  });
});
