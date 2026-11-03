import { useShallow } from "zustand/react/shallow";
import { useState } from "react";
import { type ThreeEvent } from "@react-three/fiber";
import { useSim, useSimPick, useDerivedPick } from "@/lib/sim/store";
import { useMip } from "@/lib/sim/mipLocal";
import { usePedestal } from "@/lib/sim/pedestal";
import { computeAirData } from "@/lib/sim/pitotStatic";
import { Drawn, Lens3D, Toggle3D, text, useCursor, wx, wy, type Tone } from "@/components/panel/MainInstrumentPanel3DControls";

/**
 * 3D MIP remaining items (handoff next steps):
 * EPR counters, fuel quantity LEDs, ApproachProgress lenses, DH lamps,
 * HYD A/B / NWS ALT / FLAP INHIBIT / GPWS INOP placards, remaining toggles/knobs
 * (brightness/flood, yaw damper, oil qty test, BRAKE TEST, radios where local).
 * Native meshes + canvas textures. Same design coordinates as 2D.
 */

const CW = 3036;
const F0 = 2064;
const X_SB = 1100;
const X_CREAM = 1300;
const X_DARK = 1510; // dark engine / systems panel (matches 2D)
const X_GEAR = 1912;
const XL = X_CREAM + 52, XR = X_CREAM + 150;
const rows = [168, 270, 372, 474, 576];

function Press3D({ x, y, w, h, onDown, onUp }: { x: number; y: number; w: number; h: number; onDown: () => void; onUp?: () => void }) {
  const cur = useCursor();
  return (
    <mesh
      position={[wx(x), wy(y), 0.12]}
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

/* ───────────────────────── EPR counter ───────────────────────── */
function EprCounter3D({ cx, cy, value, powered }: { cx: number; cy: number; value: number; powered: boolean }) {
  const txt = value.toFixed(2);
  const key = `${txt}|${powered}`;
  return (
    <Drawn
      x={cx} y={cy} w={52} h={16} z={0.13}
      drawKey={key}
      draw={(c, w, h) => {
        c.fillStyle = "#000";
        c.fillRect(0, 0, w, h);
        c.strokeStyle = "#c9d84a";
        c.lineWidth = 2;
        c.strokeRect(1, 1, w - 2, h - 2);
        if (powered) text(c, txt, w / 2, h / 2, 10, "#f2f2f2");
        else {
          c.fillStyle = "#ff7a1a";
          c.fillRect(6, h / 2 - 3, w - 12, 6);
        }
      }}
    />
  );
}

/* ───────────────────────── fuel quantity LEDs ───────────────────────── */
function QtyLed3D({ x, y, w, h, label, value }: { x: number; y: number; w: number; h: number; label: string; value: number }) {
  const d = useDerivedPick("dcPower");
  const m = useMip(useShallow((st) => ({ qtyTest: st.qtyTest, raTest: st.raTest })));
  const show = !!d.dcPower;
  const num = show ? String(Math.round((m.raTest || m.qtyTest) ? 888 : value)).padStart(3, " ") : "   ";
  const key = `${num}|${show}|${label}`;
  return (
    <Drawn
      x={x} y={y} w={w} h={h} z={0.13}
      drawKey={key}
      draw={(c, ww, hh) => {
        c.fillStyle = "#2a2f37";
        c.beginPath();
        c.roundRect(0, 0, ww, hh, 8);
        c.fill();
        c.strokeStyle = "#1c1f24";
        c.lineWidth = 2;
        c.stroke();
        // LED window
        c.fillStyle = "#2a0707";
        c.fillRect(8, 8, ww - 16, hh * 0.5);
        text(c, num, ww / 2, 8 + (hh * 0.5) / 2, Math.max(12, hh * 0.28), show ? "#ff4040" : "#331111");
        text(c, label, ww / 2, hh - 12, 8, "#cfd3d8");
      }}
    />
  );
}

/* ───────────────────────── Approach progress ───────────────────────── */
function ApproachProgress3D({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const d = useDerivedPick("dcPower");
  const m = useMip(useShallow((st) => ({ apAnn: st.apAnn })));
  const [test, setTest] = useState(false);
  const pw = !!d.dcPower;
  const voc = !pw ? "OFF" : test ? "GREEN" : (m.apAnn?.voc ?? "OFF");
  const gs = !pw ? "OFF" : test ? "GREEN" : (m.apAnn?.gs ?? "OFF");
  const key = `${voc}|${gs}|${test}`;
  const color = (st: string) => st === "GREEN" ? "#27b84a" : st === "AMBER" ? "#e9a93a" : "#15181c";
  const tc = (st: string) => st === "OFF" ? "#4a4f57" : "#031a08";
  return (
    <group>
      <Drawn
        x={x} y={y} w={w} h={h} z={0.13}
        drawKey={key}
        draw={(c, ww, hh) => {
          c.fillStyle = "#0b0d10";
          c.fillRect(0, 0, ww, hh);
          c.strokeStyle = "#05070a";
          c.strokeRect(0, 0, ww, hh);
          // top VOR/LOC
          c.fillStyle = color(voc);
          c.fillRect(2, 2, ww - 4, hh / 2 - 3);
          text(c, "VOR/LOC", ww / 2, hh / 4, 8, tc(voc));
          // bottom GS
          c.fillStyle = color(gs);
          c.fillRect(2, hh / 2 + 1, ww - 4, hh / 2 - 3);
          text(c, "GLIDE SLOPE", ww / 2, hh * 0.75, 7, tc(gs));
        }}
      />
      <Press3D x={x} y={y} w={w} h={h} onDown={() => setTest(true)} onUp={() => setTest(false)} />
    </group>
  );
}

/* ───────────────────────── DH lamp ───────────────────────── */
function DhLamp3D({ x, y }: { x: number; y: number }) {
  const s = useSimPick("ltTest", "wow");
  const d = useDerivedPick("dcPower");
  const m = useMip(useShallow((st) => ({ lightKey: st.lightKey, lrra: st.lrra, raDh: st.raDh, raTest: st.raTest })));
  const pw = !!d.dcPower;
  const test = !!(pw && (s.ltTest || m.raTest || m.lightKey === 2));
  const raRaw = m.lrra?.h1;
  const ra = s.wow ? 0 : raRaw != null ? raRaw : 9999;
  const on = test || (pw && !s.wow && ra <= m.raDh);
  const key = `${on}`;
  return (
    <Drawn
      x={x} y={y} w={20} h={20} z={0.13}
      drawKey={key}
      draw={(c, w, h) => {
        c.beginPath();
        c.arc(w / 2, h / 2, w / 2 - 1, 0, Math.PI * 2);
        c.fillStyle = on ? "#ffb21a" : "#b0701c";
        c.fill();
        c.strokeStyle = "#3a2a12";
        c.lineWidth = 1.5;
        c.stroke();
      }}
    />
  );
}

/* ───────────────────────── BRAKE TEST ───────────────────────── */
function BrakeTest3D() {
  const m = useMip(useShallow((st) => ({ brakeTest: st.brakeTest, set: st.set })));
  const x = X_CREAM + 8 + 92; // centre of the 184-wide block
  const y = 22 + 46;
  return (
    <group>
      <Drawn
        x={x} y={y} w={184} h={92} z={0.13}
        drawKey={`bt${m.brakeTest}`}
        draw={(c, w, h) => {
          c.fillStyle = "#c9c3ad";
          c.fillRect(0, 0, w, h);
          text(c, "SPEED BRAKE TEST", w / 2, 16, 8.5, "#2a2a2a");
          for (let n = 1; n <= 3; n++) {
            const cx = 30 + (n - 1) * 62;
            text(c, String(n), cx, 40, 9, "#2a2a2a");
            c.beginPath();
            c.arc(cx, 62, 14, 0, Math.PI * 2);
            c.fillStyle = m.brakeTest === n ? "#3a3d41" : "#0b0c0e";
            c.fill();
            c.strokeStyle = "#9fa3a7";
            c.lineWidth = 3;
            c.stroke();
            if (m.brakeTest === n) {
              c.strokeStyle = "#e0a84a";
              c.lineWidth = 2;
              c.stroke();
            }
          }
        }}
      />
      {[1, 2, 3].map((n) => (
        <Press3D
          key={n}
          x={X_CREAM + 8 + 30 + (n - 1) * 62}
          y={22 + 62}
          w={28}
          h={28}
          onDown={() => m.set({ brakeTest: n as 1 | 2 | 3 })}
          onUp={() => m.set({ brakeTest: 0 })}
        />
      ))}
    </group>
  );
}

/* ───────────────────────── yaw damper indicator + L/R test ───────────────────────── */
/** Matches 2D: C cx=X_DARK+44 cy=92 r=32; test pad X_DARK+90,y=78,30×30 (left=L, right=R). */
function YawDamper3D() {
  const m = useMip(useShallow((st) => ({ set: st.set, yawTest: st.yawTest })));
  const cx = X_DARK + 44;
  const cy = 92;
  const size = 64; // 2× radius
  const test = m.yawTest; // 0 | 1 | 2
  const ang = test === 1 ? -32 : test === 2 ? 32 : 0;
  return (
    <group>
      <Drawn
        x={cx} y={cy} w={size} h={size} z={0.13}
        drawKey={`yaw${test}`}
        draw={(c, w, h) => {
          const mx = w / 2, my = h / 2;
          // outer bezel
          c.beginPath();
          c.arc(mx, my, mx - 1, 0, Math.PI * 2);
          c.fillStyle = "#3a2a22";
          c.fill();
          c.strokeStyle = "#6b4a3a";
          c.lineWidth = 2;
          c.stroke();
          // face
          c.beginPath();
          c.arc(mx, my, mx - 6, 0, Math.PI * 2);
          c.fillStyle = "#0b0c0e";
          c.fill();
          c.strokeStyle = "#2a2d31";
          c.lineWidth = 1;
          c.stroke();
          // centre marks + needle paddle (2D style)
          c.strokeStyle = "#4a4f57"; c.lineWidth = 1;
          c.beginPath(); c.moveTo(mx, my - 18); c.lineTo(mx, my + 18); c.stroke();
          c.beginPath(); c.moveTo(mx - 18, my); c.lineTo(mx + 18, my); c.stroke();
          c.save();
          c.translate(mx, my);
          c.rotate((ang * Math.PI) / 180);
          c.fillStyle = "#f4f1e4";
          c.fillRect(-3, -22, 6, 28); // stem
          c.fillRect(-6, 4, 12, 6); // weight
          c.restore();
          c.beginPath(); c.arc(mx, my, 3, 0, Math.PI * 2);
          c.fillStyle = "#2a2d31"; c.fill();
        }}
      />
      {/* L/R test pad — centres: button at (X_DARK+90+15, 78+15); left half L=1, right half R=2 */}
      <Press3D
        x={X_DARK + 90 + 7.5}
        y={78 + 15}
        w={15}
        h={30}
        onDown={() => m.set({ yawTest: 1 })}
        onUp={() => m.set({ yawTest: 0 })}
      />
      <Press3D
        x={X_DARK + 90 + 22.5}
        y={78 + 15}
        w={15}
        h={30}
        onDown={() => m.set({ yawTest: 2 })}
        onUp={() => m.set({ yawTest: 0 })}
      />
      {/* visible test button face */}
      <Drawn
        x={X_DARK + 90 + 15}
        y={78 + 15}
        w={30}
        h={30}
        z={0.125}
        drawKey={`yawBtn${test}`}
        draw={(c, w, h) => {
          c.beginPath();
          c.arc(w / 2, h / 2, w / 2 - 1, 0, Math.PI * 2);
          c.fillStyle = "#b9bdc1";
          c.fill();
          c.strokeStyle = "#9aa0a6";
          c.lineWidth = 1.5;
          c.stroke();
          if (test) {
            c.strokeStyle = "#e0a84a";
            c.lineWidth = 2;
            c.stroke();
          }
          text(c, "L  R", w / 2, h / 2, 7, "#2a2a2a");
        }}
      />
    </group>
  );
}

/* ───────────────────────── oil qty test button ───────────────────────── */
/** Exact 2D: S x=X_DARK+142 y=76 w=34 h=34 (beside yaw damper test on dark panel). */
function OilQtyTest3D() {
  const m = useMip(useShallow((st) => ({ oilQtyTest: st.oilQtyTest, set: st.set })));
  const x = X_DARK + 142 + 17; // centre of 34-wide button
  const y = 76 + 17;
  return (
    <group>
      <Drawn
        x={x} y={y} w={34} h={34} z={0.13}
        drawKey={`oqt${m.oilQtyTest}`}
        draw={(c, w, h) => {
          c.beginPath();
          c.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
          c.fillStyle = "#1d2a3c";
          c.fill();
          c.strokeStyle = "#8a8f95";
          c.lineWidth = 3;
          c.stroke();
          if (m.oilQtyTest) {
            c.strokeStyle = "#e0a84a";
            c.lineWidth = 2;
            c.stroke();
          }
          text(c, "OIL\nQTY\nTEST", w / 2, h / 2, 5.5, "#cfd3d8");
        }}
      />
      <Press3D x={x} y={y} w={34} h={34} onDown={() => m.set({ oilQtyTest: true })} onUp={() => m.set({ oilQtyTest: false })} />
    </group>
  );
}

/* ───────────────────────── remaining placards / system controls ───────────────────────── */
/** Parked on dark-panel right column (RC) so they stay on the main MIP stage.
 *  2D lives in LowerStrip MiscControls; these are functional stand-ins. */
/* ───────────────────────── flood / panel dimmer knobs (click step) ───────────────────────── */
function DimmerKnob3D({ x, y, value, onChange, label }: { x: number; y: number; value: number; onChange: (v: number) => void; label: string }) {
  const step = (dir: number) => onChange(Math.max(0, Math.min(1, +(value + dir * 0.1).toFixed(2))));
  return (
    <group>
      <Drawn
        x={x} y={y} w={52} h={56} z={0.13}
        drawKey={`${label}${value}`}
        draw={(c, w, h) => {
          c.fillStyle = "#2f3744";
          c.fillRect(0, 0, w, h);
          c.strokeStyle = "#1b2028";
          c.lineWidth = 1;
          c.strokeRect(0.5, 0.5, w - 1, h - 1);
          text(c, label, w / 2, 8, 5.5, "#e8e8e0");
          c.beginPath();
          c.arc(w / 2, h / 2 + 4, 14, 0, Math.PI * 2);
          c.fillStyle = "#3a3d41";
          c.fill();
          c.strokeStyle = "#9fa3a7";
          c.lineWidth = 2;
          c.stroke();
          const ang = (-135 + value * 270) * Math.PI / 180;
          c.strokeStyle = "#e0a84a";
          c.lineWidth = 2;
          c.beginPath();
          c.moveTo(w / 2, h / 2 + 4);
          c.lineTo(w / 2 + Math.sin(ang) * 11, h / 2 + 4 - Math.cos(ang) * 11);
          c.stroke();
          text(c, "OFF", 10, h - 6, 5, "#8a8f95");
          text(c, "BRT", w - 10, h - 6, 5, "#8a8f95");
        }}
      />
      <Press3D x={x - 14} y={y} w={24} h={56} onDown={() => step(-1)} />
      <Press3D x={x + 14} y={y} w={24} h={56} onDown={() => step(1)} />
    </group>
  );
}

/* ───────────────────────── foot-air round buttons ───────────────────────── */
function FootAir3D({ x, y, on, onToggle, label }: { x: number; y: number; on: boolean; onToggle: () => void; label: string }) {
  return (
    <group>
      <Drawn
        x={x} y={y} w={48} h={48} z={0.13}
        drawKey={`fa${label}${on}`}
        draw={(c, w, h) => {
          c.beginPath();
          c.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
          c.fillStyle = on ? "#1a4a2a" : "#1d2a3c";
          c.fill();
          c.strokeStyle = on ? "#3dca6a" : "#8a8f95";
          c.lineWidth = on ? 3 : 2;
          c.stroke();
          if (on) {
            c.beginPath();
            c.arc(w / 2, h / 2, w / 2 - 6, 0, Math.PI * 2);
            c.strokeStyle = "#2fc27a";
            c.lineWidth = 1.5;
            c.stroke();
          }
          text(c, label, w / 2, h / 2, 6.5, on ? "#cfe8d0" : "#cfd3d8");
        }}
      />
      <Press3D x={x} y={y} w={48} h={48} onDown={onToggle} />
    </group>
  );
}

/**
 * Lower strip below the 720-high panel, laid out like the 2D LowerStrip (design px, same x as the panel above):
 *   row A  captain plate | (gap) | F/O plate      -> vent, caps, PANEL / BACKGROUND / INSTR COMP, AFCS FLOOD, W/S FAIL
 *   row B  OTHER SYSTEM CONTROLS plate, 11 items spread evenly (2D justify-around) + INSTRUMENT FAULTS row
 */
const LOW_TOP = 724; // just under the 720 panel
function LowerMip3D() {
  const s = useSimPick("ltPanelCapt", "ltPanelFo", "ltPanelPed", "patch");
  const d = useDerivedPick("dcPower", "hydALow", "hydBLow");
  const m = useMip();
  const pw = !!d.dcPower;

  /** plate = 2D PLATE2 (#39414d, dark border) with four screws; plain meshes (no big canvas textures: the wide plates would exceed GPU texture limits) */
  const plate = (cx: number, cy: number, w: number, h: number, key: string, fill = "#39414d") => (
    <group key={key}>
      <mesh position={[wx(cx), wy(cy), 0.06]}>
        <planeGeometry args={[w * 0.01, h * 0.01]} />
        <meshStandardMaterial color="#1b2028" roughness={0.9} />
      </mesh>
      <mesh position={[wx(cx), wy(cy), 0.065]}>
        <planeGeometry args={[(w - 4) * 0.01, (h - 4) * 0.01]} />
        <meshStandardMaterial color={fill} roughness={0.85} metalness={0.05} />
      </mesh>
      {fill === "#39414d" && ([[-1, -1], [1, -1], [-1, 1], [1, 1]] as const).map(([sx, sy]) => (
        <mesh key={`${sx}${sy}`} position={[wx(cx) + sx * (w / 2 - 8) * 0.01, wy(cy) - sy * (h / 2 - 8) * 0.01, 0.07]}>
          <circleGeometry args={[0.025, 10]} />
          <meshBasicMaterial color="#14171a" />
        </mesh>
      ))}
    </group>
  );
  const cap = (x: number, y: number) => (
    <group key={`cap${x}:${y}`}>
      <Drawn x={x} y={y} w={48} h={48} z={0.075} drawKey="lowcapbase"
        draw={(c, w, h) => { c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 1, 0, Math.PI * 2); c.fillStyle = "#14171a"; c.fill(); c.strokeStyle = "#2a2e33"; c.lineWidth = 3; c.stroke(); }} />
      <mesh position={[wx(x), wy(y), 0.12]}>
        <sphereGeometry args={[0.18, 20, 14]} />
        <meshStandardMaterial color="#2a2e33" roughness={0.35} metalness={0.55} />
      </mesh>
    </group>
  );
  const vent = (x: number, y: number) => (
    <Drawn key={`vent${x}`} x={x} y={y} w={130} h={130} z={0.08} drawKey="lowvent"
      draw={(c, w, h) => {
        c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 3, 0, Math.PI * 2);
        c.fillStyle = "#14171a"; c.fill(); c.strokeStyle = "#2a2e33"; c.lineWidth = 6; c.stroke();
        c.strokeStyle = "#3a3e44"; c.lineWidth = 2;
        for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2; c.beginPath(); c.moveTo(w / 2 + Math.cos(a) * 10, h / 2 + Math.sin(a) * 10); c.lineTo(w / 2 + Math.cos(a) * 44, h / 2 + Math.sin(a) * 44); c.stroke(); }
        c.beginPath(); c.arc(w / 2, h / 2, 46, 0, Math.PI * 2); c.stroke();
      }} />
  );

  const A = LOW_TOP + 76; // row A centre y
  const B1 = LOW_TOP + 226; // misc controls row
  const B2 = LOW_TOP + 296; // instrument faults row
  const bx = (i: number) => 8 + (i + 0.5) * (3020 / 11); // 2D justify-around over 11 items
  const faultKeys = Object.keys(m.fail) as (keyof typeof m.fail)[];

  return (
    <group>
      {/* housing behind the whole strip (2D wraps it in the #1d2127 case) */}
      {plate(CW / 2, LOW_TOP + 160, CW, 332, "lowerhousing", "#1d2127")}

      {/* ===== captain plate (2D grid column 1) ===== */}
      {plate(554, A, 1084, 148, "captplate")}
      {vent(95, A)}
      {cap(205, A - 31)}
      {cap(205, A + 31)}
      {plate(400, A, 270, 112, "dimplate")}
      <DimmerKnob3D x={333} y={A} value={s.ltPanelCapt ?? 1} onChange={(v) => s.patch({ ltPanelCapt: v })} label="PANEL" />
      <DimmerKnob3D x={400} y={A} value={s.ltPanelPed ?? 1} onChange={(v) => s.patch({ ltPanelPed: v })} label="BACKGROUND" />
      <Drawn x={470} y={A} w={50} h={64} z={0.13} drawKey={`compT${m.compTest}`}
        draw={(c, w, h) => {
          text(c, "INSTR COMP", w / 2, 8, 5.5, "#e8e8e0");
          c.beginPath(); c.arc(w / 2, h / 2 + 2, 15, 0, Math.PI * 2);
          c.fillStyle = m.compTest ? "#e0a84a" : "#0b0c0e"; c.fill();
          c.strokeStyle = "#8a8f95"; c.lineWidth = 3.5; c.stroke();
          text(c, "TEST", w / 2, h - 7, 6, "#cfd3d8");
        }} />
      <Press3D x={470} y={A} w={50} h={64} onDown={() => m.set({ compTest: true })} onUp={() => m.set({ compTest: false })} />
      {plate(595, A, 96, 112, "afcsplate")}
      <DimmerKnob3D x={595} y={A} value={m.floodCapt ?? 0} onChange={(v) => m.set({ floodCapt: v })} label="AFCS FLOOD" />
      <Drawn x={708} y={A} w={96} h={44} z={0.12} drawKey="wsfail"
        draw={(c, w, h) => {
          c.fillStyle = "#0b0c0e"; c.fillRect(0, 0, w, h);
          c.strokeStyle = "#3a3e44"; c.lineWidth = 1; c.strokeRect(0.5, 0.5, w - 1, h - 1);
          text(c, "W/S FAIL", w / 2, h / 2 - 7, 8, "#e8e8e0");
          text(c, "PUSH TO TEST", w / 2, h / 2 + 8, 6, "#9aa0a6");
        }} />

      {/* ===== F/O plate (2D grid column 3, content right-aligned) ===== */}
      {plate(2528, A, 984, 148, "foplate")}
      {plate(2765, A, 112, 112, "foPanelPlate")}
      <DimmerKnob3D x={2765} y={A} value={s.ltPanelFo ?? 1} onChange={(v) => s.patch({ ltPanelFo: v })} label="PANEL" />
      {cap(2858, A - 31)}
      {cap(2858, A + 31)}
      {vent(2955, A)}

      {/* ===== OTHER SYSTEM CONTROLS (2D MiscControls) ===== */}
      {plate(CW / 2, LOW_TOP + 262, 3020, 146, "miscplate")}
      <Drawn x={bx(0)} y={B1} w={150} h={40} z={0.11} drawKey="miscleg"
        draw={(c, w, h) => { text(c, "OTHER SYSTEM", w / 2, h / 2 - 6, 7, "#e8e8e0"); text(c, "CONTROLS", w / 2, h / 2 + 6, 7, "#e8e8e0"); }} />
      <Lens3D x={bx(1)} y={B1} w={56} h={28} label="HYD A" on={pw && !!d.hydALow} tone="amber" />
      <Lens3D x={bx(2)} y={B1} w={56} h={28} label="HYD B" on={pw && !!d.hydBLow} tone="amber" />
      <Toggle3D x={bx(3)} y={B1} name="NOSE WHEEL STEER" on={!!m.nwsAlt} upLabel="ALT" downLabel="NORM" onChange={(v) => m.set({ nwsAlt: v })} />
      <Lens3D x={bx(4)} y={B1} w={48} h={30} label={"NWS\nALT"} on={pw && !!m.nwsAlt} tone="green" />
      <Toggle3D x={bx(5)} y={B1} name="GND PROX FLAP" on={!m.gpwsInhibit} upLabel="NORM" downLabel="INHIBIT" onChange={(v) => m.set({ gpwsInhibit: !v })} />
      <Lens3D x={bx(6)} y={B1} w={52} h={30} label={"FLAP\nINHIBIT"} on={pw && !!m.gpwsInhibit} tone="amber" />
      <Drawn x={bx(7)} y={B1 - 38} w={130} h={12} z={0.11} drawKey="gpwshdr" draw={(c, w, h) => text(c, "GROUND PROXIMITY", w / 2, h / 2, 6.5, "#e8e8e0")} />
      <Lens3D x={bx(7) - 30} y={B1 - 14} w={56} h={22} label="GPWS INOP" on={pw && (!!m.gpwsInhibit || !!m.gpwsTest)} tone="amber" />
      <Lens3D x={bx(7) + 30} y={B1 - 14} w={48} h={22} label="PULL UP" on={pw && !!m.gpwsTest} tone="red" />
      <Press3D x={bx(7) - 30} y={B1 + 20} w={52} h={24} onDown={() => m.set({ gpwsTest: true })} onUp={() => m.set({ gpwsTest: false })} />
      <Drawn x={bx(7) - 30} y={B1 + 20} w={52} h={24} z={0.13} drawKey="gpwstest"
        draw={(c, w, h) => { c.fillStyle = "#2a2f36"; c.fillRect(0, 0, w, h); c.strokeStyle = "#555a60"; c.strokeRect(0.5, 0.5, w - 1, h - 1); text(c, "TEST", w / 2, h / 2, 7, "#e8e8e0"); }} />
      <Press3D x={bx(7) + 30} y={B1 + 20} w={52} h={24} onDown={() => m.set({ gpwsInhibit: !m.gpwsInhibit })} />
      <Drawn x={bx(7) + 30} y={B1 + 20} w={52} h={24} z={0.13} drawKey={`gpwsinH${m.gpwsInhibit}`}
        draw={(c, w, h) => { c.fillStyle = m.gpwsInhibit ? "#e0a84a" : "#2a2f36"; c.fillRect(0, 0, w, h); c.strokeStyle = "#555a60"; c.strokeRect(0.5, 0.5, w - 1, h - 1); text(c, "INHIBIT", w / 2, h / 2, 6.5, m.gpwsInhibit ? "#2a1a00" : "#e8e8e0"); }} />
      <DimmerKnob3D x={bx(8)} y={B1} value={m.floodFo ?? 0} onChange={(v) => m.set({ floodFo: v })} label="F/O FLOOD" />
      <FootAir3D x={bx(9)} y={B1} on={!!m.footAirCapt} onToggle={() => m.set({ footAirCapt: !m.footAirCapt })} label={"CAPT\nFOOT AIR"} />
      <FootAir3D x={bx(10)} y={B1} on={!!m.footAirFo} onToggle={() => m.set({ footAirFo: !m.footAirFo })} label={"F/O\nFOOT AIR"} />

      {/* INSTRUMENT FAULTS: one latching button per MipFail key, orange when injected */}
      <Drawn x={981} y={B2} w={520} h={14} z={0.11} drawKey="faultleg"
        draw={(c, w, h) => text(c, "INSTRUMENT FAULTS (flag shows only when its system fails)", w / 2, h / 2, 7, "#e8e8e0")} />
      {faultKeys.map((k, i) => {
        const fx = 1293 + i * 90;
        const on = !!m.fail[k];
        return (
          <group key={k}>
            <Drawn x={fx} y={B2} w={64} h={24} z={0.12} drawKey={`fault${k}${on}`}
              draw={(c, w, h) => {
                c.fillStyle = on ? "#ff5a2a" : "#0b0c0d"; c.fillRect(0, 0, w, h);
                c.strokeStyle = on ? "#ff6a3a" : "#555a60"; c.lineWidth = 1.5; c.strokeRect(0.75, 0.75, w - 1.5, h - 1.5);
                text(c, k.toUpperCase(), w / 2, h / 2, 8, on ? "#7a1500" : "#8a8f95");
              }} />
            <Press3D x={fx} y={B2} w={64} h={24} onDown={() => m.set({ fail: { ...m.fail, [k]: !m.fail[k] } })} />
          </group>
        );
      })}
    </group>
  );
}

/* ───────────────────────── aircraft identity placard (PlacardAc) ───────────────────────── */
/** 2D: captain S x=10 y=330 w=176 h=150; F/O compact S x=F0+842 y=336 w=112 h=150. */
function PlacardAc3D({ x, y, w, h, compact = false }: { x: number; y: number; w: number; h: number; compact?: boolean }) {
  const lines = compact
    ? ["THIS IS A/C RP-C8009", "B737-200", "MAX TAXI 117500 LB", "MAX T/O 117000 LB", "MAX ZFW 95000 LB", "MAX LDG 105000 LB", "FUEL 34500 LB", "MAX ALT 35000 FT"]
    : ["THIS IS A/C RP-C8009", "B737-200", "MAX. TAXI WT. 117,500 LBS.", "MAX. T.O. WT. 117,000 LBS.", "MAX. ZERO FUEL 95,000 LBS.", "MAX. LDG. WT. 105,000 LBS.", "FUEL CAPACITY 34,500 LBS.", "MAX. OPER. ALT. 35,000 FT."];
  const fs = compact ? 6.5 : 7.5;
  return (
    <Drawn
      x={x + w / 2} y={y + h / 2} w={w} h={h} z={0.12}
      drawKey={`placardAc${compact ? "c" : "f"}`}
      draw={(c, ww, hh) => {
        c.fillStyle = "#d8d6cc";
        c.fillRect(0, 0, ww, hh);
        c.strokeStyle = "#8a8d90";
        c.lineWidth = 1.5;
        c.strokeRect(0.5, 0.5, ww - 1, hh - 1);
        const lh = (hh - 8) / lines.length;
        lines.forEach((ln, i) => {
          text(c, ln, ww / 2, 6 + lh * (i + 0.5), fs, "#2a2a2a");
        });
      }}
    />
  );
}

/** Registration plate — dark with cream letters (2D RegPlate). */
function RegPlate3D({ x, y, w, h, reg = "N267AU" }: { x: number; y: number; w: number; h: number; reg?: string }) {
  return (
    <Drawn
      x={x + w / 2} y={y + h / 2} w={w} h={h} z={0.12}
      drawKey={`reg${reg}`}
      draw={(c, ww, hh) => {
        c.fillStyle = "#101214";
        c.fillRect(0, 0, ww, hh);
        c.strokeStyle = "#2a2d31";
        c.lineWidth = 1.5;
        c.strokeRect(0.5, 0.5, ww - 1, hh - 1);
        text(c, reg, ww / 2, hh / 2, Math.min(16, hh * 0.58), "#e8b98f");
      }}
    />
  );
}

/* ───────────────────────── standby IAS strip (present on the 2D source panel) ───────────────────────── */
function StandbyIasStrip3D() {
  const s = useSim();
  const d = useDerivedPick("acPower", "dcPower");
  // The standby instrument uses the pneumatic source, just like the 2D panel; it is not blanked
  // by a main DC / ADC failure.
  const air = computeAirData(s, d.dcPower, d.acPower);
  const ias = String(Math.max(0, Math.min(999, Math.round(air.standby.iasKt)))).padStart(3, "0");
  return (
    <Drawn
      x={1195} y={317} w={146} h={38} z={0.14}
      drawKey={`standby-ias:${ias}`}
      draw={(c, w, h) => {
        c.fillStyle = "#14171b";
        c.fillRect(0, 0, w, h);
        c.strokeStyle = "#0b0d10";
        c.lineWidth = 1.2;
        c.strokeRect(0.6, 0.6, w - 1.2, h - 1.2);
        // small index window on the left, matching the 2D strip's black inset square
        c.fillStyle = "#000";
        c.fillRect(9, 6, 24, 26);
        c.strokeStyle = "#555a60";
        c.lineWidth = 1;
        c.strokeRect(9.5, 6.5, 23, 25);
        // three-digit airspeed counter
        c.fillStyle = "#000";
        c.fillRect(39, 4, 58, 30);
        c.strokeStyle = "#555a60";
        c.strokeRect(39.5, 4.5, 57, 29);
        text(c, ias, 68, 19, 15, "#f2f2f2");
        text(c, "IAS", 119, 13, 7, "#9aa4ad");
        text(c, "KNOTS", 119, 24, 6, "#9aa4ad");
      }}
    />
  );
}


/* ───────────────────────── external SVG-overlay flags from the 2D reference ───────────────────────── */
function InstrumentStatusFlags3D() {
  const d = useDerivedPick("dcPower", "standbyAcSource");
  const m = useMip(useShallow((st) => ({ fail: st.fail })));
  const showVsiOff = !d.dcPower || m.fail.vsi;
  const showStandbyAttX = d.standbyAcSource === "NONE";
  const flag = (x: number, y: number, label: string, w: number, h: number, key: string) => (
    <Drawn
      x={x} y={y} w={w} h={h} z={0.14}
      drawKey={`${key}:${label}`}
      draw={(c, ww, hh) => {
        c.fillStyle = "#ff5a2a";
        c.fillRect(0, 0, ww, hh);
        c.strokeStyle = "#ff6a3a";
        c.lineWidth = 1;
        c.strokeRect(0.5, 0.5, ww - 1, hh - 1);
        text(c, label, ww / 2, hh / 2, label === "X" ? 11 : 9, "#7a1500");
      }}
    />
  );
  return (
    <group>
      {showVsiOff && flag(736, 515, "OFF", 27, 18, "capt-vsi-off")}
      {showVsiOff && flag(2909, 230, "OFF", 27, 18, "fo-vsi-off")}
      {showStandbyAttX && flag(1244, 407, "X", 20, 22, "standby-att-x")}
    </group>
  );
}

/* ───────────────────────── engine warning annunciators ───────────────────────── */
function EngineAnnunciators3D() {
  const s = useSim();
  const d = useDerivedPick("dcPower", "eng1Running", "eng2Running", "oilPressure1", "oilPressure2", "startValveOpen1", "startValveOpen2", "thrustReverser1Active", "thrustReverser2Active");
  const pw = !!d.dcPower;
  const cells = [
    { label: "REVERSER\nUNLOCKED", on: pw && !!d.thrustReverser1Active },
    { label: "START\nVALVE OPEN", on: pw && !!d.startValveOpen1 },
    { label: "REVERSER\nUNLOCKED", on: pw && !!d.thrustReverser2Active },
    { label: "START\nVALVE OPEN", on: pw && !!d.startValveOpen2 },
    { label: "", on: false, blank: true },
    { label: "OIL FILTER\nBYPASS", on: false },
    { label: "LOW OIL\nPRESSURE", on: pw && ((!!d.eng1Running && d.oilPressure1 < 13) || (!!d.eng2Running && d.oilPressure2 < 13)) },
    { label: "OIL FILTER\nBYPASS", on: false },
  ];
  const key = cells.map((cell) => `${cell.label}:${cell.on}:${"blank" in cell && cell.blank}`).join("|");
  return (
    <Drawn
      x={X_DARK + 6 + 97} y={160 + 33} w={194} h={66} z={0.13}
      drawKey={`engine-ann:${key}`}
      draw={(c, w, h) => {
        c.fillStyle = "#000";
        c.fillRect(0, 0, w, h);
        const cw = 46, ch = 30, gx = 2, gy = 2;
        cells.forEach((cell, i) => {
          const col = i % 4, row = Math.floor(i / 4);
          const x = 2 + col * (cw + gx), y = 2 + row * (ch + gy);
          if ("blank" in cell && cell.blank) {
            c.fillStyle = "#e9e6dc";
            c.fillRect(x, y, cw, ch);
            c.strokeStyle = "#9aa0a6";
            c.lineWidth = 1;
            c.strokeRect(x + 0.5, y + 0.5, cw - 1, ch - 1);
            return;
          }
          c.fillStyle = cell.on ? "#e9a93a" : "#0b0c0d";
          c.fillRect(x, y, cw, ch);
          c.strokeStyle = cell.on ? "#a8741a" : "#55585c";
          c.lineWidth = 1;
          c.strokeRect(x + 0.5, y + 0.5, cw - 1, ch - 1);
          text(c, cell.label, x + cw / 2, y + ch / 2, 5.6, cell.on ? "#2a1b00" : "#d9a22b");
        });
      }}
    />
  );
}

/* ───────────────────────── two standby fuel selector ───────────────────────── */
function FuelSelector3D() {
  const m = useMip(useShallow((st) => ({ fuelSel: st.fuelSel, set: st.set })));
  return (
    <group>
      <Drawn
        x={X_SB + 22} y={602} w={36} h={72} z={0.13}
        drawKey={`fuel-selector:${m.fuelSel}`}
        draw={(c, w, h) => {
          text(c, "1", w / 2, 5, 6, m.fuelSel ? "#e8e8e0" : "#777d84");
          c.fillStyle = "#14161a";
          c.fillRect(4, 13, w - 8, 46);
          c.strokeStyle = "#15171a";
          c.lineWidth = 1;
          c.strokeRect(4.5, 13.5, w - 9, 45);
          const px = w / 2, py = 36;
          const g = c.createRadialGradient(px - 3, py - 4, 1, px, py, 7);
          g.addColorStop(0, "#b9bdc2"); g.addColorStop(1, "#4a4e53");
          c.fillStyle = g; c.beginPath(); c.arc(px, py, 5.5, 0, Math.PI * 2); c.fill();
          c.strokeStyle = "#050607"; c.stroke();
          c.save();
          c.translate(px, py);
          c.rotate(m.fuelSel ? 0 : Math.PI);
          c.fillStyle = "#bfc3c7";
          c.fillRect(-3, -16, 6, 19);
          c.strokeStyle = "#050607"; c.strokeRect(-3, -16, 6, 19);
          c.restore();
          text(c, "2", w / 2, 67, 6, m.fuelSel ? "#777d84" : "#e8e8e0");
        }}
      />
      {/* The 2D switch's upper/lower legends select 1/2 directly; only the centre lever toggles. */}
      <Press3D x={X_SB + 22} y={571} w={36} h={12} onDown={() => m.set({ fuelSel: true })} />
      <Press3D x={X_SB + 22} y={602} w={36} h={46} onDown={() => m.set({ fuelSel: !m.fuelSel })} />
      <Press3D x={X_SB + 22} y={633} w={36} h={12} onDown={() => m.set({ fuelSel: false })} />
    </group>
  );
}

/* ───────────────────────── blanking caps above the oil/system gauges ───────────────────────── */
function EngineBlankCaps3D() {
  return (
    <group>
      {([X_DARK + 31, X_DARK + 113] as number[]).map((cx) => (
        <Drawn
          key={cx} x={cx} y={139} w={26} h={26} z={0.13} drawKey={`engine-cap:${cx}`}
          draw={(c, w, h) => {
            const g = c.createRadialGradient(w * 0.36, h * 0.31, 1, w / 2, h / 2, w * 0.52);
            g.addColorStop(0, "#f1f2f3"); g.addColorStop(1, "#b9bdc1");
            c.fillStyle = g; c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 1, 0, Math.PI * 2); c.fill();
            c.strokeStyle = "#9aa0a6"; c.lineWidth = 1; c.stroke();
          }}
        />
      ))}
    </group>
  );
}

/* ───────────────────────── landing gear / flap limits placard ───────────────────────── */
function GearFlapLimits3D() {
  return (
    <Drawn
      x={X_DARK + 204 + 91} y={538 + 48} w={182} h={96} z={0.12}
      drawKey="gear-flap-limits"
      draw={(c, w, h) => {
        c.fillStyle = "#b8a97a"; c.fillRect(0, 0, w, h);
        c.strokeStyle = "#6d5f3a"; c.lineWidth = 1; c.strokeRect(0.5, 0.5, w - 1, h - 1);
        text(c, "LANDING GEAR LIMIT (IAS)", w / 2, 9, 6.2, "#2a2415");
        text(c, "OPERATING · EXTEND 270K-.82M", w / 2, 20, 5.2, "#2a2415");
        text(c, "RETRACT 235K · EXTENDED 320K-.82M", w / 2, 29, 4.7, "#2a2415");
        text(c, "FLAPS LIMIT (IAS)", w / 2, 44, 6.2, "#2a2415");
        text(c, "1-230K 2-230K 5-225K 10-210K", w / 2, 56, 5.2, "#2a2415");
        text(c, "15-195K 25-190K 30-185K 40-170K", w / 2, 67, 4.9, "#2a2415");
        text(c, "ALT FLAP EXT 310K", w / 2, 78, 5.2, "#2a2415");
      }}
    />
  );
}

/* ───────────────────────── instrument controls aligned to the 2D panel ───────────────────────── */
function FlightInstruments3D() {
  const m = useMip(useShallow((st) => ({ adiTestCapt: st.adiTestCapt, adiTestFo: st.adiTestFo, qtyTest: st.qtyTest, raDh: st.raDh, raTest: st.raTest, set: st.set })));
  const adjustDh = (delta: number) => {
    const value = Math.max(0, Math.min(500, Math.round((m.raDh ?? 200) + delta)));
    m.set({ raDh: value });
    // Keep the dedicated LRRA model setting in step with the knob, matching the 2D control.
    try {
      const pedestal = usePedestal.getState();
      pedestal.set({ lrraDh: [value, pedestal.lrraDh[1]] as [number, number] });
    } catch { /* the panel control remains usable if the optional pedestal store is unavailable */ }
  };
  const testButton = (cx: number, cy: number, key: string, pressed: boolean) => (
    <Drawn
      x={cx} y={cy} w={46} h={18} z={0.13}
      drawKey={`${key}:${pressed}`}
      draw={(c, w, h) => {
        c.fillStyle = pressed ? "#b9b39f" : "#e2dfd5";
        c.fillRect(0, 0, w, h);
        c.strokeStyle = "#777c82";
        c.lineWidth = 1.2;
        c.strokeRect(0.6, 0.6, w - 1.2, h - 1.2);
        text(c, "TEST", w / 2, h / 2, 7, "#2a2a2a");
      }}
    />
  );
  return (
    <group>
      {/* 2D positions: captain TEST x=432,y=350,w=46,h=18; F/O x=F0+400. */}
      <Press3D x={455} y={359} w={46} h={18} onDown={() => m.set({ adiTestCapt: true })} onUp={() => m.set({ adiTestCapt: false })} />
      {testButton(455, 359, "adi-test-capt", !!m.adiTestCapt)}
      <Press3D x={F0 + 423} y={359} w={46} h={18} onDown={() => m.set({ adiTestFo: true })} onUp={() => m.set({ adiTestFo: false })} />
      {testButton(F0 + 423, 359, "adi-test-fo", !!m.adiTestFo)}

      {/* Radio-altimeter DH knob / TEST row: 2D S x=696,y=374,w=176,h=30. */}
      <Drawn
        x={784} y={389} w={176} h={30} z={0.13}
        drawKey={`dh-control:${m.raDh}:${m.raTest}`}
        draw={(c, w, h) => {
          // Knob with pointer.
          c.beginPath(); c.arc(16, h / 2, 10, 0, Math.PI * 2);
          c.fillStyle = "#a6a9ad"; c.fill();
          c.strokeStyle = "#3b4046"; c.lineWidth = 2; c.stroke();
          c.beginPath(); c.arc(16, h / 2, 6.5, 0, Math.PI * 2);
          c.fillStyle = "#41464c"; c.fill();
          const angle = (-135 + (Math.max(0, Math.min(500, m.raDh ?? 200)) / 500) * 270) * Math.PI / 180;
          c.strokeStyle = "#e0a84a"; c.lineWidth = 2;
          c.beginPath(); c.moveTo(16, h / 2); c.lineTo(16 + Math.sin(angle) * 6, h / 2 - Math.cos(angle) * 6); c.stroke();
          text(c, `DH ${String(Math.round(m.raDh ?? 200)).padStart(3, "0")}`, 86, h / 2, 7, "#cfd3d8");
          // Momentary TEST pushbutton, in the right-hand position from the source panel.
          c.fillStyle = m.raTest ? "#b9b39f" : "#e2dfd5";
          c.fillRect(w - 42, 4, 36, h - 8);
          c.strokeStyle = "#777c82"; c.lineWidth = 1;
          c.strokeRect(w - 41.5, 4.5, 35, h - 9);
          text(c, "TEST", w - 24, h / 2, 7, "#2a2a2a");
        }}
      />
      {/* Left/right sides of the DH knob adjust in 10-ft increments. */}
      <Press3D x={709} y={389} w={14} h={24} onDown={() => adjustDh(-10)} />
      <Press3D x={723} y={389} w={14} h={24} onDown={() => adjustDh(10)} />
      <Press3D x={850} y={389} w={38} h={24} onDown={() => m.set({ raTest: true })} onUp={() => m.set({ raTest: false })} />

      {/* Standby fuel quantity QTY TEST button: exact 2D location and two-line legend. */}
      <Press3D x={X_SB + 64} y={599} w={40} h={30} onDown={() => m.set({ qtyTest: true })} onUp={() => m.set({ qtyTest: false })} />
      <Drawn
        x={X_SB + 64} y={599} w={40} h={30} z={0.13}
        drawKey={`qty-test:${m.qtyTest}`}
        draw={(c, w, h) => {
          c.fillStyle = m.qtyTest ? "#b9b39f" : "#e2dfd5";
          c.fillRect(0, 0, w, h);
          c.strokeStyle = "#777c82"; c.lineWidth = 1.2;
          c.strokeRect(0.6, 0.6, w - 1.2, h - 1.2);
          text(c, "QTY", w / 2, h / 2 - 5, 6.5, "#2a2a2a");
          text(c, "TEST", w / 2, h / 2 + 5, 6.5, "#2a2a2a");
        }}
      />
    </group>
  );
}

/** Extra engraved labels, empty cutouts, gear legends, screws — fills the sparse areas. */
function PanelDetails3D() {
  const s = useSimPick("wow");
  const label = (x: number, y: number, w: number, h: number, s: string, col = "#cfd3d8", fs = 7) => (
    <Drawn key={`${x}:${y}:${s}`} x={x} y={y} w={w} h={h} z={0.11}
      drawKey={`lbl${x}${y}${s}`} draw={(c, ww, hh) => text(c, s, ww / 2, hh / 2, fs, col)} />
  );
  const screw = (x: number, y: number) => (
    <mesh key={`sc${x}:${y}`} position={[wx(x), wy(y), 0.08]} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[0.035, 0.035, 0.025, 12]} />
      <meshStandardMaterial color="#6a6e74" roughness={0.4} metalness={0.75} />
    </mesh>
  );
  // empty cutout ring (cream strip mid holes between N1 and N2)
  const cutout = (cx: number, cy: number, r = 45) => (
    <group key={`cut${cx}:${cy}`}>
      <mesh position={[wx(cx), wy(cy), 0.06]}>
        <circleGeometry args={[r * 0.01, 48]} />
        <meshStandardMaterial color="#05070a" roughness={0.95} />
      </mesh>
      <mesh position={[wx(cx), wy(cy), 0.07]}>
        <torusGeometry args={[r * 0.01, 0.025, 8, 48]} />
        <meshStandardMaterial color="#1b2026" roughness={0.5} metalness={0.6} />
      </mesh>
    </group>
  );
  return (
    <group>
      {/* PULL TO SET under EPR dials */}
      {label(XL, rows[0] + 55, 80, 12, "PULL TO SET", "#3a3a3a", 7)}
      {label(XR, rows[0] + 55, 80, 12, "PULL TO SET", "#3a3a3a", 7)}

      {/* empty instrument cutouts (cream strip rows[2]) */}
      {cutout(XL, rows[2])}
      {cutout(XR, rows[2])}

      {/* gear lever detents aligned to the actual 2D lever positions */}
      {label(X_GEAR + 20, 198, 36, 14, "UP", "#e8e8e0", 9)}
      {label(X_GEAR + 20, 304, 36, 14, "OFF", "#e8e8e0", 9)}
      {label(X_GEAR + 20, 395, 44, 14, "GEAR DN", "#e8e8e0", 8)}

      {/* ground lock-out tag */}
      {s.wow && (
        <Drawn x={X_GEAR + 68} y={464} w={136} h={16} z={0.12}
          drawKey="leverlock"
          draw={(c, w, h) => {
            c.fillStyle = "#c9c3ad";
            c.fillRect(0, 0, w, h);
            text(c, "LEVER LOCKS OUT OF UP ON GROUND", w / 2, h / 2, 6, "#2a2a2a");
          }}
        />
      )}

      {/* screws on plate corners (sample set) */}
      {[
        [20, 20], [1060, 20], [X_SB + 10, 20], [X_CREAM + 10, 20], [X_DARK + 10, 20], [X_GEAR + 10, 20],
        [20, 700], [1060, 700], [X_SB + 10, 700], [X_CREAM + 10, 700], [X_DARK + 10, 700], [X_GEAR + 140, 700],
        [F0 + 20, 20], [F0 + 950, 20], [F0 + 20, 700], [F0 + 950, 700],
      ].map(([x, y]) => screw(x, y))}

    </group>
  );
}

export function MipRemaining3D() {
  const s = useSimPick("fuelTank1", "fuelTank2", "fuelTankCenter");
  const d = useDerivedPick("dcPower", "epr1", "epr2");
  const m = useMip();
  const pw = !!d.dcPower;
  const e1 = d.epr1 ?? 1;
  const e2 = d.epr2 ?? 1;

  return (
    <group position={[0, 0, 0.09]}>
      <PanelDetails3D />
      {/* Standby instrument details missing from the earlier 3D pass. */}
      <StandbyIasStrip3D />
      <InstrumentStatusFlags3D />
      <Drawn x={X_SB + 95} y={554} w={120} h={12} z={0.12} drawKey="standby-att-label" draw={(c, w, h) => text(c, "STBY ATT", w / 2, h / 2, 8, "#d8d8d0")} />
      <FuelSelector3D />
      <EngineBlankCaps3D />
      <EngineAnnunciators3D />
      <GearFlapLimits3D />
      {/* Small blank switch/cutout beside the marker and speed-brake lenses. */}
      <Drawn x={1045} y={533} w={26} h={26} z={0.12} drawKey="marker-blank-square" draw={(c, w, h) => { c.fillStyle = "#0b0c0d"; c.fillRect(0, 0, w, h); c.strokeStyle = "#555a60"; c.strokeRect(0.5, 0.5, w - 1, h - 1); }} />
      {/* Flight instruments: ASI ALT VSI R/A RMI STBY + ADI/RA/QTY tests */}
      <FlightInstruments3D />
      {/* EPR counters */}
      <EprCounter3D cx={XL} cy={rows[0] - 26} value={e1} powered={pw} />
      <EprCounter3D cx={XR} cy={rows[0] - 26} value={e2} powered={pw} />

      {/* Fuel quantity LEDs (standby column) */}
      <QtyLed3D x={X_SB + 92 + 48} y={560 + 29} w={96} h={58} label="CTR TANK" value={s.fuelTankCenter ?? 0} />
      <QtyLed3D x={X_SB + 2 + 46} y={626 + 29} w={92} h={58} label="TANK 1" value={s.fuelTank1 ?? 0} />
      <QtyLed3D x={X_SB + 98 + 46} y={626 + 29} w={92} h={58} label="TANK 2" value={s.fuelTank2 ?? 0} />

      {/* Approach progress + DH lamps (captain and F/O) */}
      <ApproachProgress3D x={690 + 38} y={78 + 21} w={76} h={42} />
      <DhLamp3D x={644 + 10} y={92 + 10} />
      <ApproachProgress3D x={F0 + 666 + 65} y={64 + 16} w={130} h={32} />
      <DhLamp3D x={F0 + 612 + 10} y={92 + 10} />

      {/* BRAKE TEST */}
      <BrakeTest3D />

      {/* Yaw damper indicator + L/R test (dark panel, exact 2D coords) */}
      <YawDamper3D />

      {/* Oil qty test (dark panel, exact 2D coords) */}
      <OilQtyTest3D />

      {/* Cream legend strip for yaw / oil qty (matches 2D S x=X_DARK+8 y=20 w=190 h=24) */}
      <Drawn
        x={X_DARK + 8 + 95}
        y={20 + 12}
        w={190}
        h={24}
        z={0.12}
        drawKey="yawOilLegend"
        draw={(c, w, h) => {
          c.fillStyle = "#cfc9b6";
          c.fillRect(0, 0, w, h);
          text(c, "YAW DAMPER", w * 0.28, h / 2 - 4, 7, "#3a3a3a");
          text(c, "L  TEST  R", w * 0.28, h / 2 + 6, 6, "#3a3a3a");
          c.fillStyle = "#7a7566";
          c.fillRect(w * 0.52, 4, 1, h - 8);
          text(c, "ENG OIL", w * 0.76, h / 2 - 4, 7, "#3a3a3a");
          text(c, "QTY TEST", w * 0.76, h / 2 + 6, 6, "#3a3a3a");
        }}
      />

      {/* Glareshield caution/warning strip (2D GlareshieldPanel) */}
      {/* Lower strip: CaptainLower + FoLower + MiscControls (2D LowerStrip) */}
      <LowerMip3D />

      {/* Aircraft identity placards (exact 2D slots) */}
      <PlacardAc3D x={10} y={330} w={176} h={150} />
      <PlacardAc3D x={F0 + 842} y={336} w={112} h={150} compact />
      {/* Registration plates occupy the same two positions as the 2D source panel. */}
      <RegPlate3D x={226} y={550} w={170} h={26} reg="N267AU" />
      <RegPlate3D x={F0 + 440} y={640} w={170} h={26} reg="N267AU" />

      {/* Landing flaps prohibition placard (2D: RC,y=20,w=182,h=50) */}
      <Drawn
        x={X_DARK + 204 + 91}
        y={20 + 25}
        w={182}
        h={50}
        z={0.12}
        drawKey="flap40placard"
        draw={(c, w, h) => {
          c.fillStyle = "#d8d6cc";
          c.fillRect(0, 0, w, h);
          c.strokeStyle = "#8a8d90";
          c.lineWidth = 1;
          c.strokeRect(0.5, 0.5, w - 1, h - 1);
          text(c, "Landing flaps 40° prohibited", w / 2, h / 2 - 8, 8, "#2a2a2a");
          text(c, "except for emergency", w / 2, h / 2 + 8, 8, "#2a2a2a");
        }}
      />
    </group>
  );
}
