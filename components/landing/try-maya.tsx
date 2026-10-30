"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Chat, type Viewer } from "@/components/chat/chat";

const EVENT = "h1b:maya";
type OpenDetail = { x: number; y: number; prompt?: string };

/** Open the Maya panel from anywhere, revealing it from the point that was clicked. */
export function openMaya(e: { clientX: number; clientY: number } | null, prompt?: string) {
  const x = e?.clientX ?? window.innerWidth - 60;
  const y = e?.clientY ?? window.innerHeight - 60;
  window.dispatchEvent(new CustomEvent<OpenDetail>(EVENT, { detail: { x, y, prompt } }));
}

const PROMPTS = [
  "Graduate data jobs in London that sponsor?",
  "Is Monzo a licensed UK sponsor?",
  "I'm on a Graduate visa until June. Help?",
  "Remote backend roles open to India?",
];

/** Hero CTA: looks like a chat box and types real questions; clicking opens Maya. */
export function AskMayaBar() {
  const [text, setText] = useState("");
  const [i, setI] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = setTimeout(() => setText(PROMPTS[0]), 0);
      return () => clearTimeout(id);
    }
    const full = PROMPTS[i % PROMPTS.length];
    let n = 0;
    let erase = false;
    const id = setInterval(() => {
      if (!erase) {
        n++;
        setText(full.slice(0, n));
        if (n >= full.length) { erase = true; n = full.length + 30; } // hold ~1.5s
      } else {
        n--;
        if (n <= full.length) setText(full.slice(0, Math.max(0, n)));
        if (n <= 0) { clearInterval(id); setI((v) => v + 1); }
      }
    }, 48);
    return () => clearInterval(id);
  }, [i]);

  return (
    <button
      type="button"
      onClick={(e) => openMaya(e, PROMPTS[i % PROMPTS.length])}
      className="group pointer-events-auto relative flex w-full max-w-[34rem] items-center gap-3 rounded-full border border-sodium/40 bg-night-2/80 p-2 pl-5 text-left shadow-[0_0_0_6px_rgb(255_181_71_/_0.06),0_20px_60px_-20px_rgb(255_181_71_/_0.5)] backdrop-blur transition-all hover:border-sodium/70 hover:shadow-[0_0_0_8px_rgb(255_181_71_/_0.1),0_24px_70px_-18px_rgb(255_181_71_/_0.65)]"
      aria-label="Try Maya now, no signup"
    >
      <span className="min-w-0 flex-1 truncate text-mist">
        <span className="text-moon/90">{text}</span>
        <span className="ml-0.5 inline-block h-[1.1em] w-[2px] animate-pulse bg-sodium align-[-0.2em]" aria-hidden />
      </span>
      <span className="btn-light shrink-0 !py-2.5 text-sm">
        <span>Try Maya<span className="hidden sm:inline">, no signup</span></span>
      </span>
    </button>
  );
}

/** The chat panel, opened from any Try Maya button via openMaya(). The panel stays mounted once opened so the chat survives closing. */
export function MayaPanel() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [origin, setOrigin] = useState({ x: 0, y: 0, n: 0 });
  const [rel, setRel] = useState({ x: 0, y: 0, r: 0 });
  const [revealed, setRevealed] = useState(false);
  const [prefill, setPrefill] = useState<string | undefined>();
  const [viewer, setViewer] = useState<Viewer>(null);
  const returnFocus = useRef<Element | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<OpenDetail>).detail;
      returnFocus.current = document.activeElement;
      setOrigin((o) => ({ x: d.x, y: d.y, n: o.n + 1 }));
      setPrefill(d.prompt);
      setMounted(true);
    };
    window.addEventListener(EVENT, onOpen);
    return () => window.removeEventListener(EVENT, onOpen);
  }, []);

  // Once the panel exists, measure where the click was relative to it, then start the reveal.
  useLayoutEffect(() => {
    if (!origin.n || !panel.current) return;
    const b = panel.current.getBoundingClientRect();
    const x = origin.x - b.left, y = origin.y - b.top;
    // Radius = distance to the furthest corner, so the circle always uncovers the whole panel.
    const r = Math.max(...[[0, 0], [b.width, 0], [0, b.height], [b.width, b.height]].map(([cx, cy]) => Math.hypot(cx - x, cy - y)));
    setRel({ x, y, r: Math.ceil(r) + 2 });
    setRevealed(false);
    const instant = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setOpen(true);
        if (instant) setRevealed(true);
      }),
    );
    return () => cancelAnimationFrame(id);
  }, [origin, mounted]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function close() {
    setOpen(false);
    setRevealed(false);
    (returnFocus.current as HTMLElement | null)?.focus?.();
  }

  return (
    <>
      {mounted && (
        <div
          className={`fixed inset-0 z-50 transition-colors duration-500 ${open ? "bg-night/50 backdrop-blur-[2px]" : "pointer-events-none bg-transparent"}`}
          onClick={(e) => e.target === e.currentTarget && close()}
        >
          <div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label="Chat with Maya"
            className="glass absolute inset-0 flex flex-col overflow-hidden !bg-night-2 shadow-2xl sm:!bg-night-2/95 sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[min(720px,calc(100svh-2.5rem))] sm:w-[440px] sm:rounded-3xl"
            onTransitionEnd={(e) => e.propertyName === "clip-path" && open && setRevealed(true)}
            style={{
              // Once revealed the clip is removed, so nothing inside can stay clipped or unclickable.
              clipPath: revealed ? "none" : open ? `circle(${rel.r}px at ${rel.x}px ${rel.y}px)` : `circle(0px at ${rel.x}px ${rel.y}px)`,
              transition: revealed ? "none" : "clip-path 650ms cubic-bezier(0.65, 0, 0.35, 1)",
            }}
          >
            <div className="flex items-center justify-between border-b border-haze px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-sodium font-display text-sm font-bold text-night">M</span>
                <div className="leading-tight">
                  <p className="font-display text-sm font-semibold">Maya <span className="ml-1 rounded border border-haze px-1 text-[0.62rem] text-mist">AI</span></p>
                  <p className="text-[11px] text-mist">{viewer === "user" ? "Your saved chat" : "Free preview · no account needed"}</p>
                </div>
              </div>
              <button onClick={close} aria-label="Close chat" className="grid h-8 w-8 place-items-center rounded-full text-mist transition-colors hover:bg-moon/5 hover:text-moon">✕</button>
            </div>
            <div className="min-h-0 flex-1">
              <Chat viewer={null} variant="panel" autoFocus={open} prefill={prefill} onViewer={setViewer} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
