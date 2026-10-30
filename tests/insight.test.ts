import { describe, expect, it } from "vitest";
import { glassdoorLink, parseInsight } from "@/lib/insight";

describe("parseInsight", () => {
  const reply = 'Here you go:\n```json\n{"summary":"Fintech in London.","pros":["Strong mentoring"],"cons":["Fast pace"],"interviews":"Take-home, then 3 rounds.","sources":[{"title":"Careers","url":"https://monzo.com/careers"},{"title":"GD","url":"https://www.glassdoor.co.uk/Reviews/x"}]}\n```';
  it("reads fenced JSON and merges cited sources, dropping Glassdoor and duplicates", () => {
    const i = parseInsight(reply, [{ url: "https://monzo.com/careers" }, { title: "Reddit thread", url: "https://reddit.com/r/x" }])!;
    expect(i.summary).toBe("Fintech in London.");
    expect(i.sources.map((s) => s.url)).toEqual(["https://monzo.com/careers", "https://reddit.com/r/x"]);
  });
  it("refuses summaries without any source", () => {
    expect(parseInsight('{"summary":"Nice place","sources":[]}')).toBeNull();
    expect(parseInsight("not json")).toBeNull();
  });
  it("rejects non-http links", () => {
    expect(parseInsight('{"summary":"x","sources":[{"url":"javascript:alert(1)"}]}')).toBeNull();
  });
});

describe("glassdoorLink", () => {
  it("links to the right country site", () => {
    expect(glassdoorLink("Monzo Bank", "GB")).toBe("https://www.glassdoor.co.uk/Search/results.htm?keyword=Monzo%20Bank");
  });
});
