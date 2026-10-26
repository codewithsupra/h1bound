import "server-only";
import { createAdminInsForge } from "@/lib/insforge/admin";
import { decryptJson, encryptJson } from "@/lib/crypto";
import type { Profile } from "@/lib/match";
import type { TitleFamily } from "@/lib/titles";
import type { Usage } from "@/lib/quota";

/** Identity + resume details. Stored only as ciphertext in profiles.details_enc. */
export type ProfileDetails = {
  name: string | null;
  email: string | null;
  phone: string | null;
  headline: string | null;
  education: { school: string; degree: string; field: string | null; year: number | null; gpa: string | null }[];
  experience: { company: string; title: string; start: string | null; end: string | null; highlights: string[] }[];
  projects: { name: string; summary: string }[];
  optEndDate: string | null;
  resumeText: string;
};

export type ProfileRow = {
  user_id: string;
  details_enc: string | null;
  skills: string[];
  target_families: TitleFamily[];
  years_experience: number;
  visa_status: string | null;
  needs_sponsorship: boolean;
  wants_remote: Profile["wantsRemote"];
  locations: string[];
  onboarded: boolean;
};

const db = () => createAdminInsForge().database;

export async function loadProfile(userId: string): Promise<{ row: ProfileRow; details: ProfileDetails | null } | null> {
  const { data } = await db().from("profiles").select("*").eq("user_id", userId).maybeSingle();
  if (!data) return null;
  const row = data as ProfileRow;
  return { row, details: row.details_enc ? decryptJson<ProfileDetails>(row.details_enc) : null };
}

export async function saveProfile(userId: string, patch: Partial<Omit<ProfileRow, "user_id" | "details_enc">> & { details?: ProfileDetails }) {
  const { details, ...rest } = patch;
  const row: Record<string, unknown> = { user_id: userId, ...rest, updated_at: new Date().toISOString() };
  if (details) row.details_enc = encryptJson(details);
  const { error } = await db().from("profiles").upsert(row, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
}

export function toMatchProfile(row: ProfileRow): Profile {
  return {
    skills: row.skills,
    targetFamilies: row.target_families,
    yearsExperience: row.years_experience,
    needsSponsorship: row.needs_sponsorship,
    wantsRemote: row.wants_remote,
    locations: row.locations,
  };
}

export async function loadUsage(userId: string): Promise<Usage> {
  const [m, r] = await Promise.all([
    db().from("matches").select("job_id", { count: "exact", head: true }).eq("user_id", userId),
    db().from("reviews").select("job_id").eq("user_id", userId),
  ]);
  const reviews = (r.data ?? []) as { job_id: string }[];
  return { jobsShown: m.count ?? 0, reviewedJobIds: [...new Set(reviews.map((x) => x.job_id))], reviewRounds: reviews.length };
}

export async function isPro(userId: string): Promise<boolean> {
  const { data } = await db().rpc("is_pro", { p_user: userId });
  return data === true;
}
