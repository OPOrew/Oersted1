import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { Glareshield } from "@/components/panel/GlareshieldPanel";
import { useCursor } from "@/components/panel/MainInstrumentPanel3DControls";

/**
 * 3D MIP: the real glareshield panel on the hood.
 *
 * The 2D glareshield (GlareshieldPanel.tsx) is HTML, so it cannot use the SVG-to-texture path of the instrument faces.
 * Instead a hidden copy of the real component is mounted (`GlareshieldHost`, same stores, so it always agrees with the 2D panel),
 * its DOM is cloned with computed styles inlined, drawn through an SVG <foreignObject> onto a canvas, and used as a texture.
 * Redrawn only when the DOM actually changed (checked 4x / second).
 *
 * Clicks on the 3D plane are mapped back to the hidden DOM and dispatched to the real control, so every glareshield control
 * (master caution, fire warn, FD mode / pitch knobs, ALT HOLD, A/P selectors, AIL / ELEV paddles, COURSE, HDG SEL) works
 * through the same handlers as 2D. COURSE: click the left / right half to step, hold to repeat. HDG SEL: click the centre
 * to engage, top / bottom third to step the heading. No drag, so it does not fight the orbit camera.
 *
 * UNTESTED in a browser: typechecked only. Known risks: SVG foreignObject rasterising can differ per browser (font fallback for
 * the condensed legends), and synthetic events depend on the 2D controls reading clientX / clientY only.
 */

const K = 0.01;
const GW = 1360; // design width the 2D glareshield is built for (it never grows past this)
const GH = 232; // 345 * 1360 / 2172 + 16
const TS = 1.5; // texture pixels per design px
const SKIP = /^(-|transition|animation|will-change|cursor|pointer-events|user-select|touch-action)/;

/** Hidden, laid-out copy of the real glareshield (kept off-screen, inside the React root so its handlers receive events). */
export function GlareshieldHost({ hostRef }: { hostRef: MutableRefObject<HTMLDivElement | null> }) {
  return (
    <div ref={hostRef} aria-hidden style={{ position: "fixed", left: -40000, top: 0, width: GW, pointerEvents: "none" }}>
      <Glareshield width={GW} />
    </div>
  );
}

function inlineStyles(src: Element, dst: Element) {
  const cs = getComputedStyle(src);
  let css = "";
  for (let i = 0; i < cs.length; i++) {
    const p = cs[i];
    if (SKIP.test(p)) continue;
    css += `${p}:${cs.getPropertyValue(p)};`;
  }
  dst.setAttribute("style", css);
  for (let i = 0; i < src.children.length; i++) inlineStyles(src.children[i], dst.children[i]);
}

function useGlareTexture(hostRef: MutableRefObject<HTMLDivElement | null>) {
  const tex = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(GW * TS);
    canvas.height = Math.round(GH * TS);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, []);
  useEffect(() => {
    let busy = false;
    let last = "";
    const tick = async () => {
      const root = hostRef.current?.firstElementChild as HTMLElement | null;
      if (busy || !root || document.hidden) return;
      const sig = root.outerHTML;
      if (sig === last) return;
      busy = true;
      try {
        const clone = root.cloneNode(true) as HTMLElement;
        inlineStyles(root, clone);
        const xhtml = new XMLSerializer().serializeToString(clone);
        const cv = tex.image as HTMLCanvasElement;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cv.width}" height="${cv.height}" viewBox="0 0 ${GW} ${GH}"><foreignObject x="0" y="0" width="${GW}" height="${GH}">${xhtml}</foreignObject></svg>`;
        // data: URL (not blob:) keeps the canvas untainted so WebGL may upload it
        const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
        try {
          const img = new Image();
          await new Promise<void>((res, rej) => {
            img.onload = () => res();
            img.onerror = () => rej(new Error("glareshield svg decode failed"));
            img.src = url;
          });
          const ctx = cv.getContext("2d");
          if (ctx) {
            ctx.clearRect(0, 0, cv.width, cv.height);
            ctx.drawImage(img, 0, 0, cv.width, cv.height);
            tex.needsUpdate = true;
            last = sig;
          }
        } finally { /* nothing to release */ }
      } catch { /* keep the previous frame, retry next tick */ } finally { busy = false; }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 250);
    return () => window.clearInterval(id);
  }, [hostRef, tex]);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

const CANDIDATES = 'button, [role="slider"], [role="button"]';

/** Smallest interactive element of the hidden glareshield under client point (x, y). */
function pickElement(root: HTMLElement, x: number, y: number): HTMLElement | null {
  let best: HTMLElement | null = null;
  let bestArea = Infinity;
  root.querySelectorAll<HTMLElement>(CANDIDATES).forEach((el) => {
    const r = el.getBoundingClientRect();
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) return;
    const a = r.width * r.height;
    if (a < bestArea) { best = el; bestArea = a; }
  });
  return best;
}

/** Click = one action; hold = auto-repeat, accelerating. Returns the stop function. */
function repeat(fn: (n: number) => void): () => void {
  let n = 0;
  let iv: number | undefined;
  fn(n++);
  const to = window.setTimeout(() => { iv = window.setInterval(() => fn(n++), 70); }, 380);
  return () => { window.clearTimeout(to); if (iv !== undefined) window.clearInterval(iv); };
}

/** Drive the real 2D control under the pointer. Returns a stop function for held (repeating) actions. */
function activate(el: HTMLElement, cx: number, cy: number): (() => void) | null {
  // the 2D knobs capture the pointer; a synthetic pointer id has nothing to capture, so neutralise it
  Object.assign(el, { setPointerCapture: () => {}, releasePointerCapture: () => {} });
  const r = el.getBoundingClientRect();
  const role = el.getAttribute("role");
  const label = el.getAttribute("aria-label") ?? "";
  const ptr = (type: "pointerdown" | "pointerup") => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: cx, clientY: cy, pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, buttons: type === "pointerdown" ? 1 : 0 }));
  const key = (k: string, times = 1) => { for (let i = 0; i < times; i++) el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })); };
  const times = (n: number) => (n < 12 ? 1 : n < 30 ? 3 : 6);

  if (role === "slider" && label === "Selected course") {
    const k = cx < r.left + r.width / 2 ? "ArrowLeft" : "ArrowRight";
    return repeat((n) => key(k, times(n)));
  }
  if (role === "slider") { ptr("pointerdown"); ptr("pointerup"); return null; } // mode / pitch knobs: pick the nearest mark
  if (role === "button" && label.startsWith("Heading select")) {
    const f = (cy - r.top) / r.height;
    if (f < 0.33) return repeat((n) => key("ArrowUp", times(n)));
    if (f > 0.67) return repeat((n) => key("ArrowDown", times(n)));
    ptr("pointerdown"); ptr("pointerup"); // centre: engage / release
    return null;
  }
  el.click(); // lenses, ALT HOLD, A/P DISC, AIL / ELEV paddles
  return null;
}

/**
 * Raised centre block of the hood carrying the real glareshield. The long black hood in Scene stays as the shelf behind it.
 * Spans y 3.6 .. 6.0 directly above the panel, front face flush with the panel face (z 0.16) and the body extending back
 * (-z), like the real glareshield; nothing sticks out in front of the panel, so it never overlaps the instruments when orbited.
 */
export function GlareshieldHood({ hostRef }: { hostRef: MutableRefObject<HTMLDivElement | null> }) {
  const tex = useGlareTexture(hostRef);
  const cur = useCursor();
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);

  const locate = (e: ThreeEvent<PointerEvent>) => {
    const root = hostRef.current?.firstElementChild as HTMLElement | null;
    if (!root || !e.uv) return null;
    const rr = root.getBoundingClientRect();
    const cx = rr.left + e.uv.x * rr.width;
    const cy = rr.top + (1 - e.uv.y) * rr.height;
    const el = pickElement(root, cx, cy);
    return el ? { el, cx, cy } : null;
  };
  const release = () => { stop.current?.(); stop.current = null; };

  return (
    <group>
      <mesh position={[0, 4.8, -0.59]}>
        <boxGeometry args={[GW * K + 0.3, 2.4, 1.5]} />
        <meshStandardMaterial color="#14171b" roughness={0.9} metalness={0.05} />
      </mesh>
      <mesh
        position={[0, 4.82, 0.165]}
        onPointerDown={(e) => {
          const hit = locate(e);
          if (!hit) return;
          e.stopPropagation();
          release();
          stop.current = activate(hit.el, hit.cx, hit.cy);
        }}
        onPointerUp={release}
        onPointerOut={() => { release(); cur.out(); }}
        onPointerMove={(e) => { if (locate(e)) cur.over(); else cur.out(); }}
      >
        <planeGeometry args={[GW * K, GH * K]} />
        <meshBasicMaterial map={tex} transparent toneMapped={false} />
      </mesh>
    </group>
  );
}
