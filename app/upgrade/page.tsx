import Link from "next/link";
import { SiteHeader } from "@/components/site/site-header";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/insforge/server";
import { currencyForCountry, PRICES } from "@/lib/billing";
import { isPro } from "@/lib/server/profile";
import { CheckoutButton } from "./checkout-button";

export const metadata = { title: "Pro · H1Bound" };

const FEATURES: [string, string][] = [
  ["Unlimited matches", "New sponsor jobs every morning, ranked for you."],
  ["Cold emails that reach a person", "Maya finds the likely hiring manager or CTO and drafts a short email plus a follow-up. You send it from your own inbox."],
  ["Interview plans", "A 7-day prep plan for each job, including how to answer the sponsorship question."],
  ["Resume tailoring", "What to move, cut and rewrite for each posting, using only your real experience."],
  ["Unlimited resume reviews", "No caps on jobs or rounds."],
];

export default async function UpgradePage({ searchParams }: { searchParams: Promise<{ canceled?: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?mode=signup");
  if (await isPro(user.id)) redirect("/account");
  const price = PRICES[currencyForCountry((await headers()).get("x-vercel-ip-country"))];
  const { canceled } = await searchParams;

  return (
    <>
    <SiteHeader back>
      <Link href="/chat" className="rounded-full px-3 py-2 text-mist transition-colors hover:text-moon">Back to Maya</Link>
    </SiteHeader>
    <main className="rise mx-auto w-full max-w-xl flex-1 px-4 py-10">
            <h1 className="mt-4 font-display text-4xl font-bold tracking-[-0.01em]">H1Bound Pro</h1>
      <p className="mt-2 text-lg text-slate">{price.label}. Cancel anytime from your account.</p>
      {canceled && <p className="mt-4 rounded-lg border border-line bg-card p-3 text-sm">Checkout canceled. Nothing was charged.</p>}
      <dl className="mt-8 space-y-5">
        {FEATURES.map(([t, d]) => (
          <div key={t}>
            <dt className="font-display font-semibold">{t}</dt>
            <dd className="text-slate">{d}</dd>
          </div>
        ))}
      </dl>
      <CheckoutButton label={`Upgrade for ${price.label}`} />
      <p className="mt-4 text-sm text-slate">Maya can&apos;t promise interviews or visas. Pro gets you better aim and less busywork.</p>
    </main>
    </>
  );
}
