import { useEffect, useRef } from "react";
import type { PointerEvent as RPointerEvent } from "react";
import { useDerived, useSim } from "@/lib/sim/store";
import { cn } from "@/lib/utils";

/**
 * Functional rudder pedals (linked, with toe brakes) and nose-wheel steering tiller.
 *
 * Rudder pedals: drag a pedal plate forward (up) to push it; the linkage drives the
 * opposite pedal aft, as on the real 737 (pedals are mechanically linked). The pad at the
 * top of each pedal is the toe brake - press and hold it. Pedals spring back to neutral
 * on release. Writes `rudderPedal` (-1 = full left, +1 = full right), `leftBrakePedal`
 * and `rightBrakePedal` (0..1).
 *
 * Tiller: drag the knob around its pivot, +/-78 deg. Spring-returns to centre on release.
 * Writes `tiller` (-1..1). Steering only acts with nose gear down, on the ground, HYD A.
 */

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const TRAVEL = 20; // pedal travel in SVG units

type Held = { rud: boolean; til: boolean; tl: boolean; tr: boolean };

export function SteeringControls() {
  const s = useSim();
  const d = useDerived();
  const held = useRef<Held>({ rud: false, til: false, tl: false, tr: false });
  const pedalSvg = useRef<SVGSVGElement>(null);
  const tillerSvg = useRef<SVGSVGElement>(null);
  const rudDrag = useRef<{ side: "L" | "R"; y0: number; r0: number; k: number } | null>(null);
  const tilDrag = useRef<{ a0: number; t0: number } | null>(null);

  // spring return / toe-brake ramp loop
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const st = useSim.getState();
      const h = held.current;
      const upd: Record<string, number> = {};
      if (!h.rud && st.rudderPedal !== 0) {
        const nv = Math.abs(st.rudderPedal) < 0.01 ? 0 : st.rudderPedal - Math.sign(st.rudderPedal) * Math.min(Math.abs(st.rudderPedal), 3 * dt);
        upd.rudderPedal = nv;
      }
      if (!h.til && st.tiller !== 0) {
        const nv = Math.abs(st.tiller) < 0.01 ? 0 : st.tiller - Math.sign(st.tiller) * Math.min(Math.abs(st.tiller), 2.2 * dt);
        upd.tiller = nv;
      }
      const toe = (cur: number, down: boolean) => (down ? Math.min(1, cur + 2.2 * dt) : Math.max(0, cur - 4 * dt));
      const nl = toe(st.leftBrakePedal, h.tl);
      const nr = toe(st.rightBrakePedal, h.tr);
      if (nl !== st.leftBrakePedal) upd.leftBrakePedal = nl;
      if (nr !== st.rightBrakePedal) upd.rightBrakePedal = nr;
      if (Object.keys(upd).length) useSim.getState().patch(upd as any);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ---------- rudder pedals ----------
  const r = s.rudderPedal;
  const offL = r * TRAVEL; // +down/aft when right pedal pushed
  const offR = -r * TRAVEL;

  const pedalDown = (side: "L" | "R") => (e: RPointerEvent<SVGElement>) => {
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const rect = pedalSvg.current?.getBoundingClientRect();
    rudDrag.current = { side, y0: e.clientY, r0: useSim.getState().rudderPedal, k: rect ? 230 / rect.height : 1 };
    held.current.rud = true;
  };
  const pedalMove = (e: RPointerEvent<SVGElement>) => {
    const dr = rudDrag.current;
    if (!dr || !held.current.rud) return;
    const fwd = ((dr.y0 - e.clientY) * dr.k) / TRAVEL; // forward = up the screen
    const next = clamp(dr.side === "L" ? dr.r0 - fwd : dr.r0 + fwd, -1, 1);
    useSim.getState().patch({ rudderPedal: next });
  };
  const pedalUp = () => { rudDrag.current = null; held.current.rud = false; };

  const toeDown = (side: "L" | "R") => (e: RPointerEvent<SVGElement>) => {
    e.preventDefault();
    e.stopPropagation();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (side === "L") held.current.tl = true; else held.current.tr = true;
  };
  const toeUp = (side: "L" | "R") => () => { if (side === "L") held.current.tl = false; else held.current.tr = false; };

  const renderPedal = ({ side, cx, off, toe }: { side: "L" | "R"; cx: number; off: number; toe: number }) => {
    const pushed = side === "L" ? Math.max(0, -r) : Math.max(0, r);
    const padH = 34 - toe * 10; // pad visibly tips away as it is pressed
    return (
      <g key={side}>
        {/* pedal arm hanging from the pivot bar */}
        <path d={`M${cx} 52 L${cx} ${112 + off}`} stroke="#6f7983" strokeWidth="9" strokeLinecap="round" />
        <path d={`M${cx} 52 L${cx} ${112 + off}`} stroke="#aab4be" strokeWidth="3" strokeLinecap="round" />
        <g transform={`translate(0 ${off}) translate(${cx} 150) scale(${1 - pushed * 0.04}) translate(${-cx} -150)`}>
          {/* pedal plate */}
          <rect
            x={cx - 52} y="108" width="104" height="84" rx="9"
            fill="url(#pedalMetal)" stroke={pushed > 0.05 ? "#e0a84a" : "#5b6570"} strokeWidth="3"
            style={{ touchAction: "none", cursor: "grab", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none", WebkitTapHighlightColor: "transparent" }}
            onPointerDown={pedalDown(side)} onPointerMove={pedalMove} onPointerUp={pedalUp} onPointerCancel={pedalUp} onLostPointerCapture={pedalUp}
          />
          {/* anti-slip ribbing (non-interactive) */}
          <g pointerEvents="none" stroke="#1d232a" strokeWidth="2.5">
            {[0, 1, 2, 3, 4, 5].map(i => <path key={i} d={`M${cx - 40} ${152 + i * 6.5} H${cx + 40}`} />)}
          </g>
          {/* toe-brake pad on the upper edge */}
          <rect
            x={cx - 46} y={110} width="92" height={padH} rx="7"
            fill={`rgb(${40 + toe * 190},${46 + toe * 120},${54 - toe * 20})`} stroke={toe > 0.05 ? "#e0a84a" : "#7b8692"} strokeWidth="2.5"
            style={{ touchAction: "none", cursor: "pointer", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none", WebkitTapHighlightColor: "transparent" }}
            onPointerDown={toeDown(side)} onPointerUp={toeUp(side)} onPointerCancel={toeUp(side)} onLostPointerCapture={toeUp(side)}
          />
          <g pointerEvents="none" stroke="#10151a" strokeWidth="2">
            {[0, 1, 2].map(i => <path key={i} d={`M${cx - 36} ${118 + i * 6} H${cx + 36}`} />)}
          </g>
          <text x={cx} y={186} textAnchor="middle" fontSize="9" fill="#cfd6dc" pointerEvents="none" fontFamily="monospace">{side === "L" ? "LEFT" : "RIGHT"}</text>
        </g>
        <text x={cx} y="216" textAnchor="middle" fontSize="9" fill="#9aa5af" fontFamily="monospace">
          TOE {Math.round(toe * 100)}% · PUSH {Math.round(pushed * 100)}%
        </text>
      </g>
    );
  };

  // ---------- tiller ----------
  const tAng = clamp(s.tiller, -1, 1) * 78;
  const angleAt = (e: RPointerEvent<SVGElement>) => {
    const rect = tillerSvg.current?.getBoundingClientRect();
    if (!rect) return 0;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height * (110 / 190);
    return (Math.atan2(e.clientX - cx, -(e.clientY - cy)) * 180) / Math.PI;
  };
  const tillerDown = (e: RPointerEvent<SVGElement>) => {
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    tilDrag.current = { a0: angleAt(e), t0: useSim.getState().tiller * 78 };
    held.current.til = true;
  };
  const tillerMove = (e: RPointerEvent<SVGElement>) => {
    const td = tilDrag.current;
    if (!td || !held.current.til) return;
    let delta = angleAt(e) - td.a0;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    useSim.getState().patch({ tiller: clamp((td.t0 + delta) / 78, -1, 1) });
  };
  const tillerUp = () => { tilDrag.current = null; held.current.til = false; };

  const ticks = [-78, -60, -40, -20, 0, 20, 40, 60, 78];
  const pt = (deg: number, rad: number): [number, number] => [100 + rad * Math.sin((deg * Math.PI) / 180), 110 - rad * Math.cos((deg * Math.PI) / 180)];
  const nws = d.noseWheelSteeringAvailable;
  const nwsAngle = Number(d.noseWheelSteeringAngle ?? 0);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      {/* ---- rudder pedals ---- */}
      <div className="rounded-lg border border-[#39414b] bg-[#0c0f13] p-2">
        <div className="mb-1 flex items-center justify-between font-mono text-[9px] uppercase text-subtle">
          <span>Rudder pedals · toe brakes</span>
          <span className="text-fg">RUDDER {r < -0.03 ? "L" : r > 0.03 ? "R" : ""} {Math.round(Math.abs(r) * 100)}%</span>
        </div>
        <svg ref={pedalSvg} viewBox="0 0 360 230" className="w-full select-none" style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none", WebkitTapHighlightColor: "transparent" }} onContextMenu={(e) => e.preventDefault()} role="img" aria-label="Linked rudder pedals with toe brakes">
          <defs>
            <linearGradient id="pedalMetal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#808b96" /><stop offset="1" stopColor="#3b434b" /></linearGradient>
          </defs>
          <rect x="6" y="6" width="348" height="218" rx="12" fill="#12161b" stroke="#2a323a" />
          {/* cross-shaft / linkage */}
          <rect x="60" y="44" width="240" height="10" rx="5" fill="#59636e" stroke="#8d99a5" />
          <g transform={`rotate(${-r * 22} 180 49)`}>
            <rect x="172" y="32" width="16" height="34" rx="5" fill="#69747f" stroke="#a9b3bd" />
            <circle cx="180" cy="49" r="5" fill="#222930" />
            <path d="M120 49 H180 H240" stroke="#a9b3bd" strokeWidth="3" />
          </g>
          {renderPedal({ side: "L", cx: 105, off: offL, toe: s.leftBrakePedal })}
          {renderPedal({ side: "R", cx: 255, off: offR, toe: s.rightBrakePedal })}
        </svg>
        <p className="mt-1 text-[8px] leading-snug text-subtle">Drag a pedal plate forward (up) to push it; the linkage moves the other pedal aft. Press and hold the top pad for that side's toe brake — two fingers work at once. Pedals spring back to neutral when released. Pedal steering adds only ±7° at the nose wheel.</p>
      </div>

      {/* ---- tiller ---- */}
      <div className="rounded-lg border border-[#39414b] bg-[#0c0f13] p-2">
        <div className="mb-1 flex items-center justify-between font-mono text-[9px] uppercase text-subtle">
          <span>Nose wheel steering tiller</span>
          <span className={cn(nws ? "text-ok" : "text-subtle")}>{nws ? "NWS ACTIVE" : "NWS INOP"}</span>
        </div>
        <svg ref={tillerSvg} viewBox="0 0 200 190" className="mx-auto w-full max-w-[16rem] select-none" style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none", WebkitTapHighlightColor: "transparent" }} onContextMenu={(e) => e.preventDefault()} role="img" aria-label="Nose wheel steering tiller">
          <defs>
            <radialGradient id="tillerKnob" cx="40%" cy="35%"><stop offset="0" stopColor="#6b747d" /><stop offset="1" stopColor="#252b31" /></radialGradient>
          </defs>
          <rect x="4" y="4" width="192" height="182" rx="12" fill="#12161b" stroke="#2a323a" />
          {/* scale plate */}
          <path d={`M${pt(-78, 78)[0]} ${pt(-78, 78)[1]} A78 78 0 0 1 ${pt(78, 78)[0]} ${pt(78, 78)[1]}`} fill="none" stroke="#3a444e" strokeWidth="2" />
          {ticks.map(t => {
            const [x1, y1] = pt(t, 72); const [x2, y2] = pt(t, 82); const [lx, ly] = pt(t, 94);
            return (
              <g key={t}>
                <path d={`M${x1} ${y1} L${x2} ${y2}`} stroke={t === 0 ? "#e0a84a" : "#8d99a5"} strokeWidth={t === 0 ? 3 : 2} />
                <text x={lx} y={ly + 3} textAnchor="middle" fontSize="8" fill="#9aa5af" fontFamily="monospace">{Math.abs(t)}</text>
              </g>
            );
          })}
          <text x="14" y="30" fontSize="8" fill="#9aa5af" fontFamily="monospace">L</text>
          <text x="180" y="30" fontSize="8" fill="#9aa5af" fontFamily="monospace">R</text>
          {/* tiller body: base, rotating knob + handle */}
          <circle cx="100" cy="110" r="38" fill="#1b2128" stroke="#4b5560" strokeWidth="3" />
          <g transform={`rotate(${tAng} 100 110)`} style={{ cursor: "grab" }}>
            <rect x="94" y="52" width="12" height="58" rx="6" fill="#59636e" stroke="#a1abb4" strokeWidth="1.5" />
            <circle cx="100" cy="48" r="13" fill="url(#tillerKnob)" stroke="#b8c1c9" strokeWidth="2" />
            <circle cx="100" cy="110" r="25" fill="url(#tillerKnob)" stroke="#aab4be" strokeWidth="2.5" />
            <circle cx="100" cy="110" r="6" fill="#171c21" stroke="#6b747d" />
            <path d="M100 118 V132" stroke="#e0a84a" strokeWidth="3" strokeLinecap="round" />
          </g>
          {/* invisible larger hit target */}
          <circle cx="100" cy="110" r="70" fill="transparent" style={{ touchAction: "none" }}
            onPointerDown={tillerDown} onPointerMove={tillerMove} onPointerUp={tillerUp} onPointerCancel={tillerUp} onLostPointerCapture={tillerUp} />
          <text x="100" y="178" textAnchor="middle" fontSize="9" fill="#cfd6dc" fontFamily="monospace">TILLER {tAng >= 0 ? "R" : "L"} {Math.abs(tAng).toFixed(0)}°</text>
        </svg>
        {/* nose wheel plan view showing actual deflection */}
        <div className="mt-1 flex items-center justify-between gap-2 rounded border border-border bg-inset px-2 py-1">
          <svg viewBox="0 0 60 50" className="h-10 w-12" role="img" aria-label="Nose wheel angle">
            <path d="M30 2 V22" stroke="#6f7983" strokeWidth="3" />
            <g transform={`rotate(${nws ? nwsAngle : 0} 30 24)`}>
              <rect x="20" y="12" width="7" height="24" rx="3" fill="#10141a" stroke="#9aa5b0" strokeWidth="1.5" />
              <rect x="33" y="12" width="7" height="24" rx="3" fill="#10141a" stroke="#9aa5b0" strokeWidth="1.5" />
            </g>
          </svg>
          <span className="font-mono text-[9px] uppercase text-subtle">NWS {nwsAngle.toFixed(0)}° · {nws ? "SYSTEM A" : "OFF"}</span>
        </div>
        <p className="mt-1 text-[8px] leading-snug text-subtle">Drag the knob around its pivot (±78°); it springs to centre on release. Steering works only with the nose gear down, on the ground, with HYD A pressure.</p>
      </div>
    </div>
  );
}
