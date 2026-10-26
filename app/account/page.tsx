import { redirect } from "next/navigation";
import { createAdminInsForge } from "@/lib/insforge/admin";
import { getSessionUser } from "@/lib/insforge/server";
import { isPro, loadUsage } from "@/lib/server/profile";
import { FREE_LIMITS } from "@/lib/quota";
import { AccountControls } from "./controls";

export const metadata = { title: "Account · H1Bound" };

export default async function AccountPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const [pro, usage, consent] = await Promise.all([
    isPro(user.id),
    loadUsage(user.id),
    createAdminInsForge().database.from("consents").select("email_updates").eq("user_id", user.id).maybeSingle(),
  ]);
  const emailUpdates = Boolean((consent.data as { email_updates?: boolean } | null)?.email_updates);

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-10">
      <a href="/chat" className="text-sm text-slate hover:text-ink">Back to Maya</a>
      <h1 className="mt-4 font-display text-3xl font-bold">Account</h1>
      <p className="mt-1 text-slate">{user.email}</p>

      <section className="mt-8 rounded-xl border border-line bg-card p-5">
        <h2 className="font-display text-lg font-semibold">Plan</h2>
        {pro ? (
          <p className="mt-1">Pro. Unlimited matches, cold emails, interview plans and tailoring.</p>
        ) : (
          <>
            <p className="mt-1">Free. {Math.max(0, FREE_LIMITS.jobs - usage.jobsShown)} of {FREE_LIMITS.jobs} matches left, reviews on {Math.max(0, FREE_LIMITS.reviewedJobs - usage.reviewedJobIds.length)} more jobs, {Math.max(0, FREE_LIMITS.reviewRounds - usage.reviewRounds)} review rounds left.</p>
            <a href="/upgrade" className="mt-3 inline-block rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-paper">See Pro</a>
          </>
        )}
      </section>

      <AccountControls emailUpdates={emailUpdates} />

      <p className="mt-8 text-sm text-slate">
        What we keep: your parsed resume (encrypted), your chat with Maya (encrypted), the jobs you were shown and your notes on them. Your original file is never stored. Deleting your account erases all of it.
      </p>
    </main>
  );
}
