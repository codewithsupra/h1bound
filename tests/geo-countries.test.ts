import { describe, expect, it } from "vitest";
import { countriesIn, remoteScope } from "@/lib/geo";

describe("countriesIn", () => {
  it("finds UK, NL and IE locations", () => {
    expect(countriesIn("London, UK")).toEqual(["GB"]);
    expect(countriesIn("Edinburgh")).toEqual(["GB"]);
    expect(countriesIn("Amsterdam, North Holland, Netherlands")).toEqual(["NL"]);
    expect(countriesIn("Dublin")).toEqual(["IE"]);
    expect(countriesIn("Amsterdam or Dublin")).toEqual(["NL", "IE"]);
  });
  it("keeps Northern Ireland in the UK", () => {
    expect(countriesIn("Belfast, Northern Ireland")).toEqual(["GB"]);
  });
  it("tells the two Cambridges apart", () => {
    expect(countriesIn("Cambridge, MA")).toEqual(["US"]);
    expect(countriesIn("Cambridge, UK")).toEqual(["GB"]);
  });
  it("returns nothing for unknown places", () => {
    expect(countriesIn("Remote")).toEqual([]);
    expect(countriesIn("Berlin, Germany")).toEqual([]);
  });
});

describe("remoteScope", () => {
  it("classifies remote locations", () => {
    expect(remoteScope("Remote - Worldwide")).toBe("anywhere");
    expect(remoteScope("Remote (UK)")).toBe("country");
    expect(remoteScope("Remote, EMEA")).toBe("europe");
    expect(remoteScope("Remote - US")).toBe("us");
    expect(remoteScope("Remote")).toBe("unknown");
  });
});

describe("US places with European names", () => {
  it("lets a US state code win over a city name", () => {
    expect(countriesIn("Dublin, OH")).toEqual(["US"]);
    expect(countriesIn("Birmingham, AL")).toEqual(["US"]);
    expect(countriesIn("New York, NY")).toEqual(["US"]);
    expect(countriesIn("Manchester, England")).toEqual(["GB"]);
  });
});
