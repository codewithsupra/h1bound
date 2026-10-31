import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSessionUser } from "@/lib/insforge/server";
import { createAdminInsForge } from "@/lib/insforge/admin";
import { loadProfile } from "@/lib/server/profile";
import { loadShell } from "@/lib/server/pipeline";
import { hasPaidPlan, referralInfo, trialState } from "@/lib/server/growth";
import { gmailConfigured } from "@/lib/server/gmail";
import { telegramConfigured } from "@/lib/server/telegram";
import { priceForCountry } from "@/lib/billing";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { SettingsView } from "@/components/app/settings-view";

export const metadata = { title: `Settings · ${SITE_NAME}` };

export default async function SettingsPage() {
  // Layouts and pages render in parallel, so each page checks the session itself.
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const [shell, profile, consent, paid, trial, ref, h] = await Promise.all([
    loadShell(user),
    loadProfile(user.id),
    createAdminInsForge().database.from("consents").select("*").eq("user_id", user.id).maybeSingle(),
    hasPaidPlan(user.id),
    trialState(user.id),
    referralInfo(user.id),
    headers(),
  ]);
  const c = (consent.data ?? {}) as { email_updates?: boolean; telegram_updates?: boolean; picks_paused?: boolean };
  const r = profile?.row;
  return (
    <SettingsView
      s={{
        signOff: profile?.details?.signOff ?? shell.firstName ?? "",
        emailTone: r?.email_tone ?? "warm",
        picksPerDay: r?.picks_per_day ?? 5,
        picksHour: r?.picks_hour ?? 8,
        timezone: r?.timezone ?? "Europe/London",
        picksPaused: Boolean(c.picks_paused),
        emailUpdates: Boolean(c.email_updates),
        telegramUpdates: Boolean(c.telegram_updates),
      }}
      plan={{ pro: shell.pro, paid, trialEndsAt: trial.active ? trial.endsAt : null, trialUsed: trial.used, price: priceForCountry(h.get("x-vercel-ip-country")).label }}
      connections={{ gmail: shell.gmail, telegram: shell.telegram, gmailAvailable: gmailConfigured(), telegramAvailable: telegramConfigured(), email: user.email }}
      referral={{ link: `${SITE_URL}/r/${ref.code}`, activated: ref.activated, maxFriends: ref.maxFriends, jobsPerFriend: ref.jobsPerFriend }}
    />
  );
}
