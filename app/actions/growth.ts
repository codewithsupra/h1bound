"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/insforge/server";
import { joinWaitlist, startTrial } from "@/lib/server/growth";

export type TrialResult = { ok: true; endsAt: string } | { ok: false; error: string };

export async function startTrialAction(): Promise<TrialResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Create a free account first, then start your trial." };
  const r = await startTrial(user.id);
  if (!r.ok) return { ok: false, error: "You've already used your free trial." };
  revalidatePath("/account");
  revalidatePath("/upgrade");
  return r;
}

export type WaitlistState = { ok: boolean; error: string | null };

export async function joinWaitlistAction(_prev: WaitlistState, form: FormData): Promise<WaitlistState> {
  const email = String(form.get("email") ?? "").trim();
  if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(email)) return { ok: false, error: "That email doesn't look right." };
  try {
    await joinWaitlist(email);
    return { ok: true, error: null };
  } catch {
    return { ok: false, error: "Couldn't save that. Try again in a minute." };
  }
}
