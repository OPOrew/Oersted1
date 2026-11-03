/**
 * Realistic 737-200 Engine Start + APU — layout matched to real overhead photo.
 *
 * Photo geometry:
 *   [ APU vertical ]  [ START 1 rotary ]  [ START 2 rotary ]  [ NAV/STROBE ]
 *     OFF / ON / START   GRD-OFF-LIGN-RIGN-FLT  (same)
 */

import { useSimPick, useDerivedPick } from "@/lib/sim/store";
import type { ApuMaster, StartSwitch } from "@/lib/sim/types";
import { cn } from "@/lib/utils";
import { RotaryKnob, ToggleLever } from "./OverheadParts";

const START_OPTIONS: { id: StartSwitch; label: string }[] = [
  { id: "GRD", label: "GRD" },
  { id: "OFF", label: "OFF" },
  { id: "IGN_L", label: "L IGN" },
  { id: "IGN_R", label: "R IGN" },
  { id: "FLT", label: "FLT" },
];

function EngineStartRotary({
  engine,
  value,
  onChange,
}: {
  engine: 1 | 2;
  value: StartSwitch;
  onChange: (v: StartSwitch) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 select-none">
      <RotaryKnob
        size={96}
        tone="white"
        value={value}
        onChange={onChange}
        options={START_OPTIONS.map((o) => ({ id: o.id, label: o.label }))}
        showValue={false}
      />
      <span className="font-mono text-[9px] font-bold text-[#d0c8b0]">{engine}</span>
      <span className="font-mono text-[6px] uppercase text-amber-300/90">{value.replace("_", " ")}</span>
    </div>
  );
}

/** APU 3-position toggle: OFF / ON / START (spring-returns visually to ON after START in the real aircraft) */
function ApuVertical({
  value,
  onChange,
}: {
  value: ApuMaster;
  onChange: (v: ApuMaster) => void;
}) {
  return (
    <ToggleLever
      label="APU"
      options={[
        { id: "OFF", label: "OFF" },
        { id: "ON", label: "ON" },
        { id: "START", label: "START" },
      ]}
      value={value}
      onChange={(id) => onChange(id as ApuMaster)}
    />
  );
}

function CapLight({
  label,
  on,
  tone = "ok",
}: {
  label: string;
  on: boolean;
  tone?: "ok" | "caution" | "warn";
}) {
  const colors = {
    ok: on ? "bg-green-400 text-black shadow-[0_0_6px_#4ade80]" : "bg-[#0f2a14] text-[#2a5a30]",
    caution: on ? "bg-amber-400 text-black shadow-[0_0_6px_#fbbf24]" : "bg-[#2a2410] text-[#5a5030]",
    warn: on ? "bg-red-500 text-white shadow-[0_0_6px_#ef4444]" : "bg-[#2a1010] text-[#5a2020]",
  };
  return (
    <div
      className={cn(
        "min-w-[48px] rounded-[2px] border border-[#1a1a18] px-1 py-0.5 text-center font-mono text-[6px] font-bold uppercase",
        colors[tone],
      )}
    >
      {label}
    </div>
  );
}

export function RealisticOverheadStart() {
  const s = useSimPick("apuMaster", "apuRpm", "apuStarter", "patch", "start1", "start2");
  const d = useDerivedPick("apuAvailable", "batteryPower", "dcPower", "ignition1On", "ignition2On", "startValveOpen1", "startValveOpen2");
  const dcOn = !!d.dcPower;

  const setStart = (eng: 1 | 2, id: StartSwitch) => {
    if (eng === 1) s.patch({ start1: id }, `ENGINE 1 START ${id}`);
    else s.patch({ start2: id }, `ENGINE 2 START ${id}`);
  };

  const setApu = (id: ApuMaster) => {
    if (id === "START" && !d.batteryPower) {
      s.patch({ apuMaster: "OFF" }, "APU START inhibited — battery power required.");
      return;
    }
    s.patch(
      { apuMaster: id },
      id === "START" ? "APU START command issued." : undefined,
    );
  };

  return (
    <div
      className="relative w-full min-w-0 max-w-full overflow-x-auto overflow-y-hidden rounded-md border-2 border-[#1a1c18] shadow-xl panel-scroll" data-panel-scroll data-keep-cols
      style={{
        background: "linear-gradient(180deg, #3e413b 0%, #32352f 45%, #2a2c28 100%)",
        maxWidth: "min(100%, 520px)",
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
          ENGINE START · APU · P5
        </h2>
      </div>

      <div className="relative px-4 py-4">
        {/* Title engraved like the photo */}
        <div className="mb-3 text-center font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-[#d0c8b0]">
          ENGINE START
        </div>

        {/* Main row: APU | START 1 | START 2 */}
        <div className="grid grid-cols-[auto_1fr_1fr] items-center gap-4">
          {/* APU left */}
          <div className="flex flex-col items-center gap-2 border-r border-[#1e201c]/80 pr-3">
            <ApuVertical value={s.apuMaster} onChange={setApu} />
            <div className="flex flex-col gap-0.5">
              <CapLight label={d.apuAvailable ? "APU AVAIL" : "APU OFF"} on={dcOn && !!d.apuAvailable} tone="ok" />
              <CapLight label="STARTER" on={dcOn && !!s.apuStarter} tone="caution" />
            </div>
            {typeof s.apuRpm === "number" && (
              <span className="font-mono text-[7px] text-[#a09880]">
                RPM {Math.round(s.apuRpm)}%
              </span>
            )}
          </div>

          {/* Engine 1 */}
          <div className="flex justify-center">
            <EngineStartRotary
              engine={1}
              value={s.start1}
              onChange={(id) => setStart(1, id)}
            />
          </div>

          {/* Engine 2 */}
          <div className="flex justify-center">
            <EngineStartRotary
              engine={2}
              value={s.start2}
              onChange={(id) => setStart(2, id)}
            />
          </div>
        </div>

        {/* Status strip */}
        <div className="mt-3 flex flex-wrap justify-center gap-2 border-t border-[#1e201c]/70 pt-2">
          <CapLight label="START VLV 1" on={dcOn && !!d.startValveOpen1} tone="caution" />
          <CapLight label="START VLV 2" on={dcOn && !!d.startValveOpen2} tone="caution" />
          <CapLight label="IGN 1" on={dcOn && (!!d.ignition1On || s.start1 === "IGN_L" || s.start1 === "IGN_R" || s.start1 === "FLT")} tone="ok" />
          <CapLight label="IGN 2" on={dcOn && (!!d.ignition2On || s.start2 === "IGN_L" || s.start2 === "IGN_R" || s.start2 === "FLT")} tone="ok" />
        </div>
      </div>

      <div className="border-t border-[#1e201c] bg-[#252722]/70 px-2 py-1">
        <p className="font-mono text-[6px] leading-relaxed text-[#7a7568]">
          Layout matched to 737-200 engine start photo · APU vertical · white start rotaries GRD/OFF/L IGN/R IGN/FLT
        </p>
      </div>
    </div>
  );
}
