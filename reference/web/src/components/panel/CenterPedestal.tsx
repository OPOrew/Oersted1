import { useShallow } from "zustand/react/shallow";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useDerived, useSim, useSimPick, useDerivedPick } from "@/lib/sim/store";
import { usePedestal, type CargoDet, type OvhtDet } from "@/lib/sim/pedestal";
import { useMip } from "@/lib/sim/mipLocal";
import { ACTIVE_FLIGHT_PLAN_EVENT, readActiveFlightPlan, type ActiveFlightPlan } from "@/lib/sim/activeFlightPlan";
import { FLIGHT_NAV_STATE_EVENT, readFlightNavigationState, type FlightNavigationState } from "@/lib/sim/flightNavigation";
import { useOverheadLocal } from "@/lib/sim/overheadLocal";
import { Annun, Knob, Lamp, LEGEND, Plate, PushButton, Selector3, SpringSwitch, Toggle, TuneKnob } from "@/components/panel/PedestalParts";
import { cn } from "@/lib/utils";
import { WxrScope, WXR_RANGES } from "@/components/panel/PrimusWxr";

/**
 * Interactive 737-200 centre pedestal (P8), laid out on a stage that uses the reference photograph's own pixel coordinates
 * (photo x minus OX, photo y as is) so every unit sits where it does on the real pedestal:
 *
 *   TOP DECK   : FreeFlight GPS / blank / VHF COMM / CVR (left)  |  TCAS-WX radar (centre)  |  blank / blank / transponder / blank (right)
 *   STAND      : stab-trim wheels (L + R), speed-brake lever, thrust levers 1+2 with A/T DISENGAGE caps and reverse claws, FLAP quadrant
 *                and lever, PARKING BRAKE handle + light, HORN CUTOUT, STAB TRIM light, engine start levers, stab-trim position strip
 *   FIRE PANEL : DISCH 1 / APU / DISCH 2 handles, overheat + wheel-well + bottle lamps, bell cutout, test / override switches
 *   RADIOS     : VHF 1 | VHF 2, NAV 1 | NAV 2, ADF | amber display
 *   LOWER PLATE: PANEL / FLOOD knobs, big RUDDER TRIM knob, AILERON TRIM switches, STAB BRAKE RELEASE pull knob, STAB drum
 *
 * Wired to the systems model (useSim): thrust levers, reversers, start levers, flaps, speed brake, parking brake, engine / APU fire handles,
 * fire bottles, cargo fire, pedestal lighting. Everything else keeps its state in usePedestal / useMip / useOverheadLocal.
 * Controls that exist in the simulation but are not on the photographed pedestal live in the "Other pedestal functions" drawer below the stage.
 */

const OX = 175; // photo x of the stage's left edge
const STAGE_W = 700;
const STAGE_H = 1642;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const ang = (el: HTMLElement, x: number, y: number) => {
  const r = el.getBoundingClientRect();
  return (Math.atan2(x - (r.left + r.width / 2), -(y - (r.top + r.height / 2))) * 180) / Math.PI;
};

/* paint ---------------------------------------------------------------- */
const PL = "relative rounded-[2px] border border-[#1c2220] bg-[linear-gradient(155deg,#6b7871,#58655f_55%,#4b5752)] shadow-[inset_0_1px_0_rgba(255,255,255,.18),inset_0_-3px_8px_rgba(0,0,0,.4),0_2px_5px_rgba(0,0,0,.55)]";
const PL_DARK = "relative rounded-[2px] border border-[#101316] bg-[linear-gradient(155deg,#323941,#1d2126)] shadow-[inset_0_0_10px_#000,0_2px_5px_rgba(0,0,0,.55)]";
const CREAM = "bg-[linear-gradient(180deg,#f4eedc,#cfc8ac)]";
const TINY = cn(LEGEND, "text-[6px] leading-none");

function Box({ x, y, w, h, className, children, z }: { x: number; y: number; w: number; h?: number; className?: string; children?: ReactNode; z?: number }) {
  return <div className={cn("absolute", className)} style={{ left: x - OX, top: y, width: w, height: h, zIndex: z }}>{children}</div>;
}

function Rivets({ inset = 3 }: { inset?: number }) {
  const c = "pointer-events-none absolute size-[6px] rounded-full border border-[#3a1f0a] bg-[radial-gradient(circle_at_35%_30%,#dc9150,#7a3f14)]";
  return (
    <>
      <span className={c} style={{ left: inset, top: inset }} />
      <span className={c} style={{ right: inset, top: inset }} />
      <span className={c} style={{ left: inset, bottom: inset }} />
      <span className={c} style={{ right: inset, bottom: inset }} />
    </>
  );
}

function RepeatButton({ label, onTick, className, ms = 70 }: { label: ReactNode; onTick: () => void; className?: string; ms?: number }) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const cb = useRef(onTick);
  cb.current = onTick;
  const stop = () => { if (timer.current) clearInterval(timer.current); timer.current = null; };
  useEffect(() => stop, []);
  return (
    <button
      type="button"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); cb.current(); stop(); timer.current = setInterval(() => cb.current(), ms); }}
      onPointerUp={stop}
      onPointerCancel={stop}
      className={cn("rounded-[2px] border border-[#15171a] bg-[linear-gradient(180deg,#3d4146,#1d2024)] px-1.5 py-1 font-mono text-[8px] font-bold uppercase leading-tight text-[#e6e1d2] shadow-[0_2px_3px_rgba(0,0,0,.6)] active:brightness-125", className)}
    >
      {label}
    </button>
  );
}

/* generic persisted knob / switch state (usePedestal.knobs / .sw) */
function useKnobState(key: string, def: number): [number, (v: number) => void] {
  const v = usePedestal((s) => s.knobs[key] ?? def);
  return [v, (n: number) => usePedestal.setState((s) => ({ knobs: { ...s.knobs, [key]: n } }))];
}
function useSwState(key: string, def: boolean): [boolean, (v: boolean) => void] {
  const v = usePedestal((s) => s.sw[key] ?? def);
  return [v, (n: boolean) => usePedestal.setState((s) => ({ sw: { ...s.sw, [key]: n } }))];
}

/** Small bat-handle toggle (latched, 2 positions). */
/** Tiny engraved legend; sized inline so it never depends on generated utility classes. */
function Tiny({ children, dim, style }: { children: ReactNode; dim?: boolean; style?: CSSProperties }) {
  return <span className={LEGEND} style={{ fontSize: 6, lineHeight: 1, whiteSpace: "nowrap", opacity: dim ? 0.5 : 1, ...style }}>{children}</span>;
}

/** Small bat-handle toggle (latched, 2 positions). */
function Bat({ on, onChange, up, down, aria, tone = "#e2e4e6" }: { on: boolean; onChange: (v: boolean) => void; up?: string; down?: string; aria: string; tone?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
      {up ? <Tiny dim={!on}>{up}</Tiny> : null}
      <button type="button" aria-label={`${aria} ${on ? up ?? "UP" : down ?? "DOWN"}`} aria-pressed={on} onClick={() => onChange(!on)} style={{ position: "relative", width: 17, height: 30, padding: 0, borderRadius: 2, border: "1px solid #101316", background: "#14161a", boxShadow: "inset 0 0 4px #000" }}>
        <span style={{ position: "absolute", left: "50%", top: "50%", width: 7, height: 7, marginLeft: -3.5, marginTop: -3.5, borderRadius: "50%", border: "1px solid #050607", background: "radial-gradient(circle at 35% 30%,#b9bdc2,#4a4e53)" }} />
        <span style={{ position: "absolute", left: "50%", top: "50%", width: 5, height: 13, transformOrigin: "top center", transform: `translate(-50%,0) rotate(${on ? 180 : 0}deg)`, transition: "transform .15s", borderRadius: "0 0 2px 2px", border: "1px solid #050607", boxShadow: "0 2px 3px rgba(0,0,0,.8)", background: `linear-gradient(90deg,#8a8e93,${tone} 50%,#6a6e73)` }} />
      </button>
      {down ? <Tiny dim={on}>{down}</Tiny> : null}
    </div>
  );
}

/** Small 3-position tilt toggle (cycles A / NORM / B). */
function Bat3({ options, value, onChange, label, labels }: { options: [string, string, string]; value: string; onChange: (v: string) => void; label?: string; labels?: [string, string, string] }) {
  const i = Math.max(0, options.indexOf(value));
  const rot = [-42, 0, 42][i];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
      <div style={{ display: "flex", width: 60, alignItems: "flex-end", justifyContent: "space-between" }}>
        {options.map((o, k) => (
          <button key={o} type="button" tabIndex={-1} onClick={() => onChange(o)} style={{ padding: 0 }}><Tiny dim={k !== i}>{labels ? labels[k] : o === "NORMAL" || o === "NORM" ? "N" : o}</Tiny></button>
        ))}
      </div>
      <button type="button" aria-label={`${label ?? "selector"} ${value}`} onClick={() => onChange(options[(i + 1) % 3])} style={{ position: "relative", width: 34, height: 24, padding: 0, borderRadius: 2, border: "1px solid #101316", background: "#14161a", boxShadow: "inset 0 0 4px #000" }}>
        <span style={{ position: "absolute", left: "50%", top: 3, width: 7, height: 7, marginLeft: -3.5, borderRadius: "50%", border: "1px solid #050607", background: "radial-gradient(circle at 35% 30%,#b9bdc2,#4a4e53)" }} />
        <span style={{ position: "absolute", left: "50%", top: 5, width: 5, height: 15, transformOrigin: "top center", transform: `translate(-50%,0) rotate(${rot}deg)`, transition: "transform .15s", borderRadius: "0 0 2px 2px", border: "1px solid #050607", background: "linear-gradient(90deg,#8a8e93,#e2e4e6 50%,#6a6e73)" }} />
      </button>
      {label ? <Tiny>{label}</Tiny> : null}
    </div>
  );
}

/** Black ribbed rotary knob with a white pointer, -135..135 deg range, optional printed legends. */
function BlackKnob({ size, value, min = 0, max = 1, step = 0, onChange, ticks, aria, onDouble }: { size: number; value: number; min?: number; max?: number; step?: number; onChange: (v: number) => void; ticks?: string[]; aria: string; onDouble?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const a = -135 + clamp((value - min) / (max - min || 1), 0, 1) * 270;
  const set = (x: number, y: number) => {
    if (!ref.current) return;
    const g = clamp(ang(ref.current, x, y), -135, 135);
    let v = min + ((g + 135) / 270) * (max - min);
    if (step) v = Math.round(v / step) * step;
    onChange(clamp(v, min, max));
  };
  return (
    <div
      ref={ref}
      role="slider"
      aria-label={aria}
      aria-valuenow={value}
      onDoubleClick={onDouble}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); set(e.clientX, e.clientY); }}
      onPointerMove={(e) => { if (e.buttons === 1) set(e.clientX, e.clientY); }}
      className="relative touch-none select-none rounded-full border-2 border-[#050607] shadow-[0_5px_10px_rgba(0,0,0,.75),inset_0_0_0_5px_#15171a]"
      style={{ width: size, height: size, backgroundImage: "repeating-conic-gradient(from 0deg,rgba(255,255,255,.1) 0 4deg,transparent 4deg 12deg),radial-gradient(circle at 42% 36%,#4b4e53 0,#1b1d20 45%,#0a0b0c 80%)" }}
    >
      {/* dished centre */}
      <span className="pointer-events-none absolute rounded-full shadow-[inset_0_4px_10px_rgba(0,0,0,.7),inset_0_-2px_4px_rgba(255,255,255,.08)]" style={{ inset: size * 0.1, background: "radial-gradient(circle at 45% 38%,#3a3d41,#16181b 70%)" }} />
      <span className="pointer-events-none absolute left-1/2 top-1/2 size-0" style={{ transform: `rotate(${a}deg)` }}>
        <span className="absolute rounded-full bg-[#ece7d6]" style={{ width: 7, height: 7, left: -3.5, top: -size / 2 + 5 }} />
      </span>
      {ticks?.map((t, i) => {
        const g = ((-135 + (i / Math.max(1, ticks.length - 1)) * 270) * Math.PI) / 180;
        const R = size / 2 + 10;
        return <span key={t + i} className={cn(TINY, "pointer-events-none absolute whitespace-nowrap")} style={{ left: size / 2 + R * Math.sin(g), top: size / 2 - R * Math.cos(g), transform: "translate(-50%,-50%)" }}>{t}</span>;
      })}
    </div>
  );
}

/** Chipped lime paint blobs, as on the real panels. */
function Chips({ className }: { className?: string }) {
  const c = "rgba(196,210,128,.5)";
  return (
    <span
      className={cn("pointer-events-none absolute inset-0 rounded-[2px]", className)}
      style={{ backgroundImage: `radial-gradient(circle at 12% 18%,${c} 0 6px,transparent 7px),radial-gradient(circle at 84% 72%,${c} 0 5px,transparent 6px),radial-gradient(circle at 38% 90%,${c} 0 3px,transparent 4px),radial-gradient(circle at 93% 10%,${c} 0 3px,transparent 4px),radial-gradient(circle at 60% 30%,rgba(150,120,80,.18) 0 9px,transparent 10px)` }}
    />
  );
}

/** Black engraved legend plate. */
function Lbl({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex items-center justify-center rounded-[2px] border border-[#2b2e32] bg-[#0b0c0e] px-1 py-[2px] text-center font-mono text-[6px] font-bold uppercase leading-[7px] text-[#d4d0c0] shadow-[inset_0_0_4px_#000]", className)}>{children}</div>;
}

/** Black-glass annunciator lens: engraved text when dark, lit colour when on. */
const LENS_ON: Record<"amber" | "red" | "green", CSSProperties> = {
  amber: { background: "#e9a93a", borderColor: "#a8741a", color: "#2a1b00", boxShadow: "0 0 10px rgba(233,169,58,.7)" },
  red: { background: "#e03a3a", borderColor: "#8c1c1c", color: "#fff", boxShadow: "0 0 10px rgba(224,58,58,.75)" },
  green: { background: "#38d27a", borderColor: "#1d7a45", color: "#03230f", boxShadow: "0 0 10px rgba(56,210,122,.65)" },
};
function Lens({ label, on, tone = "amber", style }: { label: ReactNode; on: boolean; tone?: "amber" | "red" | "green"; style?: CSSProperties }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 3px", boxSizing: "border-box", borderRadius: 2, border: "1px solid #2a2d31", fontFamily: "ui-monospace,Menlo,monospace", fontSize: 6, fontWeight: 700, lineHeight: "7px", textTransform: "uppercase", ...(on ? LENS_ON[tone] : { background: "linear-gradient(180deg,#16181b,#08090a)", color: "#6a6f75", boxShadow: "inset 0 0 0 2px #08090a,inset 0 0 0 3px #2c3034" }), ...style }}>{label}</div>
  );
}

/** Rolling drum counter window (white digits on black); `hot` adds the yellow standby line. */
function DrumWin({ value, lit, w = 72 }: { value: string; lit: boolean; w?: number }) {
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", width: w, height: 24, border: "2px solid #0a0b0c", borderRadius: 2, background: "#000", color: "#f1f1ea", fontFamily: "ui-monospace,Menlo,monospace", fontWeight: 700, fontSize: 15, fontVariantNumeric: "tabular-nums", boxShadow: "inset 0 0 6px #000" }}>
      <span key={lit ? value : "off"} style={{ animation: "pedroll .18s ease-out" }}>{lit ? value : "-----"}</span>
      <span style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(180deg,rgba(0,0,0,.6),transparent 30%,transparent 70%,rgba(0,0,0,.6))" }} />
    </div>
  );
}

/** Concentric tuning knob: outer ring + inner knob, each emitting steps. */
function DualTune({ size = 44, onOuter, onInner, label }: { size?: number; onOuter: (d: 1 | -1) => void; onInner: (d: 1 | -1) => void; label?: string }) {
  return (
    <div className="flex flex-col items-center gap-[1px]">
      <div className="relative" style={{ width: size, height: size }}>
        <TuneKnob size={size} onStep={onOuter} />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"><TuneKnob size={Math.round(size * 0.52)} onStep={onInner} /></div>
      </div>
      {label && <span className={TINY}>{label}</span>}
    </div>
  );
}

/** Push-to-test lamp (black bezel, green when pressed). */
function TestLamp({ pw, label }: { pw: boolean; label?: string }) {
  const [on, setOn] = useState(false);
  const lit = pw && on;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
      <button type="button" aria-label={`${label ?? "lamp"} test`} onPointerDown={() => setOn(true)} onPointerUp={() => setOn(false)} onPointerLeave={() => setOn(false)} style={{ width: 13, height: 13, padding: 0, borderRadius: "50%", border: "2px solid #050607", background: lit ? "#38d27a" : "#0d0f10", boxShadow: lit ? "0 0 8px #38d27a" : "inset 0 0 3px #000" }} />
      {label ? <Tiny>{label}</Tiny> : null}
    </div>
  );
}

/** Silver knob with a pointer, -135..135 deg; all geometry inline. */
function MiniKnob({ size = 26, value, min = 0, max = 1, step = 0, onChange, aria }: { size?: number; value: number; min?: number; max?: number; step?: number; onChange: (v: number) => void; aria: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const a = -135 + clamp((value - min) / (max - min || 1), 0, 1) * 270;
  const set = (x: number, y: number) => {
    if (!ref.current) return;
    const g = clamp(ang(ref.current, x, y), -135, 135);
    let v = min + ((g + 135) / 270) * (max - min);
    if (step) v = Math.round(v / step) * step;
    onChange(clamp(v, min, max));
  };
  return (
    <div
      ref={ref}
      role="slider"
      aria-label={aria}
      aria-valuenow={value}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); set(e.clientX, e.clientY); }}
      onPointerMove={(e) => { if (e.buttons === 1) set(e.clientX, e.clientY); }}
      style={{ position: "relative", width: size, height: size, borderRadius: "50%", border: "1px solid #6c6e72", touchAction: "none", userSelect: "none", background: "radial-gradient(circle at 35% 30%,#ececec,#a9abae 45%,#6c6e72)", boxShadow: "0 3px 6px rgba(0,0,0,.6),inset 0 -3px 5px rgba(0,0,0,.3)" }}
    >
      <span style={{ position: "absolute", left: "50%", top: "50%", width: 2, height: size * 0.42, marginLeft: -1, marginTop: -size * 0.42, transformOrigin: "bottom center", transform: `rotate(${a}deg)`, background: "#1a1c1f", borderRadius: 1 }} />
    </div>
  );
}

const ROW: CSSProperties = { display: "flex", flexDirection: "column", alignItems: "center", gap: 5 };
/** Three-column radio face: [left half] [centre column] [right half], laid out with inline grid. */
function UnitGrid({ left, mid, right, midW = 46 }: { left: ReactNode; mid: ReactNode; right: ReactNode; midW?: number }) {
  return (
    <div style={{ position: "absolute", inset: "9px 8px", display: "grid", gridTemplateColumns: `1fr ${midW}px 1fr` }}>
      <div style={ROW}>{left}</div>
      <div style={{ ...ROW, justifyContent: "space-between", gap: 0 }}>{mid}</div>
      <div style={ROW}>{right}</div>
    </div>
  );
}

/* ════════════════════════════ TOP DECK ════════════════════════════ */

const GPS_KEYS = ["NAV", "WPT", "APT/VOR", "D→", "FPL", "CALC", "AUX", "MSG"];
const GPS_TEXT: Record<string, string> = {
  NAV: "NAV  NO ACTIVE WPT", WPT: "WPT  ----", "APT/VOR": "NEAREST APT  ----", "D→": "DIRECT TO  ----",
  FPL: "FPL 0  EMPTY", CALC: "CALC  GS / TAS / WIND", AUX: "AUX  SETUP", MSG: "NO MESSAGES",
};
function GpsUnit() {
  const m = useMip();
  const p = usePedestal();
  const [activePlan, setActivePlan] = useState<ActiveFlightPlan | null>(null);
  const [navState, setNavState] = useState<FlightNavigationState | null>(null);
  const page = p.gpsPage in GPS_TEXT ? p.gpsPage : "NAV";
  useEffect(() => {
    const refresh = () => { setActivePlan(readActiveFlightPlan()); setNavState(readFlightNavigationState()); };
    refresh();
    window.addEventListener(ACTIVE_FLIGHT_PLAN_EVENT, refresh);
    window.addEventListener(FLIGHT_NAV_STATE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(ACTIVE_FLIGHT_PLAN_EVENT, refresh);
      window.removeEventListener(FLIGHT_NAV_STATE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  const firstWaypoint = activePlan?.waypoints?.[0];
  const fmtRange = (n: number | null | undefined) => n == null || !Number.isFinite(n) ? "---.-NM" : `${n.toFixed(1)}NM`;
  const gpsLines = activePlan ? {
    NAV: [`NAV ${activePlan.departure} > ${activePlan.destination}`, `${navState?.phase ?? "PLAN ACTIVE"} · HDG ${(navState?.headingDeg ?? 0).toFixed(0).padStart(3, "0")}`],
    WPT: [`TO ${navState?.activeLegName ?? firstWaypoint?.name ?? activePlan.destination}`, `BRG ${navState?.bearingToNextDeg == null ? "---" : navState.bearingToNextDeg.toFixed(0).padStart(3, "0")} · ${fmtRange(navState?.distanceToNextNm)}`, `DTK ${navState?.desiredTrackDeg == null ? "---" : navState.desiredTrackDeg.toFixed(0).padStart(3, "0")} · XTK ${navState?.crossTrackNm == null ? "---" : `${navState.crossTrackNm >= 0 ? "R" : "L"}${Math.abs(navState.crossTrackNm).toFixed(1)}`}NM`],
    "APT/VOR": [`${activePlan.departure} > ${activePlan.destination}`, `ALT ${activePlan.alternate || "----"}`],
    "D→": [`DEST ${activePlan.destination}`, `RNG ${fmtRange(navState?.distanceToDestinationNm)}`],
    FPL: [`FPL ${activePlan.departure} > ${activePlan.destination}`, `LEG ${(navState?.activeLegIndex ?? 0) + 1} · ${activePlan.waypoints.length} FIX`, `PROC ${activePlan.procedureStatus === "chart-checked" ? "USER CHECKED" : "UNVERIFIED"}`],
    CALC: [`GS ${(navState?.groundSpeedKt ?? 0).toFixed(0)} KT · HDG ${(navState?.headingDeg ?? 0).toFixed(0).padStart(3, "0")}`, `ALT ${Math.round(navState?.altitudeFt ?? 0)} FT`, `TRK ERR ${navState?.trackErrorDeg == null ? "---" : `${navState.trackErrorDeg >= 0 ? "+" : ""}${navState.trackErrorDeg.toFixed(0)}`}°`],
    AUX: ["AIRCRAFT POSITION", `${(navState?.latitude ?? 0).toFixed(3)}, ${(navState?.longitude ?? 0).toFixed(3)}`],
    MSG: [activePlan.procedureStatus === "chart-checked" ? "USER MARKED CHECKED" : "PROCEDURES UNVERIFIED", navState?.positionMode === "MOVING WITH SIMULATED AIRCRAFT" ? "POS TRACKING ACTIVE" : "POSITION NOT MOVING"],
  } as Record<string, string[]> : null;
  return (
    <div className={cn(PL_DARK, "h-full w-full p-2")}>
      <Rivets />
      <div className="absolute left-3 top-1 font-display text-[12px] font-bold italic text-white">FreeFlight</div>
      <div className="absolute left-3 top-[18px] flex h-[42px] w-[132px] flex-col items-center justify-center overflow-hidden rounded-[2px] border-2 border-[#3a342a] bg-[#1b1710] px-1 text-center font-mono text-[8px] leading-tight text-[#ffb21a] shadow-[inset_0_0_10px_#000]">
        {m.gpsOn && (gpsLines ? (gpsLines[page] ?? [GPS_TEXT[page]]).map((line, index) => <div key={`${page}-${index}`} className="max-w-full truncate">{line}</div>) : GPS_TEXT[page])}
      </div>
      <button type="button" aria-label="GPS ENT" onClick={() => m.gpsOn && p.set({ gpsPage: "NAV" })} className="absolute right-4 top-[14px] h-[18px] w-[34px] rounded-[2px] border border-[#8a4a10] bg-[#e08a2e] font-mono text-[8px] font-bold text-[#2a1200] shadow-[0_2px_2px_rgba(0,0,0,.6)] active:translate-y-px">ENT</button>
      <div className="absolute right-3 top-[36px]">
        <Knob size={26} min={0} max={1} step={1} value={m.gpsOn ? 1 : 0} onChange={(v) => m.set({ gpsOn: v > 0.5 })} ticks={["OFF", "ON"]} compact />
      </div>
      <div className="absolute inset-x-2 bottom-2 grid grid-cols-4 gap-1">
        {GPS_KEYS.map((k) => (
          <button key={k} type="button" onClick={() => m.gpsOn && p.set({ gpsPage: k })} className={cn("rounded-[2px] border border-[#8a4a10] bg-[#e08a2e] py-[3px] font-mono text-[7px] font-bold text-[#2a1200] shadow-[0_2px_2px_rgba(0,0,0,.6)] active:translate-y-px", m.gpsOn && page === k && "brightness-125 ring-1 ring-white/70")}>{k}</button>
        ))}
      </div>
    </div>
  );
}

const rf = (v: number) => (v / 100).toFixed(2);
/** VHF COMM window: kHz -> MHz with the 0.005 digit not shown (AMM 23-21-0). */
const vhfWin = (kHz: number) => (Math.floor(kHz / 10) / 100).toFixed(2);
function VhfCommTop() {
  const m = useMip();
  const d = useDerivedPick("dcPower");
  const step = (key: "comAct" | "comStby", dir: 1 | -1) => m.set({ [key]: clamp(m[key] + dir * 5, 11800, 13595) } as never);
  const win = (v: number, hot?: boolean) => (
    <div className={cn("rounded-[2px] border-2 border-[#101316] px-1 py-0.5 text-center font-mono text-[15px] font-bold tabular-nums", hot ? "bg-[#e9e6dc] text-[#111]" : "bg-black text-[#f1f1ea]")}>{d.dcPower ? rf(v) : "---.--"}</div>
  );
  return (
    <div className={cn(PL, "h-full w-full")}>
      <Rivets />
      <span className={cn(TINY, "absolute left-3 top-[4px]")}>VHF 3 · SIM ONLY</span>
      <div className="absolute left-1/2 top-1 -translate-x-1/2"><Bat on={false} onChange={() => m.set({ comAct: m.comStby, comStby: m.comAct })} aria="VHF 3 transfer" up="" down="" /></div>
      <span className={cn(TINY, "absolute left-1/2 top-[36px] -translate-x-1/2")}>TFR</span>
      <div className="absolute left-4 top-[16px] w-[70px]">{win(m.comAct)}</div>
      <div className="absolute right-4 top-[16px] w-[70px]">{win(m.comStby, true)}</div>
      <div className="absolute bottom-2 left-6"><TuneKnob size={36} onStep={(dd) => step("comAct", dd)} /></div>
      <div className="absolute bottom-2 right-6"><TuneKnob size={36} onStep={(dd) => step("comStby", dd)} /></div>
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 flex-col items-center gap-0.5">
        <span className={TINY}>COMM</span>
        <PushButton label="TEST" onPress={() => m.set({ comTest: true })} onRelease={() => m.set({ comTest: false })} active={m.comTest} />
      </div>
    </div>
  );
}

function CvrUnit() {
  const s = useSim();
  const d = useDerived();
  const [erase, setErase] = useState(false); // UI lamp for the modeled bulk-erase interval
  const hold = useRef<{ t: number; ok: boolean } | null>(null);
  const tmr = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (tmr.current) clearTimeout(tmr.current); }, []);
  // AMM 23-71 trainer interlock: on ground, parking brake set, DC available and recorder operative.
  const allowed = () => d.cvrPowered && d.dcPower && s.wow && s.parkingBrake && !s.faults.cvrFailure;
  const erasePress = () => {
    if (hold.current) return;
    hold.current = { t: Date.now(), ok: allowed() };
    if (!hold.current.ok) s.patch({ cvrErase: false }, "CVR ERASE inhibited — requires ground, parking brake, DC power and an operative recorder.");
  };
  const eraseRelease = () => {
    const h = hold.current;
    hold.current = null;
    if (!h || !h.ok) return;
    if (Date.now() - h.t < 2000) { s.patch({ cvrErase: false }, "CVR ERASE — hold the pushbutton for at least 2 seconds."); return; }
    setErase(true);
    s.patch({ cvrErase: true, cvrMemoryErased: false }, "CVR bulk erase running — trainer indication for an 8-second erase interval.");
    if (tmr.current) clearTimeout(tmr.current);
    tmr.current = setTimeout(() => { setErase(false); s.patch({ cvrErase: false }, "CVR bulk erase interval complete."); }, 8000);
  };
  return (
    <div className={cn(PL, "h-full w-full")}>
      <Rivets />
      <span className="absolute left-4 top-3 size-[58px] rounded-full border-4 border-[#7a4a2a] bg-[radial-gradient(circle,#8a5a38_0_30%,#3a2a20_32%_100%)] shadow-[inset_0_0_8px_#000]" title="area microphone" />
      <div className="absolute left-[86px] top-4 size-[58px] rounded-full border-4 border-[#c9ccd0] bg-[#d8d6cc] shadow-[inset_0_0_6px_rgba(0,0,0,.4)]">
        <span className="absolute bottom-[10px] left-1/2 h-[24px] w-[2px] origin-bottom bg-[#222] transition-transform duration-300" style={{ transform: `translateX(-50%) rotate(${d.cvrPowered && s.cvrTest ? 40 : -45}deg)` }} />
        <span className="absolute bottom-[6px] left-1/2 size-[7px] -translate-x-1/2 rounded-full bg-[#333]" />
      </div>
      <div className="absolute right-4 top-3 flex flex-col items-center gap-1">
        <div className="flex items-center gap-1"><Lamp on={d.cvrPowered && s.cvrTest} tone="green" size={8} /><PushButton label="TEST" onPress={() => s.patch({ cvrTest: true }, "CVR TEST") } onRelease={() => s.patch({ cvrTest: false })} /></div>
        <div className="flex items-center gap-1"><Lamp on={erase} tone="amber" size={8} /><PushButton label="ERASE" onPress={erasePress} onRelease={eraseRelease} className="border-[#8a4a10] bg-[linear-gradient(180deg,#e08a2e,#a85f14)] text-[#2a1200]" /></div>
      </div>
      <span className={cn(TINY, "absolute bottom-2 left-3")}>COCKPIT VOICE RECORDER</span>
    </div>
  );
}

/** Latched pushbutton with a lit legend (Primus 90 indicator keys). */
function WxrKey({ label, on, onClick, aria }: { label: string; on: boolean; onClick: () => void; aria: string }) {
  return (
    <button type="button" aria-label={aria} aria-pressed={on} onClick={onClick} className={cn("h-[18px] flex-1 rounded-[2px] border border-[#15171a] font-mono text-[7px] font-bold uppercase leading-none shadow-[0_2px_3px_rgba(0,0,0,.6)] active:translate-y-px", on ? "bg-[linear-gradient(180deg,#2a2d31,#14161a)] text-[#7fe8a0] shadow-[inset_0_0_4px_#000]" : "bg-[linear-gradient(180deg,#4a4e53,#2a2d31)] text-[#e6e1d2]")}>{label}</button>
  );
}

/** Sperry Primus 90 weather radar indicator (AMM 34-41-01). */
function RadarUnit() {
  const m = useMip(useShallow((st) => ({ radarAzim: st.radarAzim, radarFrz: st.radarFrz, radarGain: st.radarGain, radarInt: st.radarInt, radarMode: st.radarMode, radarRange: st.radarRange, radarSector: st.radarSector, radarStab: st.radarStab, radarTgt: st.radarTgt, radarTilt: st.radarTilt, set: st.set })));
  return (
    <div className={cn(PL, "h-full w-full")}>
      <Rivets />
      <div className="absolute inset-x-[10px] top-[6px] flex items-start justify-between">
        <Knob size={24} min={0} max={6} step={1} value={m.radarRange} onChange={(v) => m.set({ radarRange: v })} ticks={[...WXR_RANGES]} label="RANGE" compact />
        <Knob size={24} min={-15} max={15} step={1} value={m.radarTilt} onChange={(v) => m.set({ radarTilt: v })} label={`TILT ${m.radarTilt > 0 ? "+" : ""}${m.radarTilt}`} compact />
        <Knob size={24} min={0} max={1} value={m.radarGain} onChange={(v) => m.set({ radarGain: v < 0.08 ? 0 : v })} ticks={["PRESET", "MAX"]} label="GAIN" compact />
        <Knob size={24} min={0} max={1} value={m.radarInt} onChange={(v) => m.set({ radarInt: v })} label="INT" compact />
      </div>
      <WxrScope className="absolute left-[22px] top-[62px] h-[150px] w-[196px] rounded-[10px] border-[5px] border-[#2a323a] shadow-[inset_0_0_18px_#000]" />
      <div className="absolute inset-x-[14px] top-[218px] flex gap-1">
        {([["STBY", 1], ["WX", 2], ["CYC", 3], ["MAP", 4]] as const).map(([l, i]) => (
          <WxrKey key={l} label={l} aria={`Radar mode ${l}`} on={m.radarMode === i} onClick={() => m.set({ radarMode: m.radarMode === i ? 0 : i })} />
        ))}
      </div>
      <div className="absolute inset-x-[14px] top-[240px] flex gap-1">
        <WxrKey label="FRZ" aria="Radar freeze" on={m.radarFrz} onClick={() => m.set({ radarFrz: !m.radarFrz })} />
        <WxrKey label="AZIM" aria="Radar azimuth marks" on={m.radarAzim} onClick={() => m.set({ radarAzim: !m.radarAzim })} />
        <WxrKey label="SEC SCAN" aria="Radar sector scan" on={m.radarSector} onClick={() => m.set({ radarSector: !m.radarSector })} />
        <WxrKey label="TGT" aria="Radar target alert" on={m.radarTgt} onClick={() => m.set({ radarTgt: !m.radarTgt })} />
        <WxrKey label="STAB" aria="Radar stabilization" on={m.radarStab} onClick={() => m.set({ radarStab: !m.radarStab })} />
      </div>
    </div>
  );
}

const XPDR_MODES = ["STBY", "ALT OFF", "ALT ON", "TEST"];
function TransponderUnit() {
  const m = useMip(useShallow((st) => ({ atcSel: st.atcSel, set: st.set, xpdrCode: st.xpdrCode, xpdrMode: st.xpdrMode })));
  const d = useDerivedPick("dcPower");
  const [ident, setIdent] = useState(false);
  const pair = (k: 0 | 2, dir: 1 | -1) => {
    const c = m.xpdrCode.padStart(4, "0");
    const nxt = (parseInt(c.slice(k, k + 2), 8) + dir + 64) % 64;
    m.set({ xpdrCode: c.slice(0, k) + nxt.toString(8).padStart(2, "0") + c.slice(k + 2) });
  };
  const fail = d.dcPower && m.xpdrMode === 3;
  return (
    <div className={cn(PL, "h-full w-full")}>
      <Rivets />
      <div className="absolute left-3 top-3"><Knob size={28} min={0} max={3} step={1} value={m.xpdrMode} onChange={(v) => m.set({ xpdrMode: v })} ticks={XPDR_MODES} compact /></div>
      <div className={cn("absolute left-[88px] top-[8px] flex h-[34px] w-[56px] items-center justify-center rounded-[3px] border-2 border-[#3a0f0c] text-center font-mono text-[7px] font-bold leading-tight", fail ? "bg-[#e03a3a] text-white shadow-[0_0_10px_#e03a3a]" : "bg-[#5a1410] text-[#a84a40]")}>ATC<br />FAIL</div>
      <div className="absolute right-3 top-[8px] rounded-[3px] border-2 border-[#101316] bg-[#2a0c0a] px-1.5 py-1 font-mono text-[14px] font-bold tabular-nums text-[#ff7a5a]">{d.dcPower ? m.xpdrCode : "----"}</div>
      <div className="absolute bottom-3 left-5"><TuneKnob size={30} onStep={(dd) => pair(0, dd)} /></div>
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2"><PushButton label="IDENT" active={ident} onPress={() => { setIdent(true); setTimeout(() => setIdent(false), 3000); }} /></div>
      <div className="absolute bottom-3 right-5"><TuneKnob size={30} onStep={(dd) => pair(2, dd)} /></div>
      <div className="absolute bottom-3 right-[58px]"><Bat on={m.atcSel === 1} onChange={(v) => m.set({ atcSel: v ? 1 : 2 })} up="1" down="2" aria="ATC select" /></div>
    </div>
  );
}

function BlankPlate() {
  return <div className={cn(PL, "h-full w-full")}><Rivets /><Chips /></div>;
}

function TopDeck() {
  return (
    <>
      <Box x={185} y={8} w={675} h={522} className="rounded-[4px] border border-[#0d1013] bg-[linear-gradient(180deg,#3b434b,#2a3037)] shadow-[inset_0_0_30px_rgba(0,0,0,.6)]" />
      <Box x={200} y={45} w={210} h={135}><GpsUnit /></Box>
      <Box x={195} y={186} w={215} h={66}><BlankPlate /></Box>
      <Box x={195} y={256} w={197} h={114}><VhfCommTop /></Box>
      <Box x={190} y={374} w={202} h={96}><CvrUnit /></Box>
      <Box x={420} y={18} w={240} h={282}><RadarUnit /></Box>
      <Box x={665} y={15} w={190} h={100}><BlankPlate /></Box>
      <Box x={665} y={121} w={190} h={100}><BlankPlate /></Box>
      <Box x={665} y={227} w={190} h={102}><TransponderUnit /></Box>
    </>
  );
}

/* ════════════════════════════ CONTROL STAND ════════════════════════════ */

const LEV_TOP = 430; // handle-centre photo y at full thrust
const LEV_IDLE = 566; // handle-centre photo y at idle

/** Two-position lever in a vertical slot: drag or tap. value=true -> upper position. */
function Detent2({ value, onChange, w, h, hw, hh, handle, aria }: { value: boolean; onChange: (v: boolean) => void; w: number; h: number; hw: number; hh: number; handle: ReactNode; aria: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  const pick = (cy: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const up = cy - r.top < r.height / 2;
    if (up !== value) onChange(up);
  };
  return (
    <div
      ref={ref}
      role="switch"
      aria-label={aria}
      aria-checked={value}
      className="relative touch-none select-none rounded-[3px] border border-[#050607] bg-[#0b0c0e] shadow-[inset_0_0_8px_#000]"
      style={{ width: w, height: h }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); moved.current = false; }}
      onPointerMove={(e) => { if (e.buttons === 1) { moved.current = true; pick(e.clientY); } }}
      onPointerUp={() => { if (!moved.current) onChange(!value); }}
    >
      <div className="absolute inset-y-1 left-1/2 w-[5px] -translate-x-1/2 rounded-full bg-[#020303]" />
      <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 transition-[top] duration-150" style={{ width: hw, height: hh, top: value ? 3 : h - hh - 3 }}>{handle}</div>
    </div>
  );
}

/** Parking brake T-handle: drag up to pull (it follows the finger and latches past half travel), drag down to stow, or tap to toggle. */
function ParkBrakeHandle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const TRAVEL = 40;
  const [live, setLive] = useState<number | null>(null); // 0 = stowed, 1 = fully pulled while dragging
  const g = useRef({ y: 0, base: 0, moved: false });
  const frac = live ?? (value ? 1 : 0);
  const top = 44 - frac * TRAVEL;
  return (
    <div
      role="switch"
      aria-label="Parking brake handle"
      aria-checked={value}
      className="relative size-full cursor-grab touch-none select-none overflow-hidden rounded-[3px] border border-[#050607] bg-[#0b0c0e] shadow-[inset_0_0_8px_#000] active:cursor-grabbing"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); g.current = { y: e.clientY, base: value ? 1 : 0, moved: false }; }}
      onPointerMove={(e) => {
        if (e.buttons !== 1) return;
        const sc = e.currentTarget.getBoundingClientRect().height / 74 || 1;
        const dy = (e.clientY - g.current.y) / sc;
        if (Math.abs(dy) > 3) g.current.moved = true;
        if (g.current.moved) setLive(clamp(g.current.base - dy / TRAVEL, 0, 1));
      }}
      onPointerUp={() => {
        const next = g.current.moved ? (live ?? 0) > 0.5 : !value;
        setLive(null);
        if (next !== value) onChange(next);
      }}
      onPointerCancel={() => setLive(null)}
    >
      <div className="absolute inset-y-1 left-1/2 w-[5px] -translate-x-1/2 rounded-full bg-[#020303]" />
      <svg viewBox="0 0 34 70" width="34" height="70" className="pointer-events-none absolute left-1/2 -translate-x-1/2" style={{ top, transition: live === null ? "top .15s" : "none" }} aria-hidden>
        <rect x="14" y="12" width="6" height="58" fill="#8a8e93" stroke="#15181b" />
        <rect x="14" y="12" width="2" height="58" fill="#c9ced2" />
        <rect x="2" y="2" width="30" height="12" rx="5" fill="#d0453a" stroke="#4a0f0f" strokeWidth="1.5" />
        <rect x="5" y="4" width="24" height="3" rx="1.5" fill="#ff9a8a" opacity=".6" />
      </svg>
    </div>
  );
}

function useReverse(n: 1 | 2) {
  const s = useSimPick("engine1FirePulled", "engine2FirePulled", "patch", "rev1", "rev2", "throttle1", "throttle2", "wow");
  const d = useDerivedPick("eng1Running", "eng2Running", "hydA", "thrustReverser1Active", "thrustReverser2Active");
  const commandedRev = n === 1 ? s.rev1 : s.rev2;
  const rev = n === 1 ? d.thrustReverser1Active : d.thrustReverser2Active;
  const throttle = n === 1 ? s.throttle1 : s.throttle2;
  const toggle = () => {
    const running = n === 1 ? d.eng1Running : d.eng2Running;
    const fire = n === 1 ? s.engine1FirePulled : s.engine2FirePulled;
    if (commandedRev) { s.patch(n === 1 ? { rev1: false } : { rev2: false }, `ENG ${n} REVERSER STOW`); return; }
    if (throttle > 0.05) { s.patch({}, `ENG ${n} REVERSER DEPLOY INHIBITED — thrust lever must be at idle.`); return; }
    if (!(s.wow && running && !fire && (d.hydA > 1500))) { s.patch({}, `ENG ${n} REVERSER DEPLOY INHIBITED — ground/engine/fire/hydraulic interlock not satisfied.`); return; }
    s.patch(n === 1 ? { rev1: true } : { rev2: true }, `ENG ${n} REVERSER DEPLOY`);
  };
  return { rev, toggle };
}

function ThrustLever({ n, cx }: { n: 1 | 2; cx: number }) {
  const s = useSimPick("patch", "throttle1", "throttle2");
  const ped = usePedestal(useShallow((st) => ({ atDisc: st.atDisc, set: st.set })));
  const [linked] = useSwState("thrustLinked", true);
  const { rev, toggle } = useReverse(n);
  const throttle = n === 1 ? s.throttle1 : s.throttle2;
  const disc = ped.atDisc[n - 1];
  const drag = useRef({ y: 0, v: 0, moved: false });
  const yc = LEV_IDLE - throttle * (LEV_IDLE - LEV_TOP);
  const apply = (v: number) => {
    if (linked) s.patch({ throttle1: v, throttle2: v });
    else s.patch(n === 1 ? { throttle1: v } : { throttle2: v });
  };
  const prong = "absolute top-0 h-full w-[13px] rounded-t-[5px] border border-[#1a1d20]";
  const steel = rev ? "bg-[linear-gradient(90deg,#b98a2a,#f0c050,#b98a2a)]" : "bg-[linear-gradient(90deg,#7d848b,#d0d4d8,#7d848b)]";
  return (
    <>
      {/* travel slot */}
      <Box x={cx - 27} y={392} w={54} h={214} className="rounded-[3px] border border-[#050607] bg-[#07080a] shadow-[inset_0_0_12px_#000]" />
      {/* reverse-lever fork (pull aft to deploy) */}
      <Box x={cx - 22} y={rev ? 380 : 320} w={44} h={72} z={4} className="transition-[top] duration-200">
        <button type="button" aria-label={`Reverse thrust lever ${n} ${rev ? "deployed" : "stowed"}`} onClick={toggle} className="relative size-full drop-shadow-[0_4px_5px_rgba(0,0,0,.7)]">
          <span className={cn(prong, "left-0", steel)} />
          <span className={cn(prong, "right-0", steel)} />
          <span className={cn("absolute inset-x-0 bottom-0 h-[22px] rounded-b-[6px] border border-[#1a1d20]", steel)} />
        </button>
      </Box>
      {/* bone-shaped handle with A/T DISENGAGE switch */}
      <Box x={cx - 56} y={yc - 39} w={112} h={78} z={n === 2 ? 7 : 6}>
        <div
          role="slider"
          aria-label={`Thrust lever ${n}`}
          aria-valuenow={Math.round(throttle * 100)}
          className={cn("flex size-full touch-none select-none cursor-grab flex-col items-center justify-center shadow-[0_6px_10px_rgba(0,0,0,.75)] active:cursor-grabbing", disc ? "bg-[linear-gradient(180deg,#f3c36a,#d79a2a)]" : "bg-[linear-gradient(180deg,#e9e6d2,#c4c1a6)]")}
          style={{ clipPath: "polygon(0 6%,16% 0,34% 16%,66% 16%,84% 0,100% 6%,100% 94%,84% 100%,66% 84%,34% 84%,16% 100%,0 94%)", borderRadius: 10 }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { y: e.clientY, v: throttle, moved: false }; }}
          onPointerMove={(e) => {
            if (e.buttons !== 1) return;
            const dy = e.clientY - drag.current.y;
            if (Math.abs(dy) > 4) drag.current.moved = true;
            apply(clamp(Math.round((drag.current.v - dy / (LEV_IDLE - LEV_TOP)) * 100) / 100, 0, 1));
          }}
          onPointerUp={() => { if (!drag.current.moved) ped.set({ atDisc: n === 1 ? [!disc, ped.atDisc[1]] : [ped.atDisc[0], !disc] }); }}
        >
          <span className="font-display text-[22px] font-bold leading-none text-[#4a483a]">{n}</span>
          <span className="mt-1 text-center font-mono text-[8px] font-bold leading-[9px] text-[#4a483a]">{n === 1 ? "⇨ A/T" : "A/T ⇦"}<br />DISENGAGE</span>
        </div>
      </Box>
    </>
  );
}

function StartLevers() {
  const s = useSimPick("lever1", "lever2", "patch");
  const one = (n: 1 | 2, x: number) => {
    const idle = n === 1 ? s.lever1 : s.lever2;
    return (
      <Box x={x} y={702} w={36} h={64} z={3}>
        <Detent2
          value={idle}
          w={36}
          h={64}
          hw={28}
          hh={26}
          aria={`Engine ${n} start lever ${idle ? "IDLE" : "CUTOFF"}`}
          onChange={(v) => s.patch(n === 1 ? { lever1: v } : { lever2: v }, `ENG ${n} START LEVER → ${v ? "IDLE" : "CUTOFF"}`)}
          handle={<div className={cn("flex size-full items-center justify-center rounded-[4px] border border-[#8e8a76] font-display text-[14px] font-bold text-[#37352b] shadow-[0_3px_5px_rgba(0,0,0,.7)]", CREAM)}>{n}</div>}
        />
      </Box>
    );
  };
  return <>{one(1, 503)}{one(2, 545)}</>;
}

const FLAP_VALUES = [0, 1, 2, 5, 10, 15, 25, 30, 40];
const FLAP_Y = [362, 380, 397, 414, 457, 505, 546, 585, 622]; // photo y of each gate
const FLAP_TOP = 340;
function FlapQuadrant() {
  const s = useSimPick("flaps", "patch");
  const ref = useRef<HTMLDivElement>(null);
  const idx = FLAP_VALUES.reduce((b, v, i) => (Math.abs(v - s.flaps) < Math.abs(FLAP_VALUES[b] - s.flaps) ? i : b), 0);
  const pick = (cy: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const rel = cy - r.top + FLAP_TOP;
    let best = 0;
    FLAP_Y.forEach((y, i) => { if (Math.abs(y - rel) < Math.abs(FLAP_Y[best] - rel)) best = i; });
    if (best !== idx) s.patch({ flaps: FLAP_VALUES[best] }, `FLAP LEVER ${FLAP_VALUES[best] === 0 ? "UP" : FLAP_VALUES[best]}`);
  };
  return (
    <Box x={632} y={FLAP_TOP} w={160} h={310} z={5}>
      <div ref={ref} className="absolute inset-0 touch-none select-none" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pick(e.clientY); }} onPointerMove={(e) => { if (e.buttons === 1) pick(e.clientY); }}>
        {/* navy scale plate: FLAP UP 0 1 2 5 10 15 25 30 FLAP DN 40 */}
        <div className="absolute left-[24px] top-[4px] h-[300px] w-[40px] rounded-[3px] border border-[#050607] bg-[linear-gradient(90deg,#0d1522,#16233a)] shadow-[inset_0_0_8px_#000]" />
        <span className={cn(TINY, "absolute left-[26px] top-[6px] w-[36px] text-center text-[5px]")}>FLAP UP</span>
        <span className={cn(TINY, "absolute left-[26px] w-[36px] text-center text-[5px]")} style={{ top: 600 - FLAP_TOP }}>FLAP DN</span>
        {/* serrated rack */}
        <div className="absolute left-[64px] top-[8px] h-[292px] w-[9px] border-x border-[#15181b]" style={{ backgroundImage: "repeating-linear-gradient(180deg,#9aa0a5 0 5px,#2a2d31 5px 9px)" }} />
        {FLAP_VALUES.map((v, i) => (
          <button key={v} type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => s.patch({ flaps: v }, `FLAP LEVER ${v === 0 ? "UP" : v}`)} className={cn("absolute left-[26px] w-[36px] -translate-y-1/2 text-center font-display text-[11px] font-bold leading-none", i === idx ? "text-white [text-shadow:0_0_5px_#fff]" : "text-[#d9d4c0]")} style={{ top: FLAP_Y[i] - FLAP_TOP }}>{v}</button>
        ))}
        {/* bent steel arm + cream FLAP grip */}
        <div className="pointer-events-none absolute left-[62px] flex -translate-y-1/2 items-center transition-[top] duration-200" style={{ top: FLAP_Y[idx] - FLAP_TOP }} role="slider" aria-label="Flap lever" aria-valuenow={FLAP_VALUES[idx]}>
          <span className="h-[10px] w-[24px] bg-[linear-gradient(180deg,#c9ced2,#5c6064,#c9ced2)] shadow-[0_3px_4px_rgba(0,0,0,.6)]" />
          <span className="-ml-1 h-[10px] w-[22px] -translate-y-[10px] -rotate-[28deg] bg-[linear-gradient(180deg,#c9ced2,#5c6064,#c9ced2)]" />
          <span className="-ml-1 flex h-[44px] w-[58px] -translate-y-[16px] items-center justify-center rounded-[6px] border border-[#9b9577] bg-[linear-gradient(180deg,#e9e5cf,#bdb89c)] font-mono text-[10px] font-bold tracking-wider text-[#6a6650] shadow-[0_5px_9px_rgba(0,0,0,.7),inset_0_1px_0_rgba(255,255,255,.7)]">FLAP</span>
        </div>
      </div>
    </Box>
  );
}

const SB_VALUES = ["DOWN", "ARMED", "FLIGHT", "UP"] as const;
const SB_NAME = ["DOWN", "ARMED", "FLIGHT DETENT", "UP"];
const SB_Y = [4, 40, 78, 170]; // legend offsets down the gate plate
const SB_C = [19, 58, 118, 177]; // lever centre (px below the gate top) at each detent
const SB_H = 200;
function SpeedBrake() {
  const s = useSimPick("patch", "speedBrake");
  const ref = useRef<HTMLDivElement>(null);
  const idx = Math.max(0, SB_VALUES.indexOf(s.speedBrake));
  const pick = (cy: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || !r.height) return;
    const rel = ((cy - r.top) * SB_H) / r.height;
    let best = 0;
    SB_C.forEach((y, i) => { if (Math.abs(y - rel) < Math.abs(SB_C[best] - rel)) best = i; });
    if (best !== idx) s.patch({ speedBrake: SB_VALUES[best] }, `SPEED BRAKE ${SB_VALUES[best]}`);
  };
  return (
    <>
      {/* gate plate: DOWN / ARMED / FLIGHT DETENT / UP */}
      <Box x={380} y={498} w={15} h={SB_H} z={3} className="rounded-[2px] border border-[#050607] bg-[#0c0d0f] shadow-[inset_0_0_4px_#000]">
        {SB_NAME.map((nm, i) => (
          <span key={nm} className={cn(TINY, "absolute left-[3px] [writing-mode:vertical-rl]", i === idx ? "text-white" : "opacity-60")} style={{ top: SB_Y[i] }}>{nm}</span>
        ))}
      </Box>
      {/* lever: drag or tap along the gate, like the flap lever */}
      <Box x={270} y={498} w={125} h={SB_H} z={8}>
        <div ref={ref} className="absolute inset-0 touch-none select-none" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pick(e.clientY); }} onPointerMove={(e) => { if (e.buttons === 1) pick(e.clientY); }}>
          {SB_C.map((y, i) => <span key={i} className="pointer-events-none absolute right-[-1px] h-[2px] w-[6px] bg-[#9aa0a5]/60" style={{ top: y - 1 }} />)}
          <div className="pointer-events-none absolute left-0 flex w-[112px] -translate-y-1/2 items-center transition-[top] duration-200" style={{ top: SB_C[idx] }} role="slider" aria-label="Speed brake lever" aria-valuetext={s.speedBrake}>
            <span className="relative z-[1] flex h-[34px] w-[58px] items-center justify-center rounded-[6px] border border-[#9b9577] bg-[linear-gradient(180deg,#e9e5cf,#bdb89c)] text-center font-mono text-[7px] font-bold leading-[8px] text-[#6a6650] shadow-[0_4px_7px_rgba(0,0,0,.7)]">SPEED<br />BRAKE</span>
            <span className="-ml-1 h-[10px] w-[60px] bg-[linear-gradient(180deg,#c9ced2,#6c7074,#c9ced2)] shadow-[0_3px_4px_rgba(0,0,0,.7)]" />
          </div>
        </div>
      </Box>
    </>
  );
}

function TrimWheel({ x, y, w, h, stripes, onTrim }: { x: number; y: number; w: number; h: number; stripes?: boolean; onTrim: (dU: number) => void }) {
  const trim = useSim((state) => state.stabTrimUnits);
  const last = useRef(0);
  const off = trim * 36;
  return (
    <Box x={x} y={y} w={w} h={h} z={7}>
      <div
        role="slider"
        aria-label="Stabilizer trim wheel"
        aria-valuenow={trim}
        className="relative size-full touch-none select-none cursor-ns-resize overflow-hidden border-2 border-[#050607] shadow-[0_6px_12px_rgba(0,0,0,.8)]"
        style={{ borderRadius: "46% / 12%", backgroundColor: "#0c0d0f", backgroundImage: `repeating-linear-gradient(180deg,#07080a 0 7px,#23262a 7px 10px), linear-gradient(90deg,rgba(255,255,255,.08),transparent 30%,transparent 70%,rgba(255,255,255,.1))`, backgroundPosition: `0 ${off}px, 0 0` }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); last.current = e.clientY; }}
        onPointerMove={(e) => { if (e.buttons !== 1) return; const dy = e.clientY - last.current; last.current = e.clientY; if (dy) onTrim(-dy * 0.03); }}
        onWheel={(e) => onTrim(-Math.sign(e.deltaY) * 0.1)}
      >
        {stripes && <span className="pointer-events-none absolute inset-x-[34%] inset-y-0" style={{ backgroundImage: "repeating-linear-gradient(180deg,#ebe7da 0 22px,transparent 22px 150px)", backgroundPosition: `0 ${off}px` }} />}
      </div>
    </Box>
  );
}

function StabScale({ x, y, value, side }: { x: number; y: number; value: number; side: "L" | "R" }) {
  const yy = (u: number) => 16 + (u / 15) * 150;
  const px = side === "L" ? 0 : 24;
  return (
    <Box x={x} y={y} w={24} h={190} z={5}>
      <svg viewBox="0 0 24 190" className="size-full" aria-hidden>
        <rect x="1" y="1" width="22" height="188" rx="2" fill="#07100c" stroke="#2a3a32" />
        <rect x={side === "L" ? 8 : 4} y={yy(3.5)} width="9" height={yy(8) - yy(3.5)} fill="#2fa860" />
        {Array.from({ length: 16 }).map((_, u) => <line key={u} x1={side === "L" ? 17 : 4} x2={side === "L" ? (u % 5 ? 20 : 22) : (u % 5 ? 7 : 2)} y1={yy(u)} y2={yy(u)} stroke="#e6e1d2" strokeWidth=".8" />)}
        {[5, 10, 15].map((u) => <text key={u} x={side === "L" ? 3 : 12} y={yy(u) + 2} fontSize="6" fill="#e6e1d2" fontFamily="monospace">{u}</text>)}
        <text x="12" y="9" fontSize="4" fill="#bdb5a2" textAnchor="middle" fontFamily="monospace">APL ND</text>
        <text x="12" y="184" fontSize="4" fill="#bdb5a2" textAnchor="middle" fontFamily="monospace">APL NU</text>
        <path d={side === "L" ? `M${px} ${yy(value) - 4} L6 ${yy(value)} L${px} ${yy(value) + 4} Z` : `M${px} ${yy(value) - 4} L18 ${yy(value)} L${px} ${yy(value) + 4} Z`} fill="#f4efd8" />
      </svg>
    </Box>
  );
}

function RustPlate() {
  return (
    <Box x={516} y={545} w={52} h={162} z={3}>
      <div className="relative size-full rounded-[2px] border border-[#3a2a1a] shadow-[inset_0_0_10px_rgba(0,0,0,.6)]" style={{ background: "linear-gradient(180deg,#7a7468,#5e5648 60%,#6a5238)" }}>
        {[24, 80, 134].map((y) => <span key={y} className="absolute left-1/2 size-[8px] -translate-x-1/2 rounded-full bg-[#1a1612] shadow-[inset_0_0_3px_#000]" style={{ top: y }} />)}
        <span className="absolute inset-x-0 top-[44px] h-[26px] bg-[#8a4a1a]/30" />
      </div>
    </Box>
  );
}

function ControlStand() {
  const s = useSim();
  const d = useDerived();
  const ped = usePedestal();
  const [hornPress, setHorn] = useState(false);
  const [moving, setMoving] = useState(false);
  const [latch, setLatch] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const trim = (dU: number) => {
    const st = useSim.getState();
    const cut = (st.stabTrimCutoutA || st.stabTrimCutoutB) && !st.stabTrimOverride;
    if (cut) return;
    st.patch({ stabTrimUnits: clamp(+(st.stabTrimUnits + dU).toFixed(2), 0, 15) }, "STABILIZER TRIM WHEEL MOVED");
    setMoving(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMoving(false), 500);
  };
  const lampTest = d.dcPower && ped.fireTest !== "OFF";
  const hornOff = () => { setHorn(false); useOverheadLocal.getState().set({ hornCutout: false }); };
  return (
    <>
      {/* body */}
      <Box x={398} y={333} w={350} h={437} className="rounded-[10px] border border-[#141a17] bg-[linear-gradient(155deg,#6b7871,#58655f_55%,#4b5752)] shadow-[inset_0_0_26px_rgba(0,0,0,.6)]" />
      {/* reverse linkage and steel plates above the levers */}
      <Box x={398} y={333} w={350} h={70} z={1}>
        <svg viewBox="0 0 350 70" className="size-full" aria-hidden>
          {[[48, 40, 17], [128, 18, 20], [188, 36, 15], [250, 30, 18]].map(([cx, cy, r], i) => <g key={i}><circle cx={cx} cy={cy} r={r} fill="#7b8389" stroke="#15181b" strokeWidth="2" /><circle cx={cx} cy={cy} r={r * 0.4} fill="#2a2e32" /></g>)}
          <rect x="60" y="10" width="190" height="9" fill="#9aa0a5" stroke="#15181b" />
          <rect x="30" y="48" width="240" height="6" fill="#555b60" />
          <path d="M70 60 L96 20 L120 20 L100 60 Z M170 60 L196 24 L216 24 L196 60 Z" fill="#6c7378" stroke="#15181b" />
        </svg>
      </Box>

      {/* INCREASE / DECREASE THRUST placard + rusty centre plate */}
      <Box x={520} y={420} w={44} h={120} z={3}>
        <div className="flex size-full items-center justify-center rounded-[2px] border border-[#050607] bg-[linear-gradient(180deg,#101a2a,#0a111c)]">
          <span className="rotate-180 font-mono text-[7px] font-bold tracking-wider text-[#dfe6ee] [writing-mode:vertical-rl]">DECREASE THRUST ⊕ INCREASE THRUST</span>
        </div>
      </Box>
      <RustPlate />

      <SpeedBrake />
      <StabScale x={186} y={500} value={s.stabTrimUnits} side="L" />
      <StabScale x={792} y={500} value={s.stabTrimUnits} side="R" />
      <ThrustLever n={1} cx={475} />
      <ThrustLever n={2} cx={600} />
      <StartLevers />
      <FlapQuadrant />

      {/* stabilizer trim wheels */}
      <TrimWheel x={212} y={500} w={54} h={250} stripes onTrim={trim} />
      <TrimWheel x={818} y={500} w={54} h={250} stripes onTrim={trim} />

      {/* parking brake: placard + bent red wire handle */}
      <Box x={398} y={628} w={58} h={38} z={6}>
        <div className="flex size-full items-center justify-center rounded-[4px] border border-[#8e8a76] bg-[linear-gradient(180deg,#e4e3dc,#b8b6aa)] text-center font-mono text-[7px] font-bold leading-[8px] text-[#2a2a24]">PARKING<br />BRAKE<br />PULL</div>
      </Box>
      <Box x={398} y={668} w={40} h={74} z={6}>
        <ParkBrakeHandle value={s.parkingBrake} onChange={(v) => s.patch({ parkingBrake: v }, v ? "PARKING BRAKE SET — handle pulled." : "PARKING BRAKE RELEASED — handle stowed.")} />
      </Box>
      <Box x={451} y={677} w={34} h={34} z={6}>
        <span className={cn("block size-full rounded-full border-2 border-[#5a3a0a] shadow-[0_0_0_3px_#8a8e93]", d.dcPower && s.parkingBrake ? "bg-[radial-gradient(circle_at_35%_30%,#ffd27a,#f08a1a)] shadow-[0_0_14px_#f5a030,0_0_0_3px_#8a8e93]" : "bg-[radial-gradient(circle_at_35%_30%,#c9761a,#7a420a)]")} />
      </Box>
      <Box x={440} y={716} w={62} h={28} z={6}><Lbl className="size-full text-[7px]">PARK<br />BRAKE<br />LIGHT</Lbl></Box>

      {/* horn cutout */}
      <Box x={596} y={614} w={34} h={34} z={6}>
        <button type="button" aria-label="Horn cutout" onPointerDown={() => { setHorn(true); useOverheadLocal.getState().set({ hornCutout: true }); }} onPointerUp={hornOff} onPointerLeave={() => { if (hornPress) hornOff(); }} className={cn("size-full rounded-full border-2 border-[#8a8e93] bg-[radial-gradient(circle_at_40%_35%,#3a3d41,#0c0d0e)] shadow-[0_3px_5px_rgba(0,0,0,.7)]", hornPress && "translate-y-px brightness-150")} />
      </Box>
      <Box x={572} y={652} w={58} h={22} z={6}><Lbl className="size-full text-[7px]">HORN<br />CUTOUT</Lbl></Box>

      {/* stab trim light + latch */}
      <Box x={650} y={677} w={34} h={34} z={6}>
        <span className={cn("block size-full rounded-full border-2 border-[#4a0f0f] shadow-[0_0_0_3px_#8a8e93]", d.dcPower && (moving || lampTest) ? "bg-[radial-gradient(circle_at_35%_30%,#ff9a9a,#e02020)] shadow-[0_0_14px_#ff3030,0_0_0_3px_#8a8e93]" : "bg-[radial-gradient(circle_at_35%_30%,#b02a2a,#5a0a0a)]")} />
      </Box>
      <Box x={638} y={716} w={62} h={28} z={6}><Lbl className="size-full text-[7px]">STAB<br />TRIM<br />LIGHT</Lbl></Box>
      <Box x={706} y={724} w={34} h={30} z={8}>
        <button type="button" aria-label="Latch" onClick={() => setLatch((v) => !v)} className="relative size-full">
          <span className="absolute left-[4px] top-[2px] h-[26px] w-[6px] rounded-[1px] bg-[linear-gradient(90deg,#9aa0a5,#5a5f64)] transition-transform" style={{ transform: latch ? "rotate(24deg)" : "none" }} />
          <span className="absolute right-[4px] top-[2px] h-[26px] w-[6px] rounded-[1px] bg-[linear-gradient(90deg,#9aa0a5,#5a5f64)] transition-transform" style={{ transform: latch ? "rotate(-24deg)" : "none" }} />
          <span className="absolute inset-x-[2px] bottom-0 h-[6px] rounded-[1px] bg-[#2a2d31]" />
        </button>
      </Box>
    </>
  );
}

/* ════════════════════════════ FIRE / OVERHEAT PANEL ════════════════════════════ */

function FireHandle({ label, num, pulled, lit, locked, onPull, onRotate, kind }: { label: string; num?: string; pulled: boolean; lit: boolean; locked: boolean; onPull: () => void; onRotate?: (dir: "L" | "R") => void; kind: "red" | "apu" }) {
  const [wiggle, setWiggle] = useState(false);
  const red = kind === "red";
  const small: CSSProperties = { fontFamily: "ui-monospace,Menlo,monospace", fontWeight: 700, fontSize: 6, lineHeight: 1 };
  const rot: CSSProperties = { ...small, padding: "2px 4px", borderRadius: 2, border: "1px solid #3a0c0c", background: "#f1d0d0", color: "#4a0c0c" };
  return (
    <div style={{ position: "relative", width: 54, height: 134, borderRadius: 3, border: "1px solid #050607", background: "#0a0b0d", boxShadow: "inset 0 0 10px #000" }}>
      <button
        type="button"
        aria-label={`${label} fire handle`}
        aria-pressed={pulled}
        onClick={() => { if (locked && !pulled) { setWiggle(true); setTimeout(() => setWiggle(false), 250); } onPull(); }}
        style={{ position: "absolute", left: 4, top: pulled ? 2 : 10, width: 44, height: 118, padding: 0, transition: "top .2s, transform .1s", transform: wiggle ? "translateX(2px)" : "none", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", borderRadius: 6, color: "#fff", border: lit ? "1px solid #ff9a9a" : "2px solid #3a0d0d", background: lit ? "#ff3b3b" : "linear-gradient(180deg,#d62b2b,#9a1717)", boxShadow: lit ? "0 0 16px rgba(255,60,60,.9)" : "0 3px 6px rgba(0,0,0,.6)" }}
      >
        <>
          <span style={{ ...small, marginTop: 4, color: "#f6dede" }}>DISCH</span>
          <span style={{ ...small, marginTop: 3, color: "#f6dede" }}>{red ? "L ⟲ R" : "⟲"}</span>
          <span style={{ marginTop: 6, fontFamily: "'Barlow Condensed',ui-sans-serif,sans-serif", fontWeight: 700, fontSize: red ? 44 : 32, lineHeight: red ? "44px" : "44px" }}>{red ? num : "APU"}</span>
        </>
      </button>
      {pulled && onRotate ? (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 5, display: "flex", justifyContent: "center", gap: 3 }}>
          {red ? <><button type="button" style={rot} onClick={() => onRotate("L")}>L</button><button type="button" style={rot} onClick={() => onRotate("R")}>R</button></> : <button type="button" style={rot} onClick={() => onRotate("L")}>DISCH</button>}
        </div>
      ) : null}
    </div>
  );
}

function P({ x, y, w, h, z, children }: { x: number; y: number; w?: number; h?: number; z?: number; children: ReactNode }) {
  return <div style={{ position: "absolute", left: x, top: y, width: w, height: h, zIndex: z }}>{children}</div>;
}

function FirePanel() {
  const s = useSim();
  const d = useDerived();
  const p = usePedestal();
  const pw = d.dcPower;
  const override = Date.now() < p.fireOverrideUntil;
  const testOv = pw && p.fireTest === "OVHT_FIRE";
  const testFault = pw && p.fireTest === "FAULT";
  const anyWarn = d.engine1FireWarn || d.engine2FireWarn || d.apuFireWarn || d.wheelWellFireWarn || d.cargoFwdFireWarn || d.cargoAftFireWarn;
  useEffect(() => { if (!anyWarn && p.bellSilenced) p.set({ bellSilenced: false }); }, [anyWarn, p.bellSilenced]); // eslint-disable-line react-hooks/exhaustive-deps

  const pullEngine = (n: 1 | 2) => {
    const pulled = n === 1 ? s.engine1FirePulled : s.engine2FirePulled;
    const detected = n === 1 ? s.faults.engineFire1 : s.faults.engineFire2;
    if (!pulled && !detected && !override) { s.patch({}, `ENG ${n} FIRE handle LOCKED — no fire warning. Use FIRE SWITCHES LOCK OVERRIDE.`); return; }
    s.patch(n === 1 ? { engine1FirePulled: !pulled } : { engine2FirePulled: !pulled }, pulled ? `ENG ${n} FIRE handle reset.` : `ENG ${n} FIRE handle pulled — engine fuel, bleed, generator and engine hydraulic pump isolated.`);
  };
  const dischargeEngine = (n: 1 | 2, bottle: "L" | "R") => {
    const pulled = n === 1 ? s.engine1FirePulled : s.engine2FirePulled;
    const already = bottle === "L" ? s.fireBottleLDischarged : s.fireBottleRDischarged;
    if (!pulled || already) return;
    const faults = n === 1 ? { engineFire1: false } : { engineFire2: false };
    s.patch(bottle === "L" ? { fireBottleLDischarged: true, faults } : { fireBottleRDischarged: true, faults }, `ENG ${n} fire handle rotated ${bottle === "L" ? "LEFT" : "RIGHT"} — bottle ${bottle} discharged.`);
  };
  const pullApu = () => {
    if (!s.apuFirePulled && !s.faults.apuFireDetected && !override) { s.patch({}, "APU FIRE handle LOCKED — no fire warning. Use FIRE SWITCHES LOCK OVERRIDE."); return; }
    s.patch({ apuFirePulled: !s.apuFirePulled }, s.apuFirePulled ? "APU fire handle reset." : "APU FIRE handle pulled — APU shut down, fuel, bleed and generator isolated.");
  };
  const dischApu = () => {
    if (!s.apuFirePulled || s.apuBottleFired) return;
    s.patch({ apuBottleFired: true, faults: { apuFireDetected: false } }, "APU fire bottle discharged — simulated extinguishing agent release.");
  };
  const ovhtOn = (n: 1 | 2) => pw && (testOv || (n === 1 ? s.faults.bleedOverheat1 : s.faults.bleedOverheat2));
  // AMM 26-21/26-22: EXT TEST is a press-to-test pushbutton; each green light shows squib circuit continuity (lit only while pressed, and only if that bottle's squib is still intact, i.e. not yet fired)
  const extLamp = (intact: boolean) => pw && p.extTest !== "OFF" && intact;
  const ring: CSSProperties = { position: "absolute", width: 16, height: 16, borderRadius: "50%", border: "3px solid #8a8e93", boxSizing: "border-box" };
  const sock = (x: number, y: number, on: boolean, tag: string, below = false) => (
    <>
      <span style={{ ...ring, left: x, top: y, background: on ? "#38d27a" : "#0d0f10", boxShadow: on ? "0 0 8px #38d27a" : "inset 0 0 4px #000" }} />
      <span className={LEGEND} style={{ position: "absolute", left: below ? x + 8 - tag.length * 2.4 : x + 18, top: below ? y + 19 : y + 4, fontSize: 6, lineHeight: 1 }}>{tag}</span>
    </>
  );
  return (
    <div
      className="panel-interactive"
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
      style={{ position: "relative", width: "100%", height: "100%", borderRadius: 3, border: "1px solid #12161a", background: "linear-gradient(155deg,#6b7871,#58655f 55%,#4b5752)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.18),inset 0 -3px 8px rgba(0,0,0,.4),0 2px 5px rgba(0,0,0,.55)", touchAction: "none", WebkitTouchCallout: "none" as never }}
    >
      <Rivets />
      <Chips />
      {/* ENG 1 column: OVHT DET / ENG 1 OVERHEAT / TEST */}
      <P x={2} y={8}><Bat3 options={["A", "NORMAL", "B"]} value={p.ovhtDet[0]} onChange={(v) => p.set({ ovhtDet: [v as OvhtDet, p.ovhtDet[1]] })} label="OVHT DET" labels={["OVHT", "NORM", "FIRE"]} /></P>
      <P x={6} y={64} w={54} h={34}><Lens label={<>ENG 1<br />OVERHEAT</>} on={ovhtOn(1)} style={{ width: "100%", height: "100%" }} /></P>
      <P x={143} y={54}><SpringSwitch up="F/INOP" down="OVHT" value={p.fireTest === "FAULT" ? "UP" : p.fireTest === "OVHT_FIRE" ? "DOWN" : "MID"} onChange={(v) => p.set({ fireTest: v === "UP" ? "FAULT" : v === "DOWN" ? "OVHT_FIRE" : "OFF" })} label="TEST" /></P>
      {/* DISCH 1 + WHEEL WELL */}
      <P x={72} y={6}><FireHandle label="ENG 1" kind="red" num="1" pulled={s.engine1FirePulled} lit={pw && (d.engine1FireWarn || testOv)} locked={!override && !s.faults.engineFire1} onPull={() => pullEngine(1)} onRotate={(dir) => dischargeEngine(1, dir)} /></P>
      <P x={134} y={8} w={50} h={34}><Lens label={<>WHEEL<br />WELL</>} on={pw && (d.wheelWellFireWarn || testOv)} tone="red" style={{ width: "100%", height: "100%" }} /></P>
      {/* APU lenses, handle (lens missing), bell cutout */}
      <P x={192} y={44} w={56} h={34}><Lens label={<>APU BOTTLE<br />DISCHARGED</>} on={pw && s.apuBottleFired} style={{ width: "100%", height: "100%" }} /></P>
      <P x={192} y={82} w={56} h={34}><Lens label={<>APU DET<br />INOP</>} on={testFault} style={{ width: "100%", height: "100%" }} /></P>
      <P x={254} y={1} w={70} h={8}><Lbl className="size-full !py-0 !leading-[6px]">BELL CUTOUT</Lbl></P>
      <P x={264} y={10}><FireHandle label="APU" kind="apu" pulled={s.apuFirePulled} lit={pw && (d.apuFireWarn || testOv)} locked={!override && !s.faults.apuFireDetected} onPull={pullApu} onRotate={() => dischApu()} /></P>
      <P x={236} y={126}><span style={{ display: "block", width: 14, height: 14, borderRadius: "50%", border: "2px solid #8a8e93", background: pw && d.apuFireWarn ? "#ffd27a" : "radial-gradient(circle at 40% 35%,#e6cfa0,#a8895a)", boxShadow: pw && d.apuFireWarn ? "0 0 8px #ffb020" : "none" }} /></P>
      <P x={324} y={124}><button type="button" aria-label="Bell cutout" onClick={() => p.set({ bellSilenced: true })} style={{ width: 18, height: 18, padding: 0, borderRadius: "50%", border: "2px solid #8a8e93", background: p.bellSilenced ? "#3a3d41" : "radial-gradient(circle at 40% 35%,#3a3d41,#0c0d0e)", boxShadow: "0 2px 4px rgba(0,0,0,.7)" }} /></P>
      {/* ENG 2 column */}
      <P x={330} y={8}><Bat3 options={["A", "NORMAL", "B"]} value={p.ovhtDet[1]} onChange={(v) => p.set({ ovhtDet: [p.ovhtDet[0], v as OvhtDet] })} label="OVHT DET" labels={["OVHT", "NORM", "FIRE"]} /></P>
      <P x={330} y={64} w={54} h={34}><Lens label={<>ENG 2<br />OVERHEAT</>} on={ovhtOn(2)} style={{ width: "100%", height: "100%" }} /></P>
      <P x={392} y={8} w={50} h={34}><Lens label={<>L BOTTLE<br />DISCHARGED</>} on={pw && s.fireBottleLDischarged} style={{ width: "100%", height: "100%" }} /></P>
      <P x={392} y={46} w={50} h={34}><Lens label={<>R BOTTLE<br />DISCHARGED</>} on={pw && s.fireBottleRDischarged} style={{ width: "100%", height: "100%" }} /></P>
      <P x={448} y={6}><FireHandle label="ENG 2" kind="red" num="2" pulled={s.engine2FirePulled} lit={pw && (d.engine2FireWarn || testOv)} locked={!override && !s.faults.engineFire2} onPull={() => pullEngine(2)} onRotate={(dir) => dischargeEngine(2, dir)} /></P>
      {/* ENGINES EXT TEST: push button + L / R / APU sockets */}
      <P x={506} y={8} w={50} h={116}>
        <span className={LEGEND} style={{ position: "absolute", left: 0, top: 0, fontSize: 6, lineHeight: 1 }}>ENGINES TEST</span>
        <button type="button" aria-label="Engines extinguisher test (hold)" onPointerDown={() => p.set({ extTest: "1" })} onPointerUp={() => p.set({ extTest: "OFF" })} onPointerLeave={() => { if (usePedestal.getState().extTest !== "OFF") p.set({ extTest: "OFF" }); }} style={{ position: "absolute", left: 0, top: 14, width: 18, height: 18, padding: 0, borderRadius: "50%", border: "3px solid #1a1d20", background: "radial-gradient(circle at 40% 35%,#4a5058,#1a1d20)", boxShadow: "0 2px 4px rgba(0,0,0,.7)" }} />
        {sock(24, 14, extLamp(!s.fireBottleRDischarged), "R")}
        {sock(12, 46, extLamp(!s.fireBottleLDischarged), "L", true)}
        {sock(36, 46, extLamp(!s.apuBottleFired), "APU", true)}
      </P>
    </div>
  );
}

/* ════════════════════════════ RADIOS ════════════════════════════ */

function RadioFrame({ children }: { children: ReactNode; className?: string }) {
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 2, border: "1px solid #1c2220", background: "linear-gradient(155deg,#6b7871,#58655f 55%,#4b5752)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.18),inset 0 -3px 8px rgba(0,0,0,.4),0 2px 5px rgba(0,0,0,.55)" }}>
      <Rivets />
      {children}
    </div>
  );
}

function VhfUnit({ side }: { side: "L" | "R" }) {
  const p = usePedestal();
  const d = useDerivedPick("dcPower");
  const key = side === "L" ? "commL" : "commR";
  const st = p[key];
  const pw = d.dcPower;
  const tune = (which: "act" | "stby", delta: number) => {
    const cur = usePedestal.getState()[key];
    let v = cur[which] + delta;
    if (v > 135975) v = 118000 + (v - 136000);
    if (v < 118000) v = 136000 - (118000 - v);
    p.set({ [key]: { ...cur, [which]: v } } as never);
  };
  const half = (which: "stby" | "act") => (
    <>
      <Tiny>{which === "stby" ? "STBY" : "ACTIVE"}</Tiny>
      <DrumWin value={vhfWin(st[which === "stby" ? "stby" : "act"])} lit={pw} />
      <DualTune size={46} onOuter={(dd) => tune(which === "stby" ? "stby" : "act", dd * 1000)} onInner={(dd) => tune(which === "stby" ? "stby" : "act", dd * 25)} />
    </>
  );
  return (
    <RadioFrame>
      <Chips />
      <UnitGrid
        left={half("stby")}
        right={half("act")}
        mid={
          <>
            <div style={ROW}><Bat on={false} onChange={() => p.set({ [key]: { act: st.stby, stby: st.act } } as never)} aria={`VHF ${side} transfer`} /><Tiny>TFR</Tiny></div>
            <div style={ROW}>
              <Bat on={p.commTest} onChange={(v) => p.set({ commTest: v })} aria="COMM TEST" />
              <Tiny>COMM</Tiny><Tiny>TEST</Tiny>
            </div>
          </>
        }
      />
    </RadioFrame>
  );
}

function NavUnit({ side }: { side: "L" | "R" }) {
  const p = usePedestal();
  const d = useDerivedPick("dcPower");
  const key = side === "L" ? "navL" : "navR";
  const idx = side === "L" ? 0 : 1;
  const st = p[key];
  /** DME mode is pedestal authority (AMM 34-55 STBY/NORM/ORIDE) */
  const mode = p.dmeMode[idx] ?? 1;
  const MODES = ["STBY", "NORM", "ORIDE"] as const;
  const pw = d.dcPower;
  const setDmeMode = (v: number) => {
    const cur = usePedestal.getState().dmeMode;
    p.set({ dmeMode: idx === 0 ? [v, cur[1]] : [cur[0], v] });
  };
  const tune = (which: "act" | "stby", delta: number) => {
    const cur = usePedestal.getState()[key];
    let v = cur[which] + delta;
    if (v > 117950) v = 108000 + (v - 118000);
    if (v < 108000) v = 118000 - (108000 - v);
    p.set({ [key]: { ...cur, [which]: v } } as never);
  };
  const half = (which: "stby" | "act") => (
    <>
      <Tiny>{which === "stby" ? "STBY" : "ACTIVE"}</Tiny>
      <DrumWin value={(st[which] / 1000).toFixed(2)} lit={pw && mode > 0} />
      <DualTune size={46} onOuter={(dd) => tune(which, dd * 1000)} onInner={(dd) => tune(which, dd * 50)} />
    </>
  );
  return (
    <RadioFrame>
      <Chips />
      <UnitGrid
        midW={62}
        left={half("stby")}
        right={half("act")}
        mid={
          <>
            <div style={ROW}><Bat on={false} onChange={() => p.set({ [key]: { act: st.stby, stby: st.act } } as never)} aria={`NAV ${side} transfer`} /><Tiny>TFR</Tiny></div>
            <Bat3
              options={["STBY", "NORM", "ORIDE"]}
              value={MODES[mode] ?? "NORM"}
              onChange={(v) => setDmeMode(MODES.indexOf(v as typeof MODES[number]))}
              labels={["STBY", "NORM", "ORIDE"]}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <Bat
                on={!!p.dmeTest[idx]}
                onChange={(v) => {
                  const cur = usePedestal.getState().dmeTest;
                  p.set({ dmeTest: idx === 0 ? [v, cur[1]] : [cur[0], v] });
                }}
                aria={`DME ${side} test`}
              />
              <Tiny>DME TST</Tiny>
              <Bat
                on={!!p.navTest[idx]}
                onChange={(v) => {
                  const cur = usePedestal.getState().navTest;
                  p.set({ navTest: idx === 0 ? [v, cur[1]] : [cur[0], v] });
                }}
                aria={`NAV ${side} test`}
              />
              <Tiny>NAV TST</Tiny>
              <TestLamp pw={pw && mode > 0} label="VOR" />
            </div>
          </>
        }
      />
    </RadioFrame>
  );
}

function AdfUnit() {
  const p = usePedestal(useShallow((st) => ({ adf: st.adf, adfMode: st.adfMode, adfTone: st.adfTone, set: st.set })));
  const d = useDerivedPick("dcPower");
  const pw = d.dcPower;
  const MODE = ["OFF", "ANT", "ADF", "TEST", "LOOP"];
  const g1 = p.adfMode[0];
  const g2 = p.adfMode[1];
  const adj = (sd: "l" | "r", delta: number) => p.set({ adf: { ...usePedestal.getState().adf, [sd]: clamp(usePedestal.getState().adf[sd] + delta, 190, 1750) } });
  const setMode = (i: 0 | 1, v: number) => {
    const mode = usePedestal.getState().adfMode;
    const next: [number, number] = i === 0 ? [v, mode[1]] : [mode[0], v];
    const ant = usePedestal.getState().adfAnt;
    p.set({
      adfMode: next,
      adfAnt: i === 0 ? [v === 1, ant[1]] : [ant[0], v === 1],
    });
  };
  const text = (sd: "l" | "r", g: number) => (g === 3 ? "1888" : String(p.adf[sd]));
  const half = (sd: "l" | "r", n: 1 | 2, g: number) => (
    <>
      <Tiny>ADF {n}</Tiny>
      <DrumWin value={text(sd, g)} lit={pw && g > 0} w={80} />
      <DualTune size={46} onOuter={(dd) => adj(sd, dd * 10)} onInner={(dd) => adj(sd, dd)} />
    </>
  );
  const gain = (i: 0 | 1, g: number) => (
    <div style={ROW}>
      <MiniKnob size={26} min={0} max={4} step={1} value={g} onChange={(v) => setMode(i, v)} aria={`ADF ${i + 1} mode`} />
      <Tiny>{MODE[g]}</Tiny>
    </div>
  );
  return (
    <RadioFrame>
      <Chips />
      <UnitGrid
        midW={62}
        left={half("l", 1, g1)}
        right={half("r", 2, g2)}
        mid={
          <>
            {gain(0, g1)}
            <div style={ROW}><Bat on={p.adfTone} onChange={(v) => p.set({ adfTone: v })} up="TONE" aria="ADF tone" /></div>
            {gain(1, g2)}
          </>
        }
      />
    </RadioFrame>
  );
}


function HfUnit({ side }: { side: "L" | "R" }) {
  const p = usePedestal();
  const d = useDerivedPick("dcPower");
  const s = useSimPick("circuitBreakers");
  const key = side === "L" ? "hfL" : "hfR";
  const cbKey = side === "L" ? "hf-1" : "hf-2";
  const idx = side === "L" ? 0 : 1;
  const st = p[key];
  const pw = d.dcPower && s.circuitBreakers[cbKey] && st.mode > 0;
  const MODES = ["OFF", "USB", "AM"] as const;
  const tune = (which: "act" | "stby", delta: number) => {
    const cur = usePedestal.getState()[key];
    let v = Math.round(cur[which] + delta);
    if (v > 29999) v = 2000;
    if (v < 2000) v = 29999;
    p.set({ [key]: { ...cur, [which]: v } } as never);
  };
  const half = (which: "stby" | "act") => (
    <>
      <Tiny>{which === "stby" ? "STBY" : "ACTIVE"}</Tiny>
      <DrumWin value={String(st[which])} lit={pw} w={72} />
      <DualTune size={42} onOuter={(dd) => tune(which, dd * 100)} onInner={(dd) => tune(which, dd)} />
    </>
  );
  return (
    <RadioFrame>
      <Chips />
      <UnitGrid
        midW={58}
        left={half("stby")}
        right={half("act")}
        mid={
          <>
            <div style={ROW}>
              <Bat on={false} onChange={() => p.set({ [key]: { ...st, act: st.stby, stby: st.act } } as never)} aria={`HF ${side} transfer`} />
              <Tiny>TFR</Tiny>
            </div>
            <Bat3
              options={["OFF", "USB", "AM"]}
              value={MODES[st.mode] ?? "OFF"}
              onChange={(v) => p.set({ [key]: { ...st, mode: MODES.indexOf(v as typeof MODES[number]) } } as never)}
              labels={["OFF", "USB", "AM"]}
            />
            <div style={ROW}>
              <Bat
                on={false}
                onChange={() => {
                  const cur = usePedestal.getState().hfTuneReq;
                  p.set({ hfTuneReq: idx === 0 ? [true, cur[1]] : [cur[0], true] });
                }}
                aria={`HF ${side} tune`}
              />
              <Tiny>TUNE</Tiny>
            </div>
            <Tiny>HF {side}</Tiny>
          </>
        }
      />
    </RadioFrame>
  );
}


function DataDisplay() {
  const p = usePedestal(useShallow((st) => ({ adf: st.adf, commL: st.commL, commR: st.commR, navL: st.navL, navR: st.navR })));
  const d = useDerivedPick("dcPower");
  const pw = d.dcPower;
  const f = (v: number) => (Math.floor(v / 10) / 100).toFixed(2);
  const com3 = useMip((m) => m.comAct);
  const lines = [`COM1  ${f(p.commL.act)}`, `COM2  ${f(p.commR.act)}`, `COM3  ${(com3 / 100).toFixed(2)}`, `NAV1  ${f(p.navL.act)}`, `NAV2  ${f(p.navR.act)}`, `ADF1  ${p.adf.l}`, `ADF2  ${p.adf.r}`];
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 2, border: "1px solid #1c2220", background: "linear-gradient(155deg,#6b7871,#58655f 55%,#4b5752)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.18),0 2px 5px rgba(0,0,0,.55)" }}>
      <Rivets />
      <Chips />
      <div style={{ position: "absolute", inset: "8px 14px", borderRadius: 3, border: "9px solid #6d7c78", background: "#020303", overflow: "hidden", boxShadow: "inset 0 0 14px #000,0 2px 5px rgba(0,0,0,.6)" }}>
        {pw && (
          <div style={{ padding: "3px 8px", fontFamily: "ui-monospace,Menlo,monospace", fontSize: 9, lineHeight: "11px", color: "#ffb21a", textShadow: "0 0 5px rgba(255,178,26,.7)", whiteSpace: "pre" }}>
            {lines.join("\n")}
          </div>
        )}
        {/* scan lines + glass glare */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", backgroundImage: "repeating-linear-gradient(180deg,rgba(255,255,255,.035) 0 1px,transparent 1px 3px)" }} />
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(125deg,rgba(255,255,255,.1),transparent 38%)" }} />
      </div>
    </div>
  );
}

function Radios() {
  return (
    <>
      <Box x={262} y={920} w={272} h={124}><VhfUnit side="L" /></Box>
      <Box x={540} y={920} w={282} h={124}><VhfUnit side="R" /></Box>
      <Box x={262} y={1046} w={272} h={124}><NavUnit side="L" /></Box>
      <Box x={540} y={1046} w={282} h={124}><NavUnit side="R" /></Box>
      <Box x={258} y={1172} w={276} h={124}><AdfUnit />
      <HfUnit side="L" />
      <HfUnit side="R" /></Box>
      <Box x={540} y={1172} w={282} h={124}><DataDisplay /></Box>
    </>
  );
}

/* ════════════════════════════ LOWER PLATE ════════════════════════════ */

function LowerPlate() {
  const s = useSimPick("ltPanelPed", "patch");
  const p = usePedestal(useShallow((st) => ({ flood: st.flood, rudderTrim: st.rudderTrim, set: st.set })));
  const [pull, setPull] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const units = Math.abs(p.rudderTrim * 15);
  const release = (v: boolean) => usePedestal.setState((st) => ({ sw: { ...st.sw, stabBrakeRel: v } }));
  const slot = "absolute rounded-[40px] border border-[#0a0c0b] shadow-[inset_0_4px_10px_rgba(0,0,0,.75)] [background:linear-gradient(180deg,#2a322e,#3c4640)]";
  return (
    <>
      <Box x={250} y={1304} w={585} h={253} z={2}>
        <div className={cn(PL, "size-full")}>
          <Rivets />
          <Chips />
          {/* VHF COMM jack */}
          <span className={cn(TINY, "absolute left-[56px] top-[8px]")}>VHF COMM</span>
          <div className="absolute left-[56px] top-[22px] grid grid-cols-2 gap-[4px] rounded-[2px] border border-[#6a5a3a] bg-[#d8d2bc] p-[4px]">
            {Array.from({ length: 4 }).map((_, i) => <span key={i} className="size-[12px] rounded-[2px] bg-[#2a2418] shadow-[inset_0_0_3px_#000]" />)}
          </div>
          {/* PANEL BRIGHT knobs (chipped white paint) */}
          <div className="absolute left-[34px] top-[84px]"><Knob size={46} value={s.ltPanelPed} onChange={(v) => s.patch({ ltPanelPed: +v.toFixed(2) })} /></div>
          <div className="absolute left-[34px] top-[168px]"><Knob size={46} value={p.flood} onChange={(v) => p.set({ flood: v })} /></div>
          <span className={cn(TINY, "absolute left-[88px] top-[96px]")}>PANEL<br />BRIGHT</span>
          <span className={cn(TINY, "absolute left-[88px] top-[180px]")}>FLOOD<br />BRIGHT</span>
          {/* rudder trim: dished scalloped knob */}
          <div className="absolute left-[126px] top-[14px] size-[228px]">
            <div className="absolute left-[10px] top-[10px]">
              <BlackKnob size={208} min={-1} max={1} step={1 / 15} value={p.rudderTrim} onChange={(v) => p.set({ rudderTrim: +v.toFixed(3) })} onDouble={() => p.set({ rudderTrim: 0 })} aria="Rudder trim" ticks={["15", "10", "5", "0", "5", "10", "15"]} />
            </div>
            <span className="pointer-events-none absolute left-1/2 top-[118px] -translate-x-1/2 font-mono text-[9px] font-bold text-[#ece7d6]">{p.rudderTrim === 0 ? "0" : `${p.rudderTrim < 0 ? "L" : "R"} ${units.toFixed(1)}`}</span>
            <span className={cn(TINY, "pointer-events-none absolute bottom-[2px] left-[16px]")}>NOSE LEFT</span>
            <span className={cn(TINY, "pointer-events-none absolute bottom-[2px] right-[16px]")}>NOSE RIGHT</span>
          </div>
          {/* two recessed slots: silver boss (upper) and STAB BRAKE RELEASE knob (lower) */}
          {/* access recess: closed by a screwed cover plate (tap to open / close) */}
          <button type="button" aria-label={coverOpen ? "Close access cover" : "Open access cover"} aria-pressed={coverOpen} onClick={() => setCoverOpen((v) => !v)} className="absolute cursor-pointer p-0" style={{ left: 395, top: 36, width: 135, height: 55 }}>
            <span className={slot} style={{ inset: 0, width: "100%", height: "100%" }}><Chips /><span className="absolute left-[10px] top-1/2 size-[26px] -translate-y-1/2 rounded-full border border-[#3a3d41] bg-[radial-gradient(circle_at_38%_32%,#f0f0ee,#8a8e93_70%)] shadow-[0_2px_4px_rgba(0,0,0,.6)]" /></span>
            <span className="absolute rounded-[30px] border border-[#1c2220] bg-[linear-gradient(155deg,#7a8780,#5f6c66_55%,#505c57)] shadow-[0_2px_5px_rgba(0,0,0,.6),inset_0_1px_0_rgba(255,255,255,.2)] transition-transform duration-200" style={{ inset: 0, transformOrigin: "left center", transform: coverOpen ? "translateX(-62%) scaleX(.38)" : "none" }}>
              {[[14, 11], [121, 11], [14, 44], [121, 44]].map(([x, y], i) => <span key={i} className="absolute size-[8px] rounded-full border border-[#1a1d1c] bg-[radial-gradient(circle_at_35%_30%,#aeb5b1,#555c59)]" style={{ left: x - 4, top: y - 4 }} />)}
              <span className={cn(TINY, "absolute inset-0 flex items-center justify-center")}>ACCESS</span>
            </span>
          </button>
          <div className={slot} style={{ left: 458, top: 126, width: 92, height: 92, borderRadius: "50%" }}><Chips /></div>
          <div className="absolute" style={{ left: 466, top: 134, width: 76 }}>
            <span className="absolute left-1/2 top-[70px] h-[44px] w-[3px] -translate-x-1/2 bg-[#b9a47a]" style={{ transform: `translateX(-50%) ${pull ? "scaleY(1.6)" : ""}`, transformOrigin: "top" }} />
            <button
              type="button"
              aria-label="Stab brake release (hold to pull)"
              onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setPull(true); release(true); }}
              onPointerUp={() => { setPull(false); release(false); }}
              onPointerCancel={() => { setPull(false); release(false); }}
              className="flex size-[74px] items-center justify-center rounded-full border-2 border-[#050607] bg-[radial-gradient(circle_at_38%_32%,#3a3d41,#0e1012_70%)] text-center font-mono text-[8px] font-bold leading-[9px] text-[#ece7d6] shadow-[0_5px_9px_rgba(0,0,0,.75)] transition-transform"
              style={{ transform: pull ? "translate(0,12px)" : "none" }}
            >STAB<br />BRAKE<br />RELEASE<br />PULL</button>
          </div>
        </div>
      </Box>
      <AileronDrum />
    </>
  );
}

function AileronDrum() {
  const trim = usePedestal((p) => p.aileronTrim);
  const last = useRef(0);
  return (
    <Box x={555} y={1549} w={202} h={78} z={1}>
      <div className="relative size-full">
        <div className="absolute inset-x-0 bottom-0 top-[18px] rounded-b-[40px] rounded-t-[8px] border-2 border-[#050607] bg-[#0a0b0c] shadow-[0_6px_12px_rgba(0,0,0,.8)]" />
        <div
          role="slider"
          aria-label="Aileron trim drum"
          aria-valuenow={trim}
          className="absolute inset-x-[6px] top-[22px] h-[48px] touch-none select-none cursor-ew-resize overflow-hidden rounded-[6px]"
          style={{ backgroundImage: "repeating-linear-gradient(90deg,#08090a 0 6px,#2a2d31 6px 9px), linear-gradient(180deg,rgba(255,255,255,.12),transparent 40%,rgba(0,0,0,.4))", backgroundPosition: `${trim * 150}px 0, 0 0` }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); last.current = e.clientX; }}
          onPointerMove={(e) => { if (e.buttons !== 1) return; const dx = e.clientX - last.current; last.current = e.clientX; if (dx) usePedestal.setState((p) => ({ aileronTrim: clamp(+(p.aileronTrim + dx * 0.004).toFixed(3), -1, 1) })); }}
        />
        <span className={cn(TINY, "pointer-events-none absolute left-1/2 top-[4px] -translate-x-1/2 text-[8px]")}>AILERON TRIM</span>
        <span className="pointer-events-none absolute inset-x-0 top-[36px] text-center font-mono text-[9px] font-bold text-[#ece7d6] [text-shadow:0_1px_2px_#000]">L WING DN ← {(trim * 15).toFixed(1)} U → R WING DN</span>
      </div>
    </Box>
  );
}

/* ════════════════════════════ OTHER PEDESTAL FUNCTIONS (not on the photographed pedestal) ════════════════════════════ */
const RX = ["VHF-1", "VHF-2", "HF-1", "HF-2", "CABIN", "INT", "PA"];
const AUD = [["1", "1"], ["2", "2"], ["ADF-1", "ADF-1"], ["ADF-2", "ADF-2"], ["MKR", "MKR"], ["SPKR", "SPKR"]] as const;
function LampToggle({ on, onChange, label, pw, aria }: { on: boolean; onChange: () => void; label?: string; pw: boolean; aria: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <Lamp on={on && pw} size={5} />
      <button type="button" aria-label={aria} aria-pressed={on} onClick={onChange} className="relative h-[22px] w-[14px] rounded-[2px] border border-[#15171a] bg-[#14161a] shadow-[inset_0_0_4px_#000]">
        <span className="absolute left-1/2 top-1/2 h-[10px] w-[3px] origin-top rounded-b-full bg-[linear-gradient(90deg,#8a8e93,#e2e4e6,#6a6e73)] transition-transform duration-150" style={{ transform: `translate(-50%,0) rotate(${on ? 180 : 0}deg)` }} />
        <span className="absolute left-1/2 top-1/2 size-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#2a2d31]" />
      </button>
      {label && <span className={cn(LEGEND, "text-[5px]")}>{label}</span>}
    </div>
  );
}
function MicPanel({ side }: { side: "L" | "R" }) {
  const p = usePedestal(useShallow((st) => ({ mic: st.mic, micAlt: st.micAlt, micMask: st.micMask, micRtIc: st.micRtIc, micVbr: st.micVbr, ptt: st.ptt, set: st.set })));
  const d = useDerivedPick("dcPower");
  const pw = d.dcPower;
  const sk = side === "L" ? "l" : "r";
  const k = (n: string) => `${side}:${n}`;
  const flip = (key: string) => p.set({ mic: { ...p.mic, [key]: !p.mic[key] } });
  const transmitting = RX.find((r) => p.mic[k(`tx:${r}`)]);
  const selectTx = (r: string) => {
    const next: Record<string, boolean> = { ...p.mic };
    RX.forEach((x) => { next[k(`tx:${x}`)] = false; });
    next[k(`tx:${r}`)] = !p.mic[k(`tx:${r}`)];
    p.set({ mic: next });
  };
  const mask = p.micMask[sk];
  return (
    <Plate className="px-2">
      <div className="grid grid-cols-7 gap-1">
        {RX.map((r) => (
          <div key={r} className="flex flex-col items-center gap-0.5">
            <span className={cn(LEGEND, "text-[5px]")}>{r}</span>
            <button type="button" aria-label={`${side} transmit ${r}`} onClick={() => selectTx(r)} className={cn("flex h-7 w-[18px] flex-col items-center justify-center rounded-[2px] border border-[#15171a] font-mono text-[8px] font-bold leading-none", p.mic[k(`tx:${r}`)] && pw ? "bg-[#f4efd8] text-black shadow-[0_0_8px_#fff]" : "bg-[#26282b] text-[#e6e1d2]")}><span className="text-[7px]">≡</span>C</button>
            <LampToggle pw={pw} on={!!p.mic[k(`vol:${r}`)]} onChange={() => flip(k(`vol:${r}`))} aria={`${side} receive ${r}`} />
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-6 gap-1 px-[7%]">
        {AUD.map(([key, label]) => (
          <LampToggle key={key} pw={pw} on={!!p.mic[k(`rx:${key}`)]} onChange={() => flip(k(`rx:${key}`))} label={label} aria={`${side} audio ${label}`} />
        ))}
      </div>
      <div className={cn(LEGEND, "text-center text-[5px] opacity-70")}>1 – NAV – 2</div>
      <div className="mt-1 flex items-end justify-between gap-1">
        <Toggle on={!p.micRtIc[sk]} onChange={(v) => p.set({ micRtIc: { ...p.micRtIc, [sk]: !v } })} upLabel="R/T" downLabel="I/C" />
        <Toggle on={mask === "MASK"} onChange={(v) => p.set({ micMask: { ...p.micMask, [sk]: v ? "MASK" : "BOOM" } })} upLabel="MASK" downLabel="BOOM" />
        <Selector3 label="V · B · R" options={["V", "B", "R"]} value={p.micVbr[sk]} onChange={(v) => p.set({ micVbr: { ...p.micVbr, [sk]: v } })} />
        <Toggle on={p.micAlt[sk]} onChange={(v) => p.set({ micAlt: { ...p.micAlt, [sk]: v } })} upLabel="ALT" downLabel="NORM" />
      </div>
      <div className="mt-1 flex items-center justify-center gap-2">
        <button
          type="button"
          aria-label={`${side} push to talk`}
          onMouseDown={() => p.set({ ptt: true })}
          onMouseUp={() => p.set({ ptt: false })}
          onMouseLeave={() => p.set({ ptt: false })}
          onTouchStart={(e) => { e.preventDefault(); p.set({ ptt: true }); }}
          onTouchEnd={() => p.set({ ptt: false })}
          className={cn(
            "rounded border px-3 py-1 font-mono text-[8px] font-bold uppercase",
            pw && p.ptt && transmitting ? "border-amber-400 bg-amber-500/30 text-amber-100" : "border-[#555a60] bg-[#26282b] text-[#e6e1d2]",
          )}
        >
          PTT
        </button>
      </div>
      <div className={cn(LEGEND, "mt-1 text-center text-[6px]")}>
        {!pw ? "NO DC POWER" : p.ptt && transmitting ? `TX ▸ ${transmitting}` : p.ptt ? "PTT · NO TX RADIO SELECTED" : transmitting ? `ARMED ▸ ${transmitting}` : "—"}
      </div>
    </Plate>
  );
}

function CargoFire() {
  const s = useSimPick("cargoArmed", "cargoBottleDischarged", "cargoFireInstalled", "cargoLoopA", "cargoLoopB", "patch");
  const d = useDerivedPick("cargoAftFireWarn", "cargoFwdFireWarn", "dcPower");
  const p = usePedestal(useShallow((st) => ({ cargoDetAft: st.cargoDetAft, cargoDetFwd: st.cargoDetFwd, cargoExtTest: st.cargoExtTest, fireTest: st.fireTest, set: st.set })));
  const pw = d.dcPower;
  const loopBad = (sel: CargoDet) => (sel === "A" ? !s.cargoLoopA : sel === "B" ? !s.cargoLoopB : !s.cargoLoopA && !s.cargoLoopB);
  const fault = pw && s.cargoFireInstalled && (loopBad(p.cargoDetFwd) || loopBad(p.cargoDetAft) || p.fireTest === "FAULT");
  const arm = (c: "FWD" | "AFT") => {
    if (!s.cargoFireInstalled) { s.patch({}, "CARGO FIRE system not installed (pre-SB 26A1081)."); return; }
    s.patch({ cargoArmed: s.cargoArmed === c ? "NONE" : c }, s.cargoArmed === c ? "CARGO FIRE ARM selector OFF." : `CARGO FIRE ARM — ${c} compartment selected.`);
  };
  const disch = () => {
    if (!s.cargoFireInstalled || s.cargoArmed === "NONE" || s.cargoBottleDischarged) return;
    s.patch({ cargoBottleDischarged: true, cargoAgentTimer: 0 }, `CARGO FIRE DISCH — agent released into the ${s.cargoArmed} compartment.`);
  };
  return (
    <div className="flex w-[150px] flex-col items-center gap-1 rounded-[3px] border border-[#2b2e32] bg-[#5b5e62] p-2">
      <span className={cn(LEGEND, "text-[7px]")}>CARGO FIRE</span>
      <div className="flex w-full items-center justify-between">
        <div className="flex flex-col items-center gap-0.5">
          <span className={cn(LEGEND, "text-[6px]")}>EXT</span>
          <div className="flex gap-1">
            <Lamp on={pw && s.cargoFireInstalled && (p.cargoExtTest || !s.cargoBottleDischarged)} size={12} />
            <Lamp on={pw && s.cargoFireInstalled && (p.cargoExtTest || !s.cargoBottleDischarged)} size={12} />
          </div>
          <PushButton label="TEST" onPress={() => p.set({ cargoExtTest: true })} onRelease={() => p.set({ cargoExtTest: false })} />
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span className={cn(LEGEND, "text-[6px]")}>DET SELECT</span>
          <div className="flex gap-1">
            <Selector3 options={["A", "NORM", "B"]} value={p.cargoDetFwd === "NORM" ? "NORM" : p.cargoDetFwd} onChange={(v) => p.set({ cargoDetFwd: v as CargoDet })} label="FWD" />
            <Selector3 options={["A", "NORM", "B"]} value={p.cargoDetAft === "NORM" ? "NORM" : p.cargoDetAft} onChange={(v) => p.set({ cargoDetAft: v as CargoDet })} label="AFT" />
          </div>
        </div>
      </div>
      <Annun label={<>DETECTOR<br />FAULT</>} on={fault} tone="amber" className="w-full" />
      <div className="flex w-full gap-1">
        <Annun label={<>ARMED<br />FWD</>} on={pw && s.cargoArmed === "FWD"} tone="amber" className="flex-1" onClick={() => arm("FWD")} />
        <Annun label={<>ARMED<br />AFT</>} on={pw && s.cargoArmed === "AFT"} tone="red" className="flex-1" onClick={() => arm("AFT")} />
      </div>
      <Annun label="DISCH" on={pw && s.cargoBottleDischarged} tone="amber" className="w-full" onClick={disch} />
      <div className="flex w-full gap-1">
        <Annun label="CARGO FWD" on={pw && d.cargoFwdFireWarn} tone="red" small className="flex-1" />
        <Annun label="CARGO AFT" on={pw && d.cargoAftFireWarn} tone="red" small className="flex-1" />
      </div>
    </div>
  );
}

function DataPrinter() {
  const [paper, setPaper] = useState(true);
  const [lamp, setLamp] = useState<"green" | "blue" | "amber" | null>(null);
  const d = useDerivedPick("dcPower");
  return (
    <Plate>
      <div className="mb-1 flex items-center justify-center gap-1">
        {(["green", "green", "green"] as const).map((_, i) => <span key={i} className={cn("h-3 w-6 rounded-[2px] border border-[#15171a]", i < 2 ? "bg-[#7a8f62]" : "bg-[#394b39]")} />)}
        <PushButton label="TEST" onPress={() => setLamp("amber")} onRelease={() => setLamp(null)} />
        <Annun label="MSG" on={d.dcPower && lamp === "amber"} tone="blue" small className="w-8" />
        <Annun label="PAPER" on={d.dcPower && (lamp === "amber" || !paper)} tone="amber" small className="w-8" />
        <Annun label="FAIL" on={d.dcPower && lamp === "amber"} tone="amber" small className="w-8" />
      </div>
      <div className="rounded-[6px] border border-[#2b2e32] bg-[#4d5054] px-6 py-3 text-center font-mono text-[9px] font-bold tracking-wider text-[#e6e1d2] shadow-inner">DATA PRINTER</div>
      <div className="mt-2 flex items-center justify-center gap-2">
        <button type="button" onClick={() => setPaper((v) => !v)} className="flex h-14 w-12 flex-col justify-around rounded-[2px] border border-[#15171a] bg-[#b9b6aa] px-1 py-1 font-mono text-[6px] font-bold text-[#2a2a24]">
          <span>FULL</span><span className={cn("h-px", paper ? "bg-black" : "bg-transparent")} /><span>EMPTY</span><span className="text-[5px]">PAPER</span>
        </button>
        <span className={cn(LEGEND, "text-[7px]")}>{paper ? "PAPER LOADED" : "PAPER EMPTY"}</span>
      </div>
    </Plate>
  );
}

function StabOverrideCabDoor() {
  const p = usePedestal(useShallow((st) => ({ cabDoorUnlocked: st.cabDoorUnlocked, set: st.set })));
  const s = useSimPick("patch", "stabTrimOverride");
  return (
    <Plate>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Toggle label="STAB TRIM" on={s.stabTrimOverride} onChange={(v) => s.patch({ stabTrimOverride: v }, `STAB TRIM OVERRIDE ${v ? "ON" : "OFF"}`)} upLabel="OVERRIDE" downLabel="NORMAL" guarded />
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className={cn(LEGEND, "text-[7px]")}>CAB DOOR</span>
          <Annun label={<>CAB DOOR<br />UNLOCKED</>} on={p.cabDoorUnlocked} tone="amber" className="w-16" onClick={() => p.set({ cabDoorUnlocked: !p.cabDoorUnlocked })} />
        </div>
      </div>
    </Plate>
  );
}


function OtherFunctions() {
  const p = usePedestal();
  const s = useSim();
  const trim = (dir: 1 | -1) => {
    const st = useSim.getState();
    if ((st.stabTrimCutoutA || st.stabTrimCutoutB) && !st.stabTrimOverride) return;
    st.patch({ stabTrimUnits: clamp(+(st.stabTrimUnits + dir * 0.1).toFixed(2), 0, 15) }, "STABILIZER TRIM INPUT");
  };
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      <Plate title="STAB TRIM">
        <div className="flex items-center justify-around gap-2">
          <Toggle guarded label="CUTOUT A" on={s.stabTrimCutoutA} onChange={(v) => s.patch({ stabTrimCutoutA: v }, `STAB TRIM CUTOUT A ${v ? "ACTIVE" : "NORMAL"}`)} upLabel="CUTOUT" />
          <Toggle guarded label="CUTOUT B" on={s.stabTrimCutoutB} onChange={(v) => s.patch({ stabTrimCutoutB: v }, `STAB TRIM CUTOUT B ${v ? "ACTIVE" : "NORMAL"}`)} upLabel="CUTOUT" />
          <div className="flex flex-col gap-1">
            <RepeatButton label="NOSE DN" onTick={() => trim(-1)} />
            <RepeatButton label="NOSE UP" onTick={() => trim(1)} />
            <span className={cn(LEGEND, "text-center text-[6px]")}>{s.stabTrimUnits.toFixed(1)} U</span>
          </div>
        </div>
      </Plate>
      <Plate title="FIRE SWITCHES">
        <PushButton label="LOCK OVRD" onPress={() => { p.set({ fireOverrideUntil: Date.now() + 12000 }); setTimeout(() => usePedestal.setState({}), 12100); }} />
      </Plate>
      <StabOverrideCabDoor />
      <CargoFire />
      <MicPanel side="L" />
      <MicPanel side="R" />
      <DataPrinter />
    </div>
  );
}

/* ════════════════════════════ ASSEMBLY ════════════════════════════ */

function Stage() {
  return (
    <div className="relative" style={{ width: STAGE_W, height: STAGE_H }}>
      <style>{`@keyframes pedroll{from{transform:translateY(-7px);opacity:.35}to{transform:none;opacity:1}}`}</style>
      <TopDeck />
      {/* pedestal case: lower body */}
      <Box x={240} y={755} w={600} h={821} className="rounded-[10px] border-[3px] border-[#0b0c0e] bg-[linear-gradient(180deg,#252a30,#15181c)] shadow-[0_6px_16px_rgba(0,0,0,.7),inset_0_0_0_2px_#3a4047]" />
      <ControlStand />
      <Box x={270} y={772} w={560} h={146} z={2}><FirePanel /></Box>
      <Radios />
      <LowerPlate />
    </div>
  );
}

/** The actual P8 pedestal face without the surrounding desktop-trainer UI. */
export function CenterPedestalFace() {
  return <Stage />;
}

export function CenterPedestal() {
  const wrap = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);
  const [zoom, setZoom] = useState<"fit" | 1 | 1.5>("fit");
  const [linked, setLinked] = useSwState("thrustLinked", true);
  const s = useSimPick("throttle1", "throttle2");
  useEffect(() => {
    const upd = () => setFit(Math.min(1.6, ((wrap.current?.clientWidth || STAGE_W) - 18) / STAGE_W));
    upd();
    const ro = new ResizeObserver(upd);
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);
  const scale = zoom === "fit" ? fit : zoom;
  return (
    <section className="relative rounded-xl border border-[#4a4f56] bg-[#202328] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,.04),0_8px_25px_rgba(0,0,0,.28)]">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="font-display text-[10px] uppercase tracking-[.18em] text-[#b9af98]">P8 · CENTER PEDESTAL · 737-200</div>
          <div className="font-display text-lg font-semibold text-fg">Interactive pedestal — every control is live</div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <button type="button" onClick={() => setLinked(!linked)} className={cn("rounded border px-2 py-1 font-mono text-[9px]", linked ? "border-accent/70 bg-accent/10 text-accent" : "border-border bg-inset text-subtle")}>THRUST LEVERS {linked ? "COUPLED" : "SPLIT"} · {Math.round(s.throttle1 * 100)}/{Math.round(s.throttle2 * 100)}%</button>
          <span className="ml-2 mr-1 font-mono text-[8px] uppercase text-subtle">Size</span>
          {([["fit", "FIT"], [1, "100%"], [1.5, "150%"]] as const).map(([z, l]) => (
            <button key={String(z)} type="button" onClick={() => setZoom(z)} className={cn("rounded border px-2 py-1 font-mono text-[9px]", zoom === z ? "border-accent/70 bg-accent/10 text-accent" : "border-border bg-inset text-subtle")}>{l}</button>
          ))}
        </div>
      </div>
      <div ref={wrap} data-scaled-panel className="max-h-[88vh] overflow-auto panel-scroll rounded-lg border border-[#343a42] bg-[#121417] p-2">
        <div style={{ width: STAGE_W * scale, height: STAGE_H * scale }}>
          <div style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${scale})`, transformOrigin: "top left" }}>
            <Stage />
          </div>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-muted">
        Drag the thrust handles, flap grip, speed-brake arm, start / parking-brake levers, trim wheels and the STAB drum; turn the knobs by dragging round them (double-click the rudder knob to centre). Tap a thrust handle to press its A/T DISENGAGE switch; tap a reverse claw to deploy / stow. Needs DC power for displays and lights (turn BATTERY on). Fire handles are locked until a fire warning exists — press LOCK OVRD to test.
      </p>
      <details className="mt-2 rounded-lg border border-[#343a42] bg-[#16191d] p-2">
        <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[.14em] text-[#b9af98]">Other pedestal functions (stab trim cutouts, override, cargo fire, audio selectors, data printer)</summary>
        <OtherFunctions />
      </details>
    </section>
  );
}

/**
 * The real P8 pedestal NAV 1 / NAV 2 / ADF radios and the amber data display, cut out of the same stage and wired to the same
 * stores (usePedestal / useDerived) as the pedestal on the cockpit page — not a copy of the controls. Used by the Navigation and
 * Autopilot training tabs so frequencies are always set on the actual pedestal units.
 */
const NR_X = 80, NR_Y = 1042, NR_W = 575, NR_H = 260;

export function PedestalNavRadios() {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(360);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const read = () => setW(el.clientWidth || 360);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = Math.max(0.55, Math.min(1.4, w / NR_W));
  return (
    <div>
      <div className="mb-1 font-mono text-[8px] uppercase text-subtle">Center pedestal (P8) · NAV 1 / NAV 2 / ADF · the real radios, same state as the pedestal</div>
      <div ref={wrap} data-scaled-panel className="overflow-x-auto overflow-y-hidden rounded border border-[#343a42] bg-[#121417]">
        <div style={{ width: NR_W * scale, height: NR_H * scale }}>
          <div style={{ position: "relative", overflow: "hidden", width: NR_W, height: NR_H, transform: `scale(${scale})`, transformOrigin: "top left" }}>
            <div style={{ position: "absolute", left: -NR_X, top: -NR_Y, width: STAGE_W, height: STAGE_H }}>
              <Box x={240} y={755} w={600} h={821} className="rounded-[10px] border-[3px] border-[#0b0c0e] bg-[linear-gradient(180deg,#252a30,#15181c)] shadow-[inset_0_0_0_2px_#3a4047]" />
              <Box x={262} y={1046} w={272} h={124}><NavUnit side="L" /></Box>
              <Box x={540} y={1046} w={282} h={124}><NavUnit side="R" /></Box>
              <Box x={258} y={1172} w={276} h={124}><AdfUnit /></Box>
              <Box x={540} y={1172} w={282} h={124}><DataDisplay /></Box>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
