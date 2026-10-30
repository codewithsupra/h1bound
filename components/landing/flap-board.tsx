"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

const CHARSET = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$.-&";

export type Tone = "moon" | "sodium" | "green" | "red" | "mist";

/** One split-flap field: cells flip through the charset until they land on the target. */
export function FlapText({ text, width, tone = "moon", delay = 0 }: { text: string; width: number; tone?: Tone; delay?: number }) {
  const target = useMemo(() => text.toUpperCase().replace(/[^A-Z0-9$.\-& ]/g, " ").slice(0, width).padEnd(width, " "), [text, width]);
  const [shown, setShown] = useState(target);
  const reduce = useRef(false);

  useEffect(() => {
    reduce.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    if (reduce.current) {
      const id = setTimeout(() => setShown(target), 0);
      return () => clearTimeout(id);
    }
    // Normalize to the current width first: a width change (desktop → phone) must not leave stale cells.
    const from = shown.padEnd(width, " ").slice(0, width);
    const remaining = target.split("").map((c, i) => (c === from[i] ? 0 : 3 + Math.floor(Math.random() * 6) + Math.floor(i / 3)));
    let current = from.split("");
    let timer: ReturnType<typeof setInterval> | undefined;
    const startId = setTimeout(() => {
      timer = setInterval(() => {
        let busy = false;
        current = current.map((c, i) => {
          if (remaining[i] > 1) { remaining[i]--; busy = true; return CHARSET[Math.floor(Math.random() * CHARSET.length)]; }
          if (remaining[i] === 1) { remaining[i] = 0; return target[i]; }
          return c;
        });
        setShown(current.join(""));
        if (!busy) clearInterval(timer);
      }, 55);
    }, delay);
    return () => { clearTimeout(startId); if (timer) clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, delay, width]);

  return (
    <span className="inline-flex" aria-hidden>
      {shown.padEnd(width, " ").slice(0, width).split("").map((c, i) => (
        <span key={`${i}-${c}`} className="flap flap-tick" data-tone={tone}>{c === " " ? " " : c}</span>
      ))}
    </span>
  );
}

/** One register entry on the board: `licence` is the flap text ("A-RATED", "RECOGNISED", "92 PERMITS"). */
export type BoardRow = { name: string; href: string | null; country: "GB" | "NL" | "IE"; jobs: number; licence: string; tone: Tone };

const WHERE: Record<BoardRow["country"], string> = { GB: "UK", NL: "NL", IE: "IE" };
const COUNTRIES = [["", "UK, NL and Ireland"], ["GB", "UK"], ["NL", "Netherlands"], ["IE", "Ireland"]] as const;

export function FlapBoard({ idle, pick }: { idle: BoardRow[]; pick: { name: string; at: number } | null }) {
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("");
  const [results, setResults] = useState<BoardRow[] | null>(null);
  const [offset, setOffset] = useState(0);
  const [narrow, setNarrow] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // A click on a city light lands here.
  useEffect(() => {
    if (!pick) return;
    const id = setTimeout(() => setQ(pick.name), 0);
    return () => clearTimeout(id);
  }, [pick]);

  // Idle: the board keeps announcing real sponsors, like an airport at night.
  useEffect(() => {
    if (results || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setOffset((o) => (o + 1) % Math.max(1, idle.length)), 4200);
    return () => clearInterval(id);
  }, [results, idle.length]);

  useEffect(() => {
    if (q.trim().length < 2) {
      const id = setTimeout(() => setResults(null), 0);
      return () => clearTimeout(id);
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/sponsors/search?market=eu&q=${encodeURIComponent(q)}${country ? `&country=${country}` : ""}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((b: { results: BoardRow[] }) => setResults(b.results))
        .catch(() => {});
    }, 280);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q, country]);

  const pool = country ? idle.filter((r) => r.country === country) : idle;
  const rows: (BoardRow | null)[] = results
    ? [...results, ...Array(Math.max(0, 5 - results.length)).fill(null)].slice(0, 5)
    : Array.from({ length: 5 }, (_, i) => pool[(offset + i) % Math.max(1, pool.length)] ?? null);

  const nameW = narrow ? 10 : 22;
  const licW = 8;
  const empty = results !== null && results.length === 0;

  return (
    <div className="glass rounded-3xl p-4 sm:p-7">
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="sr-only" htmlFor="board-q">Company</label>
        <input
          id="board-q"
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a company: Monzo, Booking.com, Stripe…"
          className="h-12 min-w-0 rounded-full border border-haze bg-night/60 px-5 sm:flex-1 text-moon outline-none placeholder:text-mist/70 focus:border-sodium/60"
        />
        <label className="sr-only" htmlFor="board-country">Country</label>
        <select id="board-country" value={country} onChange={(e) => setCountry(e.target.value)} className="h-12 rounded-full border border-haze bg-night/60 px-4 text-moon outline-none focus:border-sodium/60">
          {COUNTRIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl bg-[#0a0f28] p-3 text-[11px] shadow-[inset_0_2px_20px_rgb(0_0_0_/_0.5)] [--cw:1em] sm:p-5 sm:text-[15px] sm:[--cw:1.15em] lg:text-[17px]" role="table" aria-label="Licensed visa sponsors">
        <div className="mb-2 flex gap-3 text-mist sm:gap-5" role="row">
          {/* Header cells span exactly as many flaps as the column below them. */}
          <span className="shrink-0" style={{ width: `calc(${nameW} * (var(--cw) + 2px))` }} role="columnheader"><span className="text-[10px] sm:text-xs">Company</span></span>
          <span className="shrink-0" style={{ width: "calc(2 * (var(--cw) + 2px))" }} role="columnheader"><span className="text-[10px] sm:text-xs">In</span></span>
          {!narrow && <span className="shrink-0" style={{ width: "calc(4 * (var(--cw) + 2px))" }} role="columnheader"><span className="text-[10px] sm:text-xs">Jobs</span></span>}
          <span role="columnheader"><span className="text-[10px] sm:text-xs">Register</span></span>
        </div>
        <div className="space-y-1.5">
          {rows.map((r, i) => {
            const cells = (
              <>
                <span className="sr-only" role="cell">{r ? `${r.name}, ${WHERE[r.country]}: ${r.licence.toLowerCase()}, ${r.jobs} open jobs` : ""}</span>
                <FlapText text={r?.name ?? ""} width={nameW} delay={i * 90} />
                <FlapText text={r ? WHERE[r.country] : ""} width={2} tone="sodium" delay={i * 90 + 120} />
                {!narrow && <FlapText text={r ? (r.jobs ? String(r.jobs) : "--") : ""} width={4} delay={i * 90 + 160} />}
                <FlapText text={r?.licence ?? ""} width={licW} tone={r?.tone ?? "moon"} delay={i * 90 + 240} />
              </>
            );
            // Each company row opens its full sponsor page.
            return r?.href ? (
              <Link key={i} href={r.href} role="row" aria-label={`${r.name} sponsor details`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 transition-colors hover:bg-moon/[0.04] sm:gap-5">
                {cells}
              </Link>
            ) : (
              <div key={i} className="flex items-center gap-3 sm:gap-5" role="row">{cells}</div>
            );
          })}
        </div>
      </div>
      <p className="mt-4 min-h-[1.5em] text-sm text-mist">
        {empty
          ? "Not on the UK, Dutch or Irish registers under that name. Try the legal name (e.g. with Ltd or B.V.); if it's not listed, they can't sponsor in the UK or NL."
          : results
            ? "From the UK Home Office sponsor register, the Dutch IND register of recognised sponsors and Irish work-permit statistics. A licence means they can sponsor, not that every role will."
            : "Live from the official registers. Type any company, click a light on the map, or open a row for the full record."}
      </p>
    </div>
  );
}
