import { useEffect, useId, useState, type CSSProperties } from "react";
import { useDerived, useSim } from "@/lib/sim/store";
import { WX_CELLS, WX_CITIES, WX_COAST, beamFactor, useWxrNav, useLiveWx } from "@/lib/sim/wxrWorld";
import { useMip } from "@/lib/sim/mipLocal";
import { cn } from "@/lib/utils";

/**
 * Sperry Primus 90 weather radar indicator (737-200 AMM 34-41-01).
 *  - mode pushbuttons STBY / WX / CYC / MAP (all out = "PUSH"), 70 s warm-up ("WAIT" then "STBY")
 *  - RANGE switch: TEST, 10, 25, 50, 100, 200, 300 NM; TILT +/-15; GAIN PRESET / variable; INT; STAB
 *  - SEC SCAN (80 / 160 degree sector), FRZ, AZIM (30 degree strobes), TGT ALRT
 *  - WX colours green / yellow / red, MAP colours cyan / yellow / magenta, five range marks, colour bar legend
 *  - TEST: the self-test pattern (marks 20..100, three colour bands, yellow band 65-80, red target-alert sector, noise band 85-95)
 */
export const WXR_MODES = ["PUSH", "STBY", "WX", "CYC", "MAP"] as const;
export const WXR_RANGES = ["TEST", "10", "25", "50", "100", "200", "300"] as const;
const WARMUP_MS = 70_000;

/** Warm-up clock: true once the radar has been out of the PUSH state for 70 s with power on. */
export function useWxrWarm() {
  const m = useMip();
  const d = useDerived();
  const [, tick] = useState(0);
  useEffect(() => {
    if (!d.dcPower) { if (m.radarStbyAt) m.set({ radarStbyAt: 0 }); return; }
    if (m.radarMode === 0) { if (m.radarStbyAt) m.set({ radarStbyAt: 0 }); return; }
    if (!m.radarStbyAt) m.set({ radarStbyAt: Date.now() });
  }, [d.dcPower, m.radarMode, m.radarStbyAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const warm = !!m.radarStbyAt && Date.now() - m.radarStbyAt >= WARMUP_MS;
  useEffect(() => {
    if (!d.dcPower || m.radarMode === 0 || warm) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [d.dcPower, m.radarMode, warm]);
  return warm;
}

const CX = 100, CY = 146, R = 130;
const pt = (r: number, deg: number) => `${(CX + r * Math.sin((deg * Math.PI) / 180)).toFixed(1)} ${(CY - r * Math.cos((deg * Math.PI) / 180)).toFixed(1)}`;
const band = (r0: number, r1: number, h: number) => `M${pt(r0, -h)} A${r0} ${r0} 0 0 1 ${pt(r0, h)} L${pt(r1, h)} A${r1} ${r1} 0 0 0 ${pt(r1, -h)} Z`;
const arc = (r: number, h: number) => `M${pt(r, -h)} A${r} ${r} 0 0 1 ${pt(r, h)}`;
const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

export function WxrScope({ className, style }: { className?: string; style?: CSSProperties }) {
  const m = useMip();
  const d = useDerived();
  const s = useSim();
  const nav = useWxrNav();
  const liveWx = useLiveWx();
  const cells = liveWx.cells.length ? liveWx.cells : WX_CELLS;
  const uid = useId().replace(/:/g, "");
  const altFt = Number((s as unknown as Record<string, unknown>).psFlightAltFt ?? 0) || 0;
  const warm = useWxrWarm();
  const power = !!d.dcPower;
  const test = m.radarRange === 0;
  const rangeNm = test ? 100 : Number(WXR_RANGES[m.radarRange]);
  const mode = WXR_MODES[m.radarMode];
  const map = mode === "MAP";
  const H = m.radarSector ? 40 : 80;
  const inten = 0.35 + m.radarInt * 0.65;
  const markCol = map ? "#3ddc84" : "#35d0e0";
  const lvl = map ? ["#35d0e0", "#f2d84a", "#e040c8"] : ["#3ddc84", "#f2d84a", "#ff3b30"];
  // mode field: PUSH / WAIT / STBY override TEST (AMM 34-41-01)
  let field: string = mode;
  if (mode !== "PUSH" && !warm) field = "WAIT";
  else if (mode === "STBY") field = "STBY";
  else if (test && mode !== "PUSH") field = "TEST";
  const live = power && warm && (mode === "WX" || mode === "CYC" || mode === "MAP");
  const variable = m.radarGain > 0.02 && (mode === "WX" || mode === "MAP") && !test;
  const period = m.radarSector ? 2.1 : 4.3;
  // target alert (AMM): a contourable (red) target 75-150 NM, within 15 degrees of dead ahead
  const tgtHit = live && m.radarTgt && !map && cells.some((c) => {
    const dx = c.x - nav.x, dy = c.y - nav.y, rng = Math.hypot(dx, dy);
    const rel = ((Math.atan2(dx, dy) * 180) / Math.PI - nav.hdg + 540) % 360 - 180;
    return rng >= 75 && rng <= 150 && Math.abs(rel) <= 15 && beamFactor(rng, m.radarTilt, altFt) > 0.85;
  });
  const noise = Array.from({ length: 70 }, (_, i) => {
    const a = ((i * 137.5) % 160) - 80, r = 4 + ((i * 53) % 100) / 100 * (map ? 26 : 10) * (1 + m.radarGain * 2);
    return { a, r };
  }).filter((n) => Math.abs(n.a) <= H);
  return (
    <div className={cn("relative overflow-hidden bg-[#050806]", className)} style={style}>
      <style>{`@keyframes wxrsweep{0%{transform:rotate(calc(var(--h)*-1deg))}50%{transform:rotate(calc(var(--h)*1deg))}100%{transform:rotate(calc(var(--h)*-1deg))}}@keyframes wxrblink{50%{opacity:0}}`}</style>
      {power ? (
        <svg viewBox="0 0 200 150" className="size-full" aria-hidden style={{ opacity: inten, fontFamily: "ui-monospace,Menlo,monospace" }}>
          <defs><clipPath id={`${uid}c`}><path d={`M${CX} ${CY} L${pt(R, -H)} A${R} ${R} 0 0 1 ${pt(R, H)} Z`} /></clipPath></defs>
          {live && (
            <>
              {/* five range marks, cyan in WX / CYC, green in MAP */}
              {[1, 2, 3, 4, 5].map((i) => (
                <g key={i}>
                  <path d={arc((R / 5) * i, H)} fill="none" stroke={markCol} strokeWidth=".8" opacity=".85" />
                  <text x={CX + 3} y={CY - (R / 5) * i + 8} fontSize="6" fill={markCol}>{fmt((rangeNm / 5) * i)}</text>
                </g>
              ))}
              {m.radarAzim && [-60, -30, 0, 30, 60].filter((a) => Math.abs(a) <= H).map((a) => <line key={a} x1={CX} y1={CY} x2={pt(R, a).split(" ")[0]} y2={pt(R, a).split(" ")[1]} stroke={markCol} strokeWidth=".6" strokeDasharray="2 3" opacity=".7" />)}
              {test && (
                <g>
                  {/* AMM 34-41-01 self-test pattern */}
                  <path d={band(R * 0.2, R * 0.35, H)} fill={lvl[0]} opacity=".8" />
                  <path d={band(R * 0.35, R * 0.5, H)} fill={lvl[1]} opacity=".8" />
                  <path d={band(R * 0.5, R * 0.65, H)} fill={lvl[2]} opacity=".85" />
                  <path d={band(R * 0.65, R * 0.8, H)} fill={lvl[1]} opacity=".8" />
                  <path d={band(R * 0.75, R * 1.0, Math.min(15, H))} fill={lvl[2]} opacity=".9" />
                  <path d={band(R * 0.85, R * 0.95, H)} fill={lvl[0]} />
                </g>
              )}
              {!test && (
                <g clipPath={`url(#${uid}c)`}>
                  {/* returns: storm cells in WX / CYC, coast and cities in MAP */}
                  {!map && cells.map((c, i) => {
                    const dx = c.x - nav.x, dy = c.y - nav.y;
                    const rng = Math.hypot(dx, dy);
                    if (rng > rangeNm * 1.3) return null;
                    const rel = ((Math.atan2(dx, dy) * 180) / Math.PI - nav.hdg + 540) % 360 - 180;
                    const f = beamFactor(rng, m.radarTilt, altFt) * (1 + (mode === "WX" ? m.radarGain * 0.4 : 0));
                    const shown = f > 0.85 ? 3 : f > 0.55 ? 2 : f > 0.2 ? 1 : 0;
                    if (!shown) return null;
                    const [px, py] = pt((rng / rangeNm) * R, rel).split(" ").map(Number);
                    const rr = (c.r / rangeNm) * R;
                    const rot = c.ang - nav.hdg;
                    return (
                      <g key={i} transform={`translate(${px} ${py}) rotate(${rot})`}>
                        <ellipse rx={rr * c.asp} ry={rr / c.asp} fill={lvl[0]} opacity=".85" />
                        {shown > 1 && <ellipse rx={rr * c.asp * 0.62} ry={(rr / c.asp) * 0.62} fill={lvl[1]} opacity=".9" />}
                        {shown > 2 && <ellipse rx={rr * c.asp * 0.3} ry={(rr / c.asp) * 0.3} fill={lvl[2]} style={mode === "CYC" ? { animation: "wxrblink 1s steps(1) infinite" } : undefined} />}
                      </g>
                    );
                  })}
                  {map && (
                    <g>
                      <polyline fill="none" stroke={lvl[0]} strokeWidth="2.2" opacity=".9" points={WX_COAST.map(([x, y]) => { const dx = x - nav.x, dy = y - nav.y; return pt((Math.hypot(dx, dy) / rangeNm) * R, ((Math.atan2(dx, dy) * 180) / Math.PI - nav.hdg + 540) % 360 - 180).replace(" ", ","); }).join(" ")} />
                      <polyline fill="none" stroke={lvl[1]} strokeWidth=".8" opacity=".9" points={WX_COAST.map(([x, y]) => { const dx = x - nav.x, dy = y - nav.y; return pt((Math.hypot(dx, dy) / rangeNm) * R, ((Math.atan2(dx, dy) * 180) / Math.PI - nav.hdg + 540) % 360 - 180).replace(" ", ","); }).join(" ")} />
                      {WX_CITIES.map(([x, y], i) => { const dx = x - nav.x, dy = y - nav.y; const [px, py] = pt((Math.hypot(dx, dy) / rangeNm) * R, ((Math.atan2(dx, dy) * 180) / Math.PI - nav.hdg + 540) % 360 - 180).split(" ").map(Number); return <circle key={i} cx={px} cy={py} r="3" fill={lvl[2]} />; })}
                    </g>
                  )}
                </g>
              )}
              {!test && (map || variable) && noise.map((n, i) => <circle key={i} cx={pt(n.r * (map ? 1 : 3), n.a).split(" ")[0]} cy={pt(n.r * (map ? 1 : 3), n.a).split(" ")[1]} r=".9" fill={lvl[0]} opacity=".6" />)}
              <line x1={CX} y1={CY} x2={CX} y2={CY - R} stroke="#dfe8df" strokeWidth="1" opacity=".75" style={{ ["--h" as string]: H, transformOrigin: `${CX}px ${CY}px`, animation: `wxrsweep ${period}s linear infinite`, animationPlayState: m.radarFrz ? "paused" : "running" } as CSSProperties} />
              {/* colour bar legend with level numbers, upper right */}
              {lvl.map((c, i) => (
                <g key={i}><rect x={176} y={6 + i * 11} width="8" height="8" fill={c} /><text x={187} y={13 + i * 11} fontSize="7" fill="#e6efe6">{i + 1}</text></g>
              ))}
            </>
          )}
          {m.radarTgt && <g><rect x="3" y="3" width="22" height="11" fill="#ff3b30" /><text x="6" y="12" fontSize="8" fill="#fff" fontWeight="bold">{tgtHit ? "TGT" : "T"}</text></g>}
          {m.radarFrz && field !== "PUSH" && field !== "STBY" && field !== "WAIT" && <text x="4" y="133" fontSize="8" fill="#e6efe6" style={{ animation: "wxrblink 1s steps(1) infinite" }}>FRZ</text>}
          {variable && !m.radarFrz && field !== "WAIT" && <text x="4" y="133" fontSize="8" fill="#e6efe6">VAR</text>}
          <text x="4" y="144" fontSize="9" fill={field === "WAIT" || field === "PUSH" ? "#f2d84a" : "#e6efe6"}>{field}</text>
        </svg>
      ) : null}
      <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(125deg,rgba(255,255,255,.08),transparent 38%)" }} />
    </div>
  );
}
