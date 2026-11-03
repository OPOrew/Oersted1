import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSimPick, useDerivedPick } from "@/lib/sim/store";
import { cn } from "@/lib/utils";

type ElTone = "source" | "ac" | "dc" | "standby" | "breaker" | "alt";
type ElIconName = "plug" | "turbine" | "gen" | "breaker" | "busbar" | "relay" | "tr" | "xfmr" | "battery" | "inverter" | "bolt" | "acload" | "dcload" | "standby";

/** Small line-art symbols so each component reads at a glance. */
function ElIcon({ name, className }: { name: ElIconName; className?: string }) {
  const body: Record<ElIconName, ReactNode> = {
    plug: <><path d="M9 3v5M15 3v5" /><path d="M7 8h10v3a5 5 0 0 1-10 0Z" /><path d="M12 16v5" /></>,
    turbine: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="2" /><path d="M12 3.5v6.5M12 14v6.5M3.5 12H10M14 12h6.5M6 6l4.5 4.5M13.5 13.5 18 18M18 6l-4.5 4.5M10.5 13.5 6 18" /></>,
    gen: <><circle cx="12" cy="12" r="8" /><path d="M7 12c1.5-4.5 3-4.5 5 0s3.5 4.5 5 0" /></>,
    breaker: <><path d="M3 15h6M15 15h6" /><circle cx="9" cy="15" r="1.3" /><circle cx="15" cy="15" r="1.3" /><path d="M9 15 14 8" /></>,
    busbar: <><rect x="3" y="10" width="18" height="4" rx="1" /><path d="M7 10V5M12 10V5M17 10V5M7 14v5M17 14v5" /></>,
    relay: <><rect x="3" y="7" width="7" height="10" rx="1" /><path d="M5.5 10h2M5.5 12h2M5.5 14h2M10 12h3M13 12l6-4M19 12h2" /></>,
    tr: <><rect x="3" y="6" width="18" height="12" rx="1.5" /><path d="M6 12c1-3 2-3 3 0s2 3 3 0" /><path d="M15 10.5h4M15 13.5h4" /></>,
    xfmr: <><circle cx="9" cy="12" r="4.5" /><circle cx="15" cy="12" r="4.5" /></>,
    battery: <><rect x="3" y="7" width="15" height="10" rx="1.5" /><path d="M18 10.5h3v3h-3M7 10v4M11 9v6" /></>,
    inverter: <><rect x="3" y="6" width="18" height="12" rx="1.5" /><path d="M6 10.5h4M6 13.5h4" /><path d="M13 12c1-3 2-3 3 0s2 3 3 0" /></>,
    bolt: <><path d="M13 3 6 13.5h5L10 21l7-10.5h-5Z" /></>,
    acload: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3Z" /></>,
    dcload: <><rect x="6" y="6" width="12" height="12" rx="1.5" /><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" /></>,
    standby: <><path d="M12 3v8" /><path d="M7 6.2a7.5 7.5 0 1 0 10 0" /></>,
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {body[name]}
    </svg>
  );
}

function Node({
  id,
  icon,
  title,
  subtitle,
  active,
  tone = "ac",
  compact = false,
  className,
}: {
  id?: string;
  icon?: ElIconName;
  title: string;
  subtitle?: string;
  active: boolean;
  tone?: ElTone;
  compact?: boolean;
  className?: string;
}) {
  const styles = {
    source: active ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-100" : "border-border bg-inset text-subtle",
    ac: active ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-100" : "border-border bg-inset text-subtle",
    dc: active ? "border-sky-400/60 bg-sky-400/10 text-sky-100" : "border-border bg-inset text-subtle",
    standby: active ? "border-amber-400/60 bg-amber-400/10 text-amber-100" : "border-border bg-inset text-subtle",
    breaker: active ? "border-violet-400/60 bg-violet-400/10 text-violet-100" : "border-border bg-inset text-subtle",
    alt: active ? "border-orange-400/60 bg-orange-400/10 text-orange-100" : "border-border bg-inset text-subtle",
  }[tone];
  return (
    <div data-el={id} className={cn("rounded-lg border text-center shadow-inner", compact ? "px-1.5 py-1.5" : "px-2 py-2.5", styles, className)}>
      {icon && <ElIcon name={icon} className={cn("mx-auto mb-0.5 block", compact ? "h-4 w-4" : "h-5 w-5")} />}
      <div className={cn("font-display font-semibold uppercase", compact ? "text-[7px] tracking-[0.06em]" : "text-[9px] tracking-[0.12em]")}>{title}</div>
      {subtitle && <div className={cn("uppercase tracking-wide opacity-80", compact ? "mt-0.5 text-[6px]" : "mt-1 text-[7px]")}>{subtitle}</div>}
      <div className={cn("font-mono uppercase", compact ? "mt-0.5 text-[6px]" : "mt-1 text-[7px]")}>{active ? "ENERGIZED" : "OFF"}</div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Wiring layer: every node carries data-el="<id>". After layout we measure
   the nodes and draw orthogonal wires (arrowheads + animated flow when live).
   ───────────────────────────────────────────────────────────── */
type ElRect = { l: number; r: number; t: number; b: number; cx: number; cy: number };
type ElGeo = Record<string, ElRect>;
type ElPt = [number, number];
type ElWire = { tone: ElTone; active: boolean; pts: ElPt[]; arrow: boolean; arrowStart: boolean; dots: ElPt[]; diode: boolean };

const EL_WIRE_TEXT: Record<ElTone, string> = {
  source: "text-cyan-300",
  ac: "text-emerald-300",
  dc: "text-sky-300",
  standby: "text-amber-300",
  breaker: "text-violet-300",
  alt: "text-orange-300",
};

function elArrowHead(a: ElPt, b: ElPt, size = 4.5): string | null {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 0.01) return null;
  const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
  const bx = b[0] - ux * size, by = b[1] - uy * size;
  const nx = -uy * size * 0.65, ny = ux * size * 0.65;
  return `${b[0]},${b[1]} ${bx + nx},${by + ny} ${bx - nx},${by - ny}`;
}

function elEnds(pts: ElPt[]) {
  let i = pts.length - 1;
  while (i > 0 && Math.abs(pts[i][0] - pts[i - 1][0]) < 0.01 && Math.abs(pts[i][1] - pts[i - 1][1]) < 0.01) i--;
  let j = 0;
  while (j < pts.length - 1 && Math.abs(pts[j][0] - pts[j + 1][0]) < 0.01 && Math.abs(pts[j][1] - pts[j + 1][1]) < 0.01) j++;
  return { end: i > 0 ? elArrowHead(pts[i - 1], pts[i]) : null, start: j < pts.length - 1 ? elArrowHead(pts[j + 1], pts[j]) : null };
}

function ElWireLayer({ wires, w, h }: { wires: ElWire[]; w: number; h: number }) {
  return (
    <svg className="pointer-events-none absolute left-0 top-0 z-[5] overflow-visible" width={w} height={h} aria-hidden="true">
      <style>{`
        @keyframes elWireFlow { to { stroke-dashoffset: -10; } }
        .el-wire-flow { animation: elWireFlow 0.9s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .el-wire-flow { animation: none; } }
      `}</style>
      {wires.map((wire, i) => {
        const d = wire.pts.map(([x, y], n) => `${n ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
        const ends = elEnds(wire.pts);
        const a = wire.pts[0], b = wire.pts[wire.pts.length - 1];
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
        return (
          <g key={i} className={wire.active ? EL_WIRE_TEXT[wire.tone] : "text-subtle"} style={{ opacity: wire.active ? 1 : 0.45 }}>
            <path d={d} fill="none" stroke="currentColor" strokeOpacity={wire.active ? 0.35 : 0.8} strokeWidth={1.25} strokeLinejoin="round" strokeLinecap="round" />
            {wire.active && <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeDasharray="4 6" className="el-wire-flow" />}
            {wire.arrow && ends.end && <polygon points={ends.end} fill="currentColor" />}
            {wire.arrowStart && ends.start && <polygon points={ends.start} fill="currentColor" />}
            {wire.diode && (
              <g>
                <rect x={mx - 4.5} y={my - 4.5} width={9} height={9} fill="#0d1013" stroke="none" />
                <polygon points={`${mx + ux * 3.5},${my + uy * 3.5} ${mx - ux * 3.5 - uy * 3.2},${my - uy * 3.5 + ux * 3.2} ${mx - ux * 3.5 + uy * 3.2},${my - uy * 3.5 - ux * 3.2}`} fill="currentColor" />
                <line x1={mx + ux * 3.5 - uy * 3.4} y1={my + uy * 3.5 + ux * 3.4} x2={mx + ux * 3.5 + uy * 3.4} y2={my + uy * 3.5 - ux * 3.4} stroke="currentColor" strokeWidth={1.4} />
              </g>
            )}
            {wire.dots.map(([x, y], n) => <circle key={n} cx={x} cy={y} r={1.9} fill="currentColor" />)}
          </g>
        );
      })}
    </svg>
  );
}

function ControlButton({
  label,
  active,
  disabled,
  onClick,
  tone = "normal",
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  tone?: "normal" | "source" | "standby";
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-md border px-2 py-2 text-[8px] font-display uppercase tracking-wide transition",
        "hover:bg-panel disabled:cursor-not-allowed disabled:opacity-40",
        active ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-200" : "border-border bg-inset text-fg",
        tone === "source" && active && "border-cyan-400/60 bg-cyan-400/10 text-cyan-200",
        tone === "standby" && active && "border-amber-400/60 bg-amber-400/10 text-amber-200",
      )}
    >
      {label}
    </button>
  );
}

export function ElectricalPowerTrainer() {
  const s = useSimPick("apuLeftControl", "apuMaster", "apuRightControl", "battery", "busTie", "externalPowerConnected", "faults", "gen1", "gen2", "groundPowerOn", "groundServiceOn", "patch", "standbyPower");
  const d = useDerivedPick("ac28vPowered", "acPower", "apuAvailable", "apuGenOffBus", "apuGenOnBus", "batteryChargerPowered", "dcBus1Powered", "dcBus2Powered", "dcPower", "electricalSource1", "electricalSource2", "eng1Running", "eng2Running", "externalDcControl", "externalPowerNotInUse", "gen1OffBus", "gen2OffBus", "generator1BusPowered", "generator1ProtectionTripped", "generator2BusPowered", "generator2ProtectionTripped", "groundPowerAvailable", "groundServiceBusPowered", "hydBPump1On", "hydBPump2On", "standbyAcPowered", "standbyAcSource", "standbyDcPowered", "standbyDcSource", "staticInverterPowered", "tr1Powered", "tr2Powered", "tr3Powered", "transferBus1Powered", "transferBus2Powered", "transferRelay1Alt", "transferRelay2Alt");
  const [mode, setMode] = useState<"GPU" | "APU" | "ENG" | "BAT">("GPU");

  const sources = useMemo(() => ({
    gpu: d.electricalSource1 === "GPU" || d.electricalSource2 === "GPU",
    apuLeft: d.electricalSource1 === "APU GEN",
    apuRight: d.electricalSource2 === "APU GEN",
    gen1: d.generator1BusPowered,
    gen2: d.generator2BusPowered,
    xfer1: d.electricalSource1 === "GEN 2 XFER",
    xfer2: d.electricalSource2 === "GEN 1 XFER",
  }), [d.electricalSource1, d.electricalSource2, d.generator1BusPowered, d.generator2BusPowered]);

  // BTB closes only for the external/APU tie path onto a side that is not
  // already held by its own engine generator (matches derive tieSource / BTB).
  const btb1Closed = (sources.gpu || sources.apuLeft) && !sources.gen1 && !s.faults?.btb1Failure;
  const btb2Closed = (sources.gpu || sources.apuRight) && !sources.gen2 && !s.faults?.btb2Failure;
  const apuAny = sources.apuLeft || sources.apuRight;

  const sourceSummary = d.generator1ProtectionTripped || d.generator2ProtectionTripped
    ? "GENERATOR PROTECTION TRIP ACTIVE"
    : sources.gpu
      ? "EXTERNAL AC SOURCE ON BUS"
      : apuAny
        ? "APU GENERATOR ON BUS"
        : sources.gen1 || sources.gen2
          ? "ENGINE GENERATOR POWER"
          : sources.xfer1 || sources.xfer2
            ? "TRANSFER RELAY ALTERNATE FEED"
            : s.battery
              ? "BATTERY / STANDBY SOURCE"
              : "NO MAIN AC SOURCE";

  const modes = {
    GPU: {
      title: "GROUND POWER CART",
      path: "GPU → EPC → TIE BUS → BTB 1 / BTB 2 → LOAD BUSES",
      steps: [
        "Connect the 3-phase external power cable to the aircraft external-power receptacle.",
        "Confirm external power is connected and GRD POWER AVAILABLE is indicated.",
        "Place BAT switch ON for the required control and indication circuits.",
        "Select GROUND SERVICE ON only when service outlets / lights are required without energizing the whole aircraft.",
        "Select GRD PWR ON; this sends a trip signal to the APU and engine generator breakers, clearing any running generator off the tie bus, then the external power contactor and BTBs close and pick up the load buses from the ground source.",
      ],
    },
    APU: {
      title: "APU GENERATOR",
      path: "BATTERY → APU START → APU GB → TIE BUS → BTB 1 / 2",
      steps: [
        "Place BAT switch ON so the APU starting circuit has battery power.",
        "Start the APU and wait until the generator is available.",
        "Select LEFT and/or RIGHT APU GEN as required.",
        "The APU generator connects to the tie bus; the selected BTB supplies its associated load bus when that bus is not already supplied by an engine generator.",
        "If an engine generator is selected and valid, it takes its associated generator/load bus and the APU source is not paralleled onto that bus.",
      ],
    },
    ENG: {
      title: "ENGINE GENERATORS",
      path: "ENGINE → CSD → GEN → GB → GEN BUS → TRANSFER BUS",
      steps: [
        "Start the engine using the pneumatic starter system; the starter motor itself is not an AC electrical load.",
        "When generator voltage and frequency are correct, select the applicable GEN switch ON.",
        "With both generators operating, each generator supplies its own generator bus and transfer bus; both BTBs remain tripped.",
        "With one generator unavailable and BUS TRANSFER in AUTO, the failed side's transfer bus is picked up through the opposite transfer relay.",
        "The engine-generator sources are not operated in parallel.",
      ],
    },
    BAT: {
      title: "BATTERY / STANDBY",
      path: "BATTERY → BATTERY BUS / ESSENTIAL DC + STATIC INVERTER → STANDBY AC",
      steps: [
        "Place BAT switch ON to energize battery-supported circuits.",
        "In AUTO, normal standby AC follows Transfer Bus 1 and normal standby DC follows DC Bus 1.",
        "If normal standby input is lost and battery power is available, the standby system transfers to the battery bus and static inverter.",
        "In BAT position, the battery/static-inverter branch is selected for the standby system.",
        "Return STANDBY POWER to AUTO when normal electrical power is restored.",
      ],
    },
  } as const;

  // ── measurement of node positions ───────────────────────────────────────
  const rootRef = useRef<HTMLDivElement>(null);
  const lastKey = useRef("");
  const [geo, setGeo] = useState<ElGeo>({});
  const [size, setSize] = useState({ w: 0, h: 0 });

  const measure = useCallback(() => {
    if (typeof window === "undefined") return;
    const root = rootRef.current;
    if (!root) return;
    const rr = root.getBoundingClientRect();
    const next: ElGeo = {};
    root.querySelectorAll<HTMLElement>("[data-el]").forEach((el) => {
      const r = el.getBoundingClientRect();
      const l = r.left - rr.left;
      const t = r.top - rr.top;
      next[el.dataset.el as string] = { l, r: l + r.width, t, b: t + r.height, cx: l + r.width / 2, cy: t + r.height / 2 };
    });
    const key = `${Math.round(rr.width)}x${Math.round(rr.height)}|` + Object.entries(next).map(([k, v]) => `${k}:${Math.round(v.l)},${Math.round(v.t)},${Math.round(v.r)},${Math.round(v.b)}`).join(";");
    if (key !== lastKey.current) {
      lastKey.current = key;
      setGeo(next);
      setSize({ w: rr.width, h: rr.height });
    }
  }, []);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    measure();
  }, [measure, d.acPower, d.dcPower, d.transferBus1Powered, d.transferBus2Powered, sources.gpu, sources.gen1, sources.gen2, apuAny]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const root = rootRef.current;
    if (!root) return;
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(root);
    window.addEventListener("resize", measure);
    (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready.then(measure);
    return () => { ro?.disconnect(); window.removeEventListener("resize", measure); };
  }, [measure]);

  // ── wire construction ───────────────────────────────────────────────────
  const wires: ElWire[] = [];
  const N = (id: string): ElRect | undefined => geo[id];
  const add = (tone: ElTone, active: boolean, pts: ElPt[] | null | undefined, o: { arrow?: boolean; arrowStart?: boolean; dots?: ElPt[]; diode?: boolean } = {}) => {
    if (pts && pts.length > 1) wires.push({ tone, active, pts, arrow: o.arrow ?? true, arrowStart: o.arrowStart ?? false, dots: o.dots ?? [], diode: o.diode ?? false });
  };
  /** straight drop from the bottom of a to the top of b, at the x where the two overlap */
  const drop = (a?: ElRect, b?: ElRect): ElPt[] | null => {
    if (!a || !b) return null;
    const x = a.r - a.l <= b.r - b.l ? a.cx : b.cx;
    return [[x, a.b], [x, b.t]];
  };
  /** straight horizontal wire between neighbouring nodes on the same row */
  const side = (a?: ElRect, b?: ElRect, y?: number): ElPt[] | null => {
    if (!a || !b) return null;
    const rtl = b.cx < a.cx;
    const yy = y ?? a.cy;
    return [[rtl ? a.l : a.r, yy], [rtl ? b.r : b.l, yy]];
  };

  const g1 = !!d.generator1BusPowered;
  const g2 = !!d.generator2BusPowered;
  const alt1 = !!d.transferRelay1Alt;
  const alt2 = !!d.transferRelay2Alt;

  // Sources → breakers → buses
  add("source", sources.gpu, drop(N("e-gpu"), N("e-epc")));
  add("source", apuAny, drop(N("e-apu"), N("e-apgb")));
  add("source", g1, drop(N("e-g1"), N("e-b1")));
  add("source", g2, drop(N("e-g2"), N("e-b2")));
  add("source", sources.gpu, drop(N("e-epc"), N("e-tie")));
  add("source", apuAny, drop(N("e-apgb"), N("e-tie")));
  add("ac", g1, drop(N("e-b1"), N("e-gb1")));
  add("ac", g2, drop(N("e-b2"), N("e-gb2")));

  // Tie bus → BTBs → main buses
  add("breaker", btb1Closed, drop(N("e-tie"), N("e-btb1")));
  add("breaker", btb2Closed, drop(N("e-tie"), N("e-btb2")));
  add("ac", btb1Closed, drop(N("e-btb1"), N("e-main1")));
  add("ac", btb2Closed, drop(N("e-btb2"), N("e-main2")));

  // Gen buses → transfer relays → transfer buses → AC users (R3 ⇄ R4 cross-feed in orange)
  add("ac", g1, drop(N("e-gb1"), N("e-r3")));
  add("ac", g2, drop(N("e-gb2"), N("e-r4")));
  add(alt1 ? "alt" : "ac", g1 || alt1, drop(N("e-r3"), N("e-x1")));
  add(alt2 ? "alt" : "ac", g2 || alt2, drop(N("e-r4"), N("e-x2")));
  add("alt", alt1 || alt2, side(N("e-r3"), N("e-r4")), { arrowStart: true });
  add("ac", !!d.transferBus1Powered, drop(N("e-x1"), N("e-acu")));
  add("ac", !!d.transferBus2Powered, drop(N("e-x2"), N("e-acu")));

  // Gen buses → TRs → DC buses
  {
    const grid = N("e-grid"), gb1 = N("e-gb1"), gb2 = N("e-gb2"), acu = N("e-acu"), tr1 = N("e-tr1"), tr2 = N("e-tr2"), tr3 = N("e-tr3");
    if (grid && gb1 && gb2 && acu && tr1 && tr2 && tr3) {
      const busY = (acu.b + tr1.t) / 2;
      const gapX = gb1.l - 8;
      const railX = grid.r + 6;
      add("ac", g1, [[gb1.l, gb1.cy], [gapX, gb1.cy], [gapX, busY], [tr1.cx, busY], [tr1.cx, tr1.t]]);
      add("ac", g2, [[gb2.r, gb2.cy], [railX, gb2.cy], [railX, busY], [tr3.cx, busY], [tr3.cx, tr3.t]], { dots: [[tr2.cx, busY]] });
      add("ac", g2, [[tr2.cx, busY], [tr2.cx, tr2.t]]);
    }
  }
  add("dc", !!d.tr1Powered, drop(N("e-tr1"), N("e-dc1")));
  add("dc", !!d.tr2Powered, drop(N("e-tr2"), N("e-dc2")));
  add("dc", !!d.tr3Powered, drop(N("e-tr3"), N("e-dct")));
  add("alt", !!d.tr3Powered, side(N("e-dct"), N("e-dc1")), { arrow: false, diode: true });
  add("alt", !!d.tr3Powered, side(N("e-dct"), N("e-dc2")), { arrow: false, diode: true });
  {
    const dc1 = N("e-dc1"), dc2 = N("e-dc2"), du = N("e-dcu");
    if (dc1 && dc2 && du) {
      const busY = (dc1.b + du.t) / 2;
      add("dc", !!d.dcBus1Powered, [[dc1.cx, dc1.b], [dc1.cx, busY], [du.cx, busY], [du.cx, du.t]]);
      add("dc", !!d.dcBus2Powered, [[dc2.cx, dc2.b], [dc2.cx, busY], [du.cx, busY]], { arrow: false, dots: [[du.cx, busY]] });
    }
  }

  // 28-VAC, ground service, battery charging (vertical chains)
  const chain = (k: string, tone: ElTone, live: boolean) => {
    add(tone, live, drop(N(`${k}-a`), N(`${k}-m`)));
    add(tone, live, drop(N(`${k}-m`), N(`${k}-b`)));
  };
  chain("c28", "ac", !!d.ac28vPowered);
  chain("csv", "ac", !!d.groundServiceBusPowered);
  chain("cch", "ac", !!d.batteryChargerPowered);

  // Standby logic: source → relay → standby bus, then both buses → essential / standby users
  {
    const rows: Array<[string, ElTone, boolean, string]> = [
      ["sb1", "ac", s.standbyPower === "AUTO" && d.standbyAcSource === "TRANSFER BUS 1", "sb-ac"],
      ["sb2", "alt", !!d.staticInverterPowered, "sb-ac"],
      ["sb3", "dc", s.standbyPower === "AUTO" && d.standbyDcSource === "DC BUS 1", "sb-dc"],
      ["sb4", "alt", d.standbyDcSource === "BATTERY BUS", "sb-dc"],
    ];
    rows.forEach(([k, tone, live, bus]) => {
      const l = N(`${k}-l`), m = N(`${k}-m`), bb = N(bus);
      add(tone, live, side(l, m));
      if (m && bb) add(tone, live, [[m.r, m.cy], [bb.l, m.cy]]);
    });
    const grid = N("sb-grid"), ac = N("sb-ac"), dc = N("sb-dc"), ess = N("sb-ess");
    if (grid && ac && dc && ess) {
      const busY = ess.t - 10;
      const railX = grid.r + 5;
      add("standby", !!d.standbyAcPowered, [[ac.r, ac.cy], [railX, ac.cy], [railX, dc.cy]], { arrow: false, dots: [[railX, dc.cy]] });
      add("standby", !!d.standbyDcPowered || !!d.standbyAcPowered, [[dc.r, dc.cy], [railX, dc.cy], [railX, busY], [ess.cx, busY], [ess.cx, ess.t]]);
    }
  }

  return (
    <div ref={rootRef} className="relative space-y-3">
      <div className="rounded-lg border border-[#5a5139] bg-[#181813] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-display text-[8px] uppercase tracking-[0.18em] text-subtle">ATA 24 · Training panel</div>
            <div className="font-display text-sm font-semibold uppercase tracking-wide">Electrical power application</div>
          </div>
          <div className={cn("rounded border px-2 py-1 font-mono text-[7px] uppercase", d.acPower ? "border-emerald-400/50 text-emerald-200" : s.battery ? "border-amber-400/50 text-amber-200" : "border-border text-subtle")}>
            {sourceSummary}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-[#0d1013] p-3">
        <div className="mb-3 font-display text-[9px] uppercase tracking-[0.16em] text-subtle">Live electrical flow</div>

        <div data-el="e-grid" className="grid grid-cols-4 gap-x-4 gap-y-8">
          {/* 1 · sources */}
          <Node id="e-gpu" icon="plug" title="GROUND POWER" subtitle={s.externalPowerConnected ? (s.groundPowerOn ? (sources.gpu ? "ON BUS" : d.externalPowerNotInUse ? "NOT IN USE" : "EPC PATH") : "CONNECTED / NOT ON BUS") : "CABLE DISCONNECTED"} active={sources.gpu} tone="source" className="col-start-1" />
          <Node id="e-apu" icon="turbine" title="APU GENERATOR" subtitle={!d.apuAvailable ? "APU NOT RUNNING" : d.apuGenOnBus ? `ON BUS · L ${sources.apuLeft ? "ON" : "OFF"} / R ${sources.apuRight ? "ON" : "OFF"}` : d.apuGenOffBus ? "OFF BUS" : "AVAILABLE"} active={apuAny} tone="source" className="col-start-2" />
          <Node id="e-g1" icon="gen" title="GENERATOR 1" subtitle={d.generator1ProtectionTripped ? "PROTECTION TRIP" : d.gen1OffBus ? "OFF BUS" : d.generator1BusPowered ? "ON BUS" : d.eng1Running ? "ENGINE RUNNING" : "ENGINE STOPPED"} active={d.generator1BusPowered} tone="source" className="col-start-3" />
          <Node id="e-g2" icon="gen" title="GENERATOR 2" subtitle={d.generator2ProtectionTripped ? "PROTECTION TRIP" : d.gen2OffBus ? "OFF BUS" : d.generator2BusPowered ? "ON BUS" : d.eng2Running ? "ENGINE RUNNING" : "ENGINE STOPPED"} active={d.generator2BusPowered} tone="source" className="col-start-4" />

          {/* 2 · breakers */}
          <Node id="e-epc" icon="breaker" title="EXTERNAL POWER CONTACTOR" subtitle={sources.gpu ? "CLOSED" : "OPEN"} active={sources.gpu} tone="breaker" className="col-start-1" />
          <Node id="e-apgb" icon="breaker" title="APU GEN BREAKER" subtitle={apuAny ? "CONNECTED TO TIE BUS" : "OPEN"} active={apuAny} tone="breaker" className="col-start-2" />
          <Node id="e-b1" icon="breaker" title="GEN 1 BREAKER" subtitle={d.generator1BusPowered ? "CLOSED" : d.generator1ProtectionTripped ? "TRIPPED · PROTECTION" : d.gen1OffBus ? "OPEN · OFF BUS" : "OPEN"} active={d.generator1BusPowered} tone="breaker" className="col-start-3" />
          <Node id="e-b2" icon="breaker" title="GEN 2 BREAKER" subtitle={d.generator2BusPowered ? "CLOSED" : d.generator2ProtectionTripped ? "TRIPPED · PROTECTION" : d.gen2OffBus ? "OPEN · OFF BUS" : "OPEN"} active={d.generator2BusPowered} tone="breaker" className="col-start-4" />

          {/* 3 · tie bus + generator buses */}
          <Node id="e-tie" icon="busbar" title="TIE BUS" subtitle="EXTERNAL / APU SOURCE" active={sources.gpu || apuAny} tone="source" className="col-span-2 col-start-1" />
          <Node id="e-gb1" icon="busbar" title="GEN BUS 1" subtitle={d.generator1BusPowered ? "115V AC GENERATOR BUS" : "NO GEN 1 SOURCE"} active={d.generator1BusPowered} className="col-start-3" />
          <Node id="e-gb2" icon="busbar" title="GEN BUS 2" subtitle={d.generator2BusPowered ? "115V AC GENERATOR BUS" : "NO GEN 2 SOURCE"} active={d.generator2BusPowered} className="col-start-4" />

          {/* 4 · BTBs and transfer relays */}
          <Node id="e-btb1" icon="breaker" title="BTB 1" subtitle="BUS TIE BREAKER" active={btb1Closed} tone="breaker" className="col-start-1" />
          <Node id="e-btb2" icon="breaker" title="BTB 2" subtitle="BUS TIE BREAKER" active={btb2Closed} tone="breaker" className="col-start-2" />
          <Node id="e-r3" icon="relay" title={d.transferRelay1Alt ? "R3 · ALTERNATE" : "R3 · NORMAL"} subtitle="TRANSFER RELAY" active={d.generator1BusPowered || d.transferRelay1Alt} tone={d.transferRelay1Alt ? "alt" : "breaker"} className="col-start-3" />
          <Node id="e-r4" icon="relay" title={d.transferRelay2Alt ? "R4 · ALTERNATE" : "R4 · NORMAL"} subtitle="TRANSFER RELAY" active={d.generator2BusPowered || d.transferRelay2Alt} tone={d.transferRelay2Alt ? "alt" : "breaker"} className="col-start-4" />

          {/* 5 · main buses and transfer buses */}
          <Node id="e-main1" icon="busbar" title="MAIN BUS 1" active={btb1Closed} className="col-start-1" />
          <Node id="e-main2" icon="busbar" title="MAIN BUS 2" active={btb2Closed} className="col-start-2" />
          <Node id="e-x1" icon="busbar" title="TRANSFER BUS 1" subtitle={d.electricalSource1} active={d.transferBus1Powered} className="col-start-3" />
          <Node id="e-x2" icon="busbar" title="TRANSFER BUS 2" subtitle={d.electricalSource2} active={d.transferBus2Powered} className="col-start-4" />

          {/* 6 · AC users — includes System B electric hyd pumps (115V AC from transfer buses) */}
          <Node id="e-acu" icon="acload" title="AC USERS" subtitle={`115V AC · B HYD ELEC 1 ${d.hydBPump1On ? "ON" : "OFF"} · ELEC 2 ${d.hydBPump2On ? "ON" : "OFF"}`} active={d.acPower} className="col-span-2 col-start-3" />

          {/* 7 · transformer-rectifiers */}
          <Node id="e-tr1" icon="tr" title="TR 1" subtitle="GEN BUS 1 → DC BUS 1" active={d.tr1Powered} tone="dc" className="col-start-1" />
          <Node id="e-tr3" icon="tr" title="TR 3" subtitle="GEN BUS 2 · BACKUP" active={d.tr3Powered} tone="dc" className="col-start-3" />
          <Node id="e-tr2" icon="tr" title="TR 2" subtitle="GEN BUS 2 → DC BUS 2" active={d.tr2Powered} tone="dc" className="col-start-4" />

          {/* 8 · DC buses */}
          <Node id="e-dc1" icon="busbar" title="DC BUS 1" subtitle="28V DC" active={d.dcBus1Powered} tone="dc" className="col-start-1" />
          <Node id="e-dct" icon="busbar" title="DC TIE BUS" subtitle="TR3 OUTPUT · BACKS UP DC BUS 1 & 2" active={d.tr3Powered} tone="dc" className="col-span-2 col-start-2" />
          <Node id="e-dc2" icon="busbar" title="DC BUS 2" subtitle="28V DC" active={d.dcBus2Powered} tone="dc" className="col-start-4" />

          {/* 9 · DC users */}
          <Node id="e-dcu" icon="dcload" title="DC USERS" subtitle="28V DC CONTROL / INDICATION" active={d.dcPower} tone="dc" className="col-span-2 col-start-2" />
        </div>

        {/* 28-VAC · ground service · battery charging */}
        <div className="mt-4 grid grid-cols-3 gap-x-3">
          <div className="flex flex-col gap-4 rounded-lg border border-border bg-[#111419] p-2">
            <div className="text-center font-display text-[8px] uppercase tracking-[0.14em] text-subtle">28-VAC distribution</div>
            <Node compact id="c28-a" icon="gen" title="115-V AC SYSTEM" active={d.ac28vPowered} />
            <Node compact id="c28-m" icon="xfmr" title="28-VAC XFMR" active={d.ac28vPowered} tone="breaker" />
            <Node compact id="c28-b" icon="acload" title="28-VAC LOADS" active={d.ac28vPowered} />
          </div>
          <div className="flex flex-col gap-4 rounded-lg border border-border bg-[#111419] p-2">
            <div className="text-center font-display text-[8px] uppercase tracking-[0.14em] text-subtle">Ground service</div>
            <Node compact id="csv-a" icon="plug" title="AC SOURCE" active={d.groundServiceBusPowered} tone="source" />
            <Node compact id="csv-m" icon="breaker" title="GROUND SERVICE" active={d.groundServiceBusPowered} tone="breaker" />
            <Node compact id="csv-b" icon="busbar" title="SERVICE BUS" active={d.groundServiceBusPowered} />
          </div>
          <div className="flex flex-col gap-4 rounded-lg border border-border bg-[#111419] p-2">
            <div className="text-center font-display text-[8px] uppercase tracking-[0.14em] text-subtle">Battery charging</div>
            <Node compact id="cch-a" icon={d.groundServiceBusPowered ? "busbar" : "gen"} title={d.groundServiceBusPowered ? "GROUND SERVICE BUS" : "AIRCRAFT AC SOURCE"} active={d.batteryChargerPowered} />
            <Node compact id="cch-m" icon="bolt" title="BATTERY CHARGER" active={d.batteryChargerPowered} tone="breaker" />
            <Node compact id="cch-b" icon="battery" title="BATTERY" active={d.batteryChargerPowered} tone="standby" />
          </div>
        </div>

        {/* Standby power logic */}
        <div className="mt-4 rounded-lg border border-border bg-[#111419] p-2">
          <div className="mb-2 text-center font-display text-[8px] uppercase tracking-[0.14em] text-subtle">Standby power logic</div>
          <div data-el="sb-grid" className="grid grid-cols-3 gap-x-4 gap-y-2">
            <Node compact id="sb1-l" icon="busbar" title="TRANSFER BUS 1" active={s.standbyPower === "AUTO" && d.standbyAcSource === "TRANSFER BUS 1"} />
            <Node compact id="sb1-m" icon="relay" title="NORMAL" active={s.standbyPower === "AUTO" && d.standbyAcSource === "TRANSFER BUS 1"} tone="breaker" />
            <Node compact id="sb-ac" icon="busbar" title="STANDBY AC BUS" subtitle={d.standbyAcSource} active={d.standbyAcPowered} tone="standby" className="row-span-2 flex flex-col justify-center" />
            <Node compact id="sb2-l" icon="battery" title="BATTERY BUS" active={d.staticInverterPowered} tone="alt" />
            <Node compact id="sb2-m" icon="inverter" title="STATIC INVERTER" active={d.staticInverterPowered} tone="alt" />
            <Node compact id="sb3-l" icon="busbar" title="DC BUS 1" active={s.standbyPower === "AUTO" && d.standbyDcSource === "DC BUS 1"} tone="dc" />
            <Node compact id="sb3-m" icon="relay" title="NORMAL" active={s.standbyPower === "AUTO" && d.standbyDcSource === "DC BUS 1"} tone="breaker" />
            <Node compact id="sb-dc" icon="busbar" title="STANDBY DC BUS" subtitle={d.standbyDcSource} active={d.standbyDcPowered} tone="standby" className="row-span-2 flex flex-col justify-center" />
            <Node compact id="sb4-l" icon="battery" title="BATTERY BUS" active={d.standbyDcSource === "BATTERY BUS"} tone="alt" />
            <Node compact id="sb4-m" icon="relay" title="TRANSFER" active={d.standbyDcSource === "BATTERY BUS"} tone="alt" />
          </div>
          <div className="mx-auto mt-6 w-2/3">
            <Node compact id="sb-ess" icon="standby" title="ESSENTIAL / STANDBY" subtitle={d.standbyAcPowered || d.standbyDcPowered ? "STANDBY SOURCE AVAILABLE" : "NO STANDBY POWER"} active={d.standbyAcPowered || d.standbyDcPowered} tone="standby" />
          </div>
        </div>

        {/* Controls */}
          <div className="mt-4 rounded-lg border border-[#5a5139] bg-[#181813] p-2">
            <div className="mb-2 font-display text-[8px] uppercase tracking-[0.14em] text-subtle">Controls — P5 forward overhead arrangement (AMM 24-54-0 Fig. 2)</div>

            <div className="mb-1 font-mono text-[6px] uppercase tracking-wide text-subtle">Ramp — external power cart (not a P5 switch)</div>
            <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <ControlButton label="GROUND CART" active={s.externalPowerConnected} tone="source" onClick={() => s.patch({ externalPowerConnected: !s.externalPowerConnected, groundPowerOn: false })} />
            </div>

            <div className="mb-1 font-mono text-[6px] uppercase tracking-wide text-subtle">DC metering panel</div>
            <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <ControlButton label="BATTERY" active={s.battery} tone="standby" onClick={() => s.patch({ battery: !s.battery })} />
            </div>

            <div className="mb-1 font-mono text-[6px] uppercase tracking-wide text-subtle">Electrical power panel — controls</div>
            <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <ControlButton label="GRD PWR ON" active={s.groundPowerOn} disabled={!s.externalPowerConnected} tone="source" onClick={() => { const next = !s.groundPowerOn; s.patch({ groundPowerOn: next, groundServiceOn: next ? false : s.groundServiceOn }, next ? "GROUND POWER ON — ground service switch overridden by normal external-power distribution." : "GROUND POWER OFF"); }} />
              <ControlButton label="BUS TRANS AUTO" active={s.busTie} onClick={() => s.patch({ busTie: !s.busTie })} />
              <ControlButton label="GEN 1" active={s.gen1} disabled={!d.eng1Running} tone="source" onClick={() => s.patch({ gen1: !s.gen1 })} />
              <ControlButton label="APU CONTROL LEFT" active={s.apuLeftControl} disabled={!d.apuAvailable} tone="source" onClick={() => {
                const next = !s.apuLeftControl;
                s.patch({ apuLeftControl: next, apuGen: next || s.apuRightControl });
              }} />
              <ControlButton label="APU CONTROL RIGHT" active={s.apuRightControl} disabled={!d.apuAvailable} tone="source" onClick={() => {
                const next = !s.apuRightControl;
                s.patch({ apuRightControl: next, apuGen: s.apuLeftControl || next });
              }} />
              <ControlButton label="GEN 2" active={s.gen2} disabled={!d.eng2Running} tone="source" onClick={() => s.patch({ gen2: !s.gen2 })} />
            </div>

            <div className="mb-1 font-mono text-[6px] uppercase tracking-wide text-subtle">Standby power panel</div>
            <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <ControlButton label="STBY OFF" active={s.standbyPower === "OFF"} onClick={() => s.patch({ standbyPower: "OFF" })} />
              <ControlButton label="STBY AUTO" active={s.standbyPower === "AUTO"} tone="standby" onClick={() => s.patch({ standbyPower: "AUTO" })} />
              <ControlButton label="STBY BAT" active={s.standbyPower === "BAT"} tone="standby" onClick={() => s.patch({ standbyPower: "BAT" })} />
            </div>

            <div className="mb-1 font-mono text-[6px] uppercase tracking-wide text-subtle">APU control and monitor panel</div>
            <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <ControlButton label={`APU MASTER ${s.apuMaster}`} active={s.apuMaster !== "OFF"} onClick={() => {
                if (s.apuMaster === "OFF") s.patch({ ...(d.externalDcControl ? {} : { battery: true }), apuMaster: "START" }, d.externalDcControl ? "APU START command — external electrical power supplying the starter circuit." : "APU START command — battery power applied for the electric APU starter.");
                else s.patch({ apuMaster: "OFF", apuGen: false, apuLeftControl: false, apuRightControl: false });
              }} />
            </div>

            <div className="mb-1 font-mono text-[6px] uppercase tracking-wide text-subtle">Ground service — fwd attendant panel (not P5; AMM 24-41-0)</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <ControlButton label="GROUND SERVICE" active={s.groundServiceOn} disabled={!d.groundPowerAvailable && !d.acPower} onClick={() => s.patch({ groundServiceOn: !s.groundServiceOn })} />
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2 text-[7px] uppercase text-subtle sm:grid-cols-4">
              <span>GPU: {sources.gpu ? "ON BUS" : d.externalPowerNotInUse ? "NOT IN USE" : s.externalPowerConnected ? "CONNECTED / NOT ON BUS" : "DISCONNECTED"}</span>
              <span>SERVICE: {d.groundServiceBusPowered ? "BUS POWERED" : "OFF"}</span>
              <span>APU: {d.apuGenOnBus ? "GEN ON BUS" : d.apuGenOffBus ? "OFF BUS" : d.apuAvailable ? "AVAILABLE" : "NOT RUNNING"}</span>
              <span>ENG 1: {d.generator1ProtectionTripped ? "PROTECTION TRIP" : d.gen1OffBus ? "OFF BUS" : d.eng1Running ? "RUNNING" : "STOPPED"}</span>
              <span>ENG 2: {d.generator2ProtectionTripped ? "PROTECTION TRIP" : d.gen2OffBus ? "OFF BUS" : d.eng2Running ? "RUNNING" : "STOPPED"}</span>
              <span>XFER 1: {d.transferRelay1Alt ? "R3 ALT · GEN 2" : d.transferBus1Powered ? d.electricalSource1 : "OFF"}</span>
              <span>XFER 2: {d.transferRelay2Alt ? "R4 ALT · GEN 1" : d.transferBus2Powered ? d.electricalSource2 : "OFF"}</span>
              <span>B HYD ELEC: {d.hydBPump1On || d.hydBPump2On ? `1 ${d.hydBPump1On ? "ON" : "OFF"} · 2 ${d.hydBPump2On ? "ON" : "OFF"}` : "OFF"}</span>
              <span>STBY HYD AC: {d.standbyAcPowered ? d.standbyAcSource : "NO STANDBY AC"}</span>
            </div>
          </div>

        <div className="mt-2 rounded border border-border bg-[#0a0d10] p-2">
          <div className="font-display text-[8px] uppercase tracking-[0.14em] text-subtle">System relationships</div>
          <div className="mt-2 space-y-1 text-[7px] uppercase leading-relaxed text-subtle">
            <div>GEN 1 FAIL → R3 ALT → GEN 2 PICKS UP XFER BUS 1</div>
            <div>GEN 2 FAIL → R4 ALT → GEN 1 PICKS UP XFER BUS 2</div>
            <div>GPU / APU → EPC / APU GB → TIE BUS → BTB 1 / 2 (ONLY WHERE NEEDED)</div>
            <div>BTBs CLOSE FOR THE EXTERNAL / APU SOURCE PATH; THEY ARE NOT THE ENGINE-GENERATOR CROSS-TRANSFER RELAYS</div>
            <div>TRANSFER BUS 1 / 2 → SYSTEM B ELEC HYD PUMPS (115V AC) · GPU OR APU CAN POWER B ON THE GROUND</div>
            <div>STANDBY AC (TB1 OR STATIC INVERTER) → STANDBY HYDRAULIC PUMP WHEN DEMANDED</div>
            <div>GROUND SERVICE → SERVICE BUS · BATTERY CHARGER → BATTERY</div>
            <div>115V AC → 28V AC TRANSFORMERS → 28V AC LOADS</div>
            <div>TR1 ← GEN BUS 1 · TR2 ← GEN BUS 2 · TR3 ← GEN BUS 2 (BACKUP)</div>
            <div>TR3 → DC TIE BUS → (DIODES M8/M113) → BACKS UP DC BUS 1 & 2 IF TR1/TR2 FAILS</div>
            <div>GEN PROTECTION → OV/UV · OF/UF · OVERCURRENT · DIFFERENTIAL → BREAKER TRIP AFTER PROTECTION DELAY</div>
          </div>
        </div>
        <div className="mt-2 rounded border border-amber-400/25 bg-amber-400/5 p-2 font-mono text-[7px] uppercase leading-relaxed text-amber-100/80">
          Standby AUTO requires BATTERY ON. With normal power available, standby follows Transfer Bus 1 / DC Bus 1; when that normal input is lost, the battery/static-inverter branch supplies standby power. BAT selects that battery-backed standby branch. The engine-generator cross-transfer is shown through R3/R4, not through the BTBs.
        </div>
      </div>

      <div className="rounded-xl border border-[#5a5139] bg-[#181813] p-3">
        <div className="mb-2 font-display text-[9px] uppercase tracking-[0.16em] text-subtle">How to apply electrical power</div>
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
          {(Object.keys(modes) as Array<keyof typeof modes>).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              className={cn("rounded border px-2 py-2 text-[8px] font-display uppercase tracking-wide", mode === key ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-200" : "border-border bg-panel text-subtle")}
            >
              {modes[key].title}
            </button>
          ))}
        </div>
        <div className="mt-2 rounded border border-cyan-400/20 bg-cyan-400/5 px-2 py-2 text-[7px] font-mono uppercase tracking-wide text-cyan-100">PATH: {modes[mode].path}</div>
        <ol className="mt-3 space-y-2 text-[8px] leading-relaxed text-fg">
          {modes[mode].steps.map((step, index) => (
            <li key={step} className="flex gap-2">
              <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full border border-border bg-panel font-mono text-[7px] text-subtle">{index + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <div className="mt-3 rounded border border-amber-400/30 bg-amber-400/5 p-2 text-[7px] leading-relaxed text-amber-100/80">
          TRAINING NOTE: External power, APU generator and engine generators are not paralleled. TR1 ← Transfer Bus 1, TR2 ← Transfer Bus 2, TR3 ← Generator Bus 2 / valid No. 2 source path (backup to DC Bus 1 & 2). Standby AUTO follows Transfer Bus 1 / DC Bus 1; on loss the battery/static-inverter branch supplies standby AC/DC. System B electric hydraulic pumps take 115V AC from the transfer buses — GPU or APU can power them on the ground. The standby hydraulic pump uses standby AC, not the main AC aggregate alone.
        </div>
      </div>
      <ElWireLayer wires={wires} w={size.w} h={size.h} />
    </div>
  );
}
