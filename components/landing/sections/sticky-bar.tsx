"use client";

import { useEffect, useState } from "react";
import { openMaya } from "../try-maya";

/** Apple's buy bar, for us: a quiet pill that offers Maya once the hero's own button is gone. */
export function StickyBar() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const end = document.getElementById("final-cta");
    let pastHero = false, atEnd = false;
    const sync = () => setShown(pastHero && !atEnd);
    const onScroll = () => { pastHero = window.scrollY > window.innerHeight * 0.85; sync(); };
    // Hide where the closing CTA already offers the same thing.
    const io = new IntersectionObserver(([e]) => { atEnd = e.isIntersecting; sync(); });
    if (end) io.observe(end);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); io.disconnect(); };
  }, []);
  return (
    <div className={`pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4 transition-all duration-500 ${shown ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}`} inert={!shown}>
      <div className="pointer-events-auto flex w-full max-w-xl items-center gap-4 rounded-full border border-haze bg-night-2/90 py-2 pl-5 pr-2 shadow-[0_20px_60px_-15px_rgb(0_0_0_/_0.6)] backdrop-blur-xl">
        <p className="min-w-0 flex-1 truncate text-sm"><span className="text-moon"><span className="sm:hidden">10 jobs free</span><span className="hidden sm:inline">10 sponsor-verified jobs, free.</span></span><span className="hidden text-mist sm:inline"> Try it without an account.</span></p>
        <button type="button" onClick={(e) => openMaya(e)} className="btn-light shrink-0 !px-5 !py-2 text-sm">Try Maya</button>
      </div>
    </div>
  );
}
