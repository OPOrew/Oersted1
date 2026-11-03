import { propsEqual } from "@/lib/props-equal";
import { useId, type CSSProperties, type ReactNode, memo } from "react";
import type { SideAirData } from "@/lib/sim/pitotStatic";
import { vmoMmoLimitKt } from "@/lib/sim/pitotStatic";
import type { MipFail, FdCmd } from "@/lib/sim/mipLocal";
import { vorDevOf, type NavData } from "@/lib/sim/radionav";

/**
 * Round-dial and flight-director instruments for the 737-200 main instrument panel: ADI, HSI, RMI / DME, ASI and altimeter.
 * They are pure display components: every value comes from a model (air data, attitude, radio receivers) through props.
 *
 *  ADI : vertical gyro attitude, FD V-bars, localizer + glideslope deviation from the selected VHF NAV receiver, ATT / FD / LOC / GS / SPD / HT flags
 *  HSI : compass-system heading, selected course / heading, VOR or localizer deviation with TO/FROM, glideslope pointer, DME-independent NAV flag
 *  RMI : compass card, two bearing pointers (single bar = pointer 1, double bar = pointer 2; each VOR or ADF), DME-1 / DME-2 digital windows
 *  ASI : CADC airspeed, Mach, VMO / MMO barber pole, speed bug.  ALT : CADC altitude with the baro setting that actually changes the reading.
 */

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const pad = (n: number, w: number) => String(Math.round(n)).padStart(w, "0");
const norm360 = (a: number) => ((a % 360) + 360) % 360;
const FONT = "Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, Menlo, Consolas, monospace";
const WHITE = "#f2f0e6";
const AMBER = "#ffb81c";
const FLAG_FILL = "#ff5a2a";
const FLAG_EDGE = "#ff8a5a";
const FLAG_TEXT = "#5a1000";

function pol(cx: number, cy: number, r: number, a: number): [number, number] {
  const t = (a * Math.PI) / 180;
  return [cx + r * Math.sin(t), cy - r * Math.cos(t)];
}

/** Orange warning flag (in view when its system is invalid), drawn centred on (x, y). */
function Flag({ x, y, text, w = 34, h = 14, rot = 0, size = 10 }: { x: number; y: number; text: string; w?: number; h?: number; rot?: number; size?: number }) {
  return (
    <g transform={`rotate(${rot} ${x} ${y})`}>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx="2" fill={FLAG_FILL} stroke={FLAG_EDGE} strokeWidth=".8" />
      <text x={x} y={y + 0.5} fill={FLAG_TEXT} fontSize={size} fontWeight="bold" textAnchor="middle" dominantBaseline="central" fontFamily={MONO}>{text}</text>
    </g>
  );
}

const smooth = (ms = 120): CSSProperties => ({ transition: `transform ${ms}ms linear` });
const rot = (deg: number, cx: number, cy: number, ms = 120): CSSProperties => ({ transform: `rotate(${deg}deg)`, transformOrigin: `${cx}px ${cy}px`, ...smooth(ms) });

/* ═════════════════════════════ ADI ═════════════════════════════ */

/** Localizer / glideslope data the ADI shows (already selected through the VHF NAV switch and source failures). */
export interface AdiNav {
  /** an ILS frequency is tuned in the selected receiver: the deviation scales are active and their flags can show */
  ils: boolean;
  locValid: boolean;
  gsValid: boolean;
  /** localizer deviation, deg: positive = bar right (airplane left of course) */
  locDev: number;
  /** glideslope error, deg: positive = airplane above the beam (pointer moves down) */
  gsErr: number;
}
export const NO_ADI_NAV: AdiNav = { ils: false, locValid: false, gsValid: false, locDev: 0, gsErr: 0 };

/**
 * ADI localizer / glideslope data from the VHF NAV receiver that feeds this side. `tunedIls` = an ILS frequency is selected and the nav environment is on,
 * so the scales are active and their flags can show. `locErr` / `gsErr` are null when the signal is not valid.
 */
export function adiNavFrom(tunedIls: boolean, locErr: number | null, gsErr: number | null): AdiNav {
  return { ils: tunedIls, locValid: locErr !== null, gsValid: gsErr !== null, locDev: locErr ?? 0, gsErr: gsErr ?? 0 };
}

const PX_DEG = 2.7; // ball scale: pixels per degree of pitch
const ADI_CX = 121, ADI_CY = 122, ADI_R = 86;

/** Flight-director ADI (Collins FD-108 style): sky / ground ball, pitch ladder, bank scale, FD V-bars, localizer and glideslope scales, flag set, ADI TEST. */
function AdiRealImpl({ powered, test, fail, pitch = 0, roll = 0, slip = 0, fd, nav = NO_ADI_NAV }: { powered: boolean; test: boolean; fail: MipFail; pitch?: number; roll?: number; /** inclinometer ball: -1 (left) .. +1 (right) */ slip?: number; fd?: FdCmd; nav?: AdiNav }) {
  const uid = useId().replace(/:/g, "");
  const p = pitch + (test ? 10 : 0);
  const r = roll + (test ? 20 : 0);
  const attBad = !powered || fail.att || test;
  const fdShown = powered && !!fd?.show && !fail.fd && !fail.att;
  const locFlag = !powered || fail.loc || (nav.ils && !nav.locValid);
  const gsFlag = !powered || fail.gs || (nav.ils && !nav.gsValid);
  const locOn = powered && nav.ils && nav.locValid && !fail.loc;
  const gsOn = powered && nav.ils && nav.gsValid && !fail.gs;
  const lad: { d: number; w: number; n?: string }[] = [];
  for (const a of [2.5, 5, 7.5, 10, 12.5, 15, 17.5, 20, 25, 30, 40, 50]) lad.push({ d: a, w: a % 10 === 0 ? 34 : a % 5 === 0 ? 22 : 11, n: a % 10 === 0 ? String(a) : undefined });
  const dot = (i: number) => ADI_CX + i * 26;
  return (
    <svg viewBox="0 0 242 254" className="size-full" role="img" aria-label="Attitude director indicator with localizer and glideslope">
      <defs>
        <clipPath id={`${uid}-ball`}><circle cx={ADI_CX} cy={ADI_CY} r={ADI_R} /></clipPath>
        <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1f6fb2" /><stop offset="1" stopColor="#4da6e0" /></linearGradient>
        <linearGradient id={`${uid}-gnd`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1d2024" /><stop offset="1" stopColor="#08090b" /></linearGradient>
        <radialGradient id={`${uid}-shade`} cx="50%" cy="42%" r="58%"><stop offset=".6" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".5" /></radialGradient>
      </defs>
      <rect width="242" height="254" rx="9" fill="#0a0c0f" />
      <circle cx={ADI_CX} cy={ADI_CY} r={ADI_R + 5} fill="#15181c" stroke="#4a525a" strokeWidth="1.5" />
      <g clipPath={`url(#${uid}-ball)`}>
        <g style={rot(-r, ADI_CX, ADI_CY, 100)}>
          <g style={{ transform: `translateY(${clamp(p, -90, 90) * PX_DEG}px)`, ...smooth(100) }}>
            <rect x="-200" y={ADI_CY - 600} width="640" height="600" fill={`url(#${uid}-sky)`} />
            <rect x="-200" y={ADI_CY} width="640" height="600" fill={`url(#${uid}-gnd)`} />
            <line x1="-200" y1={ADI_CY} x2="440" y2={ADI_CY} stroke="#fff" strokeWidth="2" />
            {lad.flatMap(({ d, w, n }) => [d, -d].map((s) => {
              const y = ADI_CY - s * PX_DEG;
              return (
                <g key={s}>
                  <line x1={ADI_CX - w} y1={y} x2={ADI_CX + w} y2={y} stroke="#fff" strokeWidth={n ? 1.6 : 1.1} />
                  {n && <><text x={ADI_CX - w - 5} y={y} fontSize="8" fill="#fff" textAnchor="end" dominantBaseline="central" fontFamily={FONT}>{n}</text><text x={ADI_CX + w + 5} y={y} fontSize="8" fill="#fff" textAnchor="start" dominantBaseline="central" fontFamily={FONT}>{n}</text></>}
                </g>
              );
            }))}
          </g>
          {/* bank scale rides with the roll axis */}
          {[0, 10, 20, 30, 45, 60].flatMap((a) => (a === 0 ? [0] : [a, -a])).map((a) => {
            const [x1, y1] = pol(ADI_CX, ADI_CY, ADI_R - (a % 30 === 0 ? 14 : 9), a);
            const [x2, y2] = pol(ADI_CX, ADI_CY, ADI_R - 1, a);
            return <line key={a} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fff" strokeWidth={a % 30 === 0 ? 2.2 : 1.3} />;
          })}
          <polygon points={`${ADI_CX},${ADI_CY - ADI_R + 15} ${ADI_CX - 5},${ADI_CY - ADI_R + 5} ${ADI_CX + 5},${ADI_CY - ADI_R + 5}`} fill="#fff" />
        </g>
        <circle cx={ADI_CX} cy={ADI_CY} r={ADI_R} fill={`url(#${uid}-shade)`} />
      </g>
      {/* fixed sky pointer */}
      <polygon points={`${ADI_CX},${ADI_CY - ADI_R - 1} ${ADI_CX - 6},${ADI_CY - ADI_R - 12} ${ADI_CX + 6},${ADI_CY - ADI_R - 12}`} fill={AMBER} stroke="#3a2a00" strokeWidth=".8" />
      {/* flight-director V-bars */}
      {fdShown && (
        <g clipPath={`url(#${uid}-ball)`}>
          <g style={{ transform: `rotate(${fd!.bank}deg) translateY(${-fd!.pitch * PX_DEG}px)`, transformOrigin: `${ADI_CX}px ${ADI_CY}px`, ...smooth(150) }}>
            <polygon points={`${ADI_CX},${ADI_CY + 4} ${ADI_CX - 64},${ADI_CY - 15} ${ADI_CX - 64},${ADI_CY - 7} ${ADI_CX},${ADI_CY + 12}`} fill={AMBER} stroke="#3a2a00" strokeWidth="1.3" />
            <polygon points={`${ADI_CX},${ADI_CY + 4} ${ADI_CX + 64},${ADI_CY - 15} ${ADI_CX + 64},${ADI_CY - 7} ${ADI_CX},${ADI_CY + 12}`} fill={AMBER} stroke="#3a2a00" strokeWidth="1.3" />
          </g>
        </g>
      )}
      {/* inclinometer (slip / skid ball in its tube) at the foot of the ball */}
      <g>
        <path d={`M${ADI_CX - 34} ${ADI_CY + ADI_R - 4}Q${ADI_CX} ${ADI_CY + ADI_R + 4} ${ADI_CX + 34} ${ADI_CY + ADI_R - 4}`} fill="none" stroke="#0a0c0f" strokeWidth="13" strokeLinecap="round" />
        <path d={`M${ADI_CX - 34} ${ADI_CY + ADI_R - 4}Q${ADI_CX} ${ADI_CY + ADI_R + 4} ${ADI_CX + 34} ${ADI_CY + ADI_R - 4}`} fill="none" stroke="#2a3036" strokeWidth="10" strokeLinecap="round" />
        <line x1={ADI_CX - 6} y1={ADI_CY + ADI_R - 8} x2={ADI_CX - 6} y2={ADI_CY + ADI_R + 4} stroke={WHITE} strokeWidth="1.2" />
        <line x1={ADI_CX + 6} y1={ADI_CY + ADI_R - 8} x2={ADI_CX + 6} y2={ADI_CY + ADI_R + 4} stroke={WHITE} strokeWidth="1.2" />
        {(() => {
          // the tube is a quadratic curve (ends 34 px either side, sagging 8 px at the middle): put the ball on it
          const sx = clamp(slip, -1, 1) * 26;
          const t = (sx + 34) / 68;
          const y0 = ADI_CY + ADI_R - 4;
          return <circle cx={ADI_CX + sx} cy={y0 + 16 * t * (1 - t)} r="4.6" fill="#e9e6d8" stroke="#555" strokeWidth=".6" style={{ transition: "cx 150ms linear, cy 150ms linear" }} />;
        })()}
      </g>
      {/* fixed aircraft symbol */}
      <g fill="none" strokeLinejoin="round">
        <path d={`M${ADI_CX - 66} ${ADI_CY}H${ADI_CX - 28}L${ADI_CX - 17} ${ADI_CY + 10}M${ADI_CX + 66} ${ADI_CY}H${ADI_CX + 28}L${ADI_CX + 17} ${ADI_CY + 10}`} stroke="#1a1200" strokeWidth="7" />
        <path d={`M${ADI_CX - 66} ${ADI_CY}H${ADI_CX - 28}L${ADI_CX - 17} ${ADI_CY + 10}M${ADI_CX + 66} ${ADI_CY}H${ADI_CX + 28}L${ADI_CX + 17} ${ADI_CY + 10}`} stroke={AMBER} strokeWidth="4" />
      </g>
      <circle cx={ADI_CX} cy={ADI_CY} r="4.5" fill={AMBER} stroke="#1a1200" strokeWidth="1.2" />

      {/* localizer scale (bottom) */}
      <g>
        {[-2, -1, 1, 2].map((i) => <circle key={i} cx={dot(i)} cy="236" r="3.4" fill="none" stroke={WHITE} strokeWidth="1.4" />)}
        <line x1={ADI_CX} y1="228" x2={ADI_CX} y2="244" stroke={WHITE} strokeWidth="1.4" />
        {locOn && <rect x={dot(clamp(nav.locDev / 1.25, -2.4, 2.4)) - 3.5} y="227" width="7" height="18" rx="1.2" fill="#ffd23a" stroke="#3a2a00" strokeWidth="1" style={{ transition: "x 150ms linear" }} />}
      </g>
      {/* glideslope scale (right) */}
      <g>
        {[-2, -1, 1, 2].map((i) => <circle key={i} cx="226" cy={ADI_CY + i * 26} r="3.4" fill="none" stroke={WHITE} strokeWidth="1.4" />)}
        <line x1="218" y1={ADI_CY} x2="234" y2={ADI_CY} stroke={WHITE} strokeWidth="1.4" />
        {gsOn && <rect x="217" y={ADI_CY + clamp(nav.gsErr / 0.35, -2.4, 2.4) * 26 - 3.5} width="18" height="7" rx="1.2" fill="#ffd23a" stroke="#3a2a00" strokeWidth="1" style={{ transition: "y 150ms linear" }} />}
      </g>
      {/* speed-command scale legend (no speed command computer fitted: the pointer is parked behind the SPD flag) */}
      <text x="12" y={ADI_CY - 24} fill="#fff" fontSize="15" fontWeight="bold" fontFamily={FONT}>F</text>
      <text x="12" y={ADI_CY + 40} fill="#fff" fontSize="15" fontWeight="bold" fontFamily={FONT}>S</text>

      {attBad && <Flag x={34} y={36} text="ATT" w={34} rot={-32} />}
      {(!powered || fail.fd || (!!fd?.flag)) && <Flag x={208} y={36} text="FD" w={26} rot={32} />}
      {gsFlag && <Flag x={228} y={ADI_CY - 52} text="GS" w={26} rot={90} />}
      {!powered || fail.spd ? <Flag x={14} y={ADI_CY + 8} text="SPD" w={30} rot={90} /> : null}
      {(!powered || fail.ht) && <Flag x={206} y={208} text="HT" w={24} rot={-40} />}
      {locFlag && <Flag x={ADI_CX} y={214} text="LOC" w={30} />}
    </svg>
  );
}

/* ═════════════════════════════ HSI ═════════════════════════════ */

const HSI_CX = 116, HSI_CY = 108, HSI_R = 80;

/** Horizontal situation indicator: compass card, heading bug, course arrow with TO/FROM and deviation bar (VOR or localizer), glideslope pointer, DME-independent NAV flag. */
function HsiRealImpl({ powered, fail, hdg = 0, tas = 0, gs = 0, crs = 0, bug = 0, nav, navOn = false, tuned = "ILS", label = "" }: { powered: boolean; fail: MipFail; hdg?: number; tas?: number; gs?: number; crs?: number; bug?: number; nav?: NavData; navOn?: boolean; tuned?: "VOR" | "ILS"; label?: string }) {
  const isVor = tuned === "VOR";
  const isIls = tuned === "ILS";
  const valid = !!nav && (isVor ? nav.vorValid : isIls ? nav.locValid : false) && !fail.loc;
  const v = nav ? vorDevOf(nav.radial, crs) : { dev: 0, to: false };
  const dev = isVor ? v.dev / 10 : (nav?.locDev ?? 0) / 2.5; // full scale (2 dots): VOR 10 deg, localizer 2.5 deg
  const hdgUp = norm360(hdg);
  const gsOn = powered && navOn && isIls && !!nav?.gsValid && !fail.gs;
  const card: ReactNode[] = [];
  for (let d = 0; d < 360; d += 5) {
    const long = d % 10 === 0;
    const [x1, y1] = pol(HSI_CX, HSI_CY, HSI_R - (long ? 9 : 5), d);
    const [x2, y2] = pol(HSI_CX, HSI_CY, HSI_R, d);
    card.push(<line key={`t${d}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={WHITE} strokeWidth={long ? 1.4 : 1} />);
  }
  const cardinal: Record<number, string> = { 0: "N", 90: "E", 180: "S", 270: "W" };
  for (let d = 0; d < 360; d += 30) {
    const [x, y] = pol(HSI_CX, HSI_CY, HSI_R - 20, d);
    card.push(<text key={`n${d}`} x={x} y={y} fill={WHITE} fontSize="13" fontWeight={cardinal[d] ? "bold" : "normal"} textAnchor="middle" dominantBaseline="central" fontFamily={FONT} transform={`rotate(${d} ${x} ${y})`}>{cardinal[d] ?? d / 10}</text>);
  }
  const win = (x: number, y: number, w: number, head: string, txt: string, color = "#7dff7d") => (
    <g>
      <rect x={x} y={y} width={w} height="22" rx="2" fill="#000" stroke="#555a60" />
      <text x={x + w / 2} y={y + 6.5} fill={WHITE} fontSize="6.5" fontWeight="bold" textAnchor="middle" dominantBaseline="central" fontFamily={MONO}>{head}</text>
      <text x={x + w / 2} y={y + 15.5} fill={color} fontSize="10" fontWeight="bold" textAnchor="middle" dominantBaseline="central" fontFamily={MONO}>{powered ? txt : ""}</text>
    </g>
  );
  return (
    <svg viewBox="0 0 232 202" className="size-full" role="img" aria-label="Horizontal situation indicator">
      <rect width="232" height="202" rx="8" fill="#0a0c0f" />
      <circle cx={HSI_CX} cy={HSI_CY} r={HSI_R + 6} fill="#0b0c0e" stroke="#3a4048" strokeWidth="1.5" />
      <g style={rot(-hdgUp, HSI_CX, HSI_CY)}>
        {card}
        {powered && (
          <>
            {/* heading bug */}
            <g transform={`rotate(${bug} ${HSI_CX} ${HSI_CY})`}><polygon points={`${HSI_CX - 8},${HSI_CY - HSI_R - 1} ${HSI_CX + 8},${HSI_CY - HSI_R - 1} ${HSI_CX + 5},${HSI_CY - HSI_R + 8} ${HSI_CX - 5},${HSI_CY - HSI_R + 8}`} fill="#ff9a1a" stroke="#3a2200" strokeWidth="1" /></g>
            {/* course arrow, deviation bar and TO/FROM */}
            <g transform={`rotate(${crs} ${HSI_CX} ${HSI_CY})`}>
              <polygon points={`${HSI_CX},${HSI_CY - 56} ${HSI_CX - 7},${HSI_CY - 42} ${HSI_CX + 7},${HSI_CY - 42}`} fill={WHITE} />
              <line x1={HSI_CX} y1={HSI_CY - 42} x2={HSI_CX} y2={HSI_CY - 28} stroke={WHITE} strokeWidth="3" />
              <line x1={HSI_CX} y1={HSI_CY + 28} x2={HSI_CX} y2={HSI_CY + 58} stroke={WHITE} strokeWidth="3" />
              {[-2, -1, 1, 2].map((i) => <circle key={i} cx={HSI_CX + i * 20} cy={HSI_CY} r="3.2" fill="none" stroke={WHITE} strokeWidth="1.3" />)}
              {navOn && valid && (
                <g style={{ transform: `translateX(${clamp(dev, -1.1, 1.1) * 40}px)`, transition: "transform 150ms linear" }}>
                  <line x1={HSI_CX} y1={HSI_CY - 28} x2={HSI_CX} y2={HSI_CY + 28} stroke="#ffcf3a" strokeWidth="4.5" />
                </g>
              )}
              {navOn && valid && isVor && <polygon points={v.to ? `${HSI_CX + 14},${HSI_CY - 20} ${HSI_CX + 22},${HSI_CY - 8} ${HSI_CX + 6},${HSI_CY - 8}` : `${HSI_CX + 14},${HSI_CY + 20} ${HSI_CX + 22},${HSI_CY + 8} ${HSI_CX + 6},${HSI_CY + 8}`} fill={WHITE} />}
            </g>
          </>
        )}
      </g>
      {/* fixed lubber line, 45-degree marks and aircraft symbol */}
      <polygon points={`${HSI_CX},${HSI_CY - HSI_R - 7} ${HSI_CX - 6},${HSI_CY - HSI_R - 18} ${HSI_CX + 6},${HSI_CY - HSI_R - 18}`} fill={AMBER} stroke="#3a2a00" strokeWidth=".8" />
      {[45, 90, 135, 180, 225, 270, 315].map((a) => { const [x1, y1] = pol(HSI_CX, HSI_CY, HSI_R + 8, a); const [x2, y2] = pol(HSI_CX, HSI_CY, HSI_R + 2, a); return <line key={a} x1={x1} y1={y1} x2={x2} y2={y2} stroke={WHITE} strokeWidth="1.5" />; })}
      <path d={`M${HSI_CX} ${HSI_CY - 20}V${HSI_CY + 24}M${HSI_CX - 16} ${HSI_CY + 2}H${HSI_CX + 16}M${HSI_CX - 7} ${HSI_CY + 22}H${HSI_CX + 7}`} stroke={WHITE} strokeWidth="3.6" strokeLinecap="round" fill="none" />
      {/* glideslope scale (left) */}
      {powered && navOn && isIls && (
        <g>
          {[-2, -1, 1, 2].map((i) => <circle key={i} cx="14" cy={HSI_CY + i * 20} r="3" fill="none" stroke={WHITE} strokeWidth="1.3" />)}
          <line x1="8" y1={HSI_CY} x2="20" y2={HSI_CY} stroke={WHITE} strokeWidth="1.3" />
          {gsOn && <polygon points={`6,${HSI_CY + clamp((nav?.gsErr ?? 0) / 0.35, -2.4, 2.4) * 20} 22,${HSI_CY + clamp((nav?.gsErr ?? 0) / 0.35, -2.4, 2.4) * 20 - 6} 22,${HSI_CY + clamp((nav?.gsErr ?? 0) / 0.35, -2.4, 2.4) * 20 + 6}`} fill="#ffcf3a" stroke="#3a2a00" strokeWidth=".8" />}
        </g>
      )}
      {win(6, 4, 64, "TAS", pad(clamp(tas, 0, 999), 3))}
      {win(162, 4, 64, "GND SPD", pad(clamp(gs, 0, 999), 3))}
      {win(6, 176, 52, "CRS", pad(norm360(crs) || 360, 3), "#f4f1e4")}
      {win(174, 176, 52, "HDG", pad(norm360(bug) || 360, 3), "#ff9a1a")}
      {(!powered || fail.hdg) && <Flag x={HSI_CX} y={30} text="HDG" w={32} size={9} />}
      {powered && navOn && !valid && <Flag x={HSI_CX} y={190} text={isVor ? "VOR" : "NAV"} w={30} size={9} />}
      {powered && navOn && label && <text x={HSI_CX} y={198} fill="#9aa4ad" fontSize="7" textAnchor="middle" fontFamily={MONO}>{label}</text>}
    </svg>
  );
}

/* ═════════════════════════════ RMI / DME ═════════════════════════════ */

const RMI_CX = 77, RMI_CY = 108, RMI_R = 64;

/** DME readout in NM: one decimal below 100 NM. */
function dmeText(nm: number) {
  const v = clamp(nm, 0, 199.9);
  return v < 100 ? v.toFixed(1).padStart(5, " ") : v.toFixed(0).padStart(5, " ");
}

/** DME window: the distance when the DME has lock, orange / white hatching when it has none (unpowered, failed, no station or out of range). */
function DmeWindow({ x, label, nm }: { x: number; label: string; nm: number | null }) {
  const ok = nm !== null;
  return (
    <g>
      <rect x={x} y="3" width="68" height="28" rx="2" fill="#000" stroke="#555a60" />
      {ok
        ? <text x={x + 34} y="15" fill="#e8f5e8" fontSize="14" textAnchor="middle" dominantBaseline="central" fontFamily={MONO} fontWeight="bold" xmlSpace="preserve">{dmeText(nm)}</text>
        : <><defs><pattern id={`dmeh-${label}`} width="8" height="8" patternTransform="rotate(45)" patternUnits="userSpaceOnUse"><rect width="4" height="8" fill="#ff7a1a" /><rect x="4" width="4" height="8" fill="#f4f1e4" /></pattern></defs><rect x={x + 2} y="5" width="64" height="12" fill={`url(#dmeh-${label})`} /></>}
      <text x={x + 34} y="25" fill={WHITE} fontSize="7" fontWeight="bold" textAnchor="middle" dominantBaseline="central" fontFamily={MONO}>{label}</text>
    </g>
  );
}

/** Pointer: single bar (1) or double bar (2). `rel` is degrees clockwise from the top of the dial. */
function Pointer({ rel, kind, live }: { rel: number; kind: 1 | 2; live: boolean }) {
  const col = live ? (kind === 1 ? "#ffd23a" : "#8cf08c") : "#7a8088";
  const top = RMI_CY - RMI_R + 7;
  return (
    <g style={rot(rel, RMI_CX, RMI_CY, 160)}>
      {kind === 1 ? (
        <>
          <line x1={RMI_CX} y1={top + 8} x2={RMI_CX} y2={RMI_CY + RMI_R - 12} stroke={col} strokeWidth="2.4" />
          <polygon points={`${RMI_CX},${top - 2} ${RMI_CX - 6},${top + 14} ${RMI_CX + 6},${top + 14}`} fill={col} />
          <line x1={RMI_CX - 7} y1={RMI_CY + RMI_R - 12} x2={RMI_CX + 7} y2={RMI_CY + RMI_R - 12} stroke={col} strokeWidth="2.4" />
        </>
      ) : (
        <>
          <line x1={RMI_CX - 2.4} y1={top + 10} x2={RMI_CX - 2.4} y2={RMI_CY + RMI_R - 12} stroke={col} strokeWidth="1.6" />
          <line x1={RMI_CX + 2.4} y1={top + 10} x2={RMI_CX + 2.4} y2={RMI_CY + RMI_R - 12} stroke={col} strokeWidth="1.6" />
          <polyline points={`${RMI_CX - 8},${top + 15} ${RMI_CX},${top - 1} ${RMI_CX + 8},${top + 15}`} fill="none" stroke={col} strokeWidth="1.8" />
          <line x1={RMI_CX - 7} y1={RMI_CY + RMI_R - 12} x2={RMI_CX + 7} y2={RMI_CY + RMI_R - 12} stroke={col} strokeWidth="1.8" />
        </>
      )}
    </g>
  );
}

/**
 * Radio magnetic indicator with DME-1 / DME-2 windows. Each bearing pointer shows a relative bearing (degrees clockwise from the nose; the compass card
 * already carries the heading) from its selected source (VOR or ADF, chosen on the pedestal / trainer); with no signal it parks at 3 o'clock.
 * `label1` / `label2` name the selected source under the dial ("ADF 1", "VOR 1"...).
 */
function RmiRealImpl({ powered, fail, hdg = 0, dme1Nm = null, dme2Nm = null, brg1 = null, brg2 = null, label1 = "", label2 = "" }: {
  powered: boolean; fail: MipFail; hdg?: number;
  dme1Nm?: number | null; dme2Nm?: number | null;
  brg1?: number | null; brg2?: number | null;
  label1?: string; label2?: string;
}) {
  const h = norm360(hdg);
  const ptr = (b: number | null): { live: boolean; rel: number } => (powered && !fail.adf && b !== null ? { live: true, rel: norm360(b) } : { live: false, rel: 90 });
  const p1 = ptr(brg1), p2 = ptr(brg2);
  const cardTicks: ReactNode[] = [];
  for (let d = 0; d < 360; d += 5) {
    const long = d % 10 === 0;
    const [x1, y1] = pol(RMI_CX, RMI_CY, RMI_R - (long ? 8 : 4), d);
    const [x2, y2] = pol(RMI_CX, RMI_CY, RMI_R, d);
    cardTicks.push(<line key={d} x1={x1} y1={y1} x2={x2} y2={y2} stroke={WHITE} strokeWidth={long ? 1.3 : 0.9} />);
  }
  const cardinal: Record<number, string> = { 0: "N", 90: "E", 180: "S", 270: "W" };
  for (let d = 0; d < 360; d += 30) {
    const [x, y] = pol(RMI_CX, RMI_CY, RMI_R - 17, d);
    cardTicks.push(<text key={`n${d}`} x={x} y={y} fill={WHITE} fontSize="11" fontWeight={cardinal[d] ? "bold" : "normal"} textAnchor="middle" dominantBaseline="central" fontFamily={FONT} transform={`rotate(${d} ${x} ${y})`}>{cardinal[d] ?? d / 10}</text>);
  }
  const src = (x: number, i: 0 | 1, p: { live: boolean }, label: string) => (
    <g>
      <rect x={x} y="150" width="40" height="22" rx="3" fill="#15181c" stroke="#666d74" />
      <text x={x + 20} y="157" fill="#9aa4ad" fontSize="6" textAnchor="middle" dominantBaseline="central" fontFamily={MONO}>{i === 0 ? "POINTER 1" : "POINTER 2"}</text>
      <text x={x + 20} y="166" fill={p.live ? (i === 0 ? "#ffd23a" : "#8cf08c") : "#ff9a5a"} fontSize="9" fontWeight="bold" textAnchor="middle" dominantBaseline="central" fontFamily={MONO}>{label || `PTR ${i + 1}`}</text>
    </g>
  );
  return (
    <svg viewBox="0 0 154 176" className="size-full" role="img" aria-label="Radio magnetic indicator with DME">
      <rect width="154" height="176" rx="8" fill="#0a0c0f" />
      <DmeWindow x={5} label="DME-1" nm={powered && !fail.dme1 ? dme1Nm : null} />
      <DmeWindow x={81} label="DME-2" nm={powered && !fail.dme2 ? dme2Nm : null} />
      <circle cx={RMI_CX} cy={RMI_CY} r={RMI_R + 5} fill="#0b0c0e" stroke="#3a4048" strokeWidth="1.5" />
      <g style={rot(-h, RMI_CX, RMI_CY)}>{cardTicks}</g>
      <Pointer rel={p2.rel} kind={2} live={p2.live} />
      <Pointer rel={p1.rel} kind={1} live={p1.live} />
      <circle cx={RMI_CX} cy={RMI_CY} r="5" fill="#23282d" stroke="#555d64" />
      <polygon points={`${RMI_CX},${RMI_CY - RMI_R - 6} ${RMI_CX - 5},${RMI_CY - RMI_R - 15} ${RMI_CX + 5},${RMI_CY - RMI_R - 15}`} fill={AMBER} stroke="#3a2a00" strokeWidth=".7" />
      {(!powered || fail.hdg) && <Flag x={RMI_CX} y={RMI_CY - 28} text="HDG" w={30} size={9} />}
      {src(2, 0, p1, label1)}
      {src(112, 1, p2, label2)}
    </svg>
  );
}

/* ═════════════════════════════ ASI ═════════════════════════════ */

const ASI_PTS: [number, number][] = [[0, -8], [60, 0], [80, 25], [100, 55], [120, 85], [140, 115], [160, 145], [180, 172], [200, 198], [250, 236], [300, 270], [350, 302], [400, 332]];
export function asiAng(kt: number) {
  const v = clamp(kt, 0, 400);
  for (let i = 1; i < ASI_PTS.length; i++) {
    const [k1, a1] = ASI_PTS[i]; const [k0, a0] = ASI_PTS[i - 1];
    if (v <= k1) return a0 + ((v - k0) / (k1 - k0)) * (a1 - a0);
  }
  return 332;
}

/** 737-200 airspeed indicator: non-linear 60-400 kt scale, Mach window, VMO / MMO barber pole, speed bug. Airspeed, Mach and the pole all come from this side's CADC. */
function AsiRealImpl({ data, powered, bugKt = 120 }: { data: SideAirData; powered: boolean; bugKt?: number }) {
  const ias = data.iasKt;
  const cadcOk = powered && data.adc.valid;
  const mach = data.mach;
  const limit = vmoMmoLimitKt(data.staticPressureHpa);
  const vmoA = asiAng(limit);
  const ticks: number[] = [];
  for (let k = 60; k <= 200; k += 10) ticks.push(k);
  for (let k = 250; k <= 400; k += 50) ticks.push(k);
  const lab = [60, 80, 100, 120, 140, 160, 180, 200, 250, 300, 350, 400];
  const polc = (r: number, a: number) => pol(100, 100, r, a);
  return (
    <div className="relative aspect-square overflow-hidden rounded-full border border-[#5b656c] bg-[#05070a] shadow-[inset_0_0_0_4px_#1b2026,0_4px_12px_rgba(0,0,0,.5)]">
      <svg viewBox="0 0 200 200" className="size-full" role="img" aria-label="Airspeed indicator">
        <circle cx="100" cy="100" r="96" fill="#0b0c0e" />
        {ticks.map((k) => { const a = asiAng(k); const [x1, y1] = polc(k % 20 === 0 || k > 200 ? 78 : 84, a); const [x2, y2] = polc(94, a); return <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#f2f2f2" strokeWidth={k % 20 === 0 || k > 200 ? 2 : 1} />; })}
        {lab.map((k) => { const [x, y] = polc(67, asiAng(k)); return <text key={k} x={x} y={y} fill="#f2f2f2" fontSize="12" textAnchor="middle" dominantBaseline="central" fontFamily={FONT}>{k}</text>; })}
        <text x="85" y="74" fill="#4aa8e8" fontSize="8" textAnchor="end" dominantBaseline="central" fontFamily={MONO}>MACH</text>
        <text x="100" y="152" fill="#4aa8e8" fontSize="8" textAnchor="middle" dominantBaseline="central" fontFamily={MONO}>KNOTS</text>
        {/* Mach window: blank below M 0.40, MACH flag when the CADC cannot supply it */}
        <rect x="88" y="60" width="38" height="22" rx="2" fill="#050607" stroke="#6d747a" />
        {cadcOk
          ? mach >= 0.4 && <text x="107" y="71" fill="#f2f2f2" fontSize="11" textAnchor="middle" dominantBaseline="central" fontFamily={MONO}>{mach.toFixed(2).slice(1)}</text>
          : <><rect x="64" y="62" width="50" height="16" rx="2" fill="#ff7a1a" stroke="#ffb066" /><text x="89" y="70" fill="#7a1500" fontSize="10" fontWeight="bold" textAnchor="middle" dominantBaseline="central" fontFamily={MONO}>MACH</text></>}
        {!powered && <><rect x="132" y="94" width="38" height="16" rx="2" fill="#ff7a1a" stroke="#ffb066" /><text x="154" y="102" fill="#7a1500" fontSize="8" fontWeight="bold" textAnchor="middle" dominantBaseline="central" fontFamily={MONO}>IN OP</text></>}
        {/* speed bug setting */}
        <rect x="76" y="118" width="52" height="22" rx="2" fill="#050607" stroke="#6d747a" />
        <text x="118" y="129" fill="#7dff7d" fontSize="13" textAnchor="end" dominantBaseline="central" fontFamily={MONO}>{powered ? pad(clamp(bugKt, 60, 400), 3) : ""}</text>
        <rect x="58" y="122" width="34" height="14" rx="2" fill={powered ? "#2a2218" : "#ff7a1a"} stroke="#ffb066" strokeWidth=".8" /><text x="75" y="129" fill={powered ? "#9a8a6a" : "#7a1500"} fontSize="8" fontWeight="bold" textAnchor="middle" dominantBaseline="central" fontFamily={MONO}>A/S</text>
        {/* VMO / MMO barber pole: sweeps down above the MMO crossover altitude */}
        {cadcOk && (
          <g style={rot(vmoA, 100, 100, 400)}>
            <line x1="100" y1="100" x2="100" y2="14" stroke="#fff" strokeWidth="5" />
            <line x1="100" y1="100" x2="100" y2="14" stroke="#d6332a" strokeWidth="5" strokeDasharray="6 6" />
          </g>
        )}
        {!cadcOk && (() => { const [vx, vy] = polc(60, asiAng(340) - 6); return <g><rect x={vx - 15} y={vy - 6} width="30" height="12" rx="2" fill="#ff7a1a" stroke="#ffb066" strokeWidth=".6" /><text x={vx} y={vy} fill="#7a1500" fontSize="8" fontWeight="bold" textAnchor="middle" dominantBaseline="central" fontFamily={MONO}>VMO</text></g>; })()}
        {/* speed bug and IAS pointer */}
        {powered && (() => { const a = asiAng(bugKt); const [bx, by] = polc(94, a); return <polygon points={`${bx},${by} ${bx + 9},${by - 5} ${bx + 9},${by + 5}`} fill="#ff9a1a" transform={`rotate(${a - 90} ${bx} ${by})`} />; })()}
        <g style={rot(asiAng(ias), 100, 100)}>
          <polygon points="100,16 96,100 104,100" fill="#f4f1e4" />
          <polygon points="100,16 98,40 102,40" fill="#9dff3a" />
        </g>
        <circle cx="100" cy="100" r="7" fill="#23282d" stroke="#555d64" />
      </svg>
    </div>
  );
}

/* ═════════════════════════════ ALTIMETER ═════════════════════════════ */

/** Three-pointer altimeter with the OFF flag, 5-digit counter and MB / IN HG baro windows. The baro windows show the setting that is applied to the CADC altitude. */
function AltRealImpl({ data, powered, mb, hg, small = false }: { data: Pick<SideAirData, "altFt">; powered: boolean; mb: number; hg: number; small?: boolean }) {
  const alt = Math.max(-1000, data.altFt);
  const wrap = (x: number, m: number) => ((x % m) + m) % m;
  const digits = pad(Math.max(0, alt), 5);
  const arr = (a: number, r: number): [number, number] => pol(100, 100, r, a);
  return (
    <div className="relative aspect-square overflow-hidden rounded-full border border-[#5b656c] bg-[#05070a] shadow-[inset_0_0_0_4px_#1b2026,0_4px_12px_rgba(0,0,0,.5)]">
      <svg viewBox="0 0 200 200" className="size-full" role="img" aria-label="Altimeter">
        <circle cx="100" cy="100" r="96" fill="#0b0c0e" />
        {Array.from({ length: 50 }, (_, i) => i).map((i) => { const [x1, y1] = arr(i * 7.2, i % 5 ? 88 : 80); const [x2, y2] = arr(i * 7.2, 94); return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#f2f2f2" strokeWidth={i % 5 ? 1 : 2} />; })}
        {Array.from({ length: 10 }, (_, i) => i).map((i) => { const [x, y] = arr(i * 36, 68); return <text key={i} x={x} y={y} fill="#f2f2f2" fontSize="17" textAnchor="middle" dominantBaseline="central" fontFamily={FONT}>{i}</text>; })}
        <text x="100" y="42" fill="#4aa8e8" fontSize="8" textAnchor="middle" fontFamily={MONO}>100 FEET</text>
        <text x="100" y="140" fill="#f2f2f2" fontSize="11" textAnchor="middle" fontFamily={MONO}>ALT</text>
        <rect x="34" y="82" width="132" height="32" rx="2" fill="#000" stroke="#8a9096" />
        {digits.split("").map((c, i) => <text key={i} x={92 + i * 17} y="99" fill="#f2f2f2" fontSize="22" textAnchor="middle" dominantBaseline="central" fontFamily={MONO}>{powered ? c : i > 1 ? c : ""}</text>)}
        {!powered && <><rect x="38" y="85" width="48" height="26" rx="2" fill="#ff7a1a" stroke="#ffb066" /><text x="62" y="98" fill="#7a1500" fontSize="16" fontWeight="bold" textAnchor="middle" dominantBaseline="central" fontFamily={MONO}>OFF</text></>}
        {powered && data.altFt < 0 && <><rect x="38" y="85" width="48" height="26" rx="2" fill="#f4f1e4" stroke="#8a9096" /><text x="62" y="98" fill="#111" fontSize="14" fontWeight="bold" textAnchor="middle" dominantBaseline="central" fontFamily={MONO}>NEG</text></>}
        {!small && <><text x="100" y="128" fill="#9a968a" fontSize="7" textAnchor="middle" fontFamily={MONO}>IN HG</text><rect x="72" y="131" width="56" height="16" rx="2" fill="#000" stroke="#6d747a" /><text x="100" y="139" fill="#f2f2f2" fontSize="12" textAnchor="middle" dominantBaseline="central" fontFamily={MONO}>{hg.toFixed(2).replace(".", "")}</text></>}
        <text x="50" y="148" fill="#9a968a" fontSize="7" textAnchor="middle" fontFamily={MONO}>MB</text>
        <rect x="26" y="150" width="46" height="14" rx="2" fill="#000" stroke="#6d747a" /><text x="49" y="157" fill="#f2f2f2" fontSize="10" textAnchor="middle" dominantBaseline="central" fontFamily={MONO}>{Math.round(mb)}</text>
        <polygon points="100,6 94,-2 106,-2" fill="#ffc21a" />
        <g style={rot((wrap(alt, 10000) / 10000) * 360, 100, 100)}><polygon points="100,50 96,100 104,100" fill="#f4f1e4" /></g>
        <g style={rot((wrap(alt, 1000) / 1000) * 360, 100, 100)}><polygon points="100,12 95,100 105,100 100,112" fill="#f4f1e4" /></g>
        <circle cx="100" cy="100" r="6" fill="#23282d" stroke="#555d64" />
      </svg>
    </div>
  );
}

/* Pure instrument faces: skip re-render when their props are unchanged. */
export const AdiReal = memo(AdiRealImpl, propsEqual);
export const HsiReal = memo(HsiRealImpl, propsEqual);
export const RmiReal = memo(RmiRealImpl, propsEqual);
export const AsiReal = memo(AsiRealImpl, propsEqual);
export const AltReal = memo(AltRealImpl, propsEqual);
