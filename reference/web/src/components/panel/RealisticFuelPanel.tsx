/**
 * Realistic 737-200 Fuel panel — layout matched to real overhead photo.
 *
 * Photo geometry (top → bottom):
 *   [ ENG VALVE CLOSED L ] [ FUEL TEMP ] [ ENG VALVE CLOSED R ]
 *   [ FILTER BYPASS L ]  [ VALVE OPEN ]  [ FILTER BYPASS R ]
 *   [ HEAT L ]     [ CROSS FEED knob ]     [ HEAT R ]
 *   [ LOW PRESS L ]  [ LOW PRESS R ]
 *         [ FUEL PUMPS  CTR  OFF/ON ]
 *   [ LOW AFT ] [ LOW FWD ]    [ LOW FWD ] [ LOW AFT ]
 *     [ FUEL PUMPS 1 ]           [ FUEL PUMPS 2 ]
 *        AFT  FWD                  FWD  AFT
 */

import { useSimPick, useDerivedPick } from "@/lib/sim/store";
import { cn } from "@/lib/utils";
import { Cap, OnOffToggle, RotaryKnob, RoundGauge } from "./OverheadParts";

function LowPressLight({ on }: { on: boolean }) {
  return (
    <div
      className={cn(
        "flex h-5 min-w-[52px] items-center justify-center rounded-[2px] border border-[#1a1a18] px-1 font-mono text-[6px] font-bold uppercase tracking-wide",
        on
          ? "bg-amber-400 text-black shadow-[0_0_6px_#fbbf24]"
          : "bg-[#2a2410] text-[#5a5030]",
      )}
    >
      LOW PRESSURE
    </div>
  );
}

function VertToggle({
  label,
  on,
  onToggle,
  lit,
  onLabel = "ON",
  offLabel = "OFF",
  disabled,
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
  lit?: boolean;
  onLabel?: string;
  offLabel?: string;
  disabled?: boolean;
}) {
  return (
    <OnOffToggle label={label} on={on} onToggle={onToggle} lit={lit} litTone="amber" onLabel={onLabel} offLabel={offLabel} disabled={disabled} />
  );
}

/** Cross-feed rotary knob (centre of the real panel) */
function CrossFeedKnob({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <RotaryKnob
      label="CROSS FEED"
      size={84}
      tone="white"
      value={open ? "open" : "closed"}
      onChange={(v) => {
        if ((v === "open") !== open) onToggle();
      }}
      options={[
        { id: "closed", label: "CLOSE", angle: -50 },
        { id: "open", label: "OPEN", angle: 50 },
      ]}
    />
  );
}

export function RealisticFuelPanel() {
  const s = useSimPick("faults", "fuelCrossfeed", "fuelHeat", "fuelHeat2", "fuelHeat2ElapsedSec", "fuelHeatElapsedSec", "fuelPump1Aft", "fuelPump1Fwd", "fuelPump2Aft", "fuelPump2Fwd", "fuelPumpCenter1", "fuelPumpCenter2", "fuelTank1", "fuelTank2", "fuelTankCenter", "fuelTempC", "ltTest", "patch");
  const d = useDerivedPick("dcPower", "fuelCenterPump1LowPressure", "fuelCenterPump1On", "fuelCenterPump2LowPressure", "fuelCenterPump2On", "fuelCenterPumpOn", "fuelFeedSource1", "fuelFeedSource2", "fuelHeatValve2Open", "fuelHeatValveOpen", "fuelPump1AftLowPressure", "fuelPump1AftOn", "fuelPump1FwdLowPressure", "fuelPump1FwdOn", "fuelPump1On", "fuelPump2AftLowPressure", "fuelPump2AftOn", "fuelPump2FwdLowPressure", "fuelPump2FwdOn", "fuelPump2On", "fuelShutoff1Open", "fuelShutoff2Open", "fuelTempIndicationPowered");

  const pump1On = !!d.fuelPump1On;
  const pump2On = !!d.fuelPump2On;
  const ctrPumpOn = !!d.fuelCenterPumpOn;

  const dcOn = !!d.dcPower;
  const lampTest = !!s.ltTest && dcOn;
  // LOW PRESSURE lights need DC bus power to illuminate. Switch selected + no pump
  // pressure only lights the amber when the annunciator bus is live.
  const low1Aft = dcOn && !!d.fuelPump1AftLowPressure;
  const low1Fwd = dcOn && !!d.fuelPump1FwdLowPressure;
  const low2Fwd = dcOn && !!d.fuelPump2FwdLowPressure;
  const low2Aft = dcOn && !!d.fuelPump2AftLowPressure;
  const lowCtrL = dcOn && !!d.fuelCenterPump1LowPressure;
  const lowCtrR = dcOn && !!d.fuelCenterPump2LowPressure;
  // AMM D6-12005 ATA 28-43-0 and WDM 28-42-01: the Tank No.1 fuel-temp
  // gauge is powered from 28V AC bus No.2. With the indication circuit open,
  // the pointer parks off scale at the low end rather than displaying live data.
  const fuelTempC = d.fuelTempIndicationPowered ? s.fuelTempC : -56;

  return (
    <div
      className="relative w-full min-w-0 max-w-full overflow-x-auto overflow-y-hidden rounded-md border-2 border-[#1a1c18] shadow-xl panel-scroll" data-panel-scroll data-keep-cols
      style={{
        background: "linear-gradient(180deg, #3e413b 0%, #32352f 45%, #2a2c28 100%)",
        maxWidth: "min(100%, 420px)",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />

      <div className="relative border-b border-[#1e201c] bg-[#2e312c]/90 px-3 py-1">
        <h2 className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#e0d8c0]">
          FUEL · P5
        </h2>
      </div>

      <div className="relative px-3 py-3">
        {/* ROW 0: engine fuel valves, fuel temperature, filter bypass, cross-feed valve */}
        <div className="grid grid-cols-3 items-center gap-2 pb-3">
          <div className="flex flex-col items-center gap-2">
            <Cap label={"ENG VALVE\nCLOSED"} on={lampTest || (dcOn && !d.fuelShutoff1Open)} tone="blue" />
            <Cap label={"FILTER\nBYPASS"} on={lampTest} tone="caution" />
          </div>
          <div className="flex flex-col items-center gap-2">
            <RoundGauge label="FUEL TEMP" value={fuelTempC} min={-50} max={50} ticks={5} unit="°C" size={72} />
            <span className={`font-mono text-[7px] ${d.fuelTempIndicationPowered ? "text-[#c8c0a8]" : "text-amber-300"}`}>{d.fuelTempIndicationPowered ? `${Math.round(s.fuelTempC)}°C · 28V AC BUS 2` : "OFF SCALE · NO AC"}</span>
            <Cap label={"VALVE\nOPEN"} on={lampTest || (dcOn && s.fuelCrossfeed && !s.faults.fuelCrossfeedValveFail)} tone="blue" />
          </div>
          <div className="flex flex-col items-center gap-2">
            <Cap label={"ENG VALVE\nCLOSED"} on={lampTest || (dcOn && !d.fuelShutoff2Open)} tone="blue" />
            <Cap label={"FILTER\nBYPASS"} on={lampTest} tone="caution" />
          </div>
        </div>

        {/* ROW 1: independent engine fuel-heat systems and crossfeed */}
        <div className="grid grid-cols-3 items-start gap-2">
          <div className="flex flex-col items-center justify-start gap-1">
            <VertToggle label="HEAT 1" on={s.fuelHeat} onToggle={() => s.patch({ fuelHeat: !s.fuelHeat, ...(!s.fuelHeat ? { fuelHeatElapsedSec: 0 } : {}) })} lit={!!d.fuelHeatValveOpen} />
            <span className="text-center font-mono text-[7px] leading-tight text-[#b0a890]">{Math.ceil(Math.max(0, 60 - s.fuelHeatElapsedSec))} SEC REMAIN</span>
          </div>
          <div className="flex justify-center">
            <CrossFeedKnob
              open={s.fuelCrossfeed}
              onToggle={() => s.patch({ fuelCrossfeed: !s.fuelCrossfeed }, !s.fuelCrossfeed ? "FUEL CROSSFEED OPEN" : "FUEL CROSSFEED CLOSED")}
            />
          </div>
          <div className="flex flex-col items-center justify-start gap-1">
            <VertToggle label="HEAT 2" on={s.fuelHeat2} onToggle={() => s.patch({ fuelHeat2: !s.fuelHeat2, ...(!s.fuelHeat2 ? { fuelHeat2ElapsedSec: 0 } : {}) })} lit={!!d.fuelHeatValve2Open} />
            <span className="text-center font-mono text-[7px] leading-tight text-[#b0a890]">{Math.ceil(Math.max(0, 60 - s.fuelHeat2ElapsedSec))} SEC REMAIN</span>
          </div>
        </div>

        {/* ROW 2: Center LOW PRESSURE + CTR pumps */}
        <div className="mt-3 flex flex-col items-center gap-1.5 border-t border-[#1e201c]/70 pt-2">
          <div className="flex gap-3">
            <LowPressLight on={lowCtrL} />
            <LowPressLight on={lowCtrR} />
          </div>
          <div className="font-mono text-[7px] font-bold uppercase tracking-wider text-[#b0a890]">
            FUEL PUMPS · CTR
          </div>
          <div className="flex gap-4">
            <VertToggle
              label="L"
              on={s.fuelPumpCenter1}
              onToggle={() => s.patch({ fuelPumpCenter1: !s.fuelPumpCenter1 })}
              lit={!!d.fuelCenterPump1On}
            />
            <VertToggle
              label="R"
              on={s.fuelPumpCenter2}
              onToggle={() => s.patch({ fuelPumpCenter2: !s.fuelPumpCenter2 })}
              lit={!!d.fuelCenterPump2On}
            />
          </div>
        </div>

        {/* ROW 3: Tank 1 | Tank 2 */}
        <div className="mt-3 grid grid-cols-2 gap-4 border-t border-[#1e201c]/70 pt-2">
          <div className="flex flex-col items-center gap-1">
            <div className="flex gap-2">
              <LowPressLight on={low1Aft} />
              <LowPressLight on={low1Fwd} />
            </div>
            <div className="font-mono text-[7px] font-bold uppercase tracking-wider text-[#b0a890]">
              FUEL PUMPS · 1
            </div>
            <div className="flex gap-3">
              <VertToggle
                label="AFT"
                on={s.fuelPump1Aft}
                onToggle={() => s.patch({ fuelPump1Aft: !s.fuelPump1Aft })}
                lit={!!d.fuelPump1AftOn}
              />
              <VertToggle
                label="FWD"
                on={s.fuelPump1Fwd}
                onToggle={() => s.patch({ fuelPump1Fwd: !s.fuelPump1Fwd })}
                lit={!!d.fuelPump1FwdOn}
              />
            </div>
          </div>

          <div className="flex flex-col items-center gap-1">
            <div className="flex gap-2">
              <LowPressLight on={low2Fwd} />
              <LowPressLight on={low2Aft} />
            </div>
            <div className="font-mono text-[7px] font-bold uppercase tracking-wider text-[#b0a890]">
              FUEL PUMPS · 2
            </div>
            <div className="flex gap-3">
              <VertToggle
                label="FWD"
                on={s.fuelPump2Fwd}
                onToggle={() => s.patch({ fuelPump2Fwd: !s.fuelPump2Fwd })}
                lit={!!d.fuelPump2FwdOn}
              />
              <VertToggle
                label="AFT"
                on={s.fuelPump2Aft}
                onToggle={() => s.patch({ fuelPump2Aft: !s.fuelPump2Aft })}
                lit={!!d.fuelPump2AftOn}
              />
            </div>
          </div>
        </div>

        {/* Status strip */}
        <div className="mt-3 rounded border border-[#1e201c] bg-[#1c1e1a]/80 px-2 py-1.5 font-mono text-[7px] uppercase tracking-wide text-[#a09880]">
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-0.5">
            <span>
              T1 <span className="text-[#c8c0a8]">{Math.round(Number(s.fuelTank1 ?? 0))}%</span>
            </span>
            <span>
              CTR <span className="text-[#c8c0a8]">{Math.round(Number(s.fuelTankCenter ?? 0))}%</span>
            </span>
            <span>
              T2 <span className="text-[#c8c0a8]">{Math.round(Number(s.fuelTank2 ?? 0))}%</span>
            </span>
            <span>
              XFEED{" "}
              <span className={s.fuelCrossfeed ? "text-green-400" : "text-[#5a5548]"}>
                {s.fuelCrossfeed ? "OPEN" : "CLSD"}
              </span>
            </span>
            <span>
              FEED1 <span className="text-[#c8c0a8]">{String(d.fuelFeedSource1 ?? "—")}</span>
            </span>
            <span>
              FEED2 <span className="text-[#c8c0a8]">{String(d.fuelFeedSource2 ?? "—")}</span>
            </span>
          </div>
        </div>
      </div>

      <div className="border-t border-[#1e201c] bg-[#252722]/70 px-2 py-1">
        <p className="font-mono text-[6px] leading-relaxed text-[#7a7568]">
          Layout matched to 737-200 fuel panel photo · HEAT · CROSS FEED · CTR / 1 / 2 pumps · LOW PRESSURE
        </p>
      </div>
    </div>
  );
}
