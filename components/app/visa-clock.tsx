import Link from "next/link";
import { visaUrgency } from "@/lib/pipeline";

const SITUATION: Record<string, string> = { student: "student visa", graduate: "post-study visa" };
const TONE = { calm: "green", soon: "sodium", urgent: "red", expired: "red" } as const;

/**
 * Days left on a student or post-study visa, on split-flap cells. Under 90 days the pipeline puts
 * licensed sponsors first, and this card says so.
 */
export function VisaClock({ endsOn, situation, now }: { endsOn: string | null; situation: string | null; now: number }) {
  const needs = situation === "student" || situation === "graduate";
  const u = visaUrgency(endsOn, now);
  if (!u) {
    if (!needs) return null;
    return (
      <Link href="/case#rights" className="block rounded-2xl border border-dashed border-haze p-3.5 text-sm transition-colors hover:border-sodium/50">
        <span className="font-medium">Start your visa clock</span>
        <span className="mt-0.5 block text-xs text-mist">Add your {SITUATION[situation!]} end date and Maya puts sponsors first as it nears.</span>
      </Link>
    );
  }
  const digits = String(u.days).padStart(3, " ");
  const left = Math.min(1, u.days / 730);
  return (
    <Link href="/case#rights" className="block rounded-2xl border border-haze bg-night-2/70 p-3.5 transition-colors hover:border-moon/25" aria-label={`${u.days} days left on your visa`}>
      <span className="flex items-center justify-between text-xs text-mist">
        <span>Visa clock</span>
        <span>{new Date(`${endsOn}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
      </span>
      <span className="mt-2 flex items-end gap-2">
        <span className="inline-flex text-xl" aria-hidden>
          {digits.split("").map((c, i) => <span key={i} className="flap" data-tone={TONE[u.level]}>{c}</span>)}
        </span>
        <span className="pb-0.5 text-sm text-mist">days left</span>
      </span>
      <span className="mt-2.5 block h-1 overflow-hidden rounded-full bg-haze">
        <span className={`block h-full rounded-full ${u.level === "calm" ? "bg-green" : u.level === "soon" ? "bg-sodium" : "bg-red"}`} style={{ width: `${Math.max(3, left * 100)}%` }} />
      </span>
      <span className="mt-2 block text-xs leading-snug text-mist">
        {u.level === "expired" ? "Your visa date has passed. Update it if it changed." : u.level === "urgent" ? "Sponsors are first in your pipeline now." : u.level === "soon" ? "Under six months: start the sponsor conversations." : "Plenty of runway. Sponsors still rank higher."}
      </span>
    </Link>
  );
}
