import { useShallow } from "zustand/react/shallow";
import { computeAirData, type SideAirData } from "@/lib/sim/pitotStatic";
import { useSim, useDerivedPick } from "@/lib/sim/store";
import { useMip } from "@/lib/sim/mipLocal";
import { cn } from "@/lib/utils";

// 737-200 style steam-gauge six-pack: dark faces, white markings, yellow/white pointers.
const FACE = "#0b0c0e";
const TEXT = "#f2f2f2";
const MUTED = "#9aa4ad";
const AMBER = "#ffd23a";
const RED = "#ff4d4d";
const MONO = "monospace";

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

/** Point at radius r, angle a (degrees, 0 = 12 o'clock, clockwise). */
function pt(r: number, a: number): [number, number] {
  const t = (a * Math.PI) / 180;
  return [100 + r * Math.sin(t), 100 - r * Math.cos(t)];
}

function Tick({ a, r1, r2, w = 1, color = TEXT }: { a: number; r1: number; r2: number; w?: number; color?: string }) {
  const [x1, y1] = pt(r1, a);
  const [x2, y2] = pt(r2, a);
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={w} />;
}

function Label({ r, a, size = 12, children, rotate = false }: { r: number; a: number; size?: number; children: React.ReactNode; rotate?: boolean }) {
  const [x, y] = pt(r, a);
  return (
    <text x={x} y={y} fontSize={size} fill={TEXT} textAnchor="middle" dominantBaseline="central" fontFamily="Helvetica, Arial, sans-serif" transform={rotate ? `rotate(${a} ${x} ${y})` : undefined}>
      {children}
    </text>
  );
}

function Arc({ r, a1, a2, color, w = 5 }: { r: number; a1: number; a2: number; color: string; w?: number }) {
  const [x1, y1] = pt(r, a1);
  const [x2, y2] = pt(r, a2);
  return <path d={`M${x1} ${y1} A${r} ${r} 0 ${a2 - a1 > 180 ? 1 : 0} 1 ${x2} ${y2}`} fill="none" stroke={color} strokeWidth={w} />;
}

/** Tapered pointer that rotates smoothly about the dial centre. */
function Pointer({ deg, len, w = 3, color = TEXT, tail = 14 }: { deg: number; len: number; w?: number; color?: string; tail?: number }) {
  return (
    <g style={{ transform: `rotate(${deg}deg)`, transformOrigin: "100px 100px", transition: "transform 120ms linear" }}>
      <polygon points={`100,${100 - len} ${100 - w},100 ${100 - w * 0.6},${100 + tail} ${100 + w * 0.6},${100 + tail} ${100 + w},100`} fill={color} />
    </g>
  );
}

function Gauge({ title, children, fault = false, className }: { title: string; children: React.ReactNode; fault?: boolean; className?: string }) {
  return (
    <div className={cn("relative aspect-square overflow-hidden rounded-full border border-[#5b6168] bg-[#0b0c0e] shadow-[inset_0_0_0_4px_#15181c,0_4px_12px_rgba(0,0,0,.5)]", className)}>
      <span className="sr-only">{title}</span>
      {children}
      {fault && <div className="absolute bottom-[14%] left-1/2 z-20 -translate-x-1/2 rounded border border-red-500/60 bg-red-950/80 px-1.5 py-0.5 font-mono text-[7px] text-red-300">FLAG</div>}
    </div>
  );
}

function Face() {
  return <circle cx="100" cy="100" r="96" fill={FACE} />;
}

function Hub() {
  return <circle cx="100" cy="100" r="6" fill="#23282d" stroke="#555d64" />;
}

// ── Airspeed: 0–400 kt over ±150°, red Vmo band ─────────────────────────────
export function Airspeed({ data }: { data: SideAirData }) {
  const v = clamp(data.iasKt, 0, 400);
  const A = (k: number) => -150 + (k / 400) * 300;
  return (
    <Gauge title="AIRSPEED" fault={!data.pitotOk}>
      <svg viewBox="0 0 200 200" className="h-full w-full">
        <Face />
        {Array.from({ length: 41 }, (_, i) => i * 10).map((k) => (
          <Tick key={k} a={A(k)} r1={k % 50 ? 88 : 80} r2={94} w={k % 50 ? 1 : 2} />
        ))}
        <Arc r={91} a1={A(340)} a2={A(400)} color={RED} w={4} />
        {Array.from({ length: 9 }, (_, i) => i * 50).map((k) => (
          <Label key={k} r={66} a={A(k)} size={13}>{k}</Label>
        ))}
        <text x="100" y="62" fill={MUTED} fontSize="8" textAnchor="middle" fontFamily={MONO}>KNOTS</text>
        <rect x="76" y="128" width="48" height="18" rx="2" fill="#000" stroke="#4a525a" />
        <text x="100" y="138" fill={TEXT} fontSize="13" textAnchor="middle" dominantBaseline="central" fontFamily={MONO}>{Math.round(data.iasKt).toString().padStart(3, "0")}</text>
        <Pointer deg={A(v)} len={84} color={AMBER} />
        <Hub />
      </svg>
    </Gauge>
  );
}

// ── Attitude: sky/ground ball, roll scale, fixed aircraft symbol (737-200 ADI style) ────────────
export function Attitude({ roll, pitch }: { roll: number; pitch: number }) {
  const marks = [-30, -20, -10, 10, 20, 30];
  return (
    <Gauge title="ATTITUDE">
      <svg viewBox="0 0 200 200" className="h-full w-full">
        <defs>
          <clipPath id="attClip">
            <circle cx="100" cy="100" r="92" />
          </clipPath>
        </defs>
        {/* Outer bezel ring */}
        <circle cx="100" cy="100" r="96" fill="#5b656c" />
        <g clipPath="url(#attClip)">
          {/* Sky / ground sphere — pitch positive = nose up = ground moves down */}
          <g
            style={{
              transform: `rotate(${-roll}deg) translateY(${pitch * 3}px)`,
              transformOrigin: "100px 100px",
              transition: "transform 100ms linear",
            }}
          >
            <rect x="-200" y="-400" width="600" height="500" fill="#2a9fd0" />
            <rect x="-200" y="100" width="600" height="500" fill="#14171a" />
            {/* Horizon line */}
            <line x1="-200" y1="100" x2="400" y2="100" stroke="#fff" strokeWidth="2.5" />
            {/* Pitch ladder */}
            {marks.map((p) => {
              const y = 100 - p * 3;
              const w = Math.abs(p) === 10 ? 18 : Math.abs(p) === 20 ? 24 : 30;
              return (
                <g key={p}>
                  <line x1={100 - w} y1={y} x2={100 + w} y2={y} stroke="#fff" strokeWidth="1.5" />
                  {Math.abs(p) % 20 === 0 && (
                    <text x={100 + w + 7} y={y} fontSize="9" fill="#fff" dominantBaseline="central" fontFamily={MONO}>
                      {Math.abs(p)}
                    </text>
                  )}
                </g>
              );
            })}
            {/* Small 5° ticks */}
            {[-25, -15, -5, 5, 15, 25].map((p) => {
              const y = 100 - p * 3;
              return <line key={p} x1={92} y1={y} x2={108} y2={y} stroke="#fff" strokeWidth="1" />;
            })}
          </g>
        </g>
        {/* Roll scale (moves with bank) */}
        <g style={{ transform: `rotate(${-roll}deg)`, transformOrigin: "100px 100px", transition: "transform 100ms linear" }}>
          {[-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60].map((a) => (
            <Tick key={a} a={a} r1={a === 0 ? 78 : 82} r2={92} w={a === 0 || a % 30 === 0 ? 2.2 : 1.2} />
          ))}
          {/* Bank index triangle on the sphere */}
          <polygon points="100,88 94,78 106,78" fill="#fff" />
        </g>
        {/* Fixed lubber / bank index at top */}
        <polygon points="100,16 94,7 106,7" fill={AMBER} />
        {/* Fixed aircraft symbol (wings + center) — classic ADI chevron style */}
        <path d="M42 100h36l8 9M158 100h-36l-8 9" stroke={AMBER} strokeWidth="4.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="100" cy="100" r="4.5" fill={AMBER} stroke="#3a2a00" strokeWidth="0.8" />
      </svg>
    </Gauge>
  );
}

// ── Altimeter: 0–9 dial (1000 ft per rev), 10k hand, drum window ────────────
export function Altimeter({ data }: { data: SideAirData }) {
  const alt = Math.max(-1000, data.altFt);
  const wrap = (x: number, m: number) => ((x % m) + m) % m;
  const hundreds = (wrap(alt, 1000) / 1000) * 360;
  const tenK = (wrap(alt, 10000) / 10000) * 360;
  return (
    <Gauge title="ALTIMETER" fault={!data.staticOk}>
      <svg viewBox="0 0 200 200" className="h-full w-full">
        <Face />
        {Array.from({ length: 50 }, (_, i) => i).map((i) => <Tick key={i} a={i * 7.2} r1={i % 5 ? 88 : 80} r2={94} w={i % 5 ? 1 : 2} />)}
        {Array.from({ length: 10 }, (_, i) => i).map((i) => <Label key={i} r={66} a={i * 36} size={15}>{i}</Label>)}
        <text x="100" y="52" fill={MUTED} fontSize="8" textAnchor="middle" fontFamily={MONO}>ALT</text>
        <rect x="112" y="84" width="50" height="16" fill="#000" stroke="#999" />
        <text x="137" y="92" fill={TEXT} fontSize="11" textAnchor="middle" dominantBaseline="central" fontFamily={MONO}>{Math.round(alt).toLocaleString()}</text>
        <text x="100" y="150" fill={MUTED} fontSize="7" textAnchor="middle" fontFamily={MONO}>FT · BARO</text>
        <Pointer deg={tenK} len={50} w={4.5} />
        <Pointer deg={hundreds} len={84} w={3} />
        <Hub />
      </svg>
    </Gauge>
  );
}

// ── Vertical speed: 0 at 9 o'clock, climb up/right, descent down/left ───────
export function VerticalSpeed({ data }: { data: SideAirData }) {
  const vs = clamp(data.vsiFpm, -6000, 6000);
  const A = (f: number) => -90 + Math.sign(f) * Math.sqrt(Math.abs(f) / 6000) * 88;
  const marks = [0, 500, 1000, 1500, 2000, 4000, 6000];
  return (
    <Gauge title="VERTICAL SPEED" fault={!data.staticOk}>
      <svg viewBox="0 0 200 200" className="h-full w-full">
        <Face />
        {marks.flatMap((f) => (f === 0 ? [1] : [1, -1]).map((g) => {
          const a = A(f * g);
          const big = f === 0 || f >= 1000;
          return (
            <g key={`${f}:${g}`}>
              <Tick a={a} r1={big ? 78 : 84} r2={94} w={2} />
              {big && <Label r={66} a={a} size={11}>{f / 1000}</Label>}
            </g>
          );
        }))}
        <text x="100" y="58" fill={TEXT} fontSize="8" textAnchor="middle" fontFamily={MONO}>UP</text>
        <text x="100" y="146" fill={TEXT} fontSize="8" textAnchor="middle" fontFamily={MONO}>DOWN</text>
        <text x="100" y="160" fill={MUTED} fontSize="7" textAnchor="middle" fontFamily={MONO}>1000 FT/MIN</text>
        <text x="140" y="112" fill={TEXT} fontSize="10" textAnchor="middle" fontFamily={MONO}>{Math.round(vs) > 0 ? "+" : ""}{Math.round(vs)}</text>
        <Pointer deg={A(vs)} len={84} />
        <Hub />
      </svg>
    </Gauge>
  );
}

// ── Heading: rotating card under a fixed lubber line ────────────────────────
export function Heading({ heading }: { heading: number }) {
  const hdg = ((heading % 360) + 360) % 360;
  const cardinal: Record<number, string> = { 0: "N", 90: "E", 180: "S", 270: "W" };
  return (
    <Gauge title="HEADING">
      <svg viewBox="0 0 200 200" className="h-full w-full">
        <Face />
        <g style={{ transform: `rotate(${-hdg}deg)`, transformOrigin: "100px 100px", transition: "transform 120ms linear" }}>
          {Array.from({ length: 72 }, (_, i) => i * 5).map((d) => <Tick key={d} a={d} r1={d % 10 ? 86 : 80} r2={92} w={d % 10 ? 1 : 1.5} />)}
          {Array.from({ length: 12 }, (_, i) => i * 30).map((d) => (
            <Label key={d} r={67} a={d} size={13} rotate>{cardinal[d] ?? d / 10}</Label>
          ))}
        </g>
        <polygon points="100,18 95,6 105,6" fill={AMBER} />
        <path d="M100 74v56M80 104h40M92 126h16" stroke={TEXT} strokeWidth="4" fill="none" />
        <rect x="78" y="136" width="44" height="16" rx="2" fill="#000" stroke="#4a525a" />
        <text x="100" y="144" fill={TEXT} fontSize="11" textAnchor="middle" dominantBaseline="central" fontFamily={MONO}>{Math.round(hdg).toString().padStart(3, "0")}°</text>
      </svg>
    </Gauge>
  );
}

// ── Turn & slip: rate needle (standard-rate marks) and inclinometer ball ────
export function TurnSlip({ yawRate }: { yawRate: number }) {
  // Responds to turn rate, not bank angle. Standard rate (3°/s) = 20° of needle.
  const turn = clamp(yawRate, -12, 12);
  const needle = clamp(turn * (20 / 3), -40, 40);
  const ball = clamp(turn * 2.2, -28, 28);
  return (
    <Gauge title="TURN / SLIP">
      <svg viewBox="0 0 200 200" className="h-full w-full">
        <Face />
        {[-20, -10, 0, 10, 20].map((a) => <Tick key={a} a={a * 3} r1={62} r2={80} w={a ? 2 : 3} />)}
        <Label r={70} a={-90} size={10}>L</Label>
        <Label r={70} a={90} size={10}>R</Label>
        <text x="100" y="52" fill={TEXT} fontSize="9" textAnchor="middle" fontFamily={MONO}>2 MIN</text>
        <g style={{ transform: `rotate(${needle}deg)`, transformOrigin: "100px 100px", transition: "transform 120ms linear" }}>
          <path d="M100 100l-2-50h4z" fill={AMBER} />
          <path d="M62 100h76" stroke={AMBER} strokeWidth="4" />
          <circle cx="100" cy="100" r="6" fill={AMBER} />
        </g>
        <rect x="55" y="132" width="90" height="18" rx="9" fill="#050709" stroke="#777" />
        <line x1="94" y1="132" x2="94" y2="150" stroke="#aaa" />
        <line x1="106" y1="132" x2="106" y2="150" stroke="#aaa" />
        <circle cx={100 + ball} cy="141" r="7" fill="#e8e8e8" style={{ transition: "cx 120ms linear" }} />
      </svg>
    </Gauge>
  );
}

function SixPackSet({ title, data, side, roll, pitch, heading, yawRate }: { title: string; data: SideAirData; side: "CAPT" | "F/O"; roll: number; pitch: number; heading: number; yawRate: number }) {
  const status = data.flags.length ? data.flags.join(" · ") : "NORMAL AIR DATA";
  return (
    <section className="rounded-xl border border-[#454c55] bg-[#1a1e23] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,.05),0_8px_22px_rgba(0,0,0,.25)]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <div className="font-display text-[10px] uppercase tracking-[.18em] text-subtle">{side} flight instruments</div>
          <div className="font-display text-lg font-semibold text-fg">{title}</div>
        </div>
        <div className={cn("rounded border px-2 py-1 font-mono text-[8px] uppercase", data.flags.length ? "border-amber-500/50 bg-amber-950/20 text-amber-300" : "border-emerald-500/40 bg-emerald-950/20 text-emerald-300")}>
          {status}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Airspeed data={data} />
        <Attitude roll={roll} pitch={pitch} />
        <Altimeter data={data} />
        <TurnSlip yawRate={yawRate} />
        <Heading heading={heading} />
        <VerticalSpeed data={data} />
      </div>
    </section>
  );
}

export function SixPack({ sideBySide = false, foFirst = false, hideNote = false }: { sideBySide?: boolean; foFirst?: boolean; hideNote?: boolean } = {}) {
  const s = useSim();
  const d = useDerivedPick("acPower", "dcPower");
  const air = computeAirData(s, d.dcPower, d.acPower);
  /* one attitude for every instrument: when the main instrument panel model is running (autopilot / nav / flight director) the six-pack
     shows that same attitude, heading and turn rate; otherwise it falls back to the yoke-driven ATA 27 trainer model */
  const mip = useMip(useShallow((st) => ({ att: st.att, attLive: st.attLive })));
  const live = mip.attLive;
  const tas = Math.max(100, Number(s.psFlightCasKt ?? 0));
  const rollSrc = live ? mip.att.roll : Number(s.attitudeRollDeg ?? 0);
  const roll = clamp(rollSrc, -60, 60);
  const pitch = clamp(live ? mip.att.pitch : Number(s.attitudePitchDeg ?? 0), -30, 30);
  const heading = (((live ? mip.att.hdg : Number(s.attitudeHeadingDeg ?? 0)) % 360) + 360) % 360;
  const yawRate = clamp(live ? (!s.wow ? (1091 * Math.tan((roll * Math.PI) / 180)) / tas : 0) : Number(s.attitudeYawRate ?? 0), -12, 12);
  const captAirDataPowered = air.capt.adc.data.powered;
  const foAirDataPowered = air.fo.adc.data.powered;

  return (
    <div className="space-y-3">
      <div className={cn("rounded-lg border border-border bg-inset px-3 py-2 font-mono text-[9px] uppercase tracking-[.08em] text-subtle", hideNote && "hidden")}>
        Pitot/static → primary flight instruments: CAPT and F/O airspeed, altimeter and vertical-speed indications use the live ATA 34 air-data model. The modeled architecture provides four combined pitot/static probes, independent CAPT/F/O normal or alternate static sources, auxiliary pitot/static systems, and probe anti-ice/fault status. Attitude, turn/slip and heading respond to the live flight-attitude model.
      </div>
      <div className={cn("grid gap-3", sideBySide ? "grid-cols-2" : "xl:grid-cols-2")}>
        {foFirst ? (<>
        <SixPackSet title="First officer six-pack" data={foAirDataPowered ? air.fo : { ...air.fo, iasKt: 0, altFt: 0, vsiFpm: 0 }} side="F/O" roll={roll} pitch={pitch} heading={heading} yawRate={yawRate} />
        <SixPackSet title="Captain six-pack" data={captAirDataPowered ? air.capt : { ...air.capt, iasKt: 0, altFt: 0, vsiFpm: 0 }} side="CAPT" roll={roll} pitch={pitch} heading={heading} yawRate={yawRate} />
        </>) : (<>
        <SixPackSet title="Captain six-pack" data={captAirDataPowered ? air.capt : { ...air.capt, iasKt: 0, altFt: 0, vsiFpm: 0 }} side="CAPT" roll={roll} pitch={pitch} heading={heading} yawRate={yawRate} />
        <SixPackSet title="First officer six-pack" data={foAirDataPowered ? air.fo : { ...air.fo, iasKt: 0, altFt: 0, vsiFpm: 0 }} side="F/O" roll={roll} pitch={pitch} heading={heading} yawRate={yawRate} />
        </>)}
      </div>
    </div>
  );
}
