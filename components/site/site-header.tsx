import Link from "next/link";

/**
 * One header for every page: the wordmark always goes home. `back` adds a Home button on the
 * right for dead-end pages (sign in, upgrade); `children` holds page actions, styled as buttons.
 */
export function SiteHeader({ back = false, fixed = false, children }: { back?: boolean; fixed?: boolean; children?: React.ReactNode }) {
  return (
    <header className={`${fixed ? "fixed" : "sticky"} inset-x-0 top-0 z-30 border-b border-transparent bg-night/70 backdrop-blur-md`}>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
        <Link href="/" aria-label="H1Bound home" className="font-display text-lg font-bold tracking-tight transition-opacity hover:opacity-80">
          H1Bound<span className="text-sodium">.</span>
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          {back && (
            <Link href="/" aria-label="Back to home" className="btn-ghost group gap-1.5 !px-3.5 !py-2 text-sm sm:!px-4">
              <span aria-hidden className="transition-transform group-hover:-translate-x-0.5">←</span>
              <span className="hidden sm:inline">Home</span>
            </Link>
          )}
          {children}
        </nav>
      </div>
    </header>
  );
}
