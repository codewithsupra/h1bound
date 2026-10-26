import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/landing/site-chrome";

export default function SponsorNotFound() {
  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-16 sm:px-6">
        <h1 className="font-display text-3xl font-bold">We don&apos;t have that employer</h1>
        <p className="mt-3 text-slate">No H-1B labor filings in FY2026 under this name. They may file under a different legal name.</p>
        <p className="mt-6 flex flex-wrap gap-4">
          <Link href="/#lookup" className="font-medium underline underline-offset-4">Search for a company</Link>
          <Link href="/sponsors" className="font-medium underline underline-offset-4">Browse top sponsors</Link>
        </p>
      </div>
      <SiteFooter />
    </main>
  );
}
