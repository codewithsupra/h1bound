/** The OPT clock as a ring: how much of the unemployment allowance is left. */
export function OptChip({ left, allowance, deadline }: { left: number; allowance: number; deadline: string | null }) {
  const pct = allowance ? left / allowance : 0;
  const tone = left <= 15 ? "text-red" : left <= 30 ? "text-sodium" : "text-green";
  return (
    <div className="rise flex items-center gap-4 rounded-2xl border border-haze bg-night-2/80 p-4">
      <svg viewBox="0 0 36 36" className={`h-14 w-14 shrink-0 -rotate-90 ${tone}`} aria-hidden>
        <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="3" />
        <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${pct * 97.4} 97.4`} />
      </svg>
      <div>
        <p className="font-display text-xl font-semibold tabular-nums">{left} <span className="text-base font-normal text-mist">of {allowance} days left</span></p>
        <p className="text-sm text-mist">{deadline ? `Unemployment limit reached on ${new Date(`${deadline}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })} if nothing changes.` : "Clock paused while you're employed."} Confirm with your DSO.</p>
      </div>
    </div>
  );
}
