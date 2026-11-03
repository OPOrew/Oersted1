import { useShallow } from "zustand/react/shallow";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSim, useSimPick, useDerivedPick } from "@/lib/sim/store";
import { useOverheadLocal, type DsplSel, type IrsMode } from "@/lib/sim/overheadLocal";
import { Annun, Knob, LEGEND, PLATE, Plate, PushButton, Screws, Selector3 } from "@/components/panel/PedestalParts";
import { cn } from "@/lib/utils";
import { canResetGeneratorDrive } from "../../lib/sim/maintenanceInterlocks";

/**
 * Interactive 737-200 forward overhead (P5), laid out to match the reference picture:
 *   5 columns (ELT/LE · IRS/FLT CONTROL/ELEC · SERVICE/CB/EQUIP · AUDIO/ICE/HYD · RECORDER/AIR COND/PRESS),
 *   an INDEX-TO-LOCK band with DOME WHITE, and the landing-light / engine-start strip along the bottom.
 * Systems controls are wired to the sim (useSim); items the sim doesn't model keep local state
 * (useOverheadLocal): IRS, ELT, audio selectors, flight recorder, oxygen, warning tests, transfer switches...
 * Displays and lights need DC power (turn BATTERY on).
 */

const DESIGN_W = 1008; // = columns 972 + gaps 16 + padding 16 + border 4
const COLS = "grid-cols-[216px_224px_98px_217px_217px]";
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const LIGHT_PLATE = "bg-[#9b9ea2]";

/* ───────────────────────── primitives ───────────────────────── */

/** Vertical bat-handle switch with N positions (top → bottom). Tap the track to choose a position. */
function VSwitch<T extends string>({ label, options, value, onChange, guarded, spring, small, legends }: {
  label?: string; options: T[]; value: T; onChange: (v: T) => void; guarded?: boolean; spring?: T; small?: boolean; legends?: string[];
}) {
  const n = options.length;
  const idx = Math.max(0, options.indexOf(value));
  const h = small ? 34 : n > 2 ? 54 : 42;
  const pick = (clientY: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const i = clamp(Math.floor(((clientY - r.top) / r.height) * n), 0, n - 1);
    onChange(options[i]);
  };
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="flex items-center gap-0.5">
        {legends && <div className="flex flex-col justify-between text-right" style={{ height: h }}>{legends.map((l, i) => <span key={`${l}-${i}`} className={cn(LEGEND, "text-[5px] leading-none", i === idx && "text-white")}>{l}</span>)}</div>}
        <div
          role="slider"
          aria-label={label}
          aria-valuetext={value}
          className={cn("relative w-[22px] touch-none select-none rounded-[3px] border border-[#15171a] bg-[#101214] shadow-[inset_0_0_6px_#000]", guarded && "ring-1 ring-[#c03a2a]")}
          style={{ height: h }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pick(e.clientY, e.currentTarget); }}
          onPointerUp={() => { if (spring !== undefined) onChange(spring); }}
          onPointerCancel={() => { if (spring !== undefined) onChange(spring); }}
        >
          <span className="absolute left-1/2 w-[9px] -translate-x-1/2 rounded-[2px] border border-[#050607] bg-[linear-gradient(90deg,#9a9ea3,#464a4f,#9a9ea3)] shadow-[0_2px_3px_rgba(0,0,0,.8)] transition-all duration-100" style={{ height: h / n - 3, top: 2 + idx * ((h - 4) / n) }} />
        </div>
      </div>
      {label && <span className={cn(LEGEND, "max-w-[64px] text-center text-[5.5px] leading-[7px]")}>{label}</span>}
    </div>
  );
}

/** Horizontal bat-handle switch with N positions (left → right), legends printed above each position. */
function HSwitch<T extends string>({ label, options, value, onChange, legends, guarded }: {
  label?: string; options: T[]; value: T; onChange: (v: T) => void; legends?: string[]; guarded?: boolean;
}) {
  const n = options.length;
  const idx = Math.max(0, options.indexOf(value));
  const w = n > 2 ? 66 : 46;
  const pick = (clientX: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    onChange(options[clamp(Math.floor(((clientX - r.left) / r.width) * n), 0, n - 1)]);
  };
  return (
    <div className="flex flex-col items-center gap-0.5">
      {legends && <div className="flex justify-between" style={{ width: w }}>{legends.map((l, i) => <span key={`${l}-${i}`} className={cn(LEGEND, "text-[5px] leading-none", i === idx && "text-white")}>{l}</span>)}</div>}
      <div
        role="slider"
        aria-label={label}
        aria-valuetext={value}
        className={cn("relative h-[20px] touch-none select-none rounded-[3px] border border-[#15171a] bg-[#101214] shadow-[inset_0_0_6px_#000]", guarded && "ring-1 ring-[#c03a2a]")}
        style={{ width: w }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pick(e.clientX, e.currentTarget); }}
      >
        <span className="absolute top-1/2 h-[9px] -translate-y-1/2 rounded-[2px] border border-[#050607] bg-[linear-gradient(180deg,#9a9ea3,#464a4f,#9a9ea3)] shadow-[0_2px_3px_rgba(0,0,0,.8)] transition-all duration-100" style={{ width: w / n - 3, left: 2 + idx * ((w - 4) / n) }} />
      </div>
      {label && <span className={cn(LEGEND, "max-w-[80px] text-center text-[5.5px] leading-[7px]")}>{label}</span>}
    </div>
  );
}

function OnOff({ label, on, onChange, small, guarded, legends }: { label?: string; on: boolean; onChange: (v: boolean) => void; small?: boolean; guarded?: boolean; legends?: [string, string] }) {
  return <VSwitch<"ON" | "OFF"> label={label} options={["ON", "OFF"]} value={on ? "ON" : "OFF"} onChange={(v) => onChange(v === "ON")} small={small} guarded={guarded} legends={legends} />;
}

/** Upper position = OFF, lower = ON (the way the reference picture prints most 2-position toggles). */
function OffOn({ label, on, onChange, small, legends }: { label?: string; on: boolean; onChange: (v: boolean) => void; small?: boolean; legends?: [string, string] }) {
  return <VSwitch<"OFF" | "ON"> label={label} options={["OFF", "ON"]} value={on ? "ON" : "OFF"} onChange={(v) => onChange(v === "ON")} small={small} legends={legends ?? ["OFF", "ON"]} />;
}

const GAUGE_PRESETS: Record<string, { nums: string[]; unit?: string }> = {
  "EGT °C": { nums: ["0", "200", "400", "600", "800"], unit: "EGT" },
  "APU EGT": { nums: ["0", "2", "4", "6", "8", "10"], unit: "EGT" },
  "RPM %": { nums: ["0", "20", "40", "60", "80", "100", "110"], unit: "RPM" },
  "AC AMPS": { nums: ["0", "50", "100", "150", "200"], unit: "AC AMPS" },
  "AC VOLTS": { nums: ["100", "110", "120", "130"], unit: "AC VOLTS" },
  "FREQ": { nums: ["380", "400", "420"], unit: "FREQ" },
  "DC AMPS": { nums: ["-50", "0", "50"], unit: "DC AMPS" },
  "DC VOLTS": { nums: ["0", "10", "20", "30", "40"], unit: "DC VOLTS" },
  "DRIVE TEMP": { nums: ["40", "80", "120", "160"], unit: "°C" },
  "FUEL TEMP °C": { nums: ["-40", "-20", "0", "20", "40"], unit: "FUEL TEMP" },
  "DUCT PRESS": { nums: ["0", "20", "40", "60", "80"], unit: "DUCT PRESS" },
  "DUCT TEMP": { nums: ["-20", "0", "20", "40", "60", "80", "100"], unit: "TEMP °C" },
  "CAB ALT / ΔP": { nums: ["0", "2", "4", "6", "8", "10"], unit: "ΔP PSI" },
  "CAB CLIMB": { nums: ["-2", "-1", "0", "1", "2"], unit: "CLIMB" },
  "OXY PRESS PSI ×100": { nums: ["0", "5", "10", "15", "20"], unit: "PSI × 100" },
  "OUTFLOW VALVE": { nums: ["CLOSE", "", "OPEN"], unit: "VALVE" },
};

function Gauge({ label, sub, value, min, max, size = 54, ticks = 5, redFrom }: { label?: string; sub?: string; value: number; min: number; max: number; size?: number; ticks?: number; redFrom?: number }) {
  // P5 instrument face: black upper face, grey lower case, compact aircraft-style scale.
  const f = clamp((value - min) / (max - min || 1), 0, 1);
  const a = -118 + f * 236;
  const pt = (deg: number, r: number, cy = 54) => [50 + Math.sin((deg * Math.PI) / 180) * r, cy - Math.cos((deg * Math.PI) / 180) * r];
  const title = (label ?? "").replace(/\s+/g, " ").trim();
  const cfg = GAUGE_PRESETS[title] ?? { nums: Array.from({ length: ticks + 1 }, (_, i) => String(Math.round(min + (i / ticks) * (max - min)))), unit: sub };
  const n = cfg.nums.length;
  const scaleTicks = Math.max(1, n - 1);
  const face = `M 4 54 A 46 46 0 0 1 96 54 L 96 91 Q 96 96 91 96 L 9 96 Q 4 96 4 91 Z`;
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 100 100" width={size} height={size} aria-label={label}>
        <path d={face} fill="#0c0d0f" stroke="#a1a4a7" strokeWidth="2" />
        <path d="M4 54 A46 46 0 0 0 96 54 L96 96 L4 96 Z" fill="#777a7e" />
        {cfg.nums.map((num, i) => {
          const d = -118 + (i / scaleTicks) * 236;
          const [x1, y1] = pt(d, 36);
          const [x2, y2] = pt(d, 44);
          const val = min + (i / scaleTicks) * (max - min);
          const red = redFrom !== undefined && val >= redFrom;
          const [tx, ty] = pt(d, 29);
          return <g key={i}><line x1={x1} y1={y1} x2={x2} y2={y2} stroke={red ? "#ef5757" : "#f3edda"} strokeWidth="1.35" /><text x={tx} y={ty + 2} textAnchor="middle" fontSize="5.1" fill={red ? "#ef5757" : "#f3edda"} fontFamily="monospace">{num}</text></g>;
        })}
        <text x="50" y="64" textAnchor="middle" fontSize="5.2" fill="#151619" fontFamily="monospace" fontWeight="700">{cfg.unit ?? ""}</text>
        <text x="50" y="72" textAnchor="middle" fontSize="4.5" fill="#151619" fontFamily="monospace">{sub && sub !== cfg.unit ? sub : ""}</text>
        <line x1="50" y1="54" x2={pt(a, 33)[0]} y2={pt(a, 33)[1]} stroke="#f5efda" strokeWidth="2.1" strokeLinecap="round" />
        <circle cx="50" cy="54" r="3" fill="#222428" stroke="#b4b7ba" strokeWidth=".7" />
      </svg>
    </div>
  );
}

/** Small round COLD–HOT valve-position dial. */
function MixDial({ value, size = 38, label, onChange, disabled = false }: { value: number; size?: number; label?: string; onChange?: (v: number) => void; disabled?: boolean }) {
  const a = -120 + clamp(value, 0, 1) * 240;
  const p = (d: number, r: number): [number, number] => [50 + Math.sin((d * Math.PI) / 180) * r, 50 - Math.cos((d * Math.PI) / 180) * r];
  const [nx, ny] = p(a, 34);
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 100 100" width={size} height={size} aria-label={label}>
        <circle cx="50" cy="50" r="46" fill="#0c0d0f" stroke="#a1a4a7" strokeWidth="3" />
        {Array.from({ length: 9 }).map((_, i) => { const d = -120 + i * 30; const [x1, y1] = p(d, 36); const [x2, y2] = p(d, 44); return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#f3edda" strokeWidth="2" />; })}
        <text x="22" y="86" fontSize="9" fill="#f3edda" fontFamily="monospace" textAnchor="middle">COLD</text>
        <text x="78" y="86" fontSize="9" fill="#f3edda" fontFamily="monospace" textAnchor="middle">HOT</text>
        <line x1="50" y1="50" x2={nx} y2={ny} stroke="#f5efda" strokeWidth="4" strokeLinecap="round" />
        <circle cx="50" cy="50" r="6" fill="#222428" stroke="#b4b7ba" strokeWidth="1" />
      </svg>
      {onChange && <input aria-label={`${label ?? "Air mix"} manual mix valve position`} className="w-14 accent-amber-500 disabled:opacity-40" type="range" min={0} max={1} step={0.01} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.currentTarget.value))} />}
    </div>
  );
}

function RedGuarded({ label, value, options, onChange, legends }: { label?: string; value: string; options: string[]; onChange: (v: string) => void; legends?: string[] }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      {label && <Cap>{label}</Cap>}
      <div className="relative rounded-[3px] border-2 border-[#7b1515] bg-[#b51f1f] p-1 shadow-[inset_0_0_8px_rgba(0,0,0,.55),0_2px_4px_rgba(0,0,0,.5)]">
        <VSwitch options={options as string[]} value={value} onChange={(v) => onChange(v)} legends={legends ?? options} small />
      </div>
    </div>
  );
}

function RoundBtn({ label, onPress, onRelease }: { label?: string; onPress?: () => void; onRelease?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-0.5 panel-interactive" style={{ touchAction: "none", WebkitTouchCallout: "none" as never }}>
      {label && <span className={cn(LEGEND, "text-[5.5px]")}>{label}</span>}
      <button
        type="button"
        aria-label={label}
        onPointerDown={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          onPress?.();
        }}
        onPointerUp={onRelease}
        onPointerLeave={onRelease}
        onPointerCancel={onRelease}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
        className="size-[20px] rounded-full border-2 border-[#1a1c1f] bg-[radial-gradient(circle_at_40%_35%,#e3e4e6,#8d9095_55%,#4b4e53)] shadow-[0_2px_3px_rgba(0,0,0,.6)] active:translate-y-px active:brightness-90"
      />
    </div>
  );
}

const Row = ({ children, className }: { children: ReactNode; className?: string }) => <div className={cn("flex items-start justify-around gap-1", className)}>{children}</div>;
const Cap = ({ children, className }: { children: ReactNode; className?: string }) => <div className={cn(LEGEND, "text-center text-[6px]", className)}>{children}</div>;
const Blank = ({ h = 60, className }: { h?: number; className?: string }) => <div className={cn(PLATE, "w-full", className)} style={{ minHeight: h }}><Screws /></div>;
const Slot = ({ h = 46 }: { h?: number }) => <div className="mx-auto w-2 rounded-full border border-black bg-[linear-gradient(180deg,#f2f2f2,#222)]" style={{ height: h }} />;
const Col = ({ children }: { children: ReactNode }) => <div className="flex min-w-0 flex-col gap-1 [&>*:last-child]:flex-1">{children}</div>;
const BlackLabel = ({ children, className }: { children: ReactNode; className?: string }) => <div className={cn("rounded-[3px] bg-black px-2 py-1 font-mono text-[7px] font-bold uppercase tracking-[.1em] text-[#e6e1d2]", className)}>{children}</div>;
const IndexLock = () => <div className={cn(PLATE, "flex h-[62px] w-[44px] items-center justify-center bg-[#2a2c30]")}><span className={cn(LEGEND, "text-[5px] [writing-mode:vertical-rl]")}>INDEX · TO LOCK</span></div>;

/* ───────────────────────── TOP ROW ───────────────────────── */

function EltPanel() {
  const s = useSimPick("eltMode", "patch");
  const d = useDerivedPick("eltTransmitting");
  return (
    <Plate title="ELT" className="min-h-[86px]">
      <Row>
        <Annun label="ELT" on={d.eltTransmitting} tone="amber" className="mt-2 w-10" />
        <VSwitch<"OFF" | "ARM" | "ON"> label="ELT" options={["OFF", "ARM", "ON"]} value={s.eltMode} onChange={(v) => s.patch({ eltMode: v }, `ELT ${v}`)} legends={["OFF", "ARM", "ON"]} />
      </Row>
    </Plate>
  );
}

function LeDevices() {
  const d = useDerivedPick("dcPower", "leExtended", "leTransit");
  const [test, setTest] = useState(false);
  const pw = d.dcPower;
  const ext = pw && (d.leExtended || test);
  const tr = pw && !test && d.leTransit;
  const cell = (on: boolean, amber: boolean) => on ? "bg-[#42d36e] shadow-[0_0_5px_#42d36e]" : amber ? "bg-[#e9a93a] shadow-[0_0_5px_#e9a93a]" : "bg-[#26302a]";
  const Side = ({ flip = false }: { flip?: boolean }) => (
    <div className={cn("relative h-[52px] w-[74px]", flip && "[transform:scaleX(-1)]")}>
      <div className="absolute left-0 top-1/2 h-[2px] w-full bg-[#25272a]" />
      {[0, 1, 2, 3, 4].map((i) => <span key={i} className={cn("absolute h-3 w-2 rounded-[1px] border border-black/60", cell(ext, tr), i < 2 ? "left-[3px]" : i === 2 ? "left-[33px]" : "right-[3px]")} style={{ top: 6 + i * 7 }} />)}
    </div>
  );
  const Side3 = () => <div className="flex flex-col items-center gap-1"><span className={cn(LEGEND, "text-[4.5px]")}>TRANSIT</span><span className={cn(LEGEND, "text-[4.5px]")}>EXT</span><span className={cn(LEGEND, "text-[4.5px]")}>FULL EXT</span></div>;
  return (
    <Plate title="LE DEVICES" className="min-h-[96px]">
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-1">
        <Side3 />
        <div className="flex items-center justify-center gap-1"><Side /><Side flip /></div>
        <Side3 />
      </div>
      <div className="mt-1 flex items-center justify-between px-2"><span className={cn(LEGEND, "text-[5px]")}>FLAPS · SLATS</span><PushButton label="TEST" onPress={() => setTest(true)} onRelease={() => setTest(false)} /></div>
    </Plate>
  );
}

const DSPL_TICKS = ["TEST", "TK/GS", "PPOS", "WIND", "HDG/STS"];
const IRS_MODES: IrsMode[] = ["OFF", "ALIGN", "NAV", "ATT"];
const KEYS: { k: string; t?: string }[] = [{ k: "1" }, { k: "2", t: "N" }, { k: "3" }, { k: "4", t: "W" }, { k: "5", t: "H" }, { k: "6", t: "E" }, { k: "7" }, { k: "8", t: "S" }, { k: "9" }, { k: "ENT" }, { k: "0" }, { k: "CLR" }];

function IrsUnit({ side }: { side: "L" | "R" }) {
  const s = useSimPick("circuitBreakers", "irsAlignL", "irsAlignR", "irsLMode", "irsRMode", "patch");
  const d = useDerivedPick("acPower", "dcPower");
  const pw = d.dcPower;
  const mode = side === "L" ? s.irsLMode : s.irsRMode;
  const prog = side === "L" ? s.irsAlignL : s.irsAlignR;
  const cbClosed = s.circuitBreakers[side === "L" ? "irs-left" : "irs-right"];
  const on = mode !== "OFF";
  const aligning = pw && cbClosed && mode === "ALIGN" && prog < 1;
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="grid grid-cols-2 gap-[2px]">
        <Annun label="ALIGN" on={aligning} tone="amber" small className="w-9" />
        <Annun label="ON DC" on={on && !d.acPower && pw} tone="amber" small className="w-9" />
        <Annun label="FAULT" on={!cbClosed} tone="amber" small className="w-9" />
        <Annun label="DC FAIL" on={on && (!pw || !cbClosed)} tone="amber" small className="w-9" />
      </div>
      {aligning && <span className={cn(LEGEND, "text-[5px] text-[#ffb347]")}>{Math.round(prog * 100)}%</span>}
      <Knob size={34} min={0} max={3} step={1} value={IRS_MODES.indexOf(mode)} onChange={(v) => s.patch(side === "L" ? { irsLMode: IRS_MODES[v] } : { irsRMode: IRS_MODES[v] }, `IRS ${side} ${IRS_MODES[v]}`)} ticks={["OFF", "ALIGN", "NAV", "ATT"]} />
      <span className={cn(LEGEND, "text-[6px]")}>{side} IRS</span>
    </div>
  );
}

function IrsPanel() {
  const d = useDerivedPick("dcPower");
  const o = useOverheadLocal(useShallow((st) => ({ irsEntry: st.irsEntry, irsSysDspl: st.irsSysDspl, set: st.set })));
  const pw = d.dcPower;
  const [dspl, setDspl] = useState(2); // index into DSPL_TICKS, PPOS by default

  const sel = DSPL_TICKS[dspl] as DsplSel | "TEST";
  const lat = "N 5109.32";
  const lon = "W 00315.17";
  const key = (k: string) => o.set({ irsEntry: k === "CLR" ? "" : k === "ENT" ? o.irsEntry : (o.irsEntry + k).slice(-8) });
  return (
    <>
      <Blank h={62} />
      <Plate title="IRS DISPLAY" className="min-h-[44px]">
        <div className="flex justify-around rounded-[2px] border border-black bg-black px-1 py-0.5 font-mono text-[9px] text-[#ffb347] [text-shadow:0_0_4px_rgba(255,170,60,.6)]">
          <span>{pw ? (o.irsEntry && sel !== "TEST" ? o.irsEntry : sel === "TEST" ? "888888" : lat) : ""}</span>
          <span>{pw ? (sel === "TEST" ? "888888" : sel === "PPOS" ? lon : sel === "WIND" ? "270/ 35" : sel === "TK/GS" ? "090/ 000" : "OK") : ""}</span>
        </div>
      </Plate>
      <div className="grid grid-cols-[1fr_auto] gap-1">
        <Plate className="px-1">
          <Cap>DSPL SEL</Cap>
          <div className="flex justify-center"><Knob size={26} min={0} max={4} step={1} value={dspl} onChange={setDspl} ticks={DSPL_TICKS} /></div>
          <Cap className="mt-1">SYS DSPL</Cap>
          <div className="flex justify-center"><Knob size={22} min={0} max={1} step={1} value={o.irsSysDspl === "L" ? 0 : 1} onChange={(v) => o.set({ irsSysDspl: v === 0 ? "L" : "R" })} ticks={["L", "R"]} /></div>
        </Plate>
        <Plate className="px-1.5">
          <div className="grid grid-cols-3 gap-[3px]">
            {KEYS.map(({ k, t }) => (
              <button key={k} type="button" onClick={() => pw && key(k)} className="flex h-[22px] w-[24px] flex-col items-center justify-center rounded-[2px] border border-black bg-[linear-gradient(180deg,#2d2f33,#141518)] font-mono text-[7px] font-bold leading-[8px] text-[#e6e1d2] active:brightness-125">
                {t && <span className="text-[5px] text-[#9fd]">{t}</span>}<span>{k}</span>
              </button>
            ))}
          </div>
        </Plate>
      </div>
      <Plate className="min-h-[150px]">
        <Row><IrsUnit side="L" /><IrsUnit side="R" /></Row>
      </Plate>
    </>
  );
}

function ServiceInterphone() {
  const s = useSimPick("patch", "serviceInterphoneOn");
  const d = useDerivedPick("serviceCallEffective");
  return (
    <>
      <div className="pt-[60px]"><Slot h={48} /></div>
      <div className={cn(PLATE, "flex flex-col items-center justify-center gap-1 bg-[#1b1c1f] p-1 pt-3")}>
        <Screws n={2} />
        <span className={cn(LEGEND, "text-center text-[5px]")}>SERVICE INTERPHONE</span>
        <VSwitch<"OFF" | "ON"> options={["OFF", "ON"]} value={s.serviceInterphoneOn ? "ON" : "OFF"} onChange={(v) => s.patch({ serviceInterphoneOn: v === "ON" }, `SERVICE INTERPHONE ${v}`)} legends={["OFF", "ON"]} small />
        <Annun label="CALL" on={d.serviceCallEffective && s.serviceInterphoneOn} tone="blue" small />
      </div>
    </>
  );
}

function DomeWhite() {
  const s = useSimPick("ltDome", "patch");
  return (
    <Plate title="DOME WHITE">
      <Row>
        <VSwitch<"DIM" | "OFF" | "BRT"> options={["DIM", "OFF", "BRT"]} value={s.ltDome} onChange={(v) => s.patch({ ltDome: v })} legends={["DIM", "OFF", "BRIGHT"]} small />
      </Row>
    </Plate>
  );
}

const RX = ["VHF-1", "VHF-2", "VHF-3", "HF-1", "HF-2", "INT", "CABIN", "PA"];
const AUD2: { key: string; label: string }[] = [{ key: "NAV-1", label: "1" }, { key: "NAV-2", label: "NAV-2" }, { key: "ADF-1", label: "ADF-1" }, { key: "ADF-2", label: "ADF-2" }, { key: "MKR", label: "MKR" }, { key: "SPKR", label: "SPKR" }];

function RxToggle({ k }: { k: string }) {
  const o = useOverheadLocal(useShallow((st) => ({ audioRx: st.audioRx, set: st.set })));
  const on = !!o.audioRx[k];
  return (
    <button type="button" aria-label={`receive ${k}`} onClick={() => o.set({ audioRx: { ...o.audioRx, [k]: !on } })} className="relative h-[26px] w-[12px] rounded-[2px] border border-black bg-[#14161a]">
      <span className={cn("absolute left-[2px] right-[2px] h-[9px] rounded-[1px] bg-[linear-gradient(90deg,#9aa0a6,#50555a)] transition-all", on ? "top-[2px]" : "bottom-[2px]")} />
      <span className={cn("absolute -top-[5px] left-1/2 size-[3px] -translate-x-1/2 rounded-full", on ? "bg-[#42d36e] shadow-[0_0_4px_#42d36e]" : "bg-[#1f3a28]")} />
    </button>
  );
}

function AudioPanel() {
  const o = useOverheadLocal(useShallow((st) => ({ audioAlt: st.audioAlt, audioMask: st.audioMask, audioRtIc: st.audioRtIc, audioTx: st.audioTx, set: st.set })));
  const d = useDerivedPick("dcPower");
  const pw = d.dcPower;
  const [filter, setFilter] = useState(1); // V B R
  return (
    <Plate className="min-h-[162px]">
      <div className="grid grid-cols-8 gap-[2px]">
        {RX.map((r) => <span key={r} className={cn(LEGEND, "text-center text-[4.5px] leading-none")}>{r}</span>)}
        {RX.map((r) => (
          <button key={`c-${r}`} type="button" aria-label={`transmit ${r}`} onClick={() => o.set({ audioTx: o.audioTx === r ? "" : r })} className={cn("mx-auto h-[18px] w-[15px] rounded-[2px] border border-black font-mono text-[7px] font-bold", o.audioTx === r && pw ? "bg-[#f4efd8] text-black shadow-[0_0_6px_#fff]" : "bg-[#26282b] text-[#e6e1d2]")}>C</button>
        ))}
        {RX.map((r) => <div key={`r-${r}`} className="flex justify-center pt-1"><RxToggle k={r} /></div>)}
      </div>
      <div className="mt-1.5 grid grid-cols-6 gap-[2px] pl-[14px]">
        {AUD2.map((a) => <div key={a.key} className="flex justify-center pt-1"><RxToggle k={a.key} /></div>)}
        {AUD2.map((a) => <span key={`l-${a.key}`} className={cn(LEGEND, "text-center text-[4.5px] leading-none")}>{a.label}</span>)}
      </div>
      <div className="mt-1 grid grid-cols-4 items-end gap-1">
        <VSwitch<"R/T" | "I/C"> small label="" options={["R/T", "I/C"]} value={o.audioRtIc ? "R/T" : "I/C"} onChange={(v) => o.set({ audioRtIc: v === "R/T" })} legends={["R/T", "I/C"]} />
        <VSwitch<"MASK" | "BOOM"> small label="" options={["MASK", "BOOM"]} value={o.audioMask} onChange={(v) => o.set({ audioMask: v })} legends={["MASK", "BOOM"]} />
        <div className="flex justify-center"><Knob size={22} min={0} max={2} step={1} value={filter} onChange={setFilter} ticks={["V", "B", "R"]} /></div>
        <VSwitch<"ALT" | "NORM"> small label="" options={["ALT", "NORM"]} value={o.audioAlt ? "ALT" : "NORM"} onChange={(v) => o.set({ audioAlt: v === "ALT" })} legends={["ALT", "NORM"]} />
      </div>
    </Plate>
  );
}

function EnginePanel() {
  const o = useOverheadLocal(useShallow((st) => ({ reverserTest: st.reverserTest, set: st.set })));
  const s = useSim();
  const d = useDerivedPick("dcPower", "thrustReverser1Active", "thrustReverser2Active");
  const pw = d.dcPower;
  const rt = o.reverserTest;
  const setT = (n: 1 | 2, v: boolean) => o.set({ reverserTest: n === 1 ? [v, rt[1]] : [rt[0], v] });
  const [pmc, setPmc] = useState<[boolean, boolean]>([true, true]);
  const lowIdle = pw && (rt[0] || rt[1]);
  return (
    <Plate title="ENGINE" className="min-h-[96px]">
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-1">
        {([1, 2] as const).map((n) => (
          <div key={n} className={cn("flex flex-col items-center gap-0.5", n === 2 && "col-start-3 row-start-1")}>
            <span className={cn(LEGEND, "text-[6px]")}>{n}</span>
            <Annun label="REVERSER" on={pw && ((n === 1 ? d.thrustReverser1Active : d.thrustReverser2Active) || rt[n - 1])} tone="amber" small className="w-14" />
            <button type="button" aria-label={`PMC ${n}`} onPointerDown={() => setT(n, true)} onPointerUp={() => setT(n, false)} onPointerLeave={() => setT(n, false)} onClick={() => setPmc((p) => (n === 1 ? [!p[0], p[1]] : [p[0], !p[1]]))} className="flex w-[46px] flex-col items-center gap-[1px] rounded-[3px] border border-[#15171a] bg-[#2c2f33] p-[2px] shadow-[0_2px_3px_rgba(0,0,0,.6)]">
              <span className={cn("w-full rounded-[2px] border py-[1px] text-center font-mono text-[6px] font-bold", pw && pmc[n - 1] ? "border-[#1d7a45] bg-[#38d27a] text-[#03230f]" : "border-[#222] bg-[#1a1c1f] text-[#6d6a5e]")}>ON</span>
              <span className={cn("w-full rounded-[2px] border py-[1px] text-center font-mono text-[6px] font-bold", pw && (!pmc[n - 1] || rt[n - 1]) ? "border-[#a8741a] bg-[#e9a93a] text-[#2a1b00]" : "border-[#222] bg-[#1a1c1f] text-[#6d6a5e]")}>INOP</span>
            </button>
          </div>
        ))}
        <div className="col-start-2 row-start-1 flex items-center pt-[26px]"><Annun label="LOW IDLE" on={!!lowIdle} tone="amber" small className="w-12" /></div>
      </div>
    </Plate>
  );
}

function OxygenRow() {
  const s = useSimPick("crewMaskMic", "crewOxyMode", "crewOxyPsi", "faults", "passOxyAutoDeploy", "passOxyMode", "patch");
  const d = useDerivedPick("oxygenPressureIndicated", "passengerOxygenDeployed");
  return (
    <div className="grid grid-cols-[1.45fr_1fr] gap-1">
      <Plate title="CREW OXYGEN" className="min-h-[104px]"><div className="flex justify-center"><Gauge value={d.oxygenPressureIndicated ? s.crewOxyPsi : 0} min={0} max={2000} size={74} ticks={10} sub="PSI" label="OXY PRESS PSI ×100" /></div><div className="mt-1 flex items-center justify-center gap-1"><VSwitch<"NORMAL" | "ON"> options={["NORMAL", "ON"]} value={s.crewOxyMode} onChange={(v) => s.patch({ crewOxyMode: v }, `CREW OXYGEN ${v}`)} small legends={["NORM", "ON"]} /><label className={cn(LEGEND, "flex items-center gap-1 text-[5px]")}><input type="checkbox" checked={s.crewMaskMic} onChange={(e) => s.patch({ crewMaskMic: e.currentTarget.checked }, `MASK MICROPHONE ${e.currentTarget.checked ? "ON" : "OFF"}`)} /> MASK MIC</label></div><Cap>{s.faults.oxygenSystemFailure ? "OXYGEN SYSTEM FAIL" : d.oxygenPressureIndicated ? "PRESSURE INDICATED" : "INDICATION UNPOWERED"}</Cap></Plate>
      <Plate title="PASS OXYGEN" className="px-1">
        <div className="flex flex-col items-center gap-1">
          <RedGuarded options={["NORMAL", "ON"]} value={s.passOxyMode} onChange={(v) => s.patch({ passOxyMode: v as "NORMAL" | "ON" }, `PASSENGER OXYGEN ${v}`)} legends={["NORMAL", "ON"]} />
          <Annun label={<>PASS OXY<br />ON</>} on={d.passengerOxygenDeployed} tone="amber" small className="w-12" />
          <label className={cn(LEGEND, "flex items-center gap-1 text-[5px]")}><input type="checkbox" checked={s.passOxyAutoDeploy} onChange={(e) => s.patch({ passOxyAutoDeploy: e.currentTarget.checked })} /> AUTO DROP</label>
        </div>
      </Plate>
    </div>
  );
}

function RecorderPanel() {
  const o = useOverheadLocal(useShallow((st) => ({ set: st.set })));
  const d = useDerivedPick("cvrOff", "dcPower");
  const s = useSimPick("flightRecorderMode", "patch");
  const pw = d.dcPower;
  return (
    <>
      <Blank h={84} />
      <Blank h={84} />
      <div className={cn(PLATE, "p-1.5")}>
        <Screws />
        <div className="flex items-stretch gap-1">
          <BlackLabel className="flex-1 !text-[8px]">FLIGHT RECORDER<div className="mt-2 flex justify-between text-[6px]"><span>TEST</span><span>NORMAL</span></div></BlackLabel>
          <BlackLabel className="w-[62px] text-center !text-[6px] leading-tight">MACH AIRSPEED WARNING<div className="mt-1 flex justify-around text-[5px]"><span>NO 1</span><span>NO 2</span></div></BlackLabel>
        </div>
        <div className="mt-1 flex items-center justify-between gap-1 px-1">
          <HSwitch<"TEST" | "NORMAL"> options={["TEST", "NORMAL"]} value={s.flightRecorderMode} onChange={(v) => s.patch({ flightRecorderMode: v, cvrTest: v === "TEST" }, `FLIGHT RECORDER ${v}`)} />
          <Annun label="OFF" on={d.cvrOff} tone="amber" small className="w-9" />
          {([1, 2] as const).map((n) => <RoundBtn key={n} onPress={() => { o.set({ machWarn: n }); s.patch({ psMachWarningTest: true }, `MACH/AIRSPEED WARNING TEST ${n}`); }} onRelease={() => { o.set({ machWarn: 0 }); s.patch({ psMachWarningTest: false }); }} />)}
        </div>
      </div>
      <div className={cn(PLATE, "p-1.5")}>
        <Screws />
        <BlackLabel className="text-center !text-[8px]">STALL WARNING TEST<div className="mt-1 flex justify-around text-[6px]"><span>NO. 1</span><span>NO. 2</span></div></BlackLabel>
        <div className="mt-1 flex justify-around">{([1, 2] as const).map((n) => <RoundBtn key={n} onPress={() => { o.set({ stallTest: n }); s.patch({ psStallWarningTest: true }, `STALL WARNING TEST ${n}`); }} onRelease={() => { o.set({ stallTest: 0 }); s.patch({ psStallWarningTest: false }); }} />)}</div>
      </div>
      <Blank h={60} />
    </>
  );
}

/* ───────────────────────── MAIN ROW · COLUMN A (flight controls, fuel) ───────────────────────── */

/** Compass control from the photos: DG / SLAVED switch, SET HDG knob and the sync indicator. */
function CompassPanel() {
  const o = useOverheadLocal(useShallow((st) => ({ compassDg: st.compassDg, compassHdg: st.compassHdg, set: st.set })));
  const d = useDerivedPick("dcPower");
  return (
    <Plate className="min-h-[48px]">
      <div className="flex items-center justify-around gap-2">
        <div className="grid size-7 place-items-center rounded-full border border-[#111] bg-black"><div className={cn("h-4 w-1 rounded-[1px]", d.dcPower ? "bg-[#e8e8e8]" : "bg-[#333]")} /></div>
        <div className="flex flex-col items-center"><Cap>COMPASS</Cap><HSwitch<"DG" | "SLAVED"> options={["DG", "SLAVED"]} value={o.compassDg ? "DG" : "SLAVED"} onChange={(v) => o.set({ compassDg: v === "DG" })} legends={["DG", "SLAVED"]} /></div>
        <Knob size={30} min={-2} max={2} step={1} value={0} onChange={(v) => o.set({ compassHdg: (o.compassHdg + Math.sign(v) + 360) % 360 })} ticks={["", "", "SET HDG", "", ""]} />
      </div>
    </Plate>
  );
}

function FltCtrlPanel() {
  const o = useOverheadLocal(useShallow((st) => ({ machTrimTest: st.machTrimTest, set: st.set })));
  const s = useSimPick("altFlapsArm", "altFlapsControl", "fltCtrlA", "fltCtrlB", "hydSQty", "patch", "spoilerA", "spoilerB", "stbyHyd");
  const d = useDerivedPick("dcPower", "feelDiff", "hydALow", "hydBLow", "stbyOn");
  const pw = d.dcPower;
  const pos = (on: boolean): "STBY RUD" | "ON" | "OFF" => (on ? "ON" : s.stbyHyd === "ON" ? "STBY RUD" : "OFF");
  const set = (side: "A" | "B", v: "STBY RUD" | "ON" | "OFF") => {
    const key = side === "A" ? "fltCtrlA" : "fltCtrlB";
    if (v === "STBY RUD") s.patch({ [key]: false, stbyHyd: "ON" } as never, `FLT CONTROL ${side} → STBY RUD (standby hydraulic to rudder)`);
    else s.patch({ [key]: v === "ON" } as never);
  };
  const stbyLowQty = pw && s.hydSQty < 20;
  const stbyLowPress = pw && s.stbyHyd !== "OFF" && !d.stbyOn;
  return (
    <Plate title="FLT CONTROL" className="min-h-[300px]">
      <div className="grid grid-cols-[auto_auto_1fr] items-start gap-1.5">
        <VSwitch<"STBY RUD" | "OFF" | "ON"> label="A" options={["STBY RUD", "OFF", "ON"]} value={pos(s.fltCtrlA)} onChange={(v) => set("A", v)} guarded legends={["STBY RUD", "OFF", "ON"]} />
        <VSwitch<"STBY RUD" | "OFF" | "ON"> label="B" options={["STBY RUD", "OFF", "ON"]} value={pos(s.fltCtrlB)} onChange={(v) => set("B", v)} guarded legends={["STBY RUD", "OFF", "ON"]} />
        <div className="flex flex-col gap-0.5">
          <Cap>STANDBY HYD</Cap>
          <Annun label={<>LOW<br />QUANTITY</>} on={stbyLowQty} className="w-full" />
          <Annun label={<>LOW<br />PRESSURE</>} on={stbyLowPress} className="w-full" />
        </div>
      </div>
      <div className="mt-1 grid grid-cols-[auto_auto_1fr] items-start gap-1.5">
        <Annun label={<>LOW<br />PRESSURE</>} on={d.hydALow} className="w-[52px]" />
        <Annun label={<>LOW<br />PRESSURE</>} on={d.hydBLow} className="w-[52px]" />
        <div className="flex flex-col items-center gap-0.5">
          <Cap>ALTERNATE FLAPS</Cap>
          <div className="flex items-start gap-2">
            <RedGuarded value={s.altFlapsArm ? "ARM" : "OFF"} options={["OFF", "ARM"]} legends={["OFF", "ARM"]} onChange={(v) => s.patch({ altFlapsArm: v === "ARM", altFlapsControl: v === "ARM" ? s.altFlapsControl : "OFF" })} />
            <VSwitch<"UP" | "OFF" | "DN"> options={["UP", "OFF", "DN"]} value={s.altFlapsControl as "UP" | "OFF" | "DN"} onChange={(v) => { if (!s.altFlapsArm && v !== "OFF") { s.patch({}, "ALTERNATE FLAPS control inhibited — ARM switch first."); return; } s.patch({ altFlapsControl: v as never }, `ALT FLAPS position ${v}`); }} legends={["UP", "OFF", "DOWN"]} />
          </div>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-[auto_auto_1fr] items-start gap-1.5">
        <OffOn label="A" on={s.spoilerA} onChange={(v) => s.patch({ spoilerA: v })} />
        <OffOn label="B" on={s.spoilerB} onChange={(v) => s.patch({ spoilerB: v })} />
        <div className="flex flex-col gap-0.5">
          <Cap>SPOILER</Cap>
          <Annun label={<>FEEL DIFF<br />PRESS</>} on={pw && d.feelDiff} className="w-full" />
        </div>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <Annun label={<>MACH TRIM<br />FAIL</>} on={pw && o.machTrimTest} className="w-[64px]" />
        <div className="flex flex-col items-center gap-0.5"><Cap>MACH TRIM</Cap><RoundBtn label="TEST" onPress={() => o.set({ machTrimTest: true })} onRelease={() => o.set({ machTrimTest: false })} /></div>
      </div>
      <YawDamper />
    </Plate>
  );
}

function YawDamper() {
  const s = useSimPick("patch", "yawDamper");
  const d = useDerivedPick("dcPower", "yawDamperEffective");
  const available = d.yawDamperEffective;
  return (
    <div className="mt-1 flex items-center gap-2">
      <div className="flex flex-col items-center gap-0.5"><Cap>YAW DAMPER</Cap><Annun label={<>YAW<br />DAMPER</>} on={d.dcPower && s.yawDamper && !available} tone="amber" className="w-12" /></div>
      <OffOn label="" on={s.yawDamper} onChange={(v) => s.patch({ yawDamper: v }, v ? "YAW DAMPER ON" : "YAW DAMPER OFF")} small />
    </div>
  );
}

function TransferPanel() {
  const s = useSimPick("efiXfr", "irsXfr", "navXfr", "patch");
  return (
    <Plate className="min-h-[138px]">
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col items-center gap-0.5">
          <Cap>VHF NAV</Cap>
          <HSwitch<"BOTH ON 1" | "NORMAL" | "BOTH ON 2"> options={["BOTH ON 1", "NORMAL", "BOTH ON 2"]} value={s.navXfr} onChange={(v) => s.patch({ navXfr: v }, `VHF NAV TRANSFER ${v}`)} legends={["BOTH ON 1", "", "BOTH ON 2"]} />
          <Cap>NORMAL</Cap>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <Cap>IRS</Cap>
          <HSwitch<"BOTH ON L" | "NORMAL" | "BOTH ON R"> options={["BOTH ON L", "NORMAL", "BOTH ON R"]} value={s.irsXfr} onChange={(v) => s.patch({ irsXfr: v }, `IRS TRANSFER ${v}`)} legends={["BOTH ON L", "", "BOTH ON R"]} />
          <Cap>NORMAL</Cap>
        </div>
      </div>
      <div className="mt-2 flex flex-col items-center gap-0.5">
        <Cap>EFI</Cap>
        <HSwitch<"BOTH ON L" | "NORMAL" | "BOTH ON R"> options={["BOTH ON L", "NORMAL", "BOTH ON R"]} value={s.efiXfr} onChange={(v) => s.patch({ efiXfr: v }, `EFI TRANSFER ${v}`)} legends={["BOTH ON L", "", "BOTH ON R"]} />
        <Cap>NORMAL</Cap>
      </div>
    </Plate>
  );
}

function FuelPump({ label, k }: { label: string; k: "fuelPump1Fwd" | "fuelPump1Aft" | "fuelPump2Fwd" | "fuelPump2Aft" | "fuelPumpCenter1" | "fuelPumpCenter2" }) {
  const s = useSim();
  return <OffOn small label={label} on={s[k]} onChange={(v) => s.patch({ [k]: v } as never)} legends={["OFF", "ON"]} />;
}

function FuelPanel() {
  const s = useSimPick("fuelCrossfeed", "fuelHeat", "fuelHeat2", "fuelHeat2ElapsedSec", "fuelHeatElapsedSec", "fuelTempC", "patch");
  const d = useDerivedPick("dcPower", "fuelCenterPump1LowPressure", "fuelCenterPump2LowPressure", "fuelFilterIcing1", "fuelFilterIcing2", "fuelHeatValve2Open", "fuelHeatValveOpen", "fuelPump1AftLowPressure", "fuelPump1FwdLowPressure", "fuelPump2AftLowPressure", "fuelPump2FwdLowPressure", "fuelShutoff1Open", "fuelShutoff2Open", "fuelTempIndicationPowered", "fuelTempLow");
  const pw = d.dcPower;
  return (
    <>
      <Plate className="min-h-[124px]">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1">
          <Annun label={<>ENG VALVE<br />CLOSED</>} on={pw && !d.fuelShutoff1Open} tone="blue" small />
          <div className="flex flex-col items-center gap-0.5"><Gauge label="TANK 1 FUEL °C" value={d.fuelTempIndicationPowered ? s.fuelTempC : -56} min={-40} max={40} size={66} ticks={4} /><Annun label="≤ 0°C" on={d.fuelTempLow} tone="amber" small /><Annun label="HEAT 1" on={d.fuelHeatValveOpen} tone="blue" small /><Annun label="HEAT 2" on={d.fuelHeatValve2Open} tone="blue" small /><Annun label="NO AC" on={!d.fuelTempIndicationPowered} tone="amber" small /></div>
          <Annun label={<>ENG VALVE<br />CLOSED</>} on={pw && !d.fuelShutoff2Open} tone="blue" small />
        </div>
        <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-1">
          <Annun label={<>FILTER<br />ICING 1</>} on={d.fuelFilterIcing1} tone="amber" small />
          <Annun label={<>CROSSFEED<br />OPEN</>} on={pw && s.fuelCrossfeed} tone="blue" small className="w-12" />
          <Annun label={<>FILTER<br />ICING 2</>} on={d.fuelFilterIcing2} tone="amber" small />
        </div>
      </Plate>
      <Plate className={cn(LIGHT_PLATE, "min-h-[226px]")}>
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-1">
          <div className="flex flex-col items-center"><Cap className="!text-[#1a1c1f]">1 HEAT</Cap><OffOn small on={s.fuelHeat} onChange={(v) => s.patch({ fuelHeat: v, ...(v ? { fuelHeatElapsedSec: 0 } : {}) }, `ENG 1 FUEL HEAT ${v ? "ON" : "OFF"}`)} /><Annun label="VALVE" on={d.fuelHeatValveOpen} tone="blue" small /><span className="text-[7px] text-[#1a1c1f]">{Math.ceil(Math.max(0, 60 - s.fuelHeatElapsedSec))} SEC</span></div>
          <div className="flex items-center justify-center gap-1">
            <span className={cn(LEGEND, "text-[7px] !text-[#1a1c1f]")}>CROSS</span>
            <Knob size={40} min={0} max={1} step={1} value={s.fuelCrossfeed ? 1 : 0} onChange={(v) => s.patch({ fuelCrossfeed: v >= 0.5 }, v >= 0.5 ? "FUEL CROSSFEED OPEN" : "FUEL CROSSFEED CLOSED")} />
            <span className={cn(LEGEND, "text-[7px] !text-[#1a1c1f]")}>FEED</span>
          </div>
          <div className="flex flex-col items-center"><Cap className="!text-[#1a1c1f]">2 HEAT</Cap><OffOn small on={s.fuelHeat2} onChange={(v) => s.patch({ fuelHeat2: v, ...(v ? { fuelHeat2ElapsedSec: 0 } : {}) }, `ENG 2 FUEL HEAT ${v ? "ON" : "OFF"}`)} /><Annun label="VALVE" on={d.fuelHeatValve2Open} tone="blue" small /><span className="text-[7px] text-[#1a1c1f]">{Math.ceil(Math.max(0, 60 - s.fuelHeat2ElapsedSec))} SEC</span></div>
        </div>
        <div className="mt-1 grid grid-cols-2 gap-1">
          <Annun label={<>LOW<br />PRESSURE</>} on={pw && d.fuelCenterPump1LowPressure} small />
          <Annun label={<>LOW<br />PRESSURE</>} on={pw && d.fuelCenterPump2LowPressure} small />
        </div>
        <div className="mt-0.5 flex items-center justify-around"><span className={cn(LEGEND, "!text-[#1a1c1f]")}>L</span><FuelPump label="CTR" k="fuelPumpCenter1" /><span className={cn(LEGEND, "text-[7px] !text-[#1a1c1f]")}>FUEL PUMPS</span><FuelPump label="" k="fuelPumpCenter2" /><span className={cn(LEGEND, "!text-[#1a1c1f]")}>R</span></div>
        <div className="mt-1 grid grid-cols-4 gap-1">
          <Annun label={<>LOW<br />PRESSURE</>} on={pw && d.fuelPump1AftLowPressure} small />
          <Annun label={<>LOW<br />PRESSURE</>} on={pw && d.fuelPump1FwdLowPressure} small />
          <Annun label={<>LOW<br />PRESSURE</>} on={pw && d.fuelPump2FwdLowPressure} small />
          <Annun label={<>LOW<br />PRESSURE</>} on={pw && d.fuelPump2AftLowPressure} small />
        </div>
        <div className="mt-0.5 grid grid-cols-4 gap-1">
          <FuelPump label="AFT" k="fuelPump1Aft" />
          <FuelPump label="FWD" k="fuelPump1Fwd" />
          <FuelPump label="FWD" k="fuelPump2Fwd" />
          <FuelPump label="AFT" k="fuelPump2Aft" />
        </div>
        <div className="mt-0.5 flex justify-around"><span className={cn(LEGEND, "text-[8px] !text-[#1a1c1f]")}>1</span><span className={cn(LEGEND, "text-[8px] !text-[#1a1c1f]")}>2</span></div>
      </Plate>
    </>
  );
}

/* ───────────────────────── MAIN ROW · COLUMN B (electrical) ───────────────────────── */

const TR_TICKS = ["STBY PWR", "BAT BUS", "BAT", "TR1", "TR2", "TR3", "TEST"];
const AC_TICKS = ["STBY PWR", "GRD PWR", "GEN1", "APU GEN", "GEN2", "TEST"];

function MeterPanel() {
  const s = useSimPick("apuGen", "apuRpm", "battery", "externalPowerConnected", "groundPowerOn", "patch", "standbyPower");
  const d = useDerivedPick("dcPower", "generator1BusPowered", "generator2BusPowered", "tr1Powered", "tr2Powered", "tr3Powered");
  const pw = d.dcPower;
  const [tr, setTr] = useState(3);
  const [ac, setAc] = useState(2);
  const [galley, setGalley] = useState(true);
  const trOn = [d.tr1Powered, d.tr2Powered, d.tr3Powered];
  const dcSrc = tr === 0 ? s.standbyPower !== "OFF" : tr === 1 || tr === 2 ? s.battery : tr === 6 ? true : !!trOn[tr - 3];
  const acSrc = ac === 0 ? s.standbyPower !== "OFF" && pw : ac === 1 ? s.groundPowerOn && s.externalPowerConnected : ac === 2 ? d.generator1BusPowered : ac === 3 ? s.apuGen && s.apuRpm > 90 : ac === 4 ? d.generator2BusPowered : true;
  return (
    <Plate className="min-h-[250px]">
      <div className="grid grid-cols-2 justify-items-center gap-y-1">
        <Gauge label="DC AMPS" value={pw && dcSrc && tr >= 3 ? 18 : 0} min={-50} max={50} size={62} />
        <Gauge label="FREQ" value={acSrc ? 400 : 380} min={380} max={420} size={62} />
        <Gauge label="DC VOLTS" value={dcSrc ? (tr >= 3 ? 28 : 24) : 0} min={0} max={40} size={62} />
        <Gauge label="AC VOLTS" value={acSrc ? 115 : 100} min={100} max={130} size={62} />
      </div>
      <div className="mt-1 grid grid-cols-[1fr_1fr] items-start gap-1">
        <div className="flex flex-col items-center">
          <Knob size={32} min={0} max={6} step={1} value={tr} onChange={setTr} ticks={TR_TICKS} />
          <div className="mt-0.5 flex items-center gap-1"><Cap>BAT</Cap><OffOn small on={s.battery} onChange={(v) => s.patch({ battery: v })} /></div>
          <Cap>DC</Cap>
        </div>
        <div className="flex flex-col items-center">
          <Knob size={32} min={0} max={5} step={1} value={ac} onChange={setAc} ticks={AC_TICKS} />
          <div className="mt-0.5 flex items-start gap-2">
            <OffOn small label="GALLEY" on={galley} onChange={setGalley} />
            <div className="flex flex-col items-center gap-0.5"><Cap>RESID VOLTS</Cap><RoundBtn /></div>
          </div>
          <Cap>AC</Cap>
        </div>
      </div>
    </Plate>
  );
}

function DriveDisc({ n }: { n: 1 | 2 }) {
  const s = useSimPick("gen1Disc", "gen2Disc", "n2_1", "n2_2", "patch", "wow");
  const on = n === 1 ? s.gen1Disc : s.gen2Disc;
  const toggle = () => {
    const v = !on;
    const n2 = n === 1 ? s.n2_1 : s.n2_2;
    if (!v && !canResetGeneratorDrive(s.wow, n2)) {
      const reason = !s.wow ? "WEIGHT OFF WHEELS" : `ENGINE N2 ${Math.round(n2)}% — NOT SHUT DOWN`;
      s.patch({}, `GEN ${n} DRIVE RESET INHIBITED — ${reason}; RESET ONLY ON GROUND AFTER ENGINE SHUTDOWN (AMM 24-11).`);
      return;
    }
    s.patch(n === 1 ? { gen1Disc: v } : { gen2Disc: v }, v ? `GEN ${n} DRIVE DISCONNECT SOLENOID ENERGIZED` : `GEN ${n} DRIVE RESET ON GROUND AFTER ENGINE SHUTDOWN`);
  };
  return (
    <button type="button" aria-label={`generator ${n} drive disconnect`} aria-pressed={on} onClick={toggle} className={cn("h-[44px] w-[26px] rounded-[3px] border-2 shadow-[inset_0_0_8px_rgba(0,0,0,.5),0_2px_4px_rgba(0,0,0,.5)] active:translate-y-px", on ? "border-[#ffb0a0] bg-[#e83a2a]" : "border-[#7b1515] bg-[#b51f1f]")} />
  );
}

function StandbyPanel() {
  const s = useSimPick("genDriveOilTemp1C", "genDriveOilTemp2C", "patch", "standbyPower");
  const d = useDerivedPick("dcPower", "generatorDrive1HighOilTemp", "generatorDrive1LowOilPressure", "generatorDrive2HighOilTemp", "generatorDrive2LowOilPressure");
  const pw = d.dcPower;
  const [rise, setRise] = useState(true);
  // The selector changes the scale, not the simulated oil-temperature state.
  const shown = (tempC: number) => rise ? 40 + Math.max(0, tempC - 85) * 4 : tempC;
  const t1 = shown(s.genDriveOilTemp1C);
  const t2 = shown(s.genDriveOilTemp2C);
  return (
    <Plate className="min-h-[216px]">
      <div className="grid grid-cols-[auto_1fr_auto] items-start gap-1">
        <div className="flex flex-col gap-0.5"><Annun label={<>LOW OIL<br />PRESS</>} on={pw && d.generatorDrive1LowOilPressure} small className="w-[44px]" /><Annun label={<>HIGH OIL<br />TEMP</>} on={pw && d.generatorDrive1HighOilTemp} small className="w-[44px]" /></div>
        <div className="flex flex-col items-center gap-0.5">
          <Cap>STANDBY POWER</Cap>
        </div>
        <div className="flex flex-col gap-0.5"><Annun label={<>LOW OIL<br />PRESS</>} on={pw && d.generatorDrive2LowOilPressure} small className="w-[44px]" /><Annun label={<>HIGH OIL<br />TEMP</>} on={pw && d.generatorDrive2HighOilTemp} small className="w-[44px]" /></div>
      </div>
      <div className="mt-1 grid grid-cols-[auto_1fr_auto] items-center gap-1">
        <div className="flex flex-col items-center gap-0.5"><Cap>DISCONNECT</Cap><DriveDisc n={1} /></div>
        <div className="flex flex-col items-center gap-1">
          <HSwitch<"BAT" | "OFF" | "AUTO"> options={["BAT", "OFF", "AUTO"]} value={s.standbyPower === "BAT" ? "BAT" : s.standbyPower === "AUTO" ? "AUTO" : "OFF"} onChange={(v) => s.patch({ standbyPower: v })} legends={["BAT", "OFF", "AUTO"]} />
          <div className="flex flex-col items-center"><Cap>DRIVE TEMP</Cap><VSwitch<"RISE" | "IN"> small options={["RISE", "IN"]} value={rise ? "RISE" : "IN"} onChange={(v) => setRise(v === "RISE")} legends={["RISE", "IN"]} /></div>
        </div>
        <div className="flex flex-col items-center gap-0.5"><Cap>DISCONNECT</Cap><DriveDisc n={2} /></div>
      </div>
      <div className={cn(LEGEND, "mt-0.5 text-center text-[4.5px] leading-tight opacity-80")}>DRIVE CAN BE RECONNECTED ONLY ON GRD</div>
      <div className="mt-1 flex justify-around"><Gauge label="GEN DRIVE OIL TEMP °C" sub="RISE 0–30 · IN 40–160" value={pw ? t1 : 40} min={40} max={160} size={70} redFrom={120} /><Gauge label="GEN DRIVE OIL TEMP °C" sub="RISE 0–30 · IN 40–160" value={pw ? t2 : 40} min={40} max={160} size={70} redFrom={120} /></div>
    </Plate>
  );
}

function GenPanel() {
  const s = useSimPick("apuEgt", "apuGen", "apuRpm", "busTie", "externalPowerConnected", "faults", "gen1", "gen2", "groundPowerOn", "patch");
  const d = useDerivedPick("apuGenOffBus", "apuLowOil", "dcPower", "gen1OffBus", "gen2OffBus", "generator1BusPowered", "generator2BusPowered", "groundPowerAvailable", "transferBus1Powered", "transferBus2Powered");
  const pw = d.dcPower;
  const gpu = s.externalPowerConnected;
  return (
    <>
      <Plate className="min-h-[116px]">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1">
          <Gauge label="AC AMPS" value={d.generator1BusPowered ? 90 : 0} min={0} max={200} size={62} />
          <div className="flex flex-col items-center gap-0.5">
            <Annun label={<>GRD POWER<br />AVAILABLE</>} on={d.groundPowerAvailable} tone="blue" small className="w-14" />
            <VSwitch<"OFF" | "ON"> small options={["OFF", "ON"]} value={s.groundPowerOn ? "ON" : "OFF"} onChange={(v) => { if (v === "ON" && !gpu) { s.patch({}, "GRD PWR inhibited — connect the external ground power cart first."); return; } s.patch({ groundPowerOn: v === "ON" }); }} legends={["OFF", "ON"]} />
            <Cap>GRD PWR</Cap>
          </div>
          <Gauge label="AC AMPS" value={d.generator2BusPowered ? 90 : 0} min={0} max={200} size={62} />
        </div>
      </Plate>
      <Plate className={cn(LIGHT_PLATE, "min-h-[150px]")}>
        <div className="grid grid-cols-2 gap-1">
          <Annun label={<>TRANSFER<br />BUS OFF</>} on={pw && !d.transferBus1Powered} small />
          <Annun label={<>TRANSFER<br />BUS OFF</>} on={pw && !d.transferBus2Powered} small />
          <Annun label={<>BUS<br />OFF</>} on={pw && !d.generator1BusPowered} small />
          <Annun label={<>BUS<br />OFF</>} on={pw && !d.generator2BusPowered} small />
        </div>
        <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-1">
          <Annun label={<>GEN OFF<br />BUS</>} on={d.gen1OffBus} tone="blue" small />
          <Annun label={<>APU GEN<br />OFF BUS</>} on={d.apuGenOffBus} tone="blue" small className="w-12" />
          <Annun label={<>GEN OFF<br />BUS</>} on={d.gen2OffBus} tone="blue" small />
        </div>
        <div className="mt-1 flex items-center justify-center gap-1"><Cap className="!text-[#1a1c1f]">BUS TRANS</Cap><HSwitch<"OFF" | "AUTO"> options={["OFF", "AUTO"]} value={s.busTie ? "AUTO" : "OFF"} onChange={(v) => s.patch({ busTie: v === "AUTO" })} legends={["OFF", "AUTO"]} /></div>
        <div className="mt-1 grid grid-cols-4 gap-1">
          <OffOn small label="GEN 1" on={s.gen1} onChange={(v) => s.patch({ gen1: v })} />
          <OffOn small label="APU GEN" on={s.apuGen} onChange={(v) => s.patch({ apuGen: v })} />
          <OffOn small label="APU GEN" on={s.apuGen} onChange={(v) => s.patch({ apuGen: v })} />
          <OffOn small label="GEN 2" on={s.gen2} onChange={(v) => s.patch({ gen2: v })} />
        </div>
      </Plate>
      <Plate title="APU" className="min-h-[126px]">
        <div className="grid grid-cols-4 gap-0.5">
          <Annun label={<>LOW OIL<br />QUANTITY</>} on={false} tone="blue" small />
          <Annun label={<>LOW OIL<br />PRESSURE</>} on={pw && d.apuLowOil} tone="amber" small />
          <Annun label={<>HIGH OIL<br />TEMP</>} on={pw && s.faults.apuHighOilTemperature} tone="amber" small />
          <Annun label={<>OVER<br />SPEED</>} on={pw && s.faults.apuOverspeed} tone="amber" small />
        </div>
        <Row className="mt-1">
          <Gauge label="APU EGT" value={s.apuEgt / 80} min={0} max={10} size={70} />
          <Gauge label="AC AMPS" value={s.apuGen && s.apuRpm > 90 ? 60 : 0} min={0} max={200} size={70} />
        </Row>
      </Plate>
    </>
  );
}

/* ───────────────────────── MAIN ROW · COLUMN C (cabin service) ───────────────────────── */

function CabinServicePanel() {
  const s = useSimPick("cabinCallActive", "equipExhaust", "equipSupply", "equipmentBayTempC", "groundCrewCallActive", "ltEmergency", "ltNoSmoking", "ltPanelOvhd", "ltSeatBelt", "patch", "rainRepelPulseL", "rainRepelPulseR", "wiperL");
  const o = useOverheadLocal(useShallow((st) => ({ cbBright: st.cbBright, set: st.set })));
  const d = useDerivedPick("dcPower", "equipmentCoolingExhaustPowered", "equipmentCoolingFlow", "equipmentCoolingOverheat", "equipmentCoolingSupplyPowered", "rainRepellentLActive", "rainRepellentRActive");
  const pw = d.dcPower;
  const [parkOff, setParkOff] = useState<0 | 1>(0);
  const simIdx = s.wiperL === "LOW" ? 2 : s.wiperL === "HIGH" ? 3 : null;
  const wiperIdx = simIdx ?? parkOff;
  const sep = "border-t border-[#2c2f33]/70 pt-1.5";
  return (
    <div className={cn(PLATE, "flex flex-col gap-1.5 p-1.5")}>
      <Screws />
      <div className="mx-auto mt-3 h-[96px] w-[44px] bg-[#16171a] [clip-path:polygon(18%_0,82%_0,100%_100%,0_100%)]" />
      <div className={cn(sep, "flex items-start justify-around")}>
        <div className="flex flex-col items-center"><Knob size={36} value={o.cbBright} onChange={(v) => o.set({ cbBright: v })} ticks={["OFF", "", "BRIGHT"]} /><Cap>CIRCUIT BREAKER</Cap></div>
      </div>
      <div className="flex items-start justify-around">
        <div className="flex flex-col items-center"><Knob size={36} value={s.ltPanelOvhd} onChange={(v) => s.patch({ ltPanelOvhd: +v.toFixed(2) })} ticks={["OFF", "", "BRIGHT"]} /><Cap>PANEL</Cap></div>
      </div>
      <div className="min-h-[24px]" />
      <div className={sep}>
        <Cap>EQUIP COOLING</Cap>
        <Row>
          <div className="flex flex-col items-center gap-0.5"><VSwitch<"NORMAL" | "ALTERNATE"> options={["NORMAL", "ALTERNATE"]} value={s.equipSupply} onChange={(v) => s.patch({ equipSupply: v }, `EQUIP COOLING SUPPLY ${v}`)} small legends={["NORM", "ALT"]} /><Cap>SUPPLY</Cap></div>
          <div className="flex flex-col items-center gap-0.5"><VSwitch<"NORMAL" | "ALTERNATE"> options={["NORMAL", "ALTERNATE"]} value={s.equipExhaust} onChange={(v) => s.patch({ equipExhaust: v }, `EQUIP COOLING EXHAUST ${v}`)} small legends={["NORM", "ALT"]} /><Cap>EXHAUST</Cap></div>
        </Row>
        <Row className="mt-1"><Annun label="OFF / OVHT" on={d.equipmentCoolingOverheat || (!d.equipmentCoolingSupplyPowered && !d.equipmentCoolingExhaustPowered)} small className="w-12" /><Annun label="SUPPLY" on={d.equipmentCoolingSupplyPowered} tone="blue" small className="w-11" /><Annun label="EXHAUST" on={d.equipmentCoolingExhaustPowered} tone="blue" small className="w-11" /></Row>
        <div className={cn(LEGEND, "mt-0.5 text-center text-[6px]")}>E/E BAY TEMP {Math.round(s.equipmentBayTempC)}°C · FLOW {Math.round(d.equipmentCoolingFlow * 100)}%</div>
      </div>
      <div className={sep}>
        <Cap>EMER EXIT LIGHTS</Cap>
        <Row>
          <Annun label={<>NOT<br />ARMED</>} on={pw && s.ltEmergency === "OFF"} small className="mt-3 w-9" />
          <RedGuarded value={s.ltEmergency} options={["OFF", "ARMED", "ON"]} onChange={(v) => s.patch({ ltEmergency: v as "OFF" | "ARMED" | "ON" })} />
        </Row>
      </div>
      <div className={sep}>
        <Row>
          <VSwitch<"OFF" | "AUTO" | "ON"> label="NO SMOKING" options={["OFF", "AUTO", "ON"]} value={s.ltNoSmoking} onChange={(v) => s.patch({ ltNoSmoking: v })} legends={["OFF", "AUTO", "ON"]} />
          <VSwitch<"OFF" | "AUTO" | "ON"> label="FASTEN BELTS" options={["OFF", "AUTO", "ON"]} value={s.ltSeatBelt} onChange={(v) => s.patch({ ltSeatBelt: v })} legends={["OFF", "AUTO", "ON"]} />
        </Row>
      </div>
      <div className={sep}>
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-1">
          <div className="flex flex-col items-center gap-0.5"><Cap>ATTEND</Cap><RoundBtn onPress={() => s.patch({ cabinCallActive: true }, "CABIN ATTEND CALL") } onRelease={() => s.patch({ cabinCallActive: false })} /></div>
          <div className="h-[34px] w-2 rounded-[2px] border border-black bg-[linear-gradient(180deg,#111,#2a2a2a)]" />
          <div className="flex flex-col items-center gap-0.5"><Cap>GRD CALL</Cap><RoundBtn onPress={() => s.patch({ groundCrewCallActive: true }, "GROUND CREW CALL") } onRelease={() => s.patch({ groundCrewCallActive: false })} /></div>
        </div>
        <div className="mt-1 flex justify-center"><Annun label="CALL" on={pw && (s.cabinCallActive || s.groundCrewCallActive)} tone="blue" className="w-14" onClick={() => s.patch({ cabinCallActive: false, groundCrewCallActive: false }, "CALL INDICATION RESET")} /></div>
      </div>
      <div className={sep}>
        <Cap>RAIN REPELLENT</Cap>
        <Row>
          <div className="flex flex-col items-center"><RoundBtn onPress={() => s.patch({ rainRepelTimerL: 8, rainRepelPulseL: s.rainRepelPulseL + 1 }, "LEFT RAIN REPELLENT SPRAY — TIMED PULSE")} /><Cap>L</Cap><Annun label="SPRAY" on={d.rainRepellentLActive} small /></div>
          <div className="flex flex-col items-center"><RoundBtn onPress={() => s.patch({ rainRepelTimerR: 8, rainRepelPulseR: s.rainRepelPulseR + 1 }, "RIGHT RAIN REPELLENT SPRAY — TIMED PULSE")} /><Cap>R</Cap><Annun label="SPRAY" on={d.rainRepellentRActive} small /></div>
        </Row>
      </div>
      <div className={sep}>
        <Cap>WIPER</Cap>
        <div className="flex justify-center">
          <Knob size={40} min={0} max={3} step={1} value={wiperIdx} ticks={["PARK", "OFF", "LOW", "HIGH"]}
            onChange={(v) => {
              if (v < 2) { setParkOff(v as 0 | 1); s.patch({ wiperL: "PARK", wiperR: "PARK" }, "WIPERS PARK"); }
              else { const m = v === 2 ? "LOW" : "HIGH"; s.patch({ wiperL: m, wiperR: m }, `WIPERS ${m}`); }
            }} />
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── MAIN ROW · COLUMN D (ice, hydraulics, doors, CVR, cabin altitude) ───────────────────────── */

function IcePanel() {
  const s = useSimPick("antiIce1", "antiIce2", "patch", "probeHeatAlphaL", "probeHeatElevL", "probeHeatElevR", "probeHeatTemp", "psPitotStaticA", "psPitotStaticB", "standbyPower", "windowHeatLFwd", "windowHeatLSide", "windowHeatOvhtLFwd", "windowHeatOvhtLSide", "windowHeatOvhtRFwd", "windowHeatOvhtRSide", "windowHeatRFwd", "windowHeatRSide", "windowHeatTest", "wingAntiIceL", "wingAntiIceR");
  const d = useDerivedPick("acPower", "dcPower");
  const pw = d.dcPower;
  const ac = d.acPower;
  const wh = (k: "windowHeatLSide" | "windowHeatLFwd" | "windowHeatRFwd" | "windowHeatRSide") => (v: boolean) => s.patch({ [k]: v } as never, `WINDOW HEAT ${k.replace("windowHeat", "")} ${v ? "ON" : "OFF"}`);
  const ovht = [s.windowHeatOvhtLSide, s.windowHeatOvhtLFwd, s.windowHeatOvhtRFwd, s.windowHeatOvhtRSide];
  const on = [s.windowHeatLSide, s.windowHeatLFwd, s.windowHeatRFwd, s.windowHeatRSide];
  const test = s.windowHeatTest;
  return (
    <>
      <Plate className="min-h-[132px]">
        <div className="grid grid-cols-4 gap-0.5">
          {ovht.map((o, i) => <Annun key={`o${i}`} label="OVERHEAT" on={pw && (o || test === "OVHT")} small />)}
          {on.map((o, i) => <Annun key={`n${i}`} label="ON" on={ac && ((o && !ovht[i]) || test === "PWR")} tone="green" className="!text-[9px]" />)}
        </div>
        <div className="mt-1 flex items-center justify-between px-1"><Cap>L</Cap><Cap>WINDOW HEAT</Cap><Cap>R</Cap></div>
        <div className="grid grid-cols-5 items-start gap-0.5">
          <OffOn small on={s.windowHeatLSide} onChange={wh("windowHeatLSide")} />
          <OffOn small on={s.windowHeatLFwd} onChange={wh("windowHeatLFwd")} />
          <div className="flex flex-col items-center"><VSwitch<"OVHT" | "OFF" | "PWR"> small options={["OVHT", "OFF", "PWR"]} value={test} onChange={(v) => s.patch({ windowHeatTest: v })} spring="OFF" legends={["", "", ""]} /><Cap>PWR TEST</Cap></div>
          <OffOn small on={s.windowHeatRFwd} onChange={wh("windowHeatRFwd")} />
          <OffOn small on={s.windowHeatRSide} onChange={wh("windowHeatRSide")} />
        </div>
      </Plate>
      <Plate className="min-h-[170px]">
        <div className="grid grid-cols-[1fr_auto_1fr] gap-1">
          <div className="flex flex-col gap-0.5">
            <Annun label={<>CAPT<br />PITOT</>} on={pw && !s.psPitotStaticA} small />
            <Annun label={<>F/O<br />PITOT</>} on={pw && !s.psPitotStaticB} small />
            <Annun label={<>L ELEV<br />PITOT</>} on={pw && !s.probeHeatElevL} small />
          </div>
          <div className="flex flex-col items-center gap-1 px-1">
            <Cap>PITOT STATIC</Cap>
            <div className="flex gap-2"><VSwitch<"OFF" | "ON"> small label="A" options={["OFF", "ON"]} value={s.psPitotStaticA ? "ON" : "OFF"} onChange={(v) => s.patch({ psPitotStaticA: v === "ON" })} legends={["OFF", "ON"]} /><VSwitch<"OFF" | "ON"> small label="B" options={["OFF", "ON"]} value={s.psPitotStaticB ? "ON" : "OFF"} onChange={(v) => s.patch({ psPitotStaticB: v === "ON" })} legends={["OFF", "ON"]} /></div>
            <Cap>HEAT</Cap>
          </div>
          <div className="flex flex-col gap-0.5">
            <Annun label={<>STANDBY<br />PWR OFF</>} on={pw && s.standbyPower === "OFF"} small />
            <Annun label={<>L ALPHA<br />VANE</>} on={pw && !s.probeHeatAlphaL} small />
            <Annun label={<>R ELEV<br />PITOT</>} on={pw && !s.probeHeatElevR} small />
            <Annun label={<>TEMP<br />PROBE</>} on={pw && !s.probeHeatTemp} small />
          </div>
        </div>
      </Plate>
      <Plate className="min-h-[118px]">
        <div className="grid grid-cols-4 gap-0.5">
          <Annun label="" on={false} small />
          <Annun label="OVERHEAT" on={false} small />
          <Annun label={<>COWL<br />ANTI-ICE</>} on={false} small />
          <Annun label={<>COWL<br />ANTI-ICE</>} on={false} small />
          <Annun label={<>LEFT VALVE<br />OPEN</>} on={pw && s.wingAntiIceL} tone="blue" small />
          <Annun label={<>RIGHT VALVE<br />OPEN</>} on={pw && s.wingAntiIceR} tone="blue" small />
          <Annun label={<>COWL VALVE<br />OPEN</>} on={pw && s.antiIce1} tone="blue" small />
          <Annun label={<>COWL VALVE<br />OPEN</>} on={pw && s.antiIce2} tone="blue" small />
        </div>
        <div className="mt-1 grid grid-cols-[1fr_2fr] items-start gap-1">
          <div className="flex flex-col items-center"><Cap>WING ANTI-ICE<br />GRD TEST</Cap><OffOn small on={s.wingAntiIceL || s.wingAntiIceR} onChange={(v) => s.patch({ wingAntiIceL: v, wingAntiIceR: v })} /></div>
          <div className="flex flex-col items-center"><Cap>ENG ANTI ICE</Cap><div className="flex gap-4"><OffOn small label="1" on={s.antiIce1} onChange={(v) => s.patch({ antiIce1: v })} /><OffOn small label="2" on={s.antiIce2} onChange={(v) => s.patch({ antiIce2: v })} /></div></div>
        </div>
      </Plate>
    </>
  );
}

function HydDoorsCvr() {
  const s = useSimPick("cabinDiff", "cvrErase", "cvrTest", "doorPositions", "elecHyd1", "elecHyd2", "engHyd1", "engHyd2", "faults", "patch", "wow");
  const d = useDerivedPick("cvrPowered", "dcPower", "doorWarning", "hydALow", "hydBPump1Low", "hydBPump2Low");
  const o = useOverheadLocal(useShallow((st) => ({ hornCutout: st.hornCutout, set: st.set })));
  const pw = d.dcPower;
  const doorEntries = [
    { label: "FWD ENTRY", key: "fwdEntry" }, { label: "CARGO", key: "cargo" },
    { label: "FWD CARGO", key: "fwdCargo" }, { label: "FWD SERVICE", key: "fwdService" },
    { label: "AFT ENTRY", key: "aftEntry" }, { label: "EQUIP", key: "equip" },
    { label: "AFT CARGO", key: "aftCargo" }, { label: "AFT SERVICE", key: "aftService" },
  ] as const;
  const [interconnect, setInterconnect] = useState(false);
  return (
    <>
      <Plate className="min-h-[112px]">
        <div className="grid grid-cols-2 gap-0.5 px-8"><Annun label="OVERHEAT" on={false} small /><Annun label="OVERHEAT" on={false} small /></div>
        <div className="mt-0.5 grid grid-cols-4 gap-0.5">
          <Annun label={<>LOW<br />PRESSURE</>} on={d.hydALow} small />
          <Annun label={<>LOW<br />PRESSURE</>} on={d.hydALow} small />
          <Annun label={<>LOW<br />PRESSURE</>} on={d.hydBPump1Low} small />
          <Annun label={<>LOW<br />PRESSURE</>} on={d.hydBPump2Low} small />
        </div>
        <div className={cn(LIGHT_PLATE, "mt-1 -mx-1 flex items-center justify-center gap-2 rounded-[2px] px-1 py-1")}>
          <Cap className="!text-[#1a1c1f]">GRD INTERCONNECT</Cap>
          <HSwitch<"CLOSE" | "OPEN"> options={["CLOSE", "OPEN"]} value={interconnect ? "OPEN" : "CLOSE"} onChange={(v) => setInterconnect(v === "OPEN")} legends={["CLOSE", "OPEN"]} />
        </div>
        <div className={cn(LIGHT_PLATE, "mt-1 -mx-1 rounded-[2px] px-1 py-1")}>
          <div className="grid grid-cols-4 items-start gap-0.5">
            <OnOff small on={s.engHyd1} onChange={(v) => s.patch({ engHyd1: v })} legends={["", ""]} />
            <OnOff small on={s.elecHyd2} onChange={(v) => s.patch({ elecHyd2: v })} legends={["", ""]} />
            <OnOff small on={s.elecHyd1} onChange={(v) => s.patch({ elecHyd1: v })} legends={["", ""]} />
            <OnOff small on={s.engHyd2} onChange={(v) => s.patch({ engHyd2: v })} legends={["", ""]} />
          </div>
          <div className={cn(LEGEND, "mt-0.5 grid grid-cols-4 text-center text-[6px] !text-[#1a1c1f]")}><span>ENG 1</span><span>ELEC 2</span><span>ELEC 1</span><span>ENG 2</span></div>
          <div className={cn(LEGEND, "grid grid-cols-[1fr_auto_1fr] text-center text-[7px] !text-[#1a1c1f]")}><span>A</span><span>HYD PUMPS</span><span>B</span></div>
        </div>
      </Plate>
      <Plate className="min-h-[56px]">
        <div className="mb-1 flex justify-center"><Annun label="DOOR WARN" on={d.doorWarning} tone="amber" small className="w-16" /></div>
        <div className="grid grid-cols-4 gap-0.5">
          {doorEntries.map(({ label, key }) => <Annun key={key} label={label} on={pw && s.doorPositions[key]} small onClick={() => s.patch({ doorPositions: { ...s.doorPositions, [key]: !s.doorPositions[key] } }, `${label} DOOR ${s.doorPositions[key] ? "CLOSED" : "OPEN"}`)} />)}
        </div>
      </Plate>
      <Plate className="min-h-[96px]">
        <div className="flex items-center justify-around">
          <div className="size-[34px] rounded-full border-2 border-[#1a1c1f] bg-[radial-gradient(circle,#3a3d41,#17181a)]" />
          <svg viewBox="0 0 40 24" width="34" height="22" aria-label="CVR meter"><path d="M2 22 A18 18 0 0 1 38 22 Z" fill="#d9d6c9" stroke="#222" /><line x1="20" y1="22" x2="12" y2="9" stroke="#222" strokeWidth="1.2" /></svg>
          <div className="flex flex-col items-center gap-0.5"><span className={cn("size-[7px] rounded-full", d.cvrPowered && s.cvrTest ? "bg-[#42d36e]" : "bg-[#2a2e2c]")} /><Cap>TEST</Cap></div>
          <div className="flex flex-col items-center gap-0.5"><span className={cn("size-[7px] rounded-full", s.cvrErase ? "bg-[#ff3b30] shadow-[0_0_5px_#ff3b30]" : "bg-[#6b1a16]")} /><Cap>ERASE</Cap></div>
        </div>
        <div className="mt-1 flex items-center justify-around">
          <RoundBtn label="TEST" onPress={() => s.patch({ cvrTest: true }, "CVR TEST") } onRelease={() => s.patch({ cvrTest: false })} />
          <RoundBtn label="ERASE" onPress={() => { if (!s.wow || !d.dcPower || s.faults.cvrFailure) { s.patch({}, "CVR ERASE INHIBITED — requires ground, DC power, and an operative CVR"); return; } s.patch({ cvrErase: true, cvrMemoryErased: false }, "CVR ERASE HELD"); }} onRelease={() => s.patch({ cvrErase: false })} />
          <RoundBtn label="HEADPHONE" />
        </div>
        <Cap className="mt-0.5">COCKPIT VOICE RECORDER</Cap>
      </Plate>
      <Plate className="min-h-[196px]">
        <div className="grid grid-cols-[1fr_auto] gap-1">
          <div className="flex flex-col items-center gap-1">
            <Gauge label="DIFF PRESS PSI" sub="CABIN ALT ×1000 FT" value={s.cabinDiff} min={0} max={10} size={92} />
            <div className="flex items-center gap-1">
              <div className="rounded-[2px] border border-black bg-black px-1 py-0.5 text-center font-mono text-[5px] font-bold leading-tight text-[#e6e1d2]">PRESS DIFF<br />LIMIT: TAKE-<br />OFF &amp; LDG<br />.125 PSI</div>
              <Gauge label="CABIN CLIMB" sub="1000 FT/MIN" value={0} min={-4} max={4} size={56} ticks={8} />
            </div>
          </div>
          <div className="flex flex-col items-center gap-1 px-1"><Cap>ALT HORN<br />CUTOUT</Cap><RoundBtn onPress={() => o.set({ hornCutout: !o.hornCutout })} /></div>
        </div>
      </Plate>
    </>
  );
}

/* ───────────────────────── MAIN ROW · COLUMN E (air conditioning, bleed, pressurization) ───────────────────────── */

const TEMP_MODES = ["MANUAL_COOL", "AUTO", "MANUAL_WARM"] as const;

function CabinTemp({ side }: { side: "L" | "R" }) {
  const s = useSimPick("patch", "tempModeL", "tempModeR", "tempSelectL", "tempSelectR");
  const d = useDerivedPick("dcPower", "packLDuctOverheat", "packRDuctOverheat");
  const pw = d.dcPower;
  const raw = (side === "L" ? s.tempModeL : s.tempModeR) ?? "AUTO";
  const mode = raw === "MANUAL" ? "MANUAL_COOL" : raw;
  const mIdx = Math.max(0, (TEMP_MODES as readonly string[]).indexOf(mode));
  const sel = (side === "L" ? s.tempSelectL : s.tempSelectR) ?? 75;
  return (
    <div className="flex flex-col items-center gap-0.5">
      <Knob compact size={30} min={65} max={85} step={1} value={sel} onChange={(v) => s.patch(side === "L" ? { tempSelectL: v } : { tempSelectR: v })} ticks={["COLD", "HOT"]} />
      <Annun label={<>DUCT<br />OVERHEAT</>} on={pw && (side === "L" ? d.packLDuctOverheat : d.packRDuctOverheat)} small className="w-[52px]" />
      <Knob compact size={30} min={0} max={2} step={1} value={mIdx} onChange={(v) => s.patch((side === "L" ? { tempModeL: TEMP_MODES[v] } : { tempModeR: TEMP_MODES[v] }) as never)} ticks={["COOL", "AUTO", "WARM"]} />
      <Cap>{mode === "AUTO" ? "AUTO" : "MANUAL"}</Cap>
    </div>
  );
}

function AirCondPanel() {
  const s = useSimPick("faults", "mixCabin", "mixPass", "packL", "packR", "patch", "tempSelectL", "tempSelectR");
  const d = useDerivedPick("dcPower");
  const pw = d.dcPower;
  const [airTemp, setAirTemp] = useState(0); // 0 supply duct, 1 pass cabin
  const sel = (airTemp === 0 ? s.tempSelectL : s.tempSelectR) ?? 75;
  const packOn = s.packL || s.packR;
  const ductC = packOn ? (sel - 32) / 1.8 : 15;
  return (
    <Plate className="min-h-[250px]">
      <div className="grid grid-cols-3 text-center"><Cap>CONT CABIN</Cap><Cap>AIR TEMP</Cap><Cap>PASS CABIN</Cap></div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-1">
        <div className="flex flex-col items-center gap-1"><MixDial label="CONT" value={s.mixCabin} onChange={(v) => s.patch({ mixCabin: v, tempModeL: "MANUAL" }, "LEFT AIR MIX VALVE MANUAL POSITION")} disabled={s.faults.mixValveJamL} /><CabinTemp side="L" /></div>
        <div className="flex flex-col items-center gap-1">
          <Knob compact size={26} min={0} max={1} step={1} value={airTemp} onChange={setAirTemp} ticks={["SUPPLY\nDUCT", "PASS\nCABIN"]} />
          <Gauge label="DUCT TEMP" value={pw ? ductC : -20} min={-20} max={100} size={64} />
        </div>
        <div className="flex flex-col items-center gap-1"><MixDial label="PASS" value={s.mixPass} onChange={(v) => s.patch({ mixPass: v, tempModeR: "MANUAL" }, "RIGHT AIR MIX VALVE MANUAL POSITION")} disabled={s.faults.mixValveJamR} /><CabinTemp side="R" /></div>
      </div>
    </Plate>
  );
}

function PackSwitch({ side }: { side: "L" | "R" }) {
  const s = useSimPick("packL", "packR", "packTripL", "packTripR", "patch");
  const current = side === "L" ? s.packL : s.packR;
  // This simulator state stores pack selection as a boolean: ON maps to AUTO.
  const val: "OFF" | "AUTO" = current ? "AUTO" : "OFF";
  return (
    <VSwitch<"OFF" | "AUTO">
      small
      label={`${side} PACK`}
      options={["OFF", "AUTO"]}
      value={val}
      legends={["OFF", "AUTO"]}
      onChange={(v) => {
        const k = side === "L" ? "packL" : "packR";
        const t = side === "L" ? "packTripL" : "packTripR";
        s.patch(
          {
            [k]: v !== "OFF",
            [t]: v === "OFF" ? false : side === "L" ? s.packTripL : s.packTripR,
          } as never,
        );
      }}
    />
  );
}

function BleedPanel() {
  const s = useSimPick("apuBleed", "bleed1", "bleed2", "bleedTrip1", "bleedTrip2", "isolation", "packTripL", "packTripR", "patch", "recirc");
  const d = useDerivedPick("dcPower", "dualBleed", "ductPsi", "packLDuctOverheat", "packRDuctOverheat");
  const pw = d.dcPower;
  const [testOvht, setTestOvht] = useState(false);
  return (
    <>
      <Plate className="min-h-[40px]">
        <div className="grid grid-cols-3 gap-1">
          <Annun label={<>DUAL<br />BLEED</>} on={pw && d.dualBleed} tone="amber" small />
          <Annun label="" on={false} tone="blue" small />
          <Annun label="" on={false} tone="blue" small />
        </div>
      </Plate>
      <Plate className={cn(LIGHT_PLATE, "min-h-[300px]")}>
        <div className="grid grid-cols-[1fr_auto] items-start gap-1">
          <Gauge label="DUCT PRESS" value={d.ductPsi} min={0} max={80} size={86} />
          <div className="flex flex-col items-center gap-0.5">
            <Cap className="!text-[#1a1c1f]">GASPER FAN</Cap>
            <OffOn small on={s.recirc} onChange={(v) => s.patch({ recirc: v })} legends={["OFF", "ON"]} />
            <Annun label="OVHT" on={pw && testOvht} small className="w-9" />
            <RoundBtn label="TEST" onPress={() => setTestOvht(true)} onRelease={() => setTestOvht(false)} />
          </div>
        </div>
        <div className="mt-1 grid grid-cols-[auto_1fr_auto] items-start gap-1">
          <PackSwitch side="L" />
          <div className="flex flex-col items-center gap-0.5">
            <Cap className="!text-[#1a1c1f]">ISOLATION VALVE</Cap>
            <VSwitch<"CLOSE" | "AUTO" | "OPEN"> small options={["CLOSE", "AUTO", "OPEN"]} value={s.isolation} onChange={(v) => s.patch({ isolation: v })} legends={["CLOSE", "AUTO", "OPEN"]} />
            <RoundBtn label="TRIP RESET" onPress={() => s.patch({ packTripL: false, packTripR: false, bleedTrip1: false, bleedTrip2: false }, "TRIP RESET — pack and bleed trips reset.")} />
          </div>
          <PackSwitch side="R" />
        </div>
        <div className="mt-1 grid grid-cols-2 gap-1">
          <div className="flex flex-col gap-0.5">
            <Annun label={<>PACK<br />TRIP OFF</>} on={pw && s.packTripL} small />
            <Annun label={<>WING-BODY<br />OVERHEAT</>} on={pw && d.packLDuctOverheat} small />
            <Annun label={<>BLEED<br />TRIP OFF</>} on={pw && s.bleedTrip1} small />
          </div>
          <div className="flex flex-col gap-0.5">
            <Annun label={<>PACK<br />TRIP OFF</>} on={pw && s.packTripR} small />
            <Annun label={<>WING-BODY<br />OVERHEAT</>} on={pw && d.packRDuctOverheat} small />
            <Annun label={<>BLEED<br />TRIP OFF</>} on={pw && s.bleedTrip2} small />
          </div>
        </div>
        <div className="mt-1 grid grid-cols-3 items-start">
          <OffOn small label="1" on={s.bleed1} onChange={(v) => s.patch({ bleed1: v, bleedTrip1: v ? s.bleedTrip1 : false })} />
          <OffOn small label="APU" on={s.apuBleed} onChange={(v) => s.patch({ apuBleed: v })} />
          <OffOn small label="2" on={s.bleed2} onChange={(v) => s.patch({ bleed2: v, bleedTrip2: v ? s.bleedTrip2 : false })} />
        </div>
        <Cap className="!text-[#1a1c1f]">BLEED</Cap>
      </Plate>
    </>
  );
}

function Readout2({ value, on }: { value: string; on: boolean }) {
  return <div className="rounded-[2px] border border-black bg-black px-1 text-center font-mono text-[11px] font-bold text-[#f1f1ea]">{on ? value : "-----"}</div>;
}

function PressPanel() {
  const s = useSimPick("cabinDiff", "patch", "pressMode");
  const d = useDerivedPick("dcPower");
  const pw = d.dcPower;
  const [fltAlt, setFltAlt] = useState(39000);
  const [landAlt, setLandAlt] = useState(200);
  const [standbyCabAlt, setStandbyCabAlt] = useState(200);
  const [standbyCabRate, setStandbyCabRate] = useState(0);
  const [manValve, setManValve] = useState<"OPEN" | "CLOSE">("CLOSE");
  const [fgt, setFgt] = useState<"F" | "GRD" | "T">("F");
  const modeLabel = s.pressMode === "MAN_AC" ? "MAN AC" : s.pressMode === "MAN_DC" ? "MAN DC" : s.pressMode;
  return (
    <>
      <Plate className={cn(LIGHT_PLATE, "min-h-[290px]")}>
        <div className="grid grid-cols-4 gap-0.5">
          <Annun label={<>AUTO<br />FAIL</>} on={false} small />
          <Annun label={<>OFF SCHED<br />DESCENT</>} on={false} small />
          <Annun label="" on={false} small />
          <Annun label="MANUAL" on={pw && (s.pressMode === "MAN_AC" || s.pressMode === "MAN_DC")} tone="green" small />
        </div>
        <div className="mt-1 grid grid-cols-[1fr_1fr_1fr] items-start gap-1">
          <div className="flex flex-col items-center gap-1"><Cap className="!text-[#1a1c1f]">AUTO</Cap><Readout2 value={String(fltAlt).padStart(5, "0")} on={pw} /><Knob size={28} min={0} max={41000} step={500} value={fltAlt} onChange={setFltAlt} /><Cap className="!text-[#1a1c1f]">FLT ALT</Cap><Readout2 value={String(landAlt).padStart(5, "0")} on={pw} /><Knob size={28} min={-1000} max={14000} step={100} value={landAlt} onChange={setLandAlt} /><Cap className="!text-[#1a1c1f]">LAND ALT</Cap></div>
          <div className="flex flex-col items-center gap-1"><Cap className="!text-[#1a1c1f]">STANDBY</Cap><Knob size={34} min={-1} max={1} step={0.1} value={standbyCabRate} onChange={setStandbyCabRate} ticks={["DECR", "INCR"]} /><Readout2 value={`${standbyCabRate > 0 ? "+" : ""}${standbyCabRate.toFixed(1)}`} on={pw} /><Cap className="!text-[#1a1c1f]">CABIN RATE</Cap><Readout2 value={String(Math.round(standbyCabAlt)).padStart(5, "0")} on={pw} /><Knob size={28} min={0} max={50000} step={100} value={standbyCabAlt} onChange={setStandbyCabAlt} /><Cap className="!text-[#1a1c1f]">CAB ALT</Cap></div>
          <div className="flex flex-col items-center gap-1"><Cap className="!text-[#1a1c1f]">MANUAL</Cap><Gauge label="OUTFLOW VALVE" value={manValve === "OPEN" ? 8 : 2} min={0} max={10} size={56} /><VSwitch<"OPEN" | "CLOSE"> small options={["OPEN", "CLOSE"]} value={manValve} onChange={setManValve} legends={["OPEN", "CLOSE"]} /></div>
        </div>
        <div className="mt-1 grid grid-cols-[auto_1fr] items-center gap-2 border-t border-[#2c2f33]/60 pt-1">
          <VSwitch<"F" | "GRD" | "T"> small options={["F", "GRD", "T"]} value={fgt} onChange={setFgt} legends={["F", "GRD", "T"]} />
          <Selector3 label={modeLabel} options={["AUTO", "STBY", "MAN AC", "MAN DC"]} value={modeLabel} onChange={(v) => s.patch({ pressMode: v === "MAN AC" ? "MAN_AC" : v === "MAN DC" ? "MAN_DC" : (v as "AUTO" | "STBY") })} />
        </div>
      </Plate>
      <Plate className="min-h-[48px]">
        <div className="flex items-center gap-1 rounded-[2px] border border-black bg-black p-1">
          <div className="flex flex-col gap-1 font-mono text-[6px] font-bold text-[#e6e1d2]"><span>CAB ALT</span><span>FLT ALT</span></div>
          <div className="relative h-[22px] flex-1 border-l border-[#e6e1d2]">
            {[0, 1, 2, 3, 4].map((i) => <span key={i} className="absolute top-0 h-full w-px bg-[#e6e1d2]/70" style={{ left: `${i * 25}%` }} />)}
            <span className="absolute left-0 top-[2px] h-[6px] bg-[#e6e1d2]" style={{ width: pw ? `${clamp(s.cabinDiff * 3, 0, 100)}%` : 0 }} />
            <span className="absolute left-0 top-[13px] h-[6px] bg-[#e6e1d2]" style={{ width: pw ? `${clamp(fltAlt / 410, 0, 100)}%` : 0 }} />
          </div>
        </div>
      </Plate>
    </>
  );
}

/* ───────────────────────── BOTTOM STRIP ───────────────────────── */

const START_KNOB = ["GRD", "OFF", "L IGN", "R IGN", "FLT"];
function StartKnob({ n }: { n: 1 | 2 }) {
  const s = useSimPick("patch", "start1", "start2");
  const v = n === 1 ? s.start1 : s.start2;
  const idx = v === "GRD" ? 0 : v === "OFF" ? 1 : v === "IGN_L" ? 2 : v === "IGN_R" ? 3 : v === "FLT" ? 4 : 1;
  const MAP = ["GRD", "OFF", "IGN_L", "IGN_R", "FLT"] as const;
  return (
    <div className="flex flex-col items-center">
      <Knob size={46} min={0} max={4} step={1} value={idx} ticks={START_KNOB}
        onChange={(i) => { const nv = MAP[Math.round(i)]; s.patch((n === 1 ? { start1: nv } : { start2: nv }) as never, `ENG ${n} START → ${START_KNOB[Math.round(i)]}`); }} />
      <Cap>{n}</Cap>
    </div>
  );
}

function BottomStrip() {
  const s = useSimPick("apuMaster", "ltAntiCol", "ltFixedL", "ltFixedR", "ltPosition", "ltRetL", "ltRetR", "ltTaxi", "ltTurnoffL", "ltTurnoffR", "ltWheelWell", "ltWing", "patch");
  // Strobe and navigation are separate switches on this aircraft; the sim has one position-light state.
  const [strobe, setStrobe] = useState(s.ltPosition === "STROBE_STEADY");
  const [nav, setNav] = useState(s.ltPosition !== "OFF");
  const setLights = (st: boolean, nv: boolean) => { setStrobe(st); setNav(nv); s.patch({ ltPosition: nv ? (st ? "STROBE_STEADY" : "STEADY") : "OFF" }); };
  return (
    <div className={cn(PLATE, "p-2")}>
      <Screws />
      <div className="flex items-start justify-between gap-2 px-1">
        <div className="flex items-start gap-1">
          <IndexLock />
          <div>
            <div className="flex justify-between px-4"><Cap>LANDING</Cap></div>
            <div className="flex items-start gap-2">
              <div className="flex h-[54px] items-center"><span className={cn(LEGEND, "text-[5px] [writing-mode:vertical-rl]")}>EXTEND</span></div>
              <VSwitch<"RETRACT" | "EXT" | "ON"> small label="OUTBD L" options={["RETRACT", "EXT", "ON"]} value={s.ltRetL} onChange={(v) => s.patch({ ltRetL: v })} legends={["RETRACT", "", "ON"]} />
              <VSwitch<"RETRACT" | "EXT" | "ON"> small label="OUTBD R" options={["RETRACT", "EXT", "ON"]} value={s.ltRetR} onChange={(v) => s.patch({ ltRetR: v })} legends={["", "", "ON"]} />
              <OffOn small label="INBD L" on={s.ltFixedL} onChange={(v) => s.patch({ ltFixedL: v })} legends={["OFF", "ON"]} />
              <OffOn small label="INBD R" on={s.ltFixedR} onChange={(v) => s.patch({ ltFixedR: v })} legends={["", "ON"]} />
            </div>
          </div>
        </div>
        <div>
          <Cap>TAXI · RUNWAY TURNOFF</Cap>
          <div className="flex items-start gap-2">
            <OffOn small label="TAXI" on={s.ltTaxi} onChange={(v) => s.patch({ ltTaxi: v })} />
            <OffOn small label="L" on={s.ltTurnoffL} onChange={(v) => s.patch({ ltTurnoffL: v })} />
            <OffOn small label="R" on={s.ltTurnoffR} onChange={(v) => s.patch({ ltTurnoffR: v })} />
          </div>
        </div>
        <div className="flex flex-col items-center">
          <Cap>APU</Cap>
          <VSwitch<"OFF" | "ON" | "START"> small options={["OFF", "ON", "START"]} value={s.apuMaster} onChange={(v) => s.patch({ apuMaster: v }, `APU MASTER → ${v}`)} legends={["OFF", "ON", "START"]} />
        </div>
        <div className="flex items-end gap-2">
          <Cap className="self-start">ENGINE START</Cap>
          <StartKnob n={1} />
          <StartKnob n={2} />
        </div>
        <div className="flex items-start gap-1.5">
          <OffOn small label="STROBE" on={strobe} onChange={(v) => setLights(v, nav)} />
          <OffOn small label="NAVIGATION" on={nav} onChange={(v) => setLights(strobe, v)} />
          <OffOn small label="ANTI COLL" on={s.ltAntiCol} onChange={(v) => s.patch({ ltAntiCol: v })} />
          <OffOn small label="WING" on={s.ltWing} onChange={(v) => s.patch({ ltWing: v })} />
          <OffOn small label="WHEEL WELL" on={s.ltWheelWell} onChange={(v) => s.patch({ ltWheelWell: v })} />
          <IndexLock />
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── assembly ───────────────────────── */

/** Maintenance test block + FWD / AFT cargo fire panel, as photographed (no IRS on this aircraft). */
function CargoFirePanel() {
  const s = useSimPick("cargoArmed", "cargoBottleDischarged", "cargoFireInstalled", "patch");
  const d = useDerivedPick("cargoAftFireWarn", "cargoFwdFireWarn", "dcPower");
  const pw = d.dcPower;
  const [arm, setArm] = useState(false);
  const [lamp, setLamp] = useState(false);
  const lit = pw && lamp;
  const disch = (c: "FWD" | "AFT") => {
    if (!arm || !s.cargoFireInstalled || s.cargoBottleDischarged) return;
    s.patch({ cargoArmed: c, cargoBottleDischarged: true, cargoAgentTimer: 0 }, `CARGO FIRE DISCH — agent released into the ${c} compartment.`);
  };
  return (
    <Plate className="min-h-[190px]">
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col items-center gap-1">
          <div className="flex gap-2">
            <RoundBtn label="MX TEST" />
            <RoundBtn label="LAMP TEST" onPress={() => setLamp(true)} onRelease={() => setLamp(false)} />
          </div>
          <RoundBtn label="MX SETUP" />
          <div className="flex gap-2">
            <Annun label="MX" on={lit} tone="amber" small className="w-8" />
            <Annun label="SYS OK" on={pw} tone="green" small className="w-10" />
          </div>
          <div className="h-5 w-full rounded-[2px] border border-[#111] bg-black" />
          <Cap>MX DISPLAY</Cap>
        </div>
        <div className="flex flex-col items-center gap-1">
          <Cap>FWD</Cap>
          <Annun label="FIRE" on={lit || (pw && d.cargoFwdFireWarn)} tone="red" small className="w-10" />
          <RoundBtn label="DISCH" onPress={() => disch("FWD")} />
          <Annun label="BTL1 DISCH" on={lit || (pw && s.cargoBottleDischarged && s.cargoArmed === "FWD")} tone="green" small className="w-14" />
          <OnOff guarded small label="ARM" on={arm} onChange={setArm} legends={["", "ARM"]} />
          <Cap>AFT</Cap>
          <Annun label="FIRE" on={lit || (pw && d.cargoAftFireWarn)} tone="red" small className="w-10" />
          <RoundBtn label="DISCH" onPress={() => disch("AFT")} />
          <Annun label="BTL2 DISCH" on={lit || (pw && s.cargoBottleDischarged && s.cargoArmed === "AFT")} tone="green" small className="w-14" />
        </div>
      </div>
    </Plate>
  );
}

function Overhead() {
  return (
    <div className="relative overflow-hidden rounded-[10px] border-2 border-[#202225] bg-[#55585c] p-2 shadow-[inset_0_0_30px_rgba(0,0,0,.45)]" style={{ width: DESIGN_W }}>
      {/* top row */}
      <div className={cn("grid items-stretch gap-1", COLS)}>
        <Col><Blank h={190} /><EltPanel /><LeDevices /></Col>
        <Col><CargoFirePanel /></Col>
        <Col><ServiceInterphone /></Col>
        <Col><AudioPanel /><EnginePanel /><OxygenRow /></Col>
        <Col><RecorderPanel /></Col>
      </div>
      {/* INDEX · TO LOCK band with DOME WHITE */}
      <div className={cn("mt-1 grid items-center gap-1", COLS)}>
        <div className="flex items-center justify-start pl-1"><IndexLock /></div>
        <div />
        <DomeWhite />
        <div />
        <div className="flex items-center justify-end pr-1"><IndexLock /></div>
      </div>
      {/* main row */}
      <div className={cn("mt-1 grid items-stretch gap-1", COLS)}>
        <Col><CompassPanel /><FltCtrlPanel /><FuelPanel /></Col>
        <Col><MeterPanel /><StandbyPanel /><GenPanel /></Col>
        <Col><CabinServicePanel /></Col>
        <Col><IcePanel /><HydDoorsCvr /></Col>
        <Col><Blank h={48} /><AirCondPanel /><BleedPanel /><PressPanel /></Col>
      </div>
      <div className="mt-1"><BottomStrip /></div>
    </div>
  );
}

/** The actual P5 panel face without the desktop trainer's title, zoom buttons, or help text. */
export function OverheadP5Face() {
  return <Overhead />;
}

export function OverheadP5() {
  const wrap = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);
  const [zoom, setZoom] = useState<"fit" | 1 | 1.5>("fit");
  const [h, setH] = useState(2200);
  useEffect(() => {
    const upd = () => {
      const w = wrap.current?.clientWidth || DESIGN_W;
      setFit(Math.min(1, (w - 18) / DESIGN_W));
      setH(inner.current?.offsetHeight || 2200);
    };
    upd();
    const ro = new ResizeObserver(upd);
    if (wrap.current) ro.observe(wrap.current);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, []);
  const scale = zoom === "fit" ? fit : zoom;
  return (
    <section className="relative rounded-xl border border-[#4a4f56] bg-[#202328] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,.04),0_8px_25px_rgba(0,0,0,.28)]">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="font-display text-[10px] uppercase tracking-[.18em] text-[#b9af98]">P5 · FORWARD OVERHEAD · 737-200</div>
          <div className="font-display text-lg font-semibold text-fg">Interactive overhead — every control is live</div>
        </div>
        <div className="flex items-center gap-1">
          <span className="mr-1 font-mono text-[8px] uppercase text-subtle">Size</span>
          {([["fit", "FIT"], [1, "100%"], [1.5, "150%"]] as const).map(([z, l]) => (
            <button key={String(z)} type="button" onClick={() => setZoom(z)} className={cn("rounded border px-2 py-1 font-mono text-[9px]", zoom === z ? "border-accent/70 bg-accent/10 text-accent" : "border-border bg-inset text-subtle")}>{l}</button>
          ))}
        </div>
      </div>
      <div
        ref={wrap}
        data-scaled-panel
        className="max-h-[85vh] overflow-auto panel-scroll panel-interactive rounded-lg border border-[#343a42] bg-[#121417] p-2"
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
        style={{ WebkitTouchCallout: "none" as never }}
      >
        <div style={{ width: DESIGN_W * scale, height: h * scale }}>
          <div ref={inner} style={{ width: DESIGN_W, transform: `scale(${scale})`, transformOrigin: "top left" }}>
            <Overhead />
          </div>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-muted">Lights and displays need DC power — flip BAT first. Tap a switch to move it; knobs turn by dragging around them.</p>
    </section>
  );
}
