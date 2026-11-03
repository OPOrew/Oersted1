import { useShallow } from "zustand/react/shallow";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { useSim, useSimPick, useDerivedPick } from "@/lib/sim/store";
import { useMip } from "@/lib/sim/mipLocal";
import { computeAirData, type SideAirData } from "@/lib/sim/pitotStatic";
import { NO_NAV } from "@/lib/sim/radionav";
import { sourcesOf } from "@/lib/sim/sources";
import { AdiReal, AltReal, AsiReal, HsiReal, RmiReal, adiNavFrom } from "@/components/panel/instruments";
import { Attitude, VerticalSpeed } from "@/components/panel/SixPack";
import { FlapDial, HeightDial, MainInstrumentPanel } from "@/components/panel/MainInstrumentPanel";
import { Dial } from "@/components/panel/EngineInstrumentPanel";
import { Drawn, MipControls3D, text } from "@/components/panel/MainInstrumentPanel3DControls";
import { MipAnnunciators3D } from "@/components/panel/MainInstrumentPanel3DAnnunciators";
import { MipRemaining3D } from "@/components/panel/MainInstrumentPanel3DRemaining";
import { GlareshieldHood, GlareshieldHost } from "@/components/panel/MainInstrumentPanel3DGlareshield";
import { usePedestal } from "@/lib/sim/pedestal";
import { angDiff } from "@/lib/sim/autoflight";

/**
 * WebGL (three.js) main instrument panel, milestone 1.
 *
 * What is real 3D here: the panel plate, raised bezels with depth, retaining rings, glass with
 * reflections, screws, the glareshield hood, lighting and orbit camera.
 *
 * What is reused from the 2D panel: the instrument faces. ASI, ALT, VSI, ADI, HSI, height dial,
 * standby ALT and standby attitude are the SAME React/SVG components as the 2D panel, fed from the
 * same sim stores. They are rendered in a hidden DOM host and copied into WebGL textures ~7x/second.
 *
 * The 2D MainInstrumentPanel is kept mounted off-screen on purpose: attitude, heading, radio-nav and
 * autoflight models are stepped by effects inside that component, so unmounting it would freeze them.
 *
 * Milestone 3 (MainInstrumentPanel3DControls.tsx) adds selectors, bug / baro knobs, antiskid / autobrake controls and dial readouts.
 * Milestone 2 adds the engine / oil / hydraulic dials and flap gauge (same Dial / FlapDial components), emissive gear lights
 * and a clickable 3D gear lever (first interactive 3D control; same lock-out rule as the 2D lever).
 *
 * Layout uses the 2D design coordinates (canvas 3036 x 720 design px, y down), 100 design px = 1 unit.
 */

const K = 0.01;
const CW = 3036;
const CH = 720;
const F0 = 2064;
const X_SB = 1100;
const X_CREAM = 1300;
const X_DARK = 1510;
const X_GEAR = 1912;
const wx = (x: number) => x * K - (CW * K) / 2;
const wy = (y: number) => (CH * K) / 2 - y * K;
const KG = 33.8639;
const KG_TO_LB = 2.2046;
const XL = X_CREAM + 52, XR = X_CREAM + 150; // cream strip dial columns (design px)
const D1 = X_DARK + 50, D2 = X_DARK + 150; // dark panel dial columns
const RC = X_DARK + 204; // right column (flap gauge) left edge
const GREEN = "#2fc27a", RED = "#e24b4b", AMBER = "#e0a84a";

type Face = { key: string; cx: number; cy: number; w: number; h: number; round: boolean; px: [number, number] };

const round = (key: string, cx: number, cy: number, r: number, px = 768): Face => ({ key, cx, cy, w: r * 2, h: r * 2, round: true, px: [px, px] });
const rect = (key: string, x: number, y: number, w: number, h: number): Face => ({ key, cx: x + w / 2, cy: y + h / 2, w, h, round: false, px: [Math.round(w * 2.5), Math.round(h * 2.5)] });

const FACES: Face[] = [
  round("c-asi", 306, 195, 104),
  rect("c-adi", 432, 88, 242, 254),
  rect("c-hsi", 437, 402, 232, 202),
  round("c-ht", 785, 282, 76),
  round("c-alt", 988, 288, 73),
  round("c-vsi", 785, 515, 74),
  rect("c-rmi", 234, 347, 154, 176),
  rect("f-rmi", F0 + 202, 460, 154, 176),
  round("sb-alt", X_SB + 95, 206, 70),
  round("sb-att", X_SB + 95, 451, 66),
  round("f-asi", F0 + 274, 315, 104),
  rect("f-adi", F0 + 400, 88, 242, 254),
  rect("f-hsi", F0 + 405, 402, 232, 202),
  round("f-ht", F0 + 731, 228, 76),
  round("f-vsi", F0 + 894, 230, 74),
  round("f-alt", F0 + 731, 434, 73),
  // cream engine strip (EPR, N1, N2, fuel flow)
  round("epr1", XL, 168, 45, 256), round("epr2", XR, 168, 45, 256),
  round("n1-1", XL, 270, 45, 256), round("n1-2", XR, 270, 45, 256),
  round("n2-1", XL, 474, 45, 256), round("n2-2", XR, 474, 45, 256),
  round("ff1", XL, 576, 45, 256), round("ff2", XR, 576, 45, 256),
  // dark systems panel (oil, EGT, hydraulics)
  round("oilp1", D1, 276, 45, 256), round("oilp2", D2, 276, 45, 256),
  round("oilt1", D1, 374, 45, 256), round("egt2", D2, 374, 45, 256),
  round("egt1", D1, 472, 45, 256), round("oilq2", D2, 472, 45, 256),
  round("hydA", D1, 570, 45, 256), round("hydB", D2, 570, 45, 256),
  // flap gauge
  round("flap", RC + 91, 137, 42, 256),
  // F/O HYD QTY: 90px SVG centred in the wider 2D mounting bezel
  round("hydQty", F0 + 83, 543, 46, 256),
];

/** Bezel boxes copied from the 2D layout: x, y, w, h (design px). */
const BEZELS: [number, number, number, number][] = [
  [24, 500, 152, 152], [188, 77, 236, 236], [230, 343, 162, 184], [428, 84, 250, 262], [433, 398, 240, 210],
  [774, 14, 300, 164], [695, 192, 180, 214], [896, 190, 184, 220], [700, 430, 170, 170], [886, 420, 104, 190], [690, 618, 400, 98],
  [X_SB + 20, 116, 150, 224], [X_SB + 20, 376, 150, 150],
  [F0 + 10, 14, 292, 164], [F0 + 10, 190, 146, 170], [F0 + 156, 197, 236, 236], [F0 + 198, 456, 162, 184], [F0 + 10, 468, 146, 150],
  [F0 + 396, 84, 250, 262], [F0 + 401, 398, 240, 210], [F0 + 650, 132, 162, 196], [F0 + 816, 145, 156, 170], [F0 + 650, 339, 162, 190], [F0 + 816, 540, 152, 152],
];

/** Plates for areas that are not built yet (engine cluster, systems, gear): geometry only, no live content. */
const PLATES: { x: number; y: number; w: number; h: number; color: string }[] = [
  // The standby column reaches the panel bottom; the engine and gear plates stop at y=640,
  // matching the 2D panel's separate plates rather than extending onto the lower trim.
  { x: X_SB - 6, y: 14, w: 198, h: 690, color: "#39414d" },
  { x: X_CREAM, y: 14, w: 200, h: 626, color: "#b9b295" },
  { x: X_DARK, y: 14, w: 392, h: 626, color: "#262b33" },
  { x: X_GEAR - 4, y: 14, w: 148, h: 626, color: "#39414d" },
];

/** [centerX design-px, horizontal span design-px]. FULL span kept modest so portrait phones still frame the panel. */
// GLARE also gives a centre y and visible height (design px) because the glareshield sits above the 720-high panel.
const PRESETS: Record<"FULL" | "CAPT" | "CENTRE" | "F/O" | "GLARE" | "LOWER", readonly [number, number, number?, number?]> = {
  FULL: [CW / 2, 2200], CAPT: [560, 1100], CENTRE: [1510, 900], "F/O": [F0 + 500, 1100], GLARE: [CW / 2, 1500, -116, 240], LOWER: [CW / 2, 3100, 880, 340],
};
type PresetName = keyof typeof PRESETS;

type Tex = { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture };

/* ───────────────────────── live instrument faces (hidden DOM host) ───────────────────────── */

function FaceHost({ nodes }: { nodes: Record<string, ReactNode> }) {
  return (
    <div aria-hidden style={{ position: "fixed", left: -20000, top: 0, width: 1400, height: 1400, overflow: "hidden", pointerEvents: "none", opacity: 0 }}>
      {FACES.map((f) => (
        <div
          key={f.key}
          data-face={f.key}
          style={{ width: f.w, height: f.h, flex: "none", overflow: "visible" }}
        >
          {nodes[f.key]}
        </div>
      ))}
    </div>
  );
}

// Cache by texture, not by face key: a newly mounted 3D panel has fresh canvases and
// must receive its first frame even when the serialized SVG hasn't changed.
const lastXml = new WeakMap<THREE.CanvasTexture, string>();

async function drawFace(face: Face, host: HTMLElement, tex: Tex) {
  const svg = host.querySelector(`[data-face="${face.key}"] svg`) as SVGSVGElement | null;
  if (!svg) return;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  // Keep the SVG's actual 2D design dimensions. The destination canvas is high-resolution;
  // stretching the SVG root to that pixel size shifts CSS transform-origin values on needles.
  clone.setAttribute("width", String(face.w));
  clone.setAttribute("height", String(face.h));
  const xml = new XMLSerializer().serializeToString(clone);
  if (lastXml.get(tex.texture) === xml) return; // unchanged face: skip decode + upload
  const img = new Image();
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error(`SVG texture decode failed: ${face.key}`));
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
  });
  const ctx = tex.canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, tex.canvas.width, tex.canvas.height);
  ctx.drawImage(img, 0, 0, tex.canvas.width, tex.canvas.height);
  tex.texture.needsUpdate = true;
  // Only mark it cached after decode and upload succeeded, so a failed first frame can retry.
  lastXml.set(tex.texture, xml);
}

function useFaceTextures(hostRef: MutableRefObject<HTMLDivElement | null>) {
  const textures = useMemo(() => {
    const map: Record<string, Tex> = {};
    for (const f of FACES) {
      const canvas = document.createElement("canvas");
      canvas.width = f.px[0];
      canvas.height = f.px[1];
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      map[f.key] = { canvas, texture };
    }
    return map;
  }, []);
  useEffect(() => {
    let busy = false;
    const tick = async () => {
      const host = hostRef.current;
      if (busy || !host || document.hidden) return;
      busy = true;
      try {
        for (const f of FACES) {
          try { await drawFace(f, host, textures[f.key]); } catch { /* keep the previous frame */ }
        }
      } finally { busy = false; }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 140);
    return () => window.clearInterval(id);
  }, [hostRef, textures]);
  useEffect(() => () => { for (const t of Object.values(textures)) t.texture.dispose(); }, [textures]);
  return textures;
}

/* ───────────────────────── 3D scene ───────────────────────── */

function Environment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.background = new THREE.Color("#0b0d10");
    return () => { scene.environment = null; env.dispose(); pmrem.dispose(); };
  }, [gl, scene]);
  return null;
}

function Controls({ preset, nonce }: { preset: PresetName; nonce: number }) {
  const { camera, gl, size } = useThree();
  const controls = useRef<OrbitControls | null>(null);
  const goal = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const aspect = size.width / Math.max(1, size.height);

  useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement);
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.minDistance = 2;
    c.maxDistance = 60;
    c.maxPolarAngle = Math.PI * 0.62;
    c.minPolarAngle = Math.PI * 0.15;
    c.addEventListener("start", () => { goal.current = null; });
    controls.current = c;
    return () => { c.dispose(); controls.current = null; };
  }, [camera, gl]);

  useEffect(() => {
    const [xc, span, yc, hh] = PRESETS[preset];
    const glare = yc !== undefined && hh !== undefined;
    const cam = camera as THREE.PerspectiveCamera;
    const t = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    const halfW = (span * K) / 2;
    const halfH = (((glare ? hh : CH) * K) / 2) * 1.15;
    // Portrait (aspect < 1): fit height so the panel fills the phone; landscape: fit width.
    // Cap distance so OrbitControls maxDistance is not the only limiter.
    const distH = halfH / t;
    const distW = halfW / (t * Math.max(aspect, 0.35));
    const dist = Math.min(55, aspect < 0.85 && !glare ? distH * 1.05 : Math.max(distH, distW));
    // Slight upward bias so the glareshield sits nearer the top of a tall phone screen.
    const targetY = glare ? wy(yc) : aspect < 0.85 ? 0.35 : 0;
    goal.current = { pos: new THREE.Vector3(wx(xc), targetY, dist), target: new THREE.Vector3(wx(xc), targetY, 0) };
  }, [preset, nonce, aspect, camera]);

  useFrame(() => {
    const c = controls.current;
    if (!c) return;
    const g = goal.current;
    if (g) {
      camera.position.lerp(g.pos, 0.14);
      c.target.lerp(g.target, 0.14);
      if (camera.position.distanceTo(g.pos) < 0.02 && c.target.distanceTo(g.target) < 0.02) goal.current = null;
    }
    c.update();
  });
  return null;
}

function Bezels() {
  const screws = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = screws.current;
    if (!m) return;
    const o = new THREE.Object3D();
    let i = 0;
    for (const [x, y, w, h] of BEZELS) {
      for (const [sx, sy] of [[10, 10], [w - 10, 10], [10, h - 10], [w - 10, h - 10]]) {
        o.position.set(wx(x + sx), wy(y + sy), 0.155);
        o.rotation.set(Math.PI / 2, 0, 0);
        o.updateMatrix();
        m.setMatrixAt(i++, o.matrix);
      }
    }
    m.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <group>
      {BEZELS.map(([x, y, w, h], i) => (
        <mesh key={i} position={[wx(x + w / 2), wy(y + h / 2), 0.075]}>
          <boxGeometry args={[w * K, h * K, 0.15]} />
          <meshStandardMaterial color="#2f3744" roughness={0.55} metalness={0.25} />
        </mesh>
      ))}
      <instancedMesh ref={screws} args={[undefined, undefined, BEZELS.length * 4]}>
        <cylinderGeometry args={[0.035, 0.035, 0.02, 12]} />
        <meshStandardMaterial color="#171b21" roughness={0.4} metalness={0.8} />
      </instancedMesh>
    </group>
  );
}

function FaceMesh({ face, tex }: { face: Face; tex: Tex }) {
  const w = face.w * K;
  const h = face.h * K;
  const x = wx(face.cx);
  const y = wy(face.cy);
  // Smaller gauges need a proportionally finer rim, or the two engine dials can touch/overlap.
  const ringTube = Math.min(0.035, w * 0.012);
  const ringRadius = w / 2 + ringTube + 0.01;
  return (
    <group position={[x, y, 0]}>
      {face.round ? (
        <>
          {/* Backing cylinder ends at z=.15. The live 2D face must sit in front of it;
              previously it was at z=.10 and the cylinder cap hid every gauge marking. */}
          <mesh position={[0, 0, 0.075]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[w / 2 + 0.02, w / 2 + 0.02, 0.15, 64]} />
            <meshStandardMaterial color="#101317" roughness={0.6} metalness={0.4} />
          </mesh>
          <mesh position={[0, 0, 0.16]}>
            <planeGeometry args={[w, h]} />
            <meshBasicMaterial map={tex.texture} transparent toneMapped={false} depthWrite={false} />
          </mesh>
          <mesh position={[0, 0, 0.185]}>
            <torusGeometry args={[ringRadius, ringTube, 16, 72]} />
            <meshStandardMaterial color="#1b2026" roughness={0.3} metalness={0.9} />
          </mesh>
          <mesh position={[0, 0, 0.205]}>
            <circleGeometry args={[w / 2, 64]} />
            <meshPhysicalMaterial transparent opacity={0.045} roughness={0.02} metalness={0} clearcoat={1} clearcoatRoughness={0.02} depthWrite={false} />
          </mesh>
        </>
      ) : (
        <>
          <mesh position={[0, 0, 0.145]}>
            <boxGeometry args={[w + 0.12, h + 0.12, 0.02]} />
            <meshStandardMaterial color="#14171c" roughness={0.45} metalness={0.7} />
          </mesh>
          <mesh position={[0, 0, 0.158]}>
            <planeGeometry args={[w, h]} />
            {/* Preserve exact 2D colors; the separate glass sheet provides the 3D finish. */}
            <meshBasicMaterial map={tex.texture} transparent toneMapped={false} depthWrite={false} />
          </mesh>
          <mesh position={[0, 0, 0.17]}>
            <planeGeometry args={[w, h]} />
            <meshPhysicalMaterial transparent opacity={0.05} roughness={0.02} clearcoat={1} clearcoatRoughness={0.02} depthWrite={false} />
          </mesh>
        </>
      )}
    </group>
  );
}


/* ───────────────────────── gear lights + lever ───────────────────────── */

type GearPos = "UP" | "OFF" | "DN";
const GEAR_ORDER: GearPos[] = ["UP", "OFF", "DN"];
const GEAR_FRAC = [0.15, 0.5, 0.8]; // fraction down the slot, same detents as the 2D lever
const LEVER = { x: X_GEAR + 70, top: 152 + 0.03 * 304, len: 0.93 * 304 }; // slot geometry (design px)

function Lamp({ x, y, on, tone }: { x: number; y: number; on: boolean; tone: "red" | "green" }) {
  const lit = tone === "red" ? "#a52626" : "#2aa56a";
  const dark = "#34373a";
  return (
    <mesh position={[wx(x), wy(y), 0.095]}>
      <boxGeometry args={[0.6, 0.24, 0.07]} />
      <meshStandardMaterial color={on ? lit : dark} emissive={on ? (tone === "red" ? "#7d1717" : "#17663c") : "#000"} emissiveIntensity={on ? 0.45 : 0} roughness={0.35} />
    </mesh>
  );
}

function GearLights({ lights, test }: { lights: GearLightsState; test: boolean }) {
  const pairs: { x: number; y: number; label: string; state: LampPair }[] = [
    { x: X_GEAR + 70, y: 22, label: "NOSE GEAR", state: lights.nose },
    { x: X_GEAR + 36, y: 87, label: "LEFT GEAR", state: lights.leftMain },
    { x: X_GEAR + 104, y: 87, label: "RIGHT GEAR", state: lights.rightMain },
  ];
  const lens = (x: number, y: number, label: string, on: boolean, tone: "red" | "green") => (
    <Drawn
      x={x} y={y} w={64} h={26} z={0.14}
      drawKey={`gear-lens:${label}:${tone}:${on}`}
      draw={(c, w, h) => {
        const bg = on ? (tone === "red" ? "#e03a3a" : "#38d27a") : "#0b0c0d";
        const border = on ? (tone === "red" ? "#8c1c1c" : "#1d7a45") : "#55585c";
        const fg = on ? (tone === "red" ? "#ffffff" : "#03230f") : (tone === "red" ? "#d83a3a" : "#3aa66a");
        c.fillStyle = bg;
        c.fillRect(0, 0, w, h);
        c.strokeStyle = border;
        c.lineWidth = 1.4;
        c.strokeRect(0.7, 0.7, w - 1.4, h - 1.4);
        text(c, label, w / 2, h / 2, 7, fg);
      }}
    />
  );
  return (
    <group>
      {pairs.map(({ x, y, label, state }) => (
        <group key={label}>
          <mesh position={[wx(x), wy(y + 27), 0.065]}>
            <boxGeometry args={[0.68, 0.58, 0.02]} />
            <meshStandardMaterial color="#05070a" roughness={0.8} />
          </mesh>
          <Lamp x={x} y={y + 13} on={test || state.red} tone="red" />
          <Lamp x={x} y={y + 41} on={test || state.green} tone="green" />
          {lens(x, y + 13, label, test || state.red, "red")}
          {lens(x, y + 41, label, test || state.green, "green")}
        </group>
      ))}
    </group>
  );
}

function GearLever({ pos, onSelect }: { pos: GearPos; onSelect: (p: GearPos) => void }) {
  const knob = useRef<THREE.Group>(null);
  const yTarget = (p: GearPos) => wy(LEVER.top + GEAR_FRAC[GEAR_ORDER.indexOf(p)] * LEVER.len);
  // y is driven only here (not through the JSX prop) so a re-render never snaps the knob and the slide stays smooth
  useLayoutEffect(() => { if (knob.current) knob.current.position.y = yTarget(pos); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame(() => {
    const k = knob.current;
    if (!k) return;
    k.position.y += (yTarget(pos) - k.position.y) * 0.18;
  });
  const next = () => onSelect(GEAR_ORDER[(GEAR_ORDER.indexOf(pos) + 1) % GEAR_ORDER.length]);
  const cx = wx(LEVER.x);
  const cy = wy(LEVER.top + LEVER.len / 2);
  return (
    <group>
      {/* grey lever plate, light slot, black guide */}
      <mesh position={[wx(X_GEAR + 68), wy(152 + 152), 0.065]}>
        <boxGeometry args={[1.36, 3.04, 0.02]} />
        <meshStandardMaterial color="#6a6d71" roughness={0.6} metalness={0.2} />
      </mesh>
      <mesh position={[cx, cy, 0.08]} onClick={(e) => { e.stopPropagation(); next(); }}>
        <boxGeometry args={[0.46, LEVER.len * K, 0.02]} />
        <meshStandardMaterial color="#c9cbce" roughness={0.5} metalness={0.3} />
      </mesh>
      <mesh position={[cx, cy, 0.095]}>
        <boxGeometry args={[0.08, LEVER.len * K * 0.8, 0.02]} />
        <meshStandardMaterial color="#0b0d0f" roughness={0.9} />
      </mesh>
      {/* brass wheel knob + black handle */}
      <group ref={knob} position={[cx, 0, 0.2]}>
        <mesh scale={[1, 1.4, 0.55]} onClick={(e) => { e.stopPropagation(); next(); }}>
          <sphereGeometry args={[0.2, 32, 24]} />
          <meshStandardMaterial color="#c9b75c" roughness={0.28} metalness={0.85} />
        </mesh>
        <mesh position={[0, -0.36, -0.02]} onClick={(e) => { e.stopPropagation(); next(); }}>
          <boxGeometry args={[0.1, 0.34, 0.1]} />
          <meshStandardMaterial color="#0f1114" roughness={0.6} />
        </mesh>
      </group>
    </group>
  );
}

type LampPair = { red: boolean; green: boolean };
type GearLightsState = { nose: LampPair; leftMain: LampPair; rightMain: LampPair };

/** Flood-light glow of one zone: the 2D radial-gradient(ellipse at 50% 0%) as a soft texture, so it fades out instead of ending in a hard edge across the instruments. */
function FloodWash({ x, w, flood }: { x: number; w: number; flood: number }) {
  const q = Math.round(flood * 50) / 50;
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 128; c.height = 128;
    const g = c.getContext("2d");
    if (g) {
      // unit circle stretched to the 2D "farthest-corner" ellipse centred on the top edge
      g.setTransform(64 * 1.414, 0, 0, 128 * 1.414, 64, 0);
      const grad = g.createRadialGradient(0, 0, 0, 0, 0, 1);
      grad.addColorStop(0, `rgba(255,214,150,${(q * 0.28).toFixed(3)})`);
      grad.addColorStop(0.55, `rgba(255,200,120,${(q * 0.1).toFixed(3)})`);
      grad.addColorStop(0.85, "rgba(255,200,120,0)");
      g.fillStyle = grad;
      g.fillRect(-2, 0, 4, 2);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [q]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh position={[wx(x + w / 2), wy(CH / 2), 0.265]} renderOrder={21}>
      <planeGeometry args={[w * K, CH * K]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

/** Zone dimming overlays (matches 2D light(x,w,panel,flood)): darken when panel dimmer is low; warm wash from flood. */
function BrightnessZones() {
  const s = useSimPick("ltPanelCapt", "ltPanelFo", "ltPanelPed");
  const d = useDerivedPick("dcPower");
  const m = useMip(useShallow((st) => ({ floodCapt: st.floodCapt, floodFo: st.floodFo })));
  const pw = !!d.dcPower;
  const zones: { x: number; w: number; panel: number; flood: number }[] = [
    { x: 0, w: 1094, panel: s.ltPanelCapt ?? 1, flood: m.floodCapt ?? 0 },
    { x: 1094, w: 966, panel: s.ltPanelPed ?? 1, flood: 0 },
    { x: 2060, w: CW - 2060, panel: s.ltPanelFo ?? 1, flood: m.floodFo ?? 0 },
  ];
  return (
    <group>
      {zones.map((z, i) => {
        const panel = pw ? Math.max(0, Math.min(1, z.panel)) : 0;
        const flood = pw ? Math.max(0, Math.min(1, z.flood)) : 0;
        // dim = how much to darken (1 - panel); flood adds a warm top strip
        const dim = 1 - panel;
        if (dim < 0.02 && flood < 0.02) return null;
        return (
          <group key={i}>
            {dim >= 0.02 && (
              <mesh position={[wx(z.x + z.w / 2), wy(CH / 2), 0.26]} renderOrder={20}>
                <planeGeometry args={[z.w * K, CH * K]} />
                <meshBasicMaterial color="#030509" transparent opacity={dim * 0.42} depthWrite={false} />
              </mesh>
            )}
            {flood >= 0.02 && <FloodWash x={z.x} w={z.w} flood={flood} />}
          </group>
        );
      })}
    </group>
  );
}

function Scene({ glareRef, textures, preset, nonce, gearLights, lightTest, gearPos, onGear }: { glareRef: MutableRefObject<HTMLDivElement | null>; textures: Record<string, Tex>; preset: PresetName; nonce: number; gearLights: GearLightsState; lightTest: boolean; gearPos: GearPos; onGear: (p: GearPos) => void }) {
  return (
    <>
      <Environment />
      <Controls preset={preset} nonce={nonce} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[8, 12, 14]} intensity={1.4} />
      <directionalLight position={[-12, -4, 8]} intensity={0.4} />

      {/* main panel plate */}
      <mesh position={[0, 0, -0.15]}>
        <boxGeometry args={[CW * K + 0.5, CH * K + 0.5, 0.3]} />
        <meshStandardMaterial color="#4b5463" roughness={0.75} metalness={0.15} />
      </mesh>
      {/* raised outer lip */}
      <mesh position={[0, 0, 0.02]}>
        <boxGeometry args={[CW * K + 0.35, CH * K + 0.35, 0.04]} />
        <meshStandardMaterial color="#3a424e" roughness={0.65} metalness={0.2} />
      </mesh>
      {PLATES.map((p, i) => (
        <mesh key={i} position={[wx(p.x + p.w / 2), wy(p.y + p.h / 2), 0.03]}>
          <boxGeometry args={[p.w * K, p.h * K, 0.06]} />
          <meshStandardMaterial color={p.color} roughness={0.7} metalness={0.1} />
        </mesh>
      ))}
      {/* vertical division rails between zones */}
      {[1094, 1300, 1510, 2064].map((x) => (
        <mesh key={`rail${x}`} position={[wx(x), 0, 0.05]}>
          <boxGeometry args={[0.04, CH * K * 0.92, 0.04]} />
          <meshStandardMaterial color="#2a3038" roughness={0.5} metalness={0.35} />
        </mesh>
      ))}
      {/* top/bottom edge trim strips */}
      <mesh position={[0, wy(4), 0.06]}>
        <boxGeometry args={[CW * K * 0.98, 0.06, 0.03]} />
        <meshStandardMaterial color="#1a1e24" roughness={0.4} metalness={0.5} />
      </mesh>
      <mesh position={[0, wy(CH - 4), 0.06]}>
        <boxGeometry args={[CW * K * 0.98, 0.06, 0.03]} />
        <meshStandardMaterial color="#1a1e24" roughness={0.4} metalness={0.5} />
      </mesh>

      <Bezels />
      {FACES.map((f) => <FaceMesh key={f.key} face={f} tex={textures[f.key]} />)}
      <GearLights lights={gearLights} test={lightTest} />
      <GearLever pos={gearPos} onSelect={onGear} />
      <MipControls3D />
      <MipAnnunciators3D />
      <MipRemaining3D />
      <BrightnessZones />

      {/* glareshield: long black hood shelf, with the real glareshield panel on a raised centre block */}
      <mesh position={[0, (CH * K) / 2 + 0.55, -0.75]}>{/* behind the panel face (z -1.4..-0.1) so it cannot cover the glareshield or hang over the panel */}
        <boxGeometry args={[CW * K + 0.9, 1.1, 1.3]} />
        <meshStandardMaterial color="#14171b" roughness={0.9} metalness={0.05} />
      </mesh>
      <GlareshieldHood hostRef={glareRef} />
      {/* glareshield underside lip */}
      <mesh position={[0, (CH * K) / 2 + 0.05, 0.25]}>
        <boxGeometry args={[CW * K + 0.7, 0.12, 0.5]} />
        <meshStandardMaterial color="#0c0e11" roughness={0.85} metalness={0.1} />
      </mesh>
      <mesh position={[0, -(CH * K) / 2 - 0.2, -0.1]}>
        <boxGeometry args={[CW * K + 0.9, 0.5, 0.6]} />
        <meshStandardMaterial color="#1d2127" roughness={0.85} />
      </mesh>
    </>
  );
}

/* ───────────────────────── page component ───────────────────────── */

export default function MainInstrumentPanel3D({ onExit }: { onExit?: () => void }) {
  const s = useSim();
  const d = useDerivedPick("acPower", "dcPower", "eng1Running", "eng2Running", "epr1", "epr2", "gearLights");
  const m = useMip(useShallow((st) => ({ adfBrg1: st.adfBrg1, adfBrg2: st.adfBrg2, adiTestCapt: st.adiTestCapt, adiTestFo: st.adiTestFo, attCapt: st.attCapt, attFo: st.attFo, bugCapt: st.bugCapt, bugFo: st.bugFo, compSel: st.compSel, dmeCh: st.dmeCh, fail: st.fail, fdCmd: st.fdCmd, gyroSel: st.gyroSel, lightKey: st.lightKey, lrra: st.lrra, nav: st.nav, navFo: st.navFo, navOn: st.navOn, navSel: st.navSel, navTuned: st.navTuned, oilQtyTest: st.oilQtyTest, raDh: st.raDh, selCrs: st.selCrs, selCrs2: st.selCrs2, selHdg: st.selHdg, srcFail: st.srcFail, srcPower: st.srcPower })));
  const [preset, setPreset] = useState<PresetName>("FULL");
  const [nonce, setNonce] = useState(0);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const glareRef = useRef<HTMLDivElement | null>(null);
  const textures = useFaceTextures(hostRef);

  const pw = !!d.dcPower;
  const air = computeAirData(s, d.dcPower, d.acPower);
  const capt = air.capt;
  const fo = air.fo;
  const captPowered = air.capt.adc.data.powered;
  const foPowered = air.fo.adc.data.powered;

  // Fail sets at parity with 2D Panel(): fold source-selector, transfer switches, and CB state.
  const sp = m.srcPower;
  const displayNavSel = s.navXfr === "BOTH ON 1" ? 0 : s.navXfr === "BOTH ON 2" ? 2 : m.navSel;
  const displayEfiSide = s.efiXfr === "BOTH ON L" ? 0 : s.efiXfr === "BOTH ON R" ? 2 : null;
  const displayCompSel = displayEfiSide ?? m.compSel;
  const displayGyroSel = displayEfiSide ?? m.gyroSel;
  const src = sourcesOf({ navSel: displayNavSel, compSel: displayCompSel, gyroSel: displayGyroSel }, m.srcFail);
  if (displayEfiSide !== null && s.irsXfr === "NORMAL") {
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
  const navC = failC.loc ? NO_NAV : m.nav;
  const navF = failF.loc ? NO_NAV : m.navFo;

  const tasKt = capt.iasKt * (1 + (capt.altFt / 1000) * 0.016);
  const gsKt = s.wow ? s.groundSpeedKt : tasKt;
  const raRaw = m.lrra?.h1;
  const ra = s.wow ? 0 : raRaw != null ? raRaw : 9999;
  const raPowered = pw && !m.fail.ht && !!m.srcPower.lrra1Cb && m.lrra?.h1 != null;
  const hgS = s.psBaroStbyHpa / KG;

  const adiNavC = adiNavFrom(!!(m.navOn && m.navTuned === "ILS"), m.navOn && m.navTuned === "ILS" && navC.locValid ? navC.locDev : null, m.navOn && m.navTuned === "ILS" && navC.gsValid ? navC.gsErr : null);
  const adiNavF = adiNavFrom(!!(m.navOn && navF.locValid), m.navOn && navF.locValid ? navF.locDev : null, m.navOn && navF.gsValid ? navF.gsErr : null);
  // RMI feeds, same rules as the 2D panel: VOR needle selected on the pedestal uses the VOR radial, otherwise the ADF bearing
  const dmeNm = (side: 0 | 1, fail: boolean): number | null => (fail ? null : (side === 0 ? m.dmeCh?.ch1 : m.dmeCh?.ch2)?.displayNm ?? null);
  const rmiBrg = (needle: 0 | 1, rmi: 0 | 1, adf: number | null): number | null => {
    const ped = usePedestal.getState();
    const sel = (needle === 0 ? ped.rmiNeedle1 : ped.rmiNeedle2)?.[rmi] ?? needle;
    if (sel === 0 && m.navOn && (needle === 0 ? navC : navF).vorValid) return angDiff(navC.radial, m.attCapt.hdg);
    return adf;
  };
  const slip = Math.max(-1, Math.min(1, s.rudderPedal));

  // engine / systems values, same sources as EnginePanels in the 2D panel
  const ppH = (kg: number) => Math.max(0, kg) * KG_TO_LB;
  const bandsN = [{ from: 0, to: 100, color: GREEN }, { from: 100, to: 110, color: RED }];
  const egtBands = [{ from: 0, to: 620, color: GREEN }, { from: 620, to: 700, color: AMBER }, { from: 700, to: 900, color: RED }];
  const oilBands = [{ from: 0, to: 13, color: RED }, { from: 40, to: 90, color: GREEN }];
  const oilTBands = [{ from: 0, to: 40, color: "#4a90d9" }, { from: 40, to: 140, color: GREEN }, { from: 140, to: 160, color: RED }];
  const eprBands = [{ from: 2.0, to: 2.4, color: RED }];
  const hydBands = [{ from: 2800, to: 3200, color: GREEN }];
  const e1 = { epr: d.epr1, n1: s.n1_1, egt: s.egt1, n2: s.n2_1, ff: s.ff1, oil: s.oilPsi1, qty: s.oilQty1, run: d.eng1Running };
  const e2 = { epr: d.epr2, n1: s.n1_2, egt: s.egt2, n2: s.n2_2, ff: s.ff2, oil: s.oilPsi2, qty: s.oilQty2, run: d.eng2Running };
  const oilT = (x: { run: boolean; n2: number }) => (d.dcPower || x.run ? 30 + Math.min(100, x.n2) * 0.95 : 20);
  const qtyGal = (x: { qty: number }) => (m.oilQtyTest ? 4 : x.qty / 20);
  const SZ = 90;
  const gearLights = d.gearLights as GearLightsState;
  const lightTest = !!(d.dcPower && (s.ltTest || m.lightKey === 2));
  const setGear = (p: GearPos) => {
    // same rule as the 2D lever: UP is locked out on the ground
    if (p === "UP" && s.wow && !s.gearLeverOverride) { s.patch({ gear: "OFF" }, "GEAR SELECTOR LOCKED — UP inhibited on ground."); return; }
    s.patch({ gear: p });
  };

  const nodes: Record<string, ReactNode> = {
    "c-asi": <AsiReal data={capt} powered={captPowered} bugKt={m.bugCapt} />,
    "c-adi": <AdiReal slip={slip} powered={pw} test={pw && m.adiTestCapt} fail={failC} pitch={m.attCapt.pitch} roll={m.attCapt.roll} fd={m.fdCmd} nav={adiNavC} />,
    "c-hsi": <HsiReal powered={pw} fail={failC} hdg={m.attCapt.hdg} tas={tasKt} gs={gsKt} crs={m.selCrs} bug={m.selHdg} nav={navC} navOn={m.navOn} tuned={m.navTuned} />,
    "c-ht": <HeightDial ft={ra < 9000 ? ra : -1} dh={m.raDh} powered={raPowered} />,
    "c-alt": <AltReal data={capt} powered={captPowered} mb={s.psBaroCaptHpa} hg={s.psBaroCaptHpa / KG} />,
    "c-vsi": <VerticalSpeed data={capt} />,
    "c-rmi": <RmiReal powered={pw} fail={failC} hdg={m.attCapt.hdg} dme1Nm={dmeNm(0, failC.dme1)} dme2Nm={dmeNm(1, failC.dme2)} brg1={rmiBrg(0, 0, m.adfBrg1)} brg2={rmiBrg(1, 0, m.adfBrg2)} />,
    "f-rmi": <RmiReal powered={pw} fail={failF} hdg={m.attFo.hdg} dme1Nm={dmeNm(0, failF.dme1)} dme2Nm={dmeNm(1, failF.dme2)} brg1={rmiBrg(0, 1, m.adfBrg1)} brg2={rmiBrg(1, 1, m.adfBrg2)} />,
    "sb-alt": <AltReal data={{ ...air.capt, ...air.standby } as SideAirData} powered mb={s.psBaroStbyHpa} hg={hgS} />,
    "sb-att": <Attitude roll={m.attCapt.roll} pitch={m.attCapt.pitch} />,
    "f-asi": <AsiReal data={fo} powered={foPowered} bugKt={m.bugFo} />,
    "f-adi": <AdiReal slip={slip} powered={pw} test={pw && m.adiTestFo} fail={failF} pitch={m.attFo.pitch} roll={m.attFo.roll} fd={m.fdCmd} nav={adiNavF} />,
    "f-hsi": <HsiReal powered={pw} fail={failF} hdg={m.attFo.hdg} tas={tasKt} gs={gsKt} crs={m.selCrs2} bug={m.selHdg} nav={navF} navOn={m.navOn} tuned={navF.locValid || !navF.vorValid ? "ILS" : "VOR"} />,
    "f-ht": <HeightDial ft={ra < 9000 ? ra : -1} dh={m.raDh} powered={raPowered} />,
    "f-vsi": <VerticalSpeed data={fo} />,
    "f-alt": <AltReal data={fo} powered={foPowered} mb={s.psBaroFoHpa} hg={s.psBaroFoHpa / KG} />,
    "epr1": <Dial label="EPR" value={e1.epr} min={1} max={2.4} major={0.2} minor={2} digits={2} size={SZ} caption="" win={{ text: pw ? "" : null, x: 52, y: 76, w: 26 }} bands={eprBands} />,
    "epr2": <Dial label="EPR" value={e2.epr} min={1} max={2.4} major={0.2} minor={2} digits={2} size={SZ} caption="" win={{ text: pw ? "" : null, x: 52, y: 76, w: 26 }} bands={eprBands} />,
    "n1-1": <Dial label="N1" value={e1.n1} min={0} max={110} major={10} minor={2} scale={10} size={SZ} bands={bandsN} win={{ text: pw ? e1.n1.toFixed(1) : null, y: 24 }} caption="" />,
    "n1-2": <Dial label="N1" value={e2.n1} min={0} max={110} major={10} minor={2} scale={10} size={SZ} bands={bandsN} win={{ text: pw ? e2.n1.toFixed(1) : null, y: 24 }} caption="" />,
    "n2-1": <Dial label="N2" value={e1.n2} min={0} max={110} major={10} minor={2} scale={10} size={SZ} bands={bandsN} win={{ text: pw ? e1.n2.toFixed(1) : null, y: 24 }} caption="" />,
    "n2-2": <Dial label="N2" value={e2.n2} min={0} max={110} major={10} minor={2} scale={10} size={SZ} bands={bandsN} win={{ text: pw ? e2.n2.toFixed(1) : null, y: 24 }} caption="" />,
    "ff1": <Dial label="FUEL FLOW" value={ppH(e1.ff)} min={0} max={5000} major={1000} minor={5} scale={1000} size={SZ} caption="" />,
    "ff2": <Dial label="FUEL FLOW" value={ppH(e2.ff)} min={0} max={5000} major={1000} minor={5} scale={1000} size={SZ} caption="" />,
    "oilp1": <Dial label="OIL PRESS" value={e1.oil} min={0} max={100} major={20} minor={4} size={SZ} bands={oilBands} caption="" />,
    "oilp2": <Dial label="OIL PRESS" value={e2.oil} min={0} max={100} major={20} minor={4} size={SZ} bands={oilBands} caption="" />,
    "oilt1": <Dial label="OIL TEMP" value={oilT(e1)} min={0} max={160} major={40} minor={4} size={SZ} bands={oilTBands} caption="" />,
    "egt2": <Dial label="EGT" value={e2.egt} min={0} max={900} major={100} minor={2} scale={100} size={SZ} bands={egtBands} win={{ text: pw ? String(Math.round(e2.egt)) : null, x: 56, y: 26 }} caption="" />,
    "egt1": <Dial label="EGT" value={e1.egt} min={0} max={900} major={100} minor={2} scale={100} size={SZ} bands={egtBands} win={{ text: pw ? String(Math.round(e1.egt)) : null, x: 56, y: 26 }} caption="" />,
    "oilq2": <Dial label="OIL QUANTITY" value={qtyGal(e2)} min={0} max={5} major={1} minor={2} size={SZ} digits={1} caption="" bands={[{ from: 0, to: 1, color: RED }]} />,
    "hydA": <Dial label="HYD SYS PRESS" value={s.hydAPress} min={0} max={4000} major={1000} minor={5} scale={1000} size={SZ} bands={hydBands} caption="" />,
    "hydB": <Dial label="HYD BRAKE PRESS" value={s.hydBPress} min={0} max={4000} major={1000} minor={5} scale={1000} size={SZ} bands={hydBands} caption="" />,
    "flap": <FlapDial units={s.flapPos ?? s.flaps} />,
    "hydQty": <Dial label="HYD QTY" value={s.hydAQty} min={0} max={100} major={25} minor={5} size={SZ} caption="" bands={[{ from: 0, to: 20, color: RED }]} />,
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0b0d10]">
      <Canvas camera={{ fov: 38, near: 0.1, far: 300, position: [0, 0, 40] }} dpr={[1, 2]} gl={{ antialias: true }}>
        <Scene glareRef={glareRef} textures={textures} preset={preset} nonce={nonce} gearLights={gearLights} lightTest={lightTest} gearPos={s.gear as GearPos} onGear={setGear} />
      </Canvas>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-center gap-2 p-3">
        <button type="button" onClick={onExit} className="pointer-events-auto rounded border border-border bg-inset px-3 py-1.5 font-mono text-[10px] uppercase tracking-[.1em] text-subtle hover:bg-inset/80">
          ← Back to panels
        </button>
        {(Object.keys(PRESETS) as PresetName[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => { setPreset(p); setNonce((n) => n + 1); }}
            className={`pointer-events-auto rounded border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[.1em] ${preset === p ? "border-accent/70 bg-accent/10 text-accent" : "border-border bg-inset text-subtle"}`}
          >
            {p}
          </button>
        ))}
        <span className="pointer-events-none ml-auto font-mono text-[10px] uppercase tracking-[.1em] text-subtle">drag = orbit · wheel/pinch = zoom · right-drag = pan</span>
      </div>

      <FaceHostWrapper hostRef={hostRef} nodes={nodes} />
      <GlareshieldHost hostRef={glareRef} />

      {/* Keep the 2D panel mounted off-screen: it steps the attitude / nav / autoflight models. */}
      <div aria-hidden style={{ position: "fixed", left: -30000, top: 0, width: 3100, opacity: 0, pointerEvents: "none" }}>
        <MainInstrumentPanel />
      </div>
    </div>
  );
}

function FaceHostWrapper({ hostRef, nodes }: { hostRef: MutableRefObject<HTMLDivElement | null>; nodes: Record<string, ReactNode> }) {
  return (
    <div ref={hostRef}>
      <FaceHost nodes={nodes} />
    </div>
  );
}
