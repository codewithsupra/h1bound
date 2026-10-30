import Link from "next/link";
import { SiteHeader } from "@/components/site/site-header";
import { redirect } from "next/navigation";
import { createAdminInsForge } from "@/lib/insforge/admin";
import { getSessionUser } from "@/lib/insforge/server";
import { isPro, loadUsage } from "@/lib/server/profile";
import { FREE_LIMITS, freeJobLimit } from "@/lib/quota";
import { referralInfo, trialState } from "@/lib/server/growth";
import { SITE_URL } from "@/lib/site";
import { InviteCard } from "@/components/growth/invite-card";
import { TrialButton } from "@/components/growth/trial-button";
import { AccountControls } from "./controls";

export const metadata = { title: "Account · H1Bound" };

export default async function AccountPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const [pro, usage, consent, ref, trial] = await Promise.all([
    isPro(user.id),
    loadUsage(user.id),
    createAdminInsForge().database.from("consents").select("email_updates").eq("user_id", user.id).maybeSingle(),
    referralInfo(user.id),
    trialState(user.id),
  ]);
  const jobLimit = freeJobLimit(ref.activated);
  const emailUpdates = Boolean((consent.data as { email_updates?: boolean } | null)?.email_updates);

  return (
    <>
    <SiteHeader back>
      <Link href="/chat" className="btn-light !px-4 !py-2 text-sm">Back to Maya</Link>
    </SiteHeader>
    <main className="rise mx-auto w-full max-w-xl flex-1 px-4 py-10">
            <h1 className="mt-4 font-display text-3xl font-bold">Account</h1>
      <p className="mt-1 text-slate">{user.email}</p>

      <section className="mt-8 glass rounded-3xl p-6">
        <h2 className="font-display text-lg font-semibold">Plan</h2>
        {pro ? (
          <p className="mt-1">
            {trial.active && trial.endsAt ? `Pro trial, until ${new Date(trial.endsAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}. ` : "Pro. "}
            Unlimited matches, cold emails, interview plans and tailoring.
            {trial.active && <a href="/upgrade" className="ml-1 text-sodium underline">Keep Pro</a>}
          </p>
        ) : (
          <>
            <p className="mt-1">Free. {Math.max(0, jobLimit - usage.jobsShown)} of {jobLimit} matches left, reviews on {Math.max(0, FREE_LIMITS.reviewedJobs - usage.reviewedJobIds.length)} more jobs, {Math.max(0, FREE_LIMITS.reviewRounds - usage.reviewRounds)} review rounds left.</p>
            <div className="mt-4 flex flex-wrap items-start gap-2">
              {!trial.used && <TrialButton />}
              <a href="/upgrade" className="btn-ghost !px-4 !py-2 text-sm">See Pro</a>
            </div>
          </>
        )}
      </section>

      <div className="mt-6">
        <InviteCard link={`${SITE_URL}/r/${ref.code}`} activated={ref.activated} maxFriends={ref.maxFriends} jobsPerFriend={ref.jobsPerFriend} />
      </div>

      <AccountControls emailUpdates={emailUpdates} />

      <p className="mt-8 text-sm text-slate">
        What we keep: your parsed resume (encrypted), your chat with Maya (encrypted), the jobs you were shown and your notes on them. Your original file is never stored. Deleting your account erases all of it.
      </p>
    </main>
    </>
  );
}
