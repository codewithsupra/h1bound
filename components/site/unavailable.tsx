import Link from "next/link";

/**
 * Shown when a page's data can't be loaded (the database is unreachable). An honest message beats an
 * error page or a page that looks empty; pages that show this revalidate hourly, so it clears by itself.
 */
export function Unavailable({ what = "This page" }: { what?: string }) {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-xl flex-1 flex-col justify-center px-4 py-16">
      <h1 className="font-display text-2xl font-semibold">{what} is temporarily unavailable.</h1>
      <p className="mt-3 leading-relaxed text-mist">
        We can&apos;t reach our data right now. Nothing is lost; try again in a few minutes.
      </p>
      <Link href="/" className="btn-ghost mt-6 self-start !px-4 !py-2 text-sm">Back to the home page</Link>
    </main>
  );
}
