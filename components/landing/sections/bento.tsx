import { WaitlistForm } from "./waitlist-form";

const Tile = ({ className = "", children }: { className?: string; children: React.ReactNode }) => (
  <div className={`relative overflow-hidden rounded-[1.75rem] border border-haze bg-night-2/70 p-7 ${className}`}>{children}</div>
);
const H = ({ children }: { children: React.ReactNode }) => <h3 className="font-display text-2xl font-semibold tracking-[-0.02em]">{children}</h3>;
const P = ({ children }: { children: React.ReactNode }) => <p className="mt-2 max-w-[28rem] leading-relaxed text-mist">{children}</p>;

/** Everything else Maya does, at a glance. Tile sizes follow how much people use each feature. */
export function Bento({ inviteJobs, samples }: { inviteJobs: number; samples: { name: string; total: number }[] }) {
  return (
    <section aria-labelledby="bento-h" className="mx-auto max-w-6xl px-4 py-28 sm:px-6 sm:py-36">
      <h2 id="bento-h" className="max-w-[16ch] font-display text-[clamp(2.2rem,5.5vw,4.5rem)] font-semibold leading-[1] tracking-[-0.035em]">
        Everything between you and the offer.
      </h2>
      <div className="mt-14 grid gap-4 md:grid-cols-6">
        <Tile className="md:col-span-4">
          <H>CV reviews for the job in front of you</H>
          <P>Not generic tips: what to move, cut and quantify for this posting. Free on 5 jobs.</P>
          <div className="mt-7 space-y-2 text-sm" aria-hidden>
            {["Lead with the placement year", "Quantify the churn model", "Cut the personal statement"].map((t, i) => (
              <div key={t} className="flex items-center gap-3 rounded-xl border border-haze bg-night/50 px-4 py-2.5" style={{ marginLeft: `${i * 1.25}rem` }}>
                <span className="h-1.5 w-1.5 rounded-full bg-sodium" />{t}
              </div>
            ))}
          </div>
        </Tile>
        <Tile className="md:col-span-2">
          <H>Free sponsor lookup</H>
          <P>Is a company on the official register? Check any employer, no account needed.</P>
          <dl className="mt-6 space-y-1.5 font-flap text-sm" aria-hidden>
            {samples.map((r) => (
              <div key={r.name} className="flex justify-between gap-3 rounded-lg bg-night/60 px-3 py-2"><dt className="truncate uppercase">{r.name}</dt><dd className="text-sodium">{r.total.toLocaleString("en-GB")}</dd></div>
            ))}
          </dl>
          <a href="#board" className="mt-6 inline-block text-moon underline decoration-haze underline-offset-4 hover:decoration-sodium">Search the registers</a>
        </Tile>
        <Tile className="md:col-span-2">
          <H>Interview plans</H>
          <P>A 7-day prep plan per job, including how to answer &quot;will you need sponsorship?&quot; with confidence.</P>
        </Tile>
        <Tile className="md:col-span-2">
          <H>What it&apos;s like to work there</H>
          <P>Culture, work-life balance and interviews, summarized from public sources with links.</P>
        </Tile>
        <Tile className="md:col-span-2 border-sodium/30 bg-sodium/[0.06]">
          <H>Bring friends, get jobs</H>
          <P>Each friend who joins and uploads a CV gives you {inviteJobs} more free matches.</P>
        </Tile>
        <Tile className="md:col-span-6 md:flex md:items-center md:justify-between md:gap-10">
          <div>
            <H>Daily picks on Telegram today. WhatsApp next.</H>
            <P>Your best new matches every morning, where you already talk. Connect Telegram from your account; for WhatsApp, leave your email and we&apos;ll tell you once when it&apos;s ready.</P>
          </div>
          <WaitlistForm />
        </Tile>
      </div>
    </section>
  );
}
