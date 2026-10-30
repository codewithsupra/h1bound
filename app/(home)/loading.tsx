/**
 * Shown while the home page streams in (it loads the sponsor map). Scoped to the (home)
 * route group so other pages never see it. Pure CSS: it has to paint before any JS arrives.
 */
export default function Loading() {
  return (
    <div className="launch fixed inset-0 z-[60] grid place-items-center overflow-hidden bg-[radial-gradient(120%_80%_at_50%_100%,#1d2760_0%,#0d1330_60%)]" role="status" aria-live="polite">
      {/* Stars streak downward, so the rocket reads as climbing. */}
      <div aria-hidden className="absolute inset-0">
        {Array.from({ length: 28 }, (_, i) => (
          <span
            key={i}
            className="launch-star absolute w-px rounded-full bg-moon/70"
            style={{ left: `${(i * 37) % 100}%`, height: `${18 + ((i * 13) % 50)}px`, animationDelay: `${-((i * 0.17) % 1.2)}s`, animationDuration: `${0.7 + ((i * 7) % 6) / 10}s` }}
          />
        ))}
      </div>

      <div className="relative flex flex-col items-center">
        <svg viewBox="0 0 120 240" className="launch-rocket h-56 w-28 sm:h-64 sm:w-32" aria-hidden>
          <defs>
            <linearGradient id="hull" x1="0" x2="1">
              <stop offset="0" stopColor="#c9d0ee" />
              <stop offset="0.5" stopColor="#edf0fb" />
              <stop offset="1" stopColor="#98a1c8" />
            </linearGradient>
            <radialGradient id="flame" cx="0.5" cy="0" r="1">
              <stop offset="0" stopColor="#fff4d6" />
              <stop offset="0.35" stopColor="#ffb547" />
              <stop offset="1" stopColor="#ff8070" stopOpacity="0" />
            </radialGradient>
          </defs>
          {/* Exhaust */}
          <ellipse className="launch-flame" cx="60" cy="182" rx="15" ry="46" fill="url(#flame)" />
          <ellipse className="launch-flame launch-flame-2" cx="60" cy="176" rx="8" ry="26" fill="#fff4d6" opacity="0.9" />
          {/* Fins */}
          <path d="M38 118 L16 158 L38 150 Z" fill="#ffb547" />
          <path d="M82 118 L104 158 L82 150 Z" fill="#ffb547" />
          {/* Body + nose */}
          <path d="M60 12 C80 34 84 70 84 104 L84 150 L36 150 L36 104 C36 70 40 34 60 12 Z" fill="url(#hull)" />
          <path d="M60 12 C70 23 76 38 79 54 L41 54 C44 38 50 23 60 12 Z" fill="#ffb547" />
          {/* Window */}
          <circle cx="60" cy="86" r="12" fill="#141b40" stroke="#ffb547" strokeWidth="3" />
          <circle cx="56" cy="82" r="3.5" fill="#8fb0ff" opacity="0.8" />
          <rect x="44" y="150" width="32" height="10" rx="3" fill="#1c2550" />
        </svg>
        <div aria-hidden className="launch-smoke -mt-6 flex gap-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="h-6 w-6 rounded-full bg-mist/25 blur-[2px]" style={{ animationDelay: `${i * 0.12}s` }} />
          ))}
        </div>
        <p className="mt-8 font-display text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">
          Taking you back<span className="launch-dots" aria-hidden><span>.</span><span>.</span><span>.</span></span>
        </p>
        <p className="mt-2 text-sm text-mist">Lighting up the sponsor map</p>
      </div>
    </div>
  );
}
