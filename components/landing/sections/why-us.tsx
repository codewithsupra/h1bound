import { COMPARISON, type Cell } from "@/lib/landing-content";

function Mark({ v, strong = false }: { v: Cell; strong?: boolean }) {
  if (v === true) {
    return (
      <svg viewBox="0 0 20 20" className={`mx-auto h-5 w-5 ${strong ? "text-sodium" : "text-moon/70"}`} fill="currentColor" role="img" aria-label="Yes">
        <path d="M8.2 13.6 4.6 10l-1.2 1.2 4.8 4.8L17 7.2 15.8 6z" />
      </svg>
    );
  }
  if (v === false) return <span className="mx-auto block h-px w-4 bg-mist/40" role="img" aria-label="No" />;
  return <span className={`block break-words text-center text-xs sm:text-sm ${strong ? "font-medium text-sodium" : "text-mist"}`}>{v}</span>;
}

export function WhyUs() {
  return (
    <section id="why" aria-labelledby="why-h" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-28 sm:px-6 sm:py-36">
      <h2 id="why-h" className="max-w-[16ch] font-display text-[clamp(2.2rem,5.5vw,4.5rem)] font-semibold leading-[1] tracking-[-0.035em]">
        Made for the search where the visa decides.
      </h2>
      <p className="mt-6 max-w-[38rem] text-lg leading-relaxed text-mist">
        Job boards were built for people who can work anywhere. General AI job agents send more applications. You need the few employers that will actually file for you, before your clock runs out.
      </p>
      <div className="mt-14 overflow-hidden rounded-[2rem] border border-haze">
        <table className="w-full table-fixed border-collapse text-left">
          <caption className="sr-only">H1Bound compared with job boards and general AI job agents</caption>
          <thead>
            <tr className="border-b border-haze text-xs sm:text-sm">
              <th scope="col" className="w-[38%] p-3 font-normal text-mist sm:w-[46%] sm:p-6"><span className="sr-only">Feature</span></th>
              <th scope="col" className="bg-sodium/[0.07] px-1 py-3 text-center font-display font-semibold sm:p-6">H1Bound</th>
              <th scope="col" className="px-1 py-3 text-center font-normal text-mist sm:p-6">Job boards</th>
              <th scope="col" className="px-1 py-3 text-center font-normal text-mist sm:p-6">AI agents</th>
            </tr>
          </thead>
          <tbody>
            {COMPARISON.map((r) => (
              <tr key={r.label} className="border-b border-haze last:border-0">
                <th scope="row" className="p-3 text-[13px] font-normal leading-snug sm:p-6 sm:text-base">{r.label}</th>
                <td className="bg-sodium/[0.07] px-1 py-3 sm:p-6"><Mark v={r.us} strong /></td>
                <td className="px-1 py-3 sm:p-6"><Mark v={r.boards} /></td>
                <td className="px-1 py-3 sm:p-6"><Mark v={r.agents} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
