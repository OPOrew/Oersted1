import { useShallow } from "zustand/react/shallow";
import { useEffect, useState } from "react";
import { type ThreeEvent } from "@react-three/fiber";
import { useSimPick, useDerivedPick } from "@/lib/sim/store";
import { useMip } from "@/lib/sim/mipLocal";
import { useMarkerKeyed } from "@/lib/sim/markerLamps";
import type { MarkerId } from "@/lib/sim/markerBeacons";
import { Drawn, Lens3D, Toggle3D, TONE, text, useCursor, wx, wy, type Tone } from "@/components/panel/MainInstrumentPanel3DControls";

/**
 * 3D MIP milestone 4: lens lights, warning strips, F/D & A/P annunciator panels, instrument comparators,
 * light test key, TAT and the two chronometers. Native meshes + canvas-drawn textures (no SVG reuse).
 * Logic mirrors the 2D panel (TopStrip, AnnPanel, Comparator, LightTestKey, AnalogClock, lens list in Panel()).
 *
 * UNTESTED: written without npm or a browser. Not built here: ApproachProgress lenses (m.apAnn),
 * the HYD / NWS / FLAP INHIBIT / GPWS INOP placards further down the panel, DH lamps.
 */

const F0 = 2064;
const X_SB = 1100;
const RC = 1510 + 204;
const pad2 = (n: number) => String(n).padStart(2, "0");

/** Invisible press pad: onDown on pointer down, onUp on release or when the pointer leaves. */
function Press3D({ x, y, w, h, onDown, onUp }: { x: number; y: number; w: number; h: number; onDown: () => void; onUp?: () => void }) {
  const cur = useCursor();
  return (
    <mesh
      position={[wx(x), wy(y), 0.1]}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); onDown(); }}
      onPointerUp={() => onUp?.()}
      onPointerOver={cur.over}
      onPointerOut={() => { onUp?.(); cur.out(); }}
    >
      <planeGeometry args={[w * 0.01, h * 0.01]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

/* ───────────────────────── chronometer ───────────────────────── */

function Chrono3D({ cx, cy }: { cx: number; cy: number }) {
  const m = useMip();
  const [now, setNow] = useState(() => new Date());
  // display only: elapsed time is advanced by the 2D panel's clocks (kept mounted off-screen)
  useEffect(() => { const t = window.setInterval(() => setNow(new Date()), 1000); return () => window.clearInterval(t); }, []);
  const e = m.clock.elapsed;
  const hh = now.getUTCHours() % 12, mm = now.getUTCMinutes(), ss = now.getUTCSeconds();
  const run = m.clock.running;
  const key = `${hh}:${mm}:${ss}|${e}|${run}`;
  const toggle = () => m.set({ clock: { ...m.clock, running: !m.clock.running } });
  const reset = () => m.set({ clock: { running: false, elapsed: 0 } });
  return (
    <group>
      <Drawn
        x={cx} y={cy} w={121} h={121} z={0.2} drawKey={key}
        draw={(c, w) => {
          const k = w / 100, o = 50 * k;
          const P = (a: number, r: number): [number, number] => [o + r * k * Math.sin(a), o - r * k * Math.cos(a)];
          c.fillStyle = "#15181c"; c.beginPath(); c.arc(o, o, 49 * k, 0, 7); c.fill();
          c.strokeStyle = "#5b6168"; c.lineWidth = 1.5 * k; c.stroke();
          c.fillStyle = "#0b0c0e"; c.beginPath(); c.arc(o, o, 44 * k, 0, 7); c.fill();
          for (let i = 0; i < 60; i++) {
            const a = (i * 6 * Math.PI) / 180;
            const [x1, y1] = P(a, 44), [x2, y2] = P(a, i % 5 === 0 ? 36 : 40);
            c.strokeStyle = "#e8e4d6"; c.lineWidth = (i % 5 === 0 ? 1.4 : 0.6) * k;
            c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
          }
          [[60, 0], [10, 60], [20, 120], [30, 180], [40, 240], [50, 300]].forEach(([n, a]) => {
            const [x, y] = P((a * Math.PI) / 180, 29);
            text(c, String(n), x, y, 5.5 * k, "#e8e4d6");
          });
          c.fillStyle = "#000"; c.fillRect(33 * k, 32 * k, 34 * k, 11 * k);
          if (run) { c.fillStyle = "#0b0c0e"; c.fillRect(34 * k, 33 * k, 12 * k, 9 * k); }
          else if (e > 0) { c.fillStyle = "#f4f1e4"; c.fillRect(34 * k, 33 * k, 6 * k, 9 * k); c.fillStyle = "#0b0c0e"; c.fillRect(40 * k, 33 * k, 6 * k, 9 * k); }
          else { c.fillStyle = "#f4f1e4"; c.fillRect(34 * k, 33 * k, 12 * k, 9 * k); }
          text(c, `${pad2(Math.floor(e / 60) % 100)}:${pad2(e % 60)}`, 57 * k, 37.5 * k, 6 * k, "#f1f1ea");
          text(c, "ET / CHR", o, 60 * k, 4.5 * k, "#9a968a");
          const hand = (deg: number, len: number, lw: number, col: string) => {
            const [x, y] = P((deg * Math.PI) / 180, len);
            c.strokeStyle = col; c.lineWidth = lw * k; c.lineCap = "round";
            c.beginPath(); c.moveTo(o, o); c.lineTo(x, y); c.stroke();
          };
          hand(hh * 30 + mm * 0.5, 20, 2.4, "#f1f1ea");
          hand(mm * 6 + ss * 0.1, 30, 1.6, "#f1f1ea");
          hand(ss * 6, 36, 0.8, "#ff9a3a");
          c.fillStyle = "#2a2d31"; c.beginPath(); c.arc(o, o, 2.6 * k, 0, 7); c.fill();
        }}
      />
      <Press3D x={cx} y={cy} w={90} h={90} onDown={toggle} />
      {/* levers: left = run / stop, right = reset */}
      {([[-52, toggle], [52, reset]] as [number, () => void][]).map(([dx, fn]) => (
        <group key={dx}>
          <mesh position={[wx(cx + dx), wy(cy + 58), 0.2]} rotation={[0, 0, dx < 0 ? 0.35 : -0.35]}>
            <boxGeometry args={[0.28, 0.16, 0.06]} />
            <meshStandardMaterial color="#b9bcc0" roughness={0.35} metalness={0.8} />
          </mesh>
          <Press3D x={cx + dx} y={cy + 58} w={30} h={18} onDown={fn} />
        </group>
      ))}
    </group>
  );
}

/* ───────────────────────── warning strip, annunciator panel, comparator ───────────────────────── */

function TopStrip3D({ x0, w, side }: { x0: number; w: number; side: "L" | "R" }) {
  const s = useSimPick("bleedTrip1", "bleedTrip2", "ltTest", "packTripL", "packTripR");
  const d = useDerivedPick("antiskidInbdOperational", "antiskidOutbdOperational", "dcPower", "eng1Running", "fuelLowPressure1", "fuelLowPressure2", "generator1BusPowered", "generator2BusPowered", "hydALow", "hydBLow", "masterCaution", "oilPressure1");
  const m = useMip(useShallow((st) => ({ lightKey: st.lightKey, masterCautionAck: st.masterCautionAck, recall: st.recall, set: st.set })));
  const pw = !!d.dcPower;
  const L = side === "L";
  const caution = !!d.masterCaution && !m.masterCautionAck;
  const test = !!(pw && (s.ltTest || m.recall || m.lightKey === 2));
  const sys = (on: boolean) => pw && (on || test);
  const ws = [46, 50, 44, 50, 46];
  const gap = (w - 12 - ws.reduce((a, b) => a + b, 0)) / 4;
  const cx: number[] = [];
  let px = x0 + 6;
  ws.forEach((wd) => { cx.push(px + wd / 2); px += wd + gap; });
  const y = 14 + 23;
  const mcOn = pw && (caution || m.recall);
  const ack = () => m.set({ masterCautionAck: true, recall: false });
  // two stacked annunciators per grid (46 x 22 each)
  const stack = (cxx: number, top: [string, boolean], bot: [string, boolean]) => (
    <group>
      <Lens3D x={cxx} y={y - 11.5} w={46} h={21} label={top[0]} on={top[1]} tone="amber" />
      <Lens3D x={cxx} y={y + 11.5} w={46} h={21} label={bot[0]} on={bot[1]} tone="amber" />
    </group>
  );
  return (
    <group>
      {stack(cx[0], [L ? "HYD" : "PACK", sys(L ? d.hydALow || d.hydBLow : s.packTripL || s.packTripR)], [L ? "ELEC" : "BLEED", sys(L ? !d.generator1BusPowered || !d.generator2BusPowered : s.bleedTrip1 || s.bleedTrip2)])}
      {[cx[1], cx[3]].map((xx) => (
        <group key={xx}>
          <Lens3D x={xx} y={y} w={50} h={38} label={"MASTER\nCAUTION"} on={mcOn} tone="amber" />
          <Press3D x={xx} y={y} w={50} h={38} onDown={ack} />
        </group>
      ))}
      <Lens3D x={cx[2]} y={y} w={44} h={34} label="RECALL" on={false} tone="white" />
      <Press3D x={cx[2]} y={y} w={44} h={34} onDown={() => m.set({ recall: true })} onUp={() => { if (useMip.getState().recall) m.set({ recall: false }); }} />
      {stack(cx[4], [L ? "FUEL" : "A/SKID", sys(L ? d.fuelLowPressure1 || d.fuelLowPressure2 : !d.antiskidInbdOperational || !d.antiskidOutbdOperational)], [L ? "ENG" : "DOORS", sys(L ? d.eng1Running && d.oilPressure1 < 13 : false)])}
    </group>
  );
}

function AnnPanel3D({ x0, w, side }: { x0: number; w: number; side: "L" | "R" }) {
  const s = useSimPick("ltTest");
  const d = useDerivedPick("dcPower");
  const m = useMip(useShallow((st) => ({ annTest: st.annTest, lightKey: st.lightKey, set: st.set })));
  const pw = !!d.dcPower;
  const lit = !!(pw && (s.ltTest || m.annTest === 1 || m.lightKey === 2));
  const y0 = 14, h = 164;
  const clear = () => m.set({ masterCautionAck: false });
  return (
    <group>
      <Drawn
        x={x0 + w / 2} y={y0 + h / 2} w={w} h={h} z={0.158} drawKey={`ann|${lit}|${side}`}
        draw={(c, ww, hh) => {
          const cell = (x: number, y: number) => {
            c.fillStyle = lit ? "#e9a93a" : "#16191c"; c.fillRect(x, y, 30, 9);
            c.strokeStyle = lit ? "#ffd27a" : "#1d2023"; c.lineWidth = 0.8; c.strokeRect(x, y, 30, 9);
          };
          const group = (title: string, gx: number) => {
            text(c, title, gx, 9, 7, "#e8e8e0");
            c.fillStyle = "#000"; c.fillRect(gx - 34, 15, 68, 50);
            for (let r = 0; r < 4; r++) { cell(gx - 32, 17 + r * 11); cell(gx + 2, 17 + r * 11); }
          };
          group("F/D & A/P", ww / 2 - 80); group("A/T", ww / 2); group("PDC", ww / 2 + 80);
          text(c, "A/P STATUS", 50, hh - 36, 7, "#e8e8e0");
          c.fillStyle = "#000"; c.fillRect(16, hh - 30, 68, 13);
          cell(18, hh - 28); cell(52, hh - 28);
        }}
      />
      <Lens3D x={x0 + 128} y={y0 + h - 22} w={58} h={26} label="A/P P/RST" on={false} tone="white" />
      <Press3D x={x0 + 128} y={y0 + h - 22} w={58} h={26} onDown={clear} />
      {side === "R" && (
        <group>
          <Lens3D x={x0 + 196} y={y0 + h - 22} w={58} h={26} label="A/T P/RST" on={false} tone="white" />
          <Press3D x={x0 + 196} y={y0 + h - 22} w={58} h={26} onDown={clear} />
        </group>
      )}
      <Toggle3D x={x0 + w - 30} y={y0 + 108} name="TEST" on={m.annTest === 1} upLabel="1" downLabel="2" onChange={(v) => m.set({ annTest: v ? 1 : 0 })} />
    </group>
  );
}

function Comparator3D({ x, y }: { x: number; y: number }) {
  const s = useSimPick("ltTest");
  const d = useDerivedPick("dcPower");
  const m = useMip(useShallow((st) => ({ compTest: st.compTest, lightKey: st.lightKey })));
  const lit = !!(d.dcPower && (s.ltTest || m.compTest || m.lightKey === 2));
  return (
    <Drawn
      x={x + 125} y={y + 28} w={250} h={56} z={0.068} drawKey={`cmp|${lit}`}
      draw={(c, w, h) => {
        c.fillStyle = "#bdb9aa"; c.fillRect(0, 0, w, h);
        text(c, "INSTRUMENT COMPARATOR", w / 2, 8, 9, "#3a3a3a");
        c.fillStyle = "#111"; c.fillRect(3, 15, w - 6, h - 28);
        ["MON\nPWR", "HDG", "PITCH", "ROLL", "GS", "LOC", "ALT"].forEach((l, i) => {
          const cw = (w - 8) / 7;
          c.fillStyle = lit ? TONE.amber : "#0b0c0d"; c.fillRect(4 + i * cw, 16, cw - 1, h - 30);
          text(c, l, 4 + i * cw + cw / 2, 16 + (h - 30) / 2, 6.5, lit ? "#0b0c0d" : "#6b7078");
        });
        text(c, "PUSH TO DIM", w / 2, h - 5, 6, "#3a3a3a");
      }}
    />
  );
}

function LightTestKey3D() {
  const m = useMip(useShallow((st) => ({ lightKey: st.lightKey, set: st.set })));
  const ang = [90, 180, 0][m.lightKey];
  const cx = X_SB + 4 + 41, cy = 60;
  return (
    <group>
      <Drawn
        x={X_SB + 54} y={60} w={100} h={80} z={0.068} drawKey={`ltk|${m.lightKey}`}
        draw={(c, w, h) => {
          c.fillStyle = "#c9c6ba"; c.fillRect(0, 0, w, h);
          text(c, "LIGHT TEST", w / 2, 8, 8, m.lightKey === 2 ? "#000" : "#33362f");
          text(c, "BRT", w - 12, h / 2, 8, m.lightKey === 0 ? "#000" : "#33362f");
          text(c, "DIM", w / 2, h - 7, 8, m.lightKey === 1 ? "#000" : "#33362f");
        }}
      />
      <group position={[wx(cx), wy(cy), 0.1]} rotation={[0, 0, -(ang * Math.PI) / 180]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.03]}>
          <cylinderGeometry args={[0.17, 0.17, 0.05, 32]} />
          <meshStandardMaterial color="#050607" roughness={0.6} metalness={0.4} />
        </mesh>
        <mesh position={[0, 0.095, 0.075]}>
          <cylinderGeometry args={[0.025, 0.025, 0.19, 12]} />
          <meshStandardMaterial color="#c9cbce" roughness={0.3} metalness={0.9} />
        </mesh>
        <mesh position={[0, 0.2, 0.075]}>
          <sphereGeometry args={[0.055, 16, 12]} />
          <meshStandardMaterial color="#e2e4e6" roughness={0.3} metalness={0.9} />
        </mesh>
      </group>
      <Press3D x={cx} y={cy} w={44} h={44} onDown={() => m.set({ lightKey: ((m.lightKey + 1) % 3) as 0 | 1 | 2 })} />
    </group>
  );
}

function Tat3D() {
  const s = useSimPick("ambientTempF");
  const d = useDerivedPick("dcPower");
  const m = useMip(useShallow((st) => ({ fail: st.fail })));
  const pw = !!d.dcPower;
  const tat = ((Number(s.ambientTempF ?? 59) - 32) * 5) / 9;
  const off = !pw || m.fail.tat;
  const val = pw ? `${tat >= 0 ? "+" : "-"}${Math.abs(tat).toFixed(1)}°C` : "";
  return (
    <Drawn
      x={F0 + 83} y={258} w={130} h={120} z={0.2} drawKey={`tat|${val}|${off}`}
      draw={(c, w, h) => {
        c.fillStyle = "#2a2e33"; c.beginPath(); c.ellipse(w / 2, h / 2, w / 2 - 2, h / 2 - 2, 0, 0, 7); c.fill();
        c.strokeStyle = "#6a6e72"; c.lineWidth = 6; c.stroke();
        c.fillStyle = "#3b9fd0"; c.fillRect(w * 0.1, h * 0.3, w * 0.8, h * 0.38);
        text(c, "TAT", w / 2, h * 0.3 + 9, 7, "#06293a");
        text(c, val, w / 2, h * 0.3 + 26, 14, "#06293a");
        if (off) { c.fillStyle = "#e8c13a"; c.fillRect(w * 0.1, h * 0.3, w * 0.8, h * 0.38); text(c, "OFF", w / 2, h * 0.49, 13, "#4a3300"); }
      }}
    />
  );
}

/* ───────────────────────── assembled layer ───────────────────────── */

/** Marker beacon lens: lamp test, or flashing in step with the received marker tone. */
function MarkerLens3D({ id, x, y, w, h, label, test, powered, tone = "amber" }: { id: MarkerId; x: number; y: number; w: number; h: number; label: string; test: boolean; powered: boolean; tone?: Tone }) {
  const keyed = useMarkerKeyed(id, powered);
  return <Lens3D x={x} y={y} w={w} h={h} label={label} on={test || keyed} tone={tone} />;
}

export function MipAnnunciators3D() {
  const s = useSimPick("ltTest");
  const d = useDerivedPick("dcPower", "leExtended", "leTransit", "speedBrakeArmed");
  const m = useMip(useShallow((st) => ({ lightKey: st.lightKey, markerHigh: st.markerHigh, raTest: st.raTest, set: st.set })));
  const pw = !!d.dcPower;
  const test = !!(pw && (s.ltTest || m.raTest || m.lightKey === 2));
  // [x, y, w, h, label, tone, lit]: positions and lit rules copied from Panel() in MainInstrumentPanel.tsx
  const L = (x: number, y: number, w: number, h: number, label: string, on = false, tone: Tone = "amber") => (
    <Lens3D key={`${x}:${y}`} x={x + w / 2} y={y + h / 2} w={w} h={h} label={label} on={on} tone={tone} />
  );
  return (
    <group position={[0, 0, 0.09]}>
      {/* captain side */}
      <TopStrip3D x0={14} w={260} side="L" />
      {L(286, 14, 100, 24, "GPWS")}
      {L(286, 40, 100, 24, "BELOW G/S\nP INHIBIT")}
      {L(690, 30, 76, 44, "F/D\nWINDSHEAR")}
      {L(690, 124, 76, 44, "ALTITUDE\nALERT")}
      <Comparator3D x={428} y={18} />
      <AnnPanel3D x0={774} w={300} side="L" />
      <Chrono3D cx={100.5} cy={580.5} />
      <Drawn x={100} y={504} w={120} h={12} z={0.12} drawKey="chrono-tag-capt" draw={(c, w, h) => text(c, "CHR · ET", w / 2, h / 2, 8, "#d8d8d0")} />

      {/* markers + speed brake lenses */}
      <MarkerLens3D id="im" x={894 + 44} y={430 + 13} w={88} h={26} label="AIRWAYS" test={test} powered={pw} tone="white" />
      <MarkerLens3D id="mm" x={894 + 44} y={458 + 13} w={88} h={26} label="MIDDLE" test={test} powered={pw} />
      <MarkerLens3D id="om" x={894 + 44} y={486 + 13} w={88} h={26} label="OUTER" test={test} powered={pw} tone="blue" />
      <Drawn x={938} y={525} w={90} h={12} z={0.068} drawKey="marker-tag" draw={(c, w, h) => text(c, "MARKER", w / 2, h / 2, 8, "#e8e8e0")} />
      <Toggle3D x={938} y={569} name="" on={m.markerHigh} upLabel="HIGH" downLabel="LOW" onChange={(v) => m.set({ markerHigh: v })} />
      {L(996, 430, 94, 34, "SPEED BRAKE\nARMED", pw && d.speedBrakeArmed, "green")}
      {L(996, 468, 94, 34, "SPEED BRAKE\nDO NOT ARM", test)}

      {/* centre */}
      <LightTestKey3D />

      {/* LE flaps */}
      <Lens3D x={RC + 46} y={219} w={86} h={30} label={"LE FLAPS\nTRANSIT"} on={pw && !!d.leTransit} tone="amber" />
      <Lens3D x={RC + 137} y={219} w={86} h={30} label={"LE FLAPS\nEXT"} on={pw && !!d.leExtended && !d.leTransit} tone="green" />

      {/* first officer side */}
      <TopStrip3D x0={F0 + 690} w={252} side="R" />
      <AnnPanel3D x0={F0 + 10} w={292} side="R" />
      {L(F0 + 308, 14, 76, 36, "F/D\nWINDSHEAR")}
      {L(F0 + 308, 52, 76, 36, "")}
      {L(F0 + 308, 92, 76, 36, "GPWS")}
      {L(F0 + 308, 132, 76, 36, "BELOW G/S\nP INHIBIT")}
      <Comparator3D x={F0 + 396} y={18} />
      <Tat3D />
      {L(F0 + 14, 440, 110, 22, "LOW QUANTITY")}
      {L(F0 + 666, 100, 130, 26, "ALTITUDE ALERT")}
      <Chrono3D cx={F0 + 892.5} cy={620.5} />
      <Drawn x={F0 + 892} y={548} w={110} h={12} z={0.12} drawKey="chrono-tag-fo" draw={(c, w, h) => text(c, "GMT · ET/CHR", w / 2, h / 2, 7.5, "#d8d8d0")} />
    </group>
  );
}
