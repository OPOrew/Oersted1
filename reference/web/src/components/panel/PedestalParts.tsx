import { useRef, useState, type PointerEvent as RPointerEvent, type MouseEvent as RMouseEvent, type ReactNode } from "react";
import { usePedestal } from "@/lib/sim/pedestal";
import { cn } from "@/lib/utils";

/* Shared look: grey 737 pedestal plates, black displays, cream legends. */
export const PLATE = "relative rounded-[3px] border border-[#2c2f33] bg-[#6a6d71] shadow-[inset_0_1px_0_rgba(255,255,255,.18),inset_0_-2px_6px_rgba(0,0,0,.35),0_2px_6px_rgba(0,0,0,.5)]";
export const LEGEND = "font-mono text-[8px] font-bold uppercase tracking-[.1em] text-[#e6e1d2]";

export function Screws({ n = 4 }: { n?: 2 | 4 }) {
  const c = "absolute size-2 rounded-full border border-[#2a2d31] bg-[#4d5054] shadow-inner";
  return (
    <>
      <span className={cn(c, "left-1 top-1")} />
      <span className={cn(c, "right-1 top-1")} />
      {n === 4 && <span className={cn(c, "bottom-1 left-1")} />}
      {n === 4 && <span className={cn(c, "bottom-1 right-1")} />}
    </>
  );
}

export function Plate({ title, className, children }: { title?: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn(PLATE, "p-2", className)}>
      <Screws />
      {title && <div className={cn(LEGEND, "mb-1 text-center")}>{title}</div>}
      {children}
    </div>
  );
}

/** Segment-style numeric readout. */
export function Readout({ value, lit = true, className }: { value: string; lit?: boolean; className?: string }) {
  return (
    <div className={cn("rounded-[2px] border border-[#111] bg-black px-2 py-0.5 text-center font-mono text-[15px] font-bold tabular-nums tracking-wider", lit ? "text-[#f1f1ea] [text-shadow:0_0_5px_rgba(255,255,255,.35)]" : "text-[#1b1b1b]", className)}>
      {lit ? value : value.replace(/[0-9]/g, "8")}
    </div>
  );
}

/** Annunciator light (amber / red / green / blue / white). Optional tap handler makes it a push-button light. */
const TONES = {
  amber: "border-[#a8741a] bg-[#e9a93a] text-[#2a1b00] shadow-[0_0_10px_rgba(233,169,58,.7)]",
  red: "border-[#8c1c1c] bg-[#e03a3a] text-white shadow-[0_0_10px_rgba(224,58,58,.75)]",
  green: "border-[#1d7a45] bg-[#38d27a] text-[#03230f] shadow-[0_0_10px_rgba(56,210,122,.65)]",
  blue: "border-[#2c5da8] bg-[#5b9bff] text-[#02112b] shadow-[0_0_10px_rgba(91,155,255,.65)]",
  white: "border-[#aaa] bg-[#f4f1e4] text-[#222] shadow-[0_0_10px_rgba(255,255,255,.55)]",
} as const;
const TONES_OFF = {
  amber: "text-[#d9a22b]",
  red: "text-[#d83a3a]",
  green: "text-[#3aa66a]",
  blue: "text-[#5b8fe0]",
  white: "text-[#d8d4c4]",
} as const;
export function Annun({ label, on, tone = "amber", onClick, className, small }: { label: ReactNode; on: boolean; tone?: keyof typeof TONES; onClick?: () => void; className?: string; small?: boolean }) {
  const cls = cn("flex items-center justify-center rounded-[2px] border px-1 text-center font-mono font-bold uppercase leading-[1.05]", small ? "min-h-[16px] text-[6px]" : "min-h-[20px] text-[7px]", on ? TONES[tone] : cn("border-[#55585c] bg-[#0b0c0d]", TONES_OFF[tone]), className);
  if (!onClick) return <div className={cls}>{label}</div>;
  return <button type="button" onClick={onClick} className={cn(cls, "active:translate-y-px")}>{label}</button>;
}

/** Round indicator lamp (green extinguisher-test lights, XPNDR FAULT, audio-panel LEDs). */
export function Lamp({ on, tone = "green", size = 8, className }: { on: boolean; tone?: "green" | "amber" | "red"; size?: number; className?: string }) {
  const lit = { green: "bg-[#38d27a] shadow-[0_0_8px_#38d27a]", amber: "bg-[#f2b230] shadow-[0_0_8px_#f2b230]", red: "bg-[#ff3b3b] shadow-[0_0_8px_#ff3b3b]" }[tone];
  return <span className={cn("inline-block rounded-full border border-[#0a0b0c]", on ? lit : "bg-[#1f3a2a]", className)} style={{ width: size, height: size }} />;
}

/** Push button with a legend (momentary: onPress). */
export function PushButton({ label, onPress, className, active, onRelease }: { label: ReactNode; onPress?: () => void; onRelease?: () => void; className?: string; active?: boolean }) {
  return (
    <button
      type="button"
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        onPress?.();
      }}
      onPointerUp={onRelease}
      onPointerLeave={onRelease}
      onPointerCancel={onRelease}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
      className={cn("rounded-[2px] border border-[#15171a] bg-[linear-gradient(180deg,#3d4146,#1d2024)] px-1.5 py-1 font-mono text-[8px] font-bold uppercase leading-none text-[#e6e1d2] shadow-[0_2px_3px_rgba(0,0,0,.6),inset_0_1px_0_rgba(255,255,255,.15)] active:translate-y-px active:brightness-125 panel-interactive", active && "border-[#8aa] text-white", className)}
      style={{ touchAction: "none", WebkitTouchCallout: "none" as never }}
    >
      {label}
    </button>
  );
}

/** Two-position toggle (latched). Bat-handle lever visibly points at the UP or DOWN legend; the active legend lights up. */
export function Toggle({ label, on, onChange, upLabel, downLabel, guarded, disabled }: { label?: string; on: boolean; onChange: (v: boolean) => void; upLabel?: string; downLabel?: string; guarded?: boolean; disabled?: boolean }) {
  const leg = (txt: string | undefined, active: boolean, target: boolean) => txt && (
    <button type="button" tabIndex={-1} disabled={disabled} onClick={() => { if (on !== target) onChange(target); }} className={cn(LEGEND, "text-[6px] leading-none", active ? "text-white [text-shadow:0_0_4px_rgba(255,255,255,.6)]" : "opacity-45")}>{txt}</button>
  );
  return (
    <div className="flex flex-col items-center gap-0.5">
      {leg(upLabel, on, true)}
      <button type="button" aria-label={`${label ?? "switch"} ${on ? upLabel ?? "UP" : downLabel ?? "DOWN"}`} aria-pressed={on} disabled={disabled} onClick={() => onChange(!on)} className={cn("relative h-12 w-7 rounded-[3px] border border-[#15171a] bg-[#14161a] shadow-[inset_0_0_6px_#000] disabled:opacity-50", guarded && "ring-1 ring-[#c03a2a]")}>
        {/* pivot collar */}
        <span className="absolute left-1/2 top-1/2 size-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#050607] bg-[radial-gradient(circle_at_35%_30%,#b9bdc2,#4a4e53)]" />
        {/* lever: rotates about the collar so it leans fully up or fully down */}
        <span className="absolute left-1/2 top-1/2 h-[19px] w-[7px] origin-top rounded-b-[3px] rounded-t-[1px] border border-[#050607] bg-[linear-gradient(90deg,#8a8e93,#e2e4e6_50%,#6a6e73)] shadow-[0_2px_3px_rgba(0,0,0,.8)] transition-transform duration-150" style={{ transform: `translate(-50%,0) rotate(${on ? 180 : 0}deg)` }} />
      </button>
      {leg(downLabel, !on, false)}
      {label && <span className={cn(LEGEND, "text-[6px]")}>{label}</span>}
    </div>
  );
}

/** Spring-loaded 3-position switch: held UP or DOWN while pressed, returns to centre on release. */
export function SpringSwitch({ label, up, down, value, onChange }: { label?: string; up: string; down: string; value: "UP" | "MID" | "DOWN"; onChange: (v: "UP" | "MID" | "DOWN") => void }) {
  const hold = (v: "UP" | "DOWN") => ({
    onPointerDown: (e: RPointerEvent) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      onChange(v);
    },
    onPointerUp: () => onChange("MID"),
    onPointerCancel: () => onChange("MID"),
    onContextMenu: (e: RMouseEvent) => { e.preventDefault(); e.stopPropagation(); },
  });
  return (
    <div
      className="flex flex-col items-center gap-0.5 panel-interactive"
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
      style={{ touchAction: "none", WebkitTouchCallout: "none" as never }}
    >
      <button type="button" aria-label={`${label ?? ""} ${up}`} {...hold("UP")} className={cn(LEGEND, "rounded px-1 text-[6px]", value === "UP" && "text-white underline")}>{up}</button>
      <div className="relative h-11 w-6 rounded-[3px] border border-[#15171a] bg-[#14161a] shadow-[inset_0_0_6px_#000]">
        <span className={cn("absolute left-1/2 h-[18px] w-[10px] -translate-x-1/2 rounded-[2px] border border-[#050607] bg-[linear-gradient(90deg,#8a8e93,#3b3f44,#8a8e93)] shadow-[0_2px_3px_rgba(0,0,0,.8)] transition-all duration-100", value === "UP" ? "top-[3px]" : value === "DOWN" ? "bottom-[3px]" : "top-[13px]")} />
      </div>
      <button type="button" aria-label={`${label ?? ""} ${down}`} {...hold("DOWN")} className={cn(LEGEND, "rounded px-1 text-[6px]", value === "DOWN" && "text-white underline")}>{down}</button>
      {label && <span className={cn(LEGEND, "text-[6px] opacity-80")}>{label}</span>}
    </div>
  );
}

/** Latched selector drawn as a pointer dial with each option printed around it at its own detent. */
export function Selector3({ label, options, value, onChange }: { label?: string; options: string[]; value: string; onChange: (v: string) => void }) {
  const n = options.length;
  const idx = Math.max(0, options.indexOf(value));
  const span = Math.min(120, 45 * (n - 1));
  const angOf = (i: number) => (n === 1 ? 0 : (i - (n - 1) / 2) * (span / (n - 1)));
  const size = 36;
  const R = size / 2 + 8;
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="relative" style={{ width: size + 54, height: size + 26 }}>
        {options.map((o, i) => {
          const a = (angOf(i) * Math.PI) / 180;
          const x = Math.sin(a), y = -Math.cos(a);
          const tr = x > 0.3 ? "translate(0,-50%)" : x < -0.3 ? "translate(-100%,-50%)" : "translate(-50%,-50%)";
          return (
            <button key={o} type="button" tabIndex={-1} onClick={() => onChange(o)} className={cn(LEGEND, "absolute whitespace-nowrap text-[6px] leading-none", i === idx ? "text-white [text-shadow:0_0_4px_rgba(255,255,255,.6)]" : "opacity-50")}
              style={{ left: `calc(50% + ${R * x + (x > 0.3 ? 2 : x < -0.3 ? -2 : 0)}px)`, top: `calc(50% + ${R * y + 3}px)`, transform: tr }}>{o}</button>
          );
        })}
        <button type="button" aria-label={`${label ?? "selector"} ${value}`} onClick={() => onChange(options[(idx + 1) % n])} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#15171a] bg-[radial-gradient(circle,#33373b,#0f1114)] shadow-[inset_0_1px_3px_rgba(255,255,255,.15)]" style={{ width: size, height: size, marginTop: 3 }}>
          <span className="absolute left-1/2 top-1/2 h-[18px] w-[6px] origin-bottom rounded-full bg-[linear-gradient(90deg,#9aa0a6,#d8dadc,#80868c)] shadow-[0_2px_3px_rgba(0,0,0,.7)] transition-transform duration-150" style={{ transform: `translate(-50%,-100%) rotate(${angOf(idx)}deg)` }} />
        </button>
      </div>
      {label && <span className={cn(LEGEND, "text-[6px]")}>{label}</span>}
    </div>
  );
}

function angleFrom(el: HTMLElement, x: number, y: number) {
  const r = el.getBoundingClientRect();
  return (Math.atan2(x - (r.left + r.width / 2), -(y - (r.top + r.height / 2))) * 180) / Math.PI;
}

/** Absolute rotary knob (-135..135 degrees mapped onto min..max). Legends in `ticks` are printed around the knob at their detents (first at -135°, last at +135°) with a tick mark each; the one the pointer is on lights up. */
export function Knob({ label, value, min = 0, max = 1, step = 0, onChange, size = 40, ticks, compact }: { label?: string; value: number; min?: number; max?: number; step?: number; onChange: (v: number) => void; size?: number; ticks?: string[]; compact?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const frac = (value - min) / (max - min || 1);
  const angle = -135 + Math.max(0, Math.min(1, frac)) * 270;
  const set = (x: number, y: number) => {
    if (!ref.current) return;
    const a = Math.max(-135, Math.min(135, angleFrom(ref.current, x, y)));
    let v = min + ((a + 135) / 270) * (max - min);
    if (step) v = Math.round(v / step) * step;
    onChange(Math.max(min, Math.min(max, v)));
  };
  const n = ticks?.length ?? 0;
  const tickAng = (i: number) => (n <= 1 ? -135 : -135 + (i / (n - 1)) * 270);
  const activeIdx = n ? ticks!.reduce((best, _, i) => (Math.abs(tickAng(i) - angle) < Math.abs(tickAng(best) - angle) ? i : best), 0) : -1;
  const R = size / 2 + 9;
  const boxW = size + (compact ? 30 : 56), boxH = size + 26; // compact: narrower layout box for tight panels (labels may overhang it slightly)
  const dial = (
    <div
      ref={ref}
      role="slider"
      aria-label={label}
      aria-valuenow={value}
      className="relative touch-none select-none rounded-full border border-[#8b8e92] bg-[radial-gradient(circle_at_35%_30%,#e8e8e8,#a9abae_45%,#6c6e72)] shadow-[0_3px_6px_rgba(0,0,0,.6),inset_0_-3px_5px_rgba(0,0,0,.3)]"
      style={{ width: size, height: size }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); set(e.clientX, e.clientY); }}
      onPointerMove={(e) => { if (e.buttons === 1) set(e.clientX, e.clientY); }}
    >
      <span className="absolute left-1/2 top-1/2 origin-bottom rounded-full bg-[#1a1c1f]" style={{ width: 3, height: size * 0.42, transform: `translate(-50%,-100%) rotate(${angle}deg)` }} />
    </div>
  );
  return (
    <div className="flex flex-col items-center gap-0.5">
      {n ? (
        <div className="relative" style={{ width: boxW, height: boxH }}>
          {ticks!.map((t, i) => {
            const a = (tickAng(i) * Math.PI) / 180;
            const x = Math.sin(a), y = -Math.cos(a);
            const tr = x > 0.3 ? "translate(0,-50%)" : x < -0.3 ? "translate(-100%,-50%)" : "translate(-50%,-50%)";
            const on = i === activeIdx;
            return (
              <div key={`${t}-${i}`}>
                <span className={cn("absolute h-[5px] w-px origin-top", on ? "bg-white" : "bg-[#e6e1d2]/60")} style={{ left: `calc(50% + ${(size / 2 + 1) * x}px)`, top: `calc(50% + ${(size / 2 + 1) * y}px)`, transform: `rotate(${tickAng(i) + 180}deg)` }} />
                <span className={cn(LEGEND, "pointer-events-none absolute whitespace-pre text-center text-[6px] leading-none", on ? "text-white [text-shadow:0_0_4px_rgba(255,255,255,.6)]" : "opacity-55")}
                  style={{ left: `calc(50% + ${R * x + (x > 0.3 ? 2 : x < -0.3 ? -2 : 0)}px)`, top: `calc(50% + ${R * y}px)`, transform: tr }}>{t}</span>
              </div>
            );
          })}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">{dial}</div>
        </div>
      ) : dial}
      {label && <span className={cn(LEGEND, "text-[6px]")}>{label}</span>}
    </div>
  );
}

/** Endless tuning knob: every ~20 degrees of rotation emits one +1 / -1 step. */
export function TuneKnob({ label, onStep, size = 40 }: { label?: string; onStep: (d: 1 | -1) => void; size?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef<number | null>(null);
  const acc = useRef(0);
  const [rot, setRot] = useState(0);
  const move = (x: number, y: number) => {
    if (!ref.current) return;
    const a = angleFrom(ref.current, x, y);
    if (last.current === null) { last.current = a; return; }
    let d = a - last.current;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    last.current = a;
    acc.current += d;
    setRot((r) => r + d);
    while (acc.current >= 20) { acc.current -= 20; onStep(1); }
    while (acc.current <= -20) { acc.current += 20; onStep(-1); }
  };
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div
        ref={ref}
        role="slider"
        aria-label={label ?? "tune"}
        className="relative touch-none select-none rounded-full border border-[#8b8e92] bg-[radial-gradient(circle_at_35%_30%,#e8e8e8,#a9abae_45%,#6c6e72)] shadow-[0_3px_6px_rgba(0,0,0,.6)]"
        style={{ width: size, height: size }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); last.current = null; acc.current = 0; move(e.clientX, e.clientY); }}
        onPointerMove={(e) => { if (e.buttons === 1) move(e.clientX, e.clientY); }}
        onPointerUp={() => { last.current = null; }}
      >
        <span className="absolute inset-0" style={{ transform: `rotate(${rot}deg)` }}>
          <span className="absolute left-1/2 top-[3px] h-[35%] w-[3px] -translate-x-1/2 rounded-full bg-[#1a1c1f]" />
          {[0, 90, 180, 270].map((a) => <span key={a} className="absolute left-1/2 top-1/2 h-[6px] w-[6px] rounded-full bg-[#55585c]/50" style={{ transform: `rotate(${a}deg) translateY(-${size * 0.28}px)` }} />)}
        </span>
      </div>
      {label && <span className={cn(LEGEND, "text-[6px]")}>{label}</span>}
    </div>
  );
}

/* ───────────────────────── CDU (FMC control display unit) ───────────────────────── */

type CduField = { id: string; side: "L" | "C" | "R"; row: number; label: string; def?: string };
const PAGES: Record<string, { title: string; pg?: string; fields: CduField[] }> = {
  CRZ: { title: "ACT ECON CRZ", pg: "1/1", fields: [
    { id: "alt", side: "L", row: 1, label: "CRZ ALT", def: "FL310" }, { id: "optmax", side: "C", row: 1, label: "OPT/MAX", def: "FL340/361" }, { id: "step", side: "R", row: 1, label: "STEP", def: "-----" },
    { id: "spd", side: "L", row: 2, label: "TGT SPD", def: ".780" }, { id: "todist", side: "R", row: 2, label: "TO T/D", def: "2004.5Z/ 100NM" },
    { id: "turb", side: "L", row: 3, label: "TURB N1", def: "87.3/ 87.3%" }, { id: "wind", side: "R", row: 3, label: "ACTUAL WIND", def: "129°/ 14" },
    { id: "fuel", side: "L", row: 4, label: "FUEL AT KATL", def: "12.5" }, { id: "eng", side: "R", row: 5, label: "", def: "ENG OUT>" },
    { id: "lrc", side: "L", row: 6, label: "", def: "<LRC" }, { id: "rta", side: "R", row: 6, label: "", def: "RTA>" } ] },
  LEGS: { title: "ACT RTE LEGS", pg: "1/4", fields: [
    { id: "w1", side: "L", row: 1, label: "129° HDG", def: "LACO1" }, { id: "w1a", side: "R", row: 1, label: "1NM", def: "250/ 4690" },
    { id: "w2", side: "L", row: 2, label: "70°", def: "VAMPS" }, { id: "w2a", side: "R", row: 2, label: "7NM", def: "250/ 8000A" },
    { id: "w3", side: "L", row: 3, label: "85°", def: "BANDR" }, { id: "w3a", side: "R", row: 3, label: "35NM", def: ".800/FL190" },
    { id: "w4", side: "L", row: 4, label: "330°", def: "BANO1" }, { id: "w4a", side: "R", row: 4, label: "1NM BYPASS", def: ".800/FL190" },
    { id: "w5", side: "L", row: 5, label: "89°", def: "BEEZR" }, { id: "w5a", side: "R", row: 5, label: "20NM", def: ".800/FL190" },
    { id: "rnp", side: "L", row: 6, label: "RNP/ACTUAL", def: "0.50/0.21NM" }, { id: "data", side: "R", row: 6, label: "", def: "RTE DATA>" } ] },
  RTE: { title: "RTE 1", pg: "1/2", fields: [
    { id: "org", side: "L", row: 1, label: "ORIGIN", def: "-----" }, { id: "dst", side: "R", row: 1, label: "DEST", def: "-----" },
    { id: "rwy", side: "L", row: 2, label: "RUNWAY", def: "-----" }, { id: "flt", side: "R", row: 2, label: "FLT NO", def: "--------" },
    { id: "co", side: "L", row: 3, label: "CO ROUTE", def: "--------" }, { id: "act", side: "R", row: 6, label: "", def: "ACTIVATE>" } ] },
  CLB: { title: "ACT ECON CLB", pg: "1/1", fields: [
    { id: "alt", side: "L", row: 1, label: "CRZ ALT", def: "FL310" }, { id: "spd", side: "L", row: 2, label: "TGT SPD", def: "290/.780" },
    { id: "lim", side: "R", row: 1, label: "SPD REST", def: "250/10000" } ] },
  DES: { title: "ACT ECON DES", pg: "1/1", fields: [
    { id: "spd", side: "L", row: 1, label: "E/D AT", def: "-----" }, { id: "mach", side: "L", row: 2, label: "TGT SPD", def: ".780/280" }, { id: "alt", side: "R", row: 1, label: "SPD REST", def: "240/10000" } ] },
  PROG: { title: "PROGRESS", pg: "1/2", fields: [
    { id: "last", side: "L", row: 1, label: "LAST", def: "LACO1" }, { id: "to", side: "L", row: 2, label: "TO", def: "VAMPS" }, { id: "next", side: "L", row: 3, label: "NEXT", def: "BANDR" } ] },
  HOLD: { title: "HOLD", fields: [{ id: "fix", side: "L", row: 1, label: "FIX", def: "-----" }, { id: "q", side: "L", row: 2, label: "QUAD/RADIAL", def: "---/---°" }] },
  "INIT REF": { title: "INIT/REF INDEX", fields: [{ id: "id", side: "L", row: 1, label: "", def: "<IDENT" }, { id: "pos", side: "L", row: 2, label: "", def: "<POS" }, { id: "perf", side: "L", row: 3, label: "", def: "<PERF" }, { id: "to", side: "L", row: 4, label: "", def: "<TAKEOFF" }, { id: "app", side: "R", row: 1, label: "", def: "APPROACH>" }] },
  "N1 LIMIT": { title: "N1 LIMIT", fields: [{ id: "sel", side: "L", row: 1, label: "SEL/OAT", def: "TO/15°C" }, { id: "n1", side: "R", row: 1, label: "N1", def: "93.8%" }, { id: "cl", side: "L", row: 3, label: "", def: "<CLB" }] },
  FIX: { title: "FIX INFO", fields: [{ id: "fix", side: "L", row: 1, label: "FIX", def: "-----" }] },
  "DEP ARR": { title: "DEP/ARR INDEX", fields: [{ id: "dep", side: "L", row: 1, label: "<DEP", def: "-----" }, { id: "arr", side: "R", row: 1, label: "ARR>", def: "-----" }] },
  "DIR INTC": { title: "DIRECT-TO", fields: [{ id: "to", side: "L", row: 1, label: "DIRECT TO", def: "-----" }] },
  MENU: { title: "MENU", fields: [{ id: "fmc", side: "L", row: 1, label: "", def: "<FMC" }, { id: "acars", side: "L", row: 2, label: "", def: "<ACARS" }] },
};

const KEYROWS: string[][] = [
  ["A", "B", "C", "D", "E"], ["F", "G", "H", "I", "J"], ["K", "L", "M", "N", "O"], ["P", "Q", "R", "S", "T"], ["U", "V", "W", "X", "Y"], ["Z", "SP", "DEL", "/", "CLR"],
];
const FUNCS = [["INIT REF", "RTE", "CLB", "CRZ", "DES"], ["MENU", "LEGS", "DEP ARR", "HOLD", "PROG"], ["N1 LIMIT", "FIX", "DIR INTC"]];
const FKEY_LABEL: Record<string, string> = { "INIT REF": "INIT\nREF", "DEP ARR": "DEP\nARR", "N1 LIMIT": "N1\nLIMIT", "DIR INTC": "DIR\nINTC" };

export function Cdu({ side, power }: { side: "L" | "R"; power: boolean }) {
  const st = usePedestal((s) => (side === "L" ? s.cduL : s.cduR));
  const setCdu = usePedestal((s) => s.setCdu);
  const page = PAGES[st.page] ?? PAGES.CRZ;
  const fieldVal = (f: CduField) => st.fields[`${st.page}:${f.id}`] ?? f.def ?? "";
  const typed = (ch: string) => {
    if (!power) return;
    if (st.pad === "DELETE" || st.msg) { setCdu(side, { pad: ch, msg: "" }); return; }
    if (st.pad.length < 24) setCdu(side, { pad: st.pad + ch });
  };
  const lsk = (f: CduField) => {
    if (!power) return;
    if (!f.def || /[<>]$|^[<]|[>]$/.test(f.def)) { setCdu(side, { page: f.id === "act" ? "CRZ" : st.page, exec: f.id === "act" ? true : st.exec }); return; }
    const key = `${st.page}:${f.id}`;
    if (st.pad === "DELETE") { const nf = { ...st.fields }; delete nf[key]; setCdu(side, { fields: nf, pad: "", exec: true }); return; }
    if (st.pad) { setCdu(side, { fields: { ...st.fields, [key]: st.pad }, pad: "", exec: true }); return; }
    setCdu(side, { pad: fieldVal(f) });
  };
  const key = (k: string) => {
    if (!power) return;
    if (k === "CLR") { setCdu(side, st.msg ? { msg: "" } : { pad: st.pad === "DELETE" ? "" : st.pad.slice(0, -1) }); return; }
    if (k === "DEL") { setCdu(side, { pad: "DELETE" }); return; }
    if (k === "SP") { typed(" "); return; }
    typed(k);
  };
  const KB = "h-[17px] rounded-[2px] border border-[#1a1c1f] bg-[linear-gradient(180deg,#d9d7cf,#9b9990)] font-mono text-[8px] font-bold text-[#222] shadow-[0_1px_2px_rgba(0,0,0,.6)] active:translate-y-px active:brightness-90";
  const FK = "h-[17px] rounded-[2px] border border-[#1a1c1f] bg-[linear-gradient(180deg,#46494d,#25272a)] px-0.5 font-mono text-[6px] font-bold leading-[7px] text-[#e6e1d2] whitespace-pre shadow-[0_1px_2px_rgba(0,0,0,.6)] active:translate-y-px";
  return (
    <div className={cn(PLATE, "w-[250px] p-2")}>
      <Screws />
      <div className="grid grid-cols-[12px_1fr_12px] gap-1">
        <div className="flex flex-col justify-around py-2">{[1, 2, 3, 4, 5, 6].map((r) => { const f = page.fields.find((x) => x.side === "L" && x.row === r); return <button key={r} aria-label={`${side} CDU LSK L${r}`} onClick={() => f && lsk(f)} className="h-[10px] w-full rounded-[1px] border border-[#222] bg-[#2b2e32] active:bg-[#555]" />; })}</div>
        <div className={cn("relative h-[132px] overflow-hidden rounded-[3px] border-2 border-[#16181b] p-1 font-mono text-[8px] leading-[10px]", power ? "bg-black text-[#d8ffe0]" : "bg-[#07090a] text-transparent")}>
          {power && (
            <>
              <div className="flex justify-between"><span /><span className="text-white">{page.title}</span><span>{page.pg ?? ""}</span></div>
              {[1, 2, 3, 4, 5, 6].map((r) => (
                <div key={r} className="absolute left-1 right-1 grid grid-cols-[1fr_auto_1fr] items-end" style={{ top: 8 + (r - 1) * 18 }}>
                  {(["L", "C", "R"] as const).map((sd) => {
                    const f = page.fields.find((x) => x.side === sd && x.row === r);
                    return (
                      <div key={sd} className={cn("flex min-w-0 flex-col", sd === "R" && "items-end")}>
                        <span className="text-[6px] leading-[7px] text-[#9ec8a8]">{f?.label ?? ""}</span>
                        <span className={cn("whitespace-nowrap leading-[9px]", f && st.fields[`${st.page}:${f.id}`] ? "text-[#7ff]" : "text-white")}>{f ? fieldVal(f) : ""}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
              <div className="absolute inset-x-1 bottom-0 flex justify-between leading-[10px]"><span className="text-white">{st.msg || st.pad || "□□□□□□□□□□□□"}</span></div>
            </>
          )}
        </div>
        <div className="flex flex-col justify-around py-2">{[1, 2, 3, 4, 5, 6].map((r) => { const f = page.fields.find((x) => x.side === "R" && x.row === r); return <button key={r} aria-label={`${side} CDU LSK R${r}`} onClick={() => f && lsk(f)} className="h-[10px] w-full rounded-[1px] border border-[#222] bg-[#2b2e32] active:bg-[#555]" />; })}</div>
      </div>
      <div className="mt-1 grid grid-cols-[1fr_auto] gap-1">
        <div className="grid grid-cols-5 gap-[2px]">
          {FUNCS.flat().map((f) => <button key={f} onClick={() => power && setCdu(side, { page: f in PAGES ? f : st.page, msg: "" })} className={cn(FK, st.page === f && "text-white brightness-125")}>{FKEY_LABEL[f] ?? f}</button>)}
          <button onClick={() => power && setCdu(side, { exec: false })} className={cn(FK, "col-span-2 relative")}><span className={cn("absolute left-1 top-1 h-[3px] w-6 rounded-sm", power && st.exec ? "bg-[#f2f2f2] shadow-[0_0_6px_#fff]" : "bg-[#3a3d40]")} />EXEC</button>
        </div>
        <div className="flex w-[24px] flex-col items-center justify-between py-0.5">
          <div className={cn("h-3 w-3 rounded-full", power && (st.msg || st.exec) ? "bg-[#f4efd8] shadow-[0_0_6px_#fff]" : "bg-[#2e3033]")} />
          <span className={cn(LEGEND, "text-[5px]")}>MSG</span>
        </div>
      </div>
      <div className="mt-1 grid grid-cols-[repeat(5,1fr)] gap-[2px]">
        {KEYROWS.flat().map((k) => <button key={k} onClick={() => key(k)} className={KB}>{k}</button>)}
      </div>
      <div className="mt-1 grid grid-cols-6 gap-[2px]">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((k) => <button key={k} onClick={() => key(k)} className={KB}>{k}</button>)}
        <button onClick={() => key(".")} className={KB}>.</button>
        <button onClick={() => power && setCdu(side, { pad: st.pad.startsWith("-") ? st.pad.slice(1) : "-" + st.pad })} className={KB}>+/-</button>
      </div>
    </div>
  );
}
