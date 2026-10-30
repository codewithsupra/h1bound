import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { createAdminInsForge } from "@/lib/insforge/admin";
import { encrypt } from "@/lib/crypto";
import { buildEmployerIndex, matchEmployer, normalizeEmployer } from "@/lib/employer";
import { canReview, canUse, upsellLine } from "@/lib/quota";
import { sponsorBadge } from "@/lib/sponsor";
import { TITLE_FAMILIES, titleFamily } from "@/lib/titles";
import { findJobs, loadJob, statsOf, companiesById } from "@/lib/server/jobs";
import type { ProfilePatch, Store } from "@/lib/server/store";
import { coldEmail, interviewPlan, reviewResume, tailorResume } from "@/lib/server/coach";
import { findContact, linkedInSearch } from "@/lib/server/hunter";
import { referralInfo } from "@/lib/server/growth";
import { emptyDetails } from "@/lib/server/profile";
import { optStatus, optSummary } from "@/lib/opt";
import { SITE_URL } from "@/lib/site";

const VISA = ["f1_opt", "f1_stem_opt", "f1_student", "h1b", "h4_ead", "outside_us", "citizen_or_gc", "other"] as const;
const NO_SPONSOR_NEEDED = new Set(["citizen_or_gc", "h4_ead"]);

const db = () => createAdminInsForge().database;

/**
 * Tools close over the caller's Store (a signed-in user or a verified guest); the model can never
 * act for someone else. Guests get onboarding, jobs and sponsor lookups; the rest asks them to sign up.
 */
export function buildTools(store: Store) {
  const userId = store.id;
  const guest = store.kind === "guest";
  const signUpFirst = { signUpRequired: true, upsell: upsellLine("guest_only") };
  const needProfile = async () => {
    const p = await store.loadProfile();
    if (!p?.details?.resumeText) return { error: "no_resume" as const, message: "No resume yet. Ask them to upload one with the 📎 button." };
    return { row: p.row, details: p.details };
  };

  const shownJob = async (jobId: string) => {
    if (!(await store.hasJob(jobId))) return null;
    return loadJob(jobId);
  };

  return {
    updatePreferences: tool({
      description: "Save onboarding answers / preferences. Call right after the user answers.",
      inputSchema: z.object({
        visaStatus: z.enum(VISA).optional(),
        optEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("YYYY-MM-DD"),
        targetFamilies: z.array(z.enum(TITLE_FAMILIES)).max(3).optional(),
        wantsRemote: z.enum(["remote", "hybrid", "onsite", "any"]).optional(),
        locations: z.array(z.string().max(40)).max(6).optional().describe("US cities or state codes; empty = anywhere"),
        onboardingComplete: z.boolean().optional().describe("true once visa status and target roles are known"),
      }),
      execute: async (i) => {
        const p = await store.loadProfile();
        const patch: ProfilePatch = {};
        if (i.visaStatus) { patch.visa_status = i.visaStatus; patch.needs_sponsorship = !NO_SPONSOR_NEEDED.has(i.visaStatus); }
        if (i.targetFamilies?.length) patch.target_families = i.targetFamilies;
        if (i.wantsRemote) patch.wants_remote = i.wantsRemote;
        if (i.locations) patch.locations = i.locations;
        if (i.onboardingComplete) patch.onboarded = true;
        if (i.optEndDate) patch.details = { ...(p?.details ?? emptyDetails()), optEndDate: i.optEndDate };
        await store.saveProfile(patch);
        return { saved: Object.keys(i) };
      },
    }),

    setOptClock: tool({
      description: "Save the user's OPT unemployment clock (F-1 OPT: 90 days, STEM OPT: 150 total). Call when they tell you how many unemployment days they've used.",
      inputSchema: z.object({
        type: z.enum(["opt", "stem"]),
        usedDays: z.number().int().min(0).max(150).describe("Unemployment days used so far"),
        employed: z.boolean().describe("true if currently employed (clock paused)"),
      }),
      execute: async ({ type, usedDays, employed }) => {
        const p = await store.loadProfile();
        const opt = { type, usedDays, employed, asOf: new Date().toISOString().slice(0, 10) };
        await store.saveProfile({ details: { ...(p?.details ?? emptyDetails()), opt } });
        const s = optStatus(opt);
        return { ...s, summary: optSummary(s, employed), disclaimer: "Not legal advice; their DSO's count is the official one." };
      },
    }),

    findJobs: tool({
      description: "Find the best-matching US jobs at employers with H-1B filing history. Each call shows new jobs only.",
      inputSchema: z.object({
        count: z.number().int().min(1).max(5).default(5),
        remoteOnly: z.boolean().optional(),
        keyword: z.string().max(40).optional().describe("Optional title keyword, e.g. 'backend' or 'data'"),
      }),
      execute: async ({ count, remoteOnly, keyword }) => {
        const p = await needProfile();
        if ("error" in p) return p;
        const [pro, usage] = await Promise.all([store.isPro(), store.usage()]);
        const limitLine = upsellLine(guest ? "guest_jobs" : "jobs");
        // Signed-in free users can earn more jobs by inviting friends before anything paid.
        const invite = async () => (guest ? null : `${SITE_URL}/r/${(await referralInfo(userId)).code}`);
        if (!pro && usage.jobsShown >= store.jobLimit) return { jobs: [], limitReached: true, signUpRequired: guest, upsell: limitLine, inviteLink: await invite() };
        const r = await findJobs(store, p.row, pro, usage, { count, remoteOnly, keyword });
        return {
          jobs: r.cards,
          freeJobsLeft: pro ? null : Math.max(0, store.jobLimit - usage.jobsShown - r.cards.length),
          freeJobsTotal: pro ? null : store.jobLimit,
          guest,
          limitReached: r.blocked > 0,
          signUpRequired: guest && r.blocked > 0,
          upsell: r.blocked > 0 ? limitLine : null,
          inviteLink: r.blocked > 0 ? await invite() : null,
          note: r.cards.length ? null : "No new matches right now. Suggest widening roles/locations or checking back tomorrow (jobs refresh daily).",
        };
      },
    }),

    companySponsorship: tool({
      description: "Look up a company's US H-1B filing history (DOL LCA data).",
      inputSchema: z.object({ company: z.string().min(2).max(80), roleTitle: z.string().max(80).optional() }),
      execute: async ({ company, roleTitle }) => {
        const key = normalizeEmployer(company);
        const first = key.split(" ")[0] ?? key;
        const { data } = await db().from("companies").select("id,name,display_name,key").or(`key.eq."${key}",key.like."${first}%"`).order("total_filings", { ascending: false }).limit(25);
        const rows = (data ?? []) as { id: string; name: string; display_name: string | null; key: string }[];
        const id = matchEmployer(company, buildEmployerIndex(rows.map((r) => ({ id: r.id, name: r.name }))));
        if (!id) return { found: false, badge: sponsorBadge(null, titleFamily(roleTitle ?? "software engineer")) };
        const c = (await companiesById([id])).get(id);
        const row = rows.find((r) => r.id === id)!;
        return { found: true, legalName: row.name, badge: sponsorBadge(statsOf(c), titleFamily(roleTitle ?? "software engineer")) };
      },
    }),

    reviewResume: tool({
      description: "Review the user's resume against one job they've been shown. Free: 5 jobs, 15 rounds total.",
      inputSchema: z.object({ jobId: z.string().uuid() }),
      execute: async ({ jobId }) => {
        if (guest) return signUpFirst;
        const p = await needProfile();
        if ("error" in p) return p;
        const job = await shownJob(jobId);
        if (!job) return { error: "unknown_job", message: "Only jobs I've shown them can be reviewed." };
        const [pro, usage] = await Promise.all([store.isPro(), store.usage()]);
        const ok = canReview(usage, pro, jobId);
        if (!ok.ok) return { limitReached: true, upsell: upsellLine(ok.reason) };
        const round = usage.reviewRounds + 1;
        const feedback = await reviewResume(p.details, job, round);
        await db().from("reviews").insert({ user_id: userId, job_id: jobId, feedback_enc: encrypt(feedback) });
        return { job: { title: job.title, company: job.company }, feedback, roundsLeft: ok.remaining };
      },
    }),

    coldEmail: tool({
      description: "PRO: find the likely hiring manager / CTO for a shown job and draft a cold email + follow-up.",
      inputSchema: z.object({ jobId: z.string().uuid() }),
      execute: async ({ jobId }) => {
        if (guest) return signUpFirst;
        if (!canUse("cold_email", await store.isPro()).ok) return { proOnly: true, upsell: upsellLine("pro_only") };
        const p = await needProfile();
        if ("error" in p) return p;
        const job = await shownJob(jobId);
        if (!job) return { error: "unknown_job" };
        const lookups = await store.contactLookupAllowed();
        const contact = lookups ? await findContact(job.company).catch(() => null) : null;
        const email = await coldEmail(p.details, job, contact);
        await db().from("outreach").insert({ user_id: userId, job_id: jobId, kind: "cold_email", body_enc: encrypt(JSON.stringify({ contact, email })) });
        return {
          job: { title: job.title, company: job.company },
          contact,
          findContactYourself: contact ? null : linkedInSearch(job.company, "engineering manager"),
          email,
          tip: lookups
            ? "Send it from your own email. Personal addresses are guesses with a confidence score, so double-check before sending."
            : "Your trial includes 3 contact lookups and they're used up, so use the LinkedIn search to find the right person. Pro finds them for you.",
        };
      },
    }),

    interviewPlan: tool({
      description: "PRO: a 7-day interview prep plan for a shown job.",
      inputSchema: z.object({ jobId: z.string().uuid() }),
      execute: async ({ jobId }) => {
        if (guest) return signUpFirst;
        if (!canUse("interview_plan", await store.isPro()).ok) return { proOnly: true, upsell: upsellLine("pro_only") };
        const p = await needProfile();
        if ("error" in p) return p;
        const job = await shownJob(jobId);
        if (!job) return { error: "unknown_job" };
        const plan = await interviewPlan(p.details, job);
        await db().from("outreach").insert({ user_id: userId, job_id: jobId, kind: "interview_plan", body_enc: encrypt(plan) });
        return { job: { title: job.title, company: job.company }, plan };
      },
    }),

    tailorResume: tool({
      description: "PRO: resume tailoring tips for a shown job.",
      inputSchema: z.object({ jobId: z.string().uuid() }),
      execute: async ({ jobId }) => {
        if (guest) return signUpFirst;
        if (!canUse("tailoring", await store.isPro()).ok) return { proOnly: true, upsell: upsellLine("pro_only") };
        const p = await needProfile();
        if ("error" in p) return p;
        const job = await shownJob(jobId);
        if (!job) return { error: "unknown_job" };
        const tips = await tailorResume(p.details, job);
        await db().from("outreach").insert({ user_id: userId, job_id: jobId, kind: "tailoring", body_enc: encrypt(tips) });
        return { job: { title: job.title, company: job.company }, tips };
      },
    }),

    updateJobStatus: tool({
      description: "Track progress on a shown job (applied, emailed, replied, interview, offer, rejected, dismissed, saved).",
      inputSchema: z.object({ jobId: z.string().uuid(), status: z.enum(["saved", "applied", "emailed", "replied", "interview", "offer", "rejected", "dismissed"]) }),
      execute: async ({ jobId, status }) => {
        if (guest) return signUpFirst;
        const { error } = await db().from("matches").update({ status, status_at: new Date().toISOString() }).eq("user_id", userId).eq("job_id", jobId);
        return error ? { error: "update_failed" } : { ok: true, status };
      },
    }),
  };
}

export type MayaTools = ReturnType<typeof buildTools>;
