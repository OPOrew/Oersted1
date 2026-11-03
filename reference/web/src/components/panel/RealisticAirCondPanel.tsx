/**
 * Realistic 737-200 Air Conditioning panel (P5)
 * Layout matched to real overhead photo:
 *
 *   CONT CABIN          AIR TEMP          PASS CABIN
 *   [ Air Mix L ]   [ SUPPLY/PASS sel ]   [ Air Mix R ]
 *   [ DUCT OVHT ]      [ TEMP gauge ]     [ DUCT OVHT ]
 *   [ AUTO/MAN L ]                        [ AUTO/MAN R ]
 *
 * Gauges are live/animated from sim state.
 */

import React, { useState } from "react";
import { useSimPick, useDerivedPick } from "@/lib/sim/store";
import type { SimState } from "@/lib/sim/types";
import { cn } from "@/lib/utils";
import { RotaryKnob } from "./OverheadParts";

/* ------------------------------------------------------------------ */
/*  Animated circular gauges                                          */
/* ------------------------------------------------------------------ */

/** Air Mix Valve gauge: COLD (left) ← → HOT (right), needle from mix 0..1 */
function AirMixGauge({
  value,
  label,
  onChange,
  disabled = false,
}: {
  value: number; // 0 = cold, 1 = hot
  label: string;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  // Map 0..1 to about -60° .. +60°
  const angle = -60 + Math.max(0, Math.min(1, value)) * 120;
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="font-mono text-[6px] uppercase tracking-wider text-[#b0a890]">
        {label}
      </span>
      <div className="relative h-14 w-14">
        <div className="absolute inset-0 rounded-full border border-[#1a1a18] bg-[#0e0e0c] shadow-[inset_0_2px_6px_rgba(0,0,0,0.8)]" />
        {/* Scale marks */}
        {[-60, -30, 0, 30, 60].map((a) => {
          const rad = (a * Math.PI) / 180;
          const x1 = 50 + Math.sin(rad) * 38;
          const y1 = 50 - Math.cos(rad) * 38;
          const x2 = 50 + Math.sin(rad) * 44;
          const y2 = 50 - Math.cos(rad) * 44;
          return (
            <div
              key={a}
              className="absolute h-[1px] w-[1px] bg-[#6a6558]"
              style={{
                left: `${x1}%`,
                top: `${y1}%`,
                width: "2px",
                height: "4px",
                transform: `translate(-50%, -50%) rotate(${a}deg)`,
              }}
            />
          );
        })}
        {/* Needle */}
        <div
          className="absolute left-1/2 top-1/2 origin-bottom transition-transform duration-300 ease-out"
          style={{
            width: 2,
            height: "38%",
            marginLeft: -1,
            marginTop: "-38%",
            background: "linear-gradient(to top, #c04020, #e08040)",
            transform: `rotate(${angle}deg)`,
            borderRadius: 1,
          }}
        />
        <div className="absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#3a3a35] border border-[#555]" />
        {/* Labels */}
        <span className="absolute left-0.5 bottom-1 font-mono text-[5px] text-[#8a8578]">COLD</span>
        <span className="absolute right-0.5 bottom-1 font-mono text-[5px] text-[#8a8578]">HOT</span>
      </div>
      <span className="font-mono text-[6px] uppercase text-[#c8c0a8]">AIR MIX VALVE</span>
      <input aria-label={`${label} manual air mix`} type="range" min={0} max={1} step={0.01} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.currentTarget.value))} className="w-16 accent-amber-500 disabled:opacity-40" />
    </div>
  );
}

/** Main TEMP gauge 40–200 °F, animated needle */
function TempGauge({ tempF }: { tempF: number }) {
  // Map 40..200 → -120° .. +120°
  const t = Math.max(40, Math.min(200, tempF));
  const angle = -120 + ((t - 40) / 160) * 240;
  return (
    <div className="relative h-24 w-24">
      <div className="absolute inset-0 rounded-full border-2 border-[#1a1a18] bg-[#0a0a08] shadow-[inset_0_3px_10px_rgba(0,0,0,0.9)]" />
      {/* Scale */}
      {[40, 80, 120, 160, 200].map((v) => {
        const a = -120 + ((v - 40) / 160) * 240;
        const rad = (a * Math.PI) / 180;
        const x = 50 + Math.sin(rad) * 36;
        const y = 50 - Math.cos(rad) * 36;
        return (
          <span
            key={v}
            className="absolute font-mono text-[6px] text-[#9a9588]"
            style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)" }}
          >
            {v}
          </span>
        );
      })}
      {/* Needle */}
      <div
        className="absolute left-1/2 top-1/2 origin-bottom transition-transform duration-500 ease-out"
        style={{
          width: 2.5,
          height: "42%",
          marginLeft: -1.25,
          marginTop: "-42%",
          background: "linear-gradient(to top, #a03018, #e07030)",
          transform: `rotate(${angle}deg)`,
          borderRadius: 1,
          boxShadow: "0 0 3px rgba(200,80,20,0.5)",
        }}
      />
      <div className="absolute left-1/2 top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#2a2a25] border border-[#555]" />
      <span className="absolute bottom-2 left-1/2 -translate-x-1/2 font-mono text-[6px] font-bold uppercase text-[#b0a890]">
        TEMP °F
      </span>
    </div>
  );
}

function CapLight({
  label,
  on,
  tone = "caution",
}: {
  label: string;
  on: boolean;
  tone?: "caution" | "ok" | "warn";
}) {
  const colors = {
    caution: on ? "bg-amber-400 text-black shadow-[0_0_6px_#fbbf24]" : "bg-[#2a2410] text-[#5a5030]",
    ok: on ? "bg-green-400 text-black shadow-[0_0_6px_#4ade80]" : "bg-[#0f2a14] text-[#2a5a30]",
    warn: on ? "bg-red-500 text-white shadow-[0_0_6px_#ef4444]" : "bg-[#2a1010] text-[#5a2020]",
  };
  return (
    <div
      className={cn(
        "min-w-[48px] rounded-[2px] border border-[#1a1a18] px-1 py-0.5 text-center font-mono text-[6px] font-bold uppercase leading-tight tracking-wide",
        colors[tone],
      )}
    >
      {label}
    </div>
  );
}

/**
 * Real 737-200 cabin temp selector (from photo):
 *
 *        AUTO NORMAL          ← upper half
 *   COOL              WARM
 *   COOL              WARM    ← lower half = MANUAL
 *          OFF
 *         MANUAL
 *
 * Knob in upper half = AUTO; lower left = MANUAL COOL;
 * lower right = MANUAL WARM; bottom = OFF.
 */
function TempModeRotary({
  label,
  mode,
  onChange,
}: {
  label: string;
  mode: string;
  onChange: (m: string) => void;
}) {
  const value = mode === "MANUAL" ? "OFF" : mode;
  return (
    <RotaryKnob
      label={label}
      size={86}
      tone="white"
      value={value}
      onChange={onChange}
      options={[
        { id: "MANUAL_COOL", label: "MAN\nCOOL", angle: -120 },
        { id: "AUTO", label: "AUTO", angle: 0 },
        { id: "MANUAL_WARM", label: "MAN\nWARM", angle: 120 },
        { id: "OFF", label: "OFF", angle: 180 },
      ]}
    />
  );
}

/** Supply duct / Pass cabin selector (centre knob on the photo) */
function SourceSelector({
  value,
  onChange,
}: {
  value: "SUPPLY" | "PASS";
  onChange: (v: "SUPPLY" | "PASS") => void;
}) {
  return (
    <RotaryKnob
      size={84}
      tone="white"
      value={value}
      onChange={onChange}
      options={[
        { id: "SUPPLY", label: "SUPPLY\nDUCT", angle: -45 },
        { id: "PASS", label: "PASS\nCABIN", angle: 45 },
      ]}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Main Air Conditioning panel                                       */
/* ------------------------------------------------------------------ */

export function RealisticAirCondPanel() {
  const s = useSimPick("controlCabinTempF", "faults", "ltTest", "mixCabin", "mixPass", "passengerCabinTempF", "patch", "tempControlFaultL", "tempControlFaultR", "tempModeL", "tempModeR", "tempSelectL", "tempSelectR");
  const d = useDerivedPick("controlCabinSupplyTempF", "dcPower", "passengerCabinSupplyTempF");

  const modeL = (s.tempModeL ?? "AUTO") as string;
  const modeR = (s.tempModeR ?? "AUTO") as string;
  const mixL = Number(s.mixCabin ?? 0.45);
  const mixR = Number(s.mixPass ?? 0.5);

  // Displayed temp: prefer live cabin temps, fallback to select
  const tempL = Number(s.controlCabinTempF ?? s.tempSelectL ?? 75);
  const tempR = Number(s.passengerCabinTempF ?? s.tempSelectR ?? 75);
  // Center gauge shows the selected source average / supply
  const [source, setSource] = useState<"SUPPLY" | "PASS">("SUPPLY");
  const gaugeTemp =
    source === "SUPPLY"
      ? Number(d.controlCabinSupplyTempF ?? tempL)
      : Number(d.passengerCabinSupplyTempF ?? tempR);

  const dcOn = !!d.dcPower;
  const lampTest = !!s.ltTest && dcOn;
  const ductOvhtL =
    lampTest ||
    (dcOn &&
      (s.tempControlFaultL === "DUCT_OVERHEAT" ||
        s.tempControlFaultL === "DUCT_OVERHEAT_250" ||
        s.tempControlFaultL === "PACK_OVERHEAT"));
  const ductOvhtR =
    lampTest ||
    (dcOn &&
      (s.tempControlFaultR === "DUCT_OVERHEAT" ||
        s.tempControlFaultR === "DUCT_OVERHEAT_250" ||
        s.tempControlFaultR === "PACK_OVERHEAT"));

  const setMode = (side: "L" | "R", mode: string) => {
    if (side === "L") s.patch({ tempModeL: mode as NonNullable<SimState["tempModeL"]> });
    else s.patch({ tempModeR: mode as NonNullable<SimState["tempModeR"]> });
  };
  const setMix = (side: "L" | "R", value: number) => {
    if (side === "L") s.patch({ mixCabin: value, tempModeL: "MANUAL" }, "LEFT AIR MIX VALVE MANUAL POSITION");
    else s.patch({ mixPass: value, tempModeR: "MANUAL" }, "RIGHT AIR MIX VALVE MANUAL POSITION");
  };

  // Need React for useState — import style used in project
  // (useState already available via the React import in the project)
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
          AIR CONDITIONING · P5
        </h2>
      </div>

      <div className="relative px-3 py-3">
        {/* Header labels */}
        <div className="mb-2 grid grid-cols-3 text-center font-mono text-[7px] font-bold uppercase tracking-wider text-[#d0c8b0]">
          <span>CONT CABIN</span>
          <span>AIR TEMP</span>
          <span>PASS CABIN</span>
        </div>

        {/* Row: Air Mix L | Source sel | Air Mix R */}
        <div className="grid grid-cols-3 items-center gap-1">
          <div className="flex justify-center">
            <AirMixGauge value={mixL} label="CONT" onChange={(v) => setMix("L", v)} disabled={s.faults.mixValveJamL} />
          </div>
          <div className="flex justify-center">
            <SourceSelector value={source} onChange={setSource} />
          </div>
          <div className="flex justify-center">
            <AirMixGauge value={mixR} label="PASS" onChange={(v) => setMix("R", v)} disabled={s.faults.mixValveJamR} />
          </div>
        </div>

        {/* Row: DUCT OVHT | TEMP gauge | DUCT OVHT */}
        <div className="mt-2 grid grid-cols-3 items-center gap-1">
          <div className="flex flex-col items-center gap-1">
            <CapLight label="DUCT OVERHEAT" on={ductOvhtL} tone="caution" />
          </div>
          <div className="flex justify-center">
            <TempGauge tempF={gaugeTemp} />
          </div>
          <div className="flex flex-col items-center gap-1">
            <CapLight label="DUCT OVERHEAT" on={ductOvhtR} tone="caution" />
          </div>
        </div>

        {/* Row: Mode rotaries L / R */}
        <div className="mt-3 grid grid-cols-2 gap-4 border-t border-[#1e201c]/70 pt-2">
          <div className="flex justify-center">
            <TempModeRotary label="CONT CABIN" mode={modeL} onChange={(m) => setMode("L", m)} />
          </div>
          <div className="flex justify-center">
            <TempModeRotary label="PASS CABIN" mode={modeR} onChange={(m) => setMode("R", m)} />
          </div>
        </div>

        {/* Live readout */}
        <div className="mt-3 rounded border border-[#1e201c] bg-[#1c1e1a]/80 px-2 py-1.5 font-mono text-[7px] uppercase tracking-wide text-[#a09880]">
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-0.5">
            <span>
              CONT{" "}
              <span className="text-[#c8c0a8]">{Math.round(tempL)}°F</span>
            </span>
            <span>
              PASS{" "}
              <span className="text-[#c8c0a8]">{Math.round(tempR)}°F</span>
            </span>
            <span>
              MIX L{" "}
              <span className="text-[#c8c0a8]">{Math.round(mixL * 100)}%</span>
            </span>
            <span>
              MIX R{" "}
              <span className="text-[#c8c0a8]">{Math.round(mixR * 100)}%</span>
            </span>
            <span>
              GAUGE{" "}
              <span className="text-amber-300">{Math.round(gaugeTemp)}°F</span>
            </span>
          </div>
        </div>
      </div>

      <div className="border-t border-[#1e201c] bg-[#252722]/70 px-2 py-1">
        <p className="font-mono text-[6px] leading-relaxed text-[#7a7568]">
          Layout matched to 737-200 air conditioning photo · Air mix gauges · TEMP gauge animated · AUTO/MAN rotaries
        </p>
      </div>
    </div>
  );
}

