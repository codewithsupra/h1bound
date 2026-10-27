import Link from "next/link";
import { SiteHeader as SharedHeader } from "@/components/site/site-header";

/** Sponsor pages use the shared header (logo → home) with sponsor-specific nav. */
export function SiteHeader() {
  return (
    <SharedHeader>
      <Link href="/sponsors" className="hidden rounded-full px-3 py-2 text-mist transition-colors hover:text-moon sm:inline">Top sponsors</Link>
      <Link href="/login" className="rounded-full px-3 py-2 text-mist transition-colors hover:text-moon">Sign in</Link>
      <Link href="/chat" className="btn-light !px-4 !py-2 text-sm">Try Maya</Link>
    </SharedHeader>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-slate sm:flex-row sm:justify-between sm:px-6">
        <p>Sponsorship data: US Dept. of Labor LCA disclosures, FY2026 Q3. A filing isn&apos;t a visa guarantee.</p>
        <p>Your resume is read once and stored encrypted. Delete everything anytime from your account.</p>
      </div>
    </footer>
  );
}
