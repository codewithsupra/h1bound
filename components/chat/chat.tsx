"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { JobCard as Job } from "@/lib/server/jobs";
import type { SponsorBadge } from "@/lib/sponsor";
import { JobCard } from "./job-card";
import { Stamp } from "./stamp";

type ToolPart = { type: string; state: string; output?: Record<string, unknown>; errorText?: string };
export type Viewer = "user" | "guest" | null;

const WORKING: Record<string, string> = {
  "tool-findJobs": "Scanning today's openings at sponsoring employers…",
  "tool-reviewResume": "Reading your resume against the posting…",
  "tool-coldEmail": "Finding the right person and drafting your email…",
  "tool-interviewPlan": "Building your prep plan…",
  "tool-tailorResume": "Working out what to change for this role…",
  "tool-companySponsorship": "Checking Dept. of Labor filings…",
};

const STARTERS = ["Who sponsors new-grad backend engineers?", "Does Databricks sponsor H-1Bs?", "I'm on STEM OPT. Where do I start?"];

function LongForm({ title, body, copy }: { title: string; body: string; copy?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <section className="rise rounded-2xl border border-haze bg-night-2/80 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display font-semibold">{title}</h3>
        {copy && (
          <button onClick={() => navigator.clipboard.writeText(body).then(() => setCopied(true))} className="rounded-full border border-haze px-3 py-1 text-sm transition-colors hover:border-moon/30">
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>
      <div className="mt-3 whitespace-pre-wrap text-[0.94rem] leading-relaxed text-moon/90">{body}</div>
    </section>
  );
}

function Upsell({ text, signUp }: { text: string; signUp?: boolean }) {
  return (
    <div className="rise rounded-2xl border border-sodium/30 bg-sodium/[0.06] p-4 text-sm">
      <p>{text}</p>
      {signUp ? (
        <Link href="/login?mode=signup" className="btn-light mt-3 !py-2 !px-4 text-sm">Create free account</Link>
      ) : (
        <Link href="/upgrade" className="btn-light mt-3 !py-2 !px-4 text-sm">See Pro</Link>
      )}
    </div>
  );
}

function ToolView({ part, ask }: { part: ToolPart; ask: (t: string) => void }) {
  if (part.state === "output-error") return <p className="text-sm text-red">That didn&apos;t work: {part.errorText}. Try again in a moment.</p>;
  if (part.state !== "output-available") {
    if (!WORKING[part.type]) return null;
    return (
      <p className="flex items-center gap-2 text-sm text-mist">
        <span className="h-1.5 w-1.5 animate-ping rounded-full bg-sodium" /> {WORKING[part.type]}
      </p>
    );
  }
  const o = part.output ?? {};
  const upsell = (o.upsell as string | undefined) ?? null;
  const signUp = Boolean(o.signUpRequired);
  const job = o.job as { title: string; company: string } | undefined;

  switch (part.type) {
    case "tool-findJobs": {
      const jobs = (o.jobs as Job[]) ?? [];
      return (
        <div className="space-y-3">
          {jobs.map((j, i) => <JobCard key={j.id} job={j} onAsk={ask} index={i} />)}
          {typeof o.freeJobsLeft === "number" && jobs.length > 0 && (
            <p className="text-sm text-mist">
              {o.freeJobsLeft === 0 ? `That's all ${o.freeJobsTotal} ${o.guest ? "preview" : "free"} matches.` : `${o.freeJobsLeft} ${o.guest ? "preview" : "free"} matches left.`}
            </p>
          )}
          {upsell && <Upsell text={upsell} signUp={signUp} />}
        </div>
      );
    }
    case "tool-reviewResume":
      return upsell ? <Upsell text={upsell} signUp={signUp} /> : o.feedback ? <LongForm title={`Resume review: ${job?.title} at ${job?.company}`} body={o.feedback as string} /> : null;
    case "tool-coldEmail": {
      if (upsell) return <Upsell text={upsell} signUp={signUp} />;
      const c = o.contact as { name: string; title: string | null; email: string; confidence: number } | null;
      return (
        <div className="space-y-2">
          <p className="text-sm text-mist">
            {c ? <>Likely contact: <strong className="text-moon">{c.name}</strong>{c.title ? `, ${c.title}` : ""} · {c.email} ({c.confidence}% confidence)</> : <>No verified contact found. <a className="text-runway underline" href={o.findContactYourself as string} target="_blank" rel="noopener noreferrer">Search LinkedIn for their engineering managers</a>.</>}
          </p>
          <LongForm title={`Cold email: ${job?.company}`} body={o.email as string} copy />
        </div>
      );
    }
    case "tool-interviewPlan":
      return upsell ? <Upsell text={upsell} signUp={signUp} /> : <LongForm title={`Interview plan: ${job?.title} at ${job?.company}`} body={o.plan as string} copy />;
    case "tool-tailorResume":
      return upsell ? <Upsell text={upsell} signUp={signUp} /> : <LongForm title={`Tailoring: ${job?.title} at ${job?.company}`} body={o.tips as string} copy />;
    case "tool-updateJobStatus":
      return upsell ? <Upsell text={upsell} signUp={signUp} /> : null;
    case "tool-companySponsorship":
      return (
        <div className="rise flex flex-wrap items-center gap-3 rounded-2xl border border-haze bg-night-2/80 p-4">
          <Stamp badge={o.badge as SponsorBadge} animate />
          <p className="text-sm text-mist">{o.found ? `${o.legalName}: ${(o.badge as SponsorBadge).detail}` : (o.badge as SponsorBadge).detail}</p>
        </div>
      );
    default:
      return null;
  }
}

/**
 * Maya's chat, for a signed-in user or a guest. `viewer` null means "not decided yet": the
 * guest session starts lazily on the first message or upload, so just looking costs nothing.
 */
export function Chat({
  initialMessages = [],
  firstName = null,
  viewer: initialViewer,
  variant = "page",
  autoFocus = false,
  prefill,
}: {
  initialMessages?: UIMessage[];
  firstName?: string | null;
  viewer: Viewer;
  variant?: "page" | "panel";
  autoFocus?: boolean;
  prefill?: string;
}) {
  const { messages, sendMessage, setMessages, status, error } = useChat({
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: ({ messages: m }) => ({ body: { message: m[m.length - 1] } }),
    }),
  });
  const [viewer, setViewer] = useState<Viewer>(initialViewer);
  const [input, setInput] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const busy = status === "submitted" || status === "streaming";

  // A panel opened on the landing page learns who's here (and restores a guest's chat).
  useEffect(() => {
    if (initialViewer !== null) return;
    fetch("/api/guest")
      .then((r) => r.json())
      .then((b: { kind: Viewer; messages: UIMessage[] }) => {
        setViewer(b.kind);
        if (b.messages?.length) setMessages(b.messages);
      })
      .catch(() => {});
  }, [initialViewer, setMessages]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  // A question picked on the landing page lands in the box, ready to send.
  useEffect(() => {
    if (!prefill) return;
    const id = setTimeout(() => setInput(prefill), 0);
    return () => clearTimeout(id);
  }, [prefill]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  const ensureSession = useCallback(async () => {
    if (viewer) return true;
    const res = await fetch("/api/guest", { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as { kind?: Viewer; message?: string };
    if (!res.ok || !body.kind) {
      setNotice(body.message ?? "Couldn't start a chat right now. Try again in a minute.");
      return false;
    }
    setViewer(body.kind);
    return true;
  }, [viewer]);

  const ask = useCallback(
    async (text: string) => {
      if (busy || !text.trim()) return;
      if (!(await ensureSession())) return;
      sendMessage({ text: text.trim() });
    },
    [busy, ensureSession, sendMessage],
  );

  async function upload(file: File) {
    if (!(await ensureSession())) return;
    setNotice(`Reading ${file.name}…`);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/resume", { method: "POST", body: fd });
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    if (!res.ok) {
      setNotice(body.message ?? "That upload didn't work. Try a PDF or DOCX under 5 MB.");
      return;
    }
    setNotice(null);
    sendMessage({ text: `I just uploaded my resume (${file.name}).` });
  }

  const page = variant === "page";

  return (
    <div className={page ? "mx-auto flex w-full max-w-[46rem] flex-1 flex-col px-4" : "flex h-full min-h-0 flex-col"}>
      <div ref={scroller} className={`flex-1 space-y-5 overflow-y-auto ${page ? "py-6" : "px-4 py-5 sm:px-5"}`} aria-live="polite">
        {messages.length === 0 && (
          <div className="rise">
            <p className="font-display text-2xl font-semibold tracking-tight">Hey{firstName ? ` ${firstName}` : ""}, I&apos;m Maya.</p>
            <p className="mt-2 max-w-[34rem] leading-relaxed text-mist">
              I&apos;m an AI that finds US jobs at companies with a real record of filing H-1Bs. Drop in your resume, CV or transcript and I&apos;ll show you who&apos;s hiring people like you.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button onClick={() => fileRef.current?.click()} className="btn-light !py-2.5 text-sm">Upload my resume</button>
              {STARTERS.map((s) => (
                <button key={s} onClick={() => ask(s)} className="rounded-full border border-haze px-3.5 py-2 text-sm text-mist transition-colors hover:border-moon/30 hover:text-moon">
                  {s}
                </button>
              ))}
            </div>
            {viewer !== "user" && <p className="mt-4 text-xs text-mist">No account needed to try: 5 matched jobs on the house.</p>}
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : "space-y-3"}>
            {m.parts.map((p, i) => {
              if (p.type === "text") {
                return m.role === "user" ? (
                  <p key={i} className="rise max-w-[85%] rounded-2xl rounded-br-md bg-moon px-4 py-2.5 text-night">{p.text}</p>
                ) : (
                  <p key={i} className="rise max-w-[92%] whitespace-pre-wrap leading-relaxed">{p.text}</p>
                );
              }
              if (p.type.startsWith("tool-")) return <ToolView key={i} part={p as unknown as ToolPart} ask={ask} />;
              return null;
            })}
          </div>
        ))}
        {status === "submitted" && (
          <p className="dot-typing flex gap-1 px-1 text-2xl leading-none text-mist" aria-label="Maya is typing"><span>·</span><span>·</span><span>·</span></p>
        )}
        {error && <p className="text-sm text-red">{error.message.includes("daily_cap") ? "We've talked a lot today! Let's pick this up tomorrow." : "Something went wrong sending that. Try again."}</p>}
      </div>

      <form
        className={`${page ? "sticky bottom-0 -mx-4 px-4 pb-4" : "px-3 pb-3 sm:px-4"} border-t border-haze bg-night/85 pt-3 backdrop-blur`}
        onSubmit={(e) => {
          e.preventDefault();
          const t = input;
          setInput("");
          void ask(t);
        }}
      >
        {notice && <p className="mb-2 text-sm text-mist">{notice}</p>}
        <div className="flex items-end gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void upload(f);
            }}
          />
          <button type="button" onClick={() => fileRef.current?.click()} aria-label="Upload resume" title="Upload resume (PDF, DOCX, TXT)" className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-haze bg-night-2 transition-colors hover:border-sodium/50">
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-mist" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M21 11.5 12.6 20a5.5 5.5 0 0 1-7.8-7.8l8.5-8.4a3.7 3.7 0 0 1 5.2 5.2l-8.5 8.4a1.8 1.8 0 0 1-2.6-2.6l7.8-7.7" /></svg>
          </button>
          <label className="sr-only" htmlFor={`msg-${variant}`}>Message Maya</label>
          <input
            id={`msg-${variant}`}
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={busy ? "Maya is replying…" : "Message Maya"}
            className="h-11 min-w-0 flex-1 rounded-full border border-haze bg-night-2 px-4 outline-none transition-colors placeholder:text-mist/70 focus:border-sodium/60"
          />
          <button type="submit" disabled={busy || !input.trim()} className="h-11 shrink-0 rounded-full bg-sodium px-5 font-medium text-night transition-opacity disabled:opacity-30">
            Send
          </button>
        </div>
        <p className="mt-2 text-[11px] text-mist">Maya is an AI. Sponsorship info comes from public Dept. of Labor filings and can&apos;t guarantee a visa.</p>
      </form>
    </div>
  );
}
