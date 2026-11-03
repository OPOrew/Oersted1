/**
 * Realistic 737-200 Electrical panel — fixed layout (not free-wrap).
 *
 * Typical P5 electrical arrangement:
 *   [ GEN OFF BUS lights · GRD PWR AVAIL · BAT DISCHARGE ]
 *   [ BATTERY ]  [ GRD PWR ]  [ STANDBY POWER ]
 *   [ GEN 1 ]    [ APU GEN ]  [ GEN 2 ]
 *   [ BUS TIE ]
 *   Transfer bus / TR status
 */

import { useSimPick, useDerivedPick } from "@/lib/sim/store";
import { cn } from "@/lib/utils";
import { RealisticElecMeters } from "./RealisticElecMeters";
import { OnOffToggle, RotaryKnob, ToggleLever } from "./OverheadParts";

function CapLight({
  label,
  on,
  tone = "elec",
}: {
  label: string;
  on: boolean;
  tone?: "caution" | "ok" | "warn" | "elec";
}) {
  const colors = {
    caution: on ? "bg-amber-400 text-black shadow-[0_0_6px_#fbbf24]" : "bg-[#2a2410] text-[#5a5030]",
    ok: on ? "bg-green-400 text-black shadow-[0_0_6px_#4ade80]" : "bg-[#0f2a14] text-[#2a5a30]",
    warn: on ? "bg-red-500 text-white shadow-[0_0_6px_#ef4444]" : "bg-[#2a1010] text-[#5a2020]",
    elec: on ? "bg-blue-400 text-black shadow-[0_0_6px_#60a5fa]" : "bg-[#0f1a2a] text-[#2a3a5a]",
  };
  return (
    <div
      className={cn(
        "min-w-[56px] rounded-[2px] border border-[#1a1a18] px-1 py-0.5 text-center font-mono text-[6px] font-bold uppercase leading-tight tracking-wide",
        colors[tone],
      )}
    >
      {label}
    </div>
  );
}

function VertRocker({
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
    <OnOffToggle label={label} on={on} onToggle={onToggle} lit={lit} litTone="green" onLabel={onLabel} offLabel={offLabel} disabled={disabled} />
  );
}

/** 3-position selector: a toggle lever for up to 3 positions, a rotary knob for more. */
function ThreePos({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (id: string) => void;
}) {
  if (options.length > 3) {
    return <RotaryKnob label={label} options={options} value={value} onChange={onChange} size={84} tone="black" />;
  }
  return <ToggleLever label={label} options={options} value={value} onChange={onChange} />;
}

export function RealisticElecPanel() {
  const s = useSimPick("apuGen", "battery", "busTie", "externalPowerConnected", "gen1", "gen2", "groundPowerOn", "groundServiceOn", "patch", "standbyPower");
  const d = useDerivedPick("acPower", "apuAvailable", "apuGenOffBus", "batteryPower", "dcPower", "electricalSource1", "eng1Running", "eng2Running", "gen1OffBus", "gen2OffBus", "groundPowerAvailable", "tr1Powered", "tr2Powered", "tr3Powered", "transferBus1Powered", "transferBus2Powered");
  // Annunciators need at least battery/essential DC to illuminate.
  const annBus = !!d.dcPower || !!d.batteryPower;
  const gpuConnected = !!(d.groundPowerAvailable ?? s.externalPowerConnected);

  return (
    <div
      className="relative w-full min-w-0 max-w-full overflow-x-auto overflow-y-hidden rounded-md border-2 border-[#1a1c18] shadow-xl panel-scroll" data-panel-scroll data-keep-cols
      style={{
        background: "linear-gradient(180deg, #3e413b 0%, #32352f 45%, #2a2c28 100%)",
        maxWidth: "min(100%, 440px)",
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
          ELECTRICAL · P5
        </h2>
      </div>

      <div className="relative px-3 py-3">
        {/* Caption lights row */}
        <div className="mb-3 flex flex-wrap justify-center gap-1.5">
          <CapLight label="BAT DISCHARGE" on={annBus && !!d.batteryPower && !d.acPower} tone="caution" />
          <CapLight label="GEN 1 OFF BUS" on={annBus && !!d.gen1OffBus} tone="caution" />
          <CapLight label="GEN 2 OFF BUS" on={annBus && !!d.gen2OffBus} tone="caution" />
          <CapLight label="APU GEN OFF BUS" on={annBus && !!d.apuGenOffBus} tone="caution" />
          <CapLight label="GRD PWR AVAIL" on={annBus && gpuConnected} tone="elec" />
        </div>

        {/* Row 1: BATTERY · GRD PWR · STANDBY */}
        <div className="grid grid-cols-3 items-start gap-3">
          <div className="flex justify-center">
            <VertRocker
              label="BATTERY"
              on={s.battery}
              onToggle={() => s.patch({ battery: !s.battery })}
              lit={!!d.dcPower}
            />
          </div>
          <div className="flex justify-center">
            <VertRocker
              label="GRD PWR"
              on={s.groundPowerOn}
              onToggle={() =>
                s.patch(
                  {
                    groundPowerOn: gpuConnected ? !s.groundPowerOn : false,
                    groundServiceOn: !s.groundPowerOn ? false : s.groundServiceOn,
                  },
                  gpuConnected
                    ? undefined
                    : "GRD PWR inhibited — connect the external ground power cart first.",
                )
              }
              lit={gpuConnected && s.groundPowerOn}
              disabled={!gpuConnected && !s.groundPowerOn}
            />
          </div>
          <div className="flex justify-center">
            <ThreePos
              label="STANDBY POWER"
              value={s.standbyPower}
              options={[
                { id: "OFF", label: "OFF" },
                { id: "AUTO", label: "AUTO" },
                { id: "BAT", label: "BAT" },
              ]}
              onChange={(id) =>
                s.patch({ standbyPower: id as "OFF" | "AUTO" | "BAT" })
              }
            />
          </div>
        </div>

        {/* Row 2: GEN 1 · APU GEN · GEN 2 */}
        <div className="mt-3 grid grid-cols-3 items-start gap-3 border-t border-[#1e201c]/70 pt-3">
          <div className="flex justify-center">
            <VertRocker
              label="GEN 1"
              on={s.gen1}
              onToggle={() => s.patch({ gen1: !s.gen1 })}
              lit={!!d.eng1Running && s.gen1}
            />
          </div>
          <div className="flex justify-center">
            <VertRocker
              label="APU GEN"
              on={s.apuGen}
              onToggle={() => s.patch({ apuGen: !s.apuGen })}
              lit={!!d.apuAvailable && s.apuGen}
            />
          </div>
          <div className="flex justify-center">
            <VertRocker
              label="GEN 2"
              on={s.gen2}
              onToggle={() => s.patch({ gen2: !s.gen2 })}
              lit={!!d.eng2Running && s.gen2}
            />
          </div>
        </div>

        {/* Row 3: BUS TIE */}
        <div className="mt-3 flex justify-center border-t border-[#1e201c]/70 pt-3">
          <VertRocker
            label="BUS TIE"
            on={s.busTie}
            onToggle={() => s.patch({ busTie: !s.busTie })}
            lit={!!d.acPower && !!d.transferBus1Powered && !!d.transferBus2Powered}
            onLabel="AUTO"
            offLabel="OFF"
          />
        </div>

        <RealisticElecMeters />

        {/* TR + bus status */}
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          <CapLight label="TR 1" on={annBus && !!d.tr1Powered} tone="elec" />
          <CapLight label="TR 2" on={annBus && !!d.tr2Powered} tone="elec" />
          <CapLight label="TR 3" on={annBus && !!d.tr3Powered} tone="elec" />
        </div>

        <div className="mt-2 rounded border border-[#1e201c] bg-[#1c1e1a]/80 px-2 py-1.5 font-mono text-[6px] uppercase tracking-wide text-[#a09880]">
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-0.5">
            <span>
              AC SRC{" "}
              <span className={d.acPower ? "text-green-400" : "text-[#5a5548]"}>
                {String(d.electricalSource1 ?? "NONE")}
              </span>
            </span>
            <span>
              XFER 1{" "}
              <span className={d.transferBus1Powered ? "text-green-400" : "text-[#5a5548]"}>
                {d.transferBus1Powered ? "PWR" : "OFF"}
              </span>
            </span>
            <span>
              XFER 2{" "}
              <span className={d.transferBus2Powered ? "text-green-400" : "text-[#5a5548]"}>
                {d.transferBus2Powered ? "PWR" : "OFF"}
              </span>
            </span>
            <span>
              DC{" "}
              <span className={d.dcPower ? "text-green-400" : "text-[#5a5548]"}>
                {d.dcPower ? "PWR" : "OFF"}
              </span>
            </span>
          </div>
        </div>
      </div>

      <div className="border-t border-[#1e201c] bg-[#252722]/70 px-2 py-1">
        <p className="font-mono text-[6px] leading-relaxed text-[#7a7568]">
          Fixed electrical layout · Battery · GRD PWR · Standby · GEN 1/2 · APU GEN · Bus tie · TR / transfer buses
        </p>
      </div>
    </div>
  );
}
