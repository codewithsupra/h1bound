"use client";

import { useEffect, useState } from "react";
import { useInView } from "../in-view";

export type Figure = { value: number; label: string; note?: string };

/** One count-up, run once when the grid scrolls into view. Width is reserved so nothing shifts. */
function Count({ to, run }: { to: number; run: boolean }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!run) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = setTimeout(() => setN(to), 0);
      return () => clearTimeout(id);
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 1600);
      setN(Math.round(to * (1 - Math.pow(1 - p, 4))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, to]);
  const final = to.toLocaleString("en-US");
  return (
    <span className="relative inline-block">
      <span className="invisible">{final}</span>
      <span className="absolute inset-0">{n.toLocaleString("en-US")}</span>
    </span>
  );
}

export function Numbers({ figures }: { figures: Figure[] }) {
  const [ref, seen] = useInView<HTMLDListElement>(0.3);
  return (
    <section aria-labelledby="numbers-h" className="mx-auto max-w-6xl px-4 py-28 sm:px-6 sm:py-36">
      <h2 id="numbers-h" className="max-w-[18ch] font-display text-[clamp(2.2rem,5.5vw,4.5rem)] font-semibold leading-[1] tracking-[-0.035em]">
        Built on the public record, refreshed every morning.
      </h2>
      <dl ref={ref} className="mt-16 grid grid-cols-2 gap-x-6 gap-y-14 lg:grid-cols-4">
        {figures.map((f) => (
          <div key={f.label} className="flex flex-col-reverse justify-end border-t border-haze pt-5">
            {f.note && <p className="mt-1 text-xs text-mist/70">{f.note}</p>}
            <dt className="mt-3 max-w-[16rem] text-mist">{f.label}</dt>
            <dd className="font-display text-[clamp(2.2rem,5vw,3.6rem)] font-semibold leading-none tracking-[-0.03em] text-moon">
              <Count to={f.value} run={seen} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
