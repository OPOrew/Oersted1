import { useShallow } from "zustand/react/shallow";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { useSimPick, useDerivedPick } from "@/lib/sim/store";
import { useMip } from "@/lib/sim/mipLocal";

/**
 * 3D MIP milestone 3: interactive controls and text readouts, drawn as native three.js meshes with
 * canvas-drawn label textures (the SVG-to-texture path cannot be used for HTML controls).
 *
 * Contents: VHF NAV / COMPASS / VERTICAL GYRO selectors, captain + F/O bug knobs, three baro knobs,
 * antiskid INBD / OUTBD toggles, autobrake selector, antiskid INOP / AUTO BRAKE / PARK BRAKE lenses,
 * and the digital readouts under the engine / systems dials.
 *
 * Self-contained: reads the same zustand stores as the 2D panel and writes through the same setters
 * (`m.set`, `s.patch`), so the 2D panel and the 3D view always agree. Same design coordinates as
 * MainInstrumentPanel3D.tsx (3036 x 720 design px, y down, 100 px = 1 unit).
 *
 * UNTESTED: written without npm or a browser. Controls use click / press-and-hold on the left or
 * right half of a knob (like the 2D panel) rather than drag, so they do not fight the orbit camera.
 */

const K = 0.01;
const CW = 3036;
const CH = 720;
const F0 = 2064;
const X_SB = 1100;
const X_CREAM = 1300;
const X_DARK = 1510;
const RC = X_DARK + 204;
const XL = X_CREAM + 52, XR = X_CREAM + 150;
const D1 = X_DARK + 50, D2 = X_DARK + 150;
const KG = 33.8639;
const KG_TO_LB = 2.2046;
const AB = ["OFF", "MIN", "MED", "MAX", "RTO"];
export const wx = (x: number) => x * K - (CW * K) / 2;
export const wy = (y: number) => (CH * K) / 2 - y * K;

// Match PedestalParts.Annun so illuminated and unlit lenses use the 2D panel's exact palette.
export const TONE = { red: "#e03a3a", amber: "#e9a93a", green: "#38d27a", blue: "#5b9bff", white: "#f4f1e4" } as const;
export type Tone = keyof typeof TONE;
const TONE_BORDER_ON: Record<Tone, string> = { amber: "#a8741a", red: "#8c1c1c", green: "#1d7a45", blue: "#2c5da8", white: "#aaaaaa" };
const TONE_TEXT_ON: Record<Tone, string> = { amber: "#2a1b00", red: "#ffffff", green: "#03230f", blue: "#02112b", white: "#222222" };
const TONE_TEXT_OFF: Record<Tone, string> = { amber: "#d9a22b", red: "#d83a3a", green: "#3aa66a", blue: "#5b8fe0", white: "#d8d4c4" };

/* ───────────────────────── canvas-drawn textures ───────────────────────── */

const PX = 4; // texture pixels per design px
type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
const FONT = "ui-monospace, Menlo, Consolas, monospace";

export function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string) {
  ctx.font = `bold ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lines = s.split("\n");
  const lh = size * 1.1;
  lines.forEach((ln, i) => ctx.fillText(ln, x, y + (i - (lines.length - 1) / 2) * lh));
}

/** One persistent canvas texture; redrawn only when `key` changes (key must encode everything `draw` reads). */
function useDrawnTexture(w: number, h: number, key: string, draw: Draw) {
  const tex = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * PX));
    canvas.height = Math.max(1, Math.round(h * PX));
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, [w, h]);
  useLayoutEffect(() => {
    const canvas = tex.image as HTMLCanvasElement;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(PX, PX);
    draw(ctx, w, h);
    tex.needsUpdate = true;
  }, [tex, key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

/** A flat textured plane centred on design px (x, y). */
export function Drawn({ x, y, w, h, z, drawKey, draw }: { x: number; y: number; w: number; h: number; z: number; drawKey: string; draw: Draw }) {
  const tex = useDrawnTexture(w, h, drawKey, draw);
  return (
    <mesh position={[wx(x), wy(y), z]}>
      <planeGeometry args={[w * K, h * K]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

function Readout({ x, y, label, color = "#cfd3d8" }: { x: number; y: number; label: string; color?: string }) {
  return <Drawn x={x} y={y} w={84} h={14} z={0.125} drawKey={label + color} draw={(c, w, h) => text(c, label, w / 2, h / 2, 9, color)} />;
}

/* ───────────────────────── pointer helpers ───────────────────────── */

export function useCursor() {
  const gl = useThree((st) => st.gl);
  return {
    over: () => { gl.domElement.style.cursor = "pointer"; },
    out: () => { gl.domElement.style.cursor = ""; },
  };
}

/** Click = one step; hold = auto-repeat, accelerating. fire(dir, n) gets the repeat count (0 on the first click). */
function useHold(fire: (dir: -1 | 1, n: number) => void) {
  const fireRef = useRef(fire);
  useLayoutEffect(() => { fireRef.current = fire; });
  const timers = useRef<{ to?: number; iv?: number }>({});
  const stop = () => {
    window.clearTimeout(timers.current.to);
    window.clearInterval(timers.current.iv);
    timers.current = {};
  };
  useEffect(() => stop, []); // eslint-disable-line react-hooks/exhaustive-deps
  const start = (dir: -1 | 1, repeat: boolean) => {
    stop();
    let n = 0;
    fireRef.current(dir, n++);
    if (!repeat) return;
    timers.current.to = window.setTimeout(() => {
      timers.current.iv = window.setInterval(() => fireRef.current(dir, n++), 70);
    }, 380);
  };
  return { start, stop };
}

/** Two invisible hit pads (left = -1, right = +1) over a control of design size w x h. */
function HitPads({ w, h, z, repeat, hold }: { w: number; h: number; z: number; repeat: boolean; hold: ReturnType<typeof useHold> }) {
  const cur = useCursor();
  const pad = (dir: -1 | 1) => (
    <mesh
      key={dir}
      position={[(dir * w * K) / 4, 0, z]}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); hold.start(dir, repeat); }}
      onPointerUp={() => hold.stop()}
      onPointerOver={cur.over}
      onPointerOut={() => { hold.stop(); cur.out(); }}
    >
      <planeGeometry args={[(w * K) / 2, h * K]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
  return <group>{pad(-1)}{pad(1)}</group>;
}

/* ───────────────────────── controls ───────────────────────── */

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Rotary knob; pointer sweeps -135° .. +135° over min..max. Click left/right half to step, hold to repeat. */
function Knob3D({ x, y, r, value, min, max, step, onChange, repeat = true }: {
  x: number; y: number; r: number; value: number; min: number; max: number; step: number; onChange: (v: number) => void; repeat?: boolean;
}) {
  const grp = useRef<THREE.Group>(null);
  const angle = (-135 + (270 * (value - min)) / (max - min)) * (Math.PI / 180); // CW from up
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  useLayoutEffect(() => { valueRef.current = value; onChangeRef.current = onChange; });
  const hold = useHold((dir, n) => {
    const mult = repeat ? (n < 12 ? 1 : n < 30 ? 5 : 10) : 1;
    const cur = valueRef.current;
    onChangeRef.current(clamp(Math.round((cur + dir * step * mult) / step) * step, min, max));
  });
  useFrame(() => {
    const g = grp.current;
    if (!g) return;
    g.rotation.z += (-angle - g.rotation.z) * 0.25;
  });
  const rr = r * K;
  return (
    <group position={[wx(x), wy(y), 0.07]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.02]}>
        <cylinderGeometry args={[rr * 1.12, rr * 1.12, 0.04, 32]} />
        <meshStandardMaterial color="#0f1114" roughness={0.6} metalness={0.5} />
      </mesh>
      <group ref={grp}>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.07]}>
          <cylinderGeometry args={[rr * 0.9, rr, 0.1, 32]} />
          <meshStandardMaterial color="#1b1e23" roughness={0.35} metalness={0.8} />
        </mesh>
        <mesh position={[0, rr * 0.5, 0.125]}>
          <boxGeometry args={[rr * 0.16, rr * 0.7, 0.02]} />
          <meshStandardMaterial color="#f2f2ee" roughness={0.5} />
        </mesh>
      </group>
      <HitPads w={r * 2.6} h={r * 2.6} z={0.16} repeat={repeat} hold={hold} />
    </group>
  );
}

/** 3-position selector (0 / 1 / 2) with its name and legends. Click left / right of the knob to step. */
function Sel3D({ x, y, name, legends, value, onChange }: { x: number; y: number; name: string; legends: [string, string, string]; value: number; onChange: (v: number) => void }) {
  const grp = useRef<THREE.Group>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  useLayoutEffect(() => { valueRef.current = value; onChangeRef.current = onChange; });
  const hold = useHold((dir) => onChangeRef.current(clamp(valueRef.current + dir, 0, 2)));
  useFrame(() => {
    const g = grp.current;
    if (!g) return;
    const target = (1 - value) * (Math.PI / 4); // 0 = 45° left, 1 = up, 2 = 45° right
    g.rotation.z += (target - g.rotation.z) * 0.25;
  });
  return (
    <group>
      <Drawn
        x={x} y={y} w={124} h={92} z={0.066}
        drawKey={name + legends.join("|")}
        draw={(c, w) => {
          text(c, name, w / 2, 9, 9, "#e8e8e0");
          text(c, legends[0], w / 2 - 40, 74, 7.5, "#d8d8d0");
          text(c, legends[1], w / 2, 80, 7.5, "#d8d8d0");
          text(c, legends[2], w / 2 + 40, 74, 7.5, "#d8d8d0");
        }}
      />
      <group position={[wx(x), wy(y + 2), 0.07]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.02]}>
          <cylinderGeometry args={[0.2, 0.2, 0.04, 32]} />
          <meshStandardMaterial color="#0f1114" roughness={0.6} metalness={0.5} />
        </mesh>
        <group ref={grp}>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.07]}>
            <cylinderGeometry args={[0.15, 0.17, 0.1, 32]} />
            <meshStandardMaterial color="#1b1e23" roughness={0.35} metalness={0.8} />
          </mesh>
          <mesh position={[0, 0.1, 0.125]}>
            <boxGeometry args={[0.05, 0.2, 0.02]} />
            <meshStandardMaterial color="#f2f2ee" roughness={0.5} />
          </mesh>
        </group>
        <HitPads w={80} h={52} z={0.16} repeat={false} hold={hold} />
      </group>
    </group>
  );
}

/** Two-position toggle lever. Up = on. */
export function Toggle3D({ x, y, name, on, onChange, upLabel, downLabel }: { x: number; y: number; name: string; on: boolean; onChange: (v: boolean) => void; upLabel: string; downLabel: string }) {
  const lever = useRef<THREE.Group>(null);
  const cur = useCursor();
  useFrame(() => {
    const g = lever.current;
    if (!g) return;
    g.rotation.x += ((on ? -0.55 : 0.55) - g.rotation.x) * 0.3;
  });
  return (
    <group>
      <Drawn
        x={x} y={y} w={72} h={100} z={0.066}
        drawKey={name + upLabel + downLabel}
        draw={(c, w) => {
          text(c, name, w / 2, 8, 8, "#e8e8e0");
          text(c, upLabel, w / 2, 22, 7, "#d8d8d0");
          text(c, downLabel, w / 2, 90, 7, "#d8d8d0");
        }}
      />
      <group position={[wx(x), wy(y), 0.07]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.02]}>
          <cylinderGeometry args={[0.13, 0.13, 0.04, 24]} />
          <meshStandardMaterial color="#0f1114" roughness={0.5} metalness={0.7} />
        </mesh>
        <group ref={lever} position={[0, 0, 0.04]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.12]}>
            <cylinderGeometry args={[0.035, 0.035, 0.24, 12]} />
            <meshStandardMaterial color="#c9cbce" roughness={0.3} metalness={0.9} />
          </mesh>
          <mesh position={[0, 0, 0.25]}>
            <sphereGeometry args={[0.07, 16, 12]} />
            <meshStandardMaterial color="#c9cbce" roughness={0.3} metalness={0.9} />
          </mesh>
        </group>
        <mesh
          position={[0, 0, 0.2]}
          onPointerDown={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); onChange(!on); }}
          onPointerOver={cur.over}
          onPointerOut={cur.out}
        >
          <planeGeometry args={[0.5, 0.9]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}

/** Annunciator lens: dark when off, lit tone colour when on. */
export function Lens3D({ x, y, w, h, label, on, tone }: { x: number; y: number; w: number; h: number; label: string; on: boolean; tone: Tone }) {
  return (
    <Drawn
      x={x} y={y} w={w} h={h} z={0.068}
      drawKey={`${label}|${on}|${tone}`}
      draw={(c, ww, hh) => {
        c.fillStyle = "#000";
        c.fillRect(0, 0, ww, hh);
        c.fillStyle = on ? TONE[tone] : "#0b0c0d";
        c.fillRect(1.5, 1.5, ww - 3, hh - 3);
        c.strokeStyle = on ? TONE_BORDER_ON[tone] : "#55585c";
        c.lineWidth = 1;
        c.strokeRect(1.5, 1.5, ww - 3, hh - 3);
        text(c, label, ww / 2, hh / 2, 7.5, on ? TONE_TEXT_ON[tone] : TONE_TEXT_OFF[tone]);
      }}
    />
  );
}

/* ───────────────────────── assembled layer ───────────────────────── */

export function MipControls3D() {
  const s = useSimPick("antiskidInbd", "antiskidOutbd", "autobrake", "egt1", "egt2", "ff1", "ff2", "hydAPress", "hydBPress", "ltTest", "n1_1", "n1_2", "n2_1", "n2_2", "oilPsi1", "oilPsi2", "oilQty2", "parkingBrake", "patch", "psBaroCaptHpa", "psBaroFoHpa", "psBaroStbyHpa");
  const d = useDerivedPick("antiskidInbdOperational", "antiskidOutbdOperational", "autobrakeActive", "autobrakeArmed", "autobrakeDisarm", "dcPower", "eng1Running");
  const m = useMip(useShallow((st) => ({ bugCapt: st.bugCapt, bugFo: st.bugFo, compSel: st.compSel, gyroSel: st.gyroSel, lightKey: st.lightKey, navSel: st.navSel, oilQtyTest: st.oilQtyTest, set: st.set })));
  const pw = !!d.dcPower;
  const test = !!(d.dcPower && (s.ltTest || m.lightKey === 2));
  const lit = (on: boolean) => test || (pw && on);

  const hgC = s.psBaroCaptHpa / KG;
  const hgF = s.psBaroFoHpa / KG;
  const hgS = s.psBaroStbyHpa / KG;
  const ppH = (kg: number) => Math.round(Math.max(0, kg) * KG_TO_LB);
  const oilT = (run: boolean, n2: number) => Math.round(d.dcPower || run ? 30 + Math.min(100, n2) * 0.95 : 20);
  const qtyGal = (q: number) => (m.oilQtyTest ? 4 : q / 20);

  // digital readouts under the dials: same strings as the 2D captions (EPR has none)
  const cream = "#1d1f22";
  const readouts: [number, number, string, string?][] = [
    [XL, 270, `${s.n1_1.toFixed(1)}%`, cream], [XR, 270, `${s.n1_2.toFixed(1)}%`, cream],
    [XL, 474, `${s.n2_1.toFixed(1)}%`, cream], [XR, 474, `${s.n2_2.toFixed(1)}%`, cream],
    [XL, 576, `${ppH(s.ff1)} pph`, cream], [XR, 576, `${ppH(s.ff2)} pph`, cream],
    [D1, 276, `${Math.round(s.oilPsi1)} psi`], [D2, 276, `${Math.round(s.oilPsi2)} psi`],
    [D1, 374, `${oilT(d.eng1Running, s.n2_1)}°C`], [D2, 374, `${Math.round(s.egt2)}°C`],
    [D1, 472, `${Math.round(s.egt1)}°C`], [D2, 472, `${qtyGal(s.oilQty2).toFixed(1)} gal`],
    [D1, 570, `${Math.round(s.hydAPress)} psi`], [D2, 570, `${Math.round(s.hydBPress)} psi`],
  ];

  const bug = (x: number, y: number, v: number, set: (n: number) => void) => (
    <group>
      <Knob3D x={x + 13} y={y + 15} r={13} value={v} min={60} max={340} step={1} onChange={(n) => set(Math.round(n))} />
      <Drawn x={x + 56} y={y + 15} w={60} h={12} z={0.066} drawKey={`BUG ${Math.round(v)}`} draw={(c, w, h) => text(c, `BUG ${Math.round(v)}`, w / 2, h / 2, 8, "#e8e8e0")} />
    </group>
  );
  const baro = (x: number, y: number, hg: number, set: (n: number) => void) => (
    <group>
      <Knob3D x={x + 13} y={y + 15} r={13} value={hg} min={28.5} max={31} step={0.01} onChange={(n) => set(+n.toFixed(2))} />
      <Drawn x={x + 62} y={y + 15} w={72} h={12} z={0.066} drawKey={`BARO ${hg.toFixed(2)}`} draw={(c, w, h) => text(c, `BARO ${hg.toFixed(2)}`, w / 2, h / 2, 8, "#e8e8e0")} />
    </group>
  );

  const acBrake = d.autobrakeActive ? "AUTO BRK" : d.autobrakeDisarm ? "DISARM" : d.autobrakeArmed ? "ARMED" : "AUTO BRAKE";

  return (
    <group position={[0, 0, 0.09]}>{/* lifted so controls clear the bezel boxes (top at z 0.15) */}
      {/* NAV / COMPASS / GYRO source selectors (bezel 690,618 400x98) */}
      <Sel3D x={757} y={662} name="VHF NAV" legends={["BOTH\nON 1", "NORMAL", "BOTH\nON 2"]} value={m.navSel} onChange={(v) => m.set({ navSel: v })} />
      <Sel3D x={890} y={662} name="COMPASS" legends={["BOTH\nON 1", "NORMAL", "BOTH\nON 2"]} value={m.compSel} onChange={(v) => m.set({ compSel: v })} />
      <Sel3D x={1023} y={662} name="VERTICAL GYRO" legends={["CAPT\nON AUX", "NORMAL", "F/O\nON AUX"]} value={m.gyroSel} onChange={(v) => m.set({ gyroSel: v })} />

      {/* bug and baro knobs, positions from the 2D layout */}
      {bug(210, 300, m.bugCapt, (n) => m.set({ bugCapt: n }))}
      {bug(F0 + 180, 418, m.bugFo, (n) => m.set({ bugFo: n }))}
      {baro(900, 382, hgC, (n) => s.patch({ psBaroCaptHpa: n * KG }))}
      {baro(X_SB + 50, 340, hgS, (n) => s.patch({ psBaroStbyHpa: n * KG }))}
      {baro(F0 + 656, 500, hgF, (n) => s.patch({ psBaroFoHpa: n * KG }))}

      {/* antiskid INOP lenses */}
      <Lens3D x={RC + 46} y={259} w={86} h={30} label={"ANTI SKID\nINOP"} on={lit(!d.antiskidInbdOperational)} tone="amber" />
      <Lens3D x={RC + 137} y={259} w={86} h={30} label={"ANTI SKID\nINOP"} on={lit(!d.antiskidOutbdOperational)} tone="amber" />

      {/* antiskid switches */}
      <Drawn x={RC + 91} y={342} w={182} h={116} z={0.062} drawKey="antiskid-plate" draw={(c, w, h) => { c.fillStyle = "#2f3744"; c.fillRect(0, 0, w, h); text(c, "ANTISKID", w / 2, 10, 9, "#e8e8e0"); }} />
      <Toggle3D x={RC + 45} y={360} name="INBD" on={!!s.antiskidInbd} upLabel="ON" downLabel="OFF" onChange={(v) => s.patch({ antiskidInbd: v }, v ? "Inboard antiskid ON." : "Inboard antiskid OFF — autobrake unavailable.")} />
      <Toggle3D x={RC + 137} y={360} name="OUTBD" on={!!s.antiskidOutbd} upLabel="ON" downLabel="OFF" onChange={(v) => s.patch({ antiskidOutbd: v }, v ? "Outboard antiskid ON." : "Outboard antiskid OFF — autobrake unavailable.")} />

      {/* autobrake selector */}
      <Drawn
        x={RC + 91} y={469} w={182} h={122} z={0.062} drawKey="autobrake-plate"
        draw={(c, w, h) => {
          c.fillStyle = "#2f3744";
          c.fillRect(0, 0, w, h);
          text(c, "AUTO BRAKE", w / 2, 9, 8, "#e8e8e0");
          const cx = w / 2, cy = 57;
          AB.forEach((t, i) => {
            const a = ((-135 + 67.5 * i) * Math.PI) / 180;
            text(c, t, cx + Math.sin(a) * 36, cy - Math.cos(a) * 34, 7, "#d8d8d0");
          });
        }}
      />
      <Knob3D
        x={RC + 91} y={466} r={16} value={s.autobrake} min={0} max={4} step={1} repeat={false}
        onChange={(v) => s.patch({ autobrake: v as 0 | 1 | 2 | 3 | 4, autobrakeTestTimer: 0, autobrakeRtoArmed: false }, `AUTOBRAKE → ${AB[v]}`)}
      />
      <Lens3D x={RC + 47} y={514} w={84} h={22} label={acBrake} on={lit(d.autobrakeActive || d.autobrakeDisarm || d.autobrakeArmed)} tone={d.autobrakeDisarm ? "amber" : "green"} />
      <Lens3D x={RC + 135} y={514} w={84} h={22} label="PARK BRAKE" on={!!s.parkingBrake} tone="red" />

      {/* digital readouts under the dials */}
      {readouts.map(([x, y, label, color], i) => <Readout key={i} x={x} y={y + 49} label={label} color={color} />)}
    </group>
  );
}
