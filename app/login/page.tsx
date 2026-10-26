import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/insforge/server";
import { AuthForm } from "./auth-form";

export const metadata = { title: "Sign in · H1Bound" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  if (await getSessionUser()) redirect("/chat");
  const { mode } = await searchParams;
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16">
      <Link href="/" className="font-display text-xl font-bold">H1Bound</Link>
      <AuthForm initialMode={mode === "signup" ? "signup" : "signin"} />
    </main>
  );
}
