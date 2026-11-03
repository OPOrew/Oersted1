import { useEffect, useRef } from "react";
import type { PointerEvent as RPointerEvent } from "react";
import { useSim } from "@/lib/sim/store";
import { cn } from "@/lib/utils";
import { useMip } from "@/lib/sim/mipLocal";
import { SteeringControls } from "./SteeringControls";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

type Drag = { x0: number; y0: number; pitch0: number; roll0: number; sx: number; sy: number };

/**
 * Shared 737-200 control-column trainer. The yoke writes the same yokePitch/yokeRoll
 * state used by the flight-control model. The linked rudder pedals and toe brakes are
 * rendered by SteeringControls. Pointer capture keeps yoke + pedal inputs independent,
 * so a yoke movement and a pedal/toe-brake input can be held simultaneously on touch.
 */
export function FlightControlInputs({ compact = false, title = "Flight controls" }: { compact?: boolean; title?: string }) {
  const s = useSim();
  const held = useRef(false);
  const drag = useRef<Drag | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const st = useSim.getState();
      if (!held.current) {
        const step = 3.0 * dt;
        const pitch = Math.abs(st.yokePitch) < 0.01 ? 0 : st.yokePitch - Math.sign(st.yokePitch) * Math.min(Math.abs(st.yokePitch), step);
        const roll = Math.abs(st.yokeRoll) < 0.01 ? 0 : st.yokeRoll - Math.sign(st.yokeRoll) * Math.min(Math.abs(st.yokeRoll), step);
        if (pitch !== st.yokePitch || roll !== st.yokeRoll) useSim.getState().patch({ yokePitch: pitch, yokeRoll: roll });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const down = (e: RPointerEvent<SVGElement>) => {
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const rect = svgRef.current?.getBoundingClientRect();
    const scale = rect ? Math.min(rect.width / 320, rect.height / 300) : 1;
    drag.current = {
      x0: e.clientX,
      y0: e.clientY,
      pitch0: useSim.getState().yokePitch,
      roll0: useSim.getState().yokeRoll,
      sx: 2.8 / Math.max(scale, 0.2),
      sy: 2.8 / Math.max(scale, 0.2),
    };
    held.current = true;
  };

  const move = (e: RPointerEvent<SVGElement>) => {
    const d = drag.current;
    if (!d || !held.current) return;
    const roll = clamp(d.roll0 + (e.clientX - d.x0) * d.sx / 100, -1, 1);
    const pitch = clamp(d.pitch0 - (e.clientY - d.y0) * d.sy / 100, -1, 1);
    useSim.getState().patch({ yokeRoll: roll, yokePitch: pitch });
  };

  const up = () => {
    drag.current = null;
    held.current = false;
  };

  const pitch = clamp(s.yokePitch, -1, 1);
  const roll = clamp(s.yokeRoll, -1, 1);
  const wheelY = 105 + pitch * 36;
  const wheelRot = roll * 32;

  return (
    <section className={cn("rounded-xl border border-border bg-surface p-3 shadow-panel", compact && "p-2")}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-display text-[10px] uppercase tracking-[.16em] text-subtle">ATA 27 · primary flight controls</div>
          <h3 className="font-display text-sm font-semibold text-fg">{title}</h3>
        </div>
        <div className="grid grid-cols-2 gap-1 font-mono text-[8px] uppercase">
          <span className="rounded border border-border bg-inset px-2 py-1">PITCH {Math.round(pitch * 100)}%</span>
          <span className="rounded border border-border bg-inset px-2 py-1">ROLL {Math.round(roll * 100)}%</span>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(220px,.9fr)_minmax(0,1.4fr)]">
        <div className="rounded-lg border border-[#39414b] bg-[#0c0f13] p-2">
          <div className="mb-1 flex items-center justify-between font-mono text-[8px] uppercase text-subtle">
            <span>Control column / yoke</span>
            <span className="text-fg">2-axis · self-centering</span>
          </div>
          <svg
            ref={svgRef}
            viewBox="0 0 320 230"
            className="w-full select-none"
            style={{ touchAction: "none", cursor: held.current ? "grabbing" : "grab", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none", WebkitTapHighlightColor: "transparent" }}
            onContextMenu={(e) => e.preventDefault()}
            role="img"
            aria-label="Movable two-axis Boeing 737 style control yoke"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onLostPointerCapture={up}
          >
            <defs>
              <linearGradient id="yokeMetal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8b9298" /><stop offset=".48" stopColor="#3e444a" /><stop offset="1" stopColor="#171b1f" /></linearGradient>
              <linearGradient id="yokeGrip" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#20252a" /><stop offset=".5" stopColor="#050709" /><stop offset="1" stopColor="#20252a" /></linearGradient>
            </defs>
            <rect x="5" y="5" width="310" height="220" rx="12" fill="#11151a" stroke="#2a323a" />
            <path d="M160 25 V204" stroke="#303840" strokeWidth="3" strokeDasharray="5 6" />
            <path d="M44 115 H276" stroke="#303840" strokeWidth="3" strokeDasharray="5 6" />
            <g aria-hidden="true">
              <rect x="152" y="150" width="16" height="62" rx="5" fill="url(#yokeMetal)" stroke="#0a0c0f" strokeWidth="3" />
              <rect x="140" y="196" width="40" height="20" rx="6" fill="#20262c" stroke="#777f87" />
              <circle cx="160" cy="206" r="4.5" fill="#0b0d10" />
            </g>
            <g transform={`translate(160 105) scale(${1 + pitch * 0.12}) rotate(${wheelRot}) translate(-160 -105)`} style={{ transition: held.current ? "none" : "transform 80ms linear" }}>
              <rect x="151" y="52" width="18" height="106" rx="7" fill="url(#yokeMetal)" stroke="#0a0c0f" strokeWidth="3" />
              <path d="M151 78 C124 58 90 55 61 75 C47 85 43 105 49 124 C54 139 66 151 84 157" fill="none" stroke="url(#yokeGrip)" strokeWidth="16" strokeLinecap="round" />
              <path d="M169 78 C196 58 230 55 259 75 C273 85 277 105 271 124 C266 139 254 151 236 157" fill="none" stroke="url(#yokeGrip)" strokeWidth="16" strokeLinecap="round" />
              <path d="M151 78 C124 58 90 55 61 75" fill="none" stroke="#777f87" strokeWidth="3" strokeLinecap="round" />
              <path d="M169 78 C196 58 230 55 259 75" fill="none" stroke="#777f87" strokeWidth="3" strokeLinecap="round" />
              <rect x="62" y="68" width="39" height="48" rx="6" fill="#15191d" stroke="#606a73" strokeWidth="2" />
              <rect x="219" y="68" width="39" height="48" rx="6" fill="#15191d" stroke="#606a73" strokeWidth="2" />
              <circle cx="81" cy="91" r="5" fill={Math.abs(roll) > 0.08 ? "#e0a84a" : "#59636d"} />
              <circle cx="239" cy="91" r="5" fill={Math.abs(pitch) > 0.08 ? "#e0a84a" : "#59636d"} />
            </g>
            <text x="160" y="222" fill="#9aa5af" fontSize="8" textAnchor="middle" fontFamily="monospace">DRAG LEFT/RIGHT = ROLL · UP/DOWN = PITCH · RELEASE = CENTER</text>
          </svg>
          <button type="button" onClick={() => useMip.getState().set({ apAil: false, apElev: false, apWarn: false })}
            className="mt-2 w-full rounded-md border border-[#5a1f1a] bg-[#3a0f0c] px-2 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[.1em] text-[#ffb3a8] active:translate-y-px"
            aria-label="Autopilot disengage switch on the control wheel">A/P disengage (control wheel switch)</button>
        </div>

        <div className="min-w-0">
          <SteeringControls />
        </div>
      </div>
      <p className="mt-2 text-[8px] leading-snug text-subtle">The yoke and pedals write the same shared simulator inputs used by the flight-control, attitude and instrument models. Touch/mouse pointer capture allows yoke movement and rudder/toe-brake input to be held at the same time.</p>
    </section>
  );
}
