const FACTS = [
  { t: "Encrypted, not stored raw", d: "Your resume is read once and kept as an encrypted profile. The file itself is never saved.", icon: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z" },
  { t: "Nothing sent without you", d: "Maya drafts; you send from your own inbox. No messages in your name, ever.", icon: "M4 6h16v12H4zM4 7l8 6 8-6" },
  { t: "Delete everything, one step", d: "Your profile, chat and matches are erased from your account page. No email to support needed.", icon: "M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" },
];

export function Privacy() {
  return (
    <section aria-labelledby="privacy-h" className="border-y border-haze bg-[#0a0f28]">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 id="privacy-h" className="font-display text-[clamp(1.8rem,3.6vw,2.8rem)] font-semibold tracking-[-0.025em]">Your data stays yours.</h2>
        <ul className="mt-10 grid gap-10 md:grid-cols-3">
          {FACTS.map((f) => (
            <li key={f.t}>
              <svg viewBox="0 0 24 24" className="h-7 w-7 text-sodium" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" aria-hidden><path d={f.icon} /></svg>
              <h3 className="mt-4 font-display text-lg font-semibold">{f.t}</h3>
              <p className="mt-1.5 leading-relaxed text-mist">{f.d}</p>
            </li>
          ))}
        </ul>
        <p className="mt-10 text-sm text-mist">We never scrape LinkedIn or Indeed. Jobs come from employers&apos; own public career boards.</p>
      </div>
    </section>
  );
}
