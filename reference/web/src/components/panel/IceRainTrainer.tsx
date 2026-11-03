import { useEffect, useRef, useState } from "react";
import { useSimPick, useDerivedPick } from "@/lib/sim/store";
import { cn } from "@/lib/utils";
import { CaptionLight, Rocker } from "./widgets";
import {
  CockpitWindowsDiagram,
  FrontOverviewDiagram,
  ProbeHeatDiagram,
  WingAntiIcePlan,
  useIceRainAnim,
  type ProbeId,
  type WinId,
  type WiperMode,
} from "./IceRainDiagrams";

/**
 * Ice & Rain Protection trainer (ATA 30).
 * P5-9 window / probe heat, wing + engine thermal anti-ice, fuel heat, wipers and rain repellent.
 * Behaviour follows the 737 AMM (30-11, 30-41, 30-42, 56-10); every diagram animates from the
 * same switch state, so what you select on the panel is what you see on the airplane.
 */

const btn =
  "rounded border border-border bg-inset px-2 py-2 text-[9px] font-display uppercase tracking-wide text-fg hover:bg-panel disabled:opacity-40";
const btnOn =
  "rounded border border-accent bg-panel px-2 py-2 text-[9px] font-display uppercase tracking-wide text-fg disabled:opacity-40";
const btnWarn =
  "rounded border border-warn/50 bg-warn/10 px-2 py-2 text-[9px] font-display uppercase tracking-wide text-fg disabled:opacity-40";

function Chip({
  label,
  value,
  on,
  warn,
  caution,
}: {
  label: string;
  value?: string;
  on: boolean;
  warn?: boolean;
  caution?: boolean;
}) {
  return (
    <div className="rounded border border-border bg-inset px-1.5 py-1 text-center font-mono text-[8px] uppercase leading-tight">
      <div className="text-subtle">{label}</div>
      <div className={warn ? "text-warn" : caution ? "text-caution" : on ? "text-ok" : "text-subtle"}>
        {value ?? (on ? "ON" : "OFF")}
      </div>
    </div>
  );
}

function Card({
  title,
  state,
  tone,
  children,
}: {
  title: string;
  state: string;
  tone: "ok" | "warn" | "caution";
  children: React.ReactNode;
}) {
  const toneCls =
    tone === "warn"
      ? "border-warn/40 text-warn"
      : tone === "caution"
        ? "border-caution/40 text-caution"
        : "border-ok/30 text-ok";
  return (
    <div className="rounded-xl border border-border bg-surface p-3 shadow-panel">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-[11px] uppercase tracking-[0.14em] text-fg">{title}</h3>
        <span className={cn("rounded border px-2 py-0.5 font-mono text-[8px] uppercase", toneCls)}>
          {state}
        </span>
      </div>
      {children}
    </div>
  );
}

/** Spring-loaded (momentary) switch position: active only while the pointer is held. */
function HoldButton({
  label,
  active,
  onHold,
  onRelease,
  disabled,
  warn,
}: {
  label: string;
  active: boolean;
  onHold: () => void;
  onRelease: () => void;
  disabled?: boolean;
  warn?: boolean;
}) {
  const pressed = useRef(false);
  const release = () => {
    if (!pressed.current) return;
    pressed.current = false;
    onRelease();
  };
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={active}
      onPointerDown={(e) => {
        e.preventDefault();
        pressed.current = true;
        onHold();
      }}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      className={cn(
        "touch-none select-none",
        active ? btnOn : warn ? btnWarn : btn,
      )}
    >
      {label}
    </button>
  );
}

function ValveLight({ label, state }: { label: string; state: "off" | "dim" | "bright" }) {
  return (
    <div className="flex min-h-8 min-w-[4.5rem] items-center justify-center gap-1.5 rounded-[3px] border border-line bg-inset px-1.5 py-1 font-display text-[10px] font-semibold leading-tight tracking-wide text-subtle">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full border border-[#2a4a63]"
        style={{
          background: "#59b6ff",
          opacity: state === "off" ? 0.15 : state === "dim" ? 0.5 : 1,
          boxShadow: state === "bright" ? "0 0 10px 2px rgba(89,182,255,.8)" : undefined,
        }}
      />
      {label}
    </div>
  );
}

function Toggle({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button type="button" aria-pressed={on} className={on ? btnOn : btn} onClick={() => onChange(!on)}>
      {label} · {on ? "ON" : "OFF"}
    </button>
  );
}

const WIPER_OPTIONS: { id: WiperMode; label: string }[] = [
  { id: "PARK", label: "PARK" },
  { id: "LOW", label: "LOW" },
  { id: "INT", label: "MID" },
  { id: "HIGH", label: "HIGH" },
];

export function IceRainTrainer() {
  const s = useSimPick("alphaVaneIceL", "alphaVaneIceR", "ambientTempF", "antiIce1", "antiIce2", "circuitBreakers", "faults", "fuelHeat", "fuelHeat2", "icingConditions", "lePos", "ltTest", "patch", "probeHeatAlphaL", "probeHeatAlphaR", "probeHeatCaptPitot", "probeHeatElevL", "probeHeatElevR", "probeHeatFoPitot", "probeHeatTemp", "psCbCaptUpperL", "psCbElevL", "psCbElevR", "psCbFoUpperR", "psCbTempL", "psCbTempR", "psPitotStaticA", "psPitotStaticB", "rainRepelPulseL", "rainRepelPulseR", "windowHeatLFwd", "windowHeatLSide", "windowHeatOvhtLFwd", "windowHeatOvhtLSide", "windowHeatOvhtRFwd", "windowHeatOvhtRSide", "windowHeatRFwd", "windowHeatRSide", "windowHeatTest", "wingAntiIceL", "wingAntiIceR", "wiperL", "wiperR", "wow");
  const d = useDerivedPick("acPower", "alphaVaneHeatedL", "alphaVaneHeatedR", "bleed1Available", "bleed2Available", "dcPower", "electricalSource1", "electricalSource2", "fuelHeatValve2Open", "fuelHeatValveOpen", "leftDuctPsi", "rightDuctPsi");
  const ac = !!d.acPower;
  const dc = !!d.dcPower;
  const lampTest = !!s.ltTest && dc;
  const [airborne, setAirborne] = useState(false);
  // Trainer override: lets you see in-flight wing anti-ice behaviour while the sim sits on the ground.
  const wow = !!s.wow && !airborne;

  // Trainer conditions (not aircraft controls)
  const icing = s.icingConditions;
  const setIcing = (value: boolean) => s.patch({ icingConditions: value }, `ICING CONDITIONS ${value ? "ON" : "OFF"}`);
  const [rain, setRain] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [wingTest, setWingTest] = useState(false);

  // AMM 30-41-0: left generator feeds L No.1/4/5 and R No.2; right generator feeds R No.1/4/5 and L No.2.
  const ac1 = d.electricalSource1 !== "NONE";
  const ac2 = d.electricalSource2 !== "NONE";
  const ovhtOf = (latched: boolean, sw: boolean) =>
    latched || (s.windowHeatTest === "OVHT" && sw);
  const ovht: Record<WinId, boolean> = {
    L1: ovhtOf(s.windowHeatOvhtLFwd, s.windowHeatLFwd),
    L2: ovhtOf(s.windowHeatOvhtLSide, s.windowHeatLSide),
    R1: ovhtOf(s.windowHeatOvhtRFwd, s.windowHeatRFwd),
    R2: ovhtOf(s.windowHeatOvhtRSide, s.windowHeatRSide),
    L4: false,
    L5: false,
    R4: false,
    R5: false,
  };
  const winEnabled: Record<WinId, boolean> = {
    L1: s.windowHeatLFwd && s.circuitBreakers["window-heat-left"] && ac1 && !ovht.L1 && !s.faults.windowHeatFailureL,
    L2: s.windowHeatLSide && s.circuitBreakers["window-heat-left"] && ac2 && !ovht.L2 && !s.faults.windowHeatFailureL,
    L4: s.windowHeatLSide && s.circuitBreakers["window-heat-left"] && ac1 && !s.faults.windowHeatFailureL,
    L5: s.windowHeatLSide && s.circuitBreakers["window-heat-left"] && ac1 && !s.faults.windowHeatFailureL,
    R1: s.windowHeatRFwd && s.circuitBreakers["window-heat-right"] && ac2 && !ovht.R1 && !s.faults.windowHeatFailureR,
    R2: s.windowHeatRSide && s.circuitBreakers["window-heat-right"] && ac1 && !ovht.R2 && !s.faults.windowHeatFailureR,
    R4: s.windowHeatRSide && s.circuitBreakers["window-heat-right"] && ac2 && !s.faults.windowHeatFailureR,
    R5: s.windowHeatRSide && s.circuitBreakers["window-heat-right"] && ac2 && !s.faults.windowHeatFailureR,
  };

  const probeSw: Record<ProbeId, boolean> = {
    capt: s.probeHeatCaptPitot,
    fo: s.probeHeatFoPitot,
    elevL: s.probeHeatElevL,
    elevR: s.probeHeatElevR,
    temp: s.probeHeatTemp,
    alphaL: s.probeHeatAlphaL,
    alphaR: s.probeHeatAlphaR,
  };
  const probeHeated = Object.fromEntries(
    Object.entries(probeSw).map(([k, v]) => {
      const cbOk = k === "capt" ? s.psCbCaptUpperL : k === "fo" ? s.psCbFoUpperR : k === "elevL" ? s.psCbElevL : k === "elevR" ? s.psCbElevR : k === "temp" ? (s.psCbTempL && s.psCbTempR) : k === "alphaL" ? s.circuitBreakers["alpha-vane-left"] : k === "alphaR" ? s.circuitBreakers["alpha-vane-right"] : true;
      if (k === "alphaL") return [k, d.alphaVaneHeatedL];
      if (k === "alphaR") return [k, d.alphaVaneHeatedR];
      return [k, ac && dc && v && cbOk];
    }),
  ) as Record<ProbeId, boolean>;

  // AMM 30-11-0: wing TAI valves are 115 V ac motor valves; the landing-gear safety relay keeps
  // them closed on the ground with the switch ON. TEST (momentary) bypasses the relay.
  const wingSw = { L: s.wingAntiIceL, R: s.wingAntiIceR };
  const valveCmd = {
    L: ac && ((wingSw.L && !wow) || wingTest),
    R: ac && ((wingSw.R && !wow) || wingTest),
  };
  const hotAir = { L: d.leftDuctPsi > 8, R: d.rightDuctPsi > 8 };
  const cowlOpen = { 1: ac && s.antiIce1, 2: ac && s.antiIce2 };
  const cowlHeated = {
    1: cowlOpen[1] && d.bleed1Available,
    2: cowlOpen[2] && d.bleed2Available,
  };

  const { anim, wipers, spray } = useIceRainAnim({
    speed,
    icing,
    rain,
    oatF: Number(s.ambientTempF ?? 75),
    winEnabled,
    testPwr: s.windowHeatTest === "PWR",
    probeHeated,
    valveCmd,
    hotAir,
    cowlHeated,
    wiper: { L: s.wiperL, R: s.wiperR },
  });

  // The overhead commands a timed spray pulse in SimState; consume each pulse once here so
  // the cockpit panel controls and this detailed pane animation share the same control path.
  const seenRepellentPulse = useRef({ L: s.rainRepelPulseL, R: s.rainRepelPulseR });
  useEffect(() => {
    if (seenRepellentPulse.current.L !== s.rainRepelPulseL) {
      seenRepellentPulse.current.L = s.rainRepelPulseL;
      if (dc && !s.faults.rainRepellentFailure) spray("L");
    }
    if (seenRepellentPulse.current.R !== s.rainRepelPulseR) {
      seenRepellentPulse.current.R = s.rainRepelPulseR;
      if (dc && !s.faults.rainRepellentFailure) spray("R");
    }
  }, [s.rainRepelPulseL, s.rainRepelPulseR, s.faults.rainRepellentFailure, dc, spray]);

  // Overheat cutoff (>145 °F while powered) latches the overheat light, like the real controller.
  const tripL1 = anim.win.L1.trip;
  const tripL2 = anim.win.L2.trip;
  const tripR1 = anim.win.R1.trip;
  const tripR2 = anim.win.R2.trip;
  useEffect(() => {
    const p: Record<string, boolean> = {};
    if (tripL1) p.windowHeatOvhtLFwd = true;
    if (tripL2) p.windowHeatOvhtLSide = true;
    if (tripR1) p.windowHeatOvhtRFwd = true;
    if (tripR2) p.windowHeatOvhtRSide = true;
    if (Object.keys(p).length)
      s.patch(p as never, "WINDOW HEAT OVERHEAT — power cut at ≈145 °F. Cycle the window switch OFF to reset.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripL1, tripL2, tripR1, tripR2]);

  const setWh = (
    key: "windowHeatLFwd" | "windowHeatLSide" | "windowHeatRFwd" | "windowHeatRSide",
    v: boolean,
  ) => {
    const ovhtKey = (
      {
        windowHeatLFwd: "windowHeatOvhtLFwd",
        windowHeatLSide: "windowHeatOvhtLSide",
        windowHeatRFwd: "windowHeatOvhtRFwd",
        windowHeatRSide: "windowHeatOvhtRSide",
      } as const
    )[key];
    s.patch(
      { [key]: v, ...(v ? {} : { [ovhtKey]: false }) } as never,
      `WINDOW HEAT ${key.replace("windowHeat", "")} ${v ? "ON" : "OFF"}`,
    );
  };

  const anyWindowOn =
    s.windowHeatLFwd || s.windowHeatLSide || s.windowHeatRFwd || s.windowHeatRSide;
  const anyOvht =
    ovht.L1 || ovht.L2 || ovht.R1 || ovht.R2 || s.windowHeatTest === "OVHT";
  const anyProbe = Object.values(probeHeated).some(Boolean);
  const anyEngineAi = s.antiIce1 || s.antiIce2;
  const anyWingAi = s.wingAntiIceL || s.wingAntiIceR;
  const wingInhibited = (anyWingAi && wow && !wingTest) || false;

  const onLight = (id: WinId) => anim.win[id].p > 0.004;
  const wr = (id: WinId) => anim.win[id];
  const winChip = (label: string, id: WinId, group?: WinId) => {
    const w = wr(id);
    const g = group ? wr(group) : w;
    const t = group ? (w.t + g.t) / 2 : w.t;
    const p = group ? Math.max(w.p, g.p) : w.p;
    return (
      <Chip
        key={label}
        label={label}
        value={`${Math.round(t)}°F · ${Math.round(p * 100)}%`}
        on={p > 0.004}
        warn={ovht[id] || w.trip}
      />
    );
  };

  const lightFor = (sd: "L" | "R"): "off" | "dim" | "bright" => {
    const pos = anim.valve[sd];
    const sw = wingSw[sd] || wingTest;
    const open = pos >= 0.97;
    const transit = pos > 0.03 && pos < 0.97;
    if (!dc) return "off";
    if (transit || (sw && !open) || (!sw && open)) return "bright";
    return open ? "dim" : "off";
  };
  const lights = { L: lightFor("L"), R: lightFor("R") };
  const valveOpen = { L: anim.valve.L > 0.5 && hotAir.L, R: anim.valve.R > 0.5 && hotAir.R };

  const wiping = s.wiperL !== "PARK" || s.wiperR !== "PARK";
  const setWipers = (m: WiperMode) =>
    s.patch({ wiperL: m, wiperR: m }, m === "PARK" ? "WIPERS — PARK (drive to park position)" : `WIPERS ${m}`);
  const wiperState =
    s.wiperL === s.wiperR ? s.wiperL : `${s.wiperL}/${s.wiperR}`;

  const iceTotal =
    Math.max(
      ...Object.values(anim.probe),
      anim.slat.L,
      anim.slat.R,
      anim.cowl[1],
      anim.cowl[2],
      ...(Object.keys(anim.win) as WinId[]).map((k) => anim.win[k].ice),
    ) || 0;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-panel p-3">
        <p className="font-display text-[10px] uppercase tracking-[0.18em] text-subtle">
          ATA 30 · Ice &amp; rain protection
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          Window heat (30-41), probe heat (30-31), wing slat and engine cowl anti-ice (30-11), wipers and rain
          repellent (30-42 / 30-43). The airplane views animate from the same switches: glass warms and frost
          clears, slats and cowls glow when hot air flows, wiper blades sweep. Window heat needs AC; probe heat needs DC.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-4">
          <Chip label="AC POWER" on={ac} value={ac ? "AVAILABLE" : "NONE"} />
          <Chip
            label="WINDOW HEAT"
            on={anyWindowOn && ac}
            warn={anyOvht}
            value={anyOvht ? "OVHT" : anyWindowOn ? "ON" : "OFF"}
          />
          <Chip label="PROBE HEAT" on={anyProbe && dc} value={anyProbe ? "ON" : "OFF"} />
          <Chip
            label="ENG / WING AI"
            on={anyEngineAi || anyWingAi}
            value={anyEngineAi || anyWingAi ? "ON" : "OFF"}
          />
        </div>
      </div>

      {/* ——— Trainer conditions ——— */}
      <div className="rounded-xl border border-border bg-surface p-3">
        <div className="mb-2 font-display text-[10px] uppercase tracking-[0.14em] text-subtle">
          Conditions (trainer)
        </div>
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
          <Toggle label="Icing conditions" on={icing} onChange={setIcing} />
          <Toggle label="Rain" on={rain} onChange={setRain} />
          <Toggle label="Airborne logic" on={airborne} onChange={setAirborne} />
          <div className="grid grid-cols-3 gap-1">
            {[1, 10, 30].map((v) => (
              <button key={v} type="button" className={speed === v ? btnOn : btn} onClick={() => setSpeed(v)}>
                {v === 1 ? "REAL" : `×${v}`}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-4">
          <Chip label="OAT" value={`${Math.round(icing ? Math.min(Number(s.ambientTempF ?? 75), 25) : Number(s.ambientTempF ?? 75))}°F`} on={false} />
          <Chip label="ICE ON AIRPLANE" on={iceTotal > 0.05} caution={iceTotal > 0.05} value={iceTotal > 0.05 ? `${Math.round(iceTotal * 100)}%` : "CLEAR"} />
          <Chip label="ALPHA VANE L/R ICE" on={s.alphaVaneIceL > 0.05 || s.alphaVaneIceR > 0.05} caution={s.alphaVaneIceL > 0.05 || s.alphaVaneIceR > 0.05} value={`${Math.round(s.alphaVaneIceL * 100)}% / ${Math.round(s.alphaVaneIceR * 100)}%`} />
          <Chip label="TIME SCALE" on={false} value={speed === 1 ? "REAL TIME" : `×${speed}`} />
          <Chip label="RAIN" on={rain} value={rain ? "ON" : "OFF"} />
        </div>
        <p className="mt-2 text-[8px] leading-snug text-subtle">
          Airborne logic makes the wing anti-ice valves behave as in flight (the landing-gear safety relay no longer
          inhibits them) without moving the airplane. Icing conditions hold the outside air at ≤ 25 °F with visible moisture: ice builds on anything that is not
          heated and melts off anything that is. REAL runs the 3-minute window-heat power ramp at true speed; ×10 / ×30
          compress the thermal and ice processes (wipers always run at real speed).
        </p>
      </div>

      {/* ——— Window heat P5-9 ——— */}
      <Card
        title="Window heat · P5-9 (ATA 30-41)"
        state={anyOvht ? "OVERHEAT" : anyWindowOn && ac ? "HEAT APPLIED" : "OFF"}
        tone={anyOvht ? "caution" : "ok"}
      >
        <div className="mb-2 overflow-hidden rounded-lg border border-border bg-[#0b0d10] p-1">
          <CockpitWindowsDiagram anim={anim} ovht={ovht} wipers={wipers} />
        </div>
        <div className="mb-2 grid grid-cols-3 gap-1 sm:grid-cols-6">
          {winChip("L NO.1", "L1")}
          {winChip("L NO.2", "L2")}
          {winChip("L NO.4/5", "L4", "L5")}
          {winChip("R NO.1", "R1")}
          {winChip("R NO.2", "R2")}
          {winChip("R NO.4/5", "R4", "R5")}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1 rounded-md border border-border bg-inset p-2">
            <div className="font-mono text-[8px] uppercase tracking-wider text-subtle">Left</div>
            <Rocker label="L FWD" on={s.windowHeatLFwd} onChange={(v) => setWh("windowHeatLFwd", v)} lit={winEnabled.L1} />
            <Rocker label="L SIDE" on={s.windowHeatLSide} onChange={(v) => setWh("windowHeatLSide", v)} lit={winEnabled.L2} />
            <div className="grid grid-cols-2 gap-1 pt-1">
              <CaptionLight label="L FWD ON" on={lampTest || (dc && onLight("L1") && !ovht.L1)} tone="ok" />
              <CaptionLight label="L FWD OVHT" on={lampTest || (dc && ovht.L1)} tone="caution" />
              <CaptionLight label="L SIDE ON" on={lampTest || (dc && onLight("L2") && !ovht.L2)} tone="ok" />
              <CaptionLight label="L SIDE OVHT" on={lampTest || (dc && ovht.L2)} tone="caution" />
            </div>
          </div>
          <div className="space-y-1 rounded-md border border-border bg-inset p-2">
            <div className="font-mono text-[8px] uppercase tracking-wider text-subtle">Right</div>
            <Rocker label="R FWD" on={s.windowHeatRFwd} onChange={(v) => setWh("windowHeatRFwd", v)} lit={winEnabled.R1} />
            <Rocker label="R SIDE" on={s.windowHeatRSide} onChange={(v) => setWh("windowHeatRSide", v)} lit={winEnabled.R2} />
            <div className="grid grid-cols-2 gap-1 pt-1">
              <CaptionLight label="R FWD ON" on={lampTest || (dc && onLight("R1") && !ovht.R1)} tone="ok" />
              <CaptionLight label="R FWD OVHT" on={lampTest || (dc && ovht.R1)} tone="caution" />
              <CaptionLight label="R SIDE ON" on={lampTest || (dc && onLight("R2") && !ovht.R2)} tone="ok" />
              <CaptionLight label="R SIDE OVHT" on={lampTest || (dc && ovht.R2)} tone="caution" />
            </div>
          </div>
        </div>
        <div className="mt-2 rounded-md border border-border bg-inset p-2">
          <div className="mb-1 font-mono text-[8px] uppercase tracking-wider text-subtle">
            Test switch — spring-loaded to centre (hold)
          </div>
          <div className="grid grid-cols-2 gap-1">
            <HoldButton
              label="PWR (hold)"
              active={s.windowHeatTest === "PWR"}
              onHold={() => s.patch({ windowHeatTest: "PWR" }, "Window heat test — PWR (full power forced).")}
              onRelease={() => s.patch({ windowHeatTest: "OFF" }, "Window heat test released.")}
            />
            <HoldButton
              warn
              label="OVHT (hold)"
              active={s.windowHeatTest === "OVHT"}
              onHold={() => s.patch({ windowHeatTest: "OVHT" }, "Window heat test — OVHT.")}
              onRelease={() => s.patch({ windowHeatTest: "OFF" }, "Window heat test released.")}
            />
          </div>
        </div>
        <p className="mt-2 text-[8px] leading-snug text-subtle">
          AMM 56-10-0: No.1 windshield, No.2 sliding window, No.4 and No.5 eyebrow windows are heated; No.3 is not.
          FWD switch = No.1, SIDE switch = No.2 + No.4/5. No.1 and No.2 are controlled to 107 ±7 °F with power ramping
          to full over about 3 minutes; No.4/5 are held 80–120 °F by the No.5 thermal switch. Power is cut at ≈145 °F
          (OVHT light, then master caution) — cycle that window switch OFF to reset. Holding PWR forces full power, so
          a long test on a warm window will trip the overheat cutoff.
        </p>
      </Card>

      {/* ——— Probe / pitot heat ——— */}
      <Card title="Probe / pitot heat · P5-9 (ATA 30-31)" state={anyProbe ? "HEAT ON" : "OFF"} tone="ok">
        <div className="mb-2 overflow-hidden rounded-lg border border-border bg-[#0b0d10]">
          <ProbeHeatDiagram anim={anim} heated={probeHeated} />
        </div>
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
          <Rocker label="CAPT PITOT / P5-9 A" on={s.psPitotStaticA} onChange={(v) => s.patch({ psPitotStaticA: v })} lit={ac && s.psPitotStaticA && s.psCbCaptUpperL} />
          <Rocker label="F/O PITOT / P5-9 B" on={s.psPitotStaticB} onChange={(v) => s.patch({ psPitotStaticB: v })} lit={ac && s.psPitotStaticB && s.psCbFoUpperR} />
          <Rocker label="L ELEV PITOT (TAIL)" on={s.probeHeatElevL} onChange={(v) => s.patch({ probeHeatElevL: v })} lit={ac && s.probeHeatElevL && s.psPitotStaticA && s.psCbElevL} />
          <Rocker label="R ELEV PITOT (TAIL)" on={s.probeHeatElevR} onChange={(v) => s.patch({ probeHeatElevR: v })} lit={ac && s.probeHeatElevR && s.psPitotStaticB && s.psCbElevR} />
          <Rocker label="TEMP PROBE" on={s.probeHeatTemp} onChange={(v) => s.patch({ probeHeatTemp: v })} lit={ac && s.probeHeatTemp && s.psCbTempL && s.psCbTempR} />
          <Rocker label="L ALPHA VANE" on={s.probeHeatAlphaL} onChange={(v) => s.patch({ probeHeatAlphaL: v }, `LEFT ALPHA VANE HEAT ${v ? "ON" : "OFF"}`)} lit={d.alphaVaneHeatedL} />
          <Rocker label="R ALPHA VANE" on={s.probeHeatAlphaR} onChange={(v) => s.patch({ probeHeatAlphaR: v }, `RIGHT ALPHA VANE HEAT ${v ? "ON" : "OFF"}`)} lit={d.alphaVaneHeatedR} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-4">
          <Chip label="CAPT PITOT" on={probeHeated.capt} />
          <Chip label="F/O PITOT" on={probeHeated.fo} />
          <Chip label="ELEV L/R" on={probeHeated.elevL || probeHeated.elevR} />
          <Chip label="TEMP / ALPHA" on={probeHeated.temp || probeHeated.alphaL || probeHeated.alphaR} />
        </div>
        <p className="mt-2 text-[8px] leading-snug text-subtle">
          Orange glow = element heating. With icing conditions on, an unheated probe collects ice; heating clears it in
          seconds. The probes are on the same P5-9 module as window heat.
        </p>
      </Card>

      {/* ——— Wing / engine anti-ice ——— */}
      <Card
        title="Wing slats / engine cowl anti-ice (ATA 30-11)"
        state={wingInhibited ? "WING INHIBITED (GND)" : valveOpen.L || valveOpen.R || cowlHeated[1] || cowlHeated[2] ? "HOT AIR FLOWING" : anyEngineAi || anyWingAi ? "SELECTED" : "OFF"}
        tone={wingInhibited ? "caution" : "ok"}
      >
        <div className="mb-2 overflow-hidden rounded-lg border border-border bg-[#0b0d10] p-1">
          <WingAntiIcePlan
            anim={anim}
            lePos={s.lePos}
            hotAir={hotAir}
            lights={lights}
            cowlOpen={cowlOpen}
            cowlHeated={cowlHeated}
            inhibited={wingInhibited}
          />
        </div>
        <div className="mb-2 overflow-hidden rounded-lg border border-border bg-[#0b0d10] p-1">
          <FrontOverviewDiagram anim={anim} valveOpen={valveOpen} cowlHeated={cowlHeated} ovht={ovht} />
        </div>
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
          <Rocker label="ENG 1 ANTI-ICE" on={s.antiIce1} onChange={(v) => s.patch({ antiIce1: v })} lit={ac && s.antiIce1} />
          <Rocker label="ENG 2 ANTI-ICE" on={s.antiIce2} onChange={(v) => s.patch({ antiIce2: v })} lit={ac && s.antiIce2} />
          <Rocker
            label="WING ANTI-ICE L"
            on={s.wingAntiIceL}
            onChange={(v) => s.patch({ wingAntiIceL: v }, v ? (wow ? "LEFT WING ANTI-ICE SELECTED — valve inhibited on ground." : "LEFT WING ANTI-ICE ON.") : "LEFT WING ANTI-ICE OFF.")}
            lit={ac && s.wingAntiIceL}
          />
          <Rocker
            label="WING ANTI-ICE R"
            on={s.wingAntiIceR}
            onChange={(v) => s.patch({ wingAntiIceR: v }, v ? (wow ? "RIGHT WING ANTI-ICE SELECTED — valve inhibited on ground." : "RIGHT WING ANTI-ICE ON.") : "RIGHT WING ANTI-ICE OFF.")}
            lit={ac && s.wingAntiIceR}
          />
          <Rocker label="ENG 1 FUEL HEAT" on={s.fuelHeat} onChange={(v) => s.patch({ fuelHeat: v, ...(v ? { fuelHeatElapsedSec: 0 } : {}) })} lit={d.fuelHeatValveOpen} />
        <Rocker label="ENG 2 FUEL HEAT" on={s.fuelHeat2} onChange={(v) => s.patch({ fuelHeat2: v, ...(v ? { fuelHeat2ElapsedSec: 0 } : {}) })} lit={d.fuelHeatValve2Open} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3">
          <HoldButton
            warn
            label="WING A/I TEST (hold)"
            active={wingTest}
            disabled={!ac}
            onHold={() => setWingTest(true)}
            onRelease={() => setWingTest(false)}
          />
          <ValveLight label="L VALVE OPEN" state={lights.L} />
          <ValveLight label="R VALVE OPEN" state={lights.R} />
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1">
          <CaptionLight label="ENG 1 AI" on={lampTest || (ac && s.antiIce1)} tone="ok" />
          <CaptionLight label="ENG 2 AI" on={lampTest || (ac && s.antiIce2)} tone="ok" />
          <CaptionLight label="FUEL HT" on={lampTest || (ac && s.fuelHeat)} tone="ok" />
          <CaptionLight label="WING INHIBIT" on={lampTest || (dc && wingInhibited)} tone="caution" />
          <CaptionLight
            label="BLEED LOAD"
            on={lampTest || (dc && ((s.antiIce1 && d.bleed1Available) || (s.antiIce2 && d.bleed2Available) || valveOpen.L || valveOpen.R))}
            tone="caution"
          />
        </div>
        <p className="mt-2 text-[8px] leading-snug text-subtle">
          AMM 30-11-0: wing anti-ice heats the leading-edge slats only (three slats per wing, spray ducts fed through
          telescoping ducts that follow the slats out). One switch drives both motor-driven valves, just outboard of
          each engine strut. The landing-gear safety relay keeps them closed on the ground, so the blue VALVE OPEN
          light glows bright (valve disagrees with switch) until you hold TEST or are airborne. Light: dim = open and
          agrees, bright = in transit or disagrees. Engine anti-ice heats the cowl lip, inlet guide vanes and nose dome
          (AMM chapter 75). Both are pneumatic: opening them loads the bleed manifold.
        </p>
      </Card>

      {/* ——— Wipers + rain repellent ——— */}
      <Card
        title="Windshield wipers · rain removal (ATA 30-42)"
        state={wiping ? "WIPING" : "PARK"}
        tone={wiping && !rain ? "caution" : "ok"}
      >
        <div className="rounded-md border border-border bg-inset p-2">
          <div className="mb-1 font-mono text-[8px] uppercase tracking-wider text-subtle">
            Common wiper switch — both No.1 windows
          </div>
          <div className="grid grid-cols-4 gap-1">
            {WIPER_OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                aria-pressed={s.wiperL === o.id && s.wiperR === o.id}
                className={s.wiperL === o.id && s.wiperR === o.id ? btnOn : btn}
                onClick={() => setWipers(o.id)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-4">
          <Chip label="WIPERS" on={wiping} value={wiperState === "INT" ? "MID" : String(wiperState)} />
          <Chip label="L NO.1 WET" on={false} value={`${Math.round(anim.win.L1.wet * 100)}%`} caution={anim.win.L1.wet > 0.3} />
          <Chip label="R NO.1 WET" on={false} value={`${Math.round(anim.win.R1.wet * 100)}%`} caution={anim.win.R1.wet > 0.3} />
          <Chip label="DRY OPERATION" on={false} warn={wiping && !rain} value={wiping && !rain ? "CAUTION" : "—"} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1">
          <HoldButton label="L REPELLENT (press)" active={anim.repel.L > 0.5} onHold={() => spray("L")} onRelease={() => undefined} />
          <HoldButton label="R REPELLENT (press)" active={anim.repel.R > 0.5} onHold={() => spray("R")} onRelease={() => undefined} />
        </div>
        <p className="mt-2 text-[8px] leading-snug text-subtle">
          AMM 30-42-0: independent electric motors, one gang switch. Blades sweep an 84° arc; HIGH is at least 250
          strokes/min (LOW and MID speeds here are trainer values). Selecting PARK drives the blades home at high
          speed. Do not run the wipers on a dry windshield. Rain repellent (30-43) is sprayed on each No.1 window
          separately and works together with the wipers.
        </p>
      </Card>

      {/* ——— Quick scenarios ——— */}
      <div className="rounded-xl border border-border bg-surface p-3">
        <div className="mb-2 font-display text-[10px] uppercase tracking-[0.14em] text-subtle">
          Quick setups
        </div>
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
          <button
            type="button"
            className={btn}
            onClick={() =>
              s.patch(
                {
                  windowHeatLFwd: true,
                  windowHeatRFwd: true,
                  windowHeatLSide: true,
                  windowHeatRSide: true,
                  windowHeatTest: "OFF",
                  windowHeatOvhtLFwd: false,
                  windowHeatOvhtLSide: false,
                  windowHeatOvhtRFwd: false,
                  windowHeatOvhtRSide: false,
                },
                "All window heat ON.",
              )
            }
          >
            All window heat ON
          </button>
          <button
            type="button"
            className={btn}
            onClick={() =>
              s.patch(
                {
                  probeHeatCaptPitot: true,
                  probeHeatFoPitot: true,
                  probeHeatElevL: true,
                  probeHeatElevR: true,
                  probeHeatTemp: true,
                  probeHeatAlphaL: true,
                  probeHeatAlphaR: true,
                },
                "All probe heat ON.",
              )
            }
          >
            All probe heat ON
          </button>
          <button
            type="button"
            className={btn}
            onClick={() =>
              s.patch(
                { antiIce1: true, antiIce2: true, wingAntiIceL: true, wingAntiIceR: true },
                "Engine + wing anti-ice ON.",
              )
            }
          >
            Eng + wing AI ON
          </button>
          <button
            type="button"
            className={btn}
            onClick={() => {
              setIcing(true);
              setRain(false);
            }}
          >
            Icing encounter (all unheated)
          </button>
          <button
            type="button"
            className={btnWarn}
            onClick={() =>
              s.patch(
                { windowHeatTest: "OVHT", windowHeatLFwd: true, windowHeatRFwd: true },
                "OVHT test with FWD windows ON — overheat lights should illuminate.",
              )
            }
          >
            OVHT test (FWD on)
          </button>
          <button
            type="button"
            className={btnOn}
            onClick={() => {
              setIcing(false);
              setRain(false);
              setWingTest(false);
              s.patch(
                {
                  windowHeatLFwd: false,
                  windowHeatLSide: false,
                  windowHeatRFwd: false,
                  windowHeatRSide: false,
                  windowHeatTest: "OFF",
                  windowHeatOvhtLFwd: false,
                  windowHeatOvhtLSide: false,
                  windowHeatOvhtRFwd: false,
                  windowHeatOvhtRSide: false,
                  probeHeatCaptPitot: false,
                  probeHeatFoPitot: false,
                  probeHeatElevL: false,
                  probeHeatElevR: false,
                  probeHeatTemp: false,
                  probeHeatAlphaL: false,
                  probeHeatAlphaR: false,
                  antiIce1: false,
                  antiIce2: false,
                  wingAntiIceL: false,
                  wingAntiIceR: false,
                  fuelHeat: false,
                  fuelHeat2: false,
                  fuelHeatElapsedSec: 0,
                  fuelHeat2ElapsedSec: 0,
                  wiperL: "PARK",
                  wiperR: "PARK",
                },
                "Ice & rain — all OFF / PARK.",
              );
            }}
          >
            All OFF / PARK
          </button>
        </div>
      </div>
    </div>
  );
}
