import { useEffect, useRef, useState } from "react";

/**
 * Animated diagrams + thermal / ice model for the Ice & Rain Protection trainer (ATA 30).
 *
 * Sources (737 AMM, rev 108):
 *  - 56-10-0 fig. 1  Flight compartment window location: No.1 forward windshield, No.2 sliding
 *    window, No.3 crew side window (unheated), No.4 eyebrow, No.5 small eyebrow. 10 windows.
 *  - 30-41-0  Window heat. No.1/2/4/5 are heated. No.1 and No.2 are held at 107 ±7 °F by their
 *    heat control unit, power ramps 0 → full in ~3 min, overheat cutoff ≈145 °F. No.4/5 are
 *    regulated 80–120 °F by the No.5 thermal switch (opens 110 °F, closes 90 °F).
 *    Left gen → L No.1/4/5 + R No.2;  right gen → R No.1/4/5 + L No.2.
 *  - 30-11-0  Wing TAI. Heats the leading-edge SLATS only (six slat spray ducts), valve just
 *    outboard of each engine strut, motor-driven on 115 V ac, inhibited on the ground by the
 *    landing-gear safety relay (TEST position bypasses it). Telescoping ducts follow the slats.
 *  - 30-42-0  Wipers: arc 84 ±4°, HIGH ≥ 250 strokes/min, momentary PARK drives home at high speed.
 *
 * Front-view art: public/trainers/front-737.webp (2336 × 894). Left/right on that view:
 * viewer LEFT = aircraft RIGHT.  Plan view uses the same wing geometry as the Flight Controls
 * component view (Overhead.tsx), where viewer LEFT = aircraft LEFT.
 */

/* ───────────────────────────── model ───────────────────────────── */

export type WinId = "L1" | "L2" | "L4" | "L5" | "R1" | "R2" | "R4" | "R5";
export const WIN_IDS: WinId[] = ["L1", "L2", "L4", "L5", "R1", "R2", "R4", "R5"];
export type ProbeId = "capt" | "fo" | "elevL" | "elevR" | "temp" | "alphaL" | "alphaR";
export const PROBE_IDS: ProbeId[] = ["capt", "fo", "elevL", "elevR", "temp", "alphaL", "alphaR"];
export type WiperMode = "PARK" | "INT" | "LOW" | "HIGH";
type Side = "L" | "R";

export interface WinState {
  /** glass temperature, °F */
  t: number;
  /** controller power ramp 0..1 (3 min to full) */
  ramp: number;
  /** seconds (sim) since power was removed */
  offT: number;
  /** delivered power fraction 0..1 */
  p: number;
  /** No.4/5 thermal-switch contact state */
  heat: boolean;
  /** temperature overheat trip (>145 °F while powered) */
  trip: boolean;
  ice: number;
  wet: number;
}

export interface IceState {
  win: Record<WinId, WinState>;
  probe: Record<ProbeId, number>;
  slat: Record<Side, number>;
  cowl: { 1: number; 2: number };
  valve: Record<Side, number>;
  repel: Record<Side, number>;
}

export interface IceInputs {
  /** time compression for thermal / ice processes (1 = real time) */
  speed: number;
  icing: boolean;
  rain: boolean;
  oatF: number;
  winEnabled: Record<WinId, boolean>;
  testPwr: boolean;
  probeHeated: Record<ProbeId, boolean>;
  valveCmd: Record<Side, boolean>;
  hotAir: Record<Side, boolean>;
  cowlHeated: { 1: boolean; 2: boolean };
  wiper: Record<Side, WiperMode>;
}

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
/** Window glass colour from temperature: amber at ≈100 °F shifting to red toward the 145 °F cutoff. */
function heatColor(t: number): string {
  const k = clamp((t - 100) / 45);
  const g = Math.round(150 - 100 * k);
  return `rgb(255,${g},${Math.round(40 - 20 * k)})`;
}
export const WIPER_SPM: Record<WiperMode, number> = { PARK: 0, INT: 190, LOW: 120, HIGH: 250 };
const WIPER_ARC = 84;

function initialState(oat: number): IceState {
  const win = {} as Record<WinId, WinState>;
  for (const id of WIN_IDS)
    win[id] = { t: oat, ramp: 0, offT: 99, p: 0, heat: true, trip: false, ice: 0, wet: 0 };
  const probe = {} as Record<ProbeId, number>;
  for (const id of PROBE_IDS) probe[id] = 0;
  return {
    win,
    probe,
    slat: { L: 0, R: 0 },
    cowl: { 1: 0, 2: 0 },
    valve: { L: 0, R: 0 },
    repel: { L: 0, R: 0 },
  };
}

function step(
  prev: IceState,
  inp: IceInputs,
  dt: number,
  strokesPerSec: Record<Side, number>,
): IceState {
  const ds = dt * inp.speed;
  const oat = inp.icing ? Math.min(inp.oatF, 25) : inp.oatF;
  const win = {} as Record<WinId, WinState>;
  for (const id of WIN_IDS) {
    const w = prev.win[id];
    const major = id[1] === "1" || id[1] === "2";
    const en = inp.winEnabled[id];
    let { t, ramp, offT, heat, trip, ice, wet } = w;
    let p = 0;
    if (en) {
      offT = 0;
      if (major) {
        ramp = Math.min(1, ramp + ds / 180);
        p = Math.min(ramp, clamp((114 - t) / 14));
        if (inp.testPwr) p = 1;
        if (t > 145) trip = true;
      } else {
        if (t >= 110) heat = false;
        else if (t <= 90) heat = true;
        p = heat ? 1 : 0;
      }
    } else {
      offT += ds;
      if (offT >= 5) ramp = 0;
      trip = false;
    }
    if (trip) p = 0;
    const teq = oat + (major ? 100 : 70) * p;
    const tau = major ? 50 : 40;
    t += (teq - t) * (1 - Math.exp(-ds / tau));
    if (t < 38) {
      if (inp.icing) ice += ds / 30;
    } else ice -= ds * (0.02 + (t - 38) / 1500);
    ice = clamp(ice);
    if (id[1] === "1") {
      const side = id[0] as Side;
      const rainRate = inp.rain ? 0.25 * (1 - 0.8 * prev.repel[side]) : 0;
      wet = clamp(wet + rainRate * dt - strokesPerSec[side] * 0.35 * dt - 0.015 * dt);
    }
    win[id] = { t, ramp, offT, p, heat, trip, ice, wet };
  }

  const probe = {} as Record<ProbeId, number>;
  for (const id of PROBE_IDS) {
    let v = prev.probe[id];
    if (inp.probeHeated[id]) v -= ds / 7;
    else if (inp.icing) v += ds / 50;
    probe[id] = clamp(v);
  }

  const valve = { L: 0, R: 0 } as Record<Side, number>;
  const slat = { L: 0, R: 0 } as Record<Side, number>;
  for (const sd of ["L", "R"] as const) {
    const target = inp.valveCmd[sd] ? 1 : 0;
    const dv = clamp(target - prev.valve[sd], -dt / 3, dt / 3);
    valve[sd] = clamp(prev.valve[sd] + dv);
    const heated = valve[sd] > 0.5 && inp.hotAir[sd];
    let v = prev.slat[sd];
    if (heated) v -= ds / 20;
    else if (inp.icing) v += ds / 60;
    slat[sd] = clamp(v);
  }
  const cowl = { 1: 0, 2: 0 };
  for (const n of [1, 2] as const) {
    let v = prev.cowl[n];
    if (inp.cowlHeated[n]) v -= ds / 15;
    else if (inp.icing) v += ds / 50;
    cowl[n] = clamp(v);
  }
  const repel = {
    L: clamp(prev.repel.L - dt / 45),
    R: clamp(prev.repel.R - dt / 45),
  };
  return { win, probe, slat, cowl, valve, repel };
}

export interface Wipers {
  els: Record<Side, SVGGElement | null>;
  phase: Record<Side, number>;
  mode: Record<Side, WiperMode>;
}

/**
 * Runs the animation loop. Wiper arms are moved imperatively every frame (60 fps); the thermal /
 * ice state is stepped every frame but only pushed to React ~10×/s.
 */
export function useIceRainAnim(inp: IceInputs) {
  const inpRef = useRef(inp);
  inpRef.current = inp;
  const [state, setState] = useState<IceState>(() => initialState(inp.oatF));
  const stRef = useRef<IceState>(state);
  const wipers = useRef<Wipers>({
    els: { L: null, R: null },
    phase: { L: 0, R: 0 },
    mode: { L: "PARK", R: "PARK" },
  }).current;
  wipers.mode = inp.wiper;
  const spray = (side: Side) => {
    stRef.current = { ...stRef.current, repel: { ...stRef.current.repel, [side]: 1 } };
    setState(stRef.current);
  };

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      const sps = { L: 0, R: 0 } as Record<Side, number>;
      for (const sd of ["L", "R"] as const) {
        const mode = wipers.mode[sd];
        let ph = wipers.phase[sd];
        if (mode !== "PARK") {
          ph += (WIPER_SPM[mode] / 120) * dt;
          if (ph >= 1) ph -= 1;
          sps[sd] = WIPER_SPM[mode] / 60;
        } else if (ph > 0) {
          // PARK: motor runs at high speed until the blades reach the park position
          ph += (250 / 120) * dt;
          sps[sd] = 250 / 60;
          if (ph >= 1) ph = 0;
        }
        wipers.phase[sd] = ph;
        const el = wipers.els[sd];
        if (el) {
          const ang = WIPER_ARC * (1 - Math.abs(2 * ph - 1));
          const px = el.dataset.px ?? "0";
          const py = el.dataset.py ?? "0";
          const flip = el.dataset.flip === "-1" ? -1 : 1;
          el.setAttribute("transform", `translate(${px} ${py}) scale(${flip} 1) rotate(${-ang})`);
        }
      }
      stRef.current = step(stRef.current, inpRef.current, dt, sps);
      acc += dt;
      if (acc >= 0.1) {
        acc = 0;
        setState(stRef.current);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [wipers]);

  return { anim: state, wipers, spray };
}

/* ───────────────────────────── shared svg bits ───────────────────────────── */

type Pt = [number, number];
const MX = 2329; // mirror axis of the front view (centre line × 2)
const mir = (p: Pt[]): Pt[] => p.map(([x, y]) => [MX - x, y]);
const pts = (p: Pt[]) => p.map(([x, y]) => `${x},${y}`).join(" ");
const HOT = "#ff9d3a";

export const ICE_CSS = `
@keyframes irt-flow { to { stroke-dashoffset: -22; } }
@keyframes irt-rise { 0% { transform: translateY(5px); opacity: 0; } 30% { opacity: .85; } 100% { transform: translateY(-9px); opacity: 0; } }
@keyframes irt-flash { 0%,100% { opacity: .25; } 50% { opacity: 1; } }
@keyframes irt-pulse { 0%,100% { opacity: .55; } 50% { opacity: 1; } }
.irt-flow { stroke-dasharray: 6 5; animation: irt-flow .7s linear infinite; }
.irt-rise { animation: irt-rise 2.4s ease-in infinite; }
.irt-flash { animation: irt-flash .5s steps(2, end) infinite; }
.irt-pulse { animation: irt-pulse 1.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .irt-flow, .irt-rise, .irt-flash, .irt-pulse { animation: none; } }
`;

function Defs() {
  return (
    <defs>
      <filter id="irt-blur" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="1.6" />
      </filter>
      <filter id="irt-blur-lg" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="9" />
      </filter>
      <pattern id="irt-frost" width="7" height="7" patternUnits="userSpaceOnUse">
        <rect width="7" height="7" fill="#dff1ff" fillOpacity=".35" />
        <path d="M3.5 0V7M0 3.5H7M1 1L6 6M6 1L1 6" stroke="#ffffff" strokeWidth=".5" opacity=".9" />
      </pattern>
      <pattern id="irt-drops" width="9" height="9" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="1.1" fill="#9fd3ff" />
        <circle cx="6.5" cy="5" r="1.4" fill="#bfe3ff" />
        <circle cx="3" cy="7.5" r=".8" fill="#9fd3ff" />
      </pattern>
      <radialGradient id="irt-probe-glow">
        <stop offset="0" stopColor="#ff8a1e" stopOpacity=".95" />
        <stop offset=".45" stopColor="#ff9d3a" stopOpacity=".5" />
        <stop offset="1" stopColor="#ff9d3a" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}

/* ───────────────────────────── cockpit windows (AMM 56-10-0 fig. 1) ───────────────────────────── */

/** Window outlines traced from the front view. These are the AIRCRAFT-RIGHT windows (viewer left). */
const WIN_R: Record<"1" | "2" | "3" | "4" | "5", Pt[]> = {
  1: [[1093, 491], [1160, 487], [1160, 521], [1092, 520]],
  2: [[1079, 492], [1092, 493], [1091, 525], [1063, 538]],
  3: [[1048, 525], [1062, 493], [1072, 491], [1060, 538]],
  4: [[1088, 479], [1110, 474], [1111, 483], [1088, 486]],
  5: [[1065, 481], [1085, 478], [1086, 485], [1066, 487]],
};
const winPts = (side: Side, n: keyof typeof WIN_R): Pt[] => (side === "R" ? WIN_R[n] : mir(WIN_R[n]));
const centroid = (p: Pt[]): Pt => [
  p.reduce((a, q) => a + q[0], 0) / p.length,
  p.reduce((a, q) => a + q[1], 0) / p.length,
];
const WIPER_LEN = 74;

function WindowLayer({
  anim,
  ovht,
  wipers,
  detail,
}: {
  anim: IceState;
  ovht: Record<WinId, boolean>;
  wipers?: Wipers;
  detail: boolean;
}) {
  const sides: Side[] = ["R", "L"];
  return (
    <g>
      <defs>
        {sides.map((sd) => (
          <clipPath key={sd} id={`irt-clip-${sd}1`}>
            <polygon points={pts(winPts(sd, "1"))} />
          </clipPath>
        ))}
      </defs>
      {sides.map((sd) =>
        (["3", "2", "1", "4", "5"] as const).map((n) => {
          const p = winPts(sd, n);
          const c = centroid(p);
          if (n === "3") {
            return (
              <g key={sd + n}>
                <polygon points={pts(p)} fill="#16222c" fillOpacity=".55" stroke="#52606c" strokeWidth=".6" />
                {detail && (
                  <text x={c[0]} y={c[1] + 2} fontSize="6" textAnchor="middle" fill="#6e7d8a">3</text>
                )}
              </g>
            );
          }
          const id = `${sd}${n}` as WinId;
          const w = anim.win[id];
          const glow = clamp((w.t - 45) / 65);
          const hot = heatColor(w.t);
          const bad = ovht[id] || w.trip;
          const xs = p.map((q) => q[0]);
          const minX = Math.min(...xs);
          const wd = Math.max(...xs) - minX;
          const botY = Math.max(...p.map((q) => q[1]));
          const nLines = n === "1" ? 4 : n === "2" ? 2 : 1;
          return (
            <g key={id}>
              <polygon points={pts(p)} fill="#0b1c28" fillOpacity=".62" />
              <polygon points={pts(p)} fill={hot} fillOpacity={0.1 + 0.55 * glow} />
              {/* bus bars along the top and bottom edges */}
              {([[p[0], p[1]], [p[3], p[2]]] as [Pt, Pt][]).map(([a, b], i) => (
                <g key={i}>
                  <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={hot} strokeWidth="3.4" opacity={0.7 * w.p} filter="url(#irt-blur)" />
                  <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={hot} strokeWidth="1.1" opacity={0.15 + 0.85 * w.p} />
                </g>
              ))}
              {detail && glow > 0.2 && (
                <g>
                  {Array.from({ length: nLines }).map((_, i) => (
                    <path
                      key={i}
                      className="irt-rise"
                      style={{ animationDelay: `${i * 0.6}s` }}
                      d={`M${minX + ((i + 1) / (nLines + 1)) * wd} ${botY - 4} q2 -4 0 -8 t0 -8`}
                      fill="none"
                      stroke="#ffd9a0"
                      strokeWidth=".9"
                      opacity=".8"
                    />
                  ))}
                </g>
              )}
              {n === "1" && <polygon points={pts(p)} fill="url(#irt-drops)" opacity={w.wet * 0.9} />}
              {n === "1" && anim.repel[sd] > 0.02 && (
                <polygon points={pts(p)} fill="#7fd0ff" fillOpacity={anim.repel[sd] * 0.28} />
              )}
              <polygon points={pts(p)} fill="url(#irt-frost)" opacity={w.ice * 0.95} />
              {bad && <polygon points={pts(p)} fill="#ff3b2e" className="irt-flash" />}
              <polygon points={pts(p)} fill="none" stroke="#9db3c4" strokeWidth=".6" opacity=".7" />
              {detail && (
                <text x={c[0]} y={c[1] + 2} fontSize="6.5" textAnchor="middle" fill="#cfe0ee" opacity=".85">
                  {n}
                </text>
              )}
            </g>
          );
        }),
      )}
      {/* No.1 wipers, clipped to the pane */}
      {detail &&
        wipers &&
        sides.map((sd) => {
          const p = winPts(sd, "1");
          const pivot = p[3];
          return (
            <g key={sd} clipPath={`url(#irt-clip-${sd}1)`}>
              <g
                ref={(el) => {
                  wipers.els[sd] = el;
                }}
                data-px={pivot[0]}
                data-py={pivot[1]}
                data-flip={sd === "L" ? "-1" : "1"}
              >
                <line x1="0" y1="0" x2={WIPER_LEN} y2="0" stroke="#aab6c1" strokeWidth="1.1" />
                <line x1={WIPER_LEN * 0.3} y1="0" x2={WIPER_LEN} y2="0" stroke="#e7edf2" strokeWidth="2.2" />
              </g>
            </g>
          );
        })}
    </g>
  );
}

/** Zoomed cockpit-window view for the window-heat card. */
export function CockpitWindowsDiagram({
  anim,
  ovht,
  wipers,
}: {
  anim: IceState;
  ovht: Record<WinId, boolean>;
  wipers: Wipers;
}) {
  return (
    <svg
      viewBox="1034 458 262 92"
      className="block h-auto w-full"
      role="img"
      aria-label="Flight compartment windows No.1 to No.5, left and right, per AMM 56-10-0"
    >
      <style>{ICE_CSS}</style>
      <Defs />
      <image href="/trainers/front-737.webp" width="2336" height="894" />
      <WindowLayer anim={anim} ovht={ovht} wipers={wipers} detail />
      <text x="1070" y="548" fontSize="5.5" fill="#8ea2b3" textAnchor="middle" letterSpacing="1">R WINDOWS</text>
      <text x="1259" y="548" fontSize="5.5" fill="#8ea2b3" textAnchor="middle" letterSpacing="1">L WINDOWS</text>
      <text x="1165" y="465" fontSize="5" fill="#8ea2b3" textAnchor="middle">FWD VIEW · AMM 56-10-0</text>
    </svg>
  );
}

/* ───────────────────────────── front overview (engine cowls + slats) ───────────────────────────── */

const SLAT_TOP = (x: number) => 557 + (x - 100) * 0.0886; // wing top edge, viewer-left wing
const slatBand = (x0: number, x1: number, up: number): Pt[] => [
  [x0, SLAT_TOP(x0) - 2 - up],
  [x1, SLAT_TOP(x1) - 2 - up],
  [x1, SLAT_TOP(x1) + 14],
  [x0, SLAT_TOP(x0) + 14],
];
const ENG_CX = { R: 731, L: 1598 }; // viewer-left engine = aircraft right (engine 2)
const ENG_CY = 728;

function Cowl({ cx, heated, ice, hubGlow }: { cx: number; heated: boolean; ice: number; hubGlow: boolean }) {
  const ring = `M${cx - 87} ${ENG_CY} a87 87 0 1 0 174 0 a87 87 0 1 0 -174 0 Z M${cx - 56} ${ENG_CY + 4} a56 56 0 1 0 112 0 a56 56 0 1 0 -112 0 Z`;
  return (
    <g>
      {heated && (
        <>
          <path d={ring} fillRule="evenodd" fill={HOT} opacity=".55" filter="url(#irt-blur-lg)" className="irt-pulse" />
          <path d={ring} fillRule="evenodd" fill={HOT} opacity=".42" className="irt-pulse" />
        </>
      )}
      {hubGlow && <circle cx={cx} cy={ENG_CY + 2} r="15" fill={HOT} opacity=".8" className="irt-pulse" />}
      {ice > 0.02 && (
        <circle cx={cx} cy={ENG_CY} r={86 - ice * 2} fill="none" stroke="#eaf6ff" strokeWidth={ice * 11} opacity=".92" />
      )}
    </g>
  );
}

export function FrontOverviewDiagram({
  anim,
  valveOpen,
  cowlHeated,
  ovht,
}: {
  anim: IceState;
  valveOpen: Record<Side, boolean>;
  cowlHeated: { 1: boolean; 2: boolean };
  ovht: Record<WinId, boolean>;
}) {
  // viewer-left wing = aircraft RIGHT
  const wing = (sd: Side) => {
    const band = sd === "R" ? slatBand(110, 630, anim.slat.R * 9) : mir(slatBand(110, 630, anim.slat.L * 9));
    const heated = valveOpen[sd];
    const first = band[0];
    const last = band[1];
    return (
      <g key={sd}>
        {heated && (
          <>
            <polygon points={pts(band)} fill={HOT} opacity=".6" filter="url(#irt-blur-lg)" className="irt-pulse" />
            <polygon points={pts(band)} fill={HOT} opacity=".5" />
            <line x1={first[0]} y1={first[1] + 8} x2={last[0]} y2={last[1] + 8} stroke="#ffe2b8" strokeWidth="3" className="irt-flow" />
          </>
        )}
        {anim.slat[sd] > 0.02 && (
          <polygon points={pts(band)} fill="#eaf6ff" opacity={0.25 + 0.7 * anim.slat[sd]} />
        )}
      </g>
    );
  };
  return (
    <svg
      viewBox="0 372 2336 490"
      className="block h-auto w-full"
      role="img"
      aria-label="Front view — wing slat and engine cowl thermal anti-ice"
    >
      <style>{ICE_CSS}</style>
      <Defs />
      <image href="/trainers/front-737.webp" width="2336" height="894" />
      {wing("R")}
      {wing("L")}
      <Cowl cx={ENG_CX.R} heated={cowlHeated[2]} ice={anim.cowl[2]} hubGlow={cowlHeated[2]} />
      <Cowl cx={ENG_CX.L} heated={cowlHeated[1]} ice={anim.cowl[1]} hubGlow={cowlHeated[1]} />
      <WindowLayer anim={anim} ovht={ovht} detail={false} />
      <g fontSize="34" fill="#8ea2b3" textAnchor="middle" letterSpacing="3">
        <text x="731" y="838">ENG 2 · COWL</text>
        <text x="1598" y="838">ENG 1 · COWL</text>
        <text x="370" y="520">R WING SLATS</text>
        <text x="1960" y="520">L WING SLATS</text>
      </g>
    </svg>
  );
}

/* ───────────────────────────── wing TAI plan view (Flight Controls aircraft) ───────────────────────────── */

/** Left-wing leading-edge line of the Flight Controls plan view: (298,140) → (55,195). */
const LE = (x: number) => 140 + (298 - x) * (55 / 243);
const SLATS: [number, number][] = [[110, 148], [150, 188], [190, 228]];

function WingSide({
  side,
  anim,
  lePos,
  hot,
  light,
  cowlOpen,
  cowlHeated,
}: {
  side: Side;
  anim: IceState;
  lePos: number;
  hot: boolean;
  light: "off" | "dim" | "bright";
  cowlOpen: boolean;
  cowlHeated: boolean;
}) {
  const m = (x: number) => (side === "L" ? x : 640 - x);
  const P = (x: number, dy = 0) => `${m(x)},${(LE(x) + dy).toFixed(1)}`;
  const valve = anim.valve[side];
  const flowing = valve > 0.5 && hot;
  const iceW = anim.slat[side];
  const k = side === "L" ? -1 : 1;
  const dx = k * 1.3 * lePos;
  const dy = -5.9 * lePos;
  const vx = m(232);
  const vy = LE(232) + 17;
  const nx = m(252);
  const iceCowl = anim.cowl[side === "L" ? 1 : 2];
  const flowAng = side === "L" ? -12.8 : 12.8;
  const supplyHot = hot;
  return (
    <g>
      {/* Krueger / inboard LE devices — no TAI */}
      <polygon points={`${P(270)} ${P(296)} ${P(296, 11)} ${P(270, 11)}`} fill="#1d242c" stroke="#4d5964" strokeWidth=".8" />
      {/* nacelle */}
      <rect x={nx - 14} y={116} width="28" height="58" rx="12" fill="#1b2129" stroke="#6f7c88" strokeWidth="1.2" />
      {cowlHeated && <ellipse cx={nx} cy="118" rx="15" ry="6" fill="none" stroke={HOT} strokeWidth="5" opacity=".6" filter="url(#irt-blur)" className="irt-pulse" />}
      <ellipse cx={nx} cy="118" rx="14" ry="5" fill="#0d1115" stroke={cowlHeated ? HOT : cowlOpen ? "#c98d44" : "#7a8794"} strokeWidth={cowlHeated ? 2.4 : 1.4} />
      {iceCowl > 0.02 && <ellipse cx={nx} cy="117" rx="15" ry="6" fill="none" stroke="#eaf6ff" strokeWidth={iceCowl * 4.5} opacity=".92" />}
      <text x={nx} y="108" fontSize="8" textAnchor="middle" fill="#8ea2b3" letterSpacing="1">ENG {side === "L" ? 1 : 2}</text>

      {/* pneumatic duct to the wing: fuselage → valve (hot whenever bleed air is available) */}
      <path d={`M320 ${(LE(296) + 17).toFixed(1)} L${P(296, 17)} L${vx},${vy.toFixed(1)}`} fill="none" stroke="#2c3743" strokeWidth="5" strokeLinecap="round" />
      <path d={`M320 ${(LE(296) + 17).toFixed(1)} L${P(296, 17)} L${vx},${vy.toFixed(1)}`} fill="none" stroke={supplyHot ? "#c8742a" : "#3f4b57"} strokeWidth="2" className={supplyHot ? "irt-flow" : undefined} />
      {/* TAI supply manifold behind the slats: valve → tip */}
      <path d={`M${vx},${vy.toFixed(1)} L${P(112, 17)}`} fill="none" stroke="#2c3743" strokeWidth="5" strokeLinecap="round" />
      <path d={`M${vx},${vy.toFixed(1)} L${P(112, 17)}`} fill="none" stroke={flowing ? HOT : "#3f4b57"} strokeWidth="2" className={flowing ? "irt-flow" : undefined} />

      {SLATS.map(([xa, xb], i) => {
        const xc = (xa + xb) / 2;
        return (
          <g key={i}>
            {/* telescoping duct follows the slat */}
            <line x1={m(xc)} y1={LE(xc) + 17} x2={m(xc) + dx} y2={LE(xc) + 5.5 + dy} stroke={flowing ? HOT : "#52606c"} strokeWidth="2.2" />
            <g transform={`translate(${dx} ${dy})`}>
              <polygon points={`${P(xa)} ${P(xb)} ${P(xb, 11)} ${P(xa, 11)}`} fill="#2a3340" stroke="#7a8794" strokeWidth="1" />
              {flowing && (
                <>
                  <polygon points={`${P(xa)} ${P(xb)} ${P(xb, 11)} ${P(xa, 11)}`} fill={HOT} opacity=".28" className="irt-pulse" />
                  <line x1={m(xa + 2)} y1={LE(xa + 2) + 5.5} x2={m(xb - 2)} y2={LE(xb - 2) + 5.5} stroke="#ffe2b8" strokeWidth="1.6" className="irt-flow" />
                </>
              )}
              {iceW > 0.02 && (
                <polygon
                  points={`${m(xa)},${(LE(xa) - iceW * 5).toFixed(1)} ${m(xb)},${(LE(xb) - iceW * 5).toFixed(1)} ${P(xb)} ${P(xa)}`}
                  fill="#eaf6ff"
                  opacity=".92"
                />
              )}
            </g>
          </g>
        );
      })}

      {/* TAI control valve — just outboard of the engine strut */}
      <g transform={`translate(${vx} ${vy.toFixed(1)})`}>
        <circle r="6.5" fill="#0f151b" stroke={valve > 0.97 ? "#3dd68c" : valve < 0.03 ? "#6c7884" : "#e0a84a"} strokeWidth="1.6" />
        <line x1="-7" y1="0" x2="7" y2="0" stroke="#d6dde3" strokeWidth="2" transform={`rotate(${flowAng + 90 * (1 - valve)})`} />
        <circle cx="0" cy="13" r="3.6" fill="#59b6ff" opacity={light === "off" ? 0.12 : light === "dim" ? 0.5 : 1} stroke="#2a4a63" strokeWidth=".8" className={light === "bright" ? "irt-pulse" : undefined} />
      </g>
    </g>
  );
}

export function WingAntiIcePlan({
  anim,
  lePos,
  hotAir,
  lights,
  cowlOpen,
  cowlHeated,
  inhibited = false,
}: {
  inhibited?: boolean;
  anim: IceState;
  lePos: number;
  hotAir: Record<Side, boolean>;
  lights: Record<Side, "off" | "dim" | "bright">;
  cowlOpen: { 1: boolean; 2: boolean };
  cowlHeated: { 1: boolean; 2: boolean };
}) {
  return (
    <svg
      viewBox="30 76 580 160"
      className="block h-auto w-full"
      role="img"
      aria-label="Wing thermal anti-ice — slats, telescoping ducts, control valves (plan view)"
    >
      <style>{ICE_CSS}</style>
      <Defs />
      <defs>
        <linearGradient id="irt-wing" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#66727e" />
          <stop offset="1" stopColor="#252b32" />
        </linearGradient>
      </defs>
      <path d="M320 50 C302 68 298 92 298 115 L298 300 C298 324 308 338 320 344 C332 338 342 324 342 300 L342 115 C342 92 338 68 320 50 Z" fill="url(#irt-wing)" stroke="#7d8995" strokeWidth="2" />
      <path d="M298 140 L55 195 L100 222 L298 205 Z" fill="url(#irt-wing)" stroke="#7d8995" strokeWidth="2" />
      <path d="M342 140 L585 195 L540 222 L342 205 Z" fill="url(#irt-wing)" stroke="#7d8995" strokeWidth="2" />
      <WingSide side="L" anim={anim} lePos={lePos} hot={hotAir.L} light={lights.L} cowlOpen={cowlOpen[1]} cowlHeated={cowlHeated[1]} />
      <WingSide side="R" anim={anim} lePos={lePos} hot={hotAir.R} light={lights.R} cowlOpen={cowlOpen[2]} cowlHeated={cowlHeated[2]} />
      <text x="70" y="226" fontSize="8" fill="#8ea2b3" letterSpacing="1">L WING · SLATS (TAI)</text>
      <text x="570" y="226" fontSize="8" fill="#8ea2b3" textAnchor="end" letterSpacing="1">R WING · SLATS (TAI)</text>
      <text x="320" y="176" fontSize="7" fill="#6e7d8a" textAnchor="middle">PNEU</text>
      {inhibited && (
        <g className="irt-pulse">
          <rect x="190" y="84" width="260" height="14" rx="3" fill="#2a1d08" stroke="#e0a84a" strokeWidth=".8" />
          <text x="320" y="94" fontSize="7.5" fill="#f0c066" textAnchor="middle" letterSpacing=".6">
            WING A/I INHIBITED ON GROUND · HOLD TEST OR SELECT AIRBORNE
          </text>
        </g>
      )}
    </svg>
  );
}

/* ───────────────────────────── probe heat (side view photo) ───────────────────────────── */

/**
 * Heat glow spots on /trainers/probe-heat-side-v2.jpg (1619 × 971). The nose probes are marked on the
 * zoomed inset; the vertical-stabilizer (elevator feel) pitot is marked on both its zoomed inset and
 * at its real position on the fin, just above the stabilizer root (the small red box on the side view).
 */
const PROBE_XY: { id: ProbeId[]; x: number; y: number; r: number }[] = [
  { id: ["capt"], x: 748, y: 592, r: 48 },
  { id: ["alphaL", "alphaR"], x: 826, y: 682, r: 38 },
  { id: ["fo"], x: 772, y: 748, r: 48 },
  { id: ["temp"], x: 915, y: 855, r: 36 },
  { id: ["elevL", "elevR"], x: 738, y: 116, r: 36 },
  { id: ["elevL", "elevR"], x: 1292, y: 213, r: 13 },
];

export function ProbeHeatDiagram({
  anim,
  heated,
}: {
  anim: IceState;
  heated: Record<ProbeId, boolean>;
}) {
  return (
    <svg
      viewBox="0 0 1619 971"
      className="block h-auto w-full"
      role="img"
      aria-label="Pitot, alpha vane, temperature probe and vertical stabilizer pitot heat"
    >
      <style>{ICE_CSS}</style>
      <Defs />
      <image href="/trainers/probe-heat-side-v2.jpg" width="1619" height="971" />
      {PROBE_XY.map((pr) => {
        const on = pr.id.some((i) => heated[i]);
        const ice = Math.max(...pr.id.map((i) => anim.probe[i]));
        const r = pr.r;
        return (
          <g key={`${pr.id.join()}-${pr.x}-${pr.y}`}>
            {on && <circle cx={pr.x} cy={pr.y} r={r * 1.7} fill="url(#irt-probe-glow)" className="irt-pulse" />}
            {ice > 0.02 && <circle cx={pr.x} cy={pr.y} r={4 + ice * r * 0.9} fill="#eaf6ff" stroke="#9fd3ff" strokeWidth="2" opacity=".95" />}
          </g>
        );
      })}
    </svg>
  );
}
