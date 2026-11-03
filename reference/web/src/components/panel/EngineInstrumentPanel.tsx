import { propsEqual } from "@/lib/props-equal";
import { memo } from "react";
import type { ReactNode } from "react";
import { useSimPick, useDerivedPick } from "@/lib/sim/store";
import type { GearLever } from "@/lib/sim/types";
import { cn } from "@/lib/utils";

/**
 * Round-dial engine / systems instruments and the landing gear lever, laid out
 * after a real 737-200 centre instrument panel (photo reference):
 *   cream panel : EPR, N1, N2, fuel flow
 *   centre      : oil pressure, oil temperature, EGT, oil quantity, hydraulic pressures
 *   right       : flap position, LE flap / antiskid annunciators, gear lever + placard
 */

const A0 = -135;
const A1 = 135;
const polar = (r: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [50 + r * Math.sin(a), 50 - r * Math.cos(a)];
};
const arc = (r: number, d0: number, d1: number) => {
  const [x0, y0] = polar(r, d0);
  const [x1, y1] = polar(r, d1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${d1 - d0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
};

type Band = { from: number; to: number; color: string };

function DialImpl({
  label, unit, value, min, max, major, minor = 5, scale = 1, bands = [], digits = 0, size = 112, caption, dead = false, win,
}: {
  label: string; unit?: string; value: number; min: number; max: number;
  /** value step between numbered ticks, in raw units */
  major: number; minor?: number;
  /** printed numbers = raw / scale */
  scale?: number; bands?: Band[]; digits?: number; size?: number; caption?: string; dead?: boolean;
  /** in-dial digital counter window (real gauges: N1 / N2 / EGT). `text` null = gauge not operating -> blank orange window. */
  win?: { text: string | null; x?: number; y?: number; w?: number };
}) {
  const span = max - min;
  const ang = (v: number) => A0 + ((Math.min(max, Math.max(min, v)) - min) / span) * (A1 - A0);
  const majors: number[] = [];
  for (let v = min; v <= max + 1e-6; v += major) majors.push(v);
  const needle = ang(dead ? min : value);
  const small = size < 80;
  return (
    <div className="flex flex-col items-center gap-0.5">
      <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={`${label} ${value.toFixed(digits)} ${unit ?? ""}`}>
        <circle cx="50" cy="50" r="49" fill="#15181c" stroke="#5b6168" strokeWidth="1.5" />
        <circle cx="50" cy="50" r="44" fill="#0b0c0e" />
        {bands.map((b, i) => <path key={i} d={arc(41, ang(b.from), ang(b.to))} stroke={b.color} strokeWidth="3.2" fill="none" />)}
        {majors.map((v) => {
          const a = ang(v);
          const [x0, y0] = polar(44, a);
          const [x1, y1] = polar(37, a);
          const [tx, ty] = polar(29, a);
          return (
            <g key={v}>
              <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="#e8e4d6" strokeWidth="1.4" />
              <text x={tx} y={ty} fill="#e8e4d6" fontSize={small ? 10 : 8} fontFamily="ui-sans-serif,system-ui" fontWeight="600" textAnchor="middle" dominantBaseline="central">
                {Number((v / scale).toFixed(1))}
              </text>
            </g>
          );
        })}
        {!small && majors.slice(0, -1).flatMap((v) =>
          Array.from({ length: minor - 1 }, (_, k) => {
            const a = ang(v + ((k + 1) * major) / minor);
            const [x0, y0] = polar(44, a);
            const [x1, y1] = polar(40.5, a);
            return <line key={`${v}-${k}`} x1={x0} y1={y0} x2={x1} y2={y1} stroke="#bdb8a8" strokeWidth="0.7" />;
          }),
        )}
        <text x="50" y={small ? 70 : 68} fill="#cfc9b6" fontSize={small ? 9 : 6.5} fontFamily="ui-sans-serif,system-ui" textAnchor="middle" letterSpacing="0.4">{label}</text>
        {unit && !small && <text x="50" y="76" fill="#8f8b7d" fontSize="5" fontFamily="ui-monospace,monospace" textAnchor="middle">{unit}</text>}
        <g style={{ transform: `rotate(${needle}deg)`, transformOrigin: "50px 50px", transition: "transform .35s ease-out" }}>
          <polygon points="50,9 52,50 48,50" fill="#f3efe2" stroke="#000" strokeWidth="0.4" />
        </g>
        <circle cx="50" cy="50" r="4.5" fill="#2a2d31" stroke="#6b7078" strokeWidth="0.8" />
        {win && (() => {
          const w = win.w ?? 22, x = win.x ?? 50 - w / 2, y = win.y ?? 22;
          return (
            <g>
              <rect x={x} y={y} width={w} height="9" rx="1" fill="#050607" stroke="#2a2d31" strokeWidth="0.6" />
              {win.text === null
                ? <rect x={x + 1.5} y={y + 1.5} width={w - 3} height="6" fill="#ff7a1a" />
                : <text x={x + w / 2} y={y + 4.7} fill="#f2f2f2" fontSize="6.5" fontFamily="ui-monospace,monospace" fontWeight="bold" textAnchor="middle" dominantBaseline="central">{win.text}</text>}
            </g>
          );
        })()}
        {dead && <rect x="38" y="82" width="24" height="7" rx="1" fill="#7a1f1f" />}
      </svg>
      <span className="font-mono text-[9px] tabular-nums text-subtle">{caption ?? `${value.toFixed(digits)}${unit ? ` ${unit}` : ""}`}</span>
    </div>
  );
}

function Ann({ label, on, tone = "amber" }: { label: string; on: boolean; tone?: "amber" | "green" | "red" }) {
  const lit = { amber: "border-[#b8821f] bg-[#5a3d0c] text-[#ffc65a] shadow-[0_0_10px_rgba(255,178,60,.5)]", green: "border-[#2f8f5b] bg-[#10361f] text-[#66f0a2] shadow-[0_0_10px_rgba(60,230,140,.45)]", red: "border-[#a33] bg-[#4a1010] text-[#ff7a7a] shadow-[0_0_10px_rgba(255,70,70,.5)]" }[tone];
  return (
    <div className={cn("flex min-h-7 items-center justify-center rounded-[2px] border px-1.5 py-1 text-center font-display text-[8px] font-semibold uppercase leading-tight tracking-wide", on ? lit : "border-[#2c3036] bg-[#14171a] text-[#4d535b]")}>
      {label}
    </div>
  );
}

function Plate({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-md border border-[#4a5057] bg-[#1d2227] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,.05),0_3px_8px_rgba(0,0,0,.35)]", className)}>
      {title && <div className="mb-1.5 text-center font-display text-[8px] font-semibold uppercase tracking-[.18em] text-[#a9a08c]">{title}</div>}
      {children}
    </div>
  );
}

const KG_TO_LB = 2.2046;
const GREEN = "#2fc27a";
const RED = "#e24b4b";
const AMBER = "#e0a84a";

function Pair({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 justify-items-center gap-1">{children}</div>;
}

/** One push-to-test gear lens: embossed legend, glows when its lamp is on. Upper = red, lower = green. */
function GearLens({ text, on, tone }: { text: string; on: boolean; tone: "red" | "green" }) {
  const lit = tone === "red"
    ? "border-[#8a2a2a] bg-[#a52626] text-[#ffd0d0] shadow-[0_0_12px_rgba(255,60,60,.65)]"
    : "border-[#2c7a52] bg-[#2aa56a] text-[#d6ffe9] shadow-[0_0_12px_rgba(60,230,140,.55)]";
  return (
    <div className={cn("flex h-9 w-full flex-col items-center justify-center rounded-[2px] border font-display text-[9px] font-bold uppercase leading-[1.05] tracking-wider shadow-[inset_0_1px_0_rgba(255,255,255,.08)]",
      on ? lit : "border-[#4a4d50] bg-[linear-gradient(180deg,#34373a,#26292c)] text-[#4a4e52]")}>
      {text.split(" ").map((w) => <span key={w}>{w}</span>)}
    </div>
  );
}

/** Red lens above green lens: red = in transit / disagree, green = down and locked. */
export function GearPair({ text, red, green }: { text: string; red: boolean; green: boolean }) {
  return (
    <div className="flex w-[6.2rem] flex-col gap-px">
      <GearLens text={text} on={red} tone="red" />
      <GearLens text={text} on={green} tone="green" />
    </div>
  );
}

const GEAR_POSITIONS: GearLever[] = ["UP", "OFF", "DN"];
const GEAR_SLOT_TOP = [15, 50, 80]; // % of slot height for UP / OFF / DN

/** Gear selector: brass wheel knob on a straight, vertical lever centred in its slot. */
export function GearSelectorLever({ className }: { className?: string }) {
  const s = useSimPick("gear", "gearLeverOverride", "patch", "wow");
  const idx = Math.max(0, GEAR_POSITIONS.indexOf(s.gear));
  const set = (next: GearLever) => {
    if (next === "UP" && s.wow && !s.gearLeverOverride) {
      s.patch({ gear: "OFF" }, "GEAR SELECTOR LOCKED — UP inhibited on ground.");
      return;
    }
    s.patch({ gear: next });
  };
  const CX = 70; // slot / lever centre line (px)
  const LEG: Record<GearLever, string> = { UP: "UP", OFF: "OFF", DN: "GEAR DN" };
  return (
    <div className={cn("relative h-[19rem] w-[8.5rem] shrink-0 rounded-sm border border-[#2c2f33] bg-[#6a6d71] shadow-[inset_0_1px_0_rgba(255,255,255,.18),inset_0_-2px_6px_rgba(0,0,0,.35)]", className)}>
      {/* tall, narrow slot with rounded ends: light-grey channel as in the panel picture */}
      <div className="absolute bottom-[4%] top-[3%] w-[46px] -translate-x-1/2 rounded-t-[23px] rounded-b-[8px] border border-[#4b4e52] bg-[linear-gradient(90deg,#a9acb0,#e4e5e6_45%,#9a9da1)] shadow-[inset_0_2px_6px_rgba(0,0,0,.45),0_1px_0_rgba(255,255,255,.15)]" style={{ left: CX }} />
      {/* inner black guide the stem runs in */}
      <div className="absolute bottom-[12%] top-[10%] w-[8px] -translate-x-1/2 rounded-full bg-[#0b0d0f] shadow-[inset_0_0_4px_#000]" style={{ left: CX }} />
      {/* vertical legends down the left edge: UP / OFF / GEAR DN, each at its detent */}
      {GEAR_POSITIONS.map((p, i) => (
        <button key={p} type="button" onClick={() => set(p)} aria-label={`Gear lever ${p}`}
          className={cn("absolute left-2 -translate-y-1/2 px-0.5 font-mono text-[9px] font-bold tracking-[.18em] [writing-mode:vertical-rl] rotate-180", s.gear === p ? "text-[#f3efe2]" : "text-[#d2cdbd]/70 hover:text-[#f3efe2]")}
          style={{ top: `${GEAR_SLOT_TOP[i]}%` }}>{LEG[p]}</button>
      ))}
      {/* lever: brass wheel knob with a short black handle hanging below it, centred in the slot */}
      <button type="button" aria-label={`Landing gear lever ${s.gear}`} onClick={() => set(GEAR_POSITIONS[(idx + 1) % GEAR_POSITIONS.length])}
        className="absolute flex h-[88px] w-[40px] -translate-x-1/2 -translate-y-[38%] flex-col items-center transition-[top] duration-300"
        style={{ left: CX, top: `${GEAR_SLOT_TOP[idx]}%` }}>
        <span className="relative h-[52px] w-[36px] rounded-[48%] border border-[#6b5a1b] bg-[linear-gradient(90deg,#7b6a22,#d8c76a_40%,#efe3a0_55%,#7b6a22)] shadow-[0_3px_6px_rgba(0,0,0,.75),inset_0_0_8px_rgba(0,0,0,.35)]">
          <span className="absolute left-1/2 top-[18%] h-[64%] w-[10px] -translate-x-1/2 rounded-full bg-[linear-gradient(90deg,#8d7b2c,#c9b75c,#8d7b2c)] opacity-70" />
        </span>
        <span className="-mt-1 h-[34px] w-[11px] rounded-b-[4px] bg-[linear-gradient(90deg,#15171a,#3a3e43,#15171a)] shadow-[0_2px_3px_rgba(0,0,0,.7)]" />
      </button>
    </div>
  );
}

export function GearLeverP2() {
  const s = useSimPick("ltTest", "wow");
  const d = useDerivedPick("dcPower", "gearLights");
  const gl = d.gearLights;
  const test = s.ltTest && d.dcPower; // push-to-test via the P5 annunciator test switch
  return (
    <Plate title="Landing gear" className="w-full max-w-[17rem]">
      {/* gear position lights: NOSE on top, LEFT and RIGHT below; red lens over green lens */}
      <div className="mb-3 flex flex-col items-center gap-1">
        <GearPair text="NOSE GEAR" red={test || gl.nose.red} green={test || gl.nose.green} />
        <div className="flex gap-1">
          <GearPair text="LEFT GEAR" red={test || gl.leftMain.red} green={test || gl.leftMain.green} />
          <GearPair text="RIGHT GEAR" red={test || gl.rightMain.red} green={test || gl.rightMain.green} />
        </div>
        <div className="font-mono text-[7px] uppercase text-subtle">RED in transit / disagree · GREEN down &amp; locked</div>
      </div>
      <div className="flex flex-col items-center gap-2">
        <GearSelectorLever />
        <div className="flex w-full items-end">
          <div className="w-full rounded border border-[#6d5f3a] bg-[#b8a97a] p-1.5 font-mono text-[7px] leading-tight text-[#2a2415]">
            <div className="font-bold">LANDING GEAR LIMIT (IAS)</div>
            <div>OPERATING</div>
            <div>EXTEND 270K-.82M</div>
            <div>RETRACT 235K</div>
            <div>EXTENDED 320K-.82M</div>
            <div className="mt-0.5 font-bold">FLAPS LIMIT (IAS)</div>
            <div>1-230K · 2-230K · 5-225K</div>
            <div>10-210K · 15-195K · 25-190K</div>
            <div>30-185K · 40-170K</div><div>ALT FLAP EXT 310K</div>
          </div>
        </div>
      </div>
      {s.wow && <div className="mt-1.5 text-center font-mono text-[8px] uppercase text-subtle">Lever locks out of UP on the ground</div>}
    </Plate>
  );
}

export function EngineInstrumentPanel() {
  const s = useSimPick("egt1", "egt2", "ff1", "ff2", "flapPos", "flaps", "hydAPress", "hydBPress", "n1_1", "n1_2", "n2_1", "n2_2", "oilPsi1", "oilPsi2", "oilQty1", "oilQty2");
  const d = useDerivedPick("antiskidInbdOperational", "antiskidOutbdOperational", "autobrakePressure", "dcPower", "epr1", "epr2", "leExtended", "leTransit", "startValveOpen1", "startValveOpen2", "thrustReverser1Active", "thrustReverser2Active");
  const dc = d.dcPower;
  const n2On = (n: number) => n > 20;
  const ppH = (kg: number) => Math.max(0, kg) * KG_TO_LB;
  // Oil temperature has no sim state: trainer-approximated from engine speed (ambient ~15 °C, ~75 °C at idle+).
  const oilT = (n2: number, oilPsi: number) => (oilPsi < 5 ? 15 : Math.min(115, 15 + n2 * 0.75));
  const lowOil = (n2: number, p: number) => dc && n2On(n2) && p < 13;
  const rev = dc && (d.thrustReverser1Active || d.thrustReverser2Active);
  const flapCap = `${Math.round(s.flapPos ?? s.flaps)} units`;

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
      {/* cream panel: EPR / N1 / N2 / fuel flow */}
      <Plate title="Engine 1 · 2 — thrust" className="bg-[#cfc7ad]/10">
        <Pair>
          <Dial label="EPR 1" value={d.epr1} min={1} max={2.4} major={0.2} minor={2} digits={2} caption={d.epr1.toFixed(2)} bands={[{ from: 2.0, to: 2.4, color: RED }]} />
          <Dial label="EPR 2" value={d.epr2} min={1} max={2.4} major={0.2} minor={2} digits={2} caption={d.epr2.toFixed(2)} bands={[{ from: 2.0, to: 2.4, color: RED }]} />
          <Dial label="N1 RPM 1" unit="%" value={s.n1_1} min={0} max={110} major={10} minor={2} scale={10} bands={[{ from: 0, to: 100, color: GREEN }, { from: 100, to: 110, color: RED }]} />
          <Dial label="N1 RPM 2" unit="%" value={s.n1_2} min={0} max={110} major={10} minor={2} scale={10} bands={[{ from: 0, to: 100, color: GREEN }, { from: 100, to: 110, color: RED }]} />
          <Dial label="N2 RPM 1" unit="%" value={s.n2_1} min={0} max={110} major={10} minor={2} scale={10} bands={[{ from: 0, to: 100, color: GREEN }, { from: 100, to: 110, color: RED }]} />
          <Dial label="N2 RPM 2" unit="%" value={s.n2_2} min={0} max={110} major={10} minor={2} scale={10} bands={[{ from: 0, to: 100, color: GREEN }, { from: 100, to: 110, color: RED }]} />
          <Dial label="FUEL FLOW 1" unit="PPH x1000" value={ppH(s.ff1)} min={0} max={5000} major={1000} minor={5} scale={1000} caption={`${Math.round(ppH(s.ff1))} pph`} />
          <Dial label="FUEL FLOW 2" unit="PPH x1000" value={ppH(s.ff2)} min={0} max={5000} major={1000} minor={5} scale={1000} caption={`${Math.round(ppH(s.ff2))} pph`} />
        </Pair>
      </Plate>

      {/* centre: oil / EGT / hydraulics */}
      <div className="space-y-3">
        <Plate>
          <div className="mb-2 grid grid-cols-2 gap-1 sm:grid-cols-4">
            <Ann label="Reverser unlocked" on={!!rev} />
            <Ann label="Start valve open" on={!!d.startValveOpen1 || !!d.startValveOpen2} />
            <Ann label="Low oil pressure" on={lowOil(s.n2_1, s.oilPsi1) || lowOil(s.n2_2, s.oilPsi2)} />
            <Ann label="Oil filter bypass" on={false} />
          </div>
          <Pair>
            <Dial label="OIL PRESS 1" unit="PSI" value={s.oilPsi1} min={0} max={100} major={20} minor={4} bands={[{ from: 0, to: 13, color: RED }, { from: 40, to: 90, color: GREEN }]} />
            <Dial label="OIL PRESS 2" unit="PSI" value={s.oilPsi2} min={0} max={100} major={20} minor={4} bands={[{ from: 0, to: 13, color: RED }, { from: 40, to: 90, color: GREEN }]} />
            <Dial label="EGT 1" unit="°C x100" value={s.egt1} min={0} max={900} major={100} minor={2} scale={100} bands={[{ from: 0, to: 620, color: GREEN }, { from: 620, to: 700, color: AMBER }, { from: 700, to: 900, color: RED }]} />
            <Dial label="EGT 2" unit="°C x100" value={s.egt2} min={0} max={900} major={100} minor={2} scale={100} bands={[{ from: 0, to: 620, color: GREEN }, { from: 620, to: 700, color: AMBER }, { from: 700, to: 900, color: RED }]} />
            <Dial label="OIL TEMP 1" unit="°C" value={oilT(s.n2_1, s.oilPsi1)} min={0} max={160} major={40} minor={4} bands={[{ from: 0, to: 120, color: GREEN }, { from: 120, to: 160, color: RED }]} />
            <Dial label="OIL TEMP 2" unit="°C" value={oilT(s.n2_2, s.oilPsi2)} min={0} max={160} major={40} minor={4} bands={[{ from: 0, to: 120, color: GREEN }, { from: 120, to: 160, color: RED }]} />
            <Dial label="OIL QTY 1" unit="GAL" value={s.oilQty1 / 20} min={0} max={5} major={1} minor={2} caption={`${(s.oilQty1 / 20).toFixed(1)} gal`} digits={1} />
            <Dial label="OIL QTY 2" unit="GAL" value={s.oilQty2 / 20} min={0} max={5} major={1} minor={2} caption={`${(s.oilQty2 / 20).toFixed(1)} gal`} digits={1} />
          </Pair>
        </Plate>
        <Plate title="Hydraulics">
          <div className="grid grid-cols-3 justify-items-center gap-1">
            <Dial label="SYS A PRESS" unit="PSI x1000" value={s.hydAPress} min={0} max={4000} major={1000} minor={5} scale={1000} size={92} bands={[{ from: 2800, to: 3200, color: GREEN }, { from: 3500, to: 4000, color: RED }]} caption={`${Math.round(s.hydAPress)} psi`} />
            <Dial label="SYS B PRESS" unit="PSI x1000" value={s.hydBPress} min={0} max={4000} major={1000} minor={5} scale={1000} size={92} bands={[{ from: 2800, to: 3200, color: GREEN }, { from: 3500, to: 4000, color: RED }]} caption={`${Math.round(s.hydBPress)} psi`} />
            <Dial label="BRAKE PRESS" unit="PSI x1000" value={d.autobrakePressure ?? 0} min={0} max={4000} major={1000} minor={5} scale={1000} size={92} caption={`${Math.round(d.autobrakePressure ?? 0)} psi`} />
          </div>
        </Plate>
      </div>

      {/* right: flaps, annunciators, gear lever */}
      <div className="space-y-3 lg:w-[17.5rem]">
        <Plate title="Flaps">
          <div className="flex items-center gap-2">
            <Dial label="FLAPS" value={s.flapPos ?? s.flaps} min={0} max={40} major={10} minor={2} size={96} caption={flapCap} bands={[{ from: 0, to: 40, color: "#3a3f45" }]} />
            <div className="grid flex-1 gap-1">
              <Ann label="LE flaps transit" on={dc && !!d.leTransit} />
              <Ann label="LE flaps ext" on={dc && !!d.leExtended && !d.leTransit} tone="green" />
              <Ann label="Anti skid inop (inbd)" on={dc && !d.antiskidInbdOperational} />
              <Ann label="Anti skid inop (outbd)" on={dc && !d.antiskidOutbdOperational} />
            </div>
          </div>
        </Plate>
        <GearLeverP2 />
      </div>
    </div>
  );
}

/** Compact engine parameter dials for the Training Console (both engines, or just `engine` when given). */
export function CompactEngineParams({ engine }: { engine?: 1 | 2 } = {}) {
  const s = useSimPick("egt1", "egt2", "ff1", "ff2", "n1_1", "n1_2", "n2_1", "n2_2", "oilPsi1", "oilPsi2");
  const d = useDerivedPick("epr1", "epr2");
  const sz = 70;
  const nBands = [{ from: 0, to: 100, color: GREEN }, { from: 100, to: 110, color: RED }];
  const egtBands = [{ from: 0, to: 620, color: GREEN }, { from: 620, to: 700, color: AMBER }, { from: 700, to: 900, color: RED }];
  const oilBands = [{ from: 0, to: 13, color: RED }, { from: 40, to: 90, color: GREEN }];
  const pph = (kg: number) => Math.max(0, kg) * KG_TO_LB;
  const row = (n: 1 | 2) => {
    const n1 = n === 1 ? s.n1_1 : s.n1_2, n2 = n === 1 ? s.n2_1 : s.n2_2, egt = n === 1 ? s.egt1 : s.egt2;
    const ff = n === 1 ? s.ff1 : s.ff2, oil = n === 1 ? s.oilPsi1 : s.oilPsi2, epr = n === 1 ? d.epr1 : d.epr2;
    return (
      <div key={n}>
        <div className="mb-1 font-display text-[8px] font-semibold uppercase tracking-[.16em] text-[#a9a08c]">Engine {n}</div>
        <div className="grid grid-cols-3 justify-items-center gap-x-1 gap-y-1 sm:grid-cols-6">
          <Dial size={sz} label="EPR" value={epr} min={1} max={2.4} major={0.4} minor={2} digits={2} bands={[{ from: 2.0, to: 2.4, color: RED }]} />
          <Dial size={sz} label="N1" value={n1} min={0} max={110} major={20} minor={2} scale={10} bands={nBands} caption={`${Math.round(n1)}%`} />
          <Dial size={sz} label="N2" value={n2} min={0} max={110} major={20} minor={2} scale={10} bands={nBands} caption={`${Math.round(n2)}%`} />
          <Dial size={sz} label="EGT" value={egt} min={0} max={900} major={300} minor={3} scale={100} bands={egtBands} caption={`${Math.round(egt)}°`} />
          <Dial size={sz} label="FF" value={pph(ff)} min={0} max={5000} major={1000} minor={5} scale={1000} caption={`${Math.round(pph(ff))}`} />
          <Dial size={sz} label="OIL P" value={oil} min={0} max={100} major={50} minor={4} bands={oilBands} caption={`${Math.round(oil)} psi`} />
        </div>
      </div>
    );
  };
  return <div className="space-y-2 rounded-md border border-[#4a5057] bg-[#1d2227] p-2">{engine !== 2 && row(1)}{engine !== 1 && row(2)}</div>;
}

/* Pure instrument faces: skip re-render when their props are unchanged. */
export const Dial = memo(DialImpl, propsEqual);
