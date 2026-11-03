import { useShallow } from "zustand/react/shallow";
import { deepEqual } from "@/lib/props-equal";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { create } from "zustand";
import { computeAirData, flightStateActive, type SideAirData } from "@/lib/sim/pitotStatic";
import { useDerived, useSim, getDerived, useSimPick, useDerivedPick, useDerivedSelect, type SimStore } from "@/lib/sim/store";
import { useMip, type MipFail, type MipStore, type FdCmd } from "@/lib/sim/mipLocal";
import { Attitude, Heading, VerticalSpeed } from "@/components/panel/SixPack";
import { AdiReal as AdiFace, AsiReal, AltReal, HsiReal, RmiReal, adiNavFrom } from "@/components/panel/instruments";
import { Dial, GearSelectorLever } from "@/components/panel/EngineInstrumentPanel";
import { Annun, Knob, LEGEND, PushButton, Screws, Toggle, TuneKnob } from "@/components/panel/PedestalParts";
import { cn } from "@/lib/utils";
import { WxrScope, WXR_RANGES } from "@/components/panel/PrimusWxr";
import { useWxrNav } from "@/lib/sim/wxrWorld";
import { angDiff, afInterlocks, afDisconnectReason, altAcquire, goAroundSelected, radioLateral, gsGamma, FD_LIMIT, stepLateral, lateralLaw, inZoneOfConfusion, stepGlide, glideGamma, nextLight, type LatSub, type GsPhase, type Light } from "@/lib/sim/autoflight";
import { ApproachProgress } from "@/components/panel/ApproachProgress";
import { sourcesOf } from "@/lib/sim/sources";
import { publishSituation, useSituation } from "@/lib/sim/situation";
import { radioNav, stepPos, vorDevOf, NO_NAV, NAV_START, wsssLocalPos, findTrainingNavStation, type NavData, type NavSceneId } from "@/lib/sim/radionav";
import { usePedestal } from "@/lib/sim/pedestal";
import { stepDmeChannel, IDLE_DME } from "@/lib/sim/dmeModel";
import { resolveLrra } from "@/lib/sim/lrra";
import { stepHfChannel, IDLE_HF } from "@/lib/sim/hfModel";
import { readFlightNavigationState } from "@/lib/sim/flightNavigation";
import { computeChangiRadioNav } from "@/lib/sim/radionav-changi";
import { findChangiNavaid } from "@/lib/sim/navaids-changi";
import { resolveNavReceiver, syncMipNavFromPedestal, tuneNav1, tuneNav2 } from "@/lib/sim/navReceiver";
import { computeAdfBearings } from "@/lib/sim/adfBearing";
import { resolveInstrumentSources } from "@/lib/sim/instrumentSources";
import { Glareshield as GlareshieldBand } from "@/components/panel/GlareshieldPanel";
import { isWsssArrivalSceneId } from "@/lib/sim/navData";
import { applyPhaseToGuidance } from "@/lib/sim/flightPhases";
import { markerCoverage, NO_MARKERS, type MarkerId } from "@/lib/sim/markerBeacons";
import { useMarkerKeyed } from "@/lib/sim/markerLamps";
import { advanceFlightNavigation, getLiveArrival, getLiveFlightGuidance, getLiveFlightNavigation } from "@/lib/sim/flightNavigation";

/**
 * Interactive 737-200 main instrument panel (RP-C8009 / N267AU), rebuilt from the close-up photographs:
 *   CAPTAIN : placard + chronometer | ASI, DME/RMI | comparator, ADI, HSI | F/D-A/P-A/T-PDC annunciators, HEIGHT, ALT, VSI, marker, speed-brake lenses, NAV / COMPASS / GYRO selectors
 *   CENTRE  : LIGHT TEST key, standby altimeter + horizon, fuel qty LEDs | BRAKE TEST, EPR / N1 / N2 / fuel flow | yaw damper, oil qty test, annunciators, oil / EGT / hyd gauges, flap gauge, antiskid, autobrake | gear lights + lever
 *   F/O     : annunciators, GPWS lenses, TAT, ASI, DME/RMI, HYD QTY | comparator, ADI, HSI | ALT ALERT, HEIGHT, ALT, VSI, placard, chronometer
 *   LOWER   : brightness / flood plates, W/S FAIL, caps and flanges (the FreeFlight GPS / VHF COMM / CVR / TCAS-WX / transponder / A/T DISENGAGE stack now lives on the centre pedestal, see RadioStack in CenterPedestal.tsx)
 * Wired to the sim: air data, engine parameters, gear lever, flaps, autobrake, antiskid, fire / caution annunciators, panel lighting. 2D only.
 */

const DESIGN_W = 3060;
const CW = 3036; // main panel canvas (design px)
const CH = 720;
const PANEL_BLUE = "#4b5463";
const BEZ = "#2f3744";
const CENTRE = "#39414d";
const VISOR = "#1d2127";
const CREAM = "#d9d2ba";
const PLATE2 = "relative rounded-[4px] border border-[#1b2028] bg-[#39414d] shadow-[inset_0_0_8px_rgba(0,0,0,.4)]";
const GREEN = "#2fc27a";
const RED = "#e24b4b";
const AMBER = "#e0a84a";
const KG_TO_LB = 2.2046;
const FLAG = "border-[#ff6a3a] bg-[#ff5a2a] text-[#7a1500]";
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const pad = (n: number, w: number) => String(Math.round(n)).padStart(w, "0");

/* horizontal anchors on the canvas (design px) */
const X_SB = 1100;   // centre-left standby column
const X_CREAM = 1300; // cream engine strip
const X_DARK = 1510;  // dark engine / systems panel
const X_GEAR = 1912;  // gear lights + lever
const F0 = 2064;      // first-officer panel

/* ───────────────────────── layout helpers ───────────────────────── */

function S({ x, y, w, h, children, className, style }: { x: number; y: number; w: number; h: number; children?: ReactNode; className?: string; style?: React.CSSProperties }) {
  return <div className={cn("absolute", className)} style={{ left: x, top: y, width: w, height: h, ...style }}>{children}</div>;
}
function C({ cx, cy, r, children }: { cx: number; cy: number; r: number; children: ReactNode }) {
  return <div className="absolute [&>*]:!h-full [&>*]:!w-full" style={{ left: cx - r, top: cy - r, width: r * 2, height: r * 2 }}>{children}</div>;
}
function Bezel({ x, y, w, h, tone = BEZ }: { x: number; y: number; w: number; h: number; tone?: string }) {
  return (
    <div className="absolute rounded-[10px] border border-[#1b2028] shadow-[inset_0_0_0_2px_rgba(255,255,255,.05),0_2px_6px_rgba(0,0,0,.5)]" style={{ left: x, top: y, width: w, height: h, background: tone }}>
      {[[6, 6], [w - 12, 6], [6, h - 12], [w - 12, h - 12]].map(([sx, sy], i) => <span key={i} className="absolute size-[6px] rounded-full bg-[#171b21] shadow-[inset_0_0_0_1px_#566]" style={{ left: sx, top: sy }} />)}
    </div>
  );
}
const Tag = ({ x, y, w = 120, children }: { x: number; y: number; w?: number; children: ReactNode }) => (
  <div className={cn(LEGEND, "absolute text-center text-[8px] leading-none")} style={{ left: x - w / 2, top: y, width: w }}>{children}</div>
);
/** Black engraved placard with cream text. */
const Placard = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn("flex size-full items-center justify-center rounded-[2px] border border-[#0b0d10] bg-black px-1 text-center font-mono text-[7px] font-bold uppercase leading-tight text-[#e8e4d6]", className)}>{children}</div>
);
/** Dark-glass lens that carries embossed legend text (unlit). Lit variants use Annun. */
/** Marker beacon lamp: lit by the lamp test, or flashing in step with the received marker tone (OUTER blue, MIDDLE amber, AIRWAYS white). */
function MarkerLamp({ id, test, powered, kind, tone = "amber", children }: { id: MarkerId; test: boolean; powered: boolean; kind: "lens" | "annun"; tone?: "amber" | "white"; children: string }) {
  const keyed = useMarkerKeyed(id, powered);
  const on = !!test || keyed;
  return kind === "lens" ? <Lens on={on} tone={tone}>{children}</Lens> : <Annun label={children} on={on} tone="blue" small className="size-full" />;
}
const Lens = ({ children, on = false, tone = "amber" }: { children: ReactNode; on?: boolean; tone?: "amber" | "red" | "green" | "white" }) => (
  <Annun label={children} on={on} tone={tone} small className="size-full" />
);
/** Round blanking cap / blank push-button. */
const Cap = ({ size, light = false }: { size: number; light?: boolean }) => (
  <span className={cn("block rounded-full border shadow-[0_2px_4px_rgba(0,0,0,.7),inset_0_0_6px_rgba(0,0,0,.35)]", light ? "border-[#9aa0a6] bg-[radial-gradient(circle_at_35%_30%,#f1f2f3,#b9bdc1)]" : "border-[#0b0c0e] bg-[radial-gradient(circle_at_35%_30%,#4a4e53,#14161a)]")} style={{ width: size, height: size }} />
);
/** Perforated blanking plate where an instrument was removed. */
const Perf = () => (
  <div className="size-full rounded-[3px] border border-[#0b0d10] shadow-[inset_0_0_10px_#000]" style={{ background: "radial-gradient(circle,#555a60 0 22%,transparent 24%) 0 0/20px 20px, #101214" }} />
);

/* ───────────────────────── glareshield warning strips ───────────────────────── */

function Lamp({ label, on, tone, onClick }: { label: ReactNode; on: boolean; tone: "red" | "amber"; onClick?: () => void }) {
  const lit = tone === "red" ? "border-[#ff9a9a] bg-[#e03a3a] text-white shadow-[0_0_14px_rgba(255,60,60,.85)]" : "border-[#ffd27a] bg-[#e9a93a] text-[#2a1b00] shadow-[0_0_14px_rgba(233,169,58,.8)]";
  return (
    <button type="button" onClick={onClick} className={cn("flex h-[34px] flex-1 items-center justify-center rounded-[3px] border px-1 text-center font-mono text-[9px] font-bold uppercase leading-tight active:translate-y-px", on ? lit : tone === "red" ? "border-[#3a1717] bg-[#2a1112] text-[#7a3a3a]" : "border-[#33291a] bg-[#26200f] text-[#8a7342]")}>
      {label}
    </button>
  );
}

function TopStrip({ side }: { side: "L" | "R" }) {
  const s = useSimPick("bleedTrip1", "bleedTrip2", "ltTest", "packTripL", "packTripR");
  const d = useDerivedPick("antiskidInbdOperational", "antiskidOutbdOperational", "dcPower", "eng1Running", "fuelLowPressure1", "fuelLowPressure2", "generator1BusPowered", "generator2BusPowered", "hydALow", "hydBLow", "masterCaution", "oilPressure1");
  const mip = useMip(useShallow((st) => ({ lightKey: st.lightKey, masterCautionAck: st.masterCautionAck, recall: st.recall, set: st.set })));
  const pw = d.dcPower;
  const caution = !!d.masterCaution && !mip.masterCautionAck;
  useEffect(() => { if (!d.masterCaution && mip.masterCautionAck) mip.set({ masterCautionAck: false }); }, [d.masterCaution, mip.masterCautionAck]); // eslint-disable-line react-hooks/exhaustive-deps
  const test = pw && (s.ltTest || mip.recall || mip.lightKey === 2);
  const sys = (on: boolean) => pw && (on || test);
  const mc = <Lamp label={<>MASTER<br />CAUTION</>} tone="amber" on={pw && (caution || mip.recall)} onClick={() => mip.set({ masterCautionAck: true, recall: false })} />;
  const L = side === "L";
  return (
    <div className="flex h-full items-center gap-1 rounded-[4px] border border-[#1b2028] bg-[#262c35] px-1.5 shadow-[inset_0_0_8px_#000]">
      <div className="grid w-[46px] grid-rows-2 gap-[2px]">
        <Annun label={L ? "HYD" : "PACK"} on={sys(L ? d.hydALow || d.hydBLow : s.packTripL || s.packTripR)} small />
        <Annun label={L ? "ELEC" : "BLEED"} on={sys(L ? !d.generator1BusPowered || !d.generator2BusPowered : s.bleedTrip1 || s.bleedTrip2)} small />
      </div>
      {mc}
      <button type="button" onMouseDown={() => mip.set({ recall: true })} onMouseUp={() => mip.set({ recall: false })} onMouseLeave={() => mip.set({ recall: false })} className="flex h-[34px] w-[44px] flex-col items-center justify-center rounded-[3px] border border-[#1b2028] bg-[#39414d] font-mono text-[8px] font-bold uppercase leading-tight text-[#e6e1d2] active:translate-y-px">RECALL<span className="text-[6px] text-[#aab]">PUSH TEST</span></button>
      {mc}
      <div className="grid w-[46px] grid-rows-2 gap-[2px]">
        <Annun label={L ? "FUEL" : "A/SKID"} on={sys(L ? d.fuelLowPressure1 || d.fuelLowPressure2 : !d.antiskidInbdOperational || !d.antiskidOutbdOperational)} small />
        <Annun label={L ? "ENG" : "DOORS"} on={sys(L ? d.eng1Running && d.oilPressure1 < 13 : false)} small />
      </div>
    </div>
  );
}

/* ───────────────────────── annunciator panel (F/D & A/P, A/T, PDC) ───────────────────────── */

function AnnGroup({ title, lit }: { title: string; lit: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <span className={cn(LEGEND, "text-[7px]")}>{title}</span>
      <div className="grid grid-cols-2 gap-[2px] rounded-[2px] bg-black p-[2px]">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className={cn("h-[9px] w-[30px] rounded-[1px] border", lit ? "border-[#ffd27a] bg-[#e9a93a]" : "border-[#1d2023] bg-[#16191c]")} />
        ))}
      </div>
    </div>
  );
}

/** Captain panel has only the A/P P/RST (A/T P/RST socket is empty); the F/O panel has both. */
export function AnnPanel({ side }: { side: "L" | "R" }) {
  const s = useSimPick("ltTest");
  const d = useDerivedPick("dcPower");
  const m = useMip(useShallow((st) => ({ annTest: st.annTest, lightKey: st.lightKey, set: st.set })));
  const pw = d.dcPower;
  const lit = !!(pw && (s.ltTest || m.annTest === 1 || m.lightKey === 2));
  return (
    <div className="flex h-full flex-col justify-between px-2 py-1">
      <div className="flex items-start justify-center gap-3">
        <AnnGroup title="F/D & A/P" lit={lit} />
        <AnnGroup title="A/T" lit={lit} />
        <AnnGroup title="PDC" lit={lit} />
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="flex flex-col items-center">
          <span className={cn(LEGEND, "text-[7px]")}>A/P STATUS</span>
          <div className="flex gap-[2px] rounded-[2px] bg-black p-[2px]">
            {[0, 1].map((i) => <div key={i} className={cn("h-[9px] w-[30px] rounded-[1px] border", lit ? "border-[#ffd27a] bg-[#e9a93a]" : "border-[#1d2023] bg-[#16191c]")} />)}
          </div>
        </div>
        <PushButton label="A/P P/RST" onPress={() => m.set({ masterCautionAck: false })} />
        {side === "R"
          ? <PushButton label="A/T P/RST" onPress={() => m.set({ masterCautionAck: false })} />
          : <div className="flex h-[26px] w-[34px] items-center justify-center rounded-[2px] border border-[#555a60] bg-[#c9c5b4] shadow-[inset_0_0_6px_#000]"><span className="size-[10px] rounded-full bg-black" /></div>}
        <Toggle label="TEST" on={m.annTest === 1} onChange={(v) => m.set({ annTest: v ? 1 : 0 })} upLabel="1" downLabel="2" />
      </div>
    </div>
  );
}

/** Alert lenses beside the F/D & A/P annunciators: F/D WINDSHEAR, VOR/LOC + GLIDE SLOPE approach progress, ALTITUDE ALERT (and GPWS lenses on the captain side).
 *  Only the approach progress lights are driven by the autopilot model; the others light with the annunciator / light test, as in the panel above. */
export function AlertLenses({ side }: { side: "L" | "R" }) {
  const s = useSimPick("ltTest");
  const d = useDerivedPick("dcPower");
  const m = useMip(useShallow((st) => ({ annTest: st.annTest, apAnn: st.apAnn, lightKey: st.lightKey })));
  const pw = !!d.dcPower;
  const test = !!(pw && (s.ltTest || m.annTest === 1 || m.lightKey === 2));
  return (
    <div className="flex size-full flex-col gap-[4px]">
      <div className="h-[34px]"><Lens on={test}><>F/D<br />WINDSHEAR</></Lens></div>
      <div className="h-[40px]"><ApproachProgress ann={m.apAnn} pw={pw} /></div>
      <div className="h-[34px]"><Lens on={test}><>ALTITUDE<br />ALERT</></Lens></div>
      {side === "L" && <div className="h-[24px]"><Lens on={test}>GPWS</Lens></div>}
      {side === "L" && <div className="h-[34px]"><Lens on={test}><>BELOW G/S<br />P INHIBIT</></Lens></div>}
    </div>
  );
}

/* ───────────────────────── instruments built from the close-ups ───────────────────────── */

/** Adapter: this panel's receiver outputs (localizer / glideslope error, null = no signal) onto the face's ILS data. */
function AdiReal({ locErr = null, gsErr = null, navFlags, ...rest }: Omit<React.ComponentProps<typeof AdiFace>, "nav"> & { locErr?: number | null; gsErr?: number | null; navFlags?: { loc: boolean; gs: boolean } }) {
  const ils = locErr !== null || gsErr !== null || !!navFlags?.loc || !!navFlags?.gs;
  return <AdiFace {...rest} nav={adiNavFrom(ils, locErr, gsErr)} />;
}

/** Radio altimeter "HEIGHT x100 FEET": 0-5 on the right half, 5-25 on the left half, DH bug, OFF flag. */
const RA_PTS: [number, number][] = [[0, 0], [5, 180], [10, 236], [15, 268], [20, 298], [25, 328]];
function raAng(hundreds: number) {
  const v = clamp(hundreds, 0, 25);
  for (let i = 1; i < RA_PTS.length; i++) { const [k1, a1] = RA_PTS[i]; const [k0, a0] = RA_PTS[i - 1]; if (v <= k1) return a0 + ((v - k0) / (k1 - k0)) * (a1 - a0); }
  return 328;
}
export function HeightDial({ ft, dh, powered }: { ft: number; dh: number; powered: boolean }) {
  const valid = powered && ft >= 0 && ft <= 2500; // ft < 0 forced invalid
  return (
    <svg viewBox="0 0 100 100" className="aspect-square w-full rounded-full bg-[#0b0c0e]" role="img" aria-label="Radio altimeter height">
      <circle cx="50" cy="50" r="48" fill="#15181c" stroke="#5b6168" strokeWidth="1.5" />
      <path d="M50 8A42 42 0 0 1 80 20L68 32A25 25 0 0 0 50 25Z" fill="#c4372e" opacity=".85" />
      {[0, 1, 2, 3, 4, 5, 10, 15, 20, 25].map((n) => {
        const a = raAng(n); const t = (r: number): [number, number] => [50 + r * Math.sin((a * Math.PI) / 180), 50 - r * Math.cos((a * Math.PI) / 180)];
        const [x1, y1] = t(45); const [x2, y2] = t(38); const [tx, ty] = t(30);
        return <g key={n}><line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#e8e4d6" strokeWidth="1.4" /><text x={tx} y={ty} fill="#e8e4d6" fontSize="9" textAnchor="middle" dominantBaseline="central">{n}</text></g>;
      })}
      <text x="50" y="62" fill="#9a968a" fontSize="5" textAnchor="middle">HEIGHT</text>
      <text x="50" y="68" fill="#9a968a" fontSize="4" textAnchor="middle">x100 FEET</text>
      {powered && (() => { const a = raAng(dh / 100); const x = 50 + 46 * Math.sin((a * Math.PI) / 180); const y = 50 - 46 * Math.cos((a * Math.PI) / 180); return <polygon points={`${x},${y} ${x - 3},${y - 4} ${x + 3},${y - 4}`} fill="#ffb21a" transform={`rotate(${a} ${x} ${y})`} />; })()}
      {powered && !valid ? null : valid ? (() => { const a = raAng(ft / 100); const x = 50 + 38 * Math.sin((a * Math.PI) / 180); const y = 50 - 38 * Math.cos((a * Math.PI) / 180); return <line x1="50" y1="50" x2={x} y2={y} stroke="#f4f1e4" strokeWidth="2.4" strokeLinecap="round" />; })() : <><rect x="14" y="44" width="24" height="9" fill="#ff7a1a" /><text x="26" y="48.5" fill="#7a1500" fontSize="6" fontWeight="bold" textAnchor="middle" dominantBaseline="central">OFF</text></>}
      <circle cx="50" cy="50" r="3" fill="#2a2d31" />
    </svg>
  );
}

/** Standby airspeed strip under the standby altimeter ("0 60" drum with IAS / KNOTS legend). */
function IasStrip({ ias, powered }: { ias: number; powered: boolean }) {
  return (
    <div className="flex size-full items-center justify-center gap-2 rounded-[3px] border border-[#0b0d10] bg-[#14171b] px-2 shadow-[inset_0_0_6px_#000]">
      <span className="relative inline-flex h-6 w-6 items-center justify-center rounded-[2px] border border-[#555a60] bg-black"><span className="absolute inset-0 opacity-90" style={{ background: powered ? "none" : "repeating-linear-gradient(135deg,#ff7a1a 0 4px,#f4f1e4 4px 8px)" }} /></span>
      <span className="rounded-[2px] border border-[#555a60] bg-black px-2 font-mono text-[15px] tabular-nums text-[#f2f2f2]">{powered ? pad(clamp(ias, 0, 999), 3) : "060"}</span>
      <span className={cn(LEGEND, "text-[7px] leading-tight")}>IAS<br />KNOTS</span>
    </div>
  );
}

/** Flap position gauge: UP-1-2-5-10-15-25-30-40 on a non-linear scale. */
const FLAP_PTS: [number, number, string][] = [[0, 250, "UP"], [1, 292, "1"], [2, 336, "2"], [5, 20, "5"], [10, 62, "10"], [15, 96, "15"], [25, 134, "25"], [30, 162, "30"], [40, 192, "40"]];
export function FlapDial({ units }: { units: number }) {
  const v = clamp(units, 0, 40);
  let ang = 250;
  for (let i = 1; i < FLAP_PTS.length; i++) { const [u1, a1] = FLAP_PTS[i]; const [u0, a0] = FLAP_PTS[i - 1]; const a1n = a1 < a0 ? a1 + 360 : a1; if (v <= u1) { ang = a0 + ((v - u0) / (u1 - u0)) * (a1n - a0); break; } ang = a1n; }
  return (
    <svg viewBox="0 0 100 100" className="size-full" role="img" aria-label={`Flap position ${Math.round(v)}`}>
      <circle cx="50" cy="50" r="49" fill="#15181c" stroke="#5b6168" strokeWidth="1.5" />
      <circle cx="50" cy="50" r="44" fill="#0b0c0e" />
      {FLAP_PTS.map(([u, a, t]) => {
        const p = (r: number): [number, number] => [50 + r * Math.sin((a * Math.PI) / 180), 50 - r * Math.cos((a * Math.PI) / 180)];
        const [x1, y1] = p(44); const [x2, y2] = p(37); const [tx, ty] = p(29);
        return <g key={u}><line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#f0b27a" strokeWidth="2.4" /><text x={tx} y={ty} fill="#f0b27a" fontSize="8" fontWeight="600" textAnchor="middle" dominantBaseline="central">{t}</text></g>;
      })}
      <text x="26" y="78" fill="#f0b27a" fontSize="6.5" fontWeight="600" textAnchor="middle">FLAPS</text>
      <g style={{ transform: `rotate(${ang}deg)`, transformOrigin: "50px 50px", transition: "transform .4s ease-out" }}><polygon points="50,12 53,50 47,50" fill="#f3efe2" stroke="#000" strokeWidth=".4" /></g>
      <circle cx="50" cy="50" r="6" fill="#d8d2bc" stroke="#6b7078" /><circle cx="50" cy="50" r="2.4" fill="#4a4d52" />
    </svg>
  );
}

/** Yaw damper indicator: needle deflects left / right while the L / R test is held. */
function YawIndicator({ test }: { test: number }) {
  const ang = test === 1 ? -32 : test === 2 ? 32 : 0;
  return (
    <svg viewBox="0 0 100 100" className="size-full" role="img" aria-label="Yaw damper indicator">
      <circle cx="50" cy="50" r="48" fill="#3a2a22" stroke="#6b4a3a" strokeWidth="3" />
      <circle cx="50" cy="50" r="40" fill="#0b0c0e" stroke="#2a2d31" />
      <g style={{ transform: `rotate(${ang}deg)`, transformOrigin: "50px 50px", transition: "transform .3s ease-out" }}>
        <rect x="46" y="18" width="8" height="30" fill="#f4f1e4" /><rect x="46" y="54" width="8" height="8" fill="#f4f1e4" />
      </g>
    </svg>
  );
}

/** Red LED fuel quantity readout. */
function QtyLed({ label, value, w, h }: { label: string; value: number; w: number; h: number }) {
  const d = useDerivedPick("dcPower");
  const m = useMip(useShallow((st) => ({ qtyTest: st.qtyTest, raTest: st.raTest })));
  const txt = d.dcPower ? String(Math.round((m.raTest || m.qtyTest) ? 888 : value)).padStart(3, " ") : "";
  return (
    <div className="flex flex-col items-center justify-center rounded-[14px] border-2 border-[#1c1f24] bg-[#2a2f37] shadow-[inset_0_0_6px_#000]" style={{ width: w, height: h }}>
      <div className="rounded-[8px] border border-black bg-[#2a0707] px-2 font-mono font-bold tabular-nums text-[#ff4040] shadow-[inset_0_0_6px_#000]" style={{ fontSize: h * 0.34, textShadow: d.dcPower ? "0 0 6px #f00" : "none" }}>{txt || "   "}</div>
      <span className={cn(LEGEND, "mt-0.5 text-[7px]")}>{label}</span>
    </div>
  );
}

/** Chronometer: click the dial or the left lever to RUN / STOP, the right knob resets. */
function AnalogClock({ size = 96 }: { size?: number }) {
  const m = useMip();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => {
      setNow(new Date());
      const c = useMip.getState().clock;
      if (c.running) useMip.getState().set({ clock: { ...c, elapsed: c.elapsed + 1 } });
    }, 1000);
    return () => clearInterval(t);
  }, []);
  const e = m.clock.elapsed;
  const hh = now.getUTCHours() % 12, mm = now.getUTCMinutes(), ss = now.getUTCSeconds();
  const hand = (deg: number, len: number, w: number, c = "#f1f1ea") => (
    <line x1="50" y1="50" x2={50 + len * Math.sin((deg * Math.PI) / 180)} y2={50 - len * Math.cos((deg * Math.PI) / 180)} stroke={c} strokeWidth={w} strokeLinecap="round" />
  );
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label="Chronometer" className="cursor-pointer" onClick={() => m.set({ clock: { ...m.clock, running: !m.clock.running } })}>
        <title>Click: run / stop elapsed time</title>
        <circle cx="50" cy="50" r="49" fill="#15181c" stroke="#5b6168" strokeWidth="1.5" />
        <circle cx="50" cy="50" r="44" fill="#0b0c0e" />
        {Array.from({ length: 60 }).map((_, i) => {
          const a = (i * 6 * Math.PI) / 180;
          const r1 = i % 5 === 0 ? 36 : 40;
          return <line key={i} x1={50 + 44 * Math.sin(a)} y1={50 - 44 * Math.cos(a)} x2={50 + r1 * Math.sin(a)} y2={50 - r1 * Math.cos(a)} stroke="#e8e4d6" strokeWidth={i % 5 === 0 ? 1.4 : 0.6} />;
        })}
        {[[60, 0], [10, 60], [20, 120], [30, 180], [40, 240], [50, 300]].map(([n, a]) => <text key={n} x={50 + 29 * Math.sin((a * Math.PI) / 180)} y={50 - 29 * Math.cos((a * Math.PI) / 180)} fill="#e8e4d6" fontSize="8" fontFamily="ui-sans-serif" textAnchor="middle" dominantBaseline="central">{n}</text>)}
        <rect x="33" y="32" width="34" height="11" rx="1.5" fill="#000" stroke="#4a525a" strokeWidth=".6" />
        {/* state flag: all white = reset, half white / half black = stopped, all black = running */}
        {m.clock.running ? <rect x="34" y="33" width="12" height="9" fill="#0b0c0e" /> : e > 0 ? <><rect x="34" y="33" width="6" height="9" fill="#f4f1e4" /><rect x="40" y="33" width="6" height="9" fill="#0b0c0e" /></> : <rect x="34" y="33" width="12" height="9" fill="#f4f1e4" />}
        <text x="57" y="37.5" fill="#f1f1ea" fontSize="6" fontFamily="ui-monospace,monospace" textAnchor="middle" dominantBaseline="central">{pad(Math.floor(e / 60) % 100, 2)}:{pad(e % 60, 2)}</text>
        <text x="50" y="60" fill="#9a968a" fontSize="4.5" fontFamily="ui-monospace,monospace" textAnchor="middle">ET / CHR</text>
        {hand(hh * 30 + mm * 0.5, 20, 2.4)}
        {hand(mm * 6 + ss * 0.1, 30, 1.6)}
        {hand(ss * 6, 36, 0.8, "#ff9a3a")}
        <circle cx="50" cy="50" r="2.6" fill="#2a2d31" stroke="#6b7078" strokeWidth=".6" />
      </svg>
      <button type="button" aria-label="Run / stop elapsed time" title="Run / stop (left lever)" onClick={() => m.set({ clock: { ...m.clock, running: !m.clock.running } })} className={cn("absolute -bottom-2 -left-3 h-4 w-7 -rotate-[20deg] rounded-[2px] border border-[#0b0c0e] bg-[linear-gradient(180deg,#d8d8d2,#8a8e93)] shadow-[0_2px_3px_rgba(0,0,0,.7)] active:translate-y-px", m.clock.running && "ring-1 ring-[#e0a84a]")} />
      <button type="button" aria-label="Reset elapsed time" title="Reset elapsed time (right lever)" onClick={() => m.set({ clock: { running: false, elapsed: 0 } })} className="absolute -bottom-2 -right-3 h-4 w-7 rotate-[20deg] rounded-[2px] border border-[#0b0c0e] bg-[linear-gradient(180deg,#d8d8d2,#8a8e93)] shadow-[0_2px_3px_rgba(0,0,0,.7)] active:translate-y-px" />
    </div>
  );
}

/** Three-position instrument source selector, legends printed at each detent like the photo. */
function Sel3({ label, value, onChange, legends }: { label: string; value: number; onChange: (v: number) => void; legends: [string, string, string] }) {
  const ang = (value - 1) * 42;
  const leg = (i: number, cls: string) => (
    <button type="button" onClick={() => onChange(i)} className={cn(LEGEND, "absolute whitespace-pre text-[6.5px] leading-tight", cls, value === i ? "text-white [text-shadow:0_0_4px_rgba(255,255,255,.6)]" : "opacity-60")}>{legends[i]}</button>
  );
  return (
    <div className="relative" style={{ width: 128, height: 92 }}>
      {leg(0, "left-0 top-[18px] text-left")}
      {leg(1, "left-1/2 top-0 -translate-x-1/2 text-center")}
      {leg(2, "right-0 top-[18px] text-right")}
      <button type="button" aria-label={`${label}: ${legends[value]}`}
        onPointerDown={(e) => { const r = e.currentTarget.getBoundingClientRect(); onChange(clamp(value + (e.clientX < r.left + r.width / 2 ? -1 : 1), 0, 2)); }}
        className="absolute left-1/2 top-[34px] size-[44px] -translate-x-1/2 rounded-full border border-[#8b8e92] bg-[radial-gradient(circle_at_35%_30%,#f3f0e6,#bdb8a6_55%,#7c796c)] shadow-[0_3px_6px_rgba(0,0,0,.6)]">
        <span className="absolute left-1/2 top-1/2 h-[22px] w-[8px] origin-bottom rounded-[2px] bg-[#e9e5d6] shadow-[0_0_0_1px_#6b6858]" style={{ transform: `translate(-50%,-100%) rotate(${ang}deg)` }} />
      </button>
      <span className={cn(LEGEND, "absolute bottom-0 left-1/2 -translate-x-1/2 whitespace-nowrap text-[7px]")}>{label}</span>
    </div>
  );
}

/* ───────────────────────── engine / systems panels ───────────────────────── */

function EprCounter({ cx, cy, value, powered }: { cx: number; cy: number; value: number; powered: boolean }) {
  return (
    <S x={cx - 26} y={cy - 40} w={52} h={16}>
      <div className="relative flex size-full items-center justify-center rounded-[3px] border-2 border-[#c9d84a] bg-black font-mono text-[10px] font-bold tabular-nums text-[#f2f2f2]">
        {powered ? value.toFixed(2) : <span className="absolute inset-x-0 top-[3px] h-[8px] bg-[#ff7a1a]" />}
      </div>
    </S>
  );
}

function EnginePanels() {
  const s = useSimPick("antiskidInbd", "antiskidOutbd", "autobrake", "egt1", "egt2", "ff1", "ff2", "flapPos", "flaps", "hydAPress", "hydBPress", "n1_1", "n1_2", "n2_1", "n2_2", "oilPsi1", "oilPsi2", "oilQty1", "oilQty2", "parkingBrake", "patch");
  const d = useDerivedPick("antiskidInbdOperational", "antiskidOutbdOperational", "autobrakeActive", "autobrakeArmed", "autobrakeDisarm", "dcPower", "eng1Running", "eng2Running", "epr1", "epr2", "leExtended", "leTransit", "oilPressure1", "oilPressure2", "startValveOpen1", "startValveOpen2", "thrustReverser1Active", "thrustReverser2Active");
  const m = useMip(useShallow((st) => ({ brakeTest: st.brakeTest, oilQtyTest: st.oilQtyTest, set: st.set, yawTest: st.yawTest })));
  const pw = d.dcPower;
  const ppH = (kg: number) => Math.max(0, kg) * KG_TO_LB;
  const bandsN = [{ from: 0, to: 100, color: GREEN }, { from: 100, to: 110, color: RED }];
  const egt = [{ from: 0, to: 620, color: GREEN }, { from: 620, to: 700, color: AMBER }, { from: 700, to: 900, color: RED }];
  const oilBands = [{ from: 0, to: 13, color: RED }, { from: 40, to: 90, color: GREEN }];
  const oilTBands = [{ from: 0, to: 40, color: "#4a90d9" }, { from: 40, to: 140, color: GREEN }, { from: 140, to: 160, color: RED }];
  const sz = 90;
  const e = (n: 1 | 2) => (n === 1
    ? { epr: d.epr1, n1: s.n1_1, egt: s.egt1, n2: s.n2_1, ff: s.ff1, oil: s.oilPsi1, qty: s.oilQty1, run: d.eng1Running, rev: d.thrustReverser1Active, sv: !!d.startValveOpen1, lowOil: d.eng1Running && d.oilPressure1 < 13 }
    : { epr: d.epr2, n1: s.n1_2, egt: s.egt2, n2: s.n2_2, ff: s.ff2, oil: s.oilPsi2, qty: s.oilQty2, run: d.eng2Running, rev: d.thrustReverser2Active, sv: !!d.startValveOpen2, lowOil: d.eng2Running && d.oilPressure2 < 13 });
  const oilT = (x: ReturnType<typeof e>) => (d.dcPower || x.run ? 30 + Math.min(100, x.n2) * 0.95 : 20);
  const cell = (cx: number, cy: number, node: ReactNode, r = sz / 2) => <C key={`${cx}-${cy}`} cx={cx} cy={cy} r={r}>{node}</C>;
  const XL = X_CREAM + 52, XR = X_CREAM + 150;
  const rows = [168, 270, 372, 474, 576];
  const D1 = X_DARK + 50, D2 = X_DARK + 150;
  const rows2 = [276, 374, 472, 570];
  const RC = X_DARK + 204; // right column left edge
  const qtyGal = (x: ReturnType<typeof e>) => (m.oilQtyTest ? 4 : x.qty / 20);
  const aqty = (txt: ReactNode, on: boolean, tone: "amber" | "green" = "amber") => <Annun label={txt} on={on} tone={tone} small />;
  return (
    <>
      {/* ── cream strip: brake test, EPR, N1, two empty cut-outs, N2, fuel flow ── */}
      <div className="absolute rounded-[3px] border border-[#9b9380] shadow-[inset_0_0_10px_rgba(0,0,0,.25)]" style={{ left: X_CREAM, top: 14, width: 200, height: 626, background: CREAM }} />
      <S x={X_CREAM + 8} y={22} w={184} h={92}>
        <div className="flex size-full flex-col items-center justify-between rounded-[3px] bg-[#c9c3ad] p-1 text-[#2a2a2a]">
          <span className="font-mono text-[9px] font-bold tracking-wider">SPEED BRAKE TEST</span>
          <div className="flex w-full justify-around">
            {[1, 2, 3].map((n) => (
              <div key={n} className="flex flex-col items-center gap-0.5">
                <span className="font-mono text-[8px] font-bold">{n}</span>
                <button type="button" aria-label={`Brake test ${n}`} onPointerDown={() => m.set({ brakeTest: n as 1 | 2 | 3 })} onPointerUp={() => m.set({ brakeTest: 0 })} onPointerLeave={() => m.set({ brakeTest: 0 })}
                  className={cn("size-[28px] rounded-full border-4 border-[#9fa3a7] bg-[radial-gradient(circle_at_35%_30%,#3a3d41,#0b0c0e)] shadow-[0_2px_3px_rgba(0,0,0,.6)] active:translate-y-px", m.brakeTest === n && "ring-2 ring-[#e0a84a]")} />
              </div>
            ))}
          </div>
        </div>
      </S>
      {cell(XL, rows[0], <Dial label="EPR" value={e(1).epr} min={1} max={2.4} major={0.2} minor={2} digits={2} size={sz} caption="" win={{ text: pw ? "" : null, x: 52, y: 76, w: 26 }} bands={[{ from: 2.0, to: 2.4, color: RED }]} />)}
      {cell(XR, rows[0], <Dial label="EPR" value={e(2).epr} min={1} max={2.4} major={0.2} minor={2} digits={2} size={sz} caption="" win={{ text: pw ? "" : null, x: 52, y: 76, w: 26 }} bands={[{ from: 2.0, to: 2.4, color: RED }]} />)}
      <EprCounter cx={XL} cy={rows[0] + 6} value={e(1).epr} powered={pw} />
      <EprCounter cx={XR} cy={rows[0] + 6} value={e(2).epr} powered={pw} />
      <Tag x={XL} y={rows[0] + 50} w={80}>PULL TO SET</Tag>
      <Tag x={XR} y={rows[0] + 50} w={80}>PULL TO SET</Tag>
      {cell(XL, rows[1], <Dial label="N1" value={e(1).n1} min={0} max={110} major={10} minor={2} scale={10} size={sz} bands={bandsN} win={{ text: pw ? e(1).n1.toFixed(1) : null, y: 24 }} caption={`${e(1).n1.toFixed(1)}%`} />)}
      {cell(XR, rows[1], <Dial label="N1" value={e(2).n1} min={0} max={110} major={10} minor={2} scale={10} size={sz} bands={bandsN} win={{ text: pw ? e(2).n1.toFixed(1) : null, y: 24 }} caption={`${e(2).n1.toFixed(1)}%`} />)}
      {cell(XL, rows[2], <div aria-label="empty instrument cutout" className="rounded-full bg-black shadow-[inset_0_0_14px_#000]" />)}
      {cell(XR, rows[2], <div aria-label="empty instrument cutout" className="rounded-full bg-black shadow-[inset_0_0_14px_#000]" />)}
      {cell(XL, rows[3], <Dial label="N2" value={e(1).n2} min={0} max={110} major={10} minor={2} scale={10} size={sz} bands={bandsN} win={{ text: pw ? e(1).n2.toFixed(1) : null, y: 24 }} caption={`${e(1).n2.toFixed(1)}%`} />)}
      {cell(XR, rows[3], <Dial label="N2" value={e(2).n2} min={0} max={110} major={10} minor={2} scale={10} size={sz} bands={bandsN} win={{ text: pw ? e(2).n2.toFixed(1) : null, y: 24 }} caption={`${e(2).n2.toFixed(1)}%`} />)}
      {cell(XL, rows[4], <Dial label="FUEL FLOW" value={ppH(e(1).ff)} min={0} max={5000} major={1000} minor={5} scale={1000} size={sz} caption={`${Math.round(ppH(e(1).ff))} pph`} />)}
      {cell(XR, rows[4], <Dial label="FUEL FLOW" value={ppH(e(2).ff)} min={0} max={5000} major={1000} minor={5} scale={1000} size={sz} caption={`${Math.round(ppH(e(2).ff))} pph`} />)}

      {/* ── dark panel ── */}
      <div className="absolute rounded-[3px] border border-[#1b2028] shadow-[inset_0_0_10px_rgba(0,0,0,.4)]" style={{ left: X_DARK, top: 14, width: 392, height: 626, background: CENTRE }} />
      <S x={X_DARK + 8} y={20} w={190} h={24}>
        <div className="flex size-full items-center justify-around rounded-[2px] bg-[#cfc9b6] font-mono text-[8px] font-bold leading-none text-[#3a3a3a]">
          <span className="text-center">YAW DAMPER<br />L &nbsp;TEST&nbsp; R</span><span className="h-4 w-px bg-[#7a7566]" /><span className="text-center">ENG OIL<br />QTY TEST</span>
        </div>
      </S>
      <C cx={X_DARK + 44} cy={92} r={32}><YawIndicator test={m.yawTest} /></C>
      <S x={X_DARK + 90} y={78} w={30} h={30}>
        <button type="button" aria-label="Yaw damper test: left half L, right half R"
          onPointerDown={(ev) => { const r = ev.currentTarget.getBoundingClientRect(); m.set({ yawTest: ev.clientX < r.left + r.width / 2 ? 1 : 2 }); }}
          onPointerUp={() => m.set({ yawTest: 0 })} onPointerLeave={() => m.set({ yawTest: 0 })}
          className="size-full rounded-full border border-[#9aa0a6] bg-[radial-gradient(circle_at_35%_30%,#f1f2f3,#b9bdc1)] shadow-[0_2px_4px_rgba(0,0,0,.7)] active:translate-y-px" />
      </S>
      <S x={X_DARK + 142} y={76} w={34} h={34}>
        <button type="button" aria-label="Engine oil quantity test" onPointerDown={() => m.set({ oilQtyTest: true })} onPointerUp={() => m.set({ oilQtyTest: false })} onPointerLeave={() => m.set({ oilQtyTest: false })}
          className={cn("size-full rounded-full border-4 border-[#8a8f95] bg-[radial-gradient(circle_at_40%_35%,#6a85a8,#1d2a3c)] shadow-[0_2px_4px_rgba(0,0,0,.7)] active:translate-y-px", m.oilQtyTest && "ring-2 ring-[#e0a84a]")} />
      </S>
      <S x={X_DARK + 18} y={126} w={26} h={26}><Cap size={26} light /></S>
      <S x={X_DARK + 100} y={126} w={26} h={26}><Cap size={26} light /></S>
      {/* annunciators: REVERSER UNLOCKED / START VALVE OPEN x2, blank / OIL FILTER BYPASS / LOW OIL PRESSURE / OIL FILTER BYPASS */}
      <S x={X_DARK + 6} y={160} w={194} h={66}>
        <div className="grid h-full grid-cols-4 grid-rows-2 gap-[2px] rounded-[2px] bg-black p-[2px]">
          {aqty(<>REVERSER<br />UNLOCKED</>, !!(pw && e(1).rev))}
          {aqty(<>START<br />VALVE OPEN</>, !!(pw && e(1).sv))}
          {aqty(<>REVERSER<br />UNLOCKED</>, !!(pw && e(2).rev))}
          {aqty(<>START<br />VALVE OPEN</>, !!(pw && e(2).sv))}
          <div className="rounded-[2px] border border-[#9aa0a6] bg-[#e9e6dc]" title="blank lens (engine 1 low-oil lens not fitted on RP-C8009)" />
          {aqty(<>OIL FILTER<br />BYPASS</>, false)}
          {aqty(<>LOW OIL<br />PRESSURE</>, !!(pw && (e(1).lowOil || e(2).lowOil)))}
          {aqty(<>OIL FILTER<br />BYPASS</>, false)}
        </div>
      </S>
      {cell(D1, rows2[0], <Dial label="OIL PRESS" value={e(1).oil} min={0} max={100} major={20} minor={4} size={sz} bands={oilBands} caption={`${Math.round(e(1).oil)} psi`} />)}
      {cell(D2, rows2[0], <Dial label="OIL PRESS" value={e(2).oil} min={0} max={100} major={20} minor={4} size={sz} bands={oilBands} caption={`${Math.round(e(2).oil)} psi`} />)}
      {cell(D1, rows2[1], <Dial label="OIL TEMP" value={oilT(e(1))} min={0} max={160} major={40} minor={4} size={sz} bands={oilTBands} caption={`${Math.round(oilT(e(1)))}°C`} />)}
      {cell(D2, rows2[1], <Dial label="EGT" value={e(2).egt} min={0} max={900} major={100} minor={2} scale={100} size={sz} bands={egt} win={{ text: pw ? String(Math.round(e(2).egt)) : null, x: 56, y: 26 }} caption={`${Math.round(e(2).egt)}°C`} />)}
      {cell(D1, rows2[2], <Dial label="EGT" value={e(1).egt} min={0} max={900} major={100} minor={2} scale={100} size={sz} bands={egt} win={{ text: pw ? String(Math.round(e(1).egt)) : null, x: 56, y: 26 }} caption={`${Math.round(e(1).egt)}°C`} />)}
      {cell(D2, rows2[2], <Dial label="OIL QUANTITY" value={qtyGal(e(2))} min={0} max={5} major={1} minor={2} size={sz} digits={1} caption={`${qtyGal(e(2)).toFixed(1)} gal`} bands={[{ from: 0, to: 1, color: RED }]} />)}
      {cell(D1, rows2[3], <Dial label="HYD SYS PRESS" value={s.hydAPress} min={0} max={4000} major={1000} minor={5} scale={1000} size={sz} bands={[{ from: 2800, to: 3200, color: GREEN }]} caption={`${Math.round(s.hydAPress)} psi`} />)}
      {cell(D2, rows2[3], <Dial label="HYD BRAKE PRESS" value={s.hydBPress} min={0} max={4000} major={1000} minor={5} scale={1000} size={sz} bands={[{ from: 2800, to: 3200, color: GREEN }]} caption={`${Math.round(s.hydBPress)} psi`} />)}

      {/* ── right column: flap gauge, LE flaps, antiskid, autobrake, placards ── */}
      <S x={RC} y={20} w={182} h={50}><Placard className="text-[8px]">Landing flaps 40° prohibited except for emergency</Placard></S>
      <S x={RC + 45} y={91} w={92} h={92}><div className="flex size-full items-center justify-center rounded-full bg-[#050607] p-1 shadow-[inset_0_0_8px_#000]"><FlapDial units={s.flapPos ?? s.flaps} /></div></S>
      <S x={RC} y={202} w={182} h={34}>
        <div className="grid h-full grid-cols-2 gap-[2px] rounded-[2px] bg-black p-[2px]">
          <Annun label={<>LE FLAPS<br />TRANSIT</>} on={pw && !!d.leTransit} small />
          <Annun label={<>LE FLAPS<br />EXT</>} on={pw && !!d.leExtended && !d.leTransit} tone="green" small />
        </div>
      </S>
      <S x={RC} y={242} w={182} h={34}>
        <div className="grid h-full grid-cols-2 gap-[2px] rounded-[2px] bg-black p-[2px]">
          <Annun label={<>ANTI SKID<br />INOP</>} on={pw && !d.antiskidInbdOperational} small />
          <Annun label={<>ANTI SKID<br />INOP</>} on={pw && !d.antiskidOutbdOperational} small />
        </div>
      </S>
      <S x={RC} y={284} w={182} h={116}>
        <div className="flex h-full flex-col items-center rounded-[3px] bg-[#2f3744] p-1">
          <span className={cn(LEGEND, "text-[9px]")}>ANTISKID</span>
          <div className="flex w-full flex-1 items-center justify-around">
            <Toggle label="INBD" on={s.antiskidInbd} onChange={(v) => s.patch({ antiskidInbd: v }, v ? "Inboard antiskid ON." : "Inboard antiskid OFF — autobrake unavailable.")} upLabel="ON" downLabel="OFF" />
            <Toggle label="OUTBD" on={s.antiskidOutbd} onChange={(v) => s.patch({ antiskidOutbd: v }, v ? "Outboard antiskid ON." : "Outboard antiskid OFF — autobrake unavailable.")} upLabel="ON" downLabel="OFF" />
          </div>
        </div>
      </S>
      <S x={RC} y={408} w={182} h={122}>
        <div className="flex h-full flex-col items-center justify-between rounded-[3px] bg-[#2f3744] p-1">
          <span className={cn(LEGEND, "text-[8px]")}>AUTO BRAKE</span>
          <Knob size={46} min={0} max={4} step={1} value={s.autobrake} onChange={(v) => s.patch({ autobrake: v as 0 | 1 | 2 | 3 | 4, autobrakeTestTimer: 0, autobrakeRtoArmed: false }, `AUTOBRAKE → ${AB[v]}`)} ticks={["OFF", "MIN", "MED", "MAX", "RTO"]} compact />
          <div className="grid w-full grid-cols-2 gap-[2px]">
            <Annun label={d.autobrakeActive ? "AUTO BRK" : d.autobrakeDisarm ? "DISARM" : d.autobrakeArmed ? "ARMED" : "AUTO BRAKE"} on={pw && (d.autobrakeActive || d.autobrakeDisarm || d.autobrakeArmed)} tone={d.autobrakeDisarm ? "amber" : "green"} small />
            <Annun label="PARK BRAKE" on={s.parkingBrake} tone="red" small />
          </div>
        </div>
      </S>
      <S x={RC} y={538} w={182} h={96}>
        <div className="size-full rounded-[2px] border border-[#6d5f3a] bg-[#b8a97a] p-1 font-mono text-[6px] font-bold leading-tight text-[#2a2415]">
          <div>LANDING GEAR LIMIT (IAS)</div><div>OPERATING · EXTEND 270K-.82M · RETRACT 235K · EXTENDED 320K-.82M</div>
          <div className="mt-0.5">FLAPS LIMIT (IAS)</div><div>1-230K 2-230K 5-225K 10-210K · 15-195K 25-190K 30-185K 40-170K · ALT FLAP EXT 310K</div>
        </div>
      </S>
    </>
  );
}

/* ───────────────────────── gear lights + lever column ───────────────────────── */

const AB = ["OFF", "MIN", "MED", "MAX", "RTO"];

function GearPairMini({ text, red, green }: { text: string; red: boolean; green: boolean }) {
  return (
    <div className="flex w-[64px] flex-col gap-px">
      <Annun label={text} on={red} tone="red" small className="h-[26px]" />
      <Annun label={text} on={green} tone="green" small className="h-[26px]" />
    </div>
  );
}

function GearColumn() {
  const s = useSimPick("ltTest", "wow");
  const d = useDerivedPick("dcPower", "gearLights");
  const m = useMip(useShallow((st) => ({ lightKey: st.lightKey })));
  const gl = d.gearLights;
  const test = d.dcPower && (s.ltTest || m.lightKey === 2);
  return (
    <>
      <div className="absolute rounded-[3px] border border-[#1b2028] shadow-[inset_0_0_10px_rgba(0,0,0,.4)]" style={{ left: X_GEAR - 4, top: 14, width: 148, height: 626, background: CENTRE }} />
      <S x={X_GEAR + 2} y={22} w={136} h={118}>
        <div className="flex size-full flex-col items-center justify-between">
          <GearPairMini text="NOSE GEAR" red={test || gl.nose.red} green={test || gl.nose.green} />
          <div className="flex gap-1">
            <GearPairMini text="LEFT GEAR" red={test || gl.leftMain.red} green={test || gl.leftMain.green} />
            <GearPairMini text="RIGHT GEAR" red={test || gl.rightMain.red} green={test || gl.rightMain.green} />
          </div>
        </div>
      </S>
      <S x={X_GEAR} y={152} w={136} h={304}><GearSelectorLever /></S>
      {s.wow && <Tag x={X_GEAR + 68} y={464} w={136}>LEVER LOCKS OUT OF UP ON GROUND</Tag>}
    </>
  );
}

/* ───────────────────────── glareshield ───────────────────────── */

function Glareshield() {
  return <GlareshieldBand width={CW} />;
}

/* ───────────────────────── comparator + small plates ───────────────────────── */

function Comparator() {
  const d = useDerivedPick("dcPower");
  const s = useSimPick("ltTest");
  const m = useMip(useShallow((st) => ({ compTest: st.compTest, lightKey: st.lightKey })));
  const lit = !!(d.dcPower && (s.ltTest || m.compTest || m.lightKey === 2));
  return (
    <div className="flex size-full flex-col rounded-[3px] border border-[#1b2028] bg-[#bdb9aa] p-[3px] shadow-[inset_0_0_6px_rgba(0,0,0,.35)]">
      <span className="text-center font-mono text-[9px] font-bold leading-none tracking-wider text-[#3a3a3a]">INSTRUMENT COMPARATOR</span>
      <div className="mt-[3px] grid flex-1 grid-cols-7 gap-px rounded-[2px] bg-[#111] p-px">
        {[<>MON<br />PWR</>, "HDG", "PITCH", "ROLL", "GS", "LOC", "ALT"].map((l, i) => <Annun key={i} label={l} on={lit} small className="h-full" />)}
      </div>
      <span className="mt-px text-center font-mono text-[6px] font-bold leading-none text-[#3a3a3a]">PUSH TO DIM</span>
    </div>
  );
}

function LightTestKey() {
  const m = useMip(useShallow((st) => ({ lightKey: st.lightKey, set: st.set })));
  const names = ["BRT", "DIM", "TEST"] as const;
  const ang = [90, 180, 0][m.lightKey];
  return (
    <div className="relative size-full rounded-[6px] border border-[#8a8d90] bg-[linear-gradient(180deg,#d9d6cc,#b9b6aa)] shadow-[inset_0_0_8px_rgba(0,0,0,.25)]">
      <span className={cn(LEGEND, "absolute left-1/2 top-[3px] -translate-x-1/2 text-[8px] text-[#33362f]", m.lightKey === 2 && "text-black")}>LIGHT TEST</span>
      <span className={cn(LEGEND, "absolute right-[4px] top-1/2 -translate-y-1/2 text-[8px] text-[#33362f]", m.lightKey === 0 && "text-black")}>BRT</span>
      <span className={cn(LEGEND, "absolute bottom-[3px] left-1/2 -translate-x-1/2 text-[8px] text-[#33362f]", m.lightKey === 1 && "text-black")}>DIM</span>
      <button type="button" aria-label={`Light test key: ${names[m.lightKey]}`} title="Click to cycle BRT → DIM → TEST" onClick={() => m.set({ lightKey: ((m.lightKey + 1) % 3) as 0 | 1 | 2 })}
        className="absolute left-[24px] top-1/2 size-[34px] -translate-y-1/2 rounded-full border-2 border-[#6a6d70] bg-[radial-gradient(circle_at_50%_50%,#000,#0b0c0d)] shadow-[inset_0_0_6px_#000]">
        <span className="absolute left-1/2 top-1/2 h-[17px] w-[4px] origin-bottom rounded-full bg-[linear-gradient(90deg,#6a6e73,#e2e4e6_50%,#6a6e73)]" style={{ transform: `translate(-50%,-100%) rotate(${ang}deg)` }}><span className="absolute -top-[3px] left-1/2 size-[8px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_35%_30%,#f2f3f4,#7a7e83)]" /></span>
      </button>
    </div>
  );
}

function PlacardAc({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn("size-full rounded-[2px] border border-[#8a8d90] bg-[#d8d6cc] p-1 font-mono font-bold uppercase leading-tight text-[#2a2a2a]", compact ? "text-[6px]" : "text-[7.5px]")}>
      <div>THIS IS A/C RP-C8009</div><div>B737-200</div>
      <div className="mt-0.5">MAX. TAXI WT. 117,500 LBS.</div><div>MAX. T.O. WT. 117,000 LBS.</div><div>MAX. ZERO FUEL 95,000 LBS.</div><div>MAX. LDG. WT. 105,000 LBS.</div><div>FUEL CAPACITY 34,500 LBS.</div><div>MAX. OPER. ALT. 35,000 FT.</div>
    </div>
  );
}

const RegPlate = () => (
  <div className="flex size-full items-center justify-center rounded-[2px] border border-[#2a2d31] bg-[#101214] font-mono text-[15px] font-bold tracking-wider text-[#e8b98f]">N267AU</div>
);

/* ───────────────────────── Panel (canvas) ───────────────────────── */

/** Attitude / heading model for the instruments (the sim has air data but no attitude): pitch follows flight path + angle of attack
 *  (pull on the yoke raises it), bank follows yoke roll (max 30 deg), heading turns at the coordinated-turn rate for the bank angle.
 *  Sperry SP-77 autopilot (AMM 22-11-0): AIL / ELEV switches latch only while the interlocks hold and drop (flashing the disengage lights) if they break;
 *  with the yoke in detent the engaged axes hold heading / roll attitude / pitch attitude / altitude, and a yoke input is control wheel steering.
 *  Collins FD-108 (AMM 34-31-0): bank / pitch steering commands for the ADI V-pointers (limited to 30 / 12 deg).
 *  Radio nav: dead-reckoned position against the training VOR / ILS (lib/sim/radionav.ts). Vertical: the flight-path angle is a state and altitude / VS are integrated from it. */
type Att = { pitch: number; roll: number; hdg: number };
/** The panel can be mounted more than once (the page and the Training Console's autopilot view). Only the first mounted copy runs the attitude / autopilot model,
 *  the others just display the attitude it publishes; if the owner unmounts the next copy takes over. */
const useModelOwners = create<{ ids: string[] }>(() => ({ ids: [] }));
function useIsModelOwner(): boolean {
  const id = useRef(Math.random().toString(36).slice(2)).current;
  useEffect(() => {
    useModelOwners.setState((o) => ({ ids: [...o.ids, id] }));
    return () => useModelOwners.setState((o) => ({ ids: o.ids.filter((x) => x !== id) }));
  }, [id]);
  return useModelOwners((o) => o.ids[0] === id);
}
/** last heading request applied; module level so a panel remount does not re-apply an old request mid-flight */
let appliedHdgReqN = 0;
function useAttitude(ias: number, vs: number, alt: number, pw: boolean, hydB: boolean, enabled = true): void {
  const live = useRef({ ias, vs, alt, pw, hydB });
  live.current = { ias, vs, alt, pw, hydB };
  const cur = useRef<Att>({ pitch: 0, roll: 0, hdg: 0 });
  const R = useRef({ gamma: 0, refRoll: 0, refHdg: 0, hdgHold: false, refPitch: 0, altAp: 0, altFd: 0, wasCwsR: true, wasCwsP: true, prevAltSel: false, prevFdAlt: false, gsCapAp: false, gsCapFd: false, latSub: "OFF" as LatSub, osHdg: 0, gsPhaseAp: "OFF" as GsPhase, gsCapT: 0, vocLight: "OFF" as Light, gsLight: "OFF" as Light, pos: { x: NAV_START.x, y: NAV_START.y }, resetN: 0, wxT: 0, pedMhz: Number.NaN, navMhz: Number.NaN, erectT: { g1: -1, g2: -1, gAux: -1 } });
  useEffect(() => {
    if (!enabled) return;
    useMip.setState({ attLive: true }); // tell the other views (six-pack) that the panel model owns attitude / heading
    cur.current = { ...useMip.getState().att };
    let last = performance.now();
    const step = (c: number, tgt: number, rate: number, dt: number) => c + clamp(tgt - c, -rate * dt, rate * dt);
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.5, (now - last) / 1000);
      last = now;
      const g = useSim.getState();
      const m = useMip.getState();
      // P5 transfer selectors are systems-state controls. NORMAL preserves the individual MIP source selector;
      // BOTH ON 1/2 or BOTH ON L/R overrides the relevant receivers for both display sides.
      const effectiveNavSel = g.navXfr === "BOTH ON 1" ? 0 : g.navXfr === "BOTH ON 2" ? 2 : m.navSel;
      const efiSide = g.efiXfr === "BOTH ON L" ? 0 : g.efiXfr === "BOTH ON R" ? 2 : null;
      const effectiveCompSel = efiSide ?? m.compSel;
      const effectiveGyroSel = efiSide ?? m.gyroSel;
      const { ias: v, vs: vsi, alt: h, pw: power, hydB: hb } = live.current;
      let a = cur.current;
      const r = R.current;
      const yp = clamp(g.yokePitch ?? 0, -1, 1);
      const yr = clamp(g.yokeRoll ?? 0, -1, 1);
      const flying = !g.wow && v > 60;
      const tas = v * (1 + (h / 1000) * 0.016);
      const aoa = clamp(3 + (250 - v) / 20, 1.5, 12);
      const gamma = (Math.asin(clamp(vsi / 60 / Math.max(tas * 1.688, 60), -0.3, 0.3)) * 180) / Math.PI;
      const gs = g as unknown as Record<string, number | boolean>;
      const trainer = flightStateActive(g);
      const simAlt = Number(gs.psFlightAltFt ?? 0);
      const tgtAlt = Number.isFinite(gs.psFlightTargetAltFt) ? Number(gs.psFlightTargetAltFt) : simAlt;
      /* Vertical flight path: when the trainer flight state is active and no altitude profile (pitot/static trainer target) is running,
         the flight path angle is a state driven by the yoke (CWS) or the autopilot, and altitude / VS are integrated from it. */
      const profile = trainer && !!gs.psFlightProgressive && Math.abs(tgtAlt - simAlt) > 1;
      const dyn = flying && trainer && !profile;
      if (!dyn) r.gamma = gamma;

      /* ── radio navigation ── */
      if (m.navResetN !== r.resetN) { r.resetN = m.navResetN; r.pos = { x: NAV_START.x, y: NAV_START.y }; a = { ...a, hdg: NAV_START.hdg }; cur.current = a; r.latSub = "OFF"; r.gsPhaseAp = "OFF"; r.gsCapT = 0; useSituation.getState().clearTrail(); }
      /* one-shot heading request (lines the aircraft up on the departure runway when a plan is loaded) */
      if (m.attHdgReq.n !== appliedHdgReqN) { appliedHdgReqN = m.attHdgReq.n; a = { ...a, hdg: m.attHdgReq.hdg }; cur.current = a; }
      /* radio-nav scene: inside 40 nm of a PLAN NAV vectored-ILS destination the receiver works in that runway's frame and the position comes from the geographic route tracker */
      const liveNav = getLiveFlightNavigation();
      const liveArr = getLiveArrival();
      const sceneId: NavSceneId = isWsssArrivalSceneId(liveArr?.sceneId) && liveNav && (liveNav.distanceToDestinationNm ?? 999) < 40 ? "WSSS02L" : "RPLL06";
      if (sceneId === "WSSS02L" && liveNav) r.pos = wsssLocalPos(liveNav.latitude, liveNav.longitude);
      else if (m.navOn && flying) r.pos = stepPos(r.pos, a.hdg, tas, dt);
      { const nowMs = performance.now(); if (nowMs - r.wxT > 400) { r.wxT = nowMs; useWxrNav.setState({ x: r.pos.x, y: r.pos.y, hdg: a.hdg }); } } // publish position for the weather radar

      /* ── ATA 34: pedestal NAV 1/2 is the sole frequency authority ──
         Pilot knobs on the centre pedestal always win. Trainer / map / plan load
         write *into* the pedestal; this loop only mirrors pedestal → MIP display. */
      const captRx = resolveNavReceiver("CAPT", effectiveNavSel);
      const foRx = resolveNavReceiver("FO", effectiveNavSel);
      const synced = syncMipNavFromPedestal();
      r.pedMhz = captRx.frequencyMHz;
      r.navMhz = captRx.frequencyMHz;
      /* Multi-channel gyros / compass / radio power (AMM-style 115VAC + 26VAC + DC + CBs) */
      // Initialized with the panel model state above so the gyro erection
      // timers keep their type and survive timer ticks without unsafe casts.
      const inst = resolveInstrumentSources({
        truePitch: a.pitch,
        trueRoll: a.roll,
        trueHdg: a.hdg,
        acPower: !!getDerived(useSim.getState()).acPower,
        dcPower: power,
        ac115: !!getDerived(useSim.getState()).acPower,
        ac26: !!getDerived(useSim.getState()).acPower,
        srcFail: m.srcFail,
        srcPower: m.srcPower,
        sel: { navSel: effectiveNavSel, compSel: effectiveCompSel, gyroSel: effectiveGyroSel },
        erectTimers: r.erectT,
        dtSec: dt,
        compSyncFlag: m.compSyncFlag,
        compMode: {
          c1: (usePedestal.getState().compMode?.[0] ?? 0) as 0 | 1,
          c2: (usePedestal.getState().compMode?.[1] ?? 0) as 0 | 1,
        },
        gyroMem: m.gyroMem,
        pitchRate: (r as { pitchRate?: number }).pitchRate ?? 0,
        rollRate: (r as { rollRate?: number }).rollRate ?? 0,
      });
      r.erectT = inst.erectTimers;
      // The P5 IRS transfer switch selects a single aligned IRS attitude/heading source for both MIP sides.
      if (g.irsXfr !== "NORMAL") {
        const useLeft = g.irsXfr === "BOTH ON L";
        const mode = useLeft ? g.irsLMode : g.irsRMode;
        const align = useLeft ? g.irsAlignL : g.irsAlignR;
        const hdg = useLeft ? g.irsHeadingL : g.irsHeadingR;
        const validAtt = power && align >= 1 && (mode === "NAV" || mode === "ATT");
        const validHdg = validAtt && mode === "NAV";
        const irsSource = { ...inst.capt, attValid: validAtt, hdgValid: validHdg, pitch: Number(g.attitudePitchDeg ?? a.pitch), roll: Number(g.attitudeRollDeg ?? a.roll), hdg: validHdg ? hdg : 0 };
        inst.capt = irsSource;
        inst.fo = { ...irsSource };
      } else if (efiSide !== null) {
        const left = efiSide === 0;
        const gyro = left ? inst.gyros.gyro1 : inst.gyros.gyro2;
        const compass = left ? inst.compass.comp1 : inst.compass.comp2;
        const efiSource = {
          ...inst.capt,
          attValid: gyro.valid,
          hdgValid: compass.valid,
          pitch: gyro.pitch,
          roll: gyro.roll,
          hdg: compass.powered && !compass.failed ? compass.hdg : 0,
        };
        inst.capt = efiSource;
        inst.fo = { ...efiSource };
      }
      /* Receiver kind from station table at tuned frequency */
      const captKind = captRx.kind ?? m.navTuned;
      const foKind = foRx.kind ?? m.navTuned;
      const captNavLive = power && m.navOn && captRx.kind && inst.radioPower.nav1 && (effectiveNavSel !== 2 ? inst.radioPower.nav1 : inst.radioPower.nav2);
      const foNavLive = power && m.navOn && foRx.kind && inst.fo.navPowered;
      let nv = (effectiveNavSel === 2 ? inst.radioPower.nav2 : inst.radioPower.nav1) && m.navOn && captRx.kind
        ? radioNav(r.pos, simAlt, captKind, captRx.frequencyMHz, sceneId)
        : NO_NAV;
      let nvFo = inst.fo.navPowered && m.navOn && foRx.kind
        ? radioNav(r.pos, simAlt, foKind, foRx.frequencyMHz, sceneId)
        : NO_NAV;
      // Geographic station receiver: when a flight-plan position exists, the
      // pedestal-tuned frequency resolves against the regional catalog instead
      // of incorrectly reusing the local synthetic trainer VOR geometry.
      if (liveNav && captRx.kind) {
        const globalStation = findChangiNavaid(captRx.frequencyMHz, captRx.kind === "ILS" ? "ILS" : "VOR");
        if (globalStation) {
          const solution = computeChangiRadioNav(liveNav.latitude, liveNav.longitude, simAlt, captRx.frequencyMHz, captRx.kind, m.selCrs);
          nv = {
            vorValid: solution.vorValid,
            locValid: solution.locValid,
            gsValid: solution.gsValid,
            radial: solution.radialFrom,
            locDev: solution.locDevDeg,
            gsErr: solution.gsDevDeg,
            vorDist: solution.vorValid ? solution.distanceNm : 0,
            thrDist: (solution.locValid || solution.gsValid) ? solution.distanceNm : 0,
          };
        }
      }
      if (liveNav && foRx.kind) {
        const globalStation = findChangiNavaid(foRx.frequencyMHz, foRx.kind === "ILS" ? "ILS" : "VOR");
        if (globalStation) {
          const solution = computeChangiRadioNav(liveNav.latitude, liveNav.longitude, simAlt, foRx.frequencyMHz, foRx.kind, m.selCrs2);
          nvFo = {
            vorValid: solution.vorValid,
            locValid: solution.locValid,
            gsValid: solution.gsValid,
            radial: solution.radialFrom,
            locDev: solution.locDevDeg,
            gsErr: solution.gsDevDeg,
            vorDist: solution.vorValid ? solution.distanceNm : 0,
            thrDist: (solution.locValid || solution.gsValid) ? solution.distanceNm : 0,
          };
        }
      }
      const sourceSelection = { navSel: effectiveNavSel, compSel: effectiveCompSel, gyroSel: effectiveGyroSel };
      const sf = sourcesOf(sourceSelection, m.srcFail).capt;
      const sfFo = sourcesOf(sourceSelection, m.srcFail).fo;
      const attBad = m.fail.att || !inst.capt.attValid;
      const hdgBad = m.fail.hdg || !inst.capt.hdgValid;
      if (m.fail.loc || sf.nav || !inst.capt.navPowered) nv = { ...nv, vorValid: false, locValid: false, gsValid: false };
      if (m.fail.gs || !inst.capt.navGsPowered) nv = { ...nv, gsValid: false };
      if (m.fail.loc || sfFo.nav || !inst.fo.navPowered) nvFo = { ...nvFo, vorValid: false, locValid: false, gsValid: false };
      if (m.fail.gs || !inst.fo.navGsPowered) nvFo = { ...nvFo, gsValid: false };
      /* DME STBY / CB open blanks distance; TEST handled at display */
      {
        const ped = usePedestal.getState();
        const blankDme = (side: 0 | 1, data: typeof nv) => {
          if (!inst.radioPower[side === 0 ? "dme1" : "dme2"]) return { ...data, vorDist: 0, thrDist: 0 };
          if ((ped.dmeMode?.[side] ?? 1) === 0) return { ...data, vorDist: 0, thrDist: 0 };
          return data;
        };
        nv = blankDme(0, nv);
        nvFo = blankDme(1, nvFo);
      }
      /* AMM 34-31 VHF NAV self-test: VOR centers; ILS drives UP-LEFT then we hold LOC left / GS up */
      {
        const ped = usePedestal.getState();
        const applyNavTest = (side: 0 | 1, data: typeof nv) => {
          if (!ped.navTest?.[side]) return data;
          const freq = side === 0 ? (ped.navL?.act ?? 0) : (ped.navR?.act ?? 0);
          const mhz = freq / 1000;
          const isIls = mhz >= 108.1 && (Math.round(mhz * 100) % 10) % 2 === 1; // odd-tenth ILS band heuristic
          if (!isIls) {
            return { ...data, vorValid: true, locValid: false, gsValid: false, locDev: 0, gsErr: 0, radial: cur.current.hdg };
          }
          return { ...data, vorValid: false, locValid: true, gsValid: true, locDev: -1, gsErr: -1 };
        };
        nv = applyNavTest(0, nv);
        nvFo = applyNavTest(1, nvFo);
      }

      const vorD = vorDevOf(nv.radial, m.selCrs);
      const pedAdf = usePedestal.getState();
      const adf = computeAdfBearings(inst.capt.hdgValid ? inst.capt.hdg : a.hdg, power, !!m.fail.adf, {
        adf1Powered: inst.radioPower.adf1,
        adf2Powered: inst.radioPower.adf2,
        mode1: pedAdf.adfMode?.[0] ?? 2,
        mode2: pedAdf.adfMode?.[1] ?? 2,
      });
      const sideAtt = {
        capt: {
          pitch: inst.capt.pitch,
          roll: inst.capt.roll,
          hdg: inst.capt.hdg,
          attValid: inst.capt.attValid && !m.fail.att,
          hdgValid: inst.capt.hdgValid && !m.fail.hdg,
        },
        fo: {
          pitch: inst.fo.pitch,
          roll: inst.fo.roll,
          hdg: inst.fo.hdg,
          attValid: inst.fo.attValid && !m.fail.att,
          hdgValid: inst.fo.hdgValid && !m.fail.hdg,
        },
      };
      void captNavLive; void foNavLive;

      /* ── SP-77 solenoids and interlocks ── */
      const plant = { pw: power, hydB: hb, attOk: !attBad, hdgOk: !hdgBad };
      const il = afInterlocks(plant);
      const upd: Partial<MipStore> = {};
      if (inst.gyroMem) {
        const gm = m.gyroMem;
        if (
          gm.g1.pitch !== inst.gyroMem.g1.pitch ||
          gm.g1.roll !== inst.gyroMem.g1.roll ||
          gm.g2.pitch !== inst.gyroMem.g2.pitch ||
          gm.g2.roll !== inst.gyroMem.g2.roll ||
          gm.gAux.pitch !== inst.gyroMem.gAux.pitch ||
          gm.gAux.roll !== inst.gyroMem.gAux.roll
        ) {
          upd.gyroMem = inst.gyroMem;
        }
      }

      /* DME search / track */
      {
        const ped = usePedestal.getState();
        const geom1 = m.navOn && (nv.vorValid || nv.locValid) ? (m.navTuned === "VOR" ? nv.vorDist : nv.thrDist) : null;
        const geom2 = m.navOn && (nvFo.vorValid || nvFo.locValid) ? (nvFo.vorValid && !nvFo.locValid ? nvFo.vorDist : nvFo.thrDist) : null;
        const dAlt = (() => {
          try {
            const fn = readFlightNavigationState();
            return fn && Number.isFinite(fn.altitudeFt) ? fn.altitudeFt : 0;
          } catch { return 0; }
        })();
        const ch1 = stepDmeChannel({
          prev: m.dmeCh?.ch1 ?? IDLE_DME,
          mode: (ped.dmeMode?.[0] ?? 1) as 0 | 1 | 2,
          test: !!ped.dmeTest?.[0],
          powered: !!inst.radioPower.dme1,
          geomNm: geom1,
          deltaAltFt: dAlt,
          dtSec: dt,
        });
        const ch2 = stepDmeChannel({
          prev: m.dmeCh?.ch2 ?? IDLE_DME,
          mode: (ped.dmeMode?.[1] ?? 1) as 0 | 1 | 2,
          test: !!ped.dmeTest?.[1],
          powered: !!inst.radioPower.dme2,
          geomNm: geom2,
          deltaAltFt: dAlt,
          dtSec: dt,
        });
        upd.dmeCh = { ch1, ch2 };
      }
      /* Dual LRRA */
      {
        const ped = usePedestal.getState();
        let aglFt: number | null = null;
        // The geographic nav telemetry currently publishes barometric/selected
        // altitude, not AGL. Never relabel that value as radio altitude. AGL is
        // known on-ground and during the modeled runway approach; elsewhere it
        // remains unavailable and both LRRA channels correctly blank.
        if (g.wow) aglFt = 0;
        else if (g.rwyPhase === "APPROACH" && Number.isFinite(g.rwyAltFt)) {
          aglFt = Math.max(0, g.rwyAltFt);
        }
        const vsFpm = (r as { vsFpm?: number }).vsFpm ?? 0;
        const lr = resolveLrra({
          aglFt,
          vsFpm,
          dcPower: power,
          cb1: !!m.srcPower.lrra1Cb,
          cb2: !!m.srcPower.lrra2Cb,
          fail1: !!(m.fail as { lrra1?: boolean }).lrra1,
          fail2: !!(m.fail as { lrra2?: boolean }).lrra2,
          dh1: ped.lrraDh?.[0] ?? 200,
          dh2: ped.lrraDh?.[1] ?? 200,
          test1: !!ped.lrraTest?.[0],
          test2: !!ped.lrraTest?.[1],
        });
        upd.lrra = { h1: lr.ch1.heightFt, h2: lr.ch2.heightFt, dh1: lr.ch1.dhLight, dh2: lr.ch2.dhLight };
        /* HF coupler / usability */
        {
          const isDay = true; // trainer default daytime
          const h1 = stepHfChannel({
            prev: { ...IDLE_HF, ...(m.hfCh?.ch1 as object), mode: (ped.hfL?.mode ?? 0) as 0|1|2, actKhz: ped.hfL?.act ?? 5628, stbyKhz: ped.hfL?.stby ?? 8942 },
            mode: (ped.hfL?.mode ?? 0) as 0|1|2,
            actKhz: ped.hfL?.act ?? 5628,
            stbyKhz: ped.hfL?.stby ?? 8942,
            powered: !!inst.radioPower.hf1,
            retune: !!ped.hfTuneReq?.[0],
            isDay,
            dtSec: dt,
          });
          const h2 = stepHfChannel({
            prev: { ...IDLE_HF, ...(m.hfCh?.ch2 as object), mode: (ped.hfR?.mode ?? 0) as 0|1|2, actKhz: ped.hfR?.act ?? 5628, stbyKhz: ped.hfR?.stby ?? 8942 },
            mode: (ped.hfR?.mode ?? 0) as 0|1|2,
            actKhz: ped.hfR?.act ?? 5628,
            stbyKhz: ped.hfR?.stby ?? 8942,
            powered: !!inst.radioPower.hf2,
            retune: !!ped.hfTuneReq?.[1],
            isDay,
            dtSec: dt,
          });
          upd.hfCh = { ch1: { tuning: h1.tuning, usability: h1.usability }, ch2: { tuning: h2.tuning, usability: h2.usability } };
          // clear momentary tune request
          if (ped.hfTuneReq?.[0] || ped.hfTuneReq?.[1]) {
            try { usePedestal.getState().set({ hfTuneReq: [false, false] }); } catch { /* */ }
          }
        }
      }

      if (m.navScene !== sceneId) upd.navScene = sceneId;
      {
        const ca = m.attCapt, fa = m.attFo;
        if (ca.pitch !== sideAtt.capt.pitch || ca.roll !== sideAtt.capt.roll || ca.hdg !== sideAtt.capt.hdg || ca.attValid !== sideAtt.capt.attValid || ca.hdgValid !== sideAtt.capt.hdgValid) upd.attCapt = sideAtt.capt;
        if (fa.pitch !== sideAtt.fo.pitch || fa.roll !== sideAtt.fo.roll || fa.hdg !== sideAtt.fo.hdg || fa.attValid !== sideAtt.fo.attValid || fa.hdgValid !== sideAtt.fo.hdgValid) upd.attFo = sideAtt.fo;
      }
      if (synced.changed) {
        upd.navFrequencyMHz = synced.frequencyMHz;
        if (synced.kind) upd.navTuned = synced.kind;
      }
      if ((m.apAil || m.apElev) && !il) { upd.apWarn = true; upd.apWhy = `A/P disconnect: ${afDisconnectReason(plant)}`; }
      if (m.apAil && !il) upd.apAil = false;
      if (m.apElev && !il) upd.apElev = false;
      const altBad = m.fail.ht; // ALT HOLD needs the altitude (static) source
      const ga = goAroundSelected(m.fdMode, !!flying); // FD GA ends the approach modes and ALT HOLD (trainer behaviour: the pilot follows the GA command)
      const ailOn = m.apAil && il, elevOn = m.apElev && il;
      const turb = elevOn && m.apPitch === 0; // TURB: bank limit 8 deg and localizer inoperative
      const kindOf = (n: number): "VOR" | "LOC" => (n === 1 && captKind === "VOR" ? "VOR" : "LOC");
      const beamOk = (n: number) => (n === 1 ? (captKind === "VOR" ? nv.vorValid : nv.locValid) : n === 2 ? nv.locValid : n === 3 ? nv.locValid && nv.gsValid : true);
      const cwsR = Math.abs(yr) > 0.08, cwsP = Math.abs(yp) > 0.08;
      /* AUTO APP / MAN G/S also need pitch engaged and the pitch CWS in detent; moving it out of detent returns the NAV switch to MAN (AMM 22-11-0) */
      const navHeld = m.apNav !== 0 && ailOn && !ga && beamOk(m.apNav) && !(turb && kindOf(m.apNav) === "LOC") && (m.apNav < 2 || (elevOn && !cwsP)); // NAV knob is spring-loaded to MAN and solenoid held only with a valid beam
      if (m.apNav !== 0 && !navHeld) upd.apNav = 0;
      if ((ailOn && cwsR && m.apHdgSw === 2) || (navHeld && m.apHdgSw === 2) || (!ailOn && m.apHdgSw !== 1)) upd.apHdgSw = 1; // HDG SEL / HDG OFF are solenoid held
      const fdUp = power && !m.fail.fd && !attBad;
      if (m.fdAlt && (!fdUp || m.fdMode === 1)) upd.fdAlt = false; // FD ALT HOLD toggle is solenoid held

      /* glide-slope capture (autopilot pitch axis and flight director); ALT HOLD releases on capture */
      /* roll channel radio submodes: intercept (amber) -> capture (LBS drop-out, green) -> on-course; VOR over-station holds heading (AMM 22-11-0) */
      const navKind = kindOf(m.apNav);
      const crsErr = angDiff(m.selCrs, a.hdg);
      const prevSub = r.latSub;
      r.latSub = stepLateral(prevSub, { active: navHeld, kind: navKind, dev: navKind === "VOR" ? vorD.dev : nv.locDev, bank: a.roll, crsErr, overStation: navKind === "VOR" && nv.vorValid && inZoneOfConfusion(nv.vorDist, simAlt) });
      if (r.latSub === "OVER_STATION" && prevSub !== "OVER_STATION") r.osHdg = a.hdg;
      const locCap = r.latSub === "CAPTURE" || r.latSub === "ON_COURSE" || r.latSub === "OVER_STATION";
      /* glide slope: armed (amber) -> capture after localizer capture (10 s, 700 ft/min bias) -> track; MAN G/S captures at once */
      const gsWantAp = navHeld && elevOn && (m.apNav === 2 || m.apNav === 3) && nv.gsValid;
      const gsStep = stepGlide(r.gsPhaseAp, r.gsCapT, { want: gsWantAp, manual: m.apNav === 3, locCaptured: locCap, gsErr: nv.gsErr }, dt);
      r.gsPhaseAp = gsStep.phase; r.gsCapT = gsStep.capT;
      const wasGsCap = r.gsCapAp;
      r.gsCapAp = gsStep.phase === "CAPTURE" || gsStep.phase === "TRACK";
      if (r.gsCapAp && !wasGsCap && m.apPitch === 2) upd.apPitch = 1;
      /* approach progress display: VOR/LOC amber while selected, green on capture; GLIDE SLOPE likewise; green latches until MAN */
      r.vocLight = nextLight(r.vocLight, navHeld && (m.apNav === 1 || m.apNav === 2), r.latSub !== "OFF" && r.latSub !== "INTERCEPT");
      r.gsLight = nextLight(r.gsLight, navHeld && (m.apNav === 2 || m.apNav === 3), r.gsCapAp);
      if (m.apAnn.voc !== r.vocLight || m.apAnn.gs !== r.gsLight) upd.apAnn = { voc: r.vocLight, gs: r.gsLight };
      { // ILS marker beacons: received only while the NAV receiver is on and powered, an ILS is tuned and the aircraft is in the cone
        const mk = m.navOn && m.navTuned === "ILS" && flying ? markerCoverage(sceneId, r.pos, simAlt, m.markerHigh) : NO_MARKERS;
        if (mk.om !== m.markers.om || mk.mm !== m.markers.mm || mk.im !== m.markers.im) upd.markers = { om: mk.om, mm: mk.mm, im: mk.im };
      }
      if (sceneId === "RPLL06") publishSituation({ x: r.pos.x, y: r.pos.y, hdg: a.hdg, altFt: simAlt, tasKt: tas, flying: !!flying, latSub: r.latSub, gsPhase: r.gsPhaseAp, gsCapT: r.gsCapT });
      if (m.apPitch === 2 && (!elevOn || r.gsCapAp || altBad || ga)) { // ALT HOLD is solenoid held
        upd.apPitch = 1;
        if (elevOn && altBad) upd.apWhy = "ALT HOLD released: altitude source failed";
        else if (elevOn && ga) upd.apWhy = "ALT HOLD released: go-around selected";
      }
      if (m.apNav !== 0 && ga && ailOn) upd.apWhy = "NAV returned to MAN: go-around selected";
      const gsWantFd = fdUp && (m.fdMode === 4 || m.fdMode === 5) && nv.gsValid;
      if (!gsWantFd) r.gsCapFd = false;
      else if (!r.gsCapFd && (m.fdMode === 5 || Math.abs(nv.gsErr) < 0.25)) { r.gsCapFd = true; if (m.fdAlt) upd.fdAlt = false; }

      /* ── autopilot references ── */
      if (!ailOn || cwsR) { r.wasCwsR = true; r.refRoll = a.roll; r.refHdg = a.hdg; }
      else if (r.wasCwsR) { r.wasCwsR = false; r.hdgHold = Math.abs(a.roll) < 6; r.refHdg = a.hdg; r.refRoll = a.roll; } // roll attitude hold unless wings are about level
      if (!elevOn || cwsP) { r.wasCwsP = true; r.refPitch = a.pitch; }
      else r.wasCwsP = false;
      /* PLAN NAV (trainer aid, not a 737-200 system): heading command from the active plan while AIL is engaged and HDG SEL is not selected,
         altitude target while ELEV is engaged with the pitch switch OFF (ALT HOLD on the panel always wins); radio capture and G/S take over from it */
      const guide = applyPhaseToGuidance(getLiveFlightGuidance(), simAlt);
      const planLat = m.planNav && guide.active && guide.headingMagCmdDeg != null && ailOn && !cwsR && !navHeld && m.apHdgSw !== 2 && !!flying;
      const planVert = m.planNav && guide.active && guide.targetAltFt != null && elevOn && !cwsP && m.apPitch === 1 && !r.gsCapAp && !altBad && !ga && !!flying;
      const altSel = (elevOn && m.apPitch === 2 && !r.gsCapAp && !altBad && !ga) || planVert;
      if (planVert) r.altAp = guide.targetAltFt as number;
      else if (altSel && !r.prevAltSel) r.altAp = h;
      /* hand off to the ILS: tune pedestal NAV 1/2 (authority), set course, select AUTO APP once localizer is valid */
      if (m.planNav && guide.active && guide.ilsArm && sceneId === "WSSS02L" && liveArr) {
        if (!m.navOn || Math.abs(captRx.frequencyMHz - liveArr.ilsFrequencyMHz) > 0.001) {
          tuneNav1(liveArr.ilsFrequencyMHz, { powerOn: true });
          upd.navOn = true;
        }
        if (Math.abs(angDiff(m.selCrs, liveArr.courseMag)) > 0.5) upd.selCrs = liveArr.courseMag;
        tuneNav2(liveArr.ilsFrequencyMHz);
        if (nv.locValid && m.fdMode !== 1 && m.fdMode !== 4) upd.fdMode = 4;
        if (ailOn && m.apNav === 0 && nv.locValid && !cwsR && !ga) upd.apNav = elevOn ? 2 : 1;
      }
      const planStatus = !m.planNav ? "OFF" : !guide.active ? "NO PLAN" : !ailOn ? "ARMED - ENGAGE AIL" : navHeld ? "ILS" : m.apHdgSw === 2 ? "HDG SEL OVERRIDES" : planLat ? `ACTIVE ${guide.note}` : "ARMED";
      if (m.planNavStatus !== planStatus) upd.planNavStatus = planStatus;
      r.prevAltSel = altSel;
      if (m.fdAlt && !r.prevFdAlt) r.altFd = h;
      r.prevFdAlt = m.fdAlt;

      /* ── attitude targets ── */
      const bankMax = turb ? 8 : 25;
      let rT = flying ? clamp(yr * 30, -35, 35) : 0;
      let rollRate = 8;
      let pT = flying ? clamp(gamma + aoa + yp * 8, -25, 30) : g.wow && v > 110 ? clamp(yp * 12, 0, 12) : 0;
      if (flying && ailOn && !cwsR) {
        rollRate = 7; // heading hold roll-rate limit
        if (navHeld) {
          const k = kindOf(m.apNav);
          const L = lateralLaw(r.latSub, k, k === "VOR" ? vorD.dev : nv.locDev, m.selCrs, a.hdg, r.osHdg);
          rT = clamp(L.bank, -Math.min(L.lim, bankMax), Math.min(L.lim, bankMax));
          rollRate = L.rate;
        } else if (planLat && guide.headingMagCmdDeg != null) rT = clamp(angDiff(guide.headingMagCmdDeg, a.hdg) * 1.2, -bankMax, bankMax);
        else if (m.apHdgSw === 2) rT = clamp(angDiff(m.selHdg, a.hdg) * 1.2, -bankMax, bankMax);
        else if (m.apHdgSw === 1 && r.hdgHold) rT = clamp(angDiff(r.refHdg, a.hdg) * 1.2, -bankMax, bankMax);
        else rT = r.refRoll;
      }
      if (dyn) {
        if (elevOn && !cwsP) r.gamma = step(r.gamma, r.gsCapAp ? glideGamma(r.gsPhaseAp, nv.gsErr, tas, r.gsCapT, simAlt) : altSel ? altAcquire(r.altAp - h, tas).gamma : r.refPitch - aoa, turb ? 0.75 : 1.5, dt);
        else r.gamma = clamp(r.gamma + yp * 3 * dt, -15, 15); // pull = climb: the yoke commands flight-path rate
        pT = clamp(r.gamma + aoa, -25, 30);
      } else if (flying && elevOn && !cwsP) pT = altSel ? clamp(aoa + altAcquire(r.altAp - h, tas).gamma, -25, 30) : r.refPitch;
      const pitch = step(a.pitch, pT, turb ? 1.2 : 2.0, dt);
      const roll = step(a.roll, rT, rollRate, dt);
      const turn = flying ? ((1091 * Math.tan((roll * Math.PI) / 180)) / Math.max(tas, 100)) * dt : 0;
      const hdg = (((a.hdg + turn) % 360) + 360) % 360;

      /* ── flight director steering commands (V-pointers) ── */
      let show = false, flag = false, bank = 0, pit = 0;
      if (power && m.fdMode !== 1) {
        const radio = m.fdMode >= 3;
        const kind: "VOR" | "LOC" = m.fdMode === 3 && captKind === "VOR" ? "VOR" : "LOC";
        const beam = kind === "VOR" ? nv.vorValid : nv.locValid;
        if (!fdUp || (radio && !beam) || (m.fdMode === 2 && hdgBad)) flag = true; // COMPUTER warning flag
        else {
          show = true;
          if (m.fdMode === 0) { bank = clamp(-roll, -FD_LIMIT.bank, FD_LIMIT.bank); pit = clamp(15 - pitch, -FD_LIMIT.pitch, FD_LIMIT.pitch); } // GA: wings level, preset pitch-up
          else {
            const bc = radio ? radioLateral(kind, kind === "VOR" ? vorD.dev : nv.locDev, m.selCrs, hdg).bank : clamp(angDiff(m.selHdg, hdg) * 1.5, -FD_LIMIT.bank, FD_LIMIT.bank);
            const gT = r.gsCapFd ? gsGamma(nv.gsErr) : m.fdAlt ? clamp((r.altFd - h) * 0.015, -5, 5) : m.fdPitch;
            bank = clamp(bc - roll, -FD_LIMIT.bank, FD_LIMIT.bank);
            pit = clamp((flying ? aoa : 0) + gT - pitch, -FD_LIMIT.pitch, FD_LIMIT.pitch);
          }
        }
      }
      const q = (x: number) => Math.round(x * 2) / 2;
      const oc = m.fdCmd;
      if (oc.show !== show || oc.flag !== flag || Math.abs(oc.bank - q(bank)) > 0.01 || Math.abs(oc.pitch - q(pit)) > 0.01) upd.fdCmd = { show, flag, bank: q(bank), pitch: q(pit) };
      const on = m.nav;
      if (on.vorValid !== nv.vorValid || on.locValid !== nv.locValid || on.gsValid !== nv.gsValid || Math.abs(on.radial - nv.radial) > 0.2 || Math.abs(on.locDev - nv.locDev) > 0.02 || Math.abs(on.gsErr - nv.gsErr) > 0.02 || Math.abs(on.thrDist - nv.thrDist) > 0.05) upd.nav = nv;
      const onF = m.navFo;
      if (onF.vorValid !== nvFo.vorValid || onF.locValid !== nvFo.locValid || onF.gsValid !== nvFo.gsValid || Math.abs(onF.radial - nvFo.radial) > 0.2 || Math.abs(onF.locDev - nvFo.locDev) > 0.02 || Math.abs(onF.gsErr - nvFo.gsErr) > 0.02 || Math.abs(onF.thrDist - nvFo.thrDist) > 0.05) upd.navFo = nvFo;
      const brgClose = (a: number | null, b: number | null) => a === b || (a != null && b != null && Math.abs(a - b) < 0.5);
      if (!brgClose(m.adfBrg1, adf.brg1) || !brgClose(m.adfBrg2, adf.brg2)) { upd.adfBrg1 = adf.brg1; upd.adfBrg2 = adf.brg2; }
      if (Object.keys(upd).length) useMip.setState(upd);

      let navAltitudeFt = simAlt;
      if (dyn) {
        const vsNow = Math.sin((r.gamma * Math.PI) / 180) * tas * 1.688 * 60; // fpm
        navAltitudeFt = Math.max(0, simAlt + (vsNow / 60) * dt);
        useSim.setState({ psFlightAltFt: navAltitudeFt, psFlightTargetAltFt: navAltitudeFt, psFlightVsFpm: Math.round(vsNow) } as never);
      }
      // The main instrument panel owns the live simulated attitude and heading.
      // Publish that same heading to the geographic route tracker so the map,
      // active-leg bearing and cockpit HSI/ADI don't drift apart due to two models.
      advanceFlightNavigation({
        dt,
        groundSpeedKt: Number(g.groundSpeedKt ?? 0),
        headingDeg: hdg,
        altitudeFt: navAltitudeFt,
        wow: !!g.wow,
      });
      cur.current = { pitch, roll, hdg };
      if (Math.abs(pitch - a.pitch) < 0.02 && Math.abs(roll - a.roll) < 0.02 && Math.abs(hdg - a.hdg) < 0.02) return;
      useMip.setState({ att: cur.current });
    }, 100);
    return () => { window.clearInterval(id); useMip.setState({ attLive: false }); };
  }, [enabled]);
}

/** Subscribes one readout to one sim value so the rest of the panel does not re-render when it changes. */
function Sim<K extends keyof SimStore>({ k, children }: { k: K; children: (v: SimStore[K]) => ReactNode }) {
  const v = useSim((st) => st[k]);
  return <>{children(v)}</>;
}

/** Re-renders only its own face(s) when the simulated attitude changes (10 Hz), not the whole instrument panel. */
function WithAtt({ children }: { children: (att: Att) => ReactNode }) {
  const att = useMip((s) => s.att);
  return <>{children(att)}</>;
}

/** AMM 34-55: STBY → no readout; TEST → 0.0; else distance or null if invalid. */
function dmeDisplayNm(side: 0 | 1, fail: boolean, dmeCh: { ch1: { displayNm: number | null }; ch2: { displayNm: number | null } } | undefined): number | null {
  if (fail) return null;
  const ch = side === 0 ? dmeCh?.ch1 : dmeCh?.ch2;
  return ch?.displayNm ?? null;
}

export function Panel() {
  const s = useSimPick("ambientTempF", "groundSpeedKt", "ltPanelCapt", "ltPanelFo", "ltPanelPed", "ltTest", "patch", "psBaroCaptHpa", "psBaroFoHpa", "psBaroStbyHpa", "rudderPedal", "wow");
  const d = useDerivedPick("acPower", "dcPower", "speedBrakeArmed", "standbyAcSource");
  const hydBOk = useDerivedSelect((dd) => Number(dd.hydB ?? 0) >= 1500);
  const m = useMip(useShallow((st) => ({ adfBrg1: st.adfBrg1, adfBrg2: st.adfBrg2, adiTestCapt: st.adiTestCapt, adiTestFo: st.adiTestFo, apAnn: st.apAnn, attCapt: st.attCapt, attFo: st.attFo, bugCapt: st.bugCapt, bugFo: st.bugFo, compSel: st.compSel, dmeCh: st.dmeCh, fail: st.fail, fdCmd: st.fdCmd, floodCapt: st.floodCapt, floodFo: st.floodFo, fuelSel: st.fuelSel, gyroSel: st.gyroSel, lightKey: st.lightKey, lrra: st.lrra, markerHigh: st.markerHigh, nav: st.nav, navFo: st.navFo, navOn: st.navOn, navSel: st.navSel, navTuned: st.navTuned, raDh: st.raDh, raTest: st.raTest, selCrs: st.selCrs, selCrs2: st.selCrs2, selHdg: st.selHdg, set: st.set, srcFail: st.srcFail, srcPower: st.srcPower })));
  const pw = d.dcPower;
  // Computed inside the subscription from the full sim state: re-renders only when the air data really changes.
  const air = useSim((st) => computeAirData(st, d.dcPower, d.acPower), deepEqual);
  const rmiNeedles = usePedestal(useShallow((st) => ({ rmiNeedle1: st.rmiNeedle1, rmiNeedle2: st.rmiNeedle2 })));
  // Main ASI/ALT are driven by the channel's AC-powered air-data computer;
  // they must not be blanked merely because the main DC bus is lost.
  const capt = air.capt;
  const fo = air.fo;
  const captAirDataPowered = air.capt.adc.data.powered;
  const foAirDataPowered = air.fo.adc.data.powered;
  const sp = m.srcPower;
  const simTransfer = useSimPick("efiXfr", "irsXfr", "navXfr");
  const displayNavSel = simTransfer.navXfr === "BOTH ON 1" ? 0 : simTransfer.navXfr === "BOTH ON 2" ? 2 : m.navSel;
  const displayEfiSide = simTransfer.efiXfr === "BOTH ON L" ? 0 : simTransfer.efiXfr === "BOTH ON R" ? 2 : null;
  const displayCompSel = displayEfiSide ?? m.compSel;
  const displayGyroSel = displayEfiSide ?? m.gyroSel;
  const src = sourcesOf({ navSel: displayNavSel, compSel: displayCompSel, gyroSel: displayGyroSel }, m.srcFail);
  if (displayEfiSide !== null && simTransfer.irsXfr === "NORMAL") {
    const left = displayEfiSide === 0;
    src.capt.att = src.fo.att = left ? m.srcFail.gyro1 : m.srcFail.gyro2;
    src.capt.hdg = src.fo.hdg = left ? m.srcFail.comp1 : m.srcFail.comp2;
  }
  const failC = {
    ...m.fail,
    att: m.fail.att || src.capt.att || !m.attCapt.attValid || (!sp.gyro1Cb && displayGyroSel !== 0) || (!sp.gyroAuxCb && displayGyroSel === 0),
    hdg: m.fail.hdg || src.capt.hdg || !m.attCapt.hdgValid || (!sp.comp1Cb && displayCompSel !== 2) || (!sp.comp2Cb && displayCompSel === 2),
    loc: m.fail.loc || src.capt.nav || (displayNavSel === 2 ? !sp.nav2Cb : !sp.nav1Cb),
    gs: m.fail.gs || src.capt.nav || (displayNavSel === 2 ? !sp.nav2GsCb : !sp.nav1GsCb),
    dme1: m.fail.dme1 || !sp.dme1Cb,
    dme2: m.fail.dme2 || !sp.dme2Cb,
    adf: m.fail.adf || (!sp.adf1Cb && !sp.adf2Cb),
  };
  const failF = {
    ...m.fail,
    att: m.fail.att || src.fo.att || !m.attFo.attValid || (!sp.gyro2Cb && displayGyroSel !== 2) || (!sp.gyroAuxCb && displayGyroSel === 2),
    hdg: m.fail.hdg || src.fo.hdg || !m.attFo.hdgValid || (!sp.comp2Cb && displayCompSel !== 0) || (!sp.comp1Cb && displayCompSel === 0),
    loc: m.fail.loc || src.fo.nav || (displayNavSel === 0 ? !sp.nav1Cb : !sp.nav2Cb),
    gs: m.fail.gs || src.fo.nav || (displayNavSel === 0 ? !sp.nav1GsCb : !sp.nav2GsCb),
    dme1: m.fail.dme1 || !sp.dme1Cb,
    dme2: m.fail.dme2 || !sp.dme2Cb,
    adf: m.fail.adf || (!sp.adf1Cb && !sp.adf2Cb),
  };
  const navC = failC.loc ? NO_NAV : m.nav, navF = failF.loc ? NO_NAV : m.navFo;
  const owner = useIsModelOwner();
  useAttitude(capt.iasKt, capt.vsiFpm, capt.altFt, pw, hydBOk, owner);
  const tasKt = capt.iasKt * (1 + (capt.altFt / 1000) * 0.016);
  const gsKt = s.wow ? s.groundSpeedKt : tasKt;
  const raRaw = m.lrra?.h1;
  // LRRA is a geometric AGL source, not the barometric altimeter. If the
  // modeled radio-altimeter value is unavailable, show the out-of-range/blank
  // indication instead of substituting a potentially unrelated MSL altitude.
  const ra = s.wow ? 0 : raRaw != null ? raRaw : 9999;
  const raDh = m.raDh;
  const test = !!(pw && (s.ltTest || m.raTest || m.lightKey === 2));
  const tatC = ((Number(s.ambientTempF ?? 59) - 32) * 5) / 9;
  const mb = (hg: number) => hg * 33.8639;
  // Baro settings live in the sim state so the altimeter and the CADC share one value (hPa; the knob works in inHg).
  const hgC = s.psBaroCaptHpa / 33.8639, hgF = s.psBaroFoHpa / 33.8639, hgS = s.psBaroStbyHpa / 33.8639;
  const dhKnob = (x: number, y: number) => (
    <S x={x} y={y} w={176} h={30}>
      <div className="flex items-center justify-between px-1">
        <Knob size={22} min={0} max={500} step={10} value={m.raDh} onChange={(v) => {
          m.set({ raDh: v });
          try {
            const ped = usePedestal.getState();
            ped.set({ lrraDh: [v, ped.lrraDh[1]] as [number, number] });
          } catch { /* */ }
        }} />
        <span className={cn(LEGEND, "text-[7px]")}>DH {pad(m.raDh, 3)}</span>
        <PushButton label="TEST" onPress={() => m.set({ raTest: true })} onRelease={() => m.set({ raTest: false })} />
      </div>
    </S>
  );
  const bugKnob = (x: number, y: number, v: number, set: (n: number) => void) => (
    <S x={x} y={y} w={90} h={30}><div className="flex items-center gap-1"><Knob size={22} min={60} max={340} step={1} value={v} onChange={(n) => set(Math.round(n))} /><span className={cn(LEGEND, "text-[7px]")}>BUG {Math.round(v)}</span></div></S>
  );
  const baroKnob = (x: number, y: number, v: number, set: (n: number) => void) => (
    <S x={x} y={y} w={90} h={30}><div className="flex items-center gap-1"><Knob size={22} min={28.5} max={31} step={0.01} value={v} onChange={(n) => set(+n.toFixed(2))} /><span className={cn(LEGEND, "text-[7px]")}>BARO {v.toFixed(2)}</span></div></S>
  );
  /* lighting zone overlay: lamps need DC power; dimmer at 0 leaves the panel dark, at 1 fully lit; flood adds a warm top-down wash */
  const light = (x: number, w: number, panel: number, flood: number) => {
    const pl = pw ? clamp(Number(panel) || 0, 0, 1) : 0;
    const fl = pw ? clamp(Number(flood) || 0, 0, 1) : 0;
    return (
      <div key={x} className="pointer-events-none absolute z-30" aria-hidden
        style={{ left: x, top: 0, width: w, height: CH, background: `radial-gradient(ellipse at 50% 0%, rgba(255,214,150,${(fl * 0.28).toFixed(3)}), rgba(255,200,120,${(fl * 0.1).toFixed(3)}) 55%, rgba(255,200,120,0) 85%), rgba(3,5,9,${((1 - pl) * 0.42).toFixed(3)})` }} />
    );
  };
  const dhOn = test || (pw && !s.wow && ra <= m.raDh);
  const dhLamp = (x: number, y: number) => <S x={x} y={y} w={20} h={20}><span className={cn("block size-full rounded-full border-2 border-[#3a2a12] shadow-[0_0_6px_rgba(0,0,0,.6)]", dhOn ? "bg-[#ffb21a] shadow-[0_0_10px_#ffb21a]" : "bg-[#b0701c]")} /></S>;
  return (
    <div className="space-y-2 rounded-[6px] border-2 border-[#15181c] bg-[#1d2127] p-3 shadow-[inset_0_0_30px_rgba(0,0,0,.4)]" style={{ width: DESIGN_W }}>
      <Glareshield />
      <div className="relative overflow-hidden rounded-[10px] border-2 border-[#15181c] shadow-[inset_0_0_30px_rgba(0,0,0,.45)]" style={{ width: CW, height: CH, background: PANEL_BLUE }}>
        {/* ═════════ CAPTAIN ═════════ */}
        <S x={14} y={14} w={260} h={46}><TopStrip side="L" /></S>
        <S x={286} y={14} w={100} h={24}><Lens>GPWS</Lens></S>
        <S x={286} y={40} w={100} h={24}><Lens><>BELOW G/S<br />P INHIBIT</></Lens></S>
        <S x={10} y={330} w={176} h={150}><PlacardAc /></S>
        <Bezel x={24} y={500} w={152} h={152} />
        <div className="absolute" style={{ left: 40, top: 520 }}><AnalogClock size={121} /></div>
        <Tag x={100} y={500} w={120}>CHR · ET</Tag>
        <Bezel x={188} y={77} w={236} h={236} />
        <C cx={306} cy={195} r={104}><AsiReal data={capt} powered={captAirDataPowered} bugKt={m.bugCapt} /></C>
        <Bezel x={230} y={343} w={162} h={184} />
        <S x={234} y={347} w={154} h={176}><WithAtt>{(att) => (<RmiReal powered={pw} fail={failC} hdg={m.attCapt.hdgValid ? m.attCapt.hdg : att.hdg} dme1Nm={dmeDisplayNm(0, failC.dme1, m.dmeCh)} dme2Nm={dmeDisplayNm(1, failC.dme2, m.dmeCh)} brg1={(() => { const ped = rmiNeedles; const sel = ped.rmiNeedle1?.[0] ?? 0; if (sel === 0 && m.navOn && navC.vorValid) return angDiff(navC.radial, att.hdg); return m.adfBrg1; })()} brg2={(() => { const ped = rmiNeedles; const sel = ped.rmiNeedle2?.[0] ?? 1; if (sel === 0 && m.navOn && navF.vorValid) return angDiff(navF.radial, att.hdg); return m.adfBrg2; })()} />)}</WithAtt></S>
        <S x={226} y={550} w={170} h={26}><RegPlate /></S>

        <S x={428} y={18} w={250} h={56}><Comparator /></S>
        <Bezel x={428} y={84} w={250} h={262} />
        <S x={432} y={88} w={242} h={254}><WithAtt>{(att) => (<AdiReal slip={clamp(s.rudderPedal, -1, 1)} powered={pw} test={pw && m.adiTestCapt} fail={failC} pitch={m.attCapt.attValid ? m.attCapt.pitch : att.pitch} roll={m.attCapt.attValid ? m.attCapt.roll : att.roll} fd={m.fdCmd} locErr={m.navOn && m.navTuned === "ILS" && navC.locValid ? navC.locDev : null} gsErr={m.navOn && m.navTuned === "ILS" && navC.gsValid ? navC.gsErr : null} navFlags={{ loc: m.navOn && m.navTuned === "ILS" && !navC.locValid, gs: m.navOn && m.navTuned === "ILS" && !navC.gsValid }} />)}</WithAtt></S>
        {dhLamp(644, 92)}
        <S x={432} y={350} w={46} h={18}><PushButton label="TEST" onPress={() => m.set({ adiTestCapt: true })} onRelease={() => m.set({ adiTestCapt: false })} className="w-full" /></S>
        <Bezel x={433} y={398} w={240} h={210} />
        <S x={437} y={402} w={232} h={202}><WithAtt>{(att) => (<HsiReal powered={pw} fail={failC} hdg={m.attCapt.hdgValid ? m.attCapt.hdg : att.hdg} tas={tasKt} gs={gsKt} crs={m.selCrs} bug={m.selHdg} nav={navC} navOn={m.navOn} tuned={m.navTuned} />)}</WithAtt></S>

        <S x={690} y={30} w={76} h={44}><Lens><>F/D<br />WINDSHEAR</></Lens></S>
        <S x={690} y={78} w={76} h={42}><ApproachProgress ann={m.apAnn} pw={pw} /></S>
        <S x={690} y={124} w={76} h={44}><Lens><>ALTITUDE<br />ALERT</></Lens></S>
        <Bezel x={774} y={14} w={300} h={164} />
        <S x={774} y={14} w={300} h={164}><AnnPanel side="L" /></S>
        <Bezel x={695} y={192} w={180} h={214} />
        <C cx={785} cy={282} r={76}><HeightDial ft={ra < 9000 ? ra : -1} dh={m.raDh} powered={pw && !m.fail.ht && !!m.srcPower.lrra1Cb && m.lrra?.h1 != null} /></C>
        {dhKnob(696, 374)}
        <Bezel x={896} y={190} w={184} h={220} />
        <C cx={988} cy={288} r={73}><AltReal data={capt} powered={captAirDataPowered} mb={s.psBaroCaptHpa} hg={hgC} /></C>
        {bugKnob(210, 300, m.bugCapt, (n) => m.set({ bugCapt: n }))}
        {baroKnob(900, 382, hgC, (n) => s.patch({ psBaroCaptHpa: n * 33.8639 }))}
        <Bezel x={700} y={430} w={170} h={170} />
        <C cx={785} cy={515} r={74}><div className="relative size-full"><VerticalSpeed data={capt} />{(!pw || m.fail.vsi) && <span className={cn("absolute left-[8%] top-[44%] rounded-[2px] border px-1 font-mono text-[9px] font-bold", FLAG)}>OFF</span>}</div></C>
        <Bezel x={886} y={420} w={104} h={190} />
        <S x={894} y={430} w={88} h={26}><MarkerLamp id="im" test={test} powered={pw} kind="lens" tone="white">AIRWAYS</MarkerLamp></S>
        <S x={894} y={458} w={88} h={26}><MarkerLamp id="mm" test={test} powered={pw} kind="lens">MIDDLE</MarkerLamp></S>
        <S x={894} y={486} w={88} h={26}><MarkerLamp id="om" test={test} powered={pw} kind="annun">OUTER</MarkerLamp></S>
        <Tag x={938} y={518} w={90}>MARKER</Tag>
        <S x={918} y={532} w={40} h={74}><Toggle on={m.markerHigh} onChange={(v) => m.set({ markerHigh: v })} upLabel="HIGH" downLabel="LOW" /></S>
        <S x={996} y={430} w={94} h={34}><Lens on={pw && d.speedBrakeArmed} tone="green"><>SPEED BRAKE<br />ARMED</></Lens></S>
        <S x={996} y={468} w={94} h={34}><Lens on={test}><>SPEED BRAKE<br />DO NOT ARM</></Lens></S>
        <S x={1032} y={520} w={26} h={26}><div className="size-full rounded-[3px] border border-[#555a60] bg-[#0b0c0d]" /></S>
        <Bezel x={690} y={618} w={400} h={98} />
        <S x={694} y={622} w={392} h={92}>
          <div className="flex size-full items-center justify-around">
            <Sel3 label="VHF NAV" value={m.navSel} onChange={(v) => m.set({ navSel: v })} legends={["BOTH\nON 1", "NORMAL", "BOTH\nON 2"]} />
            <Sel3 label="COMPASS" value={m.compSel} onChange={(v) => m.set({ compSel: v })} legends={["BOTH\nON 1", "NORMAL", "BOTH\nON 2"]} />
            <Sel3 label="VERTICAL GYRO" value={m.gyroSel} onChange={(v) => m.set({ gyroSel: v })} legends={["CAPT\nON AUX", "NORMAL", "F/O\nON AUX"]} />
          </div>
        </S>

        {/* ═════════ CENTRE ═════════ */}
        <div className="absolute rounded-[3px] border border-[#1b2028] shadow-[inset_0_0_10px_rgba(0,0,0,.4)]" style={{ left: X_SB - 6, top: 14, width: 198, height: 690, background: CENTRE }} />
        <S x={X_SB + 4} y={20} w={100} h={80}><LightTestKey /></S>
        <Bezel x={X_SB + 20} y={116} w={150} h={224} />
        {/* ATA 34 standby airspeed/altimeter are pneumatic: use their own pitot/static
            source and do not blank them when the main DC buses or CADCs fail. */}
        <C cx={X_SB + 95} cy={206} r={70}><AltReal data={{ ...air.capt, ...air.standby } as SideAirData} powered={true} mb={s.psBaroStbyHpa} hg={hgS} /></C>
        {baroKnob(X_SB + 50, 340, hgS, (n) => s.patch({ psBaroStbyHpa: n * 33.8639 }))}
        <S x={X_SB + 22} y={298} w={146} h={38}><IasStrip ias={air.standby.iasKt} powered={true} /></S>
        <Bezel x={X_SB + 20} y={376} w={150} h={150} />
        <C cx={X_SB + 95} cy={451} r={66}><div className="relative size-full"><WithAtt>{(att) => (<Attitude roll={att.roll} pitch={att.pitch} />)}</WithAtt>{d.standbyAcSource === "NONE" && <span className={cn("absolute right-[6%] top-[8%] rounded-[2px] border px-1 font-mono text-[11px] font-bold", FLAG)}>X</span>}</div></C>
        <Tag x={X_SB + 95} y={550} w={120}>STBY ATT</Tag>
        <S x={X_SB + 4} y={566} w={36} h={72}><Toggle on={m.fuelSel} onChange={(v) => m.set({ fuelSel: v })} upLabel="1" downLabel="2" /></S>
        <S x={X_SB + 44} y={584} w={40} h={30}><PushButton label={<>QTY<br />TEST</>} onPress={() => m.set({ qtyTest: true })} onRelease={() => m.set({ qtyTest: false })} className="size-full" /></S>
        <S x={X_SB + 92} y={560} w={96} h={58}><Sim k="fuelTankCenter">{(v) => <QtyLed label="CTR TANK" value={v} w={96} h={58} />}</Sim></S>
        <S x={X_SB + 2} y={626} w={92} h={58}><Sim k="fuelTank1">{(v) => <QtyLed label="TANK 1" value={v} w={92} h={58} />}</Sim></S>
        <S x={X_SB + 98} y={626} w={92} h={58}><Sim k="fuelTank2">{(v) => <QtyLed label="TANK 2" value={v} w={92} h={58} />}</Sim></S>
        <EnginePanels />
        <GearColumn />

        {/* ═════════ FIRST OFFICER ═════════ */}
        <S x={F0 + 690} y={14} w={252} h={46}><TopStrip side="R" /></S>
        <Bezel x={F0 + 10} y={14} w={292} h={164} />
        <S x={F0 + 10} y={14} w={292} h={164}><AnnPanel side="R" /></S>
        <S x={F0 + 308} y={14} w={76} h={36}><Lens><>F/D<br />WINDSHEAR</></Lens></S>
        <S x={F0 + 308} y={52} w={76} h={36}><Lens>{""}</Lens></S>
        <S x={F0 + 308} y={92} w={76} h={36}><Lens>GPWS</Lens></S>
        <S x={F0 + 308} y={132} w={76} h={36}><Lens><>BELOW G/S<br />P INHIBIT</></Lens></S>
        <S x={F0 + 396} y={18} w={250} h={56}><Comparator /></S>
        <Bezel x={F0 + 10} y={190} w={146} h={170} />
        <S x={F0 + 18} y={198} w={130} h={120}>
          <div className="relative size-full rounded-full border-[6px] border-[#6a6e72] bg-[#2a2e33] shadow-[inset_0_0_10px_#000]">
            <div className="absolute inset-x-[10%] top-[30%] flex h-[38%] flex-col items-center justify-center overflow-hidden rounded-[3px] border border-[#1b2b35] bg-[#3b9fd0] font-mono text-[#06293a]">
              <span className="text-[7px] font-bold leading-none">TAT</span>
              <span className="text-[14px] font-bold leading-none">{pw ? `${tatC >= 0 ? "+" : "-"}${Math.abs(tatC).toFixed(1)}°C` : ""}</span>
              {(!pw || m.fail.tat) && <span className="absolute inset-0 grid place-items-center bg-[#e8c13a] text-[13px] font-bold text-[#4a3300]">OFF</span>}
            </div>
            <span className="absolute bottom-[-6px] left-1/2 size-[18px] -translate-x-1/2 rounded-full border-2 border-[#0b0c0e] bg-[radial-gradient(circle_at_35%_30%,#4a4e53,#14161a)]" />
          </div>
        </S>
        <Bezel x={F0 + 156} y={197} w={236} h={236} />
        <C cx={F0 + 274} cy={315} r={104}><AsiReal data={fo} powered={foAirDataPowered} bugKt={m.bugFo} /></C>
        <Bezel x={F0 + 198} y={456} w={162} h={184} />
        <S x={F0 + 202} y={460} w={154} h={176}><WithAtt>{(att) => (<RmiReal powered={pw} fail={failF} hdg={m.attFo.hdgValid ? m.attFo.hdg : att.hdg} dme1Nm={dmeDisplayNm(0, failF.dme1, m.dmeCh)} dme2Nm={dmeDisplayNm(1, failF.dme2, m.dmeCh)} brg1={(() => { const ped = rmiNeedles; const sel = ped.rmiNeedle1?.[1] ?? 0; if (sel === 0 && m.navOn && navC.vorValid) return angDiff(navC.radial, att.hdg); return m.adfBrg1; })()} brg2={(() => { const ped = rmiNeedles; const sel = ped.rmiNeedle2?.[1] ?? 1; if (sel === 0 && m.navOn && navF.vorValid) return angDiff(navF.radial, att.hdg); return m.adfBrg2; })()} />)}</WithAtt></S>
        <S x={F0 + 14} y={440} w={110} h={22}><Lens>LOW QUANTITY</Lens></S>
        <Bezel x={F0 + 10} y={468} w={146} h={150} />
        <C cx={F0 + 83} cy={543} r={58}><Sim k="hydAQty">{(v) => <Dial label="HYD QTY" value={v} min={0} max={100} major={25} minor={5} size={92} caption="" bands={[{ from: 0, to: 20, color: RED }]} />}</Sim></C>
        <Bezel x={F0 + 396} y={84} w={250} h={262} />
        <S x={F0 + 400} y={88} w={242} h={254}><WithAtt>{(att) => (<AdiReal slip={clamp(s.rudderPedal, -1, 1)} powered={pw} test={pw && m.adiTestFo} fail={failF} pitch={m.attFo.attValid ? m.attFo.pitch : att.pitch} roll={m.attFo.attValid ? m.attFo.roll : att.roll} fd={m.fdCmd} locErr={m.navOn && navF.locValid ? navF.locDev : null} gsErr={m.navOn && navF.gsValid ? navF.gsErr : null} navFlags={{ loc: m.navOn && !navF.locValid && !navF.vorValid, gs: m.navOn && !navF.gsValid }} />)}</WithAtt></S>
        {dhLamp(F0 + 612, 92)}
        <S x={F0 + 400} y={350} w={46} h={18}><PushButton label="TEST" onPress={() => m.set({ adiTestFo: true })} onRelease={() => m.set({ adiTestFo: false })} className="w-full" /></S>
        <Bezel x={F0 + 401} y={398} w={240} h={210} />
        <S x={F0 + 405} y={402} w={232} h={202}><WithAtt>{(att) => (<HsiReal powered={pw} fail={failF} hdg={m.attFo.hdgValid ? m.attFo.hdg : att.hdg} tas={tasKt} gs={gsKt} crs={m.selCrs2} bug={m.selHdg} nav={navF} navOn={m.navOn} tuned={navF.locValid || !navF.vorValid ? "ILS" : "VOR"} />)}</WithAtt></S>
        <S x={F0 + 440} y={640} w={170} h={26}><RegPlate /></S>

        <S x={F0 + 666} y={64} w={130} h={32}><ApproachProgress ann={m.apAnn} pw={pw} /></S>
        <S x={F0 + 666} y={100} w={130} h={26}><Lens><>ALTITUDE ALERT</></Lens></S>
        <Bezel x={F0 + 650} y={132} w={162} h={196} />
        <C cx={F0 + 731} cy={228} r={76}><HeightDial ft={ra < 9000 ? ra : -1} dh={m.raDh} powered={pw && !m.fail.ht && !!m.srcPower.lrra1Cb && m.lrra?.h1 != null} /></C>
        <Bezel x={F0 + 816} y={145} w={156} h={170} />
        <C cx={F0 + 894} cy={230} r={74}><div className="relative size-full"><VerticalSpeed data={fo} />{(!pw || m.fail.vsi) && <span className={cn("absolute left-[8%] top-[44%] rounded-[2px] border px-1 font-mono text-[9px] font-bold", FLAG)}>OFF</span>}</div></C>
        <Bezel x={F0 + 650} y={339} w={162} h={190} />
        <C cx={F0 + 731} cy={434} r={73}><AltReal data={fo} powered={foAirDataPowered} mb={s.psBaroFoHpa} hg={hgF} /></C>
        {bugKnob(F0 + 180, 418, m.bugFo, (n) => m.set({ bugFo: n }))}
        {baroKnob(F0 + 656, 500, hgF, (n) => s.patch({ psBaroFoHpa: n * 33.8639 }))}
        <S x={F0 + 842} y={336} w={112} h={150}><PlacardAc compact /></S>
        <Bezel x={F0 + 816} y={540} w={152} h={152} />
        <div className="absolute" style={{ left: F0 + 832, top: 560 }}><AnalogClock size={121} /></div>
        <Tag x={F0 + 892} y={542} w={110}>GMT · ET/CHR</Tag>

        {/* ═════════ LIGHTING: panel dimmers darken each zone, flood knobs add a warm wash from the glareshield ═════════ */}
        {light(0, 1094, s.ltPanelCapt, m.floodCapt)}
        {light(1094, 966, s.ltPanelPed, 0)}
        {light(2060, CW - 2060, s.ltPanelFo, m.floodFo)}
      </div>
      <LowerStrip />
    </div>
  );
}

/* ───────────────────────── lower strip: plates, radios, transponder ───────────────────────── */

function Vent({ size = 58 }: { size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden>
      <circle cx="50" cy="50" r="48" fill="#3a3d41" stroke="#1a1c1f" strokeWidth="2" />
      <circle cx="50" cy="50" r="36" fill="#17191c" stroke="#55595e" strokeWidth="2" />
      {[-18, -9, 0, 9, 18].map((y) => <line key={y} x1="22" y1={50 + y} x2="78" y2={50 + y} stroke="#4a4e53" strokeWidth="2.4" />)}
    </svg>
  );
}

function RoundBtn({ label, on, onClick }: { label: ReactNode; on: boolean; onClick: () => void }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <button type="button" aria-pressed={on} onClick={onClick} className={cn("size-8 rounded-full border-2 border-[#0b0c0e] bg-[radial-gradient(circle_at_35%_30%,#4a4e53,#14161a)] shadow-[0_2px_4px_rgba(0,0,0,.7)] active:translate-y-px", on && "ring-2 ring-[#e0a84a]")} />
      <span className={cn(LEGEND, "text-center text-[6px] leading-tight")}>{label}</span>
    </div>
  );
}

const fmtFreq = (v: number) => (v / 100).toFixed(2);

export function FreeFlightGps() {
  const m = useMip(useShallow((st) => ({ gpsOn: st.gpsOn, set: st.set })));
  const keys = ["NAV", "WPT", "APT/VOR", "D→", "FPL", "CALC", "AUX", "MSG"];
  return (
    <div className="w-[196px] rounded-[3px] border border-[#0b0c0e] bg-[#15181c] p-2 shadow-[inset_0_0_8px_#000]">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-display text-[12px] font-bold italic text-white">FreeFlight</span>
        <button type="button" aria-pressed={m.gpsOn} onClick={() => m.set({ gpsOn: !m.gpsOn })} className={cn("rounded-[2px] border border-[#555a60] px-1.5 font-mono text-[7px] font-bold", m.gpsOn ? "bg-[#2a3a2a] text-[#7dff7d]" : "bg-[#0b0c0d] text-[#8a8f95]")}>{m.gpsOn ? "ON" : "OFF"}</button>
      </div>
      <div className="mb-1.5 flex h-[34px] items-center justify-center rounded-[2px] border border-[#2a2d31] bg-black font-mono text-[9px] text-[#ffb21a]">{m.gpsOn ? <span>NAV · NO FLIGHT PLAN</span> : ""}</div>
      <div className="grid grid-cols-4 gap-1">
        {keys.map((k) => <button key={k} type="button" className="rounded-[2px] border border-[#6b5a3a] bg-[#b98a52] py-1 font-mono text-[7px] font-bold text-[#2a1b00] shadow-[0_2px_2px_rgba(0,0,0,.6)] active:translate-y-px">{k}</button>)}
      </div>
    </div>
  );
}

export function VhfComm() {
  const m = useMip();
  const step = (key: "comAct" | "comStby", d: 1 | -1) => m.set({ [key]: clamp(m[key] + d * 5, 11800, 13695) } as Partial<typeof m>);
  const win = (v: number) => (
    <div className="relative rounded-[3px] border-2 border-[#1b1d20] bg-[#e9e6dc] px-2 py-0.5 text-center font-mono text-[17px] font-bold tabular-nums text-[#111]">
      {fmtFreq(v)}
    </div>
  );
  return (
    <div className={cn(PLATE2, "w-[250px] p-2")}>
      <Screws />
      <div className="flex items-center justify-between px-2"><span className={cn(LEGEND, "text-[7px]")}>VHF COMM · SIM ONLY</span>
        <button type="button" onClick={() => m.set({ comAct: m.comStby, comStby: m.comAct })} className="rounded-[2px] border border-[#15171a] bg-[#d8d4c4] px-2 py-px font-mono text-[8px] font-bold text-[#222] shadow-[0_2px_2px_rgba(0,0,0,.6)] active:translate-y-px">TFR</button>
        <span className="w-8" />
      </div>
      <div className="mt-1 flex items-center justify-around">{win(m.comAct)}{win(m.comStby)}</div>
      <div className="mt-1 flex items-end justify-around">
        <TuneKnob size={38} onStep={(d) => step("comAct", d)} />
        <div className="flex flex-col items-center gap-0.5"><span className={cn(LEGEND, "text-[6px]")}>COMM</span><PushButton label="TEST" onPress={() => m.set({ comTest: true })} onRelease={() => m.set({ comTest: false })} className={m.comTest ? "brightness-150" : ""} /></div>
        <TuneKnob size={38} onStep={(d) => step("comStby", d)} />
      </div>
    </div>
  );
}

export function VoiceRecorder() {
  const s = useSim();
  const d = useDerived();
  const eraseStartedAt = useRef<number | null>(null);
  const eraseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (eraseTimer.current) clearTimeout(eraseTimer.current); }, []);
  const pressErase = () => {
    const allowed = d.cvrPowered && d.dcPower && s.wow && s.parkingBrake && !s.faults.cvrFailure;
    eraseStartedAt.current = allowed ? Date.now() : null;
    if (!allowed) s.patch({ cvrErase: false }, "CVR ERASE inhibited — requires ground, parking brake, DC power and an operative recorder.");
  };
  const releaseErase = () => {
    const started = eraseStartedAt.current;
    eraseStartedAt.current = null;
    if (started === null) return;
    if (Date.now() - started < 2000) { s.patch({ cvrErase: false }, "CVR ERASE — hold the pushbutton for at least 2 seconds."); return; }
    s.patch({ cvrErase: true, cvrMemoryErased: false }, "CVR bulk erase running — trainer indication for an 8-second erase interval.");
    if (eraseTimer.current) clearTimeout(eraseTimer.current);
    eraseTimer.current = setTimeout(() => s.patch({ cvrErase: false }, "CVR bulk erase interval complete."), 8000);
  };
  return (
    <div className={cn(PLATE2, "w-[250px] p-2")}>
      <Screws />
      <div className="flex items-center justify-around">
        <span className="relative size-[54px] rounded-full border-4 border-[#7a4a2a] bg-[radial-gradient(circle,#8a5a38_0 30%,#3a2a20 32% 100%)] shadow-[inset_0_0_8px_#000]" title="area microphone" />
        <div className="relative size-[56px] rounded-full border-4 border-[#c9ccd0] bg-[#d8d6cc] shadow-[inset_0_0_6px_rgba(0,0,0,.4)]">
          <span className="absolute bottom-[10px] left-1/2 h-[22px] w-[2px] origin-bottom bg-[#222] transition-transform duration-300" style={{ transform: `translateX(-50%) rotate(${d.cvrPowered && s.cvrTest ? 40 : -45}deg)` }} />
        </div>
        <div className="flex flex-col items-center gap-0.5"><PushButton label="TEST" onPress={() => s.patch({ cvrTest: true }, "CVR TEST")} onRelease={() => s.patch({ cvrTest: false })} /><PushButton label="ERASE" onPress={pressErase} onRelease={releaseErase} /></div>
      </div>
      <div className="mt-1 flex items-center justify-between px-2"><span className={cn(LEGEND, "text-[6px]")}>HEADSET 600 OHMS</span><Cap size={16} /></div>
      <div className={cn(LEGEND, "mt-0.5 text-center text-[7px]")}>COCKPIT VOICE RECORDER</div>
    </div>
  );
}

export function WxRadar() {
  const m = useMip(useShallow((st) => ({ radarGain: st.radarGain, radarMode: st.radarMode, radarRange: st.radarRange, radarTilt: st.radarTilt, set: st.set })));
  return (
    <div className={cn(PLATE2, "w-[250px] p-2")}>
      <Screws />
      <div className="flex items-start justify-around">
        <Knob size={26} min={0} max={6} step={1} value={m.radarRange} onChange={(v) => m.set({ radarRange: v })} ticks={[...WXR_RANGES]} label="RANGE" compact />
        <Knob size={26} min={-15} max={15} step={1} value={m.radarTilt} onChange={(v) => m.set({ radarTilt: v })} label={`TILT ${m.radarTilt}`} compact />
        <Knob size={26} min={0} max={1} value={m.radarGain} onChange={(v) => m.set({ radarGain: v < 0.08 ? 0 : v })} ticks={["PRESET", "MAX"]} label="GAIN" compact />
      </div>
      <WxrScope className="relative mx-auto mt-1 h-[104px] w-[150px] rounded-[6px] border-4 border-[#1b2028] shadow-[inset_0_0_14px_#000]" />
      <div className="mt-1 flex gap-1">
        {([["STBY", 1], ["WX", 2], ["CYC", 3], ["MAP", 4]] as const).map(([l, i]) => (
          <button key={l} type="button" aria-pressed={m.radarMode === i} onClick={() => m.set({ radarMode: m.radarMode === i ? 0 : i })} className={cn("flex-1 rounded-[2px] border border-[#15171a] py-[2px] font-mono text-[7px] font-bold", m.radarMode === i ? "bg-[#14161a] text-[#7fe8a0]" : "bg-[#3a3e43] text-[#e6e1d2]")}>{l}</button>
        ))}
      </div>
      <div className={cn(LEGEND, "mt-1 text-center text-[7px]")}>SPERRY PRIMUS 90</div>
    </div>
  );
}

const XPDR_MODES = ["STBY", "ALT OFF", "ALT ON", "TEST"];
export function Transponder() {
  const m = useMip(useShallow((st) => ({ atcSel: st.atcSel, set: st.set, xpdrCode: st.xpdrCode, xpdrMode: st.xpdrMode })));
  const d = useDerivedPick("dcPower");
  const [ident, setIdent] = useState(false);
  const pair = (k: 0 | 2, dir: 1 | -1) => {
    const c = m.xpdrCode.padStart(4, "0");
    const cur = parseInt(c.slice(k, k + 2), 8);
    const nxt = (cur + dir + 64) % 64;
    const s2 = nxt.toString(8).padStart(2, "0");
    m.set({ xpdrCode: c.slice(0, k) + s2 + c.slice(k + 2) });
  };
  return (
    <div className={cn(PLATE2, "w-[250px] p-2")}>
      <Screws />
      <div className="flex items-center justify-between px-1">
        <Knob size={30} min={0} max={3} step={1} value={m.xpdrMode} onChange={(v) => m.set({ xpdrMode: v })} ticks={XPDR_MODES} compact />
        <div className="rounded-[3px] border-2 border-[#1b1d20] bg-[#6a1a14] px-2 py-1 font-mono text-[16px] font-bold tabular-nums text-[#ff7a5a] shadow-[inset_0_0_8px_#000]">{d.dcPower ? m.xpdrCode : "----"}</div>
        <div className="flex flex-col items-center gap-0.5"><Annun label="ATC FAIL" on={d.dcPower && m.xpdrMode === 3} tone="amber" small /><span className={cn(LEGEND, "text-[6px]")}>ATC</span></div>
      </div>
      <div className="mt-1 flex items-center justify-around">
        <TuneKnob size={36} onStep={(dd) => pair(0, dd)} />
        <PushButton label="IDENT" active={ident} onPress={() => { setIdent(true); setTimeout(() => setIdent(false), 3000); }} />
        <TuneKnob size={36} onStep={(dd) => pair(2, dd)} />
      </div>
      <div className="mt-1 flex items-center justify-between px-3">
        <Toggle on={m.atcSel === 1} onChange={(v) => m.set({ atcSel: v ? 1 : 2 })} upLabel="1" downLabel="2" label="ATC" />
        <span className={cn(LEGEND, "text-[7px]")}>XPNDR · {XPDR_MODES[m.xpdrMode]}</span>
      </div>
    </div>
  );
}

export function AtDisengage() {
  const [down, setDown] = useState(false);
  return (
    <button type="button" onPointerDown={() => setDown(true)} onPointerUp={() => setDown(false)} onPointerLeave={() => setDown(false)} aria-label="Autothrottle disengage"
      className={cn("flex h-[86px] w-[150px] items-center justify-center rounded-[26px] border border-[#8a8470] bg-[linear-gradient(180deg,#f3efe2,#cfc8b0_60%,#a39c86)] font-mono text-[10px] font-bold leading-tight text-[#3a3a3a] shadow-[0_4px_8px_rgba(0,0,0,.6)] active:translate-y-px", down && "brightness-90")}>
      A/T<br />DISENGAGE
    </button>
  );
}

function CaptainLower() {
  const s = useSimPick("ltPanelCapt", "ltPanelPed", "patch");
  const m = useMip(useShallow((st) => ({ floodCapt: st.floodCapt, set: st.set })));
  return (
    <div className="flex items-center gap-4">
      <div className="flex size-[130px] items-center justify-center rounded-full border-[6px] border-[#2a2e33] bg-[#14171a] shadow-[inset_0_0_14px_#000]"><Vent size={96} /></div>
      <div className="flex flex-col gap-4"><Cap size={44} /><Cap size={44} /></div>
      <div className={cn(PLATE2, "flex items-center gap-4 px-4 py-3")}>
        <Screws />
        <Knob size={44} value={s.ltPanelCapt} onChange={(v) => s.patch({ ltPanelCapt: +v.toFixed(2) })} label="PANEL" ticks={["OFF", "BRIGHT"]} />
        <Knob size={44} value={s.ltPanelPed} onChange={(v) => s.patch({ ltPanelPed: +v.toFixed(2) })} label="BACKGROUND" ticks={["OFF", "BRIGHT"]} />
        <div className="flex flex-col items-center gap-1"><span className={cn(LEGEND, "text-[7px]")}>INSTR COMP</span><button type="button" aria-label="Instrument comparator lamp test" onPointerDown={() => m.set({ compTest: true })} onPointerUp={() => m.set({ compTest: false })} onPointerLeave={() => m.set({ compTest: false })} className="size-[34px] rounded-full border-4 border-[#8a8f95] bg-[radial-gradient(circle_at_35%_30%,#2c2f33,#050607)] active:translate-y-px" /><span className={cn(LEGEND, "text-[7px]")}>TEST</span></div>
      </div>
      <div className={cn(PLATE2, "px-4 py-3")}><Screws /><Knob size={44} value={m.floodCapt} onChange={(v) => m.set({ floodCapt: +v.toFixed(2) })} label="AFCS FLOOD" ticks={["OFF", "BRIGHT"]} /></div>
      <div className="h-[44px] w-[96px]"><Placard className="text-[8px]">W/S FAIL<br />PUSH TO TEST</Placard></div>
    </div>
  );
}

function FoLower() {
  const s = useSimPick("ltPanelFo", "patch");
  return (
    <div className="flex items-center justify-end gap-4">
      <div className={cn(PLATE2, "px-4 py-3")}><Screws /><Knob size={44} value={s.ltPanelFo} onChange={(v) => s.patch({ ltPanelFo: +v.toFixed(2) })} label="PANEL" ticks={["OFF", "BRIGHT"]} /></div>
      <div className="flex flex-col gap-4"><Cap size={44} /><Cap size={44} /></div>
      <div className="flex size-[130px] items-center justify-center rounded-full border-[6px] border-[#2a2e33] bg-[#14171a] shadow-[inset_0_0_14px_#000]"><Vent size={96} /></div>
    </div>
  );
}

/** Controls that exist in the simulation but have no spot in the photographs: HYD A / B lamps, NWS alternate, ground-prox flap inhibit, F/O flood, foot air, GPWS test. */
function MiscControls() {
  const m = useMip(useShallow((st) => ({ fail: st.fail, floodFo: st.floodFo, footAirCapt: st.footAirCapt, footAirFo: st.footAirFo, gpwsInhibit: st.gpwsInhibit, gpwsTest: st.gpwsTest, nwsAlt: st.nwsAlt, set: st.set })));
  const d = useDerivedPick("dcPower", "hydALow", "hydBLow");
  const pw = d.dcPower;
  return (
    <div className={cn(PLATE2, "flex flex-wrap items-center justify-around gap-4 p-2")}>
      <Screws />
      <span className={cn(LEGEND, "text-[7px]")}>OTHER SYSTEM CONTROLS</span>
      <Annun label="HYD A" on={pw && d.hydALow} small className="w-12" />
      <Annun label="HYD B" on={pw && d.hydBLow} small className="w-12" />
      <Toggle label="NOSE WHEEL STEER" on={m.nwsAlt} onChange={(v) => m.set({ nwsAlt: v })} upLabel="ALT" downLabel="NORM" />
      <Annun label={<>NWS<br />ALT</>} on={pw && m.nwsAlt} tone="green" small className="w-12" />
      <Toggle guarded label="GND PROX FLAP" on={!m.gpwsInhibit} onChange={(v) => m.set({ gpwsInhibit: !v })} upLabel="NORM" downLabel="INHIBIT" />
      <Annun label={<>FLAP<br />INHIBIT</>} on={pw && m.gpwsInhibit} small className="w-12" />
      <div className="flex flex-col items-center gap-1">
        <span className={cn(LEGEND, "text-[6px]")}>GROUND PROXIMITY</span>
        <div className="flex gap-1"><Annun label="GPWS INOP" on={pw && (m.gpwsInhibit || m.gpwsTest)} small className="w-12" /><Annun label="PULL UP" on={pw && m.gpwsTest} tone="red" small className="w-10" /></div>
        <div className="flex gap-1"><PushButton label="TEST" onPress={() => m.set({ gpwsTest: true })} onRelease={() => m.set({ gpwsTest: false })} /><PushButton label="INHIBIT" active={m.gpwsInhibit} onPress={() => m.set({ gpwsInhibit: !m.gpwsInhibit })} /></div>
      </div>
      <Knob size={40} value={m.floodFo} onChange={(v) => m.set({ floodFo: +v.toFixed(2) })} label="F/O FLOOD" ticks={["OFF", "BRT"]} />
      <RoundBtn label={<>CAPT<br />FOOT AIR</>} on={m.footAirCapt} onClick={() => m.set({ footAirCapt: !m.footAirCapt })} />
      <RoundBtn label={<>F/O<br />FOOT AIR</>} on={m.footAirFo} onClick={() => m.set({ footAirFo: !m.footAirFo })} />
      <div className="flex w-full flex-wrap items-center justify-center gap-1 border-t border-[#1b2028] pt-2">
        <span className={cn(LEGEND, "mr-2 text-[7px]")}>INSTRUMENT FAULTS (flag shows only when its system fails)</span>
        {(Object.keys(m.fail) as (keyof MipFail)[]).map((k) => (
          <button key={k} type="button" aria-pressed={m.fail[k]} onClick={() => m.set({ fail: { ...m.fail, [k]: !m.fail[k] } })} className={cn("rounded-[2px] border px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase", m.fail[k] ? FLAG : "border-[#555a60] bg-[#0b0c0d] text-[#8a8f95]")}>{k}</button>
        ))}
      </div>
    </div>
  );
}

function LowerStrip() {
  return (
    <div className="space-y-2">
      <div className="grid items-start gap-3" style={{ gridTemplateColumns: "1100px 1fr 1000px" }}>
        <div className={cn(PLATE2, "p-3")}><Screws /><CaptainLower /></div>
        <div />
        <div className={cn(PLATE2, "p-3")}><Screws /><FoLower /></div>
      </div>
      <MiscControls />
    </div>
  );
}

export function MainInstrumentPanel() {
  const wrap = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);
  const [zoom, setZoom] = useState<"fit" | 1 | 1.5>("fit");
  const [h, setH] = useState(1400);
  useEffect(() => {
    const upd = () => {
      const w = wrap.current?.clientWidth || DESIGN_W;
      setFit(Math.min(1, (w - 18) / DESIGN_W));
      setH(inner.current?.offsetHeight || 1400);
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
          <div className="font-display text-[10px] uppercase tracking-[.18em] text-[#b9af98]">MAIN INSTRUMENT PANEL · 737-200 (RP-C8009 / N267AU)</div>
          <div className="font-display text-lg font-semibold text-fg">Interactive instrument panel — every control is live</div>
        </div>
        <div className="flex items-center gap-1">
          <span className="mr-1 font-mono text-[8px] uppercase text-subtle">Size</span>
          {([["fit", "FIT"], [1, "100%"], [1.5, "150%"]] as const).map(([z, l]) => (
            <button key={String(z)} type="button" onClick={() => setZoom(z)} className={cn("rounded border px-2 py-1 font-mono text-[9px]", zoom === z ? "border-accent/70 bg-accent/10 text-accent" : "border-border bg-inset text-subtle")}>{l}</button>
          ))}
        </div>
      </div>
      <div ref={wrap} data-scaled-panel className="max-h-[85vh] overflow-auto panel-scroll rounded-lg border border-[#343a42] bg-[#121417] p-2">
        <div style={{ width: DESIGN_W * scale, height: h * scale }}>
          <div ref={inner} style={{ width: DESIGN_W, transform: `scale(${scale})`, transformOrigin: "top left" }}>
            <Panel />
          </div>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-muted">Turn the battery on for displays and lights (unpowered, the instrument flags show as on the aircraft). Gear lever, flaps, autobrake, antiskid, hydraulic / brake pressure, engine dials and air-data instruments follow the live simulation; clocks, selectors, radios, test keys and brightness knobs are local. Click left / right of a selector knob to step it.</p>
    </section>
  );
}
