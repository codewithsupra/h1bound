import Link from "next/link";

const Check = () => <svg viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0 text-sodium" fill="currentColor" aria-hidden><path d="M8.2 13.6 4.6 10l-1.2 1.2 4.8 4.8L17 7.2 15.8 6z" /></svg>;

export function Pricing({ inviteJobs }: { inviteJobs: number }) {
  return (
    <section id="pricing" aria-labelledby="pricing-h" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-28 sm:px-6 sm:py-36">
      <h2 id="pricing-h" className="font-display text-[clamp(2.2rem,5.5vw,4.5rem)] font-semibold leading-[1] tracking-[-0.035em]">Free to start. Fair after.</h2>
      <p className="mt-6 max-w-[34rem] text-lg text-mist">Priced for students, in dollars or rupees. Try every Pro feature free for 7 days, no card.</p>
      <div className="mt-14 grid gap-5 md:grid-cols-2">
        <div className="rounded-[2rem] border border-haze bg-night-2/60 p-8 sm:p-10">
          <p className="font-display text-xl font-semibold">Free</p>
          <p className="mt-4 font-display text-6xl font-semibold tracking-tight">$0</p>
          <p className="mt-1 text-mist">No card, no time limit.</p>
          <ul className="mt-8 space-y-3">
            {["10 matched jobs, each with its H-1B record", `${inviteJobs} more jobs for every friend you bring (up to 3)`, "Resume reviews on 5 jobs", "OPT clock that paces your search", "Chat with Maya, or try it without an account"].map((t) => (
              <li key={t} className="flex gap-3 text-moon/90"><Check />{t}</li>
            ))}
          </ul>
          <Link href="/login?mode=signup" className="btn-ghost mt-10 w-full">Create free account</Link>
        </div>
        <div className="relative overflow-hidden rounded-[2rem] border border-sodium/40 bg-night-2/80 p-8 sm:p-10">
          <div className="pointer-events-none absolute -right-28 -top-28 h-72 w-72 rounded-full bg-sodium/20 blur-3xl" />
          <div className="relative">
            <div className="flex items-center justify-between gap-3">
              <p className="font-display text-xl font-semibold">Pro</p>
              <span className="rounded-full bg-sodium px-3 py-1 text-xs font-semibold text-night">7 days free</span>
            </div>
            <p className="mt-4 font-display text-6xl font-semibold tracking-tight">$12<span className="text-xl font-normal text-mist">/month</span></p>
            <p className="mt-1 text-mist">₹399/month in India. Cancel anytime.</p>
            <ul className="mt-8 space-y-3">
              {["Unlimited matches, new sponsor jobs every morning", "Hiring manager found and cold email drafted", "Interview plan for every job", "Resume tailoring per posting", "Unlimited resume reviews"].map((t) => (
                <li key={t} className="flex gap-3 text-moon/90"><Check />{t}</li>
              ))}
            </ul>
            <Link href="/login?mode=signup" className="btn-light mt-10 w-full">Start free, try Pro for 7 days</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
