import Link from "next/link";

/** Public-site header and footer, shared by the landing page and the sponsor pages. */

export function SiteHeader() {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
      <Link href="/" className="font-display text-xl font-bold">H1Bound</Link>
      <nav className="flex items-center gap-2 text-sm">
        <Link href="/sponsors" className="hidden rounded-lg px-3 py-2 text-slate hover:text-ink sm:inline">Top sponsors</Link>
        <a href="/login" className="rounded-lg px-3 py-2 text-slate hover:text-ink">Sign in</a>
        <a href="/login?mode=signup" className="rounded-lg bg-ink px-3.5 py-2 font-medium text-paper hover:opacity-90">Start free</a>
      </nav>
    </header>
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
