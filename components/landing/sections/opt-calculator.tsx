"use client";

import { useEffect, useMemo, useState } from "react";
import { optStatus, type OptType } from "@/lib/opt";
import { FlapText } from "../flap-board";
import { openMaya } from "../try-maya";

const today = () => new Date().toISOString().slice(0, 10);

/**
 * The OPT unemployment clock as a departure board. Runs entirely in the browser; nothing is sent
 * anywhere until the person chooses to bring it to Maya.
 */
export function OptCalculator({ size = "md" }: { size?: "md" | "lg" }) {
  const [type, setType] = useState<OptType>("opt");
  const [used, setUsed] = useState("20");
  const [employed, setEmployed] = useState(false);
  const [asOf, setAsOf] = useState<string | null>(null);
  useEffect(() => { const id = setTimeout(() => setAsOf(today()), 0); return () => clearTimeout(id); }, []);

  const usedDays = Math.max(0, Math.min(150, Number.parseInt(used, 10) || 0));
  const s = useMemo(() => optStatus({ type, usedDays, asOf: asOf ?? "", employed }), [type, usedDays, asOf, employed]);
  const tone = s.left <= 15 ? "red" : s.left <= 30 ? "sodium" : "green";
  const deadline = s.deadline ? new Date(`${s.deadline}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) : null;

  return (
    <div className={`glass rounded-[2rem] ${size === "lg" ? "p-6 sm:p-10" : "p-6 sm:p-8"}`}>
      <div className="grid gap-4 sm:grid-cols-3 sm:items-end">
        <label className="block text-sm text-mist">
          I&apos;m on
          <select value={type} onChange={(e) => setType(e.target.value as OptType)} className="mt-1.5 h-12 w-full rounded-xl border border-haze bg-night/60 px-3 text-moon outline-none focus:border-sodium/60">
            <option value="opt">F-1 OPT (90 days)</option>
            <option value="stem">STEM OPT (150 total)</option>
          </select>
        </label>
        <label className="block text-sm text-mist">
          Days unemployed so far
          <input inputMode="numeric" value={used} onChange={(e) => setUsed(e.target.value.replace(/\D/g, "").slice(0, 3))} className="mt-1.5 h-12 w-full rounded-xl border border-haze bg-night/60 px-3 text-moon tabular-nums outline-none focus:border-sodium/60" />
        </label>
        <fieldset className="text-sm text-mist">
          <legend>Right now I&apos;m</legend>
          <div className="mt-1.5 grid h-12 grid-cols-2 rounded-xl border border-haze bg-night/60 p-1">
            {[["Looking", false], ["Employed", true]].map(([l, v]) => (
              <button key={String(l)} type="button" aria-pressed={employed === v} onClick={() => setEmployed(v as boolean)} className={`rounded-lg transition-colors ${employed === v ? "bg-moon text-night" : "text-mist hover:text-moon"}`}>
                {l}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="mt-8 flex flex-wrap items-end gap-x-6 gap-y-3" aria-live="polite">
        <div className={size === "lg" ? "text-[clamp(2.6rem,9vw,5.5rem)]" : "text-[clamp(2.4rem,7vw,4.4rem)]"}>
          <FlapText text={String(s.left).padStart(3, " ")} width={3} tone={tone} />
        </div>
        <p className="pb-2 text-lg text-mist">
          <span className="sr-only">{s.left} </span>of {s.allowance} days left
        </p>
      </div>
      <p className="mt-3 text-mist">
        {s.expired ? "Your unemployment days are used up. Talk to your DSO today." : employed ? "Your clock is paused while you're employed." : deadline ? `If nothing changes, your last day is ${deadline}.` : " "}
      </p>
      <div className="mt-7 flex flex-wrap items-center gap-3">
        <button type="button" onClick={(e) => openMaya(e, `I'm on ${type === "stem" ? "STEM OPT" : "OPT"} with ${s.left} unemployment days left. Help me prioritize.`)} className="btn-light">
          Let Maya pace your search
        </button>
        <span className="text-xs text-mist">Estimate only, not legal advice. Your DSO&apos;s count is official.</span>
      </div>
    </div>
  );
}
