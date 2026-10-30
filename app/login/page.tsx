import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site/site-header";
import { getSessionUser } from "@/lib/insforge/server";
import { AuthForm } from "./auth-form";

export const metadata = { title: "Sign in · H1Bound" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  if (await getSessionUser()) redirect("/chat");
  const { mode } = await searchParams;
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-[38%] -z-10 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-sodium/10 blur-[120px]" />
      <SiteHeader back>
        <Link href="/chat" className="btn-light !px-4 !py-2 text-sm">Try Maya first</Link>
      </SiteHeader>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
        <div className="glass rise rounded-3xl p-6 sm:p-8">
          <AuthForm initialMode={mode === "signup" ? "signup" : "signin"} />
        </div>
      </main>
    </div>
  );
}
