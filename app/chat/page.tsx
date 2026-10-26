import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { Chat } from "@/components/chat/chat";
import { SiteHeader } from "@/components/site/site-header";
import { getStore } from "@/lib/server/store";

export const metadata = { title: "Chat with Maya · H1Bound" };

/** Works for signed-in users and for guests trying Maya before signing up. */
export default async function ChatPage() {
  const store = await getStore();
  const [history, profile, pro] = store ? await Promise.all([store.loadChat(), store.loadProfile(), store.isPro()]) : [[], null, false];
  const firstName = profile?.details?.name?.split(" ")[0] ?? store?.firstName ?? null;
  const signedIn = store?.kind === "user";

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader>
        {signedIn ? (
          <>
            {pro ? <span className="rounded-full border border-green/40 px-3 py-1.5 text-green">Pro</span> : <Link href="/upgrade" className="btn-light !px-4 !py-1.5 text-sm">Go Pro</Link>}
            <Link href="/account" className="rounded-full px-3 py-1.5 text-mist transition-colors hover:text-moon">Account</Link>
            <form action={signOut}><button className="rounded-full px-3 py-1.5 text-mist transition-colors hover:text-moon">Sign out</button></form>
          </>
        ) : (
          <>
            <span className="hidden text-mist sm:inline">Free preview</span>
            <Link href="/login?mode=signup" className="btn-light !px-4 !py-1.5 text-sm">Save my chat</Link>
          </>
        )}
      </SiteHeader>
      <Chat initialMessages={history} firstName={firstName} viewer={store?.kind ?? null} />
    </div>
  );
}
