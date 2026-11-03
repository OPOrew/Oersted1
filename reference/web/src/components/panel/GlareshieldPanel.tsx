import { useShallow } from "zustand/react/shallow";
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { useSimPick, useDerivedPick } from "@/lib/sim/store";
import { useMip } from "@/lib/sim/mipLocal";
import { usePedestal } from "@/lib/sim/pedestal";
import { afInterlocks } from "@/lib/sim/autoflight";
import { cn } from "@/lib/utils";

/**
 * 737-200 glareshield, rebuilt from the reference photograph (2172 px wide).
 * Every element is placed at the photograph's own pixel coordinates (NW x NH canvas, top lip at OY) and the whole
 * canvas is scaled to the requested housing width, so legends, knobs and lenses keep the photo's spacing and never overlap.
 *
 *   [MASTER CAUTION | FIRE WARN | W/S + annunciators] [FD controller L] [ autopilot controller ] [FD controller R] [annunciators + W/S | MASTER CAUTION | FIRE WARN]
 *
 * The captain FD controller and the autopilot controller drive useMip state; MainInstrumentPanel owns the live FD/SP-77 simulation.
 */

const NW = 2172; // photo width = design canvas width
const OY = 165; // photo y of the housing top lip
const NH = 345; // visible height of the housing (photo y 165..510)
const FONT = "'Arial Narrow','Roboto Condensed','Liberation Sans Narrow','Helvetica Neue',Arial,sans-serif";
const INK = "#e8e4d8";
const FD_DX = 1092; // right FD controller = left one shifted by this much

const Abs = ({ x, y, w, h, className, style, children }: { x: number; y: number; w?: number; h?: number; className?: string; style?: CSSProperties; children?: ReactNode }) => (
  <div className={cn("absolute", className)} style={{ left: x, top: y, width: w, height: h, ...style }}>{children}</div>
);

/** Printed legend, centred (or left / right anchored) on a point. */
function T({ x, y, children, size = 20, anchor = "c", color = INK, className, style }: { x: number; y: number; children: ReactNode; size?: number; anchor?: "c" | "l" | "r"; color?: string; className?: string; style?: CSSProperties }) {
  const tr = anchor === "c" ? "translate(-50%,-50%)" : anchor === "l" ? "translate(0,-50%)" : "translate(-100%,-50%)";
  return (
    <span className={cn("pointer-events-none absolute whitespace-pre text-center uppercase", className)}
      style={{ left: x, top: y, transform: tr, fontFamily: FONT, fontSize: size, fontWeight: 700, lineHeight: 1.05, letterSpacing: ".02em", fontStretch: "condensed", color, ...style }}>{children}</span>
  );
}

function Screw({ x, y, r = 14, rot = 0 }: { x: number; y: number; r?: number; rot?: number }) {
  return (
    <span className="pointer-events-none absolute rounded-full" style={{ left: x - r, top: y - r, width: r * 2, height: r * 2, background: "radial-gradient(circle at 35% 30%,#8d9195,#3d4044 55%,#17191c)", boxShadow: "0 2px 3px #000,inset 0 0 0 1.5px #0a0a0b" }}>
      <span className="absolute left-[14%] top-1/2 h-[3px] w-[72%] bg-black/85" style={{ transform: `translateY(-50%) rotate(${rot}deg)` }} />
      <span className="absolute left-[14%] top-1/2 h-[3px] w-[72%] bg-black/85" style={{ transform: `translateY(-50%) rotate(${rot + 90}deg)` }} />
    </span>
  );
}

/** Crinkle-finish black panel plate. */
function Plate({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <Abs x={x} y={y} w={w} h={h} className="rounded-[6px]"
      style={{ background: "radial-gradient(rgba(255,255,255,.05) 1px,transparent 1.6px) 0 0/7px 7px,radial-gradient(rgba(0,0,0,.55) 1px,transparent 1.6px) 3px 4px/9px 9px,linear-gradient(180deg,#1b1d21,#131518)", border: "2px solid #060708", boxShadow: "inset 0 0 0 2px rgba(255,255,255,.05),inset 0 0 26px #000,0 2px 6px rgba(0,0,0,.6)" }} />
  );
}

interface Mark { t: string; a: number; r?: number; s?: number }

/** Black ribbed rotary knob with printed legends at fixed angles; click or drag to pick the nearest detent. */
function Knob({ cx, cy, size, marks, value, onChange, pointer = "white", ticks = false, label, legendSize = 19 }: {
  cx: number; cy: number; size: number; marks: Mark[]; value: number; onChange: (v: number) => void; pointer?: "white" | "yellow"; ticks?: boolean; label: string; legendSize?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const n = marks.length;
  const pick = (x: number, y: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const a = (Math.atan2(x - (r.left + r.width / 2), -(y - (r.top + r.height / 2))) * 180) / Math.PI;
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(marks[i].a - a) < Math.abs(marks[best].a - a)) best = i;
    if (best !== value) onChange(best);
  };
  const cur = marks[Math.max(0, Math.min(n - 1, value))]?.a ?? 0;
  return (
    <>
      {marks.map((m, i) => {
        const a = (m.a * Math.PI) / 180;
        const sx = Math.sin(a), sy = -Math.cos(a);
        if (!m.t) {
          if (!ticks) return null;
          const big = i % 5 === 0;
          const rr = size / 2 + 9;
          return <span key={i} className="pointer-events-none absolute origin-center rounded-[1px] bg-[#cfcabb]" style={{ left: cx + rr * sx - 1.5, top: cy + rr * sy - (big ? 8 : 5), width: 3, height: big ? 16 : 10, transform: `rotate(${m.a}deg)` }} />;
        }
        const R = m.r ?? size / 2 + 26;
        return <T key={i} x={cx + R * sx} y={cy + R * sy} size={m.s ?? legendSize} anchor={sx > 0.3 ? "l" : sx < -0.3 ? "r" : "c"} color={i === value ? "#ffffff" : INK} style={i === value ? { textShadow: "0 0 6px rgba(255,255,255,.55)" } : undefined}>{m.t}</T>;
      })}
      <div ref={ref} role="slider" aria-label={label} aria-valuenow={value} aria-valuetext={marks[value]?.t.replace("\n", " ") || String(value)} aria-valuemin={0} aria-valuemax={n - 1} tabIndex={0}
        onKeyDown={(e) => { if (e.key === "ArrowRight" || e.key === "ArrowUp") onChange(Math.min(n - 1, value + 1)); if (e.key === "ArrowLeft" || e.key === "ArrowDown") onChange(Math.max(0, value - 1)); }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pick(e.clientX, e.clientY); }}
        onPointerMove={(e) => { if (e.buttons === 1) pick(e.clientX, e.clientY); }}
        className="absolute touch-none select-none rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7ab]"
        style={{ left: cx - size / 2, top: cy - size / 2, width: size, height: size, background: "repeating-conic-gradient(#2a2d31 0 4deg,#08090a 4deg 8deg)", border: "2px solid #2b2e33", boxShadow: "0 4px 8px rgba(0,0,0,.85),inset 0 0 0 5px #0a0b0d" }}>
        <span className="absolute rounded-full" style={{ inset: "17%", background: "radial-gradient(circle at 35% 28%,#34373c,#0c0d0f 68%)", boxShadow: "inset 0 0 8px #000,0 0 0 1px #000" }} />
        {pointer === "yellow"
          ? <span className="absolute left-1/2 top-1/2 origin-bottom" style={{ width: 20, height: size * 0.43, background: "#f2c200", clipPath: "polygon(0 0,100% 0,62% 100%,38% 100%)", transform: `translate(-50%,-100%) rotate(${cur}deg)` }} />
          : <span className="absolute left-1/2 top-1/2 origin-bottom rounded-[3px]" style={{ width: 6, height: size * 0.47, background: "#f1efe6", boxShadow: "0 0 3px rgba(0,0,0,.8)", transform: `translate(-50%,-100%) rotate(${cur}deg)` }} />}
      </div>
    </>
  );
}

/** Endless COURSE knob: drag around it to dial the selected course; the course shows in its centre window. */
function CourseKnob({ cx, cy, size, value, pw, onStep }: { cx: number; cy: number; size: number; value: number; pw: boolean; onStep: (d: number) => void }) {
  const last = useRef<{ a: number; acc: number } | null>(null);
  const angle = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return (Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) * 180) / Math.PI;
  };
  return (
    <div role="slider" aria-label="Selected course" aria-valuenow={value} tabIndex={0}
      onKeyDown={(e) => { if (e.key === "ArrowRight" || e.key === "ArrowUp") onStep(1); if (e.key === "ArrowLeft" || e.key === "ArrowDown") onStep(-1); }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); last.current = { a: angle(e), acc: 0 }; }}
      onPointerMove={(e) => {
        if (e.buttons !== 1 || !last.current) return;
        const a = angle(e);
        let dlt = a - last.current.a;
        if (dlt > 180) dlt -= 360;
        if (dlt < -180) dlt += 360;
        last.current.a = a;
        last.current.acc += dlt;
        const steps = Math.trunc(last.current.acc / 6);
        if (steps) { last.current.acc -= steps * 6; onStep(steps); }
      }}
      className="absolute flex touch-none select-none items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7ab]"
      style={{ left: cx - size / 2, top: cy - size / 2, width: size, height: size, background: "repeating-conic-gradient(#2a2d31 0 4deg,#08090a 4deg 8deg)", border: "2px solid #2b2e33", boxShadow: "0 4px 8px rgba(0,0,0,.85),inset 0 0 0 6px #0a0b0d" }}>
      <span className="flex items-center justify-center rounded-full font-mono font-bold tabular-nums" style={{ width: size * 0.62, height: size * 0.62, fontSize: 19, background: "radial-gradient(circle at 35% 28%,#202327,#050506 70%)", boxShadow: "inset 0 0 8px #000", color: pw ? "#f4f1e6" : "#2a2c30", textShadow: pw ? "0 0 6px rgba(255,255,255,.5)" : undefined }}>
        {String(Math.round(((value % 360) + 360) % 360)).padStart(3, "0")}
      </span>
    </div>
  );
}

/** Square HDG SEL push-button with the selected heading in its lens. Click = engage / release; drag up or down = set the heading. */
function HdgButton({ cx, cy, size, on, hdg, pw, onToggle, onStep }: { cx: number; cy: number; size: number; on: boolean; hdg: number; pw: boolean; onToggle: () => void; onStep: (d: number) => void }) {
  const st = useRef<{ y: number; acc: number; moved: boolean } | null>(null);
  return (
    <div role="button" aria-pressed={on} aria-label={`Heading select ${on ? "engaged" : "off"}, heading ${Math.round(hdg)}. Drag up or down to set the heading.`} tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onToggle(); if (e.key === "ArrowUp") onStep(1); if (e.key === "ArrowDown") onStep(-1); }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); st.current = { y: e.clientY, acc: 0, moved: false }; }}
      onPointerMove={(e) => {
        const s = st.current;
        if (!s || e.buttons !== 1) return;
        const dy = s.y - e.clientY;
        s.y = e.clientY;
        s.acc += dy;
        if (Math.abs(s.acc) > 3) s.moved = true;
        const steps = Math.trunc(s.acc / 3);
        if (steps && s.moved) { s.acc -= steps * 3; onStep(steps); }
      }}
      onPointerUp={() => { if (st.current && !st.current.moved) onToggle(); st.current = null; }}
      className="absolute touch-none select-none rounded-[4px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7ab]"
      style={{ left: cx - size / 2, top: cy - size / 2, width: size, height: size, background: "linear-gradient(180deg,#34373b,#17191c)", border: "2px solid #050607", boxShadow: "0 3px 6px rgba(0,0,0,.8),inset 0 0 0 3px #1c1e21" }}>
      <span className="absolute inset-[9px] flex items-center justify-center rounded-[3px] font-mono font-bold tabular-nums"
        style={{ fontSize: 17, background: pw && on ? "radial-gradient(circle,#ff5a4a,#b3140f)" : "radial-gradient(circle,#4a1210,#210807)", border: "2px solid #0a0303", color: pw && on ? "#fff" : "#8a3b36", boxShadow: pw && on ? "0 0 14px rgba(255,60,50,.8)" : "inset 0 0 8px #000" }}>
        {String(Math.round(((hdg % 360) + 360) % 360)).padStart(3, "0")}
      </span>
    </div>
  );
}

/** ALT HOLD solenoid toggle: silver bezel, red dome high = ON / low = OFF, yellow lamp below it lit while held. */
function AltHold({ cx, cy, on, pw, onToggle, label }: { cx: number; cy: number; on: boolean; pw: boolean; onToggle: () => void; label: string }) {
  return (
    <button type="button" aria-label={label} aria-pressed={on} onClick={onToggle}
      className="absolute rounded-full"
      style={{ left: cx - 28, top: cy - 28, width: 56, height: 56, background: "radial-gradient(circle,#0b0b0c 55%,#1a1b1d 56%)", border: "5px solid #b9bcc0", boxShadow: "0 3px 6px rgba(0,0,0,.8),inset 0 0 8px #000,inset 0 0 0 2px #6a6e73" }}>
      <span className="absolute left-1/2 rounded-full transition-[top] duration-150" style={{ width: 22, height: 22, marginLeft: -11, top: on ? 5 : 20, background: "radial-gradient(circle at 35% 30%,#ff6a55,#a3140d 70%)", boxShadow: "0 2px 4px rgba(0,0,0,.8)" }} />
      <span className="absolute left-1/2 rounded-full" style={{ width: 15, height: 15, marginLeft: -7.5, top: 32, background: on && pw ? "radial-gradient(circle at 35% 30%,#fff3a0,#ffd21a)" : "radial-gradient(circle at 35% 30%,#9a8420,#4d4210)", boxShadow: on && pw ? "0 0 10px #ffd21a" : undefined, opacity: on ? 1 : 0.9 }} />
    </button>
  );
}

/** One FD controller (Collins FD-108 style): MODE SEL knob, ALT HOLD toggle, PITCH CMD knob. Drawn at the left controller's coordinates; the caller shifts it. */
const FD_MARKS: Mark[] = [
  { t: "GA", a: -125, r: 62 }, { t: "OFF", a: -86, r: 62 }, { t: "HDG", a: -52, r: 76 },
  { t: "VOR\nLOC", a: -22, r: 84 }, { t: "AUTO\nAPP", a: 6, r: 90 }, { t: "MAN\nGS", a: 28, r: 62, s: 13 },
];
const PITCH_MARKS: Mark[] = Array.from({ length: 21 }, (_, i) => ({ t: "", a: -105 + (i / 20) * 210 }));

function FdController({ dx, mode, alt, pitch, pw, up, onMode, onAlt, onPitch, who }: {
  dx: number; mode: number; alt: boolean; pitch: number; pw: boolean; up: boolean; onMode: (v: number) => void; onAlt: (v: boolean) => void; onPitch: (v: number) => void; who: string;
}) {
  return (
    <div className="absolute" style={{ left: dx, top: 0, width: 0, height: 0 }}>
      <Plate x={348} y={212} w={314} h={276} />
      <Screw x={362} y={276} rot={20} /><Screw x={643} y={278} rot={70} /><Screw x={414} y={461} rot={40} /><Screw x={645} y={462} rot={10} /><Screw x={492} y={438} rot={55} />
      <Knob cx={440} cy={375} size={88} marks={FD_MARKS} value={mode} onChange={onMode} label={`${who} flight director mode select`} legendSize={17} />
      <T x={470} y={461} size={17}>MODE SEL</T>
      <T x={530} y={283} size={17}>ON</T>
      <AltHold cx={530} cy={322} on={alt} pw={pw} label={`${who} altitude hold ${alt ? "on" : "off"}`} onToggle={() => { if (alt || (up && mode !== 1)) onAlt(!alt); }} />
      <T x={530} y={376} size={17}>OFF</T>
      <T x={530} y={402} size={17}>ALT HOLD</T>
      <Knob cx={610} cy={370} size={92} marks={PITCH_MARKS} value={pitch + 10} onChange={(v) => onPitch(v - 10)} pointer="yellow" ticks label={`${who} pitch command`} />
      <T x={586} y={461} size={16}>PITCH CMD</T>
    </div>
  );
}

/** Rectangular backlit lens in a dark bezel. */
type Tone = "amber" | "red" | "grey";
function Lens({ x, y, w, h, tone, on, label, sub, size = 21, onClick, warn }: { x: number; y: number; w: number; h: number; tone: Tone; on: boolean; label: string; sub?: string; size?: number; onClick?: () => void; warn?: boolean }) {
  const look = (() => {
    if (tone === "red") return on ? { bg: "radial-gradient(circle at 50% 40%,#ff5d6a,#d4182b)", fg: "#fff", glow: "0 0 22px rgba(255,50,60,.9)" } : { bg: "linear-gradient(180deg,#a9172d,#86101f)", fg: "#f3d6da", glow: "none" };
    if (tone === "grey") return on ? (warn ? { bg: "radial-gradient(circle,#ff5a4a,#c4180f)", fg: "#fff", glow: "0 0 18px rgba(255,60,50,.9)" } : { bg: "radial-gradient(circle,#ffb53a,#f08a10)", fg: "#2a1400", glow: "0 0 18px rgba(255,160,30,.9)" }) : { bg: "linear-gradient(180deg,#4a4d51,#383b3f)", fg: INK, glow: "none" };
    return on ? { bg: "radial-gradient(circle at 50% 40%,#ffb94a,#f58a0c)", fg: "#2a1200", glow: "0 0 22px rgba(255,160,30,.95)" } : { bg: "linear-gradient(180deg,#d77c1a,#b9650f)", fg: "#3a1c06", glow: "none" };
  })();
  return (
    <Abs x={x} y={y} w={w} h={h}>
      <button type="button" onClick={onClick} className={cn("flex size-full flex-col items-center justify-center rounded-[4px] text-center uppercase active:translate-y-px", onClick ? "cursor-pointer" : "cursor-default")}
        style={{ background: look.bg, color: look.fg, boxShadow: `${look.glow === "none" ? "" : look.glow + ","}inset 0 0 0 3px rgba(0,0,0,.55),inset 0 0 0 4px rgba(255,255,255,.1),0 2px 4px rgba(0,0,0,.7)`, border: "2px solid #0b0c0d", fontFamily: FONT, fontWeight: 700, fontSize: size, lineHeight: 1.05, letterSpacing: ".03em" }}>
        <span className="whitespace-pre">{label}</span>
        {sub && <span className="whitespace-pre" style={{ fontSize: 10, marginTop: 3, color: tone === "red" ? "#f3d6da" : "#1c0d00" }}>{sub}</span>}
      </button>
    </Abs>
  );
}

/** AIL / ELEV engage paddle: a chrome bar lying in the DISENGAGED strip; swings up into the oval housing when engaged. */
function EngagePaddle({ ovalCx, barCx, on, label, onChange }: { ovalCx: number; barCx: number; on: boolean; label: string; onChange: (v: boolean) => void }) {
  const OV_W = 64, OV_H = 124, OV_Y = 263, BAR_W = 94, BAR_H = 28, BAR_Y = 411;
  const tx = on ? ovalCx : barCx, ty = on ? OV_Y + OV_H / 2 : BAR_Y;
  return (
    <>
      <Abs x={ovalCx - OV_W / 2} y={OV_Y} w={OV_W} h={OV_H} className="rounded-[32px]" style={{ background: "radial-gradient(ellipse at 50% 40%,#0a0b0c,#020203)", border: "3px solid #2a2d31", boxShadow: "inset 0 0 12px #000,0 2px 4px rgba(0,0,0,.7)" }}>
        <span className="absolute left-1/2 top-[14px] size-[6px] -translate-x-1/2 rounded-full" style={{ background: on ? "#ffb21a" : "#5a3d0c", boxShadow: on ? "0 0 8px #ffb21a" : undefined }} />
        <span className="absolute left-1/2 top-[26px] h-[72px] w-[14px] -translate-x-1/2 rounded-[7px] bg-[#050506]" style={{ boxShadow: "inset 0 0 5px #000,0 0 0 1px #17191b" }} />
      </Abs>
      <button type="button" aria-label={`${label} channel ${on ? "engaged" : "disengaged"}`} aria-pressed={on} onClick={() => onChange(!on)}
        className="absolute rounded-[14px] transition-all duration-200"
        style={{ left: tx - BAR_W / 2, top: ty - BAR_H / 2, width: BAR_W, height: BAR_H, transform: `rotate(${on ? -90 : 0}deg)`, background: "linear-gradient(180deg,#f2f3f4,#9a9ea3 55%,#d8dadc)", border: "1px solid #4d5156", boxShadow: "0 3px 6px rgba(0,0,0,.8)" }}>
        <span className="absolute left-[3px] top-1/2 size-[14px] -translate-y-1/2 rounded-full bg-[#f4f4ef]" style={{ boxShadow: "0 0 3px rgba(0,0,0,.6)" }} />
      </button>
    </>
  );
}

const AP_NAV_MARKS: Mark[] = [
  { t: "MAN", a: 0, r: 80, s: 15 }, { t: "VOR\nLOC", a: 28, r: 78, s: 15 }, { t: "AUTO\nAPP", a: 55, r: 68, s: 15 }, { t: "MAN\nG/S", a: 86, r: 62, s: 15 },
];
const AP_PITCH_MARKS: Mark[] = [{ t: "TURB", a: -48, r: 80, s: 16 }, { t: "OFF", a: 0, r: 90, s: 17 }, { t: "ALT\nHOLD", a: 36, r: 88, s: 16 }];

export function Glareshield({ width }: { width: number }) {
  const s = useSimPick("antiIce1", "antiIce2", "bleedTrip1", "bleedTrip2", "faults", "ltTest", "packTripL", "packTripR");
  const d = useDerivedPick("apuFireWarn", "apuLowOil", "bleed13Available1", "bleed13Available2", "cargoAftFireWarn", "cargoFwdFireWarn", "dcPower", "doorWarning", "eltTransmitting", "engine1FireWarn", "engine2FireWarn", "fuelLowPressure1", "fuelLowPressure2", "hydALow", "hydB", "hydBLow", "masterCaution", "wheelWellFireWarn");
  const m = useMip();
  const ped = usePedestal(useShallow((st) => ({ bellSilenced: st.bellSilenced, fireTest: st.fireTest, set: st.set })));
  const pw = !!d.dcPower;

  /* Aural/visual warning logic per AMM 26 / FCOM fire test:
     OVHT/FIRE TEST → FIRE WARN + MASTER CAUTION (+ panel OVERHEAT / handles / WHEEL WELL + bell)
     FAULT/INOP TEST → MASTER CAUTION only (FAULT / APU DET INOP on panel; no bell / no FIRE WARN) */
  const fire = d.engine1FireWarn || d.engine2FireWarn || d.apuFireWarn || d.wheelWellFireWarn || d.cargoFwdFireWarn || d.cargoAftFireWarn;
  const fireTestOvht = ped.fireTest === "OVHT_FIRE";
  const fireTestFault = ped.fireTest === "FAULT";
  const fireOn = !!(pw && ((fire && !ped.bellSilenced) || fireTestOvht));
  const caution = !!d.masterCaution && !m.masterCautionAck;
  useEffect(() => { if (!d.masterCaution && m.masterCautionAck) m.set({ masterCautionAck: false }); }, [d.masterCaution, m.masterCautionAck]); // eslint-disable-line react-hooks/exhaustive-deps
  const mcOn = !!(pw && (caution || m.recall || s.ltTest || m.lightKey === 2 || fireTestOvht || fireTestFault));
  const wsOn = !!(pw && (s.ltTest || m.raTest || m.lightKey === 2));
  const ackMc = () => m.set({ masterCautionAck: true, recall: false });
  const silence = () => ped.set({ bellSilenced: true });

  /* system annunciators: lit by their system fault, or by the light test */
  const test = !!(pw && (s.ltTest || m.recall || m.lightKey === 2 || m.annTest === 1));
  const sys = (on: boolean) => !!(pw && (on || test));
  const aFlt = sys(!!d.hydALow && !!d.hydBLow);
  const aApu = sys(!!d.apuLowOil || !!s.faults.apuDoorJam);
  const aFuel = sys(!!d.fuelLowPressure1 || !!d.fuelLowPressure2);
  const aOvht = sys(!!s.faults.packOverheat || !!s.faults.packOverheatR || fireTestFault);
  const aHyd = sys(!!d.hydALow || !!d.hydBLow);
  const aOvhd = sys(!!s.bleedTrip1 || !!s.bleedTrip2);
  const aAir = sys(!!s.packTripL || !!s.packTripR);
  // Amber system lights now driven by real derived conditions (plus lamp test).
  // ELT: transmitting (manual ON or auto on impact/overrun).
  // DOORS: door-warning circuit active (one or more monitored doors open).
  // ANTI ICE: wing/engine anti-ice selected without adequate bleed, or probe-heat failure.
  const aElt = sys(!!d.eltTransmitting);
  const aDoors = sys(!!d.doorWarning);
  const antiIceProblem = (!!s.antiIce1 && !d.bleed13Available1) || (!!s.antiIce2 && !d.bleed13Available2) || !!s.faults.alphaVaneHeatFailureL || !!s.faults.alphaVaneHeatFailureR;
  const aAntiIce = sys(antiIceProblem);
  const aOnlyTest = sys(false); // blank lenses still test-only

  const plant = { pw, hydB: Number(d.hydB ?? 0) >= 1500, attOk: !m.fail.att, hdgOk: !m.fail.hdg };
  const il = afInterlocks(plant);
  const fdUp = pw && !m.fail.fd && !m.fail.att;
  const engage = (k: "apAil" | "apElev", v: boolean) => { if (!v || il) m.set({ [k]: v } as Partial<typeof m>); }; // switch is latched DISENGAGED unless the interlocks are met
  const stepMod = (key: "selCrs" | "selHdg", dlt: number) => m.set({ [key]: (((m[key] + dlt) % 360) + 360) % 360 } as Partial<typeof m>);
  const inopL = !!(pw && (m.fail.fd || m.fail.att));
  const inopR = !!(pw && !il);

  const K = Math.min(width, 1360) / NW; // housing is never wider than 1360 design px
  const W = NW * K, H = NH * K;
  const inop = (x: number, on: boolean) => (
    <Abs x={x} y={225} w={64} h={32} className="flex items-center justify-center" style={{ border: `2px solid ${on ? "#ffb21a" : "#e8e4d8"}`, boxShadow: on ? "0 0 10px rgba(255,178,26,.7)" : undefined }}>
      <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 20, letterSpacing: ".05em", color: on ? "#ffb21a" : INK }}>INOP</span>
    </Abs>
  );

  return (
    <div className="relative" style={{ width, height: H + 16 }}>
      <div className="absolute inset-0 shadow-[inset_0_6px_14px_rgba(0,0,0,.6)]" style={{ background: "linear-gradient(180deg,#2a2f36,#1d2127 70%,#111316)", clipPath: "polygon(8% 0,92% 0,100% 52%,100% 100%,0 100%,0 52%)" }} />
      <div className="absolute" style={{ left: (width - W) / 2, top: 8, width: W, height: H }}>
        <div className="absolute left-0 top-0 origin-top-left" style={{ width: NW, height: OY + NH + 10, transform: `scale(${K}) translateY(${-OY}px)` }}>
          {/* housing: sloped wings, raised centre, rolled black top lip, cream end trim */}
          <Abs x={0} y={0} w={NW} h={OY + NH + 10} style={{ clipPath: "polygon(0 242px,660px 174px,672px 165px,1410px 165px,1422px 174px,2172px 242px,2172px 508px,0 508px)", background: "linear-gradient(180deg,#0a0b0d 0,#0a0b0d 200px,#0e1013 215px,#0c0d10)" , boxShadow: "inset 0 0 40px #000" }} />
          <Abs x={0} y={0} w={NW} h={OY + NH + 10} style={{ clipPath: "polygon(0 242px,660px 174px,672px 165px,1410px 165px,1422px 174px,2172px 242px,2172px 262px,1422px 196px,1410px 189px,672px 189px,660px 196px,0 262px)", background: "linear-gradient(180deg,#2a2d31,#07080a 40%,#16181b)" }} />
          <Abs x={0} y={244} w={14} h={264} style={{ background: "linear-gradient(90deg,#d9cba8,#8d7f61)" }} />
          <Abs x={NW - 14} y={244} w={14} h={264} style={{ background: "linear-gradient(270deg,#d9cba8,#8d7f61)" }} />
          <Abs x={0} y={494} w={NW} h={14} style={{ background: "linear-gradient(180deg,#0e1013,#050607)" }} />
          <Abs x={0} y={494} w={46} h={14} style={{ background: "linear-gradient(180deg,#cdbf9c,#7d7055)" }} />
          <Abs x={NW - 46} y={494} w={46} h={14} style={{ background: "linear-gradient(180deg,#cdbf9c,#7d7055)" }} />

          {/* ───── left warning cluster ───── */}
          <Abs x={14} y={248} w={326} h={252} className="rounded-[4px]" style={{ background: "linear-gradient(180deg,#14161a,#0d0f12)", boxShadow: "inset 0 0 18px #000" }} />
          <Screw x={35} y={298} rot={30} /><Screw x={27} y={430} rot={75} />
          <Lens x={60} y={255} w={84} h={80} tone="amber" on={mcOn} label={"MASTER\nCAUTION"} sub="PUSH TO RESET" size={16} onClick={ackMc} />
          <Lens x={156} y={255} w={90} h={80} tone="red" on={fireOn} label={"FIRE\nWARN"} sub="BELL CUTOUT" size={23} onClick={silence} />
          <Lens x={52} y={353} w={88} h={62} tone="grey" warn on={wsOn} label={"W/S\nWARNING"} size={17} />
          <Lens x={52} y={425} w={88} h={62} tone="grey" on={wsOn} label={"W/S\nCAUTION"} size={17} />
          <Lens x={152} y={347} w={92} h={41} tone="amber" on={aFlt} label="FLT CONT" size={19} />
          <Lens x={254} y={347} w={84} h={41} tone="amber" on={aElt} label="ELT" size={20} />
          <Lens x={152} y={397} w={92} h={41} tone="amber" on={aOnlyTest} label="" />
          <Lens x={254} y={397} w={84} h={41} tone="amber" on={aApu} label="APU" size={20} />
          <Lens x={152} y={447} w={92} h={41} tone="amber" on={aFuel} label="FUEL" size={20} />
          <Lens x={254} y={447} w={84} h={41} tone="amber" on={aOvht} label="OVHT/DET" size={15} />

          {/* ───── captain FD controller ───── */}
          <FdController dx={0} who="Captain" mode={m.fdMode} alt={m.fdAlt} pitch={m.fdPitch} pw={pw} up={fdUp}
            onMode={(v) => m.set({ fdMode: v })} onAlt={(v) => m.set({ fdAlt: v })} onPitch={(v) => m.set({ fdPitch: v })} />

          {/* ───── centre autopilot controller (Sperry SP-77) ───── */}
          <Plate x={672} y={212} w={736} h={268} />
          {[[690, 237], [690, 349], [690, 454], [1258, 237], [1388, 237], [1390, 349], [1388, 454], [857, 441], [975, 455]].map(([x, y], i) => <Screw key={i} x={x} y={y} rot={i * 41 + 12} />)}
          <button type="button" aria-label="Autopilot disengage warning light (press to reset)" onClick={() => m.set({ apWarn: false })}
            className={cn("absolute rounded-[3px] border border-[#3a0d0a] text-white", pw && m.apWarn ? "animate-pulse bg-[#ff3b30] shadow-[0_0_12px_#ff3b30]" : "bg-[#5a1612]")}
            style={{ left: 713, top: 222, width: 46, height: 24, fontFamily: FONT, fontWeight: 700, fontSize: 13, lineHeight: 1 }}>A/P DISC</button>
          <Knob cx={780} cy={350} size={116} marks={AP_NAV_MARKS} value={m.apNav} onChange={(v) => m.set({ apNav: v })} label="Autopilot navigation mode" />
          {inop(845, inopL)}{inop(927, inopR)}
          <Abs x={917} y={218} w={2} h={40} style={{ background: INK, opacity: 0.8 }} />
          <CourseKnob cx={925} cy={308} size={80} value={m.selCrs} pw={pw} onStep={(k) => stepMod("selCrs", k)} />
          <T x={925} y={366} size={17}>COURSE</T>
          <HdgButton cx={925} cy={414} size={66} on={m.apHdgSw === 2} hdg={m.selHdg} pw={pw}
            onToggle={() => m.set({ apHdgSw: m.apHdgSw === 2 ? 1 : 2 })} onStep={(k) => stepMod("selHdg", k)} />
          <T x={925} y={460} size={17}>HDG SEL</T>
          <T x={1115} y={237} size={18}>ENGAGED</T>
          <Abs x={1000} y={256} w={230} h={2} style={{ background: INK, opacity: 0.8 }} />
          <Abs x={1112} y={256} w={2} h={84} style={{ background: INK, opacity: 0.8 }} />
          <EngagePaddle ovalCx={1040} barCx={1058} on={m.apAil} label="AIL" onChange={(v) => engage("apAil", v)} />
          <EngagePaddle ovalCx={1180} barCx={1166} on={m.apElev} label="ELEV" onChange={(v) => engage("apElev", v)} />
          <T x={1030} y={455} size={16}>AIL</T>
          <T x={1110} y={455} size={15}>DISENGAGED</T>
          <T x={1196} y={455} size={16}>ELEV</T>
          <Knob cx={1303} cy={350} size={116} marks={AP_PITCH_MARKS} value={m.apPitch} onChange={(v) => m.set({ apPitch: v })} label="Autopilot pitch mode" />
          <span className="pointer-events-none absolute" style={{ left: 1262, top: 292, borderLeft: "7px solid transparent", borderRight: "7px solid transparent", borderTop: "11px solid #e8e4d8" }} />
          <span className="pointer-events-none absolute" style={{ left: 1332, top: 292, borderLeft: "7px solid transparent", borderRight: "7px solid transparent", borderTop: "11px solid #e8e4d8" }} />

          {/* ───── first-officer FD controller ───── */}
          <FdController dx={FD_DX} who="First officer" mode={m.fdMode2} alt={m.fdAlt2} pitch={m.fdPitch2} pw={pw} up={fdUp}
            onMode={(v) => m.set({ fdMode2: v })} onAlt={(v) => m.set({ fdAlt2: v })} onPitch={(v) => m.set({ fdPitch2: v })} />

          {/* ───── right warning cluster ───── */}
          <Abs x={1782} y={248} w={376} h={252} className="rounded-[4px]" style={{ background: "linear-gradient(180deg,#14161a,#0d0f12)", boxShadow: "inset 0 0 18px #000" }} />
          <Screw x={1793} y={276} rot={50} /><Screw x={2130} y={298} rot={15} />
          <Lens x={1855} y={255} w={90} h={80} tone="amber" on={mcOn} label={"MASTER\nCAUTION"} sub="PUSH TO RESET" size={16} onClick={ackMc} />
          <Lens x={1966} y={255} w={90} h={80} tone="red" on={fireOn} label={"FIRE\nWARN"} sub="BELL CUTOUT" size={23} onClick={silence} />
          <Lens x={1792} y={348} w={113} h={42} tone="amber" on={aAntiIce} label="ANTI ICE" size={20} />
          <Lens x={1917} y={348} w={113} h={42} tone="amber" on={aOnlyTest} label="" />
          <Lens x={1792} y={397} w={113} h={42} tone="amber" on={aHyd} label="HYD" size={22} />
          <Lens x={1917} y={397} w={113} h={42} tone="amber" on={aOvhd} label="OVERHEAD" size={19} />
          <Lens x={1792} y={447} w={113} h={42} tone="amber" on={aDoors} label="DOORS" size={22} />
          <Lens x={1917} y={447} w={113} h={42} tone="amber" on={aAir} label="AIR COND" size={19} />
          <Lens x={2050} y={353} w={92} h={62} tone="grey" warn on={wsOn} label={"W/S\nWARNING"} size={17} />
          <Lens x={2050} y={425} w={92} h={62} tone="grey" on={wsOn} label={"W/S\nCAUTION"} size={17} />
        </div>
      </div>
    </div>
  );
}
