import { redirect } from "next/navigation";
import { signOut } from "@/app/actions/auth";
import { Chat } from "@/components/chat/chat";
import { getSessionUser } from "@/lib/insforge/server";
import { loadChat } from "@/lib/server/chat-store";
import { isPro, loadProfile } from "@/lib/server/profile";

export const metadata = { title: "Chat with Maya · H1Bound" };

export default async function ChatPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const [history, profile, pro] = await Promise.all([loadChat(user.id), loadProfile(user.id), isPro(user.id)]);
  const firstName = profile?.details?.name?.split(" ")[0] ?? user.name?.split(" ")[0] ?? null;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-[46rem] items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span aria-hidden className="grid h-9 w-9 place-items-center rounded-full bg-ink font-display font-bold text-paper">M</span>
            <div className="leading-tight">
              <p className="font-display font-semibold">Maya <span className="ml-1 rounded border border-line px-1 py-px align-middle text-[0.7rem] font-medium text-slate">AI</span></p>
              <p className="text-xs text-slate">H1Bound job buddy</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            {pro ? <span className="rounded-lg border border-green/40 px-2 py-1 text-green">Pro</span> : <a href="/upgrade" className="rounded-lg bg-ink px-3 py-1.5 font-medium text-paper hover:opacity-90">Go Pro</a>}
            <a href="/account" className="rounded-lg px-2 py-1.5 text-slate hover:text-ink">Account</a>
            <form action={signOut}><button className="rounded-lg px-2 py-1.5 text-slate hover:text-ink">Sign out</button></form>
          </div>
        </div>
      </header>
      <Chat initialMessages={history} firstName={firstName} />
    </div>
  );
}
