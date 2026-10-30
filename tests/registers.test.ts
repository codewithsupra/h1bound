import { describe, expect, it } from "vitest";
import { licenceKey, mergeYears, parseCsvLine, parseIePermits, parseNlRegister, parseUkRegister } from "@/lib/ingest/registers";

describe("licenceKey", () => {
  it("drops legal forms and regional words so subsidiaries match the brand", () => {
    expect(licenceKey("Google Ireland Limited")).toBe("google");
    expect(licenceKey("Amazon UK Services Ltd.")).toBe("amazon services");
    expect(licenceKey("Booking.com B.V.")).toBe("booking");
    expect(licenceKey("Stripe Technology Europe Limited")).toBe("stripe technology");
  });
  it("cuts trading-as suffixes and keeps names that are only regional words", () => {
    expect(licenceKey("Mrs Prashanthy Shathyakaran T/A Manor News")).toBe("mrs prashanthy shathyakaran");
    expect(licenceKey("Europe Ltd")).toBe("europe");
  });
});

describe("parseCsvLine", () => {
  it("handles quoted commas and doubled quotes", () => {
    expect(parseCsvLine(' MARGARET ROAD STORES LTD,"HAMILTON, ",,Worker (A rating),Skilled Worker')).toEqual([" MARGARET ROAD STORES LTD", "HAMILTON, ", "", "Worker (A rating)", "Skilled Worker"]);
    expect(parseCsvLine('"Say ""hi"" Ltd",x')).toEqual(['Say "hi" Ltd', "x"]);
  });
});

describe("parseUkRegister", () => {
  const csv = [
    "Organisation Name,Town/City,County,Type & Rating,Route",
    " Monzo Bank Limited,LONDON,,Worker (A rating),Skilled Worker",
    " Monzo Bank Limited,London,,Worker (A rating),Global Business Mobility: Senior or Specialist Worker",
    " Acme Widgets Ltd,\"Hertfordshire, United Kingdom\",,Worker (B rating),Skilled Worker",
    " St Mary's Church,Leeds,,Worker (A rating),Tier 2 Ministers of Religion",
    " NewCo Ltd,Bristol,,Worker (UK Expansion Worker: Provisional ),Scale-up",
    "",
  ].join("\n");
  const rows = parseUkRegister(csv);

  it("keeps job routes only and merges an employer's licences", () => {
    expect(rows.map((r) => r.key).sort()).toEqual(["acme widgets", "monzo bank", "newco"]);
    const monzo = rows.find((r) => r.key === "monzo bank")!;
    expect(monzo.routes).toEqual(["Skilled Worker", "Global Business Mobility: Senior or Specialist Worker"]);
    expect(monzo.city).toBe("London");
    expect(monzo.rating).toBe("A");
  });
  it("reads ratings and cleans places", () => {
    const acme = rows.find((r) => r.key === "acme widgets")!;
    expect(acme.rating).toBe("B");
    expect(acme.city).toBe("Hertfordshire");
    expect(rows.find((r) => r.key === "newco")!.rating).toBe("Provisional");
  });
  it("fails loudly when the Home Office changes the columns", () => {
    expect(() => parseUkRegister("Name,Town\nx,y")).toThrow(/missing column/);
  });
});

describe("parseNlRegister", () => {
  const html = `<table><thead><tr><th scope="col">Organisation</th><th scope="col">KVK (Chamber of Commerce) number</th></tr></thead><tbody>
    <tr><th scope="row">""AAE"" Advanced Automated Equipment B.V.</th><td>17037842</td></tr>
    <tr><th scope="row">Booking.com B.V.</th><td>31047344</td></tr>
    <tr><th scope="row">Ben &amp; Jerry&#39;s Homemade B.V.</th><td>12345678</td></tr></tbody></table>`;
  it("reads names and KVK numbers", () => {
    const rows = parseNlRegister(html);
    expect(rows).toHaveLength(3);
    expect(rows[0].name).toBe('"AAE" Advanced Automated Equipment B.V.');
    expect(rows.find((r) => r.key === "booking")!.regId).toBe("31047344");
    expect(rows.find((r) => r.regId === "12345678")!.name).toBe("Ben & Jerry's Homemade B.V.");
  });
});

describe("parseIePermits", () => {
  // Cell arrays as ExcelJS returns them (index 0 is empty).
  const y2025 = [
    [null, null, "January", "February", "Grand Total"],
    [null, "Grand Total", 3798, 2994, 6792],
    [null, " IQVIA RDS IRELAND LTD", null, 1, 1],
    [null, "Google Ireland Limited", 40, 52, 92],
  ];
  const y2026 = [
    [null, "Employer Name", "Permits Issued Jan", "Permits Issued Grand Total"],
    [null, "Google Ireland Ltd", 30, 30],
  ];
  it("skips headers and totals and reads yearly counts", () => {
    const rows = parseIePermits(y2025, "2025");
    expect(rows.map((r) => [r.key, r.permits["2025"]])).toEqual([["iqvia rds", 1], ["google", 92]]);
  });
  it("combines years, newest name first", () => {
    const merged = mergeYears(parseIePermits(y2025, "2025"), parseIePermits(y2026, "2026"));
    const g = merged.find((r) => r.key === "google")!;
    expect(g.permits).toEqual({ "2025": 92, "2026": 30 });
    expect(g.name).toBe("Google Ireland Ltd");
  });
});
