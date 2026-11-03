import { useEffect, useId, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Animated JT8D cutaway for the Engine Start trainer panel.
 *
 * The photo (public/engine/jt8d-cutaway.webp, 1581 x 506, transparent
 * background) is the base layer for the casing, burners, starter and exhaust.
 * The compressor and turbine rotors are NOT photo: they are drawn as vector
 * geometry on top (the photo's static blades are covered) so every blade is a
 * real shape that turns around the engine axis:
 *   - N1 spool: fan, LP compressor (4 stages), LP turbine (3 stages)
 *   - N2 spool: HP compressor (7 stages + slotted ring), HP turbine
 * Each blade sits at an angle theta around the axis and is projected with the
 * same slight oblique view as the photo, so blades sweep up/down across the
 * drum, flash as they pass the light, and poke out at the top and bottom
 * silhouette exactly like a real cutaway.
 *
 * Visual speed is capped (a real spool would strobe on screen): it is slow at
 * low N, faster as N rises, and stopped at 0%.
 */

const W = 1581;
const H = 506;
export const ENGINE_CUTAWAY_SRC = "/engine/jt8d-cutaway.webp";

export interface EngineCutawayProps {
  side: 1 | 2;
  /** N1 / N2 in percent. */
  n1: number;
  n2: number;
  egt: number;
  /** Pneumatic starter valve open. */
  starterOn: boolean;
  /** Fuel + ignition on (start lever at IDLE with fuel flowing). */
  fuelOn: boolean;
  running: boolean;
  className?: string;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** Visual revolutions per second for a given N% (capped to avoid strobing). */
const visualRate = (pct: number) => (pct < 0.5 ? 0 : Math.min(0.6, 0.06 + pct * 0.0065));

/** Oblique-view skew: x shift per unit radius at the near side of a ring. */
const SKEW = 0.055;
const TAU = Math.PI * 2;

/* ---------------------------------------------------------------- geometry */

interface Stage {
  key: string;
  spool: 1 | 2;
  x: number; // axial position (image px)
  cy: number; // axis height (image px)
  R: number; // blade root radius
  h: number; // blade height
  c: number; // chord
  beta: number; // stagger, degrees
  n: number; // blade count
  phase: number; // angular offset, radians
}

const COMP_CY = 261;
const TURB_CY = 275;

const LPC_X = [264, 298, 331, 364];
const HPC_X = [448, 476, 503, 529, 554, 578, 601];
const TURB_X = [1008, 1050, 1090, 1130];

const STAGES: Stage[] = [
  ...LPC_X.map<Stage>((x, i) => ({ key: `lpc${i}`, spool: 1, x, cy: COMP_CY, R: 80, h: 17 - i, c: 16, beta: 38, n: 26, phase: i * 0.37 })),
  ...HPC_X.map<Stage>((x, i) => ({ key: `hpc${i}`, spool: 2, x, cy: COMP_CY, R: 84, h: 13 - i * 0.6, c: 11.5 - i * 0.35, beta: 42, n: 32 + i * 2, phase: i * 0.29 })),
  { key: "hpt", spool: 2, x: TURB_X[0], cy: TURB_CY, R: 104, h: 17, c: 13, beta: -34, n: 44, phase: 0.2 },
  { key: "lpt1", spool: 1, x: TURB_X[1], cy: TURB_CY, R: 106, h: 19, c: 14, beta: -34, n: 44, phase: 0.5 },
  { key: "lpt2", spool: 1, x: TURB_X[2], cy: TURB_CY, R: 107, h: 21, c: 15.5, beta: -34, n: 46, phase: 0.1 },
  { key: "lpt3", spool: 1, x: TURB_X[3], cy: TURB_CY, R: 108, h: 23, c: 17, beta: -34, n: 48, phase: 0.8 },
];

/** Drum surfaces between stage rings (rotor bodies) with rotating key marks. */
interface Band {
  key: string;
  spool: 1 | 2;
  xa: number;
  xb: number;
  cy: number;
  R: number;
  marks: number;
  turbine?: boolean;
}

const BANDS: Band[] = [
  { key: "lpcDrum", spool: 1, xa: 252, xb: 381, cy: COMP_CY, R: 80, marks: 9 },
  { key: "slotRing", spool: 2, xa: 381, xb: 434, cy: COMP_CY, R: 88, marks: 0 },
  { key: "hpcDrum", spool: 2, xa: 434, xb: 620, cy: COMP_CY, R: 84, marks: 11 },
  { key: "hptDisc", spool: 2, xa: 1014, xb: 1030, cy: TURB_CY, R: 104, marks: 0, turbine: true },
  { key: "lptDisc1", spool: 1, xa: 1056, xb: 1074, cy: TURB_CY, R: 106, marks: 0, turbine: true },
  { key: "lptDisc2", spool: 1, xa: 1096, xb: 1114, cy: TURB_CY, R: 107, marks: 0, turbine: true },
  { key: "lptDisc3", spool: 1, xa: 1136, xb: 1160, cy: TURB_CY, R: 108, marks: 0, turbine: true },
];

const f = (v: number) => v.toFixed(1);

/** Path of the near-half band between two rings (a curved "cylinder" strip). */
function bandPath(b: Band): string {
  const pts: string[] = [];
  const steps = 14;
  for (let k = 0; k <= steps; k++) {
    const th = -Math.PI / 2 + (k * Math.PI) / steps;
    pts.push(`${f(b.xa + SKEW * b.R * Math.cos(th))} ${f(b.cy + b.R * Math.sin(th))}`);
  }
  for (let k = steps; k >= 0; k--) {
    const th = -Math.PI / 2 + (k * Math.PI) / steps;
    pts.push(`${f(b.xb + SKEW * b.R * Math.cos(th))} ${f(b.cy + b.R * Math.sin(th))}`);
  }
  return `M${pts.join(" L")} Z`;
}

/** Ring (groove) line at axial x and radius R, near half only. */
function ringPath(x: number, cy: number, R: number): string {
  const pts: string[] = [];
  for (let k = 0; k <= 16; k++) {
    const th = -Math.PI / 2 + (k * Math.PI) / 16;
    pts.push(`${f(x + SKEW * R * Math.cos(th))} ${f(cy + R * Math.sin(th))}`);
  }
  return `M${pts.join(" L")}`;
}

interface BladePaths {
  far: string;
  near: [string, string, string];
}

/** Build every blade of a stage at spool angle phi, bucketed by lighting. */
function bladePaths(st: Stage, phi: number): BladePaths {
  const beta = (st.beta * Math.PI) / 180;
  const hc = st.c / 2;
  const dxr = hc * Math.cos(beta);
  const tr = hc * Math.sin(beta);
  const R2 = st.R + st.h;
  let far = "";
  const near: [string, string, string] = ["", "", ""];
  for (let i = 0; i < st.n; i++) {
    const th = phi + st.phase + (i * TAU) / st.n;
    const s = Math.sin(th);
    const c = Math.cos(th);
    const rx = st.x + SKEW * st.R * c;
    const ry = st.cy + st.R * s;
    const tx = st.x + SKEW * R2 * c;
    const ty = st.cy + R2 * s;
    const t = tr * c;
    const d = `M${f(rx + dxr)} ${f(ry + t)}L${f(rx - dxr)} ${f(ry - t)}L${f(tx - dxr * 0.75)} ${f(ty - t * 0.75)}L${f(tx + dxr * 0.75)} ${f(ty + t * 0.75)}Z`;
    if (c <= 0) {
      far += d;
    } else {
      const L = 0.5 + 0.5 * Math.cos(th + 0.9);
      near[L < 0.34 ? 0 : L < 0.68 ? 1 : 2] += d;
    }
  }
  return { far, near };
}

/** Rotating key marks (longitudinal lines) on a drum band. */
function keyPath(b: Band, phi: number, lift: number): string {
  let d = "";
  for (let k = 0; k < b.marks; k++) {
    const th = phi + (k * TAU) / b.marks;
    const c = Math.cos(th);
    if (c < 0.12) continue;
    const y = b.cy + b.R * Math.sin(th) + lift;
    d += `M${f(b.xa + SKEW * b.R * c)} ${f(y)}L${f(b.xb + SKEW * b.R * c)} ${f(y)}`;
  }
  return d;
}

/** Slots on the mid compressor ring, foreshortened as they turn away. */
function slotPath(b: Band, phi: number): string {
  let d = "";
  const K = 8;
  const xm = (b.xa + b.xb) / 2;
  const rx = 17;
  for (let k = 0; k < K; k++) {
    const th = phi + (k * TAU) / K;
    const c = Math.cos(th);
    if (c < 0.05) continue;
    const cx = xm + SKEW * b.R * c;
    const cyk = b.cy + b.R * Math.sin(th);
    const ry = Math.max(0.6, 3.6 * c);
    d += `M${f(cx - rx)} ${f(cyk)}a${rx} ${f(ry)} 0 1 0 ${2 * rx} 0a${rx} ${f(ry)} 0 1 0 ${-2 * rx} 0Z`;
  }
  return d;
}

const BAND_PATHS = BANDS.map((b) => bandPath(b));
const RING_PATHS = [
  ...LPC_X.map((x) => ringPath(x + 14, COMP_CY, 80)),
  ...HPC_X.map((x) => ringPath(x + 12, COMP_CY, 84)),
  ringPath(381, COMP_CY, 88),
  ringPath(434, COMP_CY, 88),
];

/* -------------------------------------------------------------------- fan */

const FAN = { cx: 104, cy: 240, rx: 84, ry: 190 };
const FAN_BLADES = 18;

function fanBlades() {
  const r = FAN.ry;
  const step = TAU / FAN_BLADES;
  const w = step * 0.42;
  let d = "";
  for (let i = 0; i < FAN_BLADES; i++) {
    const a = i * step;
    d += `M0 0 L${f(r * Math.cos(a))} ${f(r * Math.sin(a))} L${f(r * Math.cos(a + w))} ${f(r * Math.sin(a + w))} Z `;
  }
  return d;
}
const FAN_PATH = fanBlades();

/* ------------------------------------------------------------------ view */

function Tag({ x, y, label, value, tone = "text-fg" }: { x: number; y: number; label: string; value?: string; tone?: string }) {
  return (
    <span
      className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-sm border border-white/15 bg-black/60 px-1 font-mono text-[6px] uppercase leading-[1.5] tracking-wide sm:text-[8px]"
      style={{ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` }}
    >
      <span className="text-subtle">{label}</span>
      {value && <span className={cn("ml-1", tone)}>{value}</span>}
    </span>
  );
}

const NEAR_FILL = ["#565a5f", "#a3a6a4", "#f1f2ee"] as const;

export function EngineCutaway({ side, n1, n2, egt, starterOn, fuelOn, running, className }: EngineCutawayProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const id = (s: string) => `${s}-${uid}`;

  const live = useRef({ n1, n2, fuelOn, egt });
  live.current = { n1, n2, fuelOn, egt };

  const els = useRef(new Map<string, SVGElement>());
  const reg = (k: string) => (el: SVGElement | null) => {
    if (el) els.current.set(k, el);
    else els.current.delete(k);
  };

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let phi1 = 0;
    let phi2 = 0;
    let fanAngle = 0;
    let drawn1 = NaN;
    let drawn2 = NaN;
    const set = (k: string, d: string) => els.current.get(k)?.setAttribute("d", d);
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const { n1: a, n2: b, fuelOn: fuel, egt: temp } = live.current;
      phi1 = (phi1 + visualRate(a) * TAU * dt) % TAU;
      phi2 = (phi2 + visualRate(b) * TAU * dt) % TAU;
      fanAngle = (fanAngle + visualRate(a) * 360 * dt) % 360;

      if (phi1 !== drawn1 || phi2 !== drawn2) {
        for (const st of STAGES) {
          const p = bladePaths(st, st.spool === 1 ? phi1 : phi2);
          set(`${st.key}-far`, p.far);
          set(`${st.key}-n0`, p.near[0]);
          set(`${st.key}-n1`, p.near[1]);
          set(`${st.key}-n2`, p.near[2]);
        }
        for (const bd of BANDS) {
          const phi = bd.spool === 1 ? phi1 : phi2;
          if (bd.marks) {
            set(`${bd.key}-k0`, keyPath(bd, phi, 0));
            set(`${bd.key}-k1`, keyPath(bd, phi, 1.3));
          }
        }
        set("slots", slotPath(BANDS[1], phi2));
        drawn1 = phi1;
        drawn2 = phi2;
      }
      els.current.get("fan")?.setAttribute("transform", `translate(${FAN.cx} ${FAN.cy}) scale(${FAN.rx / FAN.ry} 1) rotate(${fanAngle.toFixed(1)})`);

      const c = clamp01((temp - 60) / 420);
      const flick = 0.9 + 0.1 * Math.sin(now / 47) * Math.sin(now / 131 + 1.3);
      els.current.get("burn")?.setAttribute("opacity", (c * flick).toFixed(3));
      const sparking = fuel && temp < 200;
      els.current.get("spark")?.setAttribute("opacity", sparking ? (Math.sin(now / 38) > 0.15 ? "0.95" : "0.15") : "0");
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const heat = clamp01((egt - 60) / 420);
  const fanOpacity = clamp01(n1 / 12) * 0.55;
  const plume = fuelOn || running ? clamp01(0.25 + heat * 0.9) : clamp01(heat * 0.6);
  const blend = { mixBlendMode: "screen" } as const;

  const compClip = `M250 163H622V360H250Z`;
  const turbClip = `M992 152L1166 150V398L992 398Z`;

  return (
    <div
      className={cn("relative w-full overflow-hidden rounded-lg border border-[#343a42] bg-[#0b0d10]", className)}
      style={{ aspectRatio: `${W} / ${H}` }}
      role="img"
      aria-label={`Engine ${side} cutaway: N1 ${Math.round(n1)}%, N2 ${Math.round(n2)}%, EGT ${Math.round(egt)} degrees C${running ? ", running" : ""}`}
    >
      <img src={ENGINE_CUTAWAY_SRC} alt="" draggable={false} className="absolute inset-0 h-full w-full select-none object-fill" />
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id={id("cavC")} x1="0" y1="163" x2="0" y2="360" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#07080a" />
            <stop offset="0.5" stopColor="#15181b" />
            <stop offset="1" stopColor="#07080a" />
          </linearGradient>
          <linearGradient id={id("cavT")} x1="0" y1="150" x2="0" y2="398" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#07080a" />
            <stop offset="0.5" stopColor="#181a1d" />
            <stop offset="1" stopColor="#07080a" />
          </linearGradient>
          {/* cylinder shading for compressor drums */}
          <linearGradient id={id("drum")} x1="0" y1={COMP_CY - 90} x2="0" y2={COMP_CY + 90} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#222427" />
            <stop offset="0.16" stopColor="#70736f" />
            <stop offset="0.34" stopColor="#c4c5c0" />
            <stop offset="0.52" stopColor="#8f918e" />
            <stop offset="0.78" stopColor="#4c4e50" />
            <stop offset="1" stopColor="#1c1e20" />
          </linearGradient>
          {/* bronze turbine discs */}
          <linearGradient id={id("disc")} x1="0" y1={TURB_CY - 110} x2="0" y2={TURB_CY + 110} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#1a1815" />
            <stop offset="0.2" stopColor="#6b5b3d" />
            <stop offset="0.42" stopColor="#c0a566" />
            <stop offset="0.7" stopColor="#725f3b" />
            <stop offset="1" stopColor="#181613" />
          </linearGradient>
          <radialGradient id={id("burn")}>
            <stop offset="0" stopColor="#fff0b0" stopOpacity="0.95" />
            <stop offset="0.35" stopColor="#ff9a1f" stopOpacity="0.85" />
            <stop offset="1" stopColor="#e02a00" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={id("hot")}>
            <stop offset="0" stopColor="#ff7a2a" stopOpacity="0.8" />
            <stop offset="0.6" stopColor="#d8360a" stopOpacity="0.45" />
            <stop offset="1" stopColor="#a01a00" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={id("plume")} x1="0" x2="1">
            <stop offset="0" stopColor="#ffd27a" stopOpacity="0.9" />
            <stop offset="0.4" stopColor="#ff7a1f" stopOpacity="0.6" />
            <stop offset="1" stopColor="#ff3a00" stopOpacity="0" />
          </linearGradient>
          <radialGradient id={id("spark")}>
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.4" stopColor="#9bd0ff" stopOpacity="0.85" />
            <stop offset="1" stopColor="#4aa0ff" stopOpacity="0" />
          </radialGradient>
          <filter id={id("soft")} x="-20%" y="-60%" width="140%" height="220%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
          <clipPath id={id("fanclip")}>
            <ellipse cx={FAN.cx} cy={FAN.cy} rx={FAN.rx} ry={FAN.ry} />
          </clipPath>
          <clipPath id={id("compclip")}>
            <path d={compClip} />
          </clipPath>
          <clipPath id={id("turbclip")}>
            <path d={turbClip} />
          </clipPath>
        </defs>

        {/* Fan face (N1) */}
        <g clipPath={`url(#${id("fanclip")})`} style={blend} opacity={fanOpacity}>
          <g ref={reg("fan")} transform={`translate(${FAN.cx} ${FAN.cy}) scale(${FAN.rx / FAN.ry} 1)`}>
            <path d={FAN_PATH} fill="#dfe8ff" opacity="0.5" />
          </g>
        </g>

        {/* Compressor rotor (drawn) */}
        <g clipPath={`url(#${id("compclip")})`}>
          <path d={compClip} fill={`url(#${id("cavC")})`} />
          {STAGES.filter((s) => s.cy === COMP_CY).map((s) => (
            <path key={`${s.key}-far`} ref={reg(`${s.key}-far`)} fill="#34373a" />
          ))}
          <g>
            {BANDS.filter((b) => b.cy === COMP_CY).map((b) => {
              const i = BANDS.indexOf(b);
              return <path key={b.key} d={BAND_PATHS[i]} fill={`url(#${id("drum")})`} />;
            })}
            {RING_PATHS.map((d, i) => (
              <path key={i} d={d} fill="none" stroke="#111315" strokeWidth="1.6" opacity="0.85" />
            ))}
            {BANDS.filter((b) => b.marks && b.cy === COMP_CY).map((b) => (
              <g key={b.key}>
                <path ref={reg(`${b.key}-k1`)} stroke="rgba(255,255,255,0.28)" strokeWidth="1" fill="none" />
                <path ref={reg(`${b.key}-k0`)} stroke="rgba(0,0,0,0.42)" strokeWidth="1.3" fill="none" />
              </g>
            ))}
            <path ref={reg("slots")} fill="#15171a" stroke="rgba(255,255,255,0.55)" strokeWidth="0.8" />
          </g>
          {STAGES.filter((s) => s.cy === COMP_CY).map((s) => (
            <g key={s.key} stroke="#17191c" strokeWidth="0.5" strokeLinejoin="round">
              {NEAR_FILL.map((fill, i) => (
                <path key={i} ref={reg(`${s.key}-n${i}`)} fill={fill} />
              ))}
            </g>
          ))}
        </g>

        {/* Turbine rotor (drawn) */}
        <g clipPath={`url(#${id("turbclip")})`}>
          <path d={turbClip} fill={`url(#${id("cavT")})`} />
          {STAGES.filter((s) => s.cy === TURB_CY).map((s) => (
            <path key={`${s.key}-far`} ref={reg(`${s.key}-far`)} fill="#2e3033" />
          ))}
          {BANDS.filter((b) => b.turbine).map((b) => (
            <path key={b.key} d={BAND_PATHS[BANDS.indexOf(b)]} fill={`url(#${id("disc")})`} stroke="#14120f" strokeWidth="1" />
          ))}
          {STAGES.filter((s) => s.cy === TURB_CY).map((s) => (
            <g key={s.key} stroke="#17191c" strokeWidth="0.5" strokeLinejoin="round">
              {NEAR_FILL.map((fill, i) => (
                <path key={i} ref={reg(`${s.key}-n${i}`)} fill={fill} />
              ))}
            </g>
          ))}
        </g>

        {/* Combustion: burner cans, core and turbine heat */}
        <g ref={reg("burn")} style={blend} opacity={0}>
          <ellipse cx="835" cy="168" rx="105" ry="34" fill={`url(#${id("burn")})`} />
          <ellipse cx="835" cy="356" rx="105" ry="40" fill={`url(#${id("burn")})`} />
          <ellipse cx="830" cy="260" rx="110" ry="70" fill={`url(#${id("hot")})`} opacity="0.7" />
          <ellipse cx="960" cy="254" rx="70" ry="95" fill={`url(#${id("hot")})`} opacity="0.85" />
          <ellipse cx="1065" cy="252" rx="95" ry="120" fill={`url(#${id("hot")})`} opacity="0.5" />
          <ellipse cx="1235" cy="258" rx="95" ry="65" fill={`url(#${id("hot")})`} opacity="0.55" />
        </g>
        <g ref={reg("spark")} style={blend} opacity={0}>
          <circle cx="768" cy="170" r="26" fill={`url(#${id("spark")})`} />
          <circle cx="764" cy="350" r="26" fill={`url(#${id("spark")})`} />
        </g>

        {/* Exhaust plume beyond the cone tip */}
        <path
          d={`M1398 258 C1440 ${258 - 34 * plume} 1495 ${258 - 24 * plume} ${1425 + 150 * plume} 258 C1495 ${258 + 24 * plume} 1440 ${258 + 34 * plume} 1398 258 Z`}
          fill={`url(#${id("plume")})`}
          filter={`url(#${id("soft")})`}
          style={blend}
          opacity={plume > 0.05 ? 1 : 0}
        />

        {/* Starter (pneumatic) on the accessory gearbox */}
        <rect
          x="243"
          y="430"
          width="334"
          height="70"
          rx="14"
          fill={starterOn ? "rgba(255,176,32,0.22)" : "none"}
          stroke={starterOn ? "#ffb020" : "transparent"}
          strokeWidth="5"
          className={starterOn ? "animate-pulse" : undefined}
        />
      </svg>

      <Tag x={110} y={30} label="FAN" value={`N1 ${Math.round(n1)}%`} />
      <Tag x={320} y={150} label="LPC" />
      <Tag x={510} y={150} label="HPC" value={`N2 ${Math.round(n2)}%`} />
      <Tag x={830} y={100} label="BURNERS" value={`${Math.round(egt)}°C`} tone={egt > 450 ? "text-warn" : "text-fg"} />
      <Tag x={1080} y={120} label="TURB" />
      <Tag x={410} y={410} label="STARTER" value={starterOn ? "AIR ON" : "OFF"} tone={starterOn ? "text-caution" : "text-subtle"} />
      <Tag x={1335} y={330} label={fuelOn ? "FUEL / IGN" : "NO FUEL"} tone={fuelOn ? "text-ok" : "text-subtle"} />
    </div>
  );
}
