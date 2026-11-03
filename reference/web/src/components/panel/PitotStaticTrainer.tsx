import { useEffect, useMemo } from "react";
import { useSim, useDerived } from "@/lib/sim/store";
import { cn } from "@/lib/utils";
import { ControlSlider } from "./widgets";
import { computeAirData, type PitotStaticInput, type SideAirData } from "@/lib/sim/pitotStatic";
import { PitotStaticSchematic } from "./PitotStaticDiagram";
import { SixPack } from "./SixPack";

/**
 * ATA 34 Pitot/Static trainer.
 *
 * Layout follows the supplied manual: four combined pitot/static probes are
 * represented as upper-left CAPT, upper-right F/O, lower-right AUX 1 and
 * lower-left AUX 2. CAPT and F/O normal static systems are shown as the
 * cross-connected probe pairs. Alternate static is shown separately for the
 * CAPT and F/O selector valves.
 */

const btn =
  "rounded border border-border bg-inset px-2 py-2 text-[9px] font-display uppercase tracking-wide text-fg hover:bg-panel";
const btnOn =
  "rounded border border-accent bg-panel px-2 py-2 text-[9px] font-display uppercase tracking-wide text-fg";
const btnWarn =
  "rounded border border-warn/50 bg-warn/10 px-2 py-2 text-[9px] font-display uppercase tracking-wide text-fg";

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
        <span className={cn("rounded border px-2 py-0.5 font-mono text-[8px] uppercase", toneCls)}>{state}</span>
      </div>
      {children}
    </div>
  );
}

function Readout({ label, value, unit, bad }: { label: string; value: string; unit: string; bad?: boolean }) {
  return (
    <div className="rounded border border-border bg-[#0b0d10] px-2 py-1.5 text-center">
      <div className="font-display text-[8px] uppercase tracking-[0.14em] text-subtle">{label}</div>
      <div className={cn("font-mono text-[15px] leading-tight", bad ? "text-warn" : "text-ok")}>{value}</div>
      <div className="font-mono text-[8px] text-subtle">{unit}</div>
    </div>
  );
}

function SidePanel({ title, a, baro }: { title: string; a: SideAirData; baro: number }) {
  const hardFault = a.flags.some((f) => f === "PITOT BLOCKED" || f === "PITOT ICE" || f === "STATIC BLOCKED" || f === "COVER");
  return (
    <div className="rounded-lg border border-border bg-panel p-2">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="font-display text-[10px] uppercase tracking-[0.14em] text-muted">{title}</span>
        <span className={cn("font-mono text-[8px] uppercase", hardFault ? "text-warn" : "text-ok")}>{hardFault ? "FAULT" : "NORMAL"}</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <Readout label="IAS" value={a.iasKt.toFixed(0)} unit="KT" bad={!a.pitotOk} />
        <Readout label="ALT" value={Math.round(a.altFt).toLocaleString()} unit={`FT · ${baro.toFixed(0)} HPA`} bad={!a.staticOk} />
        <Readout label="VSI" value={`${Math.round(a.vsiFpm)}`} unit="FPM" bad={!a.staticOk} />
      </div>
      {a.flags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {a.flags.map((f) => (
            <span
              key={f}
              className={cn(
                "rounded border px-1.5 py-0.5 font-mono text-[8px] uppercase",
                f === "ALT STATIC" || f === "ONE PORT BLOCKED" ? "border-caution/40 text-caution" : "border-warn/40 text-warn",
              )}
            >
              {f}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function PitotStaticTrainer() {
  const s = useSim();
  const d = useDerived();
  useEffect(() => {
    const store = useSim.getState();
    store.patch({ psTrainerEnabled: true }, "PITOT/STATIC TRAINER ENABLED");
    return () => useSim.getState().patch({ psTrainerEnabled: false }, "PITOT/STATIC TRAINER DISABLED");
  }, []);
  const dc = d.dcPower;
  const air = useMemo(() => computeAirData(s, dc, d.acPower), [s, dc, d.acPower]);

  const zero = (a: SideAirData): SideAirData => ({ ...a, iasKt: 0, altFt: 0, vsiFpm: 0 });
  const captShown = dc ? air.capt : zero(air.capt);
  const foShown = dc ? air.fo : zero(air.fo);

  const captOne = s.psStaticCaptL !== s.psStaticCaptR;
  const foOne = s.psStaticFoL !== s.psStaticFoR;
  const anyFault =
    [air.capt, air.fo].some((a) => !a.pitotOk || !a.staticOk) ||
    !air.aux1PitotOk ||
    !air.aux2PitotOk ||
    !air.elevPitotLOk ||
    !air.elevPitotROk;

  type BoolKey =
    | "psPitotCaptCover" | "psPitotFoCover" | "psPitotAux1Cover" | "psPitotAux2Cover"
    | "psPitotCaptBlocked" | "psPitotFoBlocked" | "psPitotAux1Blocked" | "psPitotAux2Blocked"
    | "psElevPitotLBlocked" | "psElevPitotRBlocked" | "psAltStaticCapt" | "psAltStaticFo" | "psIcing"
    | "psStaticCaptLeak" | "psStaticFoLeak" | "psAux1StaticLeak" | "psAux2StaticLeak"
    | "psAltStaticCaptLeak" | "psAltStaticFoLeak" | "psStaticSelectorCaptLeak" | "psStaticSelectorFoLeak" | "psPitotCaptLeak" | "psPitotFoLeak"
    | "psAux1PitotLeak" | "psAux2PitotLeak" | "psTestPressureSource" | "psTestVacuumSource"
    | "psMachWarningTest" | "psAirspeedWarningInhibit" | "psPitotStaticA" | "psPitotStaticB" | "psCbCaptUpperL" | "psCbCaptLowerL" | "psCbFoUpperR" | "psCbFoLowerR" | "psCbElevL" | "psCbElevR" | "psCbTempL" | "psCbTempR" | "psCbTemp" | "psCadc1Cb" | "psCadc2Cb" | "psCadc1Ac115" | "psCadc1Ac26" | "psCadc2Ac115" | "psCadc2Ac26" | "psStandbyPitotLeak" | "psStandbyStaticLeak";

  const flip = (k: BoolKey, label: string) =>
    s.patch({ [k]: !s[k] } as never, `${label} → ${!s[k] ? "ON" : "OFF"}`);

  const cycleCadcTest = (channel: 1 | 2) => {
    const key = channel === 1 ? "psCadc1Test" : "psCadc2Test";
    const current = s[key];
    const next = current === "OFF" ? "FUNCTION" : current === "FUNCTION" ? "SLEW" : current === "SLEW" ? "FAIL" : "OFF";
    s.patch({ [key]: next }, `CADC ${channel} TEST → ${next}`);
  };

  const togglePort = (k: "psStaticCaptL" | "psStaticCaptR" | "psStaticFoL" | "psStaticFoR", label: string) => {
    const next = !s[k];
    const patch: Record<string, unknown> = { [k]: next };
    const capt = k.startsWith("psStaticCapt");
    const other = capt
      ? k === "psStaticCaptL" ? s.psStaticCaptR : s.psStaticCaptL
      : k === "psStaticFoL" ? s.psStaticFoR : s.psStaticFoL;
    if (next && other) patch[capt ? "psStaticCaptFrozenAltFt" : "psStaticFoFrozenAltFt"] = s.psFlightAltFt;
    s.patch(patch as never, `${label} → ${next ? "BLOCKED" : "CLEAR"}`);
  };

  const clearFaults = () =>
    s.patch(
      {
        psPitotCaptCover: false,
        psPitotFoCover: false,
        psPitotAux1Cover: false,
        psPitotAux2Cover: false,
        psPitotCaptBlocked: false,
        psPitotFoBlocked: false,
        psPitotAux1Blocked: false,
        psPitotAux2Blocked: false,
        psElevPitotLBlocked: false,
        psElevPitotRBlocked: false,
        psStaticCaptL: false,
        psStaticCaptR: false,
        psStaticFoL: false,
        psStaticFoR: false,
        psAltStaticCapt: false,
        psAltStaticFo: false,
        psStaticCaptLeak: false, psStaticFoLeak: false,
        psAux1StaticLeak: false, psAux2StaticLeak: false,
        psAltStaticCaptLeak: false, psAltStaticFoLeak: false, psStaticSelectorCaptLeak: false, psStaticSelectorFoLeak: false,
        psPitotCaptLeak: false, psPitotFoLeak: false,
        psAux1PitotLeak: false, psAux2PitotLeak: false,
        psTestPressureSource: false, psTestVacuumSource: false, psTestTarget: "ALL",
        psPitotStaticA: false, psPitotStaticB: false,
        psCbCaptUpperL: true, psCbCaptLowerL: true, psCbFoUpperR: true, psCbFoLowerR: true, psCbElevL: true, psCbElevR: true, psCbTempL: true, psCbTempR: true, psCbTemp: true, psCadc1Cb: true, psCadc2Cb: true, psCadc1Ac115: true, psCadc1Ac26: true, psCadc2Ac115: true, psCadc2Ac26: true,
        psStandbyPitotLeak: false, psStandbyStaticLeak: false,
        psMachWarningTest: false, psAirspeedWarningInhibit: false, psTestClockSec: 0,
        psIcing: false,
      },
      "PITOT/STATIC faults cleared",
    );

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-panel p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-display text-[10px] uppercase tracking-[0.18em] text-subtle">ATA 34 · Pitot / Static / Air Data</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              Four combined pitot/static probes are represented in their manual-defined positions. The CAPT and F/O normal
              static systems are cross-connected; the two station-406 alternate static ports feed the corresponding selector valves.
            </p>
          </div>
          <span className={cn("rounded border px-2 py-1 font-mono text-[8px]", dc ? "border-ok/30 text-ok" : "border-caution/40 text-caution")}>
            TRAINER DC · {dc ? "AVAILABLE" : "OFF"}
          </span>
        </div>
      </div>

      <Card title="Flight condition" state={air.coverOnInMotion ? "COVER ON — REMOVE" : anyFault ? "AIR DATA FAULT" : "NORMAL"} tone={air.coverOnInMotion || anyFault ? "warn" : "ok"}>
        <div className="grid grid-cols-2 gap-2">
          <ControlSlider
            label={`Target altitude (ft) · now ${Math.round(s.psFlightAltFt).toLocaleString()}`}
            value={s.psFlightTargetAltFt ?? s.psFlightAltFt}
            min={0}
            max={41000}
            step={500}
            onChange={(v) => s.patch({ psFlightTargetAltFt: v, psFlightProgressive: true })}
          />
          <ControlSlider
            label={`Target CAS (kt) · now ${Math.round(s.psFlightCasKt)}`}
            value={s.psFlightTargetCasKt ?? s.psFlightCasKt}
            min={0}
            max={350}
            step={5}
            onChange={(v) => s.patch({ psFlightTargetCasKt: v, psFlightProgressive: true })}
          />
          <ControlSlider label="Vertical speed (fpm)" value={s.psFlightVsFpm} min={-3000} max={3000} step={100} onChange={(v) => s.patch({ psFlightVsFpm: v })} />
          <ControlSlider label="CAPT baro (hPa)" value={s.psBaroCaptHpa} min={950} max={1050} step={0.5} onChange={(v) => s.patch({ psBaroCaptHpa: v })} />
          <ControlSlider label="F/O baro (hPa)" value={s.psBaroFoHpa} min={950} max={1050} step={0.5} onChange={(v) => s.patch({ psBaroFoHpa: v })} />
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <button
            className={btn}
            onClick={() =>
              s.patch(
                { psFlightTargetAltFt: 0, psFlightTargetCasKt: 0, psFlightAltFt: 0, psFlightCasKt: 0, psFlightVsFpm: 0, psFlightProgressive: true },
                "PITOT/STATIC CONDITION → GROUND",
              )
            }
          >
            Ground
          </button>
          <button
            className={btn}
            onClick={() =>
              s.patch(
                { psFlightTargetAltFt: 10000, psFlightTargetCasKt: 180, psFlightVsFpm: 0, psFlightProgressive: true },
                "PITOT/STATIC CONDITION → CRUISE TEST",
              )
            }
          >
            Cruise test
          </button>
          <button
            className={btn}
            onClick={() =>
              s.patch(
                { psFlightTargetAltFt: 10000, psFlightTargetCasKt: 180, psFlightVsFpm: 1500, psFlightProgressive: true },
                "PITOT/STATIC CONDITION → CLIMB TEST (progressive)",
              )
            }
          >
            Climb test
          </button>
        </div>
        <p className="mt-2 text-[9px] leading-relaxed text-subtle">
          Progressive profile: altitude climbs/descends at the selected VSI toward the target altitude. CAS transitions at ~3 kt/s. When the target altitude is reached the VSI automatically levels off.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button className={s.psIcing ? btnWarn : btn} onClick={() => flip("psIcing", "PITOT/STATIC ICING CONDITION")}>Icing conditions · {s.psIcing ? "ON" : "OFF"}</button>
          <button className={btn} onClick={clearFaults}>Clear all faults</button>
        </div>
        <div className="mt-2 font-mono text-[8px] uppercase tracking-wider text-subtle">Quick fault scenarios (set a flight condition first)</div>
        <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button className={btn} onClick={() => s.patch({ psPitotCaptBlocked: true }, "SCENARIO — CAPT pitot blocked")}>CAPT pitot blocked</button>
          <button
            className={btn}
            onClick={() =>
              s.patch(
                { psStaticFoL: true, psStaticFoR: true, psStaticFoFrozenAltFt: s.psFlightAltFt },
                "SCENARIO — F/O static trapped at current altitude",
              )
            }
          >
            F/O static trapped
          </button>
          <button className={btn} onClick={() => s.patch({ psAltStaticCapt: true }, "SCENARIO — CAPT static on ALTERNATE")}>CAPT alt static</button>
          <button
            className={btnWarn}
            onClick={() =>
              s.patch(
                { psPitotCaptCover: true, psPitotFoCover: true, psPitotAux1Cover: true, psPitotAux2Cover: true, psFlightCasKt: 80 },
                "SCENARIO — probe covers left on, takeoff roll",
              )
            }
          >
            Covers on · 80 kt
          </button>
        </div>
      </Card>

      <Card title="Probe → instrument plumbing" state={anyFault ? "AIR DATA FAULT" : "4 COMBINED PROBES"} tone={anyFault ? "warn" : "ok"}>
        <PitotStaticSchematic air={air} s={s as unknown as PitotStaticInput} dc={dc} captData={captShown} foData={foShown} />
        <p className="mt-2 text-[9px] leading-relaxed text-subtle">
          Pitot (green) runs from the CAPT upper-left and F/O upper-right probes to their airspeed indicators. Static (blue)
          is cross-connected: CAPT = upper-left + lower-right, F/O = upper-right + lower-left, each through its source selector
          to the airspeed indicator, altimeter and VSI. Block a probe, ice a pitot, trap a static line or select ALTERNATE and
          the line colour and the instrument at its end change. Orange halo = P5-9 heat on; red RBF tag = cover fitted.
          AUX and elevator pitots show health only; the manual excerpt does not define their downstream users.
        </p>
      </Card>

      <div className="grid gap-2 md:grid-cols-2">
        <SidePanel title="Captain air data" a={air.capt} baro={s.psBaroCaptHpa} />
        <SidePanel title="First officer air data" a={air.fo} baro={s.psBaroFoHpa} />
      </div>

      {air.disagree && (
        <div className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 font-mono text-[9px] uppercase text-warn">
          CAPT / F/O air-data disagreement — inspect pitot/static source paths.
        </div>
      )}

      <Card title="Primary flight instruments · six-pack" state={dc ? "POWERED" : "NO DC"} tone={dc ? "ok" : "caution"}>
        <SixPack hideNote />
        <p className="mt-2 text-[9px] leading-relaxed text-subtle">
          Airspeed, altimeter and vertical speed on each side read the same air-data line shown in the plumbing diagram above:
          fail the CAPT pitot and only the CAPT airspeed indicator goes to a FLAG; trap the F/O static line and the F/O altimeter
          freezes and its VSI goes to zero. Attitude, turn/slip and heading respond to the flight-control inputs.
        </p>
      </Card>

      <Card title="P5-9 probe heating relationship" state={dc ? "POWER AVAILABLE" : "NO DC"} tone={dc ? "ok" : "caution"}>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded border border-border bg-panel p-2">
            <div className="font-display text-[9px] uppercase text-muted">LEFT P5-9 GROUP</div>
            <div className="mt-1 grid grid-cols-2 gap-1 text-[8px] font-mono text-subtle">
              <span className={air.capt.probe.heaterOn ? "text-ok" : "text-warn"}>UPPER LEFT / CAPT</span>
              <span className={air.capt.probe.heaterOn ? "text-ok" : "text-warn"}>LOWER LEFT / AUX 2</span>
            </div>
          </div>
          <div className="rounded border border-border bg-panel p-2">
            <div className="font-display text-[9px] uppercase text-muted">RIGHT P5-9 GROUP</div>
            <div className="mt-1 grid grid-cols-2 gap-1 text-[8px] font-mono text-subtle">
              <span className={air.fo.probe.heaterOn ? "text-ok" : "text-warn"}>UPPER RIGHT / F/O</span>
              <span className={air.fo.probe.heaterOn ? "text-ok" : "text-warn"}>LOWER RIGHT / AUX 1</span>
            </div>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button className={s.psPitotStaticA ? btnOn : btn} onClick={() => flip("psPitotStaticA", "P5-9 PITOT-STATIC A")}>PITOT-STATIC A · {s.psPitotStaticA ? "ON" : "OFF"}</button>
          <button className={s.psPitotStaticB ? btnOn : btn} onClick={() => flip("psPitotStaticB", "P5-9 PITOT-STATIC B")}>PITOT-STATIC B · {s.psPitotStaticB ? "ON" : "OFF"}</button>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button className={s.psCbCaptUpperL ? btnOn : btnWarn} onClick={() => flip("psCbCaptUpperL", "P18 CAPT UPPER-L HEATER CB")}>CAPT UPPER-L CB · {s.psCbCaptUpperL ? "CLOSED" : "OPEN"}</button>
          <button className={s.psCbFoUpperR ? btnOn : btnWarn} onClick={() => flip("psCbFoUpperR", "P18 F/O UPPER-R HEATER CB")}>F/O UPPER-R CB · {s.psCbFoUpperR ? "CLOSED" : "OPEN"}</button>
          <button className={s.psCbCaptLowerL ? btnOn : btnWarn} onClick={() => flip("psCbCaptLowerL", "P18 CAPT LOWER-L HEATER CB")}>CAPT LOWER-L CB · {s.psCbCaptLowerL ? "CLOSED" : "OPEN"}</button>
          <button className={s.psCbFoLowerR ? btnOn : btnWarn} onClick={() => flip("psCbFoLowerR", "P18 F/O LOWER-R HEATER CB")}>F/O LOWER-R CB · {s.psCbFoLowerR ? "CLOSED" : "OPEN"}</button>
          <button className={s.psCbElevL ? btnOn : btnWarn} onClick={() => flip("psCbElevL", "P18 ELEVATOR PITOT L HEATER CB")}>ELEV L CB · {s.psCbElevL ? "CLOSED" : "OPEN"}</button>
          <button className={s.psCbElevR ? btnOn : btnWarn} onClick={() => flip("psCbElevR", "P18 ELEVATOR PITOT R HEATER CB")}>ELEV R CB · {s.psCbElevR ? "CLOSED" : "OPEN"}</button>
          <button className={s.psCbTempL ? btnOn : btnWarn} onClick={() => flip("psCbTempL", "P18 TEMP PROBE L HEATER CB")}>TEMP L CB · {s.psCbTempL ? "CLOSED" : "OPEN"}</button>
          <button className={s.psCbTempR ? btnOn : btnWarn} onClick={() => flip("psCbTempR", "P18 TEMP PROBE R HEATER CB")}>TEMP R CB · {s.psCbTempR ? "CLOSED" : "OPEN"}</button>
          <button className={s.psCadc1Cb ? btnOn : btnWarn} onClick={() => flip("psCadc1Cb", "P18 CADC NO.1 CB")}>CADC 1 CB · {s.psCadc1Cb ? "CLOSED" : "OPEN"}</button>
          <button className={s.psCadc2Cb ? btnOn : btnWarn} onClick={() => flip("psCadc2Cb", "P18 CADC NO.2 CB")}>CADC 2 CB · {s.psCadc2Cb ? "CLOSED" : "OPEN"}</button>
          <button className={s.psCadc1Ac115 ? btnOn : btnWarn} onClick={() => flip("psCadc1Ac115", "CADC 1 115-V AC")}>CADC 1 115V · {s.psCadc1Ac115 ? "OK" : "FAIL"}</button>
          <button className={s.psCadc1Ac26 ? btnOn : btnWarn} onClick={() => flip("psCadc1Ac26", "CADC 1 26-V AC")}>CADC 1 26V · {s.psCadc1Ac26 ? "OK" : "FAIL"}</button>
          <button className={s.psCadc2Ac115 ? btnOn : btnWarn} onClick={() => flip("psCadc2Ac115", "CADC 2 115-V AC")}>CADC 2 115V · {s.psCadc2Ac115 ? "OK" : "FAIL"}</button>
          <button className={s.psCadc2Ac26 ? btnOn : btnWarn} onClick={() => flip("psCadc2Ac26", "CADC 2 26-V AC")}>CADC 2 26V · {s.psCadc2Ac26 ? "OK" : "FAIL"}</button>
          <button className={s.psCadc1Test === "OFF" ? btn : s.psCadc1Test === "FAIL" ? btnWarn : btnOn} onClick={() => cycleCadcTest(1)}>CADC 1 TEST · {s.psCadc1Test}</button>
          <button className={s.psCadc2Test === "OFF" ? btn : s.psCadc2Test === "FAIL" ? btnWarn : btnOn} onClick={() => cycleCadcTest(2)}>CADC 2 TEST · {s.psCadc2Test}</button>
          <button className={s.psCbTemp ? btnOn : btnWarn} onClick={() => flip("psCbTemp", "LEGACY TEMP PROBE CB")}>TEMP MASTER CB · {s.psCbTemp ? "CLOSED" : "OPEN"}</button>
        </div>
        <p className="mt-2 text-[9px] leading-relaxed text-subtle">
          CADC test cycles OFF → FUNCTION → SLEW → FAIL. FUNCTION uses fixed air-data values, SLEW commands a 600-fpm test rate, and FAIL asserts the CADC failure path. Each CADC requires its P18 CB plus both 115-V AC and 26-V AC inputs to remain valid.
        </p>
        <p className="mt-2 text-[9px] leading-relaxed text-subtle">
          ATA 30-31 specifies 115-V AC probe heaters and separate indication circuits. Heater operation requires the applicable 115-V AC supply and its individual P18 circuit breaker. The separate 28-V DC side is treated as indication/control power.
        </p>
      </Card>

      <Card title="Ground covers & probe faults" state="MAINTENANCE / FAULT INJECTION" tone="caution">
        <div className="grid grid-cols-2 gap-2">
          <button className={s.psPitotCaptCover ? btnOn : btn} onClick={() => flip("psPitotCaptCover", "CAPT UPPER-LEFT PROBE COVER")}>CAPT UL cover · {s.psPitotCaptCover ? "ON" : "OFF"}</button>
          <button className={s.psPitotFoCover ? btnOn : btn} onClick={() => flip("psPitotFoCover", "F/O UPPER-RIGHT PROBE COVER")}>F/O UR cover · {s.psPitotFoCover ? "ON" : "OFF"}</button>
          <button className={s.psPitotAux1Cover ? btnOn : btn} onClick={() => flip("psPitotAux1Cover", "AUX 1 LOWER-RIGHT PROBE COVER")}>AUX 1 LR cover · {s.psPitotAux1Cover ? "ON" : "OFF"}</button>
          <button className={s.psPitotAux2Cover ? btnOn : btn} onClick={() => flip("psPitotAux2Cover", "AUX 2 LOWER-LEFT PROBE COVER")}>AUX 2 LL cover · {s.psPitotAux2Cover ? "ON" : "OFF"}</button>
          <button className={s.psPitotCaptBlocked ? btnWarn : btn} onClick={() => flip("psPitotCaptBlocked", "CAPT UPPER-LEFT PITOT")}>CAPT UL pitot · {s.psPitotCaptBlocked ? "BLOCKED" : "CLEAR"}</button>
          <button className={s.psPitotFoBlocked ? btnWarn : btn} onClick={() => flip("psPitotFoBlocked", "F/O UPPER-RIGHT PITOT")}>F/O UR pitot · {s.psPitotFoBlocked ? "BLOCKED" : "CLEAR"}</button>
          <button className={s.psPitotAux1Blocked ? btnWarn : btn} onClick={() => flip("psPitotAux1Blocked", "AUX 1 LOWER-RIGHT PITOT")}>AUX 1 LR pitot · {s.psPitotAux1Blocked ? "BLOCKED" : "CLEAR"}</button>
          <button className={s.psPitotAux2Blocked ? btnWarn : btn} onClick={() => flip("psPitotAux2Blocked", "AUX 2 LOWER-LEFT PITOT")}>AUX 2 LL pitot · {s.psPitotAux2Blocked ? "BLOCKED" : "CLEAR"}</button>
          <button className={s.psElevPitotLBlocked ? btnWarn : btn} onClick={() => flip("psElevPitotLBlocked", "ELEVATOR PITOT L")}>Elevator pitot L · {s.psElevPitotLBlocked ? "BLOCKED" : "CLEAR"}</button>
          <button className={s.psElevPitotRBlocked ? btnWarn : btn} onClick={() => flip("psElevPitotRBlocked", "ELEVATOR PITOT R")}>Elevator pitot R · {s.psElevPitotRBlocked ? "BLOCKED" : "CLEAR"}</button>
        </div>
      </Card>

      <Card title="Normal static sources" state={captOne || foOne ? "ONE PORT BLOCKED" : "NORMAL"} tone={captOne || foOne ? "caution" : "ok"}>
        <div className="grid grid-cols-2 gap-2">
          <button className={s.psStaticCaptL ? btnWarn : btn} onClick={() => togglePort("psStaticCaptL", "CAPT STATIC · UPPER LEFT")}>CAPT UL static · {s.psStaticCaptL ? "BLOCKED" : "CLEAR"}</button>
          <button className={s.psStaticCaptR ? btnWarn : btn} onClick={() => togglePort("psStaticCaptR", "CAPT STATIC · LOWER RIGHT")}>CAPT LR static · {s.psStaticCaptR ? "BLOCKED" : "CLEAR"}</button>
          <button className={s.psStaticFoL ? btnWarn : btn} onClick={() => togglePort("psStaticFoL", "F/O STATIC · LOWER LEFT")}>F/O LL static · {s.psStaticFoL ? "BLOCKED" : "CLEAR"}</button>
          <button className={s.psStaticFoR ? btnWarn : btn} onClick={() => togglePort("psStaticFoR", "F/O STATIC · UPPER RIGHT")}>F/O UR static · {s.psStaticFoR ? "BLOCKED" : "CLEAR"}</button>
        </div>
        <p className="mt-2 text-[9px] leading-relaxed text-subtle">
          The manual describes the static ports as cross-connected to the opposite side. For this trainer, blocking one normal
          source leaves the other connected source available; blocking both traps the static line at the altitude when the second source was blocked.
        </p>
      </Card>

      <Card title="Alternate static source selectors" state={s.psAltStaticCapt || s.psAltStaticFo ? "ALTERNATE SELECTED" : "NORMAL SOURCE"} tone={s.psAltStaticCapt || s.psAltStaticFo ? "caution" : "ok"}>
        <div className="grid grid-cols-2 gap-2">
          <button className={s.psAltStaticCapt ? btnOn : btn} onClick={() => flip("psAltStaticCapt", "CAPT STATIC SOURCE SELECTOR")}>CAPT selector · {s.psAltStaticCapt ? "ALTERNATE" : "NORMAL"}</button>
          <button className={s.psAltStaticFo ? btnOn : btn} onClick={() => flip("psAltStaticFo", "F/O STATIC SOURCE SELECTOR")}>F/O selector · {s.psAltStaticFo ? "ALTERNATE" : "NORMAL"}</button>
        </div>
        <p className="mt-2 text-[9px] leading-relaxed text-subtle">
          ALTERNATE selects the corresponding station-406 alternate static source. The supplied manual excerpt does not specify a numeric
          position-error value, so none is artificially added here.
        </p>
      </Card>

      <Card title="Maintenance test network" state={s.psTestPressureSource || s.psTestVacuumSource ? "TEST SOURCE CONNECTED" : "NORMAL"} tone={s.psTestPressureSource || s.psTestVacuumSource ? "caution" : "ok"}>
        <div className="grid grid-cols-2 gap-2">
          <button className={s.psTestPressureSource ? btnOn : btn} onClick={() => s.patch({ psTestPressureSource: !s.psTestPressureSource, psTestVacuumSource: false, psTestClockSec: 0 }, `PITOT TEST PRESSURE SOURCE → ${!s.psTestPressureSource ? "CONNECTED" : "DISCONNECTED"}`)}>Pitot pressure test · {s.psTestPressureSource ? "CONNECTED" : "OFF"}</button>
          <button className={s.psTestVacuumSource ? btnOn : btn} onClick={() => s.patch({ psTestVacuumSource: !s.psTestVacuumSource, psTestPressureSource: false, psTestClockSec: 0 }, `STATIC VACUUM TEST SOURCE → ${!s.psTestVacuumSource ? "CONNECTED" : "DISCONNECTED"}`)}>Static vacuum test · {s.psTestVacuumSource ? "CONNECTED" : "OFF"}</button>
          <button className={s.psMachWarningTest ? btnWarn : btn} onClick={() => flip("psMachWarningTest", "MACH/AIRSPEED WARNING TEST")}>Mach warning test · {s.psMachWarningTest ? "TEST" : "NORMAL"}</button>
          <button className={s.psAirspeedWarningInhibit ? btnWarn : btn} onClick={() => flip("psAirspeedWarningInhibit", "AIRSPEED WARNING INHIBIT")}>Warning inhibit · {s.psAirspeedWarningInhibit ? "INHIBIT" : "NORMAL"}</button>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button className={s.psPitotCaptLeak ? btnWarn : btn} onClick={() => flip("psPitotCaptLeak", "CAPT PITOT LEAK")}>CAPT pitot leak · {s.psPitotCaptLeak ? "ON" : "OFF"}</button>
          <button className={s.psPitotFoLeak ? btnWarn : btn} onClick={() => flip("psPitotFoLeak", "F/O PITOT LEAK")}>F/O pitot leak · {s.psPitotFoLeak ? "ON" : "OFF"}</button>
          <button className={s.psStaticCaptLeak ? btnWarn : btn} onClick={() => flip("psStaticCaptLeak", "CAPT STATIC LEAK")}>CAPT static leak · {s.psStaticCaptLeak ? "ON" : "OFF"}</button>
          <button className={s.psStaticFoLeak ? btnWarn : btn} onClick={() => flip("psStaticFoLeak", "F/O STATIC LEAK")}>F/O static leak · {s.psStaticFoLeak ? "ON" : "OFF"}</button>
          <button className={s.psAltStaticCaptLeak ? btnWarn : btn} onClick={() => flip("psAltStaticCaptLeak", "CAPT ALTERNATE STATIC LEAK")}>CAPT alt-static leak · {s.psAltStaticCaptLeak ? "ON" : "OFF"}</button>
          <button className={s.psAltStaticFoLeak ? btnWarn : btn} onClick={() => flip("psAltStaticFoLeak", "F/O ALTERNATE STATIC LEAK")}>F/O alt-static leak · {s.psAltStaticFoLeak ? "ON" : "OFF"}</button>
          <button className={s.psStaticSelectorCaptLeak ? btnWarn : btn} onClick={() => flip("psStaticSelectorCaptLeak", "CAPT STATIC SELECTOR VALVE LEAK")}>CAPT selector leak · {s.psStaticSelectorCaptLeak ? "ON" : "OFF"}</button>
          <button className={s.psStaticSelectorFoLeak ? btnWarn : btn} onClick={() => flip("psStaticSelectorFoLeak", "F/O STATIC SELECTOR VALVE LEAK")}>F/O selector leak · {s.psStaticSelectorFoLeak ? "ON" : "OFF"}</button>
          <button className={s.psAux1PitotLeak ? btnWarn : btn} onClick={() => flip("psAux1PitotLeak", "AUX 1 PITOT LEAK")}>AUX 1 pitot leak · {s.psAux1PitotLeak ? "ON" : "OFF"}</button>
          <button className={s.psAux2PitotLeak ? btnWarn : btn} onClick={() => flip("psAux2PitotLeak", "AUX 2 PITOT LEAK")}>AUX 2 pitot leak · {s.psAux2PitotLeak ? "ON" : "OFF"}</button>
          <button className={s.psAux1StaticLeak ? btnWarn : btn} onClick={() => flip("psAux1StaticLeak", "AUX 1 STATIC LEAK")}>AUX 1 static leak · {s.psAux1StaticLeak ? "ON" : "OFF"}</button>
          <button className={s.psAux2StaticLeak ? btnWarn : btn} onClick={() => flip("psAux2StaticLeak", "AUX 2 STATIC LEAK")}>AUX 2 static leak · {s.psAux2StaticLeak ? "ON" : "OFF"}</button>
          <button className={s.psStandbyPitotLeak ? btnWarn : btn} onClick={() => flip("psStandbyPitotLeak", "STANDBY PITOT LEAK")}>Standby pitot leak · {s.psStandbyPitotLeak ? "ON" : "OFF"}</button>
          <button className={s.psStandbyStaticLeak ? btnWarn : btn} onClick={() => flip("psStandbyStaticLeak", "STANDBY STATIC LEAK")}>Standby static leak · {s.psStandbyStaticLeak ? "ON" : "OFF"}</button>
        </div>
        <p className="mt-2 text-[9px] leading-relaxed text-subtle">
          Test pressure is modeled at 300 kt equivalent pitot pressure; static vacuum is modeled at 22,500 ft equivalent altitude.
          The maintenance clock advances only while the trainer is enabled.
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <button className={btn} onClick={clearFaults}>Clear all Pitot/Static faults</button>
        <button
          className={btnWarn}
          onClick={() => s.patch({ psIcing: true, probeHeatCaptPitot: false, probeHeatFoPitot: false, probeHeatElevL: false, probeHeatElevR: false }, "PITOT/STATIC ICE CONDITION — P5-9 HEAT OFF")}
        >
          Icing · P5-9 heat OFF
        </button>
      </div>
    </div>
  );
}
