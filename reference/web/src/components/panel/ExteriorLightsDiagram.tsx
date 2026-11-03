import { useState } from "react";
import type { LightStatus } from "@/lib/sim/lights";
import { cn } from "@/lib/utils";

/**
 * Exterior lighting diagrams for the Lights trainer (aerial, side, front, rear).
 *
 * Light names and locations follow the 737 AMM Chapter 33 (33-40-0 Figure 1 and
 * the 33-41 / 33-42 / 33-43 / 33-45 / 33-49 / 33-5x descriptions).
 *
 * Base art: public/lights/ext-{view}.webp (1168 px wide, labels removed).
 * Marker x / y are in that image's pixel space; dx / dy place the number next
 * to the marker. Every marker is bound to one sim light id, so it lights up,
 * flashes (strobe / beacon), dims or goes dark with the trainer state.
 *
 * Left / right per view:
 *   aerial  viewer left  = aircraft LEFT
 *   side    near side    = aircraft LEFT (nose to the left of the screen)
 *   front   viewer left  = aircraft RIGHT
 *   rear    viewer left  = aircraft LEFT
 */

const COLORS = { white: "#f6f1df", red: "#ff4d4d", green: "#35e08c", amber: "#ffb340" } as const;

type ViewKey = "aerial" | "side" | "front" | "rear";

interface Mk {
  n: number;
  id: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  /** Underside / hidden from this view: drawn with a dashed ring. */
  hidden?: boolean;
}

/** Number -> name and note, as written in the manual. */
const NAMES: Record<number, { name: string; note: string }> = {
  1: { name: "Upper anti-collision (beacon) light", note: "red, flashing" },
  2: { name: "Lower anti-collision (beacon) light", note: "red, flashing" },
  3: { name: "Wing tip position light, red", note: "left wing" },
  4: { name: "Wing tip position light, green", note: "right wing" },
  5: { name: "Wing tip strobe light", note: "white, L & R" },
  6: { name: "Wing tip tail light", note: "white, L & R, trailing edge" },
  7: { name: "Logo light", note: "L & R, if installed" },
  8: { name: "Tail strobe light", note: "white, tail cone" },
  9: { name: "Wing illumination light", note: "L & R, fuselage fwd of wing" },
  10: { name: "Runway turnoff light", note: "L & R, wing leading edge" },
  11: { name: "Inboard landing light", note: "L & R, wing leading edge" },
  12: { name: "Outboard landing light", note: "L & R, retractable, flap track" },
  13: { name: "Nose gear taxi light", note: "on nose gear strut" },
  14: { name: "Overwing emergency light", note: "L & R, over inboard wing" },
  15: { name: "Escape slide light", note: "L & R, fuselage by doors" },
};

const VIEWS: Record<ViewKey, { label: string; w: number; h: number; marks: Mk[] }> = {
  aerial: {
    label: "Top",
    w: 1168,
    h: 728,
    marks: [
      { n: 1, id: "beacon-top", x: 583, y: 339, dx: 14, dy: -12 },
      { n: 2, id: "beacon-bot", x: 583, y: 384, dx: 16, dy: 12, hidden: true },
      { n: 3, id: "pos-l", x: 253, y: 438, dx: -12, dy: 10 },
      { n: 4, id: "pos-r", x: 913, y: 438, dx: 12, dy: 10 },
      { n: 5, id: "strobe-l", x: 263, y: 429, dx: -12, dy: -8 },
      { n: 5, id: "strobe-r", x: 903, y: 429, dx: 12, dy: -8 },
      { n: 6, id: "pos-t", x: 284, y: 419, dx: 2, dy: -14 },
      { n: 6, id: "pos-t", x: 882, y: 419, dx: -2, dy: -14 },
      { n: 7, id: "logo", x: 274, y: 424, dx: -4, dy: -1 },
      { n: 8, id: "strobe-t", x: 583, y: 679, dx: 16, dy: 0 },
      { n: 9, id: "wing", x: 541, y: 242, dx: -14, dy: -4 },
      { n: 9, id: "wing", x: 625, y: 242, dx: 14, dy: -4 },
      { n: 10, id: "rwy-l", x: 527, y: 265, dx: -14, dy: -6 },
      { n: 10, id: "rwy-r", x: 639, y: 265, dx: 14, dy: -6 },
      { n: 11, id: "ldg-fix-l", x: 512, y: 275, dx: -15, dy: 6 },
      { n: 11, id: "ldg-fix-r", x: 654, y: 275, dx: 15, dy: 6 },
      { n: 12, id: "ldg-ret-l", x: 393, y: 402, dx: -14, dy: 8, hidden: true },
      { n: 12, id: "ldg-ret-r", x: 773, y: 402, dx: 14, dy: 8, hidden: true },
      { n: 14, id: "overwing-path-l", x: 520, y: 316, dx: -14, dy: 0 },
      { n: 14, id: "overwing-path-r", x: 646, y: 316, dx: 14, dy: 0 },
      { n: 15, id: "emer-exit", x: 544, y: 182, dx: -14, dy: 0 },
      { n: 15, id: "emer-exit", x: 622, y: 182, dx: 14, dy: 0 },
      { n: 15, id: "emer-exit", x: 546, y: 496, dx: -14, dy: 0 },
      { n: 15, id: "emer-exit", x: 620, y: 496, dx: 14, dy: 0 },
    ],
  },
  side: {
    label: "Side (L)",
    w: 1168,
    h: 562,
    marks: [
      { n: 1, id: "beacon-top", x: 600, y: 253, dx: 0, dy: -14 },
      { n: 2, id: "beacon-bot", x: 668, y: 373, dx: 14, dy: 10, hidden: true },
      { n: 3, id: "pos-l", x: 934, y: 515, dx: 14, dy: -6 },
      { n: 4, id: "pos-r", x: 203, y: 168, dx: -14, dy: -4 },
      { n: 5, id: "strobe-l", x: 925, y: 505, dx: -4, dy: -15 },
      { n: 5, id: "strobe-r", x: 214, y: 163, dx: 10, dy: -12 },
      { n: 6, id: "pos-t", x: 905, y: 513, dx: -6, dy: 14 },
      { n: 7, id: "logo", x: 893, y: 514, dx: -14, dy: 2 },
      { n: 8, id: "strobe-t", x: 943, y: 257, dx: 14, dy: 4 },
      { n: 9, id: "wing", x: 350, y: 372, dx: -14, dy: -4 },
      { n: 10, id: "rwy-l", x: 408, y: 384, dx: -14, dy: 8 },
      { n: 11, id: "ldg-fix-l", x: 428, y: 377, dx: -12, dy: -14 },
      { n: 12, id: "ldg-ret-l", x: 800, y: 453, dx: 14, dy: 8, hidden: true },
      { n: 13, id: "taxi", x: 140, y: 397, dx: -14, dy: 8, hidden: true },
      { n: 14, id: "overwing-path-l", x: 590, y: 395, dx: 0, dy: -14 },
      { n: 15, id: "emer-exit", x: 255, y: 357, dx: 14, dy: 12 },
      { n: 15, id: "emer-exit", x: 830, y: 321, dx: 14, dy: -8 },
    ],
  },
  front: {
    label: "Front",
    w: 1168,
    h: 447,
    marks: [
      { n: 1, id: "beacon-top", x: 583, y: 194, dx: 16, dy: -8 },
      { n: 2, id: "beacon-bot", x: 583, y: 389, dx: 16, dy: 10, hidden: true },
      { n: 4, id: "pos-r", x: 40, y: 283, dx: -14, dy: 6 },
      { n: 3, id: "pos-l", x: 1125, y: 284, dx: 14, dy: 6 },
      { n: 5, id: "strobe-r", x: 48, y: 273, dx: -12, dy: -12 },
      { n: 5, id: "strobe-l", x: 1117, y: 273, dx: 12, dy: -12 },
      { n: 9, id: "wing", x: 503, y: 313, dx: -14, dy: -8 },
      { n: 9, id: "wing", x: 664, y: 313, dx: 14, dy: -8 },
      { n: 10, id: "rwy-r", x: 492, y: 338, dx: -14, dy: 12 },
      { n: 10, id: "rwy-l", x: 674, y: 338, dx: 14, dy: 12 },
      { n: 11, id: "ldg-fix-r", x: 476, y: 331, dx: -16, dy: -4 },
      { n: 11, id: "ldg-fix-l", x: 690, y: 331, dx: 16, dy: -4 },
      { n: 12, id: "ldg-ret-r", x: 218, y: 317, dx: -17, dy: -14, hidden: true },
      { n: 12, id: "ldg-ret-l", x: 944, y: 317, dx: 17, dy: -14, hidden: true },
      { n: 13, id: "taxi", x: 583, y: 364, dx: -17, dy: -2, hidden: true },
    ],
  },
  rear: {
    label: "Rear",
    w: 1168,
    h: 605,
    marks: [
      { n: 1, id: "beacon-top", x: 583, y: 324, dx: 16, dy: -10 },
      { n: 8, id: "strobe-t", x: 583, y: 350, dx: 16, dy: 2 },
      { n: 2, id: "beacon-bot", x: 583, y: 526, dx: 0, dy: 18, hidden: true },
      { n: 6, id: "pos-t", x: 27, y: 431, dx: -4, dy: -14 },
      { n: 6, id: "pos-t", x: 1138, y: 431, dx: 4, dy: -14 },
      { n: 7, id: "logo", x: 38, y: 434, dx: 4, dy: 14 },
      { n: 7, id: "logo", x: 1127, y: 433, dx: -4, dy: 14 },
      { n: 15, id: "emer-exit", x: 505, y: 410, dx: -14, dy: 0 },
      { n: 15, id: "emer-exit", x: 659, y: 410, dx: 14, dy: 0 },
    ],
  },
};

const VIEW_ORDER: ViewKey[] = ["aerial", "side", "front", "rear"];
const K = 1.35; // label offset scale (the offsets were drawn for a full-size image)

/** Lens footprint (in image pixels) by light type, so each fixture looks like the real unit set flush in the skin. */
type Lens = { shape: "round" | "oval" | "rect" | "dome"; w: number; h: number };
function lensFor(id: string): Lens {
  if (id.startsWith("beacon")) return { shape: "dome", w: 9, h: 6 };
  if (id.startsWith("ldg") || id.startsWith("rwy") || id === "taxi") return { shape: "rect", w: 11, h: 6 };
  if (id === "wing" || id === "logo") return { shape: "oval", w: 8, h: 5 };
  if (id.startsWith("overwing") || id === "emer-exit") return { shape: "oval", w: 5, h: 8 };
  return { shape: "round", w: 5.5, h: 5.5 }; // position, strobe, tail
}

function Dot({ l, size = 11 }: { l?: Pick<LightStatus, "lit" | "level" | "color" | "flash">; size?: number }) {
  const c = l ? COLORS[l.color] : "#6b7681";
  return (
    <span
      className={cn("inline-block shrink-0 rounded-full border border-black/40", l?.lit && l.flash && "animate-pulse")}
      style={{ width: size, height: size, background: l?.lit ? c : "#23272c", opacity: l?.lit ? 0.4 + 0.6 * l.level : 1, boxShadow: l?.lit ? `0 0 ${4 + 10 * l.level}px ${c}` : "none" }}
    />
  );
}

export function ExteriorLightsDiagram({ lights }: { lights: LightStatus[] }) {
  const [view, setView] = useState<ViewKey>("aerial");
  const [zoom, setZoom] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const v = VIEWS[view];
  const g = (id: string) => lights.find((l) => l.id === id);

  // One legend row per light number used in this view.
  const nums = Array.from(new Set<number>(v.marks.map((m) => m.n))).sort((a: number, b: number) => a - b);
  const rowStatus = (n: number) => {
    const ms = v.marks.filter((m) => m.n === n);
    const ids = Array.from(new Set<string>(ms.map((m) => m.id)));
    const ls = ids.map(g).filter(Boolean) as LightStatus[];
    const lit = ls.filter((l) => l.lit).length;
    const reason = ls.find((l) => !l.lit && l.reason && l.commanded > 0.02)?.reason;
    return { ls, lit, reason };
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        <div className="grid flex-1 grid-cols-4 gap-1">
          {VIEW_ORDER.map((k) => (
            <button key={k} type="button" onClick={() => { setView(k); setSel(null); }} className={cn("rounded border px-1 py-1.5 font-display text-[8px] uppercase tracking-wide", view === k ? "border-accent/60 bg-accent/10 text-fg" : "border-border bg-inset text-subtle")}>{VIEWS[k].label}</button>
          ))}
        </div>
        <button type="button" onClick={() => setZoom((z) => !z)} className={cn("shrink-0 rounded border px-2 py-1.5 font-display text-[8px] uppercase tracking-wide", zoom ? "border-accent/60 bg-accent/10 text-fg" : "border-border bg-inset text-subtle")}>{zoom ? "Fit" : "Zoom"}</button>
      </div>

      <div className="overflow-x-auto rounded border border-border bg-[#0d1115]">
        <div className="relative" style={{ width: zoom ? "220%" : "100%" }}>
          <img src={`/lights/ext-${view}.webp`} alt={`737 exterior lighting, ${v.label} view`} className="block w-full select-none" style={{ filter: "invert(1)", mixBlendMode: "screen", opacity: 0.85 }} draggable={false} />
          <svg viewBox={`0 0 ${v.w} ${v.h}`} className="absolute inset-0 h-full w-full" role="img" aria-label="Exterior light positions">
            <defs>
              {(Object.keys(COLORS) as (keyof typeof COLORS)[]).map((k) => (
                <radialGradient key={k} id={`lt-glow-${k}`}>
                  <stop offset="0%" stopColor={COLORS[k]} stopOpacity="0.95" />
                  <stop offset="35%" stopColor={COLORS[k]} stopOpacity="0.45" />
                  <stop offset="100%" stopColor={COLORS[k]} stopOpacity="0" />
                </radialGradient>
              ))}
              <radialGradient id="lt-glass" cx="35%" cy="30%" r="80%">
                <stop offset="0%" stopColor="#4a545e" />
                <stop offset="100%" stopColor="#14181c" />
              </radialGradient>
            </defs>
            {v.marks.map((m, i) => {
              const l = g(m.id);
              if (!l) return null;
              const c = COLORS[l.color];
              const isSel = sel === m.n;
              const ln = lensFor(m.id);
              const rx = ln.w / 2;
              const ry = ln.h / 2;
              const lx = m.x + m.dx * K;
              const ly = m.y + m.dy * K;
              const len = Math.hypot(lx - m.x, ly - m.y) || 1;
              // leader starts at the lens edge, ends just short of the number badge
              const sx = m.x + ((lx - m.x) / len) * (Math.max(rx, ry) + 2);
              const sy = m.y + ((ly - m.y) / len) * (Math.max(rx, ry) + 2);
              const ex = lx - ((lx - m.x) / len) * 9;
              const ey = ly - ((ly - m.y) / len) * 9;
              const bright = l.lit ? 0.45 + 0.55 * l.level : 0;
              const body = (fill: string, stroke: string, sw: number) =>
                ln.shape === "rect" ? (
                  <rect x={m.x - rx} y={m.y - ry} width={ln.w} height={ln.h} rx={1.6} fill={fill} stroke={stroke} strokeWidth={sw} />
                ) : ln.shape === "dome" ? (
                  <path d={`M ${m.x - rx} ${m.y + ry * 0.6} A ${rx} ${ry * 1.4} 0 0 1 ${m.x + rx} ${m.y + ry * 0.6} Z`} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
                ) : (
                  <ellipse cx={m.x} cy={m.y} rx={rx} ry={ry} fill={fill} stroke={stroke} strokeWidth={sw} />
                );
              return (
                <g key={i} onClick={() => setSel(isSel ? null : m.n)} style={{ cursor: "pointer" }}>
                  {/* generous invisible hit area, since the lenses are small */}
                  <circle cx={m.x} cy={m.y} r={16} fill="transparent" />
                  {/* light spilling over the skin around the fixture */}
                  {l.lit && (
                    <circle cx={m.x} cy={m.y} r={10 + 20 * l.level} fill={`url(#lt-glow-${l.color})`} style={{ mixBlendMode: "screen" }} opacity={bright}>
                      {l.flash && <animate attributeName="opacity" values={`${bright};0.05;${bright}`} dur={l.flash === "strobe" ? "0.8s" : "1.3s"} repeatCount="indefinite" />}
                    </circle>
                  )}
                  {m.hidden && <ellipse cx={m.x} cy={m.y} rx={rx + 4} ry={ry + 4} fill="none" stroke="#8a95a0" strokeWidth="1.2" strokeDasharray="3 2.5" opacity=".85" />}
                  {/* leader line + number badge */}
                  <line x1={sx} y1={sy} x2={ex} y2={ey} stroke="#9aa5b0" strokeWidth="0.9" opacity=".75" />
                  {/* bezel / flush fixture seated in the skin (only the lens flashes, not the number) */}
                  <g>
                    {body("#0b0e11", "#aab4be", 3)}
                    {body(l.lit ? c : "url(#lt-glass)", l.lit ? "#ffffff" : "#5a6672", 0.8)}
                    {l.lit ? (
                      <ellipse cx={m.x} cy={m.y} rx={rx * 0.45} ry={ry * 0.45} fill="#fff" opacity={0.55 + 0.4 * l.level} />
                    ) : (
                      <ellipse cx={m.x - rx * 0.3} cy={m.y - ry * 0.35} rx={rx * 0.3} ry={ry * 0.22} fill="#fff" opacity=".35" />
                    )}
                    {l.lit && l.flash && <animate attributeName="opacity" values="1;.2;1" dur={l.flash === "strobe" ? "0.8s" : "1.3s"} repeatCount="indefinite" />}
                  </g>
                  {isSel && <circle cx={m.x} cy={m.y} r={Math.max(rx, ry) + 6} fill="none" stroke="#fff" strokeWidth="1.8" />}
                  <circle cx={lx} cy={ly} r={9.5} fill="#0d1115" stroke={isSel ? "#ffffff" : "#9aa5b0"} strokeWidth={isSel ? 1.8 : 1} />
                  <text x={lx} y={ly + 0.5} textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="700" fill="#f2f4f6" style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>{m.n}</text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      <div className="space-y-1">
        {nums.map((n) => {
          const { ls, lit, reason } = rowStatus(n);
          const first = ls[0];
          const total = ls.length;
          const status = lit === 0 ? reason || "OFF" : total > 1 ? `${lit}/${total} LIT` : first.level < 0.99 ? `${Math.round(first.level * 100)}%` : "LIT";
          return (
            <button key={n} type="button" onClick={() => setSel(sel === n ? null : n)} className={cn("flex w-full items-center gap-2 rounded border bg-inset px-2 py-1 text-left", sel === n ? "border-accent/60" : "border-border")}>
              <span className="w-4 shrink-0 text-center font-mono text-[8px] font-bold text-fg">{n}</span>
              <Dot l={first} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-[8px] uppercase tracking-wide text-fg">{NAMES[n].name}</span>
                <span className="block truncate font-mono text-[7px] uppercase text-subtle">{NAMES[n].note}{sel === n && first ? ` · ${first.supply} · CB ${first.cb}` : ""}</span>
              </span>
              <span className={cn("shrink-0 font-mono text-[7px] uppercase", lit > 0 ? "text-ok" : reason ? "text-warn" : "text-subtle")}>{status}</span>
            </button>
          );
        })}
      </div>
      <div className="px-1 font-mono text-[7px] uppercase leading-snug text-subtle">Dashed ring = underside or not visible from this view · Source: AMM 33-40-0 Fig. 1, 33-41 to 33-49 · Strobes, taxi and logo lights are installed on some airplanes only</div>
    </div>
  );
}
