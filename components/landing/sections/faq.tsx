import { FAQ } from "@/lib/landing-content";

export function Faq() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  return (
    <section id="faq" aria-labelledby="faq-h" className="mx-auto max-w-4xl scroll-mt-16 px-4 py-28 sm:px-6 sm:py-36">
      <h2 id="faq-h" className="font-display text-[clamp(2.2rem,5.5vw,4.5rem)] font-semibold leading-[1] tracking-[-0.035em]">Questions, answered.</h2>
      <div className="mt-12 divide-y divide-haze border-y border-haze">
        {FAQ.map((f) => (
          <details key={f.q} className="faq group">
            <summary className="flex items-center justify-between gap-6 py-6 font-display text-lg font-semibold sm:text-xl">
              {f.q}
              <span aria-hidden className="relative h-4 w-4 shrink-0">
                <span className="absolute inset-x-0 top-1/2 h-px bg-mist" />
                <span className="absolute inset-y-0 left-1/2 w-px bg-mist transition-transform duration-300 group-open:scale-y-0" />
              </span>
            </summary>
            <p className="max-w-[44rem] pb-6 leading-relaxed text-mist">{f.a}</p>
          </details>
        ))}
      </div>
      {/* eslint-disable-next-line react/no-danger */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    </section>
  );
}
