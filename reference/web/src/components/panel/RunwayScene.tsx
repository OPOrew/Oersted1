import { useEffect, useRef, useState } from "react";
import { useSim } from "@/lib/sim/store";
import { useMip } from "@/lib/sim/mipLocal";
import { useSituation } from "@/lib/sim/situation";
import { usePhase, V_SPEEDS } from "@/lib/sim/flightPhases";
import { RWY } from "@/lib/sim/radionav";
import { MARKERS, markerKeyed, type MarkerId } from "@/lib/sim/markerBeacons";
import { cn } from "@/lib/utils";

/**
 * Runway view (side elevation): the aircraft taxis to the end of the runway, accelerates, rotates, lifts off and retracts the gear; on an ILS it
 * flies the 3 deg beam through the OUTER / MIDDLE / INNER markers (lamps flash and the tone plays when SOUND is on) and lands and brakes on the runway.
 * It is a VISUALISATION of the live simulation only: ground speed, altitude, pitch, gear and flaps come from the same stores as the instruments, and the
 * position along the runway is the integral of the simulated ground speed. Horizontal and vertical scales differ — schematic, not to scale.
 */
const C = { sky1: "#0b1b2b", sky2: "#17324b", grass: "#14301f", rwy: "#2f343a", line: "#d8dde2", dim: "#7b8794", txt: "#c5cdd5", green: "#3dd68c", amber: "#e0a84a", cyan: "#5cc8ff", red: "#e24b4b" };
const NM_FT = 6076.12;
const KT_FPS = 1.6878;
const RWY_FT = 12260; // RPLL 06/24 (3,737 m): runway length used for the drawing
const VBW = 640, VBH = 214, GY = 150; // viewBox and ground line

type Mode = "takeoff" | "flight" | "approach" | "rollout";
interface View {
  mode: Mode; xFt: number; dist: number; agl: number; pitch: number; gear: number; gs: number; cas: number; flaps: number; flapPos: number; spin: number;
  phase: string; banner: string; keyed: Record<MarkerId, boolean>; recv: Record<MarkerId, boolean>; flying: boolean;
  alt: number; vsFpm: number; fromRoll: boolean; tod: number; zoom: number;
}
const INIT: View = { mode: "takeoff", xFt: 400, dist: 99, agl: 0, pitch: 0, gear: 1, gs: 0, cas: 0, flaps: 1, flapPos: 1, spin: 0, phase: "NO PLAN", banner: "", keyed: { om: false, mm: false, im: false }, recv: { om: false, mm: false, im: false }, flying: false, alt: 0, vsFpm: 0, fromRoll: false, tod: 0, zoom: 0.034 };

/**
 * Side view of a 737-200 (nose to the right), drawn to scale from the real proportions (length 30.5 m = 100 units, fuselage 3.76 m = 12.3 units):
 * long slim fuselage with the upswept tail, swept fin, low swept wing, JT8D pods slung under the wing with only ~0.5 m ground clearance, short gear.
 * Origin = ground contact of the main wheels; the whole aircraft pitches about them. Gear scales into the belly as it retracts.
 */
/** Flap position transmitter: needle = trailing-edge flap position (0-40 units), the lever detent is shown beside it. */
function FlapGauge({ pos, lever, x, y }: { pos: number; lever: number; x: number; y: number }) {
  const R = 22, cx = 28, cy = 30;
  const pt = (u: number, r: number) => { const th = Math.PI - (Math.max(0, Math.min(40, u)) / 40) * Math.PI; return [cx + r * Math.cos(th), cy - r * Math.sin(th)] as const; };
  const detents = [0, 1, 2, 5, 10, 15, 25, 30, 40];
  const [nx, ny] = pt(pos, R - 3);
  const moving = Math.abs(pos - lever) > 0.6;
  return (
    <g transform={`translate(${x},${y})`} fontFamily="ui-monospace, monospace">
      <rect x={0} y={0} width={56} height={46} rx={4} fill="#0b0f13" stroke="#2a323a" opacity={0.92} />
      <path d={`M${pt(0, R)[0]},${pt(0, R)[1]} A${R},${R} 0 0 1 ${pt(40, R)[0]},${pt(40, R)[1]}`} fill="none" stroke="#3d4650" strokeWidth={1} />
      {detents.map((u) => { const a = pt(u, R), b = pt(u, R - (u === 0 || u === 5 || u === 15 || u === 30 || u === 40 ? 5 : 3)); const lab = pt(u, R + 0);
        return <g key={u}><line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#9aa6b2" strokeWidth={0.8} />{[0, 5, 15, 30, 40].includes(u) && <text x={pt(u, R - 9)[0]} y={pt(u, R - 9)[1] + 1.5} fontSize={4.5} fill="#9aa6b2" textAnchor="middle">{u}</text>}</g>; })}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={moving ? "#f2b84b" : "#e8eef4"} strokeWidth={1.4} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={2} fill="#e8eef4" />
      <text x={cx} y={cy + 8} fontSize={5} fill="#9aa6b2" textAnchor="middle">FLAPS</text>
      <text x={cx} y={cy + 15} fontSize={6} fill={moving ? "#f2b84b" : "#e8eef4"} textAnchor="middle">{pos.toFixed(1)}{moving ? " ▸ " + lever : ""}</text>
    </g>
  );
}

function Airliner({ gear, pitch, flaps, spin = 0 }: { gear: number; pitch: number; flaps: number; spin?: number }) {
  const g = Math.max(0, Math.min(1, gear));
  const f = Math.min(5, flaps * 0.13);
  return (
    <g transform={`scale(1.35) translate(0,-12) rotate(${-pitch} -2 12)`}>
      {g > 0.04 && (
        <g transform={`translate(0,6.1) scale(1,${g}) translate(0,-6.1)`}>
          <rect x={-2.6} y={6} width={1.2} height={4.4} fill="#8c969f" />
          <rect x={33.4} y={6} width={1.2} height={4.2} fill="#8c969f" />
          {([[-3.1, 10.1, 1.9, "#15181b"], [-1.0, 10.1, 1.9, "#1b1f23"], [34, 10.3, 1.7, "#15181b"]] as const).map(([wx, wy, wr, fill], i) => (
            <g key={i}>
              <circle cx={wx} cy={wy} r={wr} fill={fill} stroke="#6d7780" strokeWidth={0.5} />
              <line x1={wx - wr * 0.75} x2={wx + wr * 0.75} y1={wy} y2={wy} stroke="#9aa6b2" strokeWidth={0.45} transform={`rotate(${spin + i * 40} ${wx} ${wy})`} />
              <circle cx={wx + wr * 0.55} cy={wy} r={0.28} fill="#d8dee4" transform={`rotate(${spin + i * 40} ${wx} ${wy})`} />
            </g>
          ))}
        </g>
      )}
      {/* tailplane (edge-on) and wing seen from slightly below, behind the fuselage */}
      <path d="M-48,-1.6 L-34,0 L-34,1.5 L-49,-0.2 Z" fill="#b9c2ca" stroke="#7d8790" strokeWidth={0.3} />
      <path d="M10,3.8 L-6,3.8 L-27,9.4 L-19,9.4 Z" fill="#c9d0d7" stroke="#7d8790" strokeWidth={0.4} />
      {f > 0 && <path d={`M-8,4.6 L-25,9 L-25,${9 + f} L-8,${4.6 + f * 0.5} Z`} fill="#8d97a1" />}
      {/* fuselage */}
      <path d="M-50,-1.5 C-44,-4 -38,-6.1 -30,-6.1 L30,-6.1 C40,-6.1 47,-3.5 50,1 C47,4.5 41,6.1 33,6.1 L-22,6.1 C-33,6.1 -43,2 -50,-1.5 Z" fill="url(#ac-body)" stroke="#8a949d" strokeWidth={0.5} />
      <path d="M-45,1.4 L38,0.4 L38,2.1 L-44,3.1 Z" fill="#1f6fb5" opacity={0.95} />
      {Array.from({ length: 21 }, (_, k) => <rect key={k} x={-26 + k * 2.55} y={-3.3} width={1.1} height={1.6} rx={0.3} fill="#25303a" />)}
      <path d="M37,-4 L43.2,-3.3 L44.5,-1.5 L37.6,-1.7 Z" fill="#1a2530" />
      <line x1={40.3} y1={-3.7} x2={41} y2={-1.6} stroke="#7d8790" strokeWidth={0.4} />
      <rect x={28.5} y={-4.6} width={3.2} height={6.8} rx={0.5} fill="none" stroke="#9aa4ad" strokeWidth={0.4} />
      {/* fin with rudder line, and the engine pod hung under the wing leading edge */}
      <path d="M-27,-6.1 L-42,-24 L-48.5,-24 L-46,-6.1 Z" fill="#1f6fb5" stroke="#16507f" strokeWidth={0.4} />
      <line x1={-44.5} y1={-22} x2={-43.2} y2={-7} stroke="#3b8fd0" strokeWidth={0.4} />
      <rect x={3} y={6.3} width={20.5} height={4.1} rx={2} fill="url(#ac-pod)" stroke="#6f7983" strokeWidth={0.5} />
      <ellipse cx={23.3} cy={8.35} rx={0.9} ry={1.9} fill="#2a3138" />
      <path d="M3,7.2 L0.4,8.2 L3,9.4 Z" fill="#7c868f" />
    </g>
  );
}

function Runway({ x0, y = GY, pxPerFt, lenFt, label }: { x0: number; y?: number; pxPerFt: number; lenFt: number; label: string }) {
  const w = lenFt * pxPerFt;
  const ticks = Math.floor(lenFt / 2000);
  return (
    <g>
      <rect x={x0} y={y} width={w} height={9} fill={C.rwy} />
      <rect x={x0} y={y} width={w} height={1.2} fill="#4d555d" />
      {Array.from({ length: Math.floor(lenFt / 400) }, (_, k) => <rect key={k} x={x0 + 90 * pxPerFt + k * 400 * pxPerFt} y={y + 4} width={200 * pxPerFt} height={1.2} fill={C.line} opacity={0.8} />)}
      {Array.from({ length: 7 }, (_, k) => <rect key={k} x={x0 + 14 * pxPerFt + k * 24 * pxPerFt} y={y + 1.5} width={1.6} height={6} fill={C.line} />)}
      {pxPerFt >= 0.03 && Array.from({ length: Math.floor(lenFt / 150) + 1 }, (_, k) => <circle key={`l${k}`} cx={x0 + k * 150 * pxPerFt} cy={y - 0.8} r={0.75} fill="#ffeaa8" opacity={0.95} />)}
      {pxPerFt >= 0.03 && Array.from({ length: Math.floor(lenFt / 1000) - 1 }, (_, k) => { const bx = x0 + (k + 1) * 1000 * pxPerFt; return <g key={`b${k}`}><line x1={bx} x2={bx} y1={y - 1} y2={y - 4} stroke="#6d7780" strokeWidth={0.5} /><rect x={bx - 4} y={y - 12} width={8} height={8} rx={0.8} fill="#0b0f13" stroke="#cfd6dc" strokeWidth={0.5} /><text x={bx} y={y - 6} textAnchor="middle" fontSize={5.5} fontWeight={700} fill="#ffd84a">{Math.round((lenFt - (k + 1) * 1000) / 1000)}</text></g>; })}
      <text x={x0 + 130 * pxPerFt} y={y + 8} fontSize={7} fill={C.line} opacity={0.85}>{label}</text>
      {Array.from({ length: ticks + 1 }, (_, k) => (
        <g key={k}><line x1={x0 + k * 2000 * pxPerFt} x2={x0 + k * 2000 * pxPerFt} y1={y + 9} y2={y + 13} stroke={C.dim} strokeWidth={0.8} /><text x={x0 + k * 2000 * pxPerFt} y={y + 23} textAnchor="middle" fontSize={8} fill={C.dim}>{k * 2}</text></g>
      ))}
      <text x={x0 + w} y={y + 23} textAnchor="end" fontSize={8} fill={C.dim}> ×1000 ft</text>
    </g>
  );
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * Math.max(0, Math.min(1, k));
const mix = (c1: [number, number, number], c2: [number, number, number], k: number) => `rgb(${c1.map((v, i) => Math.round(lerp(v, c2[i], k))).join(",")})`;
const mod = (n: number, m: number) => ((n % m) + m) % m;
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

export function RunwayScene() {
  const [v, setV] = useState<View>(INIT);
  const st = useRef({ mode: "takeoff" as Mode, xFt: 400, agl: 0, pitch: 0, gear: 1, groundAlt: 0, last: 0, vrAt: 0, v1At: 0, gearUpAt: 0, tdAt: 0, prevGear: "DN", prevAlt: 0, vs: 0, fromRoll: false, zoom: 0.034, spin: 0, spinRate: 0 });

  useEffect(() => {
    let raf = 0;
    const loop = (nowMs: number) => {
      raf = requestAnimationFrame(loop);
      const s = st.current;
      if (nowMs - s.last < 50) return;
      const dt = s.last ? Math.min(1.5, (nowMs - s.last) / 1000) : 0.05;
      s.last = nowMs;
      const sim = useSim.getState() as unknown as Record<string, unknown>;
      const mip = useMip.getState();
      const sit = useSituation.getState();
      const phase = usePhase.getState().phase;
      const wow = !!sim.wow;
      const alt = Number(sim.psFlightAltFt ?? 0) || 0;
      const cas = Number(sim.psFlightCasKt ?? 0) || 0;
      const gs = Math.max(0, Number(sim.groundSpeedKt ?? 0) || 0);
      const flaps = Number(sim.flaps ?? 0) || 0;
      const gearLever = String(sim.gear ?? "DN");
      const crs = (RWY.crs * Math.PI) / 180;
      const along = sit.x * Math.sin(crs) + sit.y * Math.cos(crs); // NM past the RPLL 06 threshold
      const dist = -along;
      if (wow) s.groundAlt = alt;
      const aglNow = Math.max(0, alt - s.groundAlt);
      const onIls = mip.navOn && mip.navTuned === "ILS" && mip.navScene === "RPLL06" && sit.flying;
      let banner: string;

      /* mode machine */
      const prev = s.mode;
      if (!wow && onIls && dist > -0.4 && dist < 14) s.mode = "approach";
      else if (wow && (prev === "approach" || prev === "rollout" || phase === "LAND" || phase === "ROLLOUT")) {
        if (prev !== "rollout") { s.mode = "rollout"; s.xFt = Math.max(0, along * NM_FT) + 600; s.tdAt = nowMs; }
      } else if (wow) {
        if (prev !== "takeoff") { s.mode = "takeoff"; s.xFt = 400; s.fromRoll = false; s.vs = 0; }
      } else {
        if (prev === "takeoff") s.fromRoll = true; // lifted off from this runway
        if (prev === "rollout") s.fromRoll = false; // go-around
        s.mode = "flight";
      }

      /* distance flown = integral of the simulated ground speed (cruise uses true speed, so the sky really moves) */
      if (s.mode === "takeoff") {
        if (phase === "READY" || phase === "NO PLAN") s.xFt = 400;
        else s.xFt += gs * KT_FPS * dt;
      } else if (s.mode === "rollout") s.xFt += gs * KT_FPS * dt;
      else if (s.mode === "flight") s.xFt += Math.max(gs, cas) * KT_FPS * dt;

      /* smoothed visual state */
      /* One continuous attitude with a limited pitch rate (rotation ~3 deg/s), so nothing snaps or swings back at lift-off:
       *  - on the runway: level until VR, then rotate to 10 deg;
       *  - after a takeoff roll: flight-path angle (from the COMMANDED vertical speed, which is smooth) + angle of attack, never below the rotation attitude;
       *  - any other flight: the instrument-panel attitude. */
      const climbOut = !wow && s.fromRoll && (phase === "TAKEOFF" || phase === "CLIMB") && aglNow < 3000;
      let pitchGoal: number;
      if (wow) {
        // Gradual rotation: start targeting a modest pitch only after VR, and build slowly
        pitchGoal = s.mode === "takeoff" && gs >= V_SPEEDS.vr ? 7 : 0;
      } else if (climbOut) {
        const vsCmdFpm = Math.max(0, Number(sim.psFlightVsFpm ?? 0) || 0);
        const gammaDeg = (Math.asin(Math.min(0.3, vsCmdFpm / 60 / Math.max(60, cas * 1.688))) * 180) / Math.PI;
        const aoaDeg = Math.max(1.5, Math.min(10, 2.5 + (250 - cas) / 25));
        pitchGoal = Math.max(7, Math.min(15, gammaDeg + aoaDeg));
      } else pitchGoal = Math.max(-6, Math.min(15, mip.attCapt.pitch));
      // Slower pitch rate so the nose rises smoothly instead of snapping up
      const pitchRate = pitchGoal > s.pitch ? 1.6 : 1.2; // deg/s nose up / nose down
      s.pitch += Math.max(-pitchRate * dt, Math.min(pitchRate * dt, pitchGoal - s.pitch));
      /* wheel spin: follows ground speed on the runway, then runs down after lift-off until the gear retracts */
      const spinTarget = wow || aglNow < 3 ? gs * 5 : 0;
      s.spinRate += (spinTarget - s.spinRate) * Math.min(1, dt * (wow || aglNow < 3 ? 8 : 0.7));
      s.spin = (s.spin + s.spinRate * dt) % 360;
      s.agl += (aglNow - s.agl) * Math.min(1, dt * 6);
      const gearTarget = gearLever === "DN" ? 1 : 0;
      s.gear += Math.sign(gearTarget - s.gear) * Math.min(Math.abs(gearTarget - s.gear), dt * 0.6);
      if (!wow) { const inst = ((alt - s.prevAlt) / Math.max(dt, 0.02)) * 60; s.vs += (inst - s.vs) * Math.min(1, dt * 1.5); } else s.vs = 0;
      s.prevAlt = alt;

      /* event banners */
      if (s.mode === "takeoff" && wow && gs >= V_SPEEDS.v1 && !s.v1At) s.v1At = nowMs;
      if (s.mode === "takeoff" && wow && gs >= V_SPEEDS.vr && !s.vrAt) s.vrAt = nowMs;
      if (wow && gs < 5) { s.v1At = 0; s.vrAt = 0; s.gearUpAt = 0; }
      if (s.mode === "flight" && s.prevGear === "DN" && gearLever !== "DN") s.gearUpAt = nowMs;
      s.prevGear = gearLever;
      const vsTxt = `${s.vs >= 0 ? "+" : "−"}${fmt(Math.abs(s.vs))} FPM`;
      if (s.mode === "takeoff") {
        if (s.v1At && nowMs - s.v1At < 3500 && !s.vrAt) banner = `V1 ${V_SPEEDS.v1}`;
        else if (s.vrAt && nowMs - s.vrAt < 4500) banner = `ROTATE · VR ${V_SPEEDS.vr}`;
        else if (wow && gs < 1) banner = phase === "READY" ? "LINED UP · PRESS TAKEOFF" : "ON THE RUNWAY";
        else banner = `TAKEOFF ROLL · ${Math.round(gs)} KT`;
      } else if (s.mode === "flight") {
        if (s.gearUpAt && nowMs - s.gearUpAt < 4000) banner = "POSITIVE RATE · GEAR UP";
        else banner = `${phase === "NO PLAN" || phase === "READY" ? "AIRBORNE" : phase} · ${fmt(alt)} FT · ${Math.round(cas)} KT · ${vsTxt}`;
      } else if (s.mode === "approach") {
        banner = dist > 10 ? `FINAL · ${dist.toFixed(1)} NM · G/S SIGNAL FROM 10 NM` : `ILS · ${dist.toFixed(1)} NM · ${Math.round(aglNow)} FT`;
      } else banner = nowMs - s.tdAt < 3000 ? "TOUCHDOWN" : gs > 1 ? `ROLLOUT · ${Math.round(gs)} KT` : "STOPPED";

      /* Zoom: the whole 16,000 ft strip at 0.034 px/ft made a 3,000 ft takeoff roll only ~100 px - the airspeed climbed but the
       * aircraft looked parked. On the runway we zoom in ~3.5x so ground speed is visibly in proportion; once airborne the
       * view eases back out to the wide scale as the aircraft climbs away. */
      const ZOOM_WIDE = 0.034, ZOOM_ROLL = 0.2;
      const zoomTarget = s.mode === "takeoff" || s.mode === "rollout" || (s.mode === "flight" && s.fromRoll) ? ZOOM_ROLL : ZOOM_WIDE;
      s.zoom += (zoomTarget - s.zoom) * Math.min(1, dt * 2.5);

      const now = nowMs / 1000;
      const recv = { om: !!mip.markers?.om, mm: !!mip.markers?.mm, im: !!mip.markers?.im };
      setV({
        mode: s.mode, xFt: s.xFt, dist, agl: s.agl, pitch: s.pitch, gear: s.gear, gs, cas, flaps, flapPos: Number(sim.flapPos ?? flaps) || 0, spin: s.spin, phase, banner, alt, vsFpm: s.vs, fromRoll: s.fromRoll, tod: 0, zoom: s.zoom,
        recv, keyed: { om: recv.om && markerKeyed("om", now), mm: recv.mm && markerKeyed("mm", now), im: recv.im && markerKeyed("im", now) }, flying: !wow,
      });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* ── geometry ── */
  const pxPerFt = v.zoom;
  const x0 = 74;
  const VS = 0.045; // px per ft, vertical
  const W2 = VBW + 240;
  const followX = 230 / pxPerFt; // the camera lets the aircraft drift ~230 px along the screen before it starts to follow
  const camX = Math.max(0, v.xFt - followX);
  /* After a takeoff roll the view never zooms: vertical scale = horizontal scale, so the climb angle on screen is the real one.
   * The aircraft rises up the screen; once it reaches ~80 px above the ground line the camera follows it upward (ground drops away). */
  const VSG = v.mode === "flight" && v.fromRoll ? pxPerFt : VS;
  const camAlt = Math.max(0, v.agl - 80 / VSG);
  const groundY = GY + camAlt * VSG;
  const acX = x0 + (v.xFt - camX) * pxPerFt;
  const acY = groundY - v.agl * VSG;
  const absAlt = v.alt;
  const hi = Math.min(1, absAlt / 42000);
  const skyTop = mix([23, 50, 75], [4, 8, 14], hi);
  const skyLow = mix([44, 78, 106], [10, 18, 32], hi);
  const showGround = groundY < VBH + 4;
  const showRunway = v.mode === "takeoff" || v.mode === "rollout" || (v.mode === "flight" && v.fromRoll && v.xFt < RWY_FT + 3000);

  const dMax = 13;
  const pxPerNm = 520 / dMax;
  const thrX = 556;
  const ax = thrX - v.dist * pxPerNm;
  const gsPx = (nm: number) => Math.tan((RWY.gsDeg * Math.PI) / 180) * nm * NM_FT * 0.028;
  const aglApp = Math.min(130, v.agl * 0.028);

  const clouds = Array.from({ length: 44 }, (_, i) => {
    const a = 1100 + i * 900 + ((i * 197) % 420); // altitude of the cloud base (AGL)
    const base = (i * 211.3) % W2;
    const par = 2 + (i % 4) * 0.7; // nearer layers slide past faster
    return { a, sx: mod(base - v.xFt * pxPerFt * par, W2) - 120, sy: groundY - a * VSG, s: 0.7 + (i % 5) * 0.18, o: Math.max(0.08, 0.3 - a / 160000) };
  }).filter((c) => c.sy > -30 && c.sy < VBH + 10);
  const stars = Array.from({ length: 26 }, (_, i) => ({ x: (i * 97.3) % VBW, y: (i * 41.7) % 120, r: 0.5 + (i % 3) * 0.35 }));
  const streaks = Array.from({ length: 6 }, (_, i) => ({ sx: mod(i * 131 - v.xFt * pxPerFt * 5, W2) - 100, y: 30 + ((i * 53) % 110) }));
  const rulerStep = v.mode === "flight" && v.fromRoll ? 500 : 1000;
  const rulerLo = Math.floor(Math.max(0, camAlt - 200) / rulerStep) * rulerStep;
  const rulerTicks = Array.from({ length: Math.ceil(VBH / VSG / rulerStep) + 2 }, (_, i) => rulerLo + i * rulerStep).filter((a) => groundY - a * VSG > 4 && groundY - a * VSG < VBH - 4 && a > 0);
  const title = v.mode === "approach" ? "ILS final" : v.mode === "rollout" ? "landing roll" : v.mode === "takeoff" ? "takeoff" : v.phase === "CLIMB" ? "climb" : v.phase === "CRUISE" ? "cruise" : v.phase === "DESCENT" ? "descent" : "airborne";

  return (
    <div className="mt-2 rounded border border-border bg-surface p-2">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
        <div className="font-display text-[9px] uppercase tracking-[.14em] text-subtle">Runway view · {title}</div>
        <div className={cn("rounded border px-2 py-0.5 font-mono text-[9px] uppercase", v.banner.startsWith("V1") || v.banner.startsWith("ROTATE") || v.banner.startsWith("POSITIVE") || v.banner === "TOUCHDOWN" ? "border-amber-500/60 bg-amber-950/30 text-amber-200" : "border-border text-fg")}>{v.banner}</div>
      </div>
      <svg viewBox={`0 0 ${VBW} ${VBH}`} className="w-full rounded border border-[#2a323a]" role="img" aria-label="Side view of the aircraft on the runway, climbing out or on the ILS glide slope">
        <defs>
          <linearGradient id="rwy-sky" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={skyTop} /><stop offset="1" stopColor={skyLow} /></linearGradient>
          <linearGradient id="ac-body" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#f6f8fa" /><stop offset="0.55" stopColor="#dde3e8" /><stop offset="1" stopColor="#a9b3bd" /></linearGradient>
          <linearGradient id="ac-pod" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#c3cad1" /><stop offset="1" stopColor="#7d8791" /></linearGradient>
        </defs>
        <rect x={0} y={0} width={VBW} height={VBH} fill="url(#rwy-sky)" />
        {v.mode !== "approach" && hi > 0.35 && stars.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#cfe3ff" opacity={(hi - 0.35) * 1.2} />)}

        {v.mode !== "approach" && (
          <g>
            {clouds.map((c, i) => (
              <g key={i} opacity={c.o + 0.1} transform={`translate(${c.sx},${c.sy}) scale(${c.s})`}>
                <ellipse cx={0} cy={0} rx={34} ry={8} fill="#e8eef4" /><ellipse cx={-18} cy={2} rx={20} ry={7} fill="#e8eef4" /><ellipse cx={16} cy={-3} rx={22} ry={8} fill="#e8eef4" />
              </g>
            ))}
            {v.flying && v.cas > 120 && streaks.map((k, i) => <line key={i} x1={k.sx} x2={k.sx + 18} y1={k.y} y2={k.y} stroke="#cfe0f0" strokeWidth={0.8} opacity={0.12} />)}
            {showGround && (
              <g>
                <rect x={0} y={groundY} width={VBW} height={Math.max(0, VBH - groundY)} fill={C.grass} />
                {Array.from({ length: 22 }, (_, k) => { const gx = mod(k * 1000 * pxPerFt * 2 - camX * pxPerFt, 22 * 1000 * pxPerFt * 2); return <line key={k} x1={gx} x2={gx} y1={groundY} y2={Math.min(VBH, groundY + 60)} stroke="#1b4129" strokeWidth={0.8} />; })}
                {showRunway && <Runway x0={x0 - camX * pxPerFt} y={groundY} pxPerFt={pxPerFt} lenFt={RWY_FT} label={v.mode === "rollout" ? "RWY 06" : "RWY 06 →"} />}
              </g>
            )}
            {camAlt > 0 && rulerTicks.map((a) => <g key={a}><line x1={4} x2={13} y1={groundY - a * VSG} y2={groundY - a * VSG} stroke={C.dim} strokeWidth={0.8} /><text x={16} y={groundY - a * VSG + 3} fontSize={8} fill={C.dim}>{fmt(a)}</text></g>)}
            {showRunway && camAlt === 0 && v.agl < 700 && <ellipse cx={acX + v.agl * 0.1} cy={groundY - 1} rx={Math.max(10, 40 - v.agl * 0.045)} ry={1.8} fill="#000" opacity={Math.max(0, 0.38 * (1 - v.agl / 700))} />}
            <g transform={`translate(${acX},${acY})`}><Airliner gear={v.gear} pitch={v.pitch} flaps={v.flapPos} spin={v.spin} /></g>
            {v.mode === "flight" && v.fromRoll && v.agl > 20 && <text x={VBW - 8} y={VBH - 8} textAnchor="end" fontSize={9} fill={C.txt}>{`PITCH ${Math.round(v.pitch)}° · PATH ${(Math.asin(Math.max(-0.3, Math.min(0.3, v.vsFpm / 60 / Math.max(60, v.cas * 1.688)))) * 180 / Math.PI).toFixed(0)}°`}</text>}
            {v.flying && camAlt === 0 && <line x1={acX - 2} x2={acX - 2} y1={acY + 2} y2={groundY} stroke={C.dim} strokeWidth={0.8} strokeDasharray="2 3" />}
            {v.flying && camAlt === 0 && v.agl > 40 && <text x={acX + 8} y={(acY + groundY) / 2} fontSize={9} fill={C.txt}>{fmt(v.agl)} ft</text>}
            {v.mode === "takeoff" && !v.flying && v.gs > 2 && Array.from({ length: 5 }, (_, k) => <line key={k} x1={acX - 76 - k * 9} x2={acX - 86 - k * 9} y1={groundY - 8 - (k % 2) * 3} y2={groundY - 8 - (k % 2) * 3} stroke="#9fb0bf" strokeWidth={1} opacity={0.5 - k * 0.08} />)}
          </g>
        )}

        {v.mode === "approach" && (
          <g>
            <rect x={0} y={GY} width={VBW} height={VBH - GY} fill={C.grass} />
            <Runway x0={thrX} y={GY} pxPerFt={0.0042} lenFt={RWY_FT} label="RWY 06" />
            <text x={thrX} y={GY + 34} textAnchor="middle" fontSize={8} fill={C.txt}>threshold</text>
            {[2, 4, 6, 8, 10, 12].map((nm) => <g key={nm}><line x1={thrX - nm * pxPerNm} x2={thrX - nm * pxPerNm} y1={GY} y2={GY + 4} stroke={C.dim} /><text x={thrX - nm * pxPerNm} y={GY + 14} textAnchor="middle" fontSize={8} fill={C.dim}>{nm}</text></g>)}
            {/* glide slope beam, valid inside 10 NM in this trainer */}
            <path d={`M${thrX},${GY} L${thrX - dMax * pxPerNm},${GY - gsPx(dMax)}`} stroke={C.green} strokeWidth={1.2} opacity={0.35} fill="none" />
            <path d={`M${thrX},${GY} L${thrX - 10 * pxPerNm},${GY - gsPx(10)}`} stroke={C.green} strokeWidth={1.6} fill="none" />
            <text x={thrX - 10 * pxPerNm + 2} y={GY - gsPx(10) - 5} fontSize={8} fill={C.green}>G/S 3° · signal from 10 NM</text>
            {/* marker beacons: post, fan beam and name */}
            {MARKERS.map((mk) => {
              const mx = thrX - mk.distNm * pxPerNm;
              const lit = v.keyed[mk.id];
              return (
                <g key={mk.id}>
                  <path d={`M${mx},${GY} L${mx - 11},${GY - 74} L${mx + 11},${GY - 74} Z`} fill={mk.color} opacity={v.recv[mk.id] ? 0.28 : 0.1} />
                  <rect x={mx - 1.5} y={GY - 6} width={3} height={6} fill={mk.color} />
                  <circle cx={mx} cy={GY - 82} r={5.5} fill={lit ? mk.color : "#12171c"} stroke={mk.color} strokeWidth={1.2} />
                  <text x={mx} y={GY - 93} textAnchor="middle" fontSize={8} fill={mk.color}>{mk.id === "om" ? "OM" : mk.id === "mm" ? "MM" : "IM"}</text>
                </g>
              );
            })}
            <g transform={`translate(${ax},${GY - aglApp})`}><Airliner gear={v.gear} pitch={v.pitch} flaps={v.flapPos} /></g>
            <text x={ax} y={GY - aglApp - 74} textAnchor="middle" fontSize={9} fill={C.txt}>{Math.round(v.agl)} ft</text>
            {/* marker receiver panel */}
            <g transform={`translate(${VBW - 3 * 62 - 4},8)`}>
              {MARKERS.slice().reverse().map((mk, k) => (
                <g key={mk.id} transform={`translate(${k * 62},0)`}>
                  <rect width={56} height={20} rx={3} fill="#0d1217" stroke="#2a323a" />
                  <circle cx={11} cy={10} r={5} fill={v.keyed[mk.id] ? mk.color : "#1b232b"} stroke={mk.color} strokeWidth={1} />
                  <text x={21} y={13} fontSize={9} fill={v.recv[mk.id] ? mk.color : C.dim}>{mk.lamp}</text>
                </g>
              ))}
            </g>
            {(v.recv.om || v.recv.mm || v.recv.im) && (
              <text x={VBW - 12} y={42} textAnchor="end" fontSize={9} fill={C.txt}>
                {MARKERS.filter((mk) => v.recv[mk.id]).map((mk) => `${mk.name} · ${mk.hz} Hz ${mk.morse}`).join("")}
              </text>
            )}
          </g>
        )}
        {(v.mode === "takeoff" || (v.mode === "flight" && v.fromRoll)) && v.agl < 12 && v.pitch > 11 && <text x={VBW / 2} y={20} textAnchor="middle" fontSize={10} fontWeight={700} fill="#ff4d4d">{`TAIL STRIKE LIMIT · PITCH ${Math.round(v.pitch)}°`}</text>}
        <FlapGauge pos={v.flapPos} lever={v.flaps} x={v.mode === "approach" ? 6 : VBW - 62} y={6} />
      </svg>
      <p className="mt-1 text-[8px] leading-snug text-subtle">
        Live from the simulation: ground speed → distance flown, altitude, pitch, gear and flaps; the camera follows the aircraft up and along the route.
        Horizontal and vertical scales differ (schematic). Marker tones (OM 400 Hz · MM 1300 Hz · IM 3000 Hz) play when the page SOUND switch is on;
        marker lamps are on the instrument panel (OUTER · MIDDLE · AIRWAYS).
      </p>
    </div>
  );
}
