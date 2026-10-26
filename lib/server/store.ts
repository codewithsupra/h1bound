import "server-only";
import { cookies, headers } from "next/headers";
import type { UIMessage } from "ai";
import { createAdminInsForge } from "@/lib/insforge/admin";
import { getSessionUser } from "@/lib/insforge/server";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { FREE_LIMITS, GUEST_LIMITS, type Usage } from "@/lib/quota";
import { GUEST_COOKIE, GUEST_MAX_AGE, hashIp, signGuest, verifyGuest } from "./guest-cookie";
import { appendMessages, DAILY_MESSAGE_CAP, HISTORY, loadChat, messagesToday } from "./chat-store";
import { isPro, loadProfile, loadUsage, saveProfile, type ProfileDetails, type ProfileRow } from "./profile";

/**
 * One interface for the two kinds of people who talk to Maya: signed-in users (rows in the
 * personal tables) and guests trying it before signing up (one row in guest_sessions). Routes and
 * tools only ever see a Store, so quota, privacy and persistence rules live in one place.
 */
export type Shown = { jobId: string; score: number; reasons: string[] };
export type ProfilePatch = Partial<Omit<ProfileRow, "user_id" | "details_enc">> & { details?: ProfileDetails };

export type Store = {
  kind: "user" | "guest";
  id: string;
  firstName: string | null;
  jobLimit: number;
  dailyMessageCap: number;
  loadProfile(): Promise<{ row: ProfileRow; details: ProfileDetails | null } | null>;
  saveProfile(patch: ProfilePatch): Promise<void>;
  usage(): Promise<Usage>;
  isPro(): Promise<boolean>;
  seenJobIds(): Promise<Set<string>>;
  recordShown(rows: Shown[]): Promise<void>;
  hasJob(jobId: string): Promise<boolean>;
  loadChat(): Promise<UIMessage[]>;
  saveChat(all: UIMessage[], fresh: UIMessage[]): Promise<void>;
  messagesToday(): Promise<number>;
};

const db = () => createAdminInsForge().database;

function userStore(id: string, name: string | null): Store {
  return {
    kind: "user", id, firstName: name?.split(" ")[0] ?? null, jobLimit: FREE_LIMITS.jobs, dailyMessageCap: DAILY_MESSAGE_CAP,
    loadProfile: () => loadProfile(id),
    saveProfile: (patch) => saveProfile(id, patch),
    usage: () => loadUsage(id),
    isPro: () => isPro(id),
    async seenJobIds() {
      const { data } = await db().from("matches").select("job_id").eq("user_id", id);
      return new Set(((data ?? []) as { job_id: string }[]).map((r) => r.job_id));
    },
    async recordShown(rows) {
      if (!rows.length) return;
      const { error } = await db().from("matches").upsert(
        rows.map((r) => ({ user_id: id, job_id: r.jobId, score: r.score, reasons: r.reasons })),
        { onConflict: "user_id,job_id", ignoreDuplicates: true },
      );
      if (error) throw new Error(error.message);
    },
    async hasJob(jobId) {
      const { data } = await db().from("matches").select("job_id").eq("user_id", id).eq("job_id", jobId).maybeSingle();
      return Boolean(data);
    },
    loadChat: () => loadChat(id),
    saveChat: (_all, fresh) => appendMessages(id, fresh),
    messagesToday: () => messagesToday(id),
  };
}

type GuestRow = ProfileRow & { id: string; shown_job_ids: string[]; chat_enc: string | null; messages_today: number; day: string };

const GUEST_COLUMNS = "id,details_enc,skills,target_families,years_experience,visa_status,needs_sponsorship,wants_remote,locations,onboarded,shown_job_ids,chat_enc,messages_today,day";

function guestStore(id: string): Store {
  const row = async () => {
    const { data, error } = await db().from("guest_sessions").select(GUEST_COLUMNS).eq("id", id).maybeSingle();
    if (error) throw new Error(`guest read failed: ${error.message}`);
    return data as GuestRow | null;
  };
  const patchRow = async (patch: Record<string, unknown>) => {
    const { error } = await db().from("guest_sessions").update({ ...patch, last_seen: new Date().toISOString() }).eq("id", id);
    if (error) throw new Error(error.message);
  };
  return {
    kind: "guest", id, firstName: null, jobLimit: GUEST_LIMITS.jobs, dailyMessageCap: 40,
    async loadProfile() {
      const r = await row();
      if (!r) return null;
      return { row: { ...r, user_id: id }, details: r.details_enc ? decryptJson<ProfileDetails>(r.details_enc) : null };
    },
    async saveProfile({ details, ...rest }) {
      await patchRow({ ...rest, ...(details ? { details_enc: encryptJson(details) } : {}) });
    },
    async usage() {
      const r = await row();
      return { jobsShown: r?.shown_job_ids.length ?? 0, reviewedJobIds: [], reviewRounds: 0 };
    },
    isPro: async () => false,
    async seenJobIds() {
      return new Set((await row())?.shown_job_ids ?? []);
    },
    async recordShown(rows) {
      const r = await row();
      if (!r || !rows.length) return;
      await patchRow({ shown_job_ids: [...new Set([...r.shown_job_ids, ...rows.map((x) => x.jobId)])] });
    },
    async hasJob(jobId) {
      return Boolean((await row())?.shown_job_ids.includes(jobId));
    },
    async loadChat() {
      const r = await row();
      return r?.chat_enc ? decryptJson<UIMessage[]>(r.chat_enc) : [];
    },
    async saveChat(all, fresh) {
      const r = await row();
      if (!r) return;
      const today = new Date().toISOString().slice(0, 10);
      const count = (r.day === today ? r.messages_today : 0) + fresh.filter((m) => m.role === "user").length;
      await patchRow({ chat_enc: encryptJson(all.slice(-HISTORY)), messages_today: count, day: today });
    },
    async messagesToday() {
      const r = await row();
      return r && r.day === new Date().toISOString().slice(0, 10) ? r.messages_today : 0;
    },
  };
}

/** The signed-in user, else the verified guest from the cookie, else null. */
export async function getStore(): Promise<Store | null> {
  const user = await getSessionUser();
  if (user) return userStore(user.id, user.name);
  const guestId = verifyGuest((await cookies()).get(GUEST_COOKIE)?.value);
  if (!guestId) return null;
  // A failed lookup (network, timeout) must surface as an error, not quietly log the guest out.
  const { data, error } = await db().from("guest_sessions").select("id").eq("id", guestId).maybeSingle();
  if (error) throw new Error(`guest lookup failed: ${error.message}`);
  return data ? guestStore(guestId) : null;
}

export const GUESTS_PER_IP_PER_DAY = 5;

/** Starts a guest session (or reuses the current one). Returns null when this IP hit the daily limit. */
export async function startGuest(): Promise<Store | null> {
  const existing = await getStore();
  if (existing) return existing;
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  const ipHash = hashIp(ip);
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await db().from("guest_sessions").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", since);
  if ((count ?? 0) >= GUESTS_PER_IP_PER_DAY) return null;
  const { data, error } = await db().from("guest_sessions").insert({ ip_hash: ipHash }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "guest insert failed");
  const id = (data as { id: string }).id;
  (await cookies()).set(GUEST_COOKIE, signGuest(id), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: GUEST_MAX_AGE,
  });
  return guestStore(id);
}

/**
 * After sign-up / sign-in: move the guest's profile, chat and shown jobs into the account, then
 * delete the guest row and cookie. Shown jobs become matches, so they count toward the free 10.
 * Never overwrites an existing profile. Safe to call when there is no guest.
 */
export async function claimGuest(userId: string): Promise<void> {
  const jar = await cookies();
  const guestId = verifyGuest(jar.get(GUEST_COOKIE)?.value);
  if (!guestId) return;
  const g = guestStore(guestId);
  const [profile, chat, seen, existing] = await Promise.all([g.loadProfile(), g.loadChat(), g.seenJobIds(), loadProfile(userId)]);
  try {
    if (profile?.details && !existing) {
      const { row, details } = profile;
      await saveProfile(userId, {
        details, skills: row.skills, target_families: row.target_families, years_experience: row.years_experience,
        visa_status: row.visa_status, needs_sponsorship: row.needs_sponsorship, wants_remote: row.wants_remote,
        locations: row.locations, onboarded: row.onboarded,
      });
    }
    if (seen.size) {
      await db().from("matches").upsert(
        [...seen].map((job_id) => ({ user_id: userId, job_id, score: 0, reasons: [] })),
        { onConflict: "user_id,job_id", ignoreDuplicates: true },
      );
    }
    if (chat.length) await appendMessages(userId, chat);
    await db().from("guest_sessions").delete().eq("id", guestId);
  } finally {
    jar.delete(GUEST_COOKIE);
  }
}

