"use client";

import { useEffect, useState } from "react";
import type { SponsorBadge } from "@/lib/sponsor";
import { Stamp } from "@/components/chat/stamp";
import { useInView } from "./in-view";

/** A conversation that plays itself once, when scrolled into view. */
export function MayaDemo({ company, badge }: { company: string; badge: SponsorBadge }) {
  const [ref, seen] = useInView<HTMLDivElement>(0.4);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!seen) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = setTimeout(() => setStep(5), 0);
      return () => clearTimeout(id);
    }
    const times = [100, 800, 2000, 2900, 4100];
    const ids = times.map((t, i) => setTimeout(() => setStep(i + 1), t));
    return () => ids.forEach(clearTimeout);
  }, [seen]);

  return (
    <div ref={ref} className="glass relative mx-auto w-full max-w-lg rounded-3xl p-5 sm:p-6" aria-label="Example conversation with Maya">
      <div className="mb-5 flex items-center gap-3">
        <span className="relative grid h-9 w-9 place-items-center rounded-full bg-sodium font-display font-bold text-night">
          M
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-night-2 bg-green" />
        </span>
        <div className="leading-tight">
          <p className="font-display font-semibold">Maya <span className="ml-1 rounded border border-haze px-1 text-[0.65rem] text-mist">AI</span></p>
          <p className="text-xs text-mist">usually replies in seconds</p>
        </div>
      </div>
      <div className="min-h-[21rem] space-y-3">
        {step >= 1 && (
          <p className="rise ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-moon px-4 py-2.5 text-night">
            I&apos;m on STEM OPT, backend + Python. Who&apos;s actually hiring people like me?
          </p>
        )}
        {step === 2 && <p className="dot-typing flex gap-1 px-1 text-2xl leading-none text-mist"><span>·</span><span>·</span><span>·</span></p>}
        {step >= 3 && <p className="rise max-w-[92%] leading-relaxed">Found 5 good ones. This one&apos;s the strongest on sponsorship:</p>}
        {step >= 4 && (
          <div className="rise rounded-2xl border border-haze bg-night/50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-display font-semibold">Software Engineer, Backend</p>
                <p className="text-sm text-mist">{company} · New York, NY</p>
              </div>
              <Stamp badge={badge} animate />
            </div>
            <p className="mt-3 text-sm text-mist">{badge.detail}</p>
          </div>
        )}
        {step >= 5 && <p className="rise max-w-[92%] leading-relaxed">Want me to find their backend eng manager and draft a cold email?</p>}
      </div>
      <p className="mt-4 text-xs text-mist">Example job for illustration. Filing numbers are real.</p>
    </div>
  );
}
