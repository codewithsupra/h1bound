"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

const CHARSET = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$.-&";

type Tone = "moon" | "sodium" | "green" | "red" | "mist";

/** One split-flap field: cells flip through the charset until they land on the target. */
function FlapText({ text, width, tone = "moon", delay = 0 }: { text: string; width: number; tone?: Tone; delay?: number }) {
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

export type BoardRow = { name: string; slug: string | null; total: number; roleCount: number; median: number | null; level: string };

const STATUS: Record<string, { text: string; tone: Tone }> = {
  strong: { text: "OFTEN", tone: "green" },
  some: { text: "SOME", tone: "sodium" },
  rare: { text: "RARE", tone: "mist" },
  unknown: { text: "NO DATA", tone: "mist" },
  none: { text: "NONE", tone: "red" },
};

const ROLES = ["Software engineer", "Data scientist", "Data analyst", "ML engineer", "Product manager", "Hardware engineer"];

type ApiResult = { name: string; slug: string | null; total: number; roleCount: number; roleMedian: number | null; badge: { level: string } };

const k = (n: number | null) => (n ? `$${Math.round(n / 1000)}K` : "--");

export function FlapBoard({ idle, pick }: { idle: BoardRow[]; pick: { name: string; at: number } | null }) {
  const [q, setQ] = useState("");
  const [role, setRole] = useState(ROLES[0]);
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
      fetch(`/api/sponsors/search?q=${encodeURIComponent(q)}&role=${encodeURIComponent(role)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((b: { results: ApiResult[] }) =>
          setResults(b.results.map((r) => ({ name: r.name, slug: r.slug, total: r.total, roleCount: r.roleCount, median: r.roleMedian, level: r.badge.level }))),
        )
        .catch(() => {});
    }, 280);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q, role]);

  const rows: (BoardRow | null)[] = results
    ? [...results, ...Array(Math.max(0, 5 - results.length)).fill(null)].slice(0, 5)
    : Array.from({ length: 5 }, (_, i) => idle[(offset + i) % Math.max(1, idle.length)] ?? null);

  const nameW = narrow ? 9 : 16;
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
          placeholder="Search a company: Stripe, Databricks, Tesla…"
          className="h-12 min-w-0 rounded-full border border-haze bg-night/60 px-5 sm:flex-1 text-moon outline-none placeholder:text-mist/70 focus:border-sodium/60"
        />
        <label className="sr-only" htmlFor="board-role">Role</label>
        <select id="board-role" value={role} onChange={(e) => setRole(e.target.value)} className="h-12 rounded-full border border-haze bg-night/60 px-4 text-moon outline-none focus:border-sodium/60">
          {ROLES.map((r) => <option key={r}>{r}</option>)}
        </select>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl bg-[#0a0f28] p-3 text-[11px] shadow-[inset_0_2px_20px_rgb(0_0_0_/_0.5)] [--cw:1em] sm:p-5 sm:text-[15px] sm:[--cw:1.15em] lg:text-[17px]" role="table" aria-label="H-1B sponsors">
        <div className="mb-2 flex gap-3 text-mist sm:gap-5" role="row">
          {/* Header cells span exactly as many flaps as the column below them. */}
          <span className="shrink-0" style={{ width: `calc(${nameW} * (var(--cw) + 2px))` }} role="columnheader"><span className="text-[10px] sm:text-xs">Company</span></span>
          <span className="shrink-0" style={{ width: "calc(5 * (var(--cw) + 2px))" }} role="columnheader"><span className="text-[10px] sm:text-xs">{narrow ? "H-1Bs" : "H-1Bs FY26"}</span></span>
          {!narrow && <span className="shrink-0" style={{ width: "calc(5 * (var(--cw) + 2px))" }} role="columnheader"><span className="text-[10px] sm:text-xs">Your role</span></span>}
          {!narrow && <span className="shrink-0" style={{ width: "calc(5 * (var(--cw) + 2px))" }} role="columnheader"><span className="text-[10px] sm:text-xs">Median</span></span>}
          <span role="columnheader"><span className="text-[10px] sm:text-xs">Sponsors?</span></span>
        </div>
        <div className="space-y-1.5">
          {rows.map((r, i) => {
            const st = r ? STATUS[r.level] ?? STATUS.unknown : null;
            const cells = (
              <>
                <span className="sr-only" role="cell">{r ? `${r.name}: ${r.total} filings, ${st?.text}` : ""}</span>
                <FlapText text={r?.name ?? ""} width={nameW} delay={i * 90} />
                <FlapText text={r ? String(r.total) : ""} width={5} tone="sodium" delay={i * 90 + 120} />
                {!narrow && <FlapText text={r ? String(r.roleCount || "--") : ""} width={5} delay={i * 90 + 160} />}
                {!narrow && <FlapText text={r ? k(r.median) : ""} width={5} tone="mist" delay={i * 90 + 200} />}
                <FlapText text={st?.text ?? ""} width={narrow ? 5 : 7} tone={st?.tone ?? "moon"} delay={i * 90 + 240} />
              </>
            );
            // Each company row opens its full sponsor page.
            return r?.slug ? (
              <Link key={i} href={`/sponsors/${r.slug}`} role="row" aria-label={`${r.name} sponsor details`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 transition-colors hover:bg-moon/[0.04] sm:gap-5">
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
          ? "No FY2026 H-1B labor filings under that name. They may not sponsor, or file under a different legal name."
          : results
            ? "Counts are certified H-1B labor filings with the US Dept. of Labor, FY2026. A filing isn't a visa guarantee."
            : "Live from FY2026 Dept. of Labor filings. Type any company, click a light on the map, or open a row for the full record."}
      </p>
    </div>
  );
}
