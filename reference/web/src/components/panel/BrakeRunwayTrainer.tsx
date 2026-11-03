import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useDerived, useSim } from "@/lib/sim/store";
import { PATCH_END_M, PATCH_START_M, RUNWAY_AIMPOINT_M, RUNWAY_HALF_WIDTH_M, RUNWAY_LENGTH_M } from "@/lib/sim/derive";
import type { RunwayCondition, RunwayPatch } from "@/lib/sim/types";

/**
 * Live landing / rollout trainer for the Brakes / Antiskid tab.
 * Top-down view (same aircraft plan as the Flight Controls diagram): approach ->
 * touchdown -> rollout, DRY / WET / ICY surface plus an icy half-runway patch.
 * Uneven braking or skidding makes the aircraft veer; correct it with the rudder
 * pedals (rudder + nose-wheel steering) or the toe brakes. Physics: sim/derive.ts.
 */

const KEYS = ["li", "lo", "ri", "ro"] as const;
type WheelKey = (typeof KEYS)[number];

// scene scale
const W = 400, H = 440, CX = 200, AC_Y = 320;
const SX = 5.0; // px per metre across the runway
const SY = 3.2; // px per metre along the runway
const K = 0.36; // aircraft icon scale (icon = Flight Controls plan view)
const PIVOT_Y = 180; // icon y of the main gear
const WHEEL_X: Record<WheelKey, number> = { lo: -47, li: -36, ri: 36, ro: 47 };
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const approachF = (v: number, t: number, step: number) => (v < t ? Math.min(t, v + step) : Math.max(t, v - step));

const btn = "rounded border border-border bg-inset px-2 py-2 text-[9px] font-display uppercase tracking-wide text-fg hover:bg-panel";
const btnOn = "rounded border border-accent bg-panel px-2 py-2 text-[9px] font-display uppercase tracking-wide text-fg";

type Hold = { pushL: boolean; pushR: boolean; toeL: boolean; toeR: boolean };

function RudderPedal({ side, push, toe, onPush, onToe }: {
  side: "L" | "R"; push: number; toe: number;
  onPush: (down: boolean, id: number) => void; onToe: (down: boolean, id: number) => void;
}) {
  const bind = (fn: (d: boolean, id: number) => void) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => { e.preventDefault(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ } fn(true, e.pointerId); },
    onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => fn(false, e.pointerId),
    onPointerCancel: (e: ReactPointerEvent<HTMLDivElement>) => fn(false, e.pointerId),
    onLostPointerCapture: (e: ReactPointerEvent<HTMLDivElement>) => fn(false, e.pointerId),
    onContextMenu: (e: ReactMouseEvent) => e.preventDefault(),
  });
  const pushing = push > 0.04;
  return (
    <div className="flex flex-col items-stretch gap-1">
      <div className="text-center font-mono text-[8px] uppercase text-subtle">{side === "L" ? "LEFT" : "RIGHT"} PEDAL</div>
      {/* toe brake pad (top of the pedal) */}
      <div
        {...bind(onToe)}
        style={{ touchAction: "none", userSelect: "none", background: `linear-gradient(to top, rgba(224,168,74,${0.15 + toe * 0.7}) ${toe * 100}%, #0e1116 ${toe * 100}%)` }}
        className={`flex h-12 items-center justify-center rounded-t-xl border-2 ${toe > 0.05 ? "border-caution" : "border-border"} font-display text-[9px] uppercase tracking-wide text-fg`}
      >
        TOE BRAKE {Math.round(toe * 100)}%
      </div>
      {/* pedal body (push forward = rudder) */}
      <div className="relative h-20 overflow-hidden rounded-b-xl border-2 border-border bg-panel" style={{ borderColor: pushing ? "var(--color-accent)" : undefined }}>
        <div
          {...bind(onPush)}
          style={{ touchAction: "none", userSelect: "none", transform: `translateY(${-push * 16}px)` }}
          className="absolute inset-x-0 bottom-0 top-3 flex flex-col items-center justify-center gap-1 rounded-b-lg bg-[repeating-linear-gradient(0deg,#2a303a_0,#2a303a_5px,#20252d_5px,#20252d_10px)] font-display text-[9px] uppercase tracking-wide text-fg"
        >
          <span>▲</span>
          <span>PUSH · RUDDER {side}</span>
          <span className="font-mono text-[8px] text-subtle">{Math.round(push * 100)}%</span>
        </div>
      </div>
    </div>
  );
}

export function BrakeRunwayTrainer() {
  const s = useSim();
  const d = useDerived();
  const marks = useRef<{ x: number; p: number; k: WheelKey }[]>([]);
  const hold = useRef<Hold>({ pushL: false, pushR: false, toeL: false, toeR: false });
  const own = useRef({ rud: false, l: false, r: false });
  const ptr = useRef(new Map<number, keyof Hold>()); // active pointer -> pedal control it is holding
  const latch = useRef(false);
  const [latchOn, setLatchOn] = useState(false);
  const press = (key: keyof Hold, down: boolean, id: number) => {
    if (latch.current) { if (down) hold.current[key] = !hold.current[key]; return; } // tap to latch / tap again to release
    if (down) { ptr.current.set(id, key); hold.current[key] = true; }
    else if (ptr.current.get(id) === key) { ptr.current.delete(id); hold.current[key] = false; }
  };

  const gs = s.groundSpeedKt;
  const phase = s.rwyPhase;
  const live = phase === "APPROACH" || phase === "ROLLOUT" || phase === "OVERRUN";
  const hdg = s.rwyHdgDeg;
  const lat = s.rwyLatM;

  useEffect(() => {
    const rel = (e: PointerEvent) => {
      const k = ptr.current.get(e.pointerId);
      if (k) { hold.current[k] = false; ptr.current.delete(e.pointerId); }
    };
    const clearAll = () => { if (!latch.current) { hold.current = { pushL: false, pushR: false, toeL: false, toeR: false }; ptr.current.clear(); } };
    window.addEventListener("pointerup", rel);
    window.addEventListener("pointercancel", rel);
    window.addEventListener("blur", clearAll);
    return () => { window.removeEventListener("pointerup", rel); window.removeEventListener("pointercancel", rel); window.removeEventListener("blur", clearAll); };
  }, []);

  // ---- pedal input: ramp while held, spring back on release -------------------
  useEffect(() => {
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const h = hold.current, o = own.current, st = useSim.getState();
      const upd: Record<string, number> = {};
      const tgt = (h.pushR ? 1 : 0) - (h.pushL ? 1 : 0);
      if (h.pushL || h.pushR) o.rud = true;
      if (o.rud) {
        const nv = approachF(st.rudderPedal, tgt, (tgt !== 0 ? 2.4 : 8) * dt);
        if (nv !== st.rudderPedal) upd.rudderPedal = nv;
        if (tgt === 0 && nv === 0) o.rud = false;
      }
      if (h.toeL) o.l = true;
      if (h.toeR) o.r = true;
      if (o.l) {
        const nv = approachF(st.leftBrakePedal, h.toeL ? 1 : 0, (h.toeL ? 2.2 : 7) * dt);
        if (nv !== st.leftBrakePedal) upd.leftBrakePedal = nv;
        if (!h.toeL && nv === 0) o.l = false;
      }
      if (o.r) {
        const nv = approachF(st.rightBrakePedal, h.toeR ? 1 : 0, (h.toeR ? 2.2 : 7) * dt);
        if (nv !== st.rightBrakePedal) upd.rightBrakePedal = nv;
        if (!h.toeR && nv === 0) o.r = false;
      }
      if (Object.keys(upd).length) useSim.setState(upd);
    }, 33);
    return () => clearInterval(id);
  }, []);

  const slip = (k: WheelKey) => (gs > 8 && s.wow ? Math.max(0, 1 - s.wheelSpeeds[k] / gs) : 0);
  const status = (k: WheelKey) => {
    const p = s.wheelBrakePressures[k];
    const sl = slip(k);
    if (!s.wow || phase === "IDLE") return { t: "—", c: "text-subtle", hot: 0 };
    if (gs > 20 && sl > 0.5 && p > 150) return { t: "SKID", c: "text-warn", hot: 3 };
    if (gs > 8 && sl > 0.5) return { t: "SPIN-UP", c: "text-subtle", hot: 0 };
    if (sl > 0.12 && p > 100 && d.antiskidOperational) return { t: "A/S MOD", c: "text-caution", hot: 2 };
    if (p > 100) return { t: "BRAKING", c: "text-ok", hot: 1 };
    return { t: "ROLLING", c: "text-subtle", hot: 0 };
  };

  // ---- scene geometry ---------------------------------------------------------
  const acPos = s.rwyPosM;
  const yOf = (p: number) => AC_Y + (acPos - p) * SY;
  const acX = clamp(CX + lat * SX, -30, W + 30);
  const alt = phase === "APPROACH" ? s.rwyAltFt : 0;
  const scaleUp = 1 + alt / 900;
  const rwyL = CX - RUNWAY_HALF_WIDTH_M * SX, rwyR = CX + RUNWAY_HALF_WIDTH_M * SX;

  // tyre marks: recorded where a wheel is skidding
  useEffect(() => {
    if (phase === "IDLE" || phase === "APPROACH") { marks.current = []; return; }
    const r = (hdg * Math.PI) / 180;
    KEYS.forEach((k) => {
      if (gs > 20 && s.wow && slip(k) > 0.5 && s.wheelBrakePressures[k] > 150) {
        const dx = WHEEL_X[k] * K * Math.cos(r), dy = WHEEL_X[k] * K * Math.sin(r);
        const x = clamp(CX + lat * SX, -30, W + 30) + dx;
        const p = acPos - dy / SY;
        const last = [...marks.current].reverse().find((m) => m.k === k);
        if (!last || Math.abs(last.p - p) > 0.35) marks.current.push({ x, p, k });
      }
    });
    if (marks.current.length > 1600) marks.current = marks.current.slice(-1600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.rwyPosM, s.rwyLatM, phase]);

  const start = (o: { runway?: RunwayCondition; patch?: RunwayPatch; autobrake?: 0 | 1 | 2 | 3 | 4; asOn?: boolean; note: string }) => {
    marks.current = [];
    hold.current = { pushL: false, pushR: false, toeL: false, toeR: false };
    const ab = o.autobrake ?? s.autobrake;
    s.patch({
      battery: true, gen1: true, gen2: true, bleed1: true, bleed2: true,
      lever1: true, lever2: true, throttle1: 0, throttle2: 0, n2_1: 62, n2_2: 62, n1_1: 35, n1_2: 35, start1: "OFF", start2: "OFF",
      engHyd1: true, engHyd2: true, elecHyd1: true, elecHyd2: true,
      hydAPress: 3000, hydBPress: 3000,
      gear: "DN", gearPos: 1, noseGearPos: 1, leftMainGearPos: 1, rightMainGearPos: 1,
      parkingBrake: false, groundSenseTest: false, airborneTest: true, wow: false,
      runway: o.runway ?? s.runway, rwyPatch: o.patch ?? s.rwyPatch,
      autobrake: ab,
      antiskidInbd: o.asOn ?? s.antiskidInbd, antiskidOutbd: o.asOn ?? s.antiskidOutbd,
      speedBrake: ab > 0 ? "ARMED" : s.speedBrake,
      autobrakeTestTimer: 0, autobrakeRtoArmed: false,
      leftBrakePedal: 0, rightBrakePedal: 0, rudderPedal: 0, tiller: 0,
      groundSpeedKt: 138, rwyPosM: -1800, rwyAltFt: 361, rwyPhase: "APPROACH",
      rwyLatM: 0, rwyHdgDeg: 0, rwyTrackDeg: 0, rwyYawRate: 0,
      wheelSpeeds: { li: 0, lo: 0, ri: 0, ro: 0 }, wheelBrakePressures: { li: 0, lo: 0, ri: 0, ro: 0 },
      actualDecel: 0, tireWear: { li: 0, lo: 0, ri: 0, ro: 0 }, rwyNote: "ON FINAL — 138 KT",
      timeScale: 1,
    }, o.note);
  };
  const reset = () => {
    marks.current = [];
    s.patch({
      rwyPhase: "IDLE", rwyPosM: -1800, rwyAltFt: 0, groundSpeedKt: 0, airborneTest: false, wow: true, parkingBrake: true,
      wheelSpeeds: { li: 0, lo: 0, ri: 0, ro: 0 }, wheelBrakePressures: { li: 0, lo: 0, ri: 0, ro: 0 },
      actualDecel: 0, tireWear: { li: 0, lo: 0, ri: 0, ro: 0 }, rwyNote: "",
      leftBrakePedal: 0, rightBrakePedal: 0, rudderPedal: 0,
      rwyLatM: 0, rwyHdgDeg: 0, rwyTrackDeg: 0, rwyYawRate: 0,
    }, "Landing trainer reset.");
  };

  // ---- derived readouts / coaching -------------------------------------------
  const veerDir = hdg < -0.8 ? "LEFT" : hdg > 0.8 ? "RIGHT" : "";
  const driftDir = lat < -1 ? "LEFT" : lat > 1 ? "RIGHT" : "";
  const rolling = phase === "ROLLOUT" || phase === "OVERRUN";
  const veering = rolling && gs > 3 && (Math.abs(hdg) > 2.5 || Math.abs(lat) > 4);
  const veerTone = Math.abs(lat) > 15 || Math.abs(hdg) > 9 ? "text-warn" : "text-caution";
  const fix = (hdg > 0 || (hdg === 0 && lat > 0)) ? "LEFT" : "RIGHT";
  const rudderCmd = s.rudderPedal;
  const pedalV = Math.max(s.leftBrakePedal, s.rightBrakePedal);

  const hints: string[] = [];
  if (phase === "ROLLOUT" || phase === "APPROACH") {
    if (s.autobrake > 0 && (!s.antiskidInbd || !s.antiskidOutbd)) hints.push("AUTOBRAKE unavailable — either antiskid channel OFF removes automatic braking.");
    else if (s.autobrake > 0 && s.speedBrake !== "ARMED" && phase === "APPROACH") hints.push("Autobrake needs the speedbrake ARMED to arm for landing.");
    if (phase === "ROLLOUT" && s.autobrake === 0 && pedalV < 0.05 && gs > 30) hints.push("No braking applied — hold a TOE BRAKE or select an autobrake mode before touchdown.");
    if (phase === "ROLLOUT" && !d.antiskidOperational && pedalV > 0.3 && gs > 30) hints.push("Antiskid OFF — nothing releases pressure, so wheels lock on a low-friction surface.");
    if (phase === "ROLLOUT" && d.antiskidModulating && KEYS.some((k) => slip(k) > 0.12)) hints.push("Antiskid modulating: pressure is released on any wheel that slows relative to ground speed.");
  }
  if (veering) hints.push(`Veering ${veerDir || driftDir}: less braking on the ${(veerDir || driftDir) === "RIGHT" ? "left" : "right"} side. Apply ${fix} rudder (or ${fix} toe brake) to bring the nose back to the centreline.`);
  if (s.rwyPatch !== "NONE" && rolling && gs > 20) hints.push(`Icy patch on the ${s.rwyPatch.toLowerCase()} half: those wheels skid, the other side keeps braking, so the aircraft pulls toward the ${s.rwyPatch === "LEFT" ? "right" : "left"}.`);
  if (KEYS.some((k) => s.tireWear[k] > 0.9)) hints.push("FLAT SPOT / TIRE BURST RISK — wheel skidded while locked.");
  if (rolling && gs > 20 && gs < 60 && d.noseWheelSteeringAvailable) hints.push("Below ~60 kt the rudder loses effect — nose-wheel steering (pedals, ±7°) and toe brakes take over.");

  const banner = s.rwyNote;
  const skidding = KEYS.some((k) => status(k).t === "SKID");
  const bannerTone = phase === "OVERRUN" || /BEYOND|EXCURSION|OFF THE/.test(banner) ? "text-warn" : phase === "STOPPED" ? "text-ok" : skidding ? "text-warn" : "text-caution";

  // dashed centreline positions
  const dashes: number[] = [];
  for (let p = Math.ceil((acPos - 60) / 30) * 30; p < acPos + 130; p += 30) if (p > 20 && p < RUNWAY_LENGTH_M - 40) dashes.push(p);
  const distMarks = [150, 300, 450, 600, 900, 1200, 1500].filter((m) => yOf(m) > -20 && yOf(m) < H + 20);

  // per-wheel glow helpers (icon units)
  const wheelFill = (k: WheelKey) => { const h = status(k).hot; return h === 3 ? "#e24b4b" : h === 2 ? "#e0a84a" : h === 1 ? "#3dd68c" : "#9aa4ae"; };
  const rudderDeg = -clamp(d.controlSurfaces.rudder, -1, 1) * 30;
  const nwsAngle = d.noseWheelSteeringAngle;
  const gearSpoilers = s.spoilerPos > 0.5;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 font-mono text-[9px] uppercase">
        <span className="shrink-0 text-subtle">PHASE <span className="text-fg">{phase}</span></span>
        <span className={`text-right ${bannerTone}`}>{banner}</span>
      </div>

      {/* ---------- top-down scene ---------- */}
      <div className="overflow-hidden rounded-lg border border-border bg-inset">
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="Top-down landing and rollout view">
          <defs>
            <linearGradient id="bt-metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#66727e" /><stop offset="1" stopColor="#252b32" /></linearGradient>
            <pattern id="bt-ice" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#9fd0ea" opacity="0.35" /><line x1="0" y1="0" x2="0" y2="8" stroke="#d8f0fb" strokeWidth="2" opacity="0.5" /></pattern>
            <clipPath id="bt-clip"><rect width={W} height={H} /></clipPath>
          </defs>
          <g clipPath="url(#bt-clip)">
            {/* grass */}
            <rect width={W} height={H} fill="#18211b" />
            {/* runway pavement (threshold -> end) */}
            <rect x={rwyL} y={yOf(RUNWAY_LENGTH_M)} width={rwyR - rwyL} height={yOf(0) - yOf(RUNWAY_LENGTH_M)} fill="#2c3138" />
            {s.runway === "WET" && <rect x={rwyL} y={yOf(RUNWAY_LENGTH_M)} width={rwyR - rwyL} height={yOf(0) - yOf(RUNWAY_LENGTH_M)} fill="#3d5f86" opacity={0.35} />}
            {s.runway === "ICY" && <rect x={rwyL} y={yOf(RUNWAY_LENGTH_M)} width={rwyR - rwyL} height={yOf(0) - yOf(RUNWAY_LENGTH_M)} fill="url(#bt-ice)" />}
            {/* icy half-runway patch */}
            {s.rwyPatch !== "NONE" && (
              <g>
                <rect x={s.rwyPatch === "LEFT" ? rwyL : CX} y={yOf(PATCH_END_M)} width={CX - rwyL} height={yOf(PATCH_START_M) - yOf(PATCH_END_M)} fill="url(#bt-ice)" stroke="#bfe6f7" strokeDasharray="4 3" strokeOpacity={0.7} />
                <text x={s.rwyPatch === "LEFT" ? rwyL + 4 : CX + 4} y={yOf(PATCH_END_M) + 12} fontSize={8} fill="#d8f0fb" fontFamily="monospace">ICE</text>
              </g>
            )}
            {/* edge lines */}
            <line x1={rwyL + 4} y1={0} x2={rwyL + 4} y2={H} stroke="#e7e2d6" strokeOpacity={0.55} strokeWidth={1.5} />
            <line x1={rwyR - 4} y1={0} x2={rwyR - 4} y2={H} stroke="#e7e2d6" strokeOpacity={0.55} strokeWidth={1.5} />
            {/* centreline */}
            {dashes.map((p) => <rect key={p} x={CX - 1.5} y={yOf(p + 9)} width={3} height={18 * SY} fill="#e7e2d6" opacity={0.8} />)}
            {/* threshold bars + numbers */}
            <g opacity={0.85}>{Array.from({ length: 8 }).map((_, i) => <rect key={i} x={rwyL + 10 + i * ((rwyR - rwyL - 20) / 8)} y={yOf(28)} width={7} height={24 * SY / 3} fill="#e7e2d6" />)}</g>
            {/* aim point + touchdown zone bars */}
            {[RUNWAY_AIMPOINT_M, 150, 450].map((p, i) => <g key={p} opacity={0.75}><rect x={CX - 40} y={yOf(p + 22)} width={6} height={(i === 0 ? 22 : 12) * SY} fill="#e7e2d6" /><rect x={CX + 34} y={yOf(p + 22)} width={6} height={(i === 0 ? 22 : 12) * SY} fill="#e7e2d6" /></g>)}
            {distMarks.map((m) => <text key={m} x={rwyR + 6} y={yOf(m) + 3} fontSize={8} fill="#8b95a1" fontFamily="monospace">{m} m</text>)}
            {/* runway end */}
            <rect x={rwyL} y={yOf(RUNWAY_LENGTH_M) - 3} width={rwyR - rwyL} height={5} fill="#e24b4b" opacity={0.9} />
            <text x={CX} y={yOf(RUNWAY_LENGTH_M) - 8} fontSize={9} textAnchor="middle" fill="#e24b4b" fontFamily="monospace">RUNWAY END</text>

            {/* tyre marks */}
            {marks.current.map((m, i) => { const y = yOf(m.p); return y > -4 && y < H + 4 ? <rect key={i} x={m.x - 1.2} y={y - 1.1} width={2.4} height={2.6} fill="#050607" opacity={0.85} /> : null; })}

            {/* approach shadow */}
            {alt > 0 && (
              <g transform={`translate(${acX + alt * 0.05} ${AC_Y + alt * 0.06}) rotate(${hdg}) scale(${K}) translate(-320 ${-PIVOT_Y})`} opacity={0.3}>
                <path d="M320 50 C302 68 298 92 298 115 L298 300 C298 324 308 338 320 344 C332 338 342 324 342 300 L342 115 C342 92 338 68 320 50 Z" fill="#000" />
                <path d="M298 140 L55 195 L100 222 L298 205 Z M342 140 L585 195 L540 222 L342 205 Z" fill="#000" />
              </g>
            )}

            {/* ---- aircraft: same plan view as the Flight Controls diagram ---- */}
            <g transform={`translate(${acX} ${AC_Y}) rotate(${hdg}) scale(${K * scaleUp}) translate(-320 ${-PIVOT_Y})`} opacity={phase === "IDLE" ? 0.45 : 1}>
              <path d="M298 140 L55 195 L100 222 L298 205 Z" fill="url(#bt-metal)" stroke="#7d8995" strokeWidth={2.5} />
              <path d="M342 140 L585 195 L540 222 L342 205 Z" fill="url(#bt-metal)" stroke="#7d8995" strokeWidth={2.5} />
              <path d="M298 305 L195 322 L215 336 L298 335 Z" fill="#2e353d" stroke="#7d8995" strokeWidth={2.5} />
              <path d="M342 305 L445 322 L425 336 L342 335 Z" fill="#2e353d" stroke="#7d8995" strokeWidth={2.5} />
              {/* spoilers (ground spoilers rise on touchdown) */}
              {[205, 229, 253, 277].map((x) => <rect key={x} x={x} y={190} width={18} height={12} rx={2} fill={gearSpoilers ? "#5fae8f" : "#454f5a"} stroke="#98a3ae" />)}
              {[345, 369, 393, 417].map((x) => <rect key={x} x={x} y={190} width={18} height={12} rx={2} fill={gearSpoilers ? "#5fae8f" : "#454f5a"} stroke="#98a3ae" />)}
              <path d="M320 50 C302 68 298 92 298 115 L298 300 C298 324 308 338 320 344 C332 338 342 324 342 300 L342 115 C342 92 338 68 320 50 Z" fill="url(#bt-metal)" stroke="#7d8995" strokeWidth={2.5} />
              <line x1={320} y1={70} x2={320} y2={330} stroke="#6d7884" strokeWidth={1.5} strokeDasharray="4 4" />
              {/* fin + rudder (swings with rudder pedal input) */}
              <path d="M310 344 L330 344 L320 356 Z" fill="url(#bt-metal)" stroke="#7d8995" strokeWidth={1.5} />
              <g transform={`rotate(${rudderDeg} 320 352)`}><rect x={316.5} y={352} width={7} height={40} rx={2} fill={Math.abs(rudderCmd) > 0.04 ? "#e0a84a" : "#454f5a"} stroke="#98a3ae" /></g>
              {/* nose gear + steering angle */}
              <g transform={`rotate(${clamp(nwsAngle, -78, 78)} 320 100)`}><rect x={314} y={88} width={12} height={24} rx={3} fill={d.noseWheelSteeringAvailable ? "#cdd5dc" : "#6b737c"} stroke="#0e1116" /></g>
              {/* main gear wheels */}
              {KEYS.map((k) => (
                <g key={k}>
                  <rect x={320 + WHEEL_X[k] - 5} y={PIVOT_Y - 15} width={10} height={30} rx={3} fill={wheelFill(k)} stroke="#0e1116" strokeWidth={1.5} />
                  {status(k).hot === 3 && [0, 1, 2].map((i) => <circle key={i} cx={320 + WHEEL_X[k] + (i % 2 ? 6 : -6)} cy={PIVOT_Y + 28 + i * 18} r={8 + i * 5} fill="#d4d4d4" opacity={0.5 - i * 0.14} />)}
                </g>
              ))}
            </g>
            {phase === "IDLE" && <text x={CX} y={AC_Y - 60} fontSize={11} textAnchor="middle" fill="#8b95a1" fontFamily="monospace">SELECT A SCENARIO OR START APPROACH</text>}
            {phase === "APPROACH" && <text x={12} y={20} fontSize={10} fill="#8b95a1" fontFamily="monospace">{`${Math.round(alt)} FT AGL · ${Math.round(gs)} KT`}</text>}

            {/* veer indicator */}
            {veering && <g>
              <rect x={CX - 88} y={10} width={176} height={26} rx={5} fill="#0e1116" opacity={0.85} stroke={Math.abs(lat) > 15 || Math.abs(hdg) > 9 ? "#e24b4b" : "#e0a84a"} />
              <text x={CX} y={27} fontSize={11} textAnchor="middle" fontFamily="monospace" fill={Math.abs(lat) > 15 || Math.abs(hdg) > 9 ? "#e24b4b" : "#e0a84a"}>
                {(veerDir || driftDir) === "LEFT" ? "◀ VEERING LEFT" : "VEERING RIGHT ▶"} · {Math.abs(lat).toFixed(0)} m
              </text>
            </g>}
          </g>
        </svg>
      </div>

      {/* readouts */}
      <div className="grid grid-cols-5 gap-1 font-mono text-[9px] uppercase">
        <span className="rounded border border-border bg-inset px-1 py-1 text-center text-subtle">GS<br /><span className="text-fg">{Math.round(gs)} KT</span></span>
        <span className="rounded border border-border bg-inset px-1 py-1 text-center text-subtle">DECEL<br /><span className="text-fg">{s.actualDecel.toFixed(1)}</span></span>
        <span className="rounded border border-border bg-inset px-1 py-1 text-center text-subtle">HDG<br /><span className={veering ? veerTone : "text-fg"}>{rolling ? `${Math.abs(hdg).toFixed(0)}° ${hdg < -0.5 ? "L" : hdg > 0.5 ? "R" : ""}` : "—"}</span></span>
        <span className="rounded border border-border bg-inset px-1 py-1 text-center text-subtle">OFFSET<br /><span className={Math.abs(lat) > 15 ? "text-warn" : "text-fg"}>{rolling || phase === "STOPPED" ? `${Math.abs(lat).toFixed(0)} m ${lat < -0.5 ? "L" : lat > 0.5 ? "R" : ""}` : "—"}</span></span>
        <span className="rounded border border-border bg-inset px-1 py-1 text-center text-subtle">RWY LEFT<br /><span className={acPos > RUNWAY_LENGTH_M ? "text-warn" : "text-fg"}>{phase === "IDLE" ? "—" : `${Math.max(0, Math.round(RUNWAY_LENGTH_M - acPos))} m`}</span></span>
      </div>

      {/* per-wheel status */}
      <div className="grid grid-cols-4 gap-1">
        {KEYS.map((k) => {
          const st = status(k);
          const ratio = gs > 1 && s.wow ? Math.min(1, s.wheelSpeeds[k] / gs) : 0;
          const wear = s.tireWear[k];
          return (
            <div key={k} className="rounded border border-border bg-inset px-1 py-1 text-center font-mono text-[8px] uppercase">
              <div className="text-[9px] font-semibold text-fg">{k.toUpperCase()}</div>
              <div className="mt-1 h-1.5 overflow-hidden rounded bg-panel"><div className={ratio < 0.5 && s.wow && gs > 20 ? "h-full bg-warn" : "h-full bg-ok"} style={{ width: `${ratio * 100}%` }} /></div>
              <div className="mt-0.5 h-1 overflow-hidden rounded bg-panel"><div className="h-full bg-caution" style={{ width: `${(s.wheelBrakePressures[k] / 3000) * 100}%` }} /></div>
              <div className={`mt-1 ${st.c}`}>{st.t}</div>
              <div className="text-subtle">{Math.round(s.wheelBrakePressures[k])} PSI</div>
              {wear > 0.02 && <div className={wear > 0.9 ? "text-warn" : "text-caution"}>FLAT {Math.round(wear * 100)}%</div>}
            </div>
          );
        })}
      </div>
      <div className="flex gap-3 font-mono text-[8px] uppercase text-subtle"><span><span className="text-ok">■</span> WHEEL SPD / GS</span><span><span className="text-caution">■</span> BRAKE PSI</span></div>

      {/* ---------- rudder pedals with toe brakes ---------- */}
      <div className="rounded-lg border border-border bg-inset p-2">
        <div className="mb-1 flex items-center justify-between font-mono text-[9px] uppercase text-subtle">
          <span>Rudder pedals · toe brakes</span>
          <span className="text-fg">RUDDER {rudderCmd < -0.03 ? "L" : rudderCmd > 0.03 ? "R" : ""} {Math.round(Math.abs(rudderCmd) * 100)}% · NWS {nwsAngle.toFixed(0)}°</span>
        </div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className={`font-mono text-[8px] uppercase ${hold.current.pushL && hold.current.pushR ? "text-caution" : "text-subtle"}`}>{hold.current.pushL && hold.current.pushR ? "BOTH PEDALS PUSHED — RUDDER CANCELS OUT" : "PUSH ONE PEDAL TO YAW THAT WAY"}</span>
          <button className={latchOn ? btnOn : btn} onClick={() => { latch.current = !latch.current; hold.current = { pushL: false, pushR: false, toeL: false, toeR: false }; ptr.current.clear(); setLatchOn(latch.current); }}>Latch {latchOn ? "ON" : "OFF"}</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <RudderPedal side="L" push={Math.max(0, -rudderCmd)} toe={s.leftBrakePedal}
            onPush={(dn, id) => press("pushL", dn, id)} onToe={(dn, id) => press("toeL", dn, id)} />
          <RudderPedal side="R" push={Math.max(0, rudderCmd)} toe={s.rightBrakePedal}
            onPush={(dn, id) => press("pushR", dn, id)} onToe={(dn, id) => press("toeR", dn, id)} />
        </div>
        <p className="mt-1 text-[8px] leading-snug text-subtle">Push a pedal (lower pad) for rudder / nose-wheel steering; press its toe pad to brake that side only. Hold both toe pads for symmetric braking. Two fingers work together (e.g. right pedal push + left toe brake). With one finger or a mouse, turn Latch ON: tap a pad to hold it, tap again to release. Pushing both rudder pads cancels out, like linked pedals.</p>
      </div>

      {hints.length > 0 && (
        <div className="space-y-1">{hints.map((h) => <div key={h} className="rounded border border-border bg-inset px-2 py-1.5 text-[9px] leading-snug text-subtle">{h}</div>)}</div>
      )}

      {/* scenarios */}
      <div className="grid grid-cols-1 gap-1">
        <button className={btn} onClick={() => start({ runway: "DRY", patch: "NONE", autobrake: 2, asOn: true, note: "Scenario: DRY runway, AUTOBRAKE MED, antiskid ON." })}>Dry · autobrake MED · antiskid on</button>
        <button className={btn} onClick={() => start({ runway: "WET", patch: "NONE", autobrake: 3, asOn: true, note: "Scenario: WET runway, AUTOBRAKE MAX — antiskid will modulate." })}>Wet · autobrake MAX · antiskid cycling</button>
        <button className={btn} onClick={() => start({ runway: "DRY", patch: "LEFT", autobrake: 2, asOn: true, note: "Scenario: ICE PATCH on the LEFT half, AUTOBRAKE MED — aircraft will pull right. Correct with LEFT rudder." })}>Ice patch LEFT · autobrake · pulls right</button>
        <button className={btn} onClick={() => start({ runway: "DRY", patch: "RIGHT", autobrake: 0, asOn: false, note: "Scenario: ICE PATCH on the RIGHT half, manual braking, antiskid OFF — wheels lock, aircraft pulls left." })}>Ice patch RIGHT · manual · antiskid OFF</button>
      </div>

      <div className="grid grid-cols-3 gap-1">
        {(["DRY", "WET", "ICY"] as const).map((r) => <button key={r} className={s.runway === r ? btnOn : btn} onClick={() => s.patch({ runway: r }, `Runway surface ${r}.`)}>{r}</button>)}
      </div>
      <div className="grid grid-cols-3 gap-1">
        {(["NONE", "LEFT", "RIGHT"] as const).map((p) => <button key={p} className={s.rwyPatch === p ? btnOn : btn} onClick={() => s.patch({ rwyPatch: p }, `Ice patch: ${p}.`)}>{p === "NONE" ? "No patch" : `Ice ${p}`}</button>)}
      </div>
      <div className="grid grid-cols-3 gap-1">
        <button className={s.speedBrake === "ARMED" ? btnOn : btn} onClick={() => s.patch({ speedBrake: s.speedBrake === "ARMED" ? "DOWN" : "ARMED" }, "Speedbrake lever toggled.")}>Speedbrake {s.speedBrake === "ARMED" ? "ARMED" : s.speedBrake}</button>
        <button className={btn} onClick={() => start({ note: "Landing approach started with current switches." })}>{live ? "Restart" : "Start"} approach</button>
        <button className={btn} onClick={reset}>Reset</button>
      </div>
      <div className="flex items-center justify-between font-mono text-[8px] uppercase text-subtle"><span>Sim speed</span>
        <span className="flex gap-1">{([1, 4, 10] as const).map((ts) => <button key={ts} className={s.timeScale === ts ? btnOn : btn} onClick={() => s.patch({ timeScale: ts }, `Sim speed ×${ts}.`)}>×{ts}</button>)}</span>
      </div>
      <p className="text-[8px] leading-relaxed text-subtle">Improved training model: peak-friction µ-slip curve (peak near 12–15 % slip), pair locked-wheel protection (AMM 32-42), and antiskid modulation that targets the rising side of the curve. Still not a certified performance model. Rudder is aerodynamic (weak below ~60 kt); nose-wheel steering and toe brakes take over at low speed.</p>
    </div>
  );
}
