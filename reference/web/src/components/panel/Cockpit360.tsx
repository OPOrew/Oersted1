import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { RealisticOverhead } from "@/components/panel/RealisticOverhead";
import { MainInstrumentPanel } from "@/components/panel/MainInstrumentPanel";
import { CenterPedestal } from "@/components/panel/CenterPedestal";
import { cn } from "@/lib/utils";
import { useLiveWx } from "@/lib/sim/wxrWorld";

type Seat = "CAPT" | "FO" | "CENTER";

const SEAT_OFFSET: Record<Seat, number> = { CAPT: 210, FO: -210, CENTER: 0 };
const PITCH_MIN = -68;
const PITCH_MAX = 68;
const YAW_MIN = -180;
const YAW_MAX = 180;
const Z_MIN = 0.72;
const Z_MAX = 1.18;

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Immersive 737-200 cockpit.
 *
 * This is deliberately built around the simulator's existing live React panels:
 * P5 overhead, main instrument/glareshield and P8 centre pedestal are not screenshots
 * or replacements. They remain the actual interactive controls from the simulator.
 *
 * The surrounding cockpit is a CSS 3D interior: windshield frame, glareshield,
 * side consoles, sidewalls, rear bulkhead, floor, roof and pilot seats.
 * Drag empty space to look 360°, pinch/wheel to zoom, and use WASD/arrows.
 */
export function Cockpit360({ onExit }: { onExit?: () => void }) {
  const liveWx = useLiveWx();
  const [lightning, setLightning] = useState(0);
  useEffect(() => {
    if (!liveWx.thunderstorm) return;
    const id = setInterval(() => {
      if (Math.random() < 0.35) {
        setLightning(1);
        setTimeout(() => setLightning(0.4), 80);
        setTimeout(() => setLightning(0), 220);
        // Simple synthesized thunder rumble
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sawtooth";
          osc.frequency.value = 40 + Math.random() * 30;
          gain.gain.setValueAtTime(0.15, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.8);
          osc.connect(gain).connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 2);
        } catch { /* audio may be blocked */ }
      }
    }, 4000);
    return () => clearInterval(id);
  }, [liveWx.thunderstorm]);
  const [seat, setSeat] = useState<Seat>("CAPT");
  const [yaw, setYaw] = useState(0);
  const [pitch, setPitch] = useState(4);
  const [zoom, setZoom] = useState(0.92);
  const [dragging, setDragging] = useState(false);
  const [help, setHelp] = useState(true);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const last = useRef({ x: 0, y: 0 });
  const pinch = useRef<number | null>(null);

  const reset = useCallback(() => {
    setYaw(0);
    setPitch(4);
    setZoom(0.92);
  }, []);

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest("button, input, [role='slider'], [role='switch'], a, select, textarea, label")) return;

    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const pts = [...pointers.current.values()];
      pinch.current = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      setDragging(false);
      return;
    }

    e.currentTarget.setPointerCapture?.(e.pointerId);
    last.current = { x: e.clientX, y: e.clientY };
    setDragging(true);
  }, []);

  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (pointers.current.size >= 2) {
      const pts = [...pointers.current.values()];
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (pinch.current != null) {
        setZoom((z) => clamp(z + (d - pinch.current!) * 0.0017, Z_MIN, Z_MAX));
      }
      pinch.current = d;
      return;
    }

    if (!dragging) return;
    const dx = e.clientX - last.current.x;
    const dy = e.clientY - last.current.y;
    last.current = { x: e.clientX, y: e.clientY };
    setYaw((y) => clamp(y - dx * 0.22, YAW_MIN, YAW_MAX));
    setPitch((p) => clamp(p + dy * 0.17, PITCH_MIN, PITCH_MAX));
  }, [dragging]);

  const onPointerUp = useCallback((e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    setDragging(false);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const step = e.shiftKey ? 8 : 3;
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") { setYaw((y) => clamp(y + step, YAW_MIN, YAW_MAX)); e.preventDefault(); }
      else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") { setYaw((y) => clamp(y - step, YAW_MIN, YAW_MAX)); e.preventDefault(); }
      else if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") { setPitch((p) => clamp(p + step, PITCH_MIN, PITCH_MAX)); e.preventDefault(); }
      else if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") { setPitch((p) => clamp(p - step, PITCH_MIN, PITCH_MAX)); e.preventDefault(); }
      else if (e.key === "+" || e.key === "=") setZoom((z) => clamp(z + 0.04, Z_MIN, Z_MAX));
      else if (e.key === "-" || e.key === "_") setZoom((z) => clamp(z - 0.04, Z_MIN, Z_MAX));
      else if (e.key === "1") setSeat("CAPT");
      else if (e.key === "2") setSeat("CENTER");
      else if (e.key === "3") setSeat("FO");
      else if (e.key === "r" || e.key === "R") reset();
      else if (e.key === "h" || e.key === "H" || e.key === "?") setHelp((h) => !h);
      else if (e.key === "Escape" && onExit) onExit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit, reset]);

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => clamp(z - e.deltaY * 0.0007, Z_MIN, Z_MAX));
    };
    const el = document.getElementById("cockpit-360-viewport");
    el?.addEventListener("wheel", onWheel, { passive: false });
    return () => el?.removeEventListener("wheel", onWheel);
  }, []);

  const seatOffset = SEAT_OFFSET[seat];

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#020304] text-fg">
      <div className="relative z-40 flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#303640] bg-[#090b0e]/96 px-3 py-2 shadow-lg backdrop-blur">
        <div className="flex items-center gap-3">
          <div>
            <div className="font-display text-[10px] uppercase tracking-[0.2em] text-subtle">Boeing 737-200 · Interactive cockpit</div>
            <div className="font-display text-sm font-semibold tracking-tight">360° 3D Cockpit</div>
          </div>
          <div className="hidden h-7 w-px bg-[#303640] sm:block" />
          <div className="flex items-center gap-1">
            {(["CAPT", "CENTER", "FO"] as Seat[]).map((s) => (
              <button key={s} type="button" onClick={() => setSeat(s)}
                className={cn("rounded border px-2.5 py-1 font-mono text-[10px] uppercase",
                  seat === s ? "border-accent/70 bg-accent/15 text-accent" : "border-[#3a4048] bg-[#15181c] text-subtle hover:text-fg")}>
                {s === "CAPT" ? "CAPT" : s === "FO" ? "F/O" : "JUMP"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden font-mono text-[9px] uppercase text-subtle md:block">
            Y {yaw.toFixed(0)}° · P {pitch.toFixed(0)}° · Z {zoom.toFixed(2)}
          </div>
          <button type="button" onClick={reset} className="rounded border border-[#3a4048] bg-[#15181c] px-2.5 py-1 font-mono text-[10px] uppercase text-subtle hover:text-fg">Reset</button>
          <button type="button" onClick={() => setHelp((h) => !h)} className="rounded border border-[#3a4048] bg-[#15181c] px-2.5 py-1 font-mono text-[10px] uppercase text-subtle hover:text-fg">{help ? "Hide help" : "Help"}</button>
          {onExit && <button type="button" onClick={onExit} className="rounded border border-accent/50 bg-accent/10 px-3 py-1 font-mono text-[10px] uppercase text-accent">Exit 360</button>}
        </div>
      </div>

      <div
        id="cockpit-360-viewport"
        className="relative min-h-0 flex-1 overflow-hidden touch-none select-none"
        style={{
          perspective: "1450px",
          perspectiveOrigin: "50% 45%",
          cursor: dragging ? "grabbing" : "grab",
          background: "radial-gradient(ellipse at 50% 35%, #27313b 0%, #0d1218 44%, #030405 100%)",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={(e) => { if (pointers.current.size === 0) setDragging(false); }}
      >
        {/* Exterior/sky seen through the windshield. It deliberately sits behind the cockpit shell. */}
        <div className="pointer-events-none absolute inset-0"
          style={{ background: "linear-gradient(180deg, rgba(52,73,91,.9) 0%, rgba(30,45,56,.82) 32%, rgba(9,13,17,.95) 72%, #020304 100%)" }} />
        {/* Lightning flash during thunderstorms */}
        {lightning > 0 && (
          <div className="pointer-events-none absolute inset-0 bg-white" style={{ opacity: lightning * 0.7, mixBlendMode: "screen" }} />
        )}
        {/* Cloud layer white-out — only visible through the cockpit windscreen */}
        {liveWx.inWeather && (
          <div className="pointer-events-none absolute inset-0"
            style={{
              background: "linear-gradient(180deg, rgba(220,225,230,0.55) 0%, rgba(200,205,210,0.4) 40%, rgba(180,185,190,0.25) 100%)",
              opacity: Math.min(0.7, (liveWx.intensity ?? 0) * 1.1),
              mixBlendMode: "screen",
            }} />
        )}
        {/* Live weather visibility reduction on the windscreen */}
        <div className="pointer-events-none absolute inset-0"
          style={{
            background: "rgba(180,190,200,0.35)",
            opacity: Math.min(0.85, (liveWx.intensity ?? 0) * 1.4),
            mixBlendMode: "multiply",
          }} />
        <div className="pointer-events-none absolute inset-0 opacity-60"
          style={{ background: "radial-gradient(ellipse 65% 45% at 50% 35%, rgba(170,190,205,.22), transparent 70%)" }} />

        {/* The complete physical cockpit interior is one 3D world. */}
        <div
          className="absolute left-1/2 top-[48%]"
          style={{
            width: 1,
            height: 1,
            transformStyle: "preserve-3d",
            transform: `translate(-50%, -50%) translateX(${seatOffset}px) scale(${zoom}) rotateX(${pitch}deg) rotateY(${yaw}deg)`,
            transition: dragging ? "none" : "transform 80ms linear",
          }}
        >
          {/* FLOOR */}
          <div className="absolute pointer-events-none" style={{
            left: -720, top: 260, width: 1440, height: 900,
            transform: "translateZ(80px) rotateX(90deg)", transformOrigin: "50% 0",
            background: "linear-gradient(180deg,#24282d,#111418 65%,#080a0c)",
            border: "1px solid #454a50", boxShadow: "inset 0 0 80px #000",
          }} />

          {/* ROOF / COCKPIT LINER */}
          <div className="absolute pointer-events-none" style={{
            left: -780, top: -690, width: 1560, height: 1200,
            transform: "translateZ(240px) rotateX(-88deg)", transformOrigin: "50% 100%",
            background: "linear-gradient(180deg,#171a1f,#292d33 55%,#101216)",
            border: "1px solid #3f454d", opacity: .92,
          }} />

          {/* LEFT AND RIGHT SIDEWALLS */}
          <div className="absolute pointer-events-none" style={{
            left: -790, top: -270, width: 900, height: 700,
            transform: "translateZ(40px) rotateY(90deg)", transformOrigin: "100% 50%",
            background: "linear-gradient(90deg,#0a0c0f,#20252a 52%,#101216)",
            border: "1px solid #3c424a", boxShadow: "inset 0 0 70px #000",
          }} />
          <div className="absolute pointer-events-none" style={{
            left: -110, top: -270, width: 900, height: 700,
            transform: "translateZ(40px) rotateY(-90deg)", transformOrigin: "0 50%",
            background: "linear-gradient(270deg,#0a0c0f,#20252a 52%,#101216)",
            border: "1px solid #3c424a", boxShadow: "inset 0 0 70px #000",
          }} />

          {/* REAR BULKHEAD — makes the 180° view an actual cockpit interior rather than empty space. */}
          <div className="absolute pointer-events-none" style={{
            left: -600, top: -250, width: 1200, height: 650,
            transform: "translateZ(430px)",
            background: "linear-gradient(180deg,#171a1e,#252a30 50%,#0b0d10)",
            border: "2px solid #3d434b", boxShadow: "inset 0 0 100px #000, 0 20px 70px #000",
          }}>
            <div className="absolute left-[7%] right-[7%] top-[10%] h-[7%] rounded-sm border border-[#4b5159] bg-[#111419]" />
            <div className="absolute left-[11%] top-[27%] h-[45%] w-[27%] rounded border border-[#444a51] bg-[#111419] shadow-inner" />
            <div className="absolute right-[11%] top-[27%] h-[45%] w-[27%] rounded border border-[#444a51] bg-[#111419] shadow-inner" />
            <div className="absolute bottom-[10%] left-1/2 h-[7%] w-[45%] -translate-x-1/2 rounded bg-[#090b0d]" />
          </div>

          {/* WINDSHIELD / CENTER POST */}
          <div className="absolute pointer-events-none" style={{
            left: -470, top: -430, width: 940, height: 300,
            transform: "translateZ(-35px) rotateX(4deg)",
            background: "linear-gradient(180deg,rgba(9,12,15,.15),rgba(4,6,8,.82))",
            borderLeft: "14px solid #111418", borderRight: "14px solid #111418",
            borderTop: "12px solid #111418",
            boxShadow: "inset 0 -50px 80px rgba(0,0,0,.65)",
          }} />
          <div className="absolute pointer-events-none" style={{
            left: -10, top: -430, width: 20, height: 310,
            transform: "translateZ(-20px)",
            background: "linear-gradient(90deg,#0b0d10,#343941,#0b0d10)",
            boxShadow: "0 0 20px #000",
          }} />

          {/* CAPTAIN / F/O SEATS */}
          <div className="absolute pointer-events-none" style={{
            left: -520, top: 60, width: 210, height: 370,
            transform: "translateZ(120px) rotateY(4deg)",
          }}>
            <div className="absolute bottom-0 left-1/2 h-12 w-24 -translate-x-1/2 rounded-full border border-[#30353b] bg-[#0b0d10]" />
            <div className="absolute bottom-8 left-1/2 h-64 w-44 -translate-x-1/2 rounded-[45%_45%_12%_12%] border border-[#3b4148] bg-[linear-gradient(90deg,#111419,#343941,#15181c)] shadow-[inset_0_0_25px_#000,0_12px_25px_rgba(0,0,0,.65)]" />
            <div className="absolute left-1/2 top-0 h-28 w-40 -translate-x-1/2 rounded-[45%_45%_30%_30%] border border-[#3b4148] bg-[#20252b] shadow-[inset_0_0_20px_#000]" />
          </div>
          <div className="absolute pointer-events-none" style={{
            right: -520, top: 60, width: 210, height: 370,
            transform: "translateZ(120px) rotateY(-4deg)",
          }}>
            <div className="absolute bottom-0 left-1/2 h-12 w-24 -translate-x-1/2 rounded-full border border-[#30353b] bg-[#0b0d10]" />
            <div className="absolute bottom-8 left-1/2 h-64 w-44 -translate-x-1/2 rounded-[45%_45%_12%_12%] border border-[#3b4148] bg-[linear-gradient(90deg,#15181c,#343941,#111419)] shadow-[inset_0_0_25px_#000,0_12px_25px_rgba(0,0,0,.65)]" />
            <div className="absolute left-1/2 top-0 h-28 w-40 -translate-x-1/2 rounded-[45%_45%_30%_30%] border border-[#3b4148] bg-[#20252b] shadow-[inset_0_0_20px_#000]" />
          </div>

          {/* MAIN INSTRUMENT PANEL — the simulator's actual live panel */}
          <div className="absolute" style={{
            width: 1180, left: -590, top: -205,
            transform: "translateZ(-350px) rotateX(3deg)",
            transformOrigin: "50% 50%", transformStyle: "preserve-3d",
          }}>
            <div className="overflow-hidden rounded-[6px] border-2 border-[#555b63] bg-[#171a1e]"
              style={{ boxShadow: "0 45px 110px rgba(0,0,0,.9), inset 0 1px 0 rgba(255,255,255,.08)" }}>
              <div className="border-b border-[#30353b] bg-[#0e1115] px-2 py-1 text-center font-mono text-[7px] uppercase tracking-[.2em] text-[#a19a88]">
                Main instrument panel · Glareshield · LIVE
              </div>
              <div className="max-h-[540px] overflow-auto bg-[#0a0c0f] p-1">
                <div style={{ transform: "scale(.82)", transformOrigin: "top center", width: "122%" }}>
                  <MainInstrumentPanel />
                </div>
              </div>
            </div>
          </div>

          {/* P5 OVERHEAD — the simulator's actual live overhead */}
          <div className="absolute" style={{
            width: 1100, left: -550, top: -610,
            transform: "translateZ(-120px) rotateX(70deg)",
            transformOrigin: "50% 100%", transformStyle: "preserve-3d",
          }}>
            <div className="overflow-hidden rounded-md border-2 border-[#555b63] bg-[#171a1e]"
              style={{ boxShadow: "0 35px 90px rgba(0,0,0,.9), inset 0 1px 0 rgba(255,255,255,.06)" }}>
              <div className="border-b border-[#30353b] bg-[#0e1115] px-2 py-1 text-center font-mono text-[7px] uppercase tracking-[.2em] text-[#a19a88]">
                P5 overhead · LIVE controls
              </div>
              <div className="max-h-[390px] overflow-auto bg-[#090b0e] p-1">
                <div style={{ transform: "scale(.68)", transformOrigin: "top center", width: "147%" }}>
                  <RealisticOverhead focus="all" noPedestal />
                </div>
              </div>
            </div>
          </div>

          {/* P8 CENTER PEDESTAL — the simulator's actual live pedestal */}
          <div className="absolute" style={{
            width: 780, left: -390, top: 275,
            transform: "translateZ(-125px) rotateX(-58deg)",
            transformOrigin: "50% 0%", transformStyle: "preserve-3d",
          }}>
            <div className="overflow-hidden rounded-md border-2 border-[#555b63] bg-[#171a1e]"
              style={{ boxShadow: "0 30px 75px rgba(0,0,0,.88), inset 0 1px 0 rgba(255,255,255,.05)" }}>
              <div className="border-b border-[#30353b] bg-[#0e1115] px-2 py-1 text-center font-mono text-[7px] uppercase tracking-[.2em] text-[#a19a88]">
                P8 center pedestal · LIVE controls
              </div>
              <div className="max-h-[455px] overflow-auto bg-[#090b0e] p-1">
                <div style={{ transform: "scale(.72)", transformOrigin: "top center", width: "139%" }}>
                  <CenterPedestal />
                </div>
              </div>
            </div>
          </div>

          {/* Side window / sill structures add depth when looking 90° left or right. */}
          <div className="absolute pointer-events-none" style={{
            left: -720, top: -80, width: 160, height: 420,
            transform: "translateZ(-80px) rotateY(18deg)",
            background: "linear-gradient(90deg,#080a0d,#252a30 55%,#111419)",
            border: "1px solid #41474f", borderRadius: 10, boxShadow: "inset 0 0 35px #000",
          }} />
          <div className="absolute pointer-events-none" style={{
            right: -720, top: -80, width: 160, height: 420,
            transform: "translateZ(-80px) rotateY(-18deg)",
            background: "linear-gradient(270deg,#080a0d,#252a30 55%,#111419)",
            border: "1px solid #41474f", borderRadius: 10, boxShadow: "inset 0 0 35px #000",
          }} />
        </div>

        <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full border border-[#46505c]/90 bg-[#080b0e]/90 px-4 py-1.5 font-mono text-[9px] text-subtle shadow-xl backdrop-blur">
          {yaw.toFixed(0)}° yaw · {pitch.toFixed(0)}° pitch · {Math.round(zoom * 100)}% · {seat === "CAPT" ? "Captain" : seat === "FO" ? "First Officer" : "Jump seat"}
        </div>
      </div>

      {help && (
        <div className="absolute bottom-14 left-1/2 z-40 w-[min(440px,92vw)] -translate-x-1/2 rounded-xl border border-[#414851] bg-[#0b0e12]/96 p-4 shadow-2xl backdrop-blur">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="font-display text-sm font-semibold">3D cockpit controls</div>
            <button type="button" onClick={() => setHelp(false)} className="rounded border border-[#3a4048] px-2 py-0.5 font-mono text-[9px] text-subtle">Close</button>
          </div>
          <ul className="space-y-1.5 text-[12px] leading-relaxed text-muted">
            <li><strong className="text-fg">Look</strong> — drag empty space for a full 360° view; WASD / arrows also work.</li>
            <li><strong className="text-fg">Zoom</strong> — pinch with two fingers or use the mouse wheel; + / − also work.</li>
            <li><strong className="text-fg">Controls</strong> — the actual P5 overhead, instrument panel and P8 pedestal stay live.</li>
            <li><strong className="text-fg">Seats</strong> — CAPT / JUMP / F/O changes the seated position.</li>
          </ul>
        </div>
      )}
    </div>
  );
}
