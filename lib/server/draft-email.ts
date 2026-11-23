import "server-only";
import { adminDb } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/crypto";
import { canUse, upsellLine } from "@/lib/quota";
import { titleFamily } from "@/lib/titles";
import { loadJob } from "@/lib/server/jobs";
import type { Store } from "@/lib/server/store";
import { coldEmail } from "@/lib/server/coach";
import { findContact, linkedInSearch, type Contact } from "@/lib/server/hunter";
import { parseDraft, type Draft } from "@/lib/email-draft";
import { gmailAccount, gmailConfigured } from "@/lib/server/gmail";

export type DraftResult =
  | { proOnly: true; upsell: string }
  | { error: "no_resume" | "unknown_job"; message?: string }
  | {
      job: { title: string; company: string }; contact: Contact | null; findContactYourself: string | null;
      email: string; draft: Draft; outreachId: string | null; followUpId: string | null;
      gmail: "connected" | "not_connected" | "unavailable"; lookupsLeft: boolean;
    };

/**
 * Pro: finds the likely hiring manager for a job the student was shown and drafts the cold email and
 * its follow-up, saved (encrypted) as unsent drafts. Shared by Maya's coldEmail tool and Telegram.
 */
export async function draftEmailForJob(store: Store, userId: string, jobId: string): Promise<DraftResult> {
  if (!canUse("cold_email", await store.isPro()).ok) return { proOnly: true, upsell: upsellLine("pro_only") };
  const p = await store.loadProfile();
  if (!p?.details?.resumeText) return { error: "no_resume", message: "No resume yet. Ask them to upload one with the 📎 button." };
  if (!(await store.hasJob(jobId))) return { error: "unknown_job" };
  const job = await loadJob(jobId);
  if (!job) return { error: "unknown_job" };
  const lookups = await store.contactLookupAllowed();
  const contact = lookups ? await findContact(job.company, titleFamily(job.title)).catch(() => null) : null;
  const email = await coldEmail(p.details, job, contact, { tone: p.row.email_tone, signOff: p.details.signOff });
  const draft = parseDraft(email);
  const senderName = p.details.name ?? store.firstName;
  const save = async (kind: "cold_email" | "follow_up", body: unknown) => {
    const { data } = await adminDb().from("outreach").insert({ user_id: userId, job_id: jobId, kind, body_enc: encrypt(JSON.stringify(body)) }).select("id").single();
    return (data as { id: string } | null)?.id ?? null;
  };
  const outreachId = await save("cold_email", { contact, email, senderName });
  const followUpId = draft.followUp ? await save("follow_up", { contact, email: draft.followUp, senderName }) : null;
  return {
    job: { title: job.title, company: job.company }, contact,
    findContactYourself: contact ? null : linkedInSearch(job.company, "hiring manager"),
    email, draft, outreachId, followUpId,
    gmail: (await gmailAccount(userId).catch(() => null)) ? "connected" : gmailConfigured() ? "not_connected" : "unavailable",
    lookupsLeft: lookups,
  };
}
