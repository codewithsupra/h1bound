/** A static row of split-flap cells for table cells: the departures-board look without the animation. */
export function MiniFlap({ text, tone = "moon", title }: { text: string; tone?: "moon" | "sodium" | "green" | "red" | "mist"; title?: string }) {
  return (
    <span className="inline-flex text-[11px] leading-none" title={title} aria-label={title ? `${text}: ${title}` : text}>
      {text.split("").map((c, i) => <span key={i} aria-hidden className="flap !h-[1.7em] !w-[1.05em]" data-tone={tone}>{c === " " ? " " : c}</span>)}
    </span>
  );
}
