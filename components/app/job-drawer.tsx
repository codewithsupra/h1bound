"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { jobDetail, markReply, saveNote } from "@/app/(app)/actions";
import { SendEmail } from "@/components/chat/send-email";
import { parseDraft } from "@/lib/email-draft";
import { licenceLine } from "@/lib/visa";
import { canSponsor, nextAction, STAGE_LABEL, STAGES, stageOf, type PipelineRow, type Stage } from "@/lib/pipeline";
import type { JobDetail } from "@/lib/server/pipeline";
import { useMaya } from "./maya-context";
import { Fit, VisaProof, where } from "./pipeline-table";

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** Everything about one job, and the one thing to do next. Slides over the pipeline; full screen on phones. */
export function JobDrawer({ row, now, gmail, pro, urgent, onClose, onMove }: {
  row: PipelineRow; now: number; gmail: boolean; pro: boolean; urgent: boolean; onClose: () => void; onMove: (jobId: string, stage: Stage) => void;
}) {
  const maya = useMaya();
  const [detail, setDetail] = useState<JobDetail | null | undefined>(undefined);
  const [note, setNote] = useState("");
  const [noteState, setNoteState] = useState<"idle" | "saving" | "saved">("idle");
  const [, start] = useTransition();
  const panel = useRef<HTMLDivElement>(null);
  const next = nextAction(row, now);
  const stage = stageOf(row.status);

  useEffect(() => {
    let live = true;
    jobDetail(row.jobId).then((d) => { if (!live) return; setDetail(d); setNote(d?.note ?? ""); });
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { live = false; window.removeEventListener("keydown", onKey); };
  }, [row.jobId, onClose]);

  const draftAsk = `Draft a cold email for the ${row.title} role at ${row.company} (job ${row.jobId})`;
  const email = detail?.email ?? null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`${row.title} at ${row.company}`}>
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-night/60 backdrop-blur-[2px]" />
      <div ref={panel} tabIndex={-1} className="relative flex h-full w-full max-w-[34rem] flex-col overflow-y-auto border-l border-haze bg-night-2 outline-none">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-haze bg-night-2/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0">
            <p className="text-sm text-mist">{row.company}</p>
            <h2 className="font-display text-xl font-bold leading-tight">{row.title}</h2>
            <p className="mt-1 text-sm text-mist">{where(row)} · picked {fmt(row.shownAt)}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-haze text-mist hover:text-moon">✕</button>
        </div>

        <div className="space-y-6 px-5 py-5">
          <div className="flex flex-wrap items-center gap-4">
            <VisaProof row={row} />
            <Fit score={row.score} />
            <label className="ml-auto flex items-center gap-2 text-sm text-mist">
              Stage
              <select value={stage} onChange={(e) => onMove(row.jobId, e.target.value as Stage)} className="rounded-full border border-haze bg-night px-3 py-1.5 text-sm text-moon outline-none focus:border-moon/30">
                {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
              </select>
            </label>
          </div>

          {row.licence ? (
            <p className="rounded-xl border border-haze bg-night/50 p-3 text-sm">{licenceLine(row.licence)}.{urgent && canSponsor(row.licence) ? " Can sponsor you once your current visa ends." : ""}</p>
          ) : (
            <p className="rounded-xl border border-haze bg-night/50 p-3 text-sm text-mist">{row.remote ? "Remote role: check they can hire in your country before applying." : "This employer isn't on the official sponsor register. Fine if you can work without a sponsor; otherwise ask before applying."}</p>
          )}

          {row.why && (
            <section>
              <h3 className="text-sm font-semibold">Why it fits</h3>
              <p className="mt-1 text-sm leading-relaxed text-moon/90">{row.why}</p>
            </section>
          )}

          {next === "ask_reply" && (
            <section className="rounded-2xl border border-sodium/40 bg-sodium/[0.06] p-4">
              <h3 className="text-sm font-semibold">Did {row.contact?.name?.split(" ")[0] ?? "they"} reply?</h3>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button onClick={() => start(async () => { await markReply(row.jobId, "yes"); })} className="btn-light !px-4 !py-1.5 text-sm">Yes</button>
                <button onClick={() => start(async () => { await markReply(row.jobId, "not_yet"); })} className="btn-ghost !px-4 !py-1.5 text-sm">Not yet</button>
                <button onClick={() => start(async () => { await markReply(row.jobId, "no"); })} className="btn-ghost !px-4 !py-1.5 text-sm">They said no</button>
              </div>
              <p className="mt-2 text-xs text-mist">Your answers make your reply rate real. We can&apos;t read your inbox.</p>
            </section>
          )}

          <section>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">Your email</h3>
              {row.contact?.name && <span className="truncate text-xs text-mist">To {row.contact.name}{row.contact.role ? `, ${row.contact.role}` : ""}</span>}
            </div>
            {detail === undefined ? (
              <p className="mt-2 text-sm text-mist">Loading…</p>
            ) : email?.sentAt ? (
              <SentEmail email={email} gmail={gmail} now={now} />
            ) : email ? (
              <div className="mt-2">
                <SendEmail
                  outreachId={email.outreachId}
                  followUpId={null}
                  draft={parseDraft(email.text)}
                  to={email.to}
                  gmail={gmail ? "connected" : "not_connected"}
                  job={{ title: row.title, company: row.company }}
                  onAsk={maya.ask}
                />
              </div>
            ) : (
              <div className="mt-2 rounded-xl border border-dashed border-haze p-4 text-sm">
                <p className="text-mist">{pro ? "Maya finds the hiring manager and writes a short email from your CV." : "Pro (and the free trial) finds the hiring manager and drafts the email."}</p>
                <button onClick={() => maya.ask(draftAsk)} className="btn-light mt-3 !px-4 !py-1.5 text-sm">Draft it with Maya</button>
              </div>
            )}
          </section>

          <section className="flex flex-wrap gap-2">
            <button onClick={() => maya.ask(`What's it like to work at ${row.company}? Culture, interviews, what people say.`)} className="btn-ghost !px-4 !py-1.5 text-sm">Company culture</button>
            <button onClick={() => maya.ask(`Review my CV against the ${row.title} role at ${row.company} (job ${row.jobId})`)} className="btn-ghost !px-4 !py-1.5 text-sm">Check my CV for this</button>
            {(stage === "replied" || stage === "interview") && (
              <button onClick={() => maya.ask(`Make me an interview prep plan for the ${row.title} role at ${row.company} (job ${row.jobId})`)} className="btn-ghost !px-4 !py-1.5 text-sm">Interview prep</button>
            )}
            <a href={row.url} target="_blank" rel="noopener noreferrer" className="btn-ghost !px-4 !py-1.5 text-sm">Open posting ↗</a>
          </section>

          <section>
            <label htmlFor="note" className="flex items-center justify-between text-sm font-semibold">
              Notes <span className="text-xs font-normal text-mist">{noteState === "saving" ? "Saving…" : noteState === "saved" ? "Saved" : "Only you can see these"}</span>
            </label>
            <textarea
              id="note"
              value={note}
              onChange={(e) => { setNote(e.target.value); setNoteState("idle"); }}
              onBlur={() => { if (note === (detail?.note ?? "")) return; setNoteState("saving"); start(async () => { await saveNote(row.jobId, note); setDetail((d) => (d ? { ...d, note } : d)); setNoteState("saved"); }); }}
              rows={3}
              placeholder="Referral from Priya, salary band, interview dates…"
              className="mt-1.5 w-full resize-y rounded-xl border border-haze bg-night/60 px-3 py-2 text-sm outline-none focus:border-moon/40"
            />
          </section>

          {detail?.description && (
            <details className="border-t border-haze pt-4">
              <summary className="cursor-pointer text-sm font-semibold">Job description{detail.postedAt ? <span className="font-normal text-mist"> · posted {fmt(detail.postedAt)}</span> : null}</summary>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-mist">{detail.description}</p>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}

/** A sent email: read-only, with the follow-up once it unlocks (4 days after the first send). */
function SentEmail({ email, gmail, now }: { email: NonNullable<JobDetail["email"]>; gmail: boolean; now: number }) {
  const draft = parseDraft(email.text);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(email.followUpSentAt ? "sent" : "idle");
  const unlocked = now - Date.parse(email.sentAt!) >= 4 * 86_400_000;
  async function sendFollowUp() {
    if (!email.followUpId || !email.to || !email.followUp) return;
    setState("sending");
    const res = await fetch("/api/outreach/send", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ outreachId: email.followUpId, to: email.to, subject: draft.subject.startsWith("Re:") ? draft.subject : `Re: ${draft.subject}`, body: email.followUp }),
    });
    setState(res.ok ? "sent" : "error");
  }
  return (
    <div className="mt-2 space-y-3 rounded-xl border border-haze bg-night/50 p-4 text-sm">
      <p className="text-mist">Sent {fmt(email.sentAt!)}{email.to ? ` to ${email.to}` : ""}</p>
      <details>
        <summary className="cursor-pointer">{draft.subject || "Your email"}</summary>
        <p className="mt-2 whitespace-pre-wrap text-mist">{draft.body}</p>
      </details>
      {email.followUp && (
        <div className="border-t border-haze pt-3">
          <p className="font-medium">Follow-up</p>
          <p className="mt-1 whitespace-pre-wrap text-mist">{email.followUp}</p>
          {state === "sent" ? <p className="mt-2 text-green">Follow-up sent{email.followUpSentAt ? ` ${fmt(email.followUpSentAt)}` : ""}.</p>
            : !unlocked ? <p className="mt-2 text-xs text-mist">Unlocks {fmt(new Date(Date.parse(email.sentAt!) + 4 * 86_400_000).toISOString())}. Give them a few days.</p>
            : gmail && email.to ? <button onClick={sendFollowUp} disabled={state === "sending"} className="btn-light mt-2 !px-4 !py-1.5 text-sm">{state === "sending" ? "Sending…" : "Send follow-up"}</button>
            : <p className="mt-2 text-xs text-mist">Copy it into your email thread.</p>}
          {state === "error" && <p className="mt-2 text-red">Gmail didn&apos;t accept it. Try again.</p>}
        </div>
      )}
    </div>
  );
}
