import Link from "next/link";
import { OptCalculator } from "./opt-calculator";

export function OptSection() {
  return (
    <section id="opt" aria-labelledby="opt-h" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-28 sm:px-6 sm:py-36">
      <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-16">
        <div>
          <h2 id="opt-h" className="max-w-[12ch] font-display text-[clamp(2.2rem,5.5vw,4.5rem)] font-semibold leading-[1] tracking-[-0.035em]">
            90 days. Make every one count.
          </h2>
          <p className="mt-6 max-w-[30rem] text-lg leading-relaxed text-mist">
            On OPT, the unemployment clock is the deadline behind everything. Maya keeps count, puts fast-hiring sponsors first when time is short, and points you to cap-exempt employers that skip the lottery.
          </p>
          <Link href="/opt-clock" className="mt-6 inline-block text-moon underline decoration-haze underline-offset-4 hover:decoration-sodium">How the OPT clock works</Link>
        </div>
        <OptCalculator />
      </div>
    </section>
  );
}
