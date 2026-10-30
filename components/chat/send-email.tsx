"use client";

import { useEffect, useState } from "react";
import type { Draft } from "@/lib/email-draft";

type Props = {
  outreachId: string;
  followUpId: string | null;
  draft: Draft;
  to: string | null;
  gmail: "connected" | "not_connected" | "unavailable";
  job: { title: string; company: string };
  onAsk: (text: string) => void;
};

type State = { kind: "idle" } | { kind: "sending" } | { kind: "sent"; from: string } | { kind: "error"; message: string };

const ERRORS: Record<string, string> = {
  not_connected: "Connect Gmail first.",
  already_sent: "This one has already been sent.",
  too_soon: "Give them a few days first; the follow-up unlocks 4 days after your first email.",
  send_failed: "Gmail didn't accept it. Check the address and try again.",
  bad_request: "Check the address, subject and message.",
};

async function send(outreachId: string, to: string, subject: string, body: string): Promise<State> {
  const res = await fetch("/api/outreach/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ outreachId, to, subject, body }) });
  const out = (await res.json().catch(() => ({}))) as { ok?: boolean; from?: string; error?: string };
  return out.ok ? { kind: "sent", from: out.from ?? "your Gmail" } : { kind: "error", message: ERRORS[out.error ?? ""] ?? "Something went wrong. Try again." };
}

const field = "w-full rounded-xl border border-haze bg-night/60 px-3 py-2 text-sm outline-none focus:border-moon/40";

/** Review-then-send: nothing leaves until the user taps Send, and it goes from their own Gmail. */
export function SendEmail({ outreachId, followUpId, draft, to: initialTo, gmail: initialGmail, job, onAsk }: Props) {
  // The card may be rendered from an older message: recheck after the user connects Gmail.
  const [gmail, setGmail] = useState(initialGmail);
  useEffect(() => {
    if (initialGmail !== "not_connected") return;
    fetch("/api/gmail/status").then((r) => r.json()).then((b: { gmail: Props["gmail"] }) => setGmail(b.gmail)).catch(() => {});
  }, [initialGmail]);
  const [to, setTo] = useState(initialTo ?? "");
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [state, setState] = useState<State>({ kind: "idle" });
  const [fu, setFu] = useState<State>({ kind: "idle" });
  const [copied, setCopied] = useState(false);
  const sent = state.kind === "sent";

  return (
    <article className="rise space-y-3 rounded-2xl border border-haze bg-night-2/80 p-4 sm:p-5">
      <h3 className="font-display text-[1.05rem] font-semibold">Email for {job.title} at {job.company}</h3>
      <label className="block space-y-1 text-xs text-mist">
        To
        <input value={to} onChange={(e) => setTo(e.target.value)} disabled={sent} placeholder="name@company.com" className={field} inputMode="email" autoComplete="off" />
      </label>
      <label className="block space-y-1 text-xs text-mist">
        Subject
        <input value={subject} onChange={(e) => setSubject(e.target.value)} disabled={sent} className={field} />
      </label>
      <label className="block space-y-1 text-xs text-mist">
        Message
        <textarea value={body} onChange={(e) => setBody(e.target.value)} disabled={sent} rows={9} className={`${field} resize-y leading-relaxed`} />
      </label>

      {sent ? (
        <div className="space-y-2">
          <p className="text-sm">Sent from {state.from}. I&apos;ll help you follow up.</p>
          <div className="flex flex-wrap gap-2">
            <span className="text-sm text-mist">Did they reply?</span>
            <button onClick={() => onAsk(`They replied to my email about the ${job.title} role at ${job.company}!`)} className="rounded-full border border-haze px-3 py-1 text-sm hover:border-moon/30">Yes, they replied</button>
            <button onClick={() => onAsk(`I got an interview for the ${job.title} role at ${job.company}!`)} className="rounded-full border border-haze px-3 py-1 text-sm hover:border-moon/30">Got an interview</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {gmail === "connected" && (
            <button
              onClick={async () => { setState({ kind: "sending" }); setState(await send(outreachId, to, subject, body)); }}
              disabled={state.kind === "sending" || !to || !subject || !body}
              className="btn-light !px-4 !py-1.5 text-sm disabled:opacity-60"
            >
              {state.kind === "sending" ? "Sending…" : "Send from my Gmail"}
            </button>
          )}
          {gmail === "not_connected" && (
            <a href="/api/gmail/connect" className="btn-light !px-4 !py-1.5 text-sm">Connect Gmail to send</a>
          )}
          <button
            onClick={async () => { await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`); setCopied(true); }}
            className="rounded-full border border-haze px-3.5 py-1.5 text-sm hover:border-moon/30"
          >
            {copied ? "Copied" : "Copy instead"}
          </button>
          {state.kind === "error" && <p className="w-full text-sm text-red">{state.message}</p>}
          {gmail === "not_connected" && <p className="w-full text-xs text-mist">We only ask for permission to send emails you approve. We can&apos;t read your inbox.</p>}
        </div>
      )}

      {draft.followUp && followUpId && (
        <details className="border-t border-haze pt-3">
          <summary className="cursor-pointer text-sm text-mist">Follow-up for 4–5 days later</summary>
          <p className="mt-2 whitespace-pre-wrap text-sm">{draft.followUp}</p>
          {gmail === "connected" && fu.kind !== "sent" && (
            <button
              onClick={async () => { setFu({ kind: "sending" }); setFu(await send(followUpId, to, subject.startsWith("Re:") ? subject : `Re: ${subject}`, draft.followUp!)); }}
              disabled={fu.kind === "sending" || !to}
              className="mt-2 rounded-full border border-haze px-3.5 py-1.5 text-sm hover:border-moon/30 disabled:opacity-60"
            >
              {fu.kind === "sending" ? "Sending…" : "Send follow-up"}
            </button>
          )}
          {fu.kind === "sent" && <p className="mt-2 text-sm">Follow-up sent.</p>}
          {fu.kind === "error" && <p className="mt-2 text-sm text-red">{fu.message}</p>}
        </details>
      )}
    </article>
  );
}
