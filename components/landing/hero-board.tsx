"use client";

import { useState } from "react";
import { FlapBoard, type BoardRow } from "./flap-board";
import { NightMap, type Light } from "./night-map";

/** Map + board share state: clicking a light sends that company to the departure board. */
export function HeroAndBoard({ lights, idle, children }: { lights: Light[]; idle: BoardRow[]; children: React.ReactNode }) {
  const [pick, setPick] = useState<{ name: string; at: number } | null>(null);
  return (
    <>
      <section className="relative isolate min-h-[100svh] overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(120%_80%_at_50%_100%,#1d2760_0%,#0d1330_55%)]" />
        <NightMap
          lights={lights}
          onPick={(name) => {
            setPick({ name, at: Date.now() });
            document.getElementById("board")?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
        />
        <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-[50%] bg-gradient-to-r from-night/70 via-night/30 to-transparent lg:block" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-b from-transparent via-night/60 to-night lg:h-48 lg:via-transparent" />
        {children}
      </section>
      <section id="board" className="relative mx-auto max-w-5xl scroll-mt-24 px-4 pb-28 sm:px-6">
        <h2 className="font-display text-[clamp(1.9rem,4vw,3rem)] font-semibold tracking-[-0.02em]">Does this company sponsor?</h2>
        <p className="mt-3 max-w-[40rem] text-lg text-mist">
          In the UK and the Netherlands, only employers on the government&apos;s register can sponsor a work visa. Ireland publishes every permit it grants. Check any company before you apply.
        </p>
        <div className="mt-8">
          <FlapBoard idle={idle} pick={pick} />
        </div>
      </section>
    </>
  );
}
