import type { SponsorBadge } from "@/lib/sponsor";

/** Sponsorship signal drawn as a visa entry stamp. `detail` carries the numbers and the source. */
export function Stamp({ badge, animate = false }: { badge: SponsorBadge; animate?: boolean }) {
  const sub = badge.detail.split(". Source:")[0].split(" · ")[0];
  return (
    <span className={`stamp ${animate ? "stamp-in" : ""}`} data-level={badge.level} title={badge.detail}>
      <span className="stamp-title">{badge.label}</span>
      <span className="stamp-sub">{sub}</span>
    </span>
  );
}
