"use client";

import { useEffect, useRef, useState } from "react";
import { EU_BOUNDS as BOUNDS, EU_LABELS as MAP_LABELS, OUTLINES } from "@/lib/eu-geo";

/** One sponsor: name, coordinates, weight (sets the glow size) and the tooltip's evidence line. */
export type Light = { n: string; lon: number; lat: number; w: number; tag: string };

type Placed = { name: string; tag: string; u: number; v: number; size: number; appear: number; phase: number; speed: number };

// Equirectangular with a cos(latitude) squeeze, so Britain isn't stretched sideways.
const MID_LAT = ((BOUNDS.north + BOUNDS.south) / 2) * (Math.PI / 180);
const ASPECT = ((BOUNDS.east - BOUNDS.west) * Math.cos(MID_LAT)) / (BOUNDS.north - BOUNDS.south);

/** Small deterministic PRNG so every visitor sees the same sky. */
function seeded(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), h | 1);
    h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
    return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
  };
}

function place(lights: Light[]): Placed[] {
  const out: Placed[] = [];
  // Bigger cities sprawl further, so London reads as a metro and small towns stay tight.
  const perCity = new Map<string, number>();
  for (const l of lights) perCity.set(`${l.lon},${l.lat}`, (perCity.get(`${l.lon},${l.lat}`) ?? 0) + 1);
  for (const l of lights) {
    const r = seeded(l.n);
    const g = () => Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r());
    const spread = 0.03 + 0.028 * Math.log2(perCity.get(`${l.lon},${l.lat}`) ?? 1);
    const lon = l.lon + (g() * spread) / Math.cos(MID_LAT);
    const lat = l.lat + g() * spread * 0.7;
    const u = (lon - BOUNDS.west) / (BOUNDS.east - BOUNDS.west);
    const v = (BOUNDS.north - lat) / (BOUNDS.north - BOUNDS.south);
    out.push({
      name: l.n, tag: l.tag, u, v,
      size: 0.5 + Math.log10(l.w + 1) * 0.8,
      appear: 250 + v * 1900 + r() * 450,
      phase: r() * Math.PI * 2,
      speed: 0.5 + r() * 1.3,
    });
  }
  return out;
}

function glowSprite(color: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,246,225,1)");
  grad.addColorStop(0.12, color);
  grad.addColorStop(0.35, "rgba(255,170,60,0.28)");
  grad.addColorStop(1, "rgba(255,150,40,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

export function NightMap({ lights, onPick }: { lights: Light[]; onPick?: (name: string) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number; name: string; tag: string } | null>(null);
  const pickRef = useRef(onPick);
  useEffect(() => {
    pickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    const el = canvas.current!;
    const box = wrap.current!;
    const ctx = el.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const placed = place(lights);
    const sprite = glowSprite("rgba(255,190,90,0.95)");
    const sx = new Float32Array(placed.length);
    const sy = new Float32Array(placed.length);
    let w = 0, h = 0, dpr = 1, raf = 0, visible = true, start = performance.now();
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    let hovered = -1;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = box.clientWidth;
      h = box.clientHeight;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      if (reduce) draw(performance.now());
    }

    function project(u: number, v: number, t: number) {
      // Map plane, tilted away from the viewer like a window seat on descent.
      const aspect = ASPECT;
      const wide = w >= 900;
      const mapW = wide ? Math.min(w * 0.5, h * 1.15 * aspect) : Math.min(w * 0.95, h * 0.62 * aspect);
      const mapH = mapW / aspect;
      const mx = (u - 0.5) * mapW;
      const my = (v - 0.5) * mapH;
      const bank = reduce ? 0 : Math.sin(t / 9000) * 0.03;
      const tilt = 0.82 + mouse.y * 0.06 + bank;
      const yaw = mouse.x * 0.07 + (reduce ? 0 : Math.sin(t / 13000) * 0.025);
      const xr = mx * Math.cos(yaw) - my * Math.sin(yaw) * 0.35;
      const Y = my * Math.cos(tilt);
      const Z = my * Math.sin(tilt);
      const f = 900;
      const s = f / (f + Z);
      // Wide: the islands and the Netherlands sit right of the copy. Narrow: the sky fills the top, copy below.
      return [(wide ? w * 0.73 : w / 2) + xr * s, (wide ? h * 0.43 : Math.min(h * 0.22, 170)) + Y * s, s] as const;
    }

    function draw(now: number) {
      const t = now - start;
      mouse.x += (mouse.tx - mouse.x) * 0.05;
      mouse.y += (mouse.ty - mouse.y) * 0.05;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      // Faint dotted coastlines fade in first, so the lights land on recognisable land.
      const coast = reduce ? 0.38 : Math.min(0.38, (t / 2200) * 0.38);
      ctx.globalAlpha = coast;
      ctx.strokeStyle = "#98a1c8";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      for (const shape of OUTLINES) {
        ctx.beginPath();
        shape.forEach(([lon, lat], k) => {
          const [x, y] = project((lon - BOUNDS.west) / (BOUNDS.east - BOUNDS.west), (BOUNDS.north - lat) / (BOUNDS.north - BOUNDS.south), t);
          if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        });
        ctx.closePath();
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < placed.length; i++) {
        const p = placed[i];
        const [x, y, s] = project(p.u, p.v, t);
        sx[i] = x;
        sy[i] = y;
        const life = reduce ? 1 : Math.min(1, Math.max(0, (t - p.appear) / 700));
        if (life <= 0) continue;
        const tw = reduce ? 0.9 : 0.72 + 0.28 * Math.sin(t * 0.001 * p.speed + p.phase);
        const r = p.size * s * (i === hovered ? 2.4 : 1) * 2.2;
        ctx.globalAlpha = life * tw * (i === hovered ? 1 : 0.55);
        ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
        // A crisp core so every company reads as its own light, even in dense metros.
        ctx.globalAlpha = life * Math.min(1, tw + 0.2);
        ctx.fillStyle = i === hovered ? "#ffffff" : "#ffe2b0";
        const c = Math.max(0.6, p.size * s * 0.42);
        ctx.fillRect(x - c / 2, y - c / 2, c, c);
      }
      ctx.globalCompositeOperation = "source-over";
      // City names fade in after the sweep reaches them.
      ctx.font = `500 11px var(--font-body), system-ui, sans-serif`;
      ctx.textAlign = "center";
      for (const [label, lon, lat] of MAP_LABELS) {
        const u = (lon - BOUNDS.west) / (BOUNDS.east - BOUNDS.west);
        const v = (BOUNDS.north - lat) / (BOUNDS.north - BOUNDS.south);
        const a = reduce ? 0.5 : Math.min(0.5, Math.max(0, (t - (900 + v * 1900)) / 1600));
        if (a <= 0) continue;
        const [x, y] = project(u, v, t);
        ctx.globalAlpha = a;
        ctx.fillStyle = "#98a1c8";
        ctx.fillText(label, x, y + 22);
      }
      ctx.globalAlpha = 1;
    }

    function loop(now: number) {
      if (visible) draw(now);
      raf = requestAnimationFrame(loop);
    }

    function nearest(px: number, py: number) {
      let best = -1, bd = 18 * 18;
      for (let i = 0; i < placed.length; i++) {
        const dx = sx[i] - px, dy = sy[i] - py, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    }

    function onMove(e: PointerEvent) {
      const rect = box.getBoundingClientRect();
      const px = e.clientX - rect.left, py = e.clientY - rect.top;
      mouse.tx = (px / rect.width - 0.5) * 2;
      mouse.ty = (py / rect.height - 0.5) * 2;
      hovered = nearest(px, py);
      setHover(hovered >= 0 ? { x: sx[hovered], y: sy[hovered], name: placed[hovered].name, tag: placed[hovered].tag } : null);
      el.style.cursor = hovered >= 0 ? "pointer" : "default";
      if (reduce) draw(performance.now());
    }
    function onLeave() {
      mouse.tx = mouse.ty = 0;
      hovered = -1;
      setHover(null);
    }
    function onClick() {
      if (hovered >= 0) pickRef.current?.(placed[hovered].name);
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(box);
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(box);
    box.addEventListener("pointermove", onMove);
    box.addEventListener("pointerdown", onMove); // touch: a tap picks the nearest light
    box.addEventListener("pointerleave", onLeave);
    box.addEventListener("click", onClick);
    if (!reduce) raf = requestAnimationFrame(loop);
    else start = performance.now() - 10_000;

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      box.removeEventListener("pointermove", onMove);
      box.removeEventListener("pointerdown", onMove);
      box.removeEventListener("pointerleave", onLeave);
      box.removeEventListener("click", onClick);
    };
  }, [lights]);

  return (
    <div ref={wrap} className="absolute inset-0" aria-hidden="true">
      <canvas ref={canvas} className="block h-full w-full" />
      {hover && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+14px)] whitespace-nowrap rounded-lg border border-haze bg-night-2/90 px-3 py-2 text-sm shadow-xl backdrop-blur"
          style={{ left: hover.x, top: hover.y }}
        >
          <span className="font-display font-semibold">{hover.name}</span>
          <span className="ml-2 text-sodium">{hover.tag}</span>
        </div>
      )}
    </div>
  );
}
