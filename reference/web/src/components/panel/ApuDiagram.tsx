import { useEffect, useId, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Animated APU cutaway for the APU trainer.
 *
 * Base art: public/apu/apu-diagram.webp (975 x 622, crop of the supplied
 * diagram, x/y below are in the ORIGINAL diagram's pixel space, so the SVG
 * viewBox starts at 20,12). public/apu/apu-diagram-cold.webp is the same art
 * with the orange/yellow "hot" colours turned to grey metal; it is cross-faded
 * over the power section so the combustor and exhaust only glow once the APU
 * is lit.
 *
 * Everything moving is driven by the sim:
 *   inlet door   -> louvers over the air-inlet plenum open as door 0..1
 *   fuel valve   -> fuel control unit + fuel line turn green / flow
 *   starter      -> starter pulses amber while engaged and turns the shaft
 *   rpm          -> shaft, both compressor impellers, both turbine wheels,
 *                   accessory gears, cooling fan and generator rotor turn
 *   airflow      -> dashes move through inlet, compressors, turbine, exhaust
 *   EGT          -> combustor + exhaust colour fade in, flame streaks move
 *   light-off    -> igniter sparks
 */

const IMG = { x: 20, y: 12, w: 975, h: 622 };
export const APU_DIAGRAM_SRC = "/apu/apu-diagram.webp";
export const APU_DIAGRAM_COLD_SRC = "/apu/apu-diagram-cold.webp";

const AXIS_Y = 294;
const TAU = Math.PI * 2;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const f = (v: number) => v.toFixed(1);
/** Visual revolutions per second (capped so blades never strobe). */
const visualRate = (pct: number) => (pct < 0.5 ? 0 : Math.min(0.6, 0.05 + pct * 0.0065));

export interface ApuDiagramProps {
  door: number; // 0..1
  fuel: number; // 0..1 fuel valve
  starter: boolean;
  rpm: number; // 0..100
  egt: number; // deg C
  oilPsi: number;
  bleed: number; // 0..1 bleed valve
  genOnBus: boolean;
  masterOff: boolean;
  jam: boolean;
  className?: string;
}

/* ---------------------------------------------------------------- rotors */

interface Rotor {
  key: string;
  x: number;
  R: number; // blade root radius
  h: number; // blade height
  c: number; // chord (axial extent)
  beta: number; // stagger, degrees
  n: number;
  phase: number;
  fill: string;
}

/** Section-view rotors: blades sweep up/down across the axis as they turn. */
const ROTORS: Rotor[] = [
  { key: "lc", x: 468, R: 26, h: 52, c: 22, beta: 28, n: 16, phase: 0.1, fill: "#e9f3fb" },
  { key: "ec", x: 672, R: 30, h: 56, c: 26, beta: 28, n: 16, phase: 0.4, fill: "#e9f3fb" },
  { key: "t1", x: 753, R: 36, h: 48, c: 15, beta: -30, n: 30, phase: 0.2, fill: "#f4efe6" },
  { key: "t2", x: 797, R: 36, h: 48, c: 15, beta: -30, n: 32, phase: 0.7, fill: "#f4efe6" },
];

function bladePath(r: Rotor, phi: number): string {
  const beta = (r.beta * Math.PI) / 180;
  const hc = r.c / 2;
  const dx = hc * Math.cos(beta);
  const tr = hc * Math.sin(beta);
  const R2 = r.R + r.h;
  let d = "";
  for (let i = 0; i < r.n; i++) {
    const th = phi + r.phase + (i * TAU) / r.n;
    const c = Math.cos(th);
    if (c <= 0.02) continue; // far side is hidden behind the hub in the section view
    const s = Math.sin(th);
    const ry = AXIS_Y + r.R * s;
    const ty = AXIS_Y + R2 * s;
    const t = tr * c;
    d += `M${f(r.x + dx)} ${f(ry + t)}L${f(r.x - dx)} ${f(ry - t)}L${f(r.x - dx * 0.7)} ${f(ty - t * 0.7)}L${f(r.x + dx * 0.7)} ${f(ty + t * 0.7)}Z`;
  }
  return d;
}

/** Shaft: longitudinal key marks that slide across its diameter as it turns. */
function shaftPath(phi: number, lift: number): string {
  let d = "";
  const R = 8;
  for (let k = 0; k < 6; k++) {
    const th = phi + (k * TAU) / 6;
    if (Math.cos(th) < 0.15) continue;
    const y = AXIS_Y + R * Math.sin(th) + lift;
    d += `M402 ${f(y)}L880 ${f(y)}`;
  }
  return d;
}

/** Small gear / fan glyph: spokes at angle phi around (cx,cy). */
function spokes(cx: number, cy: number, r: number, n: number, phi: number): string {
  let d = "";
  for (let i = 0; i < n; i++) {
    const a = phi + (i * TAU) / n;
    d += `M${f(cx)} ${f(cy)}L${f(cx + r * Math.cos(a))} ${f(cy + r * Math.sin(a))}`;
  }
  return d;
}

/* ------------------------------------------------------------ flow paths */

const AIR_PATHS = [
  "M598 418 C598 350 625 306 668 298", // plenum -> engine compressor eye
  "M580 418 C580 350 540 306 500 298", // plenum -> load compressor eye
  "M692 230 C700 205 708 190 730 178", // compressor discharge -> combustor (top)
  "M692 358 C700 383 708 398 730 410", // compressor discharge -> combustor (bottom)
];
const GAS_PATHS = [
  "M830 236 L976 232", // turbine exhaust, upper
  "M830 352 L976 356", // turbine exhaust, lower
  "M720 178 C760 165 805 175 828 215", // combustor gas -> turbine (top)
  "M720 410 C760 423 805 413 828 373", // combustor gas -> turbine (bottom)
];
const FUEL_PATH = "M106 334 L106 524 L705 524 L705 440";

const EXH_TOP = "811,222 977,207 977,262 900,262 811,250";
const EXH_BOT = "811,362 977,377 977,322 900,322 811,334";
const HOT_REGION = "M690 130 H990 V470 H690 Z";

function Tag({ x, y, label, value, tone = "text-neutral-900" }: { x: number; y: number; label: string; value?: string; tone?: string }) {
  return (
    <span
      className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-sm border border-black/25 bg-white/85 px-1 font-mono text-[6px] uppercase leading-[1.5] tracking-wide sm:text-[8px]"
      style={{ left: `${((x - IMG.x) / IMG.w) * 100}%`, top: `${((y - IMG.y) / IMG.h) * 100}%` }}
    >
      <span className="text-neutral-500">{label}</span>
      {value && <span className={cn("ml-1 font-semibold", tone)}>{value}</span>}
    </span>
  );
}

export function ApuDiagram({ door, fuel, starter, rpm, egt, oilPsi, bleed, genOnBus, masterOff, jam, className }: ApuDiagramProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const id = (s: string) => `${s}-${uid}`;

  const live = useRef({ rpm, egt, starter, door, fuel });
  live.current = { rpm, egt, starter, door, fuel };

  const els = useRef(new Map<string, SVGElement>());
  const reg = (k: string) => (el: SVGElement | null) => {
    if (el) els.current.set(k, el);
    else els.current.delete(k);
  };

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let phi = 0;
    let gear = 0;
    let dash = 0;
    let flame = 0;
    let drawn = NaN;
    const attr = (k: string, name: string, v: string) => els.current.get(k)?.setAttribute(name, v);
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const { rpm: r, egt: temp, starter: st } = live.current;
      const rate = visualRate(r);
      phi = (phi + rate * TAU * dt) % TAU;
      gear = (gear - rate * TAU * 1.6 * dt) % TAU;
      dash = (dash + (18 + r * 1.4) * (r > 0.5 ? 1 : 0) * dt) % 1000;
      flame = (flame + (30 + r * 2.2) * dt) % 1000;

      if (phi !== drawn) {
        for (const ro of ROTORS) attr(`rot-${ro.key}`, "d", bladePath(ro, phi));
        attr("shaft0", "d", shaftPath(phi, 0));
        attr("shaft1", "d", shaftPath(phi, 1.2));
        attr("genRotor", "d", spokes(52, 271, 11, 4, phi * 1.3));
        attr("fan", "d", spokes(172, 236, 12, 4, gear * 2.2));
        attr("gearA", "d", spokes(352, 385, 11, 8, gear));
        attr("gearB", "d", spokes(352, 412, 8, 6, -gear * 1.4 + 0.3));
        attr("starterRotor", "d", spokes(172, 196, 11, 3, st ? phi * 1.2 : gear * 0.3));
        drawn = phi;
      }
      // moving dashes
      for (const k of ["air0", "air1", "air2", "air3", "gas0", "gas1", "gas2", "gas3"]) attr(k, "stroke-dashoffset", (-dash).toFixed(1));
      attr("fuelLine", "stroke-dashoffset", (-dash * 0.6).toFixed(1));
      // flame streaks in the exhaust shift right
      attr("flameA", "transform", `translate(${(flame % 60).toFixed(1)} 0)`);
      // flicker
      const heatNow = clamp01((temp - 60) / 260);
      const flick = 0.85 + 0.15 * Math.sin(now / 53) * Math.sin(now / 137 + 1.1);
      attr("glow", "opacity", (heatNow * flick).toFixed(3));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const heat = clamp01((egt - 60) / 260);
  const doorOpen = door > 0.98;
  const fuelOpen = fuel > 0.95;
  const fuelMoving = fuel > 0.02 && fuel <= 0.95;
  const lightOff = !masterOff && rpm >= 25 && egt < 260;
  const airOn = rpm > 0.5 && door > 0.5;
  const gasOn = heat > 0.15;
  const oil = clamp01(oilPsi / 100);
  const doorTone = doorOpen ? "#2ea86a" : jam ? "#e5483a" : "#f0a020";

  return (
    <div
      className={cn("relative w-full overflow-hidden rounded-lg border border-[#343a42] bg-white", className)}
      style={{ aspectRatio: `${IMG.w} / ${IMG.h}` }}
      role="img"
      aria-label={`APU: ${Math.round(rpm)}% RPM, EGT ${Math.round(egt)} degrees C, inlet door ${Math.round(door * 100)}% open`}
    >
      <svg viewBox={`${IMG.x} ${IMG.y} ${IMG.w} ${IMG.h}`} className="absolute inset-0 h-full w-full">
        <defs>
          <radialGradient id={id("glow")}>
            <stop offset="0" stopColor="#fff6a8" stopOpacity="0.95" />
            <stop offset="0.45" stopColor="#ffc21f" stopOpacity="0.6" />
            <stop offset="1" stopColor="#ff6a00" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={id("spark")}>
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.4" stopColor="#7cc4ff" stopOpacity="0.9" />
            <stop offset="1" stopColor="#3b8cff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={id("streak")} x1="0" x2="1">
            <stop offset="0" stopColor="#fff2a8" stopOpacity="0" />
            <stop offset="0.5" stopColor="#fff2a8" stopOpacity="0.75" />
            <stop offset="1" stopColor="#fff2a8" stopOpacity="0" />
          </linearGradient>
          <clipPath id={id("hot")}>
            <path d={HOT_REGION} />
          </clipPath>
          <clipPath id={id("exh")}>
            <polygon points={EXH_TOP} />
            <polygon points={EXH_BOT} />
          </clipPath>
        </defs>

        {/* Base art + cold twin cross-faded over the power section */}
        <image href={APU_DIAGRAM_SRC} x={IMG.x} y={IMG.y} width={IMG.w} height={IMG.h} />
        <g clipPath={`url(#${id("hot")})`} opacity={1 - heat}>
          <image href={APU_DIAGRAM_COLD_SRC} x={IMG.x} y={IMG.y} width={IMG.w} height={IMG.h} />
        </g>

        {/* Inlet door: louvers over the air-inlet plenum, edge-on when open */}
        <g>
          {Array.from({ length: 9 }, (_, i) => {
            const hgt = 30 * (1 - door);
            const cy = 141 + i * 35;
            return hgt > 0.6 ? <rect key={i} x={520} y={cy - hgt / 2} width={122} height={hgt} rx={2} fill={jam ? "#7a2a26" : "#24303c"} opacity={0.82} /> : null;
          })}
          <rect x={517} y={124} width={128} height={322} rx={4} fill="none" stroke={doorTone} strokeWidth={3} opacity={masterOff && door < 0.02 ? 0.3 : 0.95} className={jam ? "animate-pulse" : undefined} />
        </g>

        {/* Fuel: control unit tint, line and flow */}
        <rect x={36} y={286} width={128} height={44} fill={fuelOpen ? "#2ea86a" : fuelMoving ? "#f0a020" : "none"} opacity={0.28} />
        <path d={FUEL_PATH} fill="none" stroke={fuelOpen ? "#2ea86a" : fuelMoving ? "#f0a020" : "transparent"} strokeWidth={4} strokeLinecap="round" opacity={0.85} />
        <path ref={reg("fuelLine")} d={FUEL_PATH} fill="none" stroke="#eaffef" strokeWidth={1.6} strokeDasharray="6 12" opacity={fuelOpen ? 0.9 : 0} />

        {/* Lube unit + oil tank: fill with oil pressure */}
        <rect x={166} y={286} width={132} height={44} fill="#2c7fd9" opacity={0.3 * oil} />
        <rect x={322} y={508 - 90 * oil} width={54} height={90 * oil} fill="#2c7fd9" opacity={0.28} />

        {/* Airflow (cold) and hot-gas flow */}
        <g fill="none" strokeLinecap="round" opacity={airOn ? 0.9 : 0}>
          {AIR_PATHS.map((d, i) => (
            <path key={i} ref={reg(`air${i}`)} d={d} stroke="#1f7fe0" strokeWidth={3.2} strokeDasharray="7 11" />
          ))}
        </g>
        <g fill="none" strokeLinecap="round" opacity={gasOn ? Math.min(1, heat + 0.2) : 0}>
          {GAS_PATHS.map((d, i) => (
            <path key={i} ref={reg(`gas${i}`)} d={d} stroke="#fff6c8" strokeWidth={3.2} strokeDasharray="8 12" />
          ))}
        </g>

        {/* Shaft (turns with the spool) */}
        <path ref={reg("shaft1")} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth={1.1} />
        <path ref={reg("shaft0")} fill="none" stroke="rgba(10,40,70,0.7)" strokeWidth={1.4} />

        {/* Rotor blades: load compressor, engine compressor, two turbine wheels */}
        {ROTORS.map((ro) => (
          <path key={ro.key} ref={reg(`rot-${ro.key}`)} fill={ro.fill} fillOpacity={0.82} stroke="#26323f" strokeWidth={0.7} strokeLinejoin="round" />
        ))}

        {/* Accessory drive: gears, generator rotor, cooling fan, starter */}
        <g fill="none" stroke="#3a3f47" strokeWidth={2} strokeLinecap="round">
          <circle cx={352} cy={385} r={12} strokeWidth={1.4} />
          <circle cx={352} cy={412} r={9} strokeWidth={1.4} />
          <path ref={reg("gearA")} />
          <path ref={reg("gearB")} />
          <circle cx={52} cy={271} r={12} strokeWidth={1.4} />
          <path ref={reg("genRotor")} />
          <circle cx={172} cy={236} r={13} strokeWidth={1.4} />
          <path ref={reg("fan")} />
          <circle cx={172} cy={196} r={13} strokeWidth={1.4} stroke={starter ? "#e08a00" : "#3a3f47"} />
          <path ref={reg("starterRotor")} stroke={starter ? "#e08a00" : "#3a3f47"} />
        </g>
        <rect x={152} y={178} width={168} height={36} rx={4} fill={starter ? "rgba(255,176,32,0.3)" : "none"} stroke={starter ? "#e08a00" : "transparent"} strokeWidth={3} className={starter ? "animate-pulse" : undefined} />
        <rect x={25} y={258} width={276} height={26} rx={3} fill={genOnBus ? "rgba(46,168,106,0.28)" : "none"} stroke={genOnBus ? "#2ea86a" : "transparent"} strokeWidth={2.5} />

        {/* Combustor glow (follows EGT), exhaust flame streaks, bleed air */}
        <g ref={reg("glow")} opacity={0}>
          <ellipse cx={772} cy={180} rx={74} ry={34} fill={`url(#${id("glow")})`} />
          <ellipse cx={772} cy={404} rx={74} ry={38} fill={`url(#${id("glow")})`} />
        </g>
        <g clipPath={`url(#${id("exh")})`} opacity={gasOn ? heat * 0.9 : 0}>
          <g ref={reg("flameA")}>
            {[-120, -60, 0, 60, 120].map((o) => (
              <g key={o}>
                <rect x={840 + o} y={205} width={46} height={44} fill={`url(#${id("streak")})`} />
                <rect x={840 + o + 24} y={336} width={46} height={44} fill={`url(#${id("streak")})`} />
              </g>
            ))}
          </g>
        </g>
        {bleed > 0.05 && (
          <path d="M695 168 L695 136 L640 136" fill="none" stroke="#1f9d62" strokeWidth={4} strokeLinecap="round" opacity={bleed} />
        )}

        {/* Igniter sparks at light-off (green plug at the combustor lower right) */}
        {lightOff && <circle cx={818} cy={408} r={26} fill={`url(#${id("spark")})`} className="animate-pulse" />}
      </svg>

      <Tag x={580} y={90} label="INLET DOOR" value={`${Math.round(door * 100)}%`} tone={doorOpen ? "text-emerald-700" : jam ? "text-red-600" : "text-amber-600"} />
      <Tag x={640} y={45} label="COMPRESSOR" value={`${Math.round(rpm)}%`} />
      <Tag x={770} y={450} label="COMBUSTOR" value={`${Math.round(egt)}°C`} tone={egt > 520 ? "text-red-600" : "text-neutral-900"} />
      <Tag x={106} y={345} label="FUEL VLV" value={fuelOpen ? "OPEN" : fuelMoving ? "OPENING" : "CLOSED"} tone={fuelOpen ? "text-emerald-700" : fuelMoving ? "text-amber-600" : "text-neutral-500"} />
      <Tag x={236} y={165} label="STARTER" value={starter ? "ENGAGED" : "OFF"} tone={starter ? "text-amber-600" : "text-neutral-500"} />
    </div>
  );
}
