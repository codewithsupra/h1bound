"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { exportData, saveSettings, type SettingsPatch } from "@/app/(app)/actions";
import { deleteAccount, disconnectGmailAction, disconnectTelegramAction, type DeleteState } from "@/app/actions/account";
import { signOut } from "@/app/actions/auth";
import { InviteCard } from "@/components/growth/invite-card";
import { TrialButton } from "@/components/growth/trial-button";
import { PICKS_MAX, PICKS_MIN, TRIAL_PICKS } from "@/lib/picks";
import { Card, Row } from "./ui";

type S = { signOff: string; emailTone: string; picksPerDay: number; picksHour: number; timezone: string; picksPaused: boolean; emailUpdates: boolean; telegramUpdates: boolean };
type Plan = { pro: boolean; paid: boolean; trialEndsAt: string | null; trialUsed: boolean; price: string };
type Conn = { gmail: boolean; telegram: boolean; gmailAvailable: boolean; telegramAvailable: boolean; email: string };

const TONES = [
  { key: "plain", label: "Plain", sample: "I'm a data engineer graduating from TU Delft in June. Could we talk for 15 minutes?" },
  { key: "warm", label: "Warm", sample: "Your post about the new pricing engine caught my eye. I've built something close to it and would love 15 minutes." },
  { key: "direct", label: "Direct", sample: "Can I get 15 minutes on the Graduate Data Engineer role? I cut a 6-hour pipeline to 20 minutes." },
];
const ZONES = ["Europe/London", "Europe/Dublin", "Europe/Amsterdam", "Europe/Berlin", "Asia/Kolkata", "Asia/Dubai", "Asia/Muscat", "Asia/Karachi", "Asia/Dhaka", "Asia/Shanghai", "Africa/Lagos", "America/New_York"];
const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;

function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40 ${on ? "bg-sodium" : "bg-haze"}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-moon transition-[left] ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

export function SettingsView({ s: initial, plan, connections, referral }: { s: S; plan: Plan; connections: Conn; referral: { link: string; activated: number; maxFriends: number; jobsPerFriend: number } }) {
  const [s, setS] = useState(initial);
  const [saved, setSaved] = useState<string | null>(null);
  const [, start] = useTransition();
  const apply = (patch: SettingsPatch & Partial<S>, note = "Saved") => {
    setS((x) => ({ ...x, ...patch }));
    start(async () => { await saveSettings(patch); setSaved(note); setTimeout(() => setSaved(null), 1800); });
  };
  const trial = Boolean(plan.trialEndsAt) && !plan.paid;
  const maxPicks = plan.paid ? PICKS_MAX : trial ? TRIAL_PICKS : 1;
  const noChannel = !s.picksPaused && !s.emailUpdates && !(s.telegramUpdates && connections.telegram);

  return (
    <div className="mx-auto max-w-[72rem] px-4 py-6 sm:px-8 sm:py-8">
      <div className="flex items-end justify-between gap-3">
        <h1 className="font-display text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-green" aria-live="polite">{saved}</p>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-5">
          <Card title="Your emails" sub="How every email Maya drafts for you reads. Nothing sends until you tap Send.">
            <Row label="Sign-off">
              <input defaultValue={s.signOff} maxLength={80} onBlur={(e) => { if (e.target.value !== s.signOff) apply({ signOff: e.target.value }); }}
                className="h-9 w-full max-w-xs rounded-xl border border-haze bg-night/60 px-3 text-sm outline-none focus:border-moon/40" placeholder="Priya" />
            </Row>
            <Row label="Tone">
              <div>
                <div className="flex rounded-full border border-haze p-0.5 text-sm" role="radiogroup" aria-label="Tone">
                  {TONES.map((t) => (
                    <button key={t.key} role="radio" aria-checked={s.emailTone === t.key} onClick={() => apply({ emailTone: t.key })}
                      className={`flex-1 rounded-full px-3 py-1.5 ${s.emailTone === t.key ? "bg-moon/10 text-moon" : "text-mist"}`}>{t.label}</button>
                  ))}
                </div>
                <p className="mt-2 text-xs italic leading-relaxed text-mist">&ldquo;{TONES.find((t) => t.key === s.emailTone)?.sample}&rdquo;</p>
              </div>
            </Row>
          </Card>

          <Card title="Daily picks" sub="Fresh jobs that fit you, each with register proof, delivered when you want them.">
            <Row label="Send me picks">
              <div className="flex items-center justify-between gap-3">
                <span>{s.picksPaused ? "Paused" : "Every day"}{noChannel && <span className="block text-xs text-sodium">Turn on email or Telegram below to receive them.</span>}</span>
                <Toggle on={!s.picksPaused} onChange={(v) => apply({ picksPaused: !v }, v ? "Picks back on" : "Picks paused")} label="Daily picks" />
              </div>
            </Row>
            <Row label="How many">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center rounded-full border border-haze">
                  <button aria-label="Fewer" disabled={s.picksPerDay <= PICKS_MIN} onClick={() => apply({ picksPerDay: s.picksPerDay - 1 })} className="h-8 w-9 text-lg text-mist hover:text-moon disabled:opacity-30">−</button>
                  <span className="w-8 text-center font-display text-lg font-bold">{s.picksPerDay}</span>
                  <button aria-label="More" disabled={s.picksPerDay >= PICKS_MAX} onClick={() => apply({ picksPerDay: s.picksPerDay + 1 })} className="h-8 w-9 text-lg text-mist hover:text-moon disabled:opacity-30">+</button>
                </div>
                <span className="flex gap-1" aria-hidden>
                  {Array.from({ length: PICKS_MAX }, (_, i) => <span key={i} className={`h-2 w-2 rounded-full ${i < Math.min(s.picksPerDay, maxPicks) ? "bg-sodium" : i < s.picksPerDay ? "bg-sodium/30" : "bg-haze"}`} />)}
                </span>
                {!plan.paid && <span className="w-full text-xs text-mist">{trial ? `Your trial sends up to ${TRIAL_PICKS} a day.` : "Free accounts get 1 a day while matches last."} <Link href="/upgrade" className="text-sodium">Pro sends up to {PICKS_MAX}.</Link></span>}
              </div>
            </Row>
            <Row label="Arrives at">
              <div className="flex flex-wrap gap-2">
                <select value={s.picksHour} onChange={(e) => apply({ picksHour: Number(e.target.value) })} className="h-9 rounded-xl border border-haze bg-night/60 px-2 text-sm">
                  {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
                </select>
                <select value={s.timezone} onChange={(e) => apply({ timezone: e.target.value })} className="h-9 rounded-xl border border-haze bg-night/60 px-2 text-sm">
                  {[...new Set([s.timezone, ...ZONES])].map((z) => <option key={z} value={z}>{z.replace("_", " ")}</option>)}
                </select>
                <button onClick={() => { const z = Intl.DateTimeFormat().resolvedOptions().timeZone; if (z) apply({ timezone: z }, `Timezone set to ${z}`); }} className="rounded-full px-2 text-xs text-runway hover:underline">Use my timezone</button>
              </div>
            </Row>
            <Row label="By email">
              <div className="flex items-center justify-between gap-3"><span className="truncate text-mist">{connections.email}</span><Toggle on={s.emailUpdates} onChange={(v) => apply({ emailUpdates: v })} label="Picks by email" /></div>
            </Row>
            <Row label="By Telegram">
              <div className="flex items-center justify-between gap-3">
                <span className="text-mist">{connections.telegram ? "Connected" : "Connect Telegram below first"}</span>
                <Toggle on={s.telegramUpdates && connections.telegram} disabled={!connections.telegram} onChange={(v) => apply({ telegramUpdates: v })} label="Picks by Telegram" />
              </div>
            </Row>
          </Card>

          <Card title="Connections" sub="Each one is optional and can be removed any time.">
            <Row label="Gmail">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-mist">{connections.gmail ? "Sends the emails you approve, from your address." : "Send approved emails from your own Gmail. We can't read your inbox."}</span>
                {connections.gmail ? <form action={disconnectGmailAction}><button className="btn-ghost !px-3.5 !py-1.5 text-sm">Disconnect</button></form>
                  : connections.gmailAvailable ? <a href="/api/gmail/connect" className="btn-light !px-4 !py-1.5 text-sm">Connect Gmail</a> : <span className="text-sm text-mist">Coming soon</span>}
              </div>
            </Row>
            <Row label="Telegram">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-mist">Picks each morning with buttons to draft your email or learn about the company.</span>
                {connections.telegram ? <form action={disconnectTelegramAction}><button className="btn-ghost !px-3.5 !py-1.5 text-sm">Disconnect</button></form>
                  : connections.telegramAvailable ? <a href="/api/telegram/link" className="btn-light !px-4 !py-1.5 text-sm">Connect Telegram</a> : <span className="text-sm text-mist">Coming soon</span>}
              </div>
            </Row>
          </Card>

          <PrivacyCard />
        </div>

        <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
          <PlanCard plan={plan} />
          <InviteCard link={referral.link} activated={referral.activated} maxFriends={referral.maxFriends} jobsPerFriend={referral.jobsPerFriend} compact />
        </aside>
      </div>
    </div>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function manage() {
    setBusy(true);
    const res = await fetch("/api/billing/portal", { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    setBusy(false);
    if (body.url) window.location.href = body.url; else setError(body.error ?? "Couldn't open billing. Try again.");
  }
  const label = plan.paid ? "Pro" : plan.trialEndsAt ? "Pro trial" : "Free";
  return (
    <section className="rounded-3xl border border-haze bg-night-2/40 p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-semibold">Your plan</h2>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs ${plan.pro ? "border-green/40 text-green" : "border-haze text-mist"}`}>{label}</span>
      </div>
      <p className="mt-3 font-display text-3xl font-bold">{plan.paid ? plan.price.replace("/month", "") : "Free"}<span className="text-base font-normal text-mist">{plan.paid ? " a month" : ""}</span></p>
      <p className="mt-1 text-sm text-mist">
        {plan.paid ? "Renews monthly. Cancel any time." : plan.trialEndsAt ? `Until ${new Date(plan.trialEndsAt).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}, then ${plan.price}.` : `Pro is ${plan.price}: up to ${PICKS_MAX} picks a day, hiring-manager contacts and drafted emails.`}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {plan.paid ? <button onClick={manage} disabled={busy} className="btn-ghost !px-4 !py-1.5 text-sm">{busy ? "Opening…" : "Manage or cancel"}</button>
          : <>
            {!plan.trialUsed && <TrialButton />}
            <Link href="/upgrade" className={plan.trialUsed || plan.trialEndsAt ? "btn-light !px-4 !py-1.5 text-sm" : "btn-ghost !px-4 !py-1.5 text-sm"}>{plan.trialEndsAt ? "Keep Pro" : "See Pro"}</Link>
          </>}
      </div>
      {error && <p className="mt-2 text-sm text-red">{error}</p>}
    </section>
  );
}

function PrivacyCard() {
  const [state, action, deleting] = useActionState<DeleteState, FormData>(deleteAccount, { error: null });
  const [exporting, setExporting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  async function download() {
    setExporting(true);
    const json = await exportData();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    a.download = `sponsorbound-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setExporting(false);
  }
  return (
    <Card title="Your data" sub="Your CV text, notes, chats and Gmail and Telegram links are encrypted. Your CV file is never stored.">
      <Row label="Download"><button onClick={download} disabled={exporting} className="btn-ghost !px-4 !py-1.5 text-sm">{exporting ? "Preparing…" : "Download my data (JSON)"}</button></Row>
      <Row label="Policies"><span className="flex gap-4"><Link href="/privacy" className="text-runway hover:underline">Privacy</Link><Link href="/terms" className="text-runway hover:underline">Terms</Link></span></Row>
      <Row label="Session"><form action={signOut}><button className="text-mist hover:text-moon">Sign out</button></form></Row>
      <Row label="Delete account">
        {confirming ? (
          <form action={action} className="flex flex-wrap items-center gap-2">
            <label htmlFor="confirm-delete" className="sr-only">Type DELETE to confirm</label>
            <input id="confirm-delete" name="confirm" placeholder="Type DELETE" autoComplete="off" className="h-9 rounded-xl border border-haze bg-night/60 px-3 text-sm outline-none focus:border-red/60" />
            <button disabled={deleting} className="h-9 rounded-full bg-red px-4 text-sm font-medium text-night disabled:opacity-50">{deleting ? "Deleting…" : "Erase everything"}</button>
            <button type="button" onClick={() => setConfirming(false)} className="text-sm text-mist">Cancel</button>
            {state.error && <p className="w-full text-sm text-red" role="alert">{state.error}</p>}
          </form>
        ) : (
          <button onClick={() => setConfirming(true)} className="text-red hover:underline">Delete my account and data</button>
        )}
      </Row>
    </Card>
  );
}
