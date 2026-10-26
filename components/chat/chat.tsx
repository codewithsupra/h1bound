"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";
import type { JobCard as Job } from "@/lib/server/jobs";
import type { SponsorBadge } from "@/lib/sponsor";
import { JobCard } from "./job-card";
import { Stamp } from "./stamp";

type ToolPart = { type: string; state: string; output?: Record<string, unknown>; errorText?: string };

const WORKING: Record<string, string> = {
  "tool-findJobs": "Looking through today's openings at sponsoring employers…",
  "tool-reviewResume": "Reading your resume against the posting…",
  "tool-coldEmail": "Finding the right person and drafting your email…",
  "tool-interviewPlan": "Building your prep plan…",
  "tool-tailorResume": "Working out what to change for this role…",
  "tool-companySponsorship": "Checking Dept. of Labor filings…",
};

function LongForm({ title, body, copy }: { title: string; body: string; copy?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <section className="rounded-xl border border-line bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display font-semibold">{title}</h3>
        {copy && (
          <button
            onClick={() => navigator.clipboard.writeText(body).then(() => setCopied(true))}
            className="rounded-lg border border-line px-2.5 py-1 text-sm hover:bg-paper"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>
      <div className="mt-3 whitespace-pre-wrap text-[0.94rem] leading-relaxed">{body}</div>
    </section>
  );
}

function Upsell({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-amber/40 bg-amber/5 p-4 text-sm">
      <p>{text}</p>
      <a href="/upgrade" className="mt-3 inline-block rounded-lg bg-ink px-3 py-1.5 font-medium text-paper hover:opacity-90">
        See Pro
      </a>
    </div>
  );
}

function ToolView({ part, ask }: { part: ToolPart; ask: (t: string) => void }) {
  if (part.state === "output-error") return <p className="text-sm text-red">That didn't work: {part.errorText}. Try again in a moment.</p>;
  if (part.state !== "output-available") {
    return <p className="animate-pulse text-sm text-slate">{WORKING[part.type] ?? "Working on it…"}</p>;
  }
  const o = part.output ?? {};
  const upsell = (o.upsell as string | undefined) ?? null;
  const job = o.job as { title: string; company: string } | undefined;

  switch (part.type) {
    case "tool-findJobs": {
      const jobs = (o.jobs as Job[]) ?? [];
      return (
        <div className="space-y-3">
          {jobs.map((j) => <JobCard key={j.id} job={j} onAsk={ask} />)}
          {typeof o.freeJobsLeft === "number" && jobs.length > 0 && (
            <p className="text-sm text-slate">{o.freeJobsLeft === 0 ? "That's all 10 free matches." : `${o.freeJobsLeft} free matches left.`}</p>
          )}
          {upsell && <Upsell text={upsell} />}
        </div>
      );
    }
    case "tool-reviewResume":
      return upsell ? <Upsell text={upsell} /> : o.feedback ? <LongForm title={`Resume review: ${job?.title} at ${job?.company}`} body={o.feedback as string} /> : null;
    case "tool-coldEmail": {
      if (upsell) return <Upsell text={upsell} />;
      const c = o.contact as { name: string; title: string | null; email: string; confidence: number } | null;
      return (
        <div className="space-y-2">
          <p className="text-sm text-slate">
            {c ? <>Likely contact: <strong className="text-ink">{c.name}</strong>{c.title ? `, ${c.title}` : ""} · {c.email} ({c.confidence}% confidence)</> : <>I couldn't find a verified contact. <a className="underline" href={o.findContactYourself as string} target="_blank" rel="noopener noreferrer">Search LinkedIn for their engineering managers</a>.</>}
          </p>
          <LongForm title={`Cold email: ${job?.company}`} body={o.email as string} copy />
        </div>
      );
    }
    case "tool-interviewPlan":
      return upsell ? <Upsell text={upsell} /> : <LongForm title={`Interview plan: ${job?.title} at ${job?.company}`} body={o.plan as string} copy />;
    case "tool-tailorResume":
      return upsell ? <Upsell text={upsell} /> : <LongForm title={`Tailoring: ${job?.title} at ${job?.company}`} body={o.tips as string} copy />;
    case "tool-companySponsorship":
      return (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-card p-4">
          <Stamp badge={o.badge as SponsorBadge} animate />
          <p className="text-sm text-slate">{o.found ? `${o.legalName}: ${(o.badge as SponsorBadge).detail}` : (o.badge as SponsorBadge).detail}</p>
        </div>
      );
    default:
      return null;
  }
}

export function Chat({ initialMessages, firstName }: { initialMessages: UIMessage[]; firstName: string | null }) {
  const { messages, sendMessage, status, error } = useChat({
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: ({ messages: m }) => ({ body: { message: m[m.length - 1] } }),
    }),
  });
  const [input, setInput] = useState("");
  const [uploading, setUploading] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, status]);

  const ask = (text: string) => {
    if (!busy) sendMessage({ text });
  };

  async function upload(file: File) {
    setUploading(`Reading ${file.name}…`);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/resume", { method: "POST", body: fd });
    const body = (await res.json().catch(() => ({}))) as { message?: string; summary?: { headline?: string | null } };
    setUploading(null);
    if (!res.ok) {
      setUploading(body.message ?? "That upload didn't work. Try a PDF or DOCX under 5 MB.");
      return;
    }
    sendMessage({ text: `I just uploaded my resume (${file.name}).` });
  }

  return (
    <div className="mx-auto flex w-full max-w-[46rem] flex-1 flex-col px-4">
      <div className="flex-1 space-y-5 py-6" aria-live="polite">
        {messages.length === 0 && (
          <div className="rounded-xl border border-line bg-card p-5">
            <p className="font-display text-lg font-semibold">Hey{firstName ? ` ${firstName}` : ""}, I'm Maya.</p>
            <p className="mt-1 text-slate">
              I'm an AI that finds US jobs at companies with a real record of filing H-1Bs, then helps you get noticed. Drop in your resume, CV, transcript or biodata to start.
            </p>
            <button onClick={() => fileRef.current?.click()} className="mt-4 rounded-lg bg-ink px-4 py-2 font-medium text-paper hover:opacity-90">
              Upload my resume
            </button>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : "space-y-3"}>
            {m.parts.map((p, i) => {
              if (p.type === "text") {
                return m.role === "user" ? (
                  <p key={i} className="max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-paper">{p.text}</p>
                ) : (
                  <p key={i} className="max-w-[92%] whitespace-pre-wrap leading-relaxed">{p.text}</p>
                );
              }
              if (p.type.startsWith("tool-")) return <ToolView key={i} part={p as unknown as ToolPart} ask={ask} />;
              return null;
            })}
          </div>
        ))}
        {status === "submitted" && <p className="animate-pulse text-sm text-slate">Maya is typing…</p>}
        {error && <p className="text-sm text-red">{error.message.includes("daily_cap") ? "We've talked a lot today! Let's pick this up tomorrow." : "Something went wrong sending that. Try again."}</p>}
        <div ref={endRef} />
      </div>

      <form
        className="sticky bottom-0 -mx-4 border-t border-line bg-paper/95 px-4 pb-4 pt-3 backdrop-blur"
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim() && !busy) {
            sendMessage({ text: input.trim() });
            setInput("");
          }
        }}
      >
        {uploading && <p className="mb-2 text-sm text-slate">{uploading}</p>}
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
          <button type="button" onClick={() => fileRef.current?.click()} aria-label="Upload resume" title="Upload resume (PDF, DOCX, TXT)" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line bg-card text-lg hover:bg-paper">
            📎
          </button>
          <label className="sr-only" htmlFor="msg">Message Maya</label>
          <input
            id="msg"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={busy ? "Maya is replying…" : "Message Maya"}
            className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-card px-3.5 outline-none focus:border-ink"
          />
          <button type="submit" disabled={busy || !input.trim()} className="h-11 shrink-0 rounded-xl bg-ink px-4 font-medium text-paper disabled:opacity-40">
            Send
          </button>
        </div>
        <p className="mt-2 text-xs text-slate">Maya is an AI. Sponsorship info comes from public Dept. of Labor filings and can't guarantee a visa.</p>
      </form>
    </div>
  );
}
