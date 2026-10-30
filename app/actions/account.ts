"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAuthActions } from "@insforge/sdk/ssr";
import { createAdminInsForge } from "@/lib/insforge/admin";
import { getSessionUser } from "@/lib/insforge/server";
import { hasPaidPlan } from "@/lib/server/growth";
import { disconnectGmail } from "@/lib/server/gmail";
import { unlinkTelegram } from "@/lib/server/telegram";

export async function setEmailUpdates(on: boolean) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  await createAdminInsForge().database.from("consents").upsert({ user_id: user.id, email_updates: on, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  revalidatePath("/account");
}

export type DeleteState = { error: string | null };

export async function deleteAccount(_prev: DeleteState, form: FormData): Promise<DeleteState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (String(form.get("confirm") ?? "").trim() !== "DELETE") return { error: "Type DELETE to confirm." };
  // The free trial never blocks deletion; only a live subscription must be canceled first.
  if (await hasPaidPlan(user.id)) return { error: "Cancel your Pro subscription first (Manage billing), then delete your account." };
  const { error } = await createAdminInsForge().database.rpc("delete_user_account", { p_user: user.id });
  if (error) return { error: "Couldn't delete your account. Try again in a minute." };
  await createAuthActions({ cookies: await cookies() }).signOut();
  redirect("/?deleted=1");
}

export async function disconnectGmailAction() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  await disconnectGmail(user.id);
  revalidatePath("/account");
}

export async function disconnectTelegramAction() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  await unlinkTelegram(user.id);
  revalidatePath("/account");
}
