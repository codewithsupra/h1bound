import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ adminDb: () => ({}) }));
const { hiringCsv, registerPage } = await import("@/lib/server/hiring-now");

const row = { id: "1", name: "Monzo", registerName: "Monzo Bank Ltd", country: "GB" as const, city: "London", slug: "monzo-bank-ltd", rating: "A", routes: ["Skilled Worker"], openRoles: 44, topRoles: ["Software engineers", "Data scientists"], newOnRegister: false };

describe("hiringCsv", () => {
  it("has a header and one quoted row per employer, with the register page", () => {
    const csv = hiringCsv([row], "https://app");
    const [head, line] = csv.trim().split("\r\n");
    expect(head).toBe("employer,register_name,country,city,uk_rating,routes,open_roles,main_roles,new_on_register,register_page");
    expect(line).toBe('"Monzo","Monzo Bank Ltd","GB","London","A","Skilled Worker","44","Software engineers; Data scientists","","https://app/sponsors/uk/monzo-bank-ltd"');
  });
  it("defuses spreadsheet formulas and escapes quotes in names", () => {
    const csv = hiringCsv([{ ...row, name: '=HYPERLINK("http://evil")', registerName: 'He said "hi" Ltd' }], "https://app");
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(csv).toContain('"He said ""hi"" Ltd"');
  });
});

describe("registerPage", () => {
  it("links to the right country's register page", () => {
    expect(registerPage({ country: "NL", slug: "acme" })).toBe("/sponsors/nl/acme");
    expect(registerPage({ country: "IE", slug: "acme" }, "https://app")).toBe("https://app/sponsors/ie/acme");
    expect(registerPage({ country: "GB", slug: null })).toBeNull();
  });
});
