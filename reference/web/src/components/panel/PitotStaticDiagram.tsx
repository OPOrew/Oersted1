import type { ReactNode } from "react";
import { type AirData, type PitotStaticInput, type SideAirData } from "@/lib/sim/pitotStatic";

/**
 * ATA 34 pitot / static plumbing schematic.
 *
 * Probe layout (supplied manual): upper-left = CAPT pitot, upper-right = F/O pitot,
 * lower-right = AUX 1, lower-left = AUX 2. Normal static is cross-connected:
 * CAPT static = upper-left + lower-right, F/O static = upper-right + lower-left.
 * Each side has a static source selector (NORMAL / ALTERNATE) that can switch to the
 * station-406 alternate port. Lines are coloured from the live air-data model, so a blocked
 * probe, an iced pitot, a trapped static line or a selector change shows up on the line that
 * feeds the instrument, and the miniature ASI / altimeter / VSI at the end of each line read
 * what that line delivers (the same values the six-pack uses).
 */

const GREEN = "#3dd68c";
const BLUE = "#5aa9ff";
const AMBER = "#e0a84a";
const RED = "#e24b4b";
const ICE = "#bfe8ff";
const GREY = "#4a5560";
const TXT = "#aab3bc";

const CSS = `
@keyframes psd-flow { to { stroke-dashoffset: -18; } }
@keyframes psd-pulse { 0%,100% { opacity: .35; } 50% { opacity: .9; } }
.psd-flow { stroke-dasharray: 5 4; animation: psd-flow .8s linear infinite; }
.psd-slow { stroke-dasharray: 5 4; animation: psd-flow 2.4s linear infinite; }
.psd-pulse { animation: psd-pulse 1.3s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .psd-flow, .psd-slow, .psd-pulse { animation: none; } }
`;

type PState = "ok" | "cover" | "blocked" | "ice";
const pState = (cover: boolean, blocked: boolean, iced: boolean): PState =>
  cover ? "cover" : blocked ? "blocked" : iced ? "ice" : "ok";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function Line({
  d,
  color,
  flow,
  dim,
}: {
  d: string;
  color: string;
  flow?: "fast" | "slow" | false;
  dim?: boolean;
}) {
  return (
    <g opacity={dim ? 0.35 : 1}>
      <path d={d} fill="none" stroke="#10151a" strokeWidth="5" strokeLinejoin="round" />
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="2.4"
        strokeLinejoin="round"
        className={flow === "fast" ? "psd-flow" : flow === "slow" ? "psd-slow" : undefined}
        strokeDasharray={flow ? undefined : dim ? "3 4" : undefined}
      />
    </g>
  );
}

function Probe({
  cx,
  cy,
  tag,
  state,
  heated,
  staticBlocked,
  align,
}: {
  cx: number;
  cy: number;
  tag: string;
  state: PState;
  heated: boolean;
  staticBlocked: boolean;
  align: "l" | "r";
}) {
  const fill = state === "ok" ? GREEN : state === "ice" ? ICE : RED;
  const tx = align === "l" ? cx + 12 : cx - 12;
  return (
    <g>
      {heated && <circle cx={cx} cy={cy} r="14" fill="#ff9d3a" opacity=".45" className="psd-pulse" />}
      <circle cx={cx} cy={cy} r="7" fill="#12161b" stroke="#d2d7dc" strokeWidth="1" />
      <circle cx={cx} cy={cy} r="3.4" fill={fill} />
      {state === "ice" && <circle cx={cx} cy={cy} r="9.5" fill="none" stroke={ICE} strokeWidth="2.6" opacity=".9" />}
      {state === "cover" && (
        <g>
          <rect x={cx - 8} y={cy - 8} width="16" height="16" rx="2" fill={RED} opacity=".85" />
          <text x={cx} y={cy + 3} fontSize="7" fill="#fff" textAnchor="middle" fontFamily="monospace">RBF</text>
        </g>
      )}
      {state === "blocked" && (
        <g stroke={RED} strokeWidth="2">
          <line x1={cx - 6} y1={cy - 6} x2={cx + 6} y2={cy + 6} />
          <line x1={cx + 6} y1={cy - 6} x2={cx - 6} y2={cy + 6} />
        </g>
      )}
      {staticBlocked && <circle cx={cx} cy={cy + 11} r="2.6" fill={RED} />}
      <text x={tx} y={cy + 3} fontSize="7.5" fill={TXT} fontFamily="monospace" textAnchor={align === "l" ? "start" : "end"}>
        {tag}
      </text>
    </g>
  );
}

function Valve({ cx, cy, label, alt }: { cx: number; cy: number; label: string; alt: boolean }) {
  return (
    <g>
      <rect x={cx - 30} y={cy - 12} width="60" height="26" rx="3" fill="#14181d" stroke={alt ? AMBER : "#39434d"} strokeWidth="1.2" />
      <text x={cx} y={cy - 2} fontSize="6.5" fill={TXT} textAnchor="middle" fontFamily="monospace">{label}</text>
      <text x={cx} y={cy + 9} fontSize="8" fill={alt ? AMBER : GREEN} textAnchor="middle" fontFamily="monospace" fontWeight="bold">
        {alt ? "ALTERNATE" : "NORMAL"}
      </text>
    </g>
  );
}

function Mini({
  cx,
  cy,
  kind,
  data,
}: {
  cx: number;
  cy: number;
  kind: "ASI" | "ALT" | "VSI";
  data: SideAirData;
}) {
  const R = 24;
  let ang = 0;
  let readout = "";
  let fault = false;
  if (kind === "ASI") {
    ang = 135 + 270 * (clamp(data.iasKt, 0, 320) / 320);
    readout = `${Math.round(data.iasKt)} KT`;
    fault = !data.pitotOk || !data.staticOk;
  } else if (kind === "ALT") {
    const a = Math.max(-1000, data.altFt);
    ang = -90 + (((a % 1000) + 1000) % 1000) * 0.36;
    readout = `${Math.round(a).toLocaleString()} FT`;
    fault = !data.staticOk;
  } else {
    ang = 180 + (clamp(data.vsiFpm, -4000, 4000) / 4000) * 150;
    readout = `${data.vsiFpm > 0 ? "+" : ""}${Math.round(data.vsiFpm)}`;
    fault = !data.staticOk;
  }
  const rad = (ang * Math.PI) / 180;
  const ticks = Array.from({ length: 10 }, (_, i) => {
    const a = ((kind === "ALT" ? -90 + i * 36 : 135 + i * 30) * Math.PI) / 180;
    return (
      <line key={i} x1={cx + Math.cos(a) * (R - 5)} y1={cy + Math.sin(a) * (R - 5)} x2={cx + Math.cos(a) * (R - 1)} y2={cy + Math.sin(a) * (R - 1)} stroke="#5b6670" strokeWidth="1" />
    );
  });
  return (
    <g>
      <circle cx={cx} cy={cy} r={R} fill="#07090c" stroke={fault ? RED : "#39414a"} strokeWidth="1.6" />
      {ticks}
      <text x={cx} y={cy - 8} fontSize="6" fill={TXT} textAnchor="middle" fontFamily="monospace">{kind}</text>
      <line
        x1={cx}
        y1={cy}
        x2={cx + Math.cos(rad) * (R - 6)}
        y2={cy + Math.sin(rad) * (R - 6)}
        stroke="#f5f7fa"
        strokeWidth="2"
        strokeLinecap="round"
        style={{ transition: "all 150ms linear" }}
      />
      <circle cx={cx} cy={cy} r="2.2" fill="#f5f7fa" />
      {fault && (
        <g>
          <rect x={cx - 11} y={cy + 6} width="22" height="9" rx="1.5" fill="#3a0d0d" stroke={RED} strokeWidth=".8" />
          <text x={cx} y={cy + 13} fontSize="6" fill="#ff9c9c" textAnchor="middle" fontFamily="monospace">FLAG</text>
        </g>
      )}
      <text x={cx} y={cy + R + 11} fontSize="7.5" fill={fault ? "#ff9c9c" : "#cfe0ee"} textAnchor="middle" fontFamily="monospace">{readout}</text>
    </g>
  );
}

function Chip({ x, y, w = 92, label, ok }: { x: number; y: number; w?: number; label: string; ok: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height="16" rx="3" fill="#14181d" stroke={ok ? "#2f5a43" : RED} strokeWidth="1" />
      <circle cx={x + 8} cy={y + 8} r="3" fill={ok ? GREEN : RED} />
      <text x={x + 15} y={y + 11} fontSize="7" fill={TXT} fontFamily="monospace">{label}</text>
    </g>
  );
}

function Legend({ x, y, color, text, dash }: { x: number; y: number; color: string; text: string; dash?: boolean }) {
  return (
    <g>
      <line x1={x} y1={y} x2={x + 16} y2={y} stroke={color} strokeWidth="2.4" strokeDasharray={dash ? "4 3" : undefined} />
      <text x={x + 21} y={y + 3} fontSize="7" fill={TXT} fontFamily="monospace">{text}</text>
    </g>
  );
}

export function PitotStaticSchematic({
  air,
  s,
  dc,
  captData,
  foData,
}: {
  air: AirData;
  s: PitotStaticInput;
  dc: boolean;
  /** Air data as the instruments show it (zeroed when the instruments have no power). */
  captData: SideAirData;
  foData: SideAirData;
}) {
  const ram = s.psFlightCasKt > 0;
  const heatL = captData.probe.heaterOn;
  const heatR = foData.probe.heaterOn;

  // Use the same live probe state that feeds the instruments. This keeps the
  // schematic from disagreeing with the physical pitot/static model.
  const ul = pState(s.psPitotCaptCover, s.psPitotCaptBlocked, captData.probe.iced);
  const ur = pState(s.psPitotFoCover, s.psPitotFoBlocked, foData.probe.iced);
  const lr = pState(s.psPitotAux1Cover, s.psPitotAux1Blocked, air.aux1.iced);
  const ll = pState(s.psPitotAux2Cover, s.psPitotAux2Blocked, air.aux2.iced);

  const pitotCol = (st: PState) => (st === "ok" ? GREEN : st === "ice" ? ICE : RED);

  // Static: each side has two normal ports; both blocked (and normal selected) traps the line.
  const captTrapped = s.psStaticCaptL && s.psStaticCaptR && !s.psAltStaticCapt;
  const foTrapped = s.psStaticFoL && s.psStaticFoR && !s.psAltStaticFo;
  const mainCol = (a: boolean, b: boolean, alt: boolean) => (alt ? GREY : a && b ? RED : BLUE);
  const portCol = (blocked: boolean, alt: boolean) => (alt ? GREY : blocked ? RED : BLUE);
  const outCol = (alt: boolean, trapped: boolean) => (alt ? AMBER : trapped ? RED : BLUE);

  const cOut = outCol(s.psAltStaticCapt, captTrapped);
  const fOut = outCol(s.psAltStaticFo, foTrapped);

  return (
    <svg
      viewBox="0 0 640 410"
      className="w-full rounded-lg border border-border bg-[#0b0d10]"
      role="img"
      aria-label="737-200 pitot static plumbing from the four probes to the CAPT and F/O airspeed indicators, altimeters and vertical speed indicators"
    >
      <style>{CSS}</style>

      {/* nose / probe area */}
      <path d="M226 24 C226 8 244 4 320 4 C396 4 414 8 414 24 L414 112 C414 120 404 124 320 124 C236 124 226 120 226 112 Z" fill="#12161b" stroke="#2d3741" />
      <text x="320" y="16" fontSize="7" fill="#6e7d8a" textAnchor="middle" fontFamily="monospace" letterSpacing="1">FORWARD FUSELAGE · PROBES</text>

      {/* ───── pitot lines ───── */}
      <Line d="M262 43 V22 H14 V275 H36" color={pitotCol(ul)} flow={ul === "ok" && ram ? "fast" : false} />
      <Line d="M378 43 V22 H626 V275 H604" color={pitotCol(ur)} flow={ur === "ok" && ram ? "fast" : false} />

      {/* ───── static: CAPT = UL + LR ───── */}
      <Line d="M269 50 H196 V128" color={portCol(s.psStaticCaptL, s.psAltStaticCapt)} flow={!s.psStaticCaptL && !s.psAltStaticCapt ? "slow" : false} dim={s.psAltStaticCapt} />
      <Line d="M378 102 V128 H120 V138" color={portCol(s.psStaticCaptR, s.psAltStaticCapt)} flow={!s.psStaticCaptR && !s.psAltStaticCapt ? "slow" : false} dim={s.psAltStaticCapt} />
      <circle cx="196" cy="128" r="2.6" fill={mainCol(s.psStaticCaptL, s.psStaticCaptR, s.psAltStaticCapt)} />
      {/* ───── static: F/O = UR + LL ───── */}
      <Line d="M371 50 H444 V140" color={portCol(s.psStaticFoR, s.psAltStaticFo)} flow={!s.psStaticFoR && !s.psAltStaticFo ? "slow" : false} dim={s.psAltStaticFo} />
      <Line d="M262 102 V140 H520 V138" color={portCol(s.psStaticFoL, s.psAltStaticFo)} flow={!s.psStaticFoL && !s.psAltStaticFo ? "slow" : false} dim={s.psAltStaticFo} />
      <circle cx="444" cy="140" r="2.6" fill={mainCol(s.psStaticFoL, s.psStaticFoR, s.psAltStaticFo)} />

      {/* alternate static ports, station 406 */}
      <rect x="26" y="150" width="9" height="22" rx="2" fill={s.psAltStaticCapt ? AMBER : "#59636d"} />
      <rect x="605" y="150" width="9" height="22" rx="2" fill={s.psAltStaticFo ? AMBER : "#59636d"} />
      <text x="22" y="186" fontSize="6.5" fill={TXT} fontFamily="monospace">ALT STATIC L</text>
      <text x="22" y="195" fontSize="6.5" fill="#6e7d8a" fontFamily="monospace">STN 406</text>
      <text x="618" y="186" fontSize="6.5" fill={TXT} fontFamily="monospace" textAnchor="end">ALT STATIC R</text>
      <text x="618" y="195" fontSize="6.5" fill="#6e7d8a" fontFamily="monospace" textAnchor="end">STN 406</text>
      <Line d="M35 161 H90" color={AMBER} flow={s.psAltStaticCapt ? "slow" : false} dim={!s.psAltStaticCapt} />
      <Line d="M605 161 H550" color={AMBER} flow={s.psAltStaticFo ? "slow" : false} dim={!s.psAltStaticFo} />

      {/* selector valves */}
      <Valve cx={120} cy={152} label="CAPT STATIC SRC" alt={s.psAltStaticCapt} />
      <Valve cx={520} cy={152} label="F/O STATIC SRC" alt={s.psAltStaticFo} />

      {/* valve outputs → instrument static ports */}
      <Line d="M120 166 V232" color={cOut} flow={!captTrapped ? "slow" : false} />
      <Line d="M60 232 H180" color={cOut} />
      <Line d="M60 232 V251 M120 232 V251 M180 232 V251" color={cOut} />
      <Line d="M520 166 V232" color={fOut} flow={!foTrapped ? "slow" : false} />
      <Line d="M460 232 H580" color={fOut} />
      <Line d="M460 232 V251 M520 232 V251 M580 232 V251" color={fOut} />

      {/* probes drawn on top of the lines */}
      <Probe cx={262} cy={50} tag="CAPT" state={ul} heated={heatL} staticBlocked={s.psStaticCaptL} align="l" />
      <Probe cx={378} cy={50} tag="F/O" state={ur} heated={heatR} staticBlocked={s.psStaticFoR} align="r" />
      <Probe cx={262} cy={102} tag="AUX 2" state={ll} heated={heatL} staticBlocked={s.psStaticFoL} align="l" />
      <Probe cx={378} cy={102} tag="AUX 1" state={lr} heated={heatR} staticBlocked={s.psStaticCaptR} align="r" />

      {/* instruments */}
      <text x="62" y="222" fontSize="7" fill="#6e7d8a" textAnchor="middle" fontFamily="monospace" letterSpacing="1">CAPT</text>
      <text x="578" y="222" fontSize="7" fill="#6e7d8a" textAnchor="middle" fontFamily="monospace" letterSpacing="1">F/O</text>
      <Mini cx={60} cy={275} kind="ASI" data={captData} />
      <Mini cx={120} cy={275} kind="ALT" data={captData} />
      <Mini cx={180} cy={275} kind="VSI" data={captData} />
      <Mini cx={580} cy={275} kind="ASI" data={foData} />
      <Mini cx={520} cy={275} kind="ALT" data={foData} />
      <Mini cx={460} cy={275} kind="VSI" data={foData} />

      {/* centre status */}
      <Chip x={274} y={170} label={`AUX 1 PITOT · ${air.aux1PitotOk ? "OK" : "FAULT"}`} ok={air.aux1PitotOk} w={92} />
      <Chip x={274} y={190} label={`AUX 2 PITOT · ${air.aux2PitotOk ? "OK" : "FAULT"}`} ok={air.aux2PitotOk} w={92} />
      <Chip x={274} y={210} label={`ELEV PITOT L · ${air.elevPitotLOk ? "OK" : "FAULT"}`} ok={air.elevPitotLOk} w={92} />
      <Chip x={274} y={230} label={`ELEV PITOT R · ${air.elevPitotROk ? "OK" : "FAULT"}`} ok={air.elevPitotROk} w={92} />
      <text x="320" y="262" fontSize="6.5" fill="#6e7d8a" textAnchor="middle" fontFamily="monospace">AUX / ELEV PITOT</text>
      <text x="320" y="271" fontSize="6.5" fill="#6e7d8a" textAnchor="middle" fontFamily="monospace">HEALTH ONLY</text>
      {air.disagree && (
        <g className="psd-pulse">
          <rect x="244" y="290" width="152" height="18" rx="3" fill="#3a0d0d" stroke={RED} />
          <text x="320" y="302" fontSize="7.5" fill="#ff9c9c" textAnchor="middle" fontFamily="monospace">CAPT / F/O DISAGREE</text>
        </g>
      )}

      {/* flags under each cluster */}
      <Flags x={110} y={322} flags={captData.flags} />
      <Flags x={530} y={322} flags={foData.flags} />

      {/* legend */}
      <Legend x={14} y={396} color={GREEN} text="PITOT (RAM)" />
      <Legend x={118} y={396} color={BLUE} text="STATIC" />
      <Legend x={196} y={396} color={AMBER} text="ALTERNATE" />
      <Legend x={290} y={396} color={RED} text="BLOCKED / TRAPPED" />
      <Legend x={430} y={396} color={ICE} text="ICED" />
      <Legend x={490} y={396} color={GREY} text="NOT SELECTED" dash />
      <text x="626" y="399" fontSize="6.5" fill="#6e7d8a" textAnchor="end" fontFamily="monospace">{dc ? "" : "NO DC · INSTRUMENTS UNPOWERED"}</text>
    </svg>
  );
}

function Flags({ x, y, flags }: { x: number; y: number; flags: string[] }): ReactNode {
  const list = flags.length ? flags : ["NORMAL"];
  const bad = flags.length > 0;
  return (
    <g>
      {list.map((f, i) => {
        const caution = f === "ALT STATIC" || f === "ONE PORT BLOCKED";
        const col = !bad ? GREEN : caution ? AMBER : RED;
        const w = f.length * 4.6 + 12;
        const yy = y + i * 14;
        return (
          <g key={f}>
            <rect x={x - w / 2} y={yy} width={w} height="12" rx="2" fill="#14181d" stroke={col} strokeWidth=".9" />
            <text x={x} y={yy + 8.5} fontSize="6.5" fill={col} textAnchor="middle" fontFamily="monospace">{f}</text>
          </g>
        );
      })}
    </g>
  );
}
