import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/app/sponsors/_components/site-chrome";
import { Unavailable } from "@/components/site/unavailable";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { registerPage, sponsorsHiringNow, type HiringSponsor } from "@/lib/server/hiring-now";

// Hourly: jobs refresh daily, and a build while the database is down heals within the hour.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: `Visa sponsors hiring now in the UK, Netherlands and Ireland · ${SITE_NAME}`,
  description: "Employers on the official UK, Dutch and Irish sponsor registers with open roles right now, from their own job boards. Free list and CSV, no sign-up.",
  alternates: { canonical: `${SITE_URL}/sponsors/hiring` },
};

const COUNTRIES = [
  { code: "GB", name: "United Kingdom", register: "UK Home Office register of licensed sponsors" },
  { code: "NL", name: "Netherlands", register: "IND public register of recognised sponsors" },
  { code: "IE", name: "Ireland", register: "employment permits issued by company (DETE)" },
] as const;

export default async function HiringNow() {
  let rows: HiringSponsor[];
  try {
    rows = await sponsorsHiringNow();
  } catch (e) {
    console.error(`[hiring] database unavailable: ${(e as Error).message}`);
    return <Unavailable what="The hiring list" />;
  }
  const total = rows.reduce((a, r) => a + r.openRoles, 0);

  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 pb-20 pt-6 sm:px-6">
        <h1 className="font-display text-[clamp(2rem,4.5vw,3rem)] font-extrabold leading-[1.05] tracking-[-0.02em]">Visa sponsors hiring now</h1>
        <p className="mt-4 max-w-[44rem] text-lg leading-relaxed text-slate">
          {rows.length.toLocaleString("en-GB")} employers on the official sponsor registers have {total.toLocaleString("en-GB")} open roles on their own job boards today.
          Free to use and download. A licence means an employer can sponsor a visa, not that it will for every role, so ask before you apply.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-2 text-sm">
          <a href="/sponsors/hiring/csv" download className="btn-light !px-4 !py-2">Download the CSV</a>
          {COUNTRIES.map((c) => <a key={c.code} href={`#${c.code}`} className="rounded-full border border-line bg-card px-3 py-1.5 hover:border-sodium/50">{c.name} <span className="text-slate">{rows.filter((r) => r.country === c.code).length}</span></a>)}
        </div>

        <div className="mt-12 space-y-14">
          {COUNTRIES.map((c) => {
            const list = rows.filter((r) => r.country === c.code);
            if (!list.length) return null;
            return (
              <section key={c.code} id={c.code} className="scroll-mt-6">
                <h2 className="font-display text-2xl font-bold">{c.name}</h2>
                <p className="mt-1 text-sm text-slate">On the {c.register}.</p>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[36rem] text-left text-sm">
                    <thead className="text-slate">
                      <tr className="border-b border-line"><th className="py-2 pr-4 font-medium">Employer</th><th className="py-2 pr-4 font-medium">City</th><th className="py-2 pr-4 font-medium">Main roles</th><th className="py-2 text-right font-medium">Open roles</th></tr>
                    </thead>
                    <tbody>
                      {list.slice(0, 150).map((r) => {
                        const page = registerPage(r);
                        return (
                          <tr key={r.id} className="border-b border-line">
                            <td className="py-2.5 pr-4 font-medium">
                              {page ? <Link href={page} className="hover:underline">{r.name}</Link> : r.name}
                              {r.newOnRegister && <span className="ml-2 rounded-full border border-sodium/50 px-2 py-0.5 text-xs text-sodium">new on the register</span>}
                            </td>
                            <td className="py-2.5 pr-4 text-slate">{r.city ?? "—"}</td>
                            <td className="py-2.5 pr-4 text-slate">{r.topRoles.join(", ") || "—"}</td>
                            <td className="py-2.5 text-right tabular-nums">{r.openRoles}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {list.length > 150 && <p className="mt-3 text-sm text-slate">Showing the 150 with the most open roles. The CSV has all {list.length}.</p>}
              </section>
            );
          })}
        </div>

        <section className="mt-16 max-w-[44rem] space-y-3 text-sm leading-relaxed text-slate">
          <h2 className="font-display text-lg font-bold text-moon">How this list is made</h2>
          <p>Employers come from the public registers named above. Roles come from employers&apos; own public job boards (Greenhouse, Lever, Ashby, Recruitee), refreshed daily. An employer is listed only when its job board is confirmed as belonging to that register entry; look-alike names are left out, and so are UK licences rated B.</p>
          <p>Not every role at a licensed employer is open to sponsorship, and sponsored roles must meet a salary floor. <Link href="/chat" className="underline underline-offset-4">Maya</Link> checks both for you, and matches roles to your CV.</p>
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}
