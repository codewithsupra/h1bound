"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminInsForge } from "@/lib/insforge/admin";
import { getSessionUser } from "@/lib/insforge/server";
import { encrypt } from "@/lib/crypto";
import { decrypt } from "@/lib/crypto";
import { loadJobDetail, type JobDetail } from "@/lib/server/pipeline";
import { emptyDetails, loadProfile, saveProfile, type ProfileLinks } from "@/lib/server/profile";
import { loadChat } from "@/lib/server/chat-store";
import { STAGE_STATUS, STAGES, type Stage } from "@/lib/pipeline";
import { clampPicks } from "@/lib/picks";
import { MARKETS } from "@/lib/visa";
import { TITLE_FAMILIES, type TitleFamily } from "@/lib/titles";

const db = () => createAdminInsForge().database;

async function me() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

/** Move a job to a board stage (drag on the board, or the picker in the drawer). */
export async function setStage(jobId: string, stage: Stage): Promise<{ ok: boolean }> {
  const user = await me();
  if (!isUuid(jobId) || !STAGES.includes(stage)) return { ok: false };
  const { error } = await db().from("matches").update({ status: STAGE_STATUS[stage], status_at: new Date().toISOString() }).eq("user_id", user.id).eq("job_id", jobId);
  revalidatePath("/pipeline");
  return { ok: !error };
}

/** "Did they reply?" Yes moves the job to Replied, "They said no" closes it, "Not yet" asks again in a week. */
export async function markReply(jobId: string, answer: "yes" | "no" | "not_yet"): Promise<{ ok: boolean }> {
  const user = await me();
  if (!isUuid(jobId)) return { ok: false };
  const now = new Date().toISOString();
  const patch = answer === "yes" ? { status: "replied", status_at: now, asked_reply_at: now }
    : answer === "no" ? { status: "rejected", status_at: now, asked_reply_at: now }
    : { asked_reply_at: now };
  const { error } = await db().from("matches").update(patch).eq("user_id", user.id).eq("job_id", jobId);
  revalidatePath("/pipeline");
  return { ok: !error };
}

/** Private notes on a job, encrypted like everything else personal. Empty clears it. */
export async function saveNote(jobId: string, text: string): Promise<{ ok: boolean }> {
  const user = await me();
  if (!isUuid(jobId)) return { ok: false };
  const note = text.slice(0, 4000).trim();
  const { error } = await db().from("matches").update({ notes_enc: note ? encrypt(note) : null }).eq("user_id", user.id).eq("job_id", jobId);
  revalidatePath("/pipeline");
  return { ok: !error };
}

/** The drawer's detail for one of the student's own jobs. */
export async function jobDetail(jobId: string): Promise<JobDetail | null> {
  const user = await me();
  if (!isUuid(jobId)) return null;
  return loadJobDetail(user.id, jobId);
}

// ---------- Your case ----------

export type CasePatch = {
  name?: string; headline?: string; pitch?: string; links?: ProfileLinks; graduation?: string | null;
  citizenship?: string | null; visaCountry?: string | null; visaSituation?: string | null; visaEndsOn?: string | null;
  targetCountries?: string[]; targetFamilies?: string[]; wantsRemote?: string; locations?: string[]; yearsExperience?: number;
};

const clean = (s: string | undefined, max: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max) || null;
const url = (s: string | null | undefined) => {
  const v = (s ?? "").trim();
  if (!v) return null;
  try { const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`); return u.protocol === "https:" || u.protocol === "http:" ? u.toString().slice(0, 300) : null; } catch { return null; }
};
const isDate = (s: string | null | undefined) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

/** Saves whatever part of Your case was edited. Identity, pitch and links are encrypted; matching fields stay plain. */
export async function saveCase(p: CasePatch): Promise<{ ok: boolean; error?: string }> {
  const user = await me();
  const current = await loadProfile(user.id);
  const details = { ...(current?.details ?? emptyDetails()) };
  const row: Parameters<typeof saveProfile>[1] = {};

  if (p.name !== undefined) details.name = clean(p.name, 120);
  if (p.headline !== undefined) details.headline = clean(p.headline, 160);
  if (p.pitch !== undefined) details.pitch = clean(p.pitch, 240);
  if (p.graduation !== undefined) details.graduation = p.graduation && /^\d{4}-\d{2}$/.test(p.graduation) ? p.graduation : null;
  if (p.links) {
    const links: ProfileLinks = {};
    for (const k of ["github", "portfolio", "linkedin", "other"] as const) {
      const raw = p.links[k];
      if (raw && !url(raw)) return { ok: false, error: `That ${k} link doesn't look like a web address.` };
      links[k] = url(raw);
    }
    details.links = links;
  }
  if (p.citizenship !== undefined) row.citizenship = p.citizenship && /^[A-Z]{2}$/.test(p.citizenship) ? p.citizenship : null;
  if (p.visaCountry !== undefined) row.visa_country = ["GB", "NL", "IE", "US"].includes(p.visaCountry ?? "") ? p.visaCountry : null;
  if (p.visaSituation !== undefined) row.visa_situation = (["student", "graduate", "sponsored", "none"] as const).find((v) => v === p.visaSituation) ?? null;
  if (p.visaEndsOn !== undefined) row.visa_ends_on = isDate(p.visaEndsOn) ? p.visaEndsOn : null;
  if (p.targetCountries) row.target_countries = p.targetCountries.filter((c) => (MARKETS as string[]).includes(c));
  if (p.targetFamilies) row.target_families = p.targetFamilies.filter((f): f is TitleFamily => (TITLE_FAMILIES as readonly string[]).includes(f)).slice(0, 4);
  if (p.wantsRemote && ["remote", "hybrid", "onsite", "any"].includes(p.wantsRemote)) row.wants_remote = p.wantsRemote as "remote" | "hybrid" | "onsite" | "any";
  if (p.locations) row.locations = p.locations.map((l) => l.trim().slice(0, 60)).filter(Boolean).slice(0, 8);
  if (p.yearsExperience !== undefined && Number.isFinite(p.yearsExperience)) row.years_experience = Math.max(0, Math.min(60, Math.round(p.yearsExperience)));
  if (row.visa_situation !== undefined) row.needs_sponsorship = row.visa_situation !== "none";

  try {
    await saveProfile(user.id, { ...row, details });
  } catch {
    return { ok: false, error: "Couldn't save that. Try again in a minute." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Answer (or skip) one of Maya's questions about the CV. Answers go into every email Maya writes. */
export async function answerQuestion(id: string, answer: string | null): Promise<{ ok: boolean }> {
  const user = await me();
  const current = await loadProfile(user.id);
  if (!current?.details?.questions) return { ok: false };
  const questions = current.details.questions.map((q) => (q.id === id ? (answer?.trim() ? { ...q, answer: answer.trim().slice(0, 500), skipped: false } : { ...q, skipped: true }) : q));
  await saveProfile(user.id, { details: { ...current.details, questions } });
  revalidatePath("/case");
  return { ok: true };
}

// ---------- Settings ----------

export type SettingsPatch = {
  signOff?: string; emailTone?: string;
  picksPerDay?: number; picksHour?: number; timezone?: string; picksPaused?: boolean;
  emailUpdates?: boolean; telegramUpdates?: boolean;
};

export async function saveSettings(p: SettingsPatch): Promise<{ ok: boolean }> {
  const user = await me();
  const row: Parameters<typeof saveProfile>[1] = {};
  if (p.emailTone && ["plain", "warm", "direct"].includes(p.emailTone)) row.email_tone = p.emailTone as "plain" | "warm" | "direct";
  if (p.picksPerDay !== undefined) row.picks_per_day = clampPicks(p.picksPerDay);
  if (p.picksHour !== undefined && Number.isInteger(p.picksHour) && p.picksHour >= 0 && p.picksHour <= 23) row.picks_hour = p.picksHour;
  if (p.timezone) {
    try { new Intl.DateTimeFormat("en-GB", { timeZone: p.timezone }); row.timezone = p.timezone.slice(0, 64); } catch { /* ignore unknown zones */ }
  }
  if (p.signOff !== undefined) {
    const current = await loadProfile(user.id);
    row.details = { ...(current?.details ?? emptyDetails()), signOff: clean(p.signOff, 80) };
  }
  if (Object.keys(row).length) await saveProfile(user.id, row);

  const consent: Record<string, unknown> = {};
  if (p.picksPaused !== undefined) consent.picks_paused = p.picksPaused;
  if (p.emailUpdates !== undefined) consent.email_updates = p.emailUpdates;
  if (p.telegramUpdates !== undefined) consent.telegram_updates = p.telegramUpdates;
  if (Object.keys(consent).length) {
    await db().from("consents").upsert({ user_id: user.id, ...consent, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  }
  revalidatePath("/settings");
  return { ok: true };
}

/** Everything we hold about the student, decrypted, as one JSON file. Only ever for the signed-in owner. */
export async function exportData(): Promise<string> {
  const user = await me();
  const [profile, matches, outreach, chat, consent] = await Promise.all([
    loadProfile(user.id),
    db().from("matches").select("*,jobs(title,company,location,url)").eq("user_id", user.id),
    db().from("outreach").select("job_id,kind,body_enc,created_at,sent_at").eq("user_id", user.id),
    loadChat(user.id),
    db().from("consents").select("email_updates,telegram_updates,picks_paused,updated_at").eq("user_id", user.id).maybeSingle(),
  ]);
  const open = (v: string | null | undefined) => { try { return v ? decrypt(v) : null; } catch { return null; } };
  const { details_enc: _d, ...profileRow } = (profile?.row ?? {}) as Record<string, unknown>;
  void _d;
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    account: { email: user.email },
    profile: { ...profileRow, details: profile?.details ?? null },
    matches: ((matches.data ?? []) as Record<string, unknown>[]).map(({ notes_enc, ...m }) => ({ ...m, note: open(notes_enc as string | null) })),
    outreach: ((outreach.data ?? []) as Record<string, unknown>[]).map(({ body_enc, ...o }) => ({ ...o, body: open(body_enc as string) })),
    consents: consent.data ?? null,
    chat,
  }, null, 2);
}
