"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { UIMessage } from "ai";
import { Chat } from "@/components/chat/chat";
import { signOut } from "@/app/actions/auth";
import { MayaContext } from "./maya-context";
import { VisaClock } from "./visa-clock";
import type { Shell } from "@/lib/server/pipeline";
import { SITE_NAME } from "@/lib/site";

const NAV = [
  { href: "/pipeline", label: "Pipeline", icon: "M4 6h16M4 12h10M4 18h6" },
  { href: "/case", label: "Your case", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0" },
  { href: "/settings", label: "Settings", icon: "M4 7h10m4 0h2M4 17h4m4 0h8M16 5v4M10 15v4" },
] as const;

function Icon({ d }: { d: string }) {
  return <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden><path d={d} /></svg>;
}

/**
 * The signed-in workspace: a rail on the left, the page in the middle, and Maya docked on the
 * right (Cmd/Ctrl+K). On phones the rail becomes a bottom tab bar and Maya opens full screen.
 */
export function Workspace({ shell, history, now, children }: { shell: Shell; history: UIMessage[]; now: number; children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState<{ text: string; n: number }>({ text: "", n: 0 });

  const ask = useCallback((text: string) => {
    setPrefill((p) => ({ text, n: p.n + 1 }));
    setOpen(true);
  }, []);
  const ctx = useMemo(() => ({ open, setOpen, ask }), [open, ask]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Maya may have drafted an email or moved a job: refresh the page data behind the dock.
  const onReply = useCallback(() => router.refresh(), [router]);

  return (
    <MayaContext.Provider value={ctx}>
      <div className="flex h-dvh overflow-hidden">
        <aside className="hidden w-60 shrink-0 flex-col border-r border-haze bg-night-2/40 px-3 py-4 md:flex">
          <Link href="/pipeline" className="px-2 font-display text-lg font-bold tracking-tight">{SITE_NAME}<span className="text-sodium">.</span></Link>
          <nav className="mt-6 space-y-0.5" aria-label="Workspace">
            {NAV.map((n) => {
              const active = path.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition-colors ${active ? "bg-moon/[0.07] text-moon" : "text-mist hover:text-moon"}`}>
                  <Icon d={n.icon} />{n.label}
                </Link>
              );
            })}
            <button onClick={() => setOpen(!open)} className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition-colors ${open ? "text-sodium" : "text-mist hover:text-moon"}`}>
              <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-sodium/15 text-[10px] font-bold text-sodium">M</span>
              Ask Maya
              <kbd className="ml-auto rounded border border-haze px-1.5 text-[10px] text-mist">⌘K</kbd>
            </button>
          </nav>

          <div className="mt-auto space-y-2.5">
            <VisaClock endsOn={shell.visaEndsOn} situation={shell.visaSituation} now={now} />
            <div className="rounded-2xl border border-haze p-3.5">
              <p className="flex items-center justify-between text-xs text-mist"><span>Last 24 hours</span>{!shell.pro && <Link href="/upgrade" className="text-sodium">Go Pro</Link>}</p>
              <p className="mt-1.5 text-sm"><span className="font-semibold">{shell.pickedToday}</span> <span className="text-mist">new picks</span> · <span className="font-semibold">{shell.sentToday}</span> <span className="text-mist">emails sent</span></p>
              {shell.trialEndsAt && <p className="mt-1 text-xs text-mist">Trial until {new Date(shell.trialEndsAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</p>}
            </div>
            {!shell.gmail && (
              <a href="/api/gmail/connect" className="block rounded-2xl border border-haze p-3.5 text-sm transition-colors hover:border-sodium/50">
                <span className="font-medium">Send from your Gmail</span>
                <span className="mt-0.5 block text-xs text-mist">Emails go out only when you tap Send. We can&apos;t read your inbox.</span>
              </a>
            )}
            <div className="flex items-center justify-between px-1 pt-1 text-xs text-mist">
              <span className="truncate" title={shell.email}>{shell.firstName ?? shell.email}</span>
              <form action={signOut}><button className="hover:text-moon">Sign out</button></form>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto pb-20 md:pb-0">{children}</main>

        <aside
          aria-label="Maya"
          className={`${open ? "flex" : "hidden"} fixed inset-0 z-40 flex-col bg-night md:static md:z-auto md:w-[25rem] md:shrink-0 md:border-l md:border-haze md:bg-night-2/40`}
        >
          <div className="flex items-center justify-between border-b border-haze px-4 py-3">
            <p className="text-sm"><span className="font-semibold">Maya</span> <span className="text-mist">· your AI job buddy</span></p>
            <div className="flex items-center gap-1">
              <Link href="/chat" className="rounded-full px-2.5 py-1 text-xs text-mist hover:text-moon">Full screen</Link>
              <button onClick={() => setOpen(false)} aria-label="Close Maya" className="grid h-8 w-8 place-items-center rounded-full text-mist hover:text-moon">✕</button>
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <Chat initialMessages={history} firstName={shell.firstName} viewer="user" variant="panel" prefill={prefill.text || undefined} prefillNonce={prefill.n} onReply={onReply} />
          </div>
        </aside>

        <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-haze bg-night/95 backdrop-blur md:hidden" aria-label="Workspace">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={path.startsWith(n.href) ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] ${path.startsWith(n.href) ? "text-moon" : "text-mist"}`}>
              <Icon d={n.icon} />{n.label}
            </Link>
          ))}
          <button onClick={() => setOpen(true)} className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] text-sodium">
            <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-sodium/15 text-[10px] font-bold">M</span>Maya
          </button>
        </nav>
      </div>
    </MayaContext.Provider>
  );
}
