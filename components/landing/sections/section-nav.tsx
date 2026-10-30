"use client";
import { SITE_NAME } from "@/lib/site";

import Link from "next/link";
import { useEffect, useState } from "react";
import { openMaya } from "../try-maya";

const LINKS = [
  { id: "how", label: "How it works" },
  { id: "record", label: "The record" },
  { id: "rights", label: "Visa check" },
  { id: "why", label: "Why us" },
  { id: "pricing", label: "Pricing" },
  { id: "faq", label: "FAQ" },
];

/** Local nav that takes over from the site header once you scroll past the hero. */
export function SectionNav() {
  const [shown, setShown] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > window.innerHeight * 0.85);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    // A section is "active" while it crosses a thin band just under the nav.
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: "-20% 0px -75% 0px" },
    );
    LINKS.forEach((l) => { const el = document.getElementById(l.id); if (el) io.observe(el); });
    return () => { window.removeEventListener("scroll", onScroll); io.disconnect(); };
  }, []);

  return (
    <nav
      aria-label="Page sections"
      className={`fixed inset-x-0 top-0 z-40 border-b border-haze bg-night/85 backdrop-blur-xl transition-transform duration-500 ${shown ? "translate-y-0" : "-translate-y-full"}`}
      inert={!shown}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="py-3.5 font-display text-lg font-bold tracking-tight">{SITE_NAME}<span className="text-sodium">.</span></Link>
        <ul className="ml-auto hidden items-center gap-1 text-sm lg:flex">
          {LINKS.map((l) => (
            <li key={l.id}>
              <a
                href={`#${l.id}`}
                aria-current={active === l.id ? "true" : undefined}
                className={`relative block px-3 py-4 transition-colors ${active === l.id ? "text-moon" : "text-mist hover:text-moon"}`}
              >
                {l.label}
                <span className={`absolute inset-x-3 bottom-0 h-px bg-sodium transition-opacity ${active === l.id ? "opacity-100" : "opacity-0"}`} />
              </a>
            </li>
          ))}
        </ul>
        <span className="ml-auto text-sm text-mist lg:hidden">{LINKS.find((l) => l.id === active)?.label}</span>
        <button type="button" onClick={(e) => openMaya(e)} className="btn-light !px-4 !py-1.5 text-sm">Try Maya</button>
      </div>
    </nav>
  );
}
