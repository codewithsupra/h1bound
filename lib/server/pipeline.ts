import "server-only";
import { createAdminInsForge } from "@/lib/insforge/admin";
import { cache } from "react";
import { decrypt } from "@/lib/crypto";
import { isPro, loadProfile } from "@/lib/server/profile";
import { trialState } from "@/lib/server/growth";
import { licencesById } from "@/lib/server/jobs";
import type { Contact } from "@/lib/server/hunter";
import type { MatchStatus, PipelineRow } from "@/lib/pipeline";

const db = () => createAdminInsForge().database;

type MatchRow = {
  job_id: string; score: number; why: string | null; status: MatchStatus; shown_at: string; status_at: string;
  notes_enc?: string | null; asked_reply_at?: string | null;
  jobs: { title: string; company: string; location: string | null; country: string | null; remote: boolean; url: string; licence_id: string | null } | null;
};
type OutreachRow = { id: string; job_id: string; kind: "cold_email" | "follow_up"; sent_at: string | null; created_at: string; body_enc: string };
type OutreachBody = { contact: Contact | null; email: string; senderName?: string | null };

/** Everything on the student's board, newest first. Contacts and drafts are decrypted for the owner only. */
export async function loadPipeline(userId: string): Promise<PipelineRow[]> {
  const [m, o] = await Promise.all([
    db().from("matches").select("*,jobs(title,company,location,country,remote,url,licence_id)").eq("user_id", userId).order("status_at", { ascending: false }).limit(500),
    db().from("outreach").select("id,job_id,kind,sent_at,created_at,body_enc").eq("user_id", userId).in("kind", ["cold_email", "follow_up"]).order("created_at", { ascending: false }).limit(1000),
  ]);
  const matches = ((m.data ?? []) as MatchRow[]).filter((r) => r.jobs);
  const outreach = (o.data ?? []) as OutreachRow[];

  // Latest cold email per job, plus the follow-up drafted with it.
  const emails = new Map<string, OutreachRow>();
  const followUps = new Map<string, OutreachRow>();
  for (const r of outreach) {
    const target = r.kind === "cold_email" ? emails : followUps;
    if (!target.has(r.job_id)) target.set(r.job_id, r);
  }
  const licences = await licencesById(matches.map((r) => r.jobs!.licence_id ?? ""));

  return matches.map((r) => {
    const j = r.jobs!;
    const email = emails.get(r.job_id);
    const fu = followUps.get(r.job_id);
    let contact: PipelineRow["contact"] = null;
    if (email) {
      try {
        const body = JSON.parse(decrypt(email.body_enc)) as OutreachBody;
        if (body.contact) contact = { name: body.contact.name, role: body.contact.title, email: body.contact.email };
      } catch { /* an unreadable draft just shows no contact */ }
    }
    return {
      jobId: r.job_id, title: j.title, company: j.company, location: j.location ?? "", country: j.country, remote: j.remote, url: j.url,
      score: r.score, why: r.why, status: r.status, statusAt: r.status_at, shownAt: r.shown_at,
      licence: j.licence_id ? licences.get(j.licence_id) ?? null : null,
      contact,
      draft: email ? { outreachId: email.id, followUpId: fu?.id ?? null, sentAt: email.sent_at, followUpSentAt: fu?.sent_at ?? null } : null,
      askedReplyAt: r.asked_reply_at ?? null,
      hasNote: Boolean(r.notes_enc),
    };
  });
}

export type JobDetail = {
  description: string;
  postedAt: string | null;
  note: string;
  email: { outreachId: string; followUpId: string | null; text: string; followUp: string | null; to: string | null; sentAt: string | null; followUpSentAt: string | null } | null;
};

/** The drawer's extra detail for one job: description, the owner's note and the full draft. */
export async function loadJobDetail(userId: string, jobId: string): Promise<JobDetail | null> {
  const [m, j, o] = await Promise.all([
    db().from("matches").select("*").eq("user_id", userId).eq("job_id", jobId).maybeSingle(),
    db().from("jobs").select("description,posted_at").eq("id", jobId).maybeSingle(),
    db().from("outreach").select("id,kind,sent_at,body_enc").eq("user_id", userId).eq("job_id", jobId).in("kind", ["cold_email", "follow_up"]).order("created_at", { ascending: false }).limit(10),
  ]);
  if (!m.data) return null;
  const match = m.data as { notes_enc?: string | null };
  const rows = (o.data ?? []) as { id: string; kind: string; sent_at: string | null; body_enc: string }[];
  const first = rows.find((r) => r.kind === "cold_email");
  const fu = rows.find((r) => r.kind === "follow_up");
  const read = (r: typeof first) => { try { return r ? (JSON.parse(decrypt(r.body_enc)) as OutreachBody) : null; } catch { return null; } };
  const body = read(first);
  const job = j.data as { description: string | null; posted_at: string | null } | null;
  return {
    description: (job?.description ?? "").slice(0, 6000),
    postedAt: job?.posted_at ?? null,
    note: match.notes_enc ? decrypt(match.notes_enc) : "",
    email: first && body ? { outreachId: first.id, followUpId: fu?.id ?? null, text: body.email, followUp: read(fu)?.email ?? null, to: body.contact?.email ?? null, sentAt: first.sent_at, followUpSentAt: fu?.sent_at ?? null } : null,
  };
}

export type Shell = {
  /** Request time, so the shell and pages agree on "today" and stay pure during render. */
  now: number;
  firstName: string | null;
  email: string;
  pro: boolean;
  trialEndsAt: string | null;
  visaEndsOn: string | null;
  visaSituation: string | null;
  gmail: boolean;
  telegram: boolean;
  picksPerDay: number;
  sentToday: number;
  pickedToday: number;
};

/** What the workspace shell shows on every page. Cached per request so layout and page share it. */
export const loadShell = cache(async (user: { id: string; email: string; name: string | null }): Promise<Shell> => {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const [pro, trial, profile, consent, gmail, sent, picked] = await Promise.all([
    isPro(user.id),
    trialState(user.id),
    loadProfile(user.id),
    db().from("consents").select("telegram_chat_hash").eq("user_id", user.id).maybeSingle(),
    db().from("gmail_accounts").select("user_id").eq("user_id", user.id).maybeSingle(),
    db().from("outreach").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("sent_at", since),
    db().from("matches").select("job_id", { count: "exact", head: true }).eq("user_id", user.id).gte("shown_at", since),
  ]);
  const name = profile?.details?.name ?? user.name;
  return {
    now: Date.now(),
    firstName: name?.split(" ")[0] ?? null,
    email: user.email,
    pro,
    trialEndsAt: trial.active ? trial.endsAt : null,
    visaEndsOn: profile?.row.visa_ends_on ?? null,
    visaSituation: profile?.row.visa_situation ?? null,
    gmail: Boolean(gmail.data),
    telegram: Boolean((consent.data as { telegram_chat_hash?: string | null } | null)?.telegram_chat_hash),
    picksPerDay: profile?.row.picks_per_day ?? 5,
    sentToday: sent.count ?? 0,
    pickedToday: picked.count ?? 0,
  };
});
