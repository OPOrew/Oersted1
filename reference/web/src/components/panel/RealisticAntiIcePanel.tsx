/**
 * Realistic 737-200 Window heat / Wing & Engine anti-ice (P5) — layout matched to the real panel:
 *
 *   OVERHEAT ×4 / ON ×4 lights           (L SIDE · L FWD · R FWD · R SIDE)
 *   WINDOW HEAT  L [2 toggles]   PWR TEST   R [2 toggles]
 *   COWL ANTI-ICE ×2 (amber)
 *   LEFT VALVE OPEN · RIGHT VALVE OPEN · COWL VALVE OPEN ×2 (blue)
 *   WING ANTI-ICE toggle         ENG ANTI-ICE 1 · 2 toggles
 */

import { useSimPick, useDerivedPick } from "@/lib/sim/store";
import { Cap, OnOffToggle, RotaryKnob, ToggleLever } from "./OverheadParts";

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

export function RealisticAntiIcePanel() {
  const s = useSimPick("antiIce1", "antiIce2", "fuelHeat", "fuelHeat2", "ltTest", "patch", "windowHeatLFwd", "windowHeatLSide", "windowHeatOvhtLFwd", "windowHeatOvhtLSide", "windowHeatOvhtRFwd", "windowHeatOvhtRSide", "windowHeatRFwd", "windowHeatRSide", "windowHeatTest", "wingAntiIceL", "wingAntiIceR");
  const d = useDerivedPick("acPower", "dcPower", "fuelHeatValve2Open", "fuelHeatValveOpen");
  const ac = !!d.acPower;
  const dc = !!d.dcPower;
  const test = s.windowHeatTest;
  const lampTest = !!s.ltTest && dc;

  const onLight = (on: boolean, ovht: boolean) => (ac && on && !ovht) || (dc && test === "PWR");
  // OVERHEAT annunciators require DC bus; fault state alone must not light them with power off.
  const ovhtLight = (ovht: boolean) => (dc && !!ovht) || (dc && test === "OVHT") || lampTest;

  const setWh = (
    key: "windowHeatLFwd" | "windowHeatLSide" | "windowHeatRFwd" | "windowHeatRSide",
    v: boolean,
  ) => {
    s.patch(
      { [key]: v } as never,
      `WINDOW HEAT ${key.replace("windowHeat", "")} ${v ? "ON" : "OFF"}`,
    );
  };

  const wh = [
    { key: "windowHeatLSide" as const, label: "L SIDE", on: s.windowHeatLSide, ovht: s.windowHeatOvhtLSide },
    { key: "windowHeatLFwd" as const, label: "L FWD", on: s.windowHeatLFwd, ovht: s.windowHeatOvhtLFwd },
    { key: "windowHeatRFwd" as const, label: "R FWD", on: s.windowHeatRFwd, ovht: s.windowHeatOvhtRFwd },
    { key: "windowHeatRSide" as const, label: "R SIDE", on: s.windowHeatRSide, ovht: s.windowHeatOvhtRSide },
  ];

  return (
    <div
      className="relative w-full min-w-0 max-w-full overflow-x-auto overflow-y-hidden rounded-md border-2 border-[#1a1c18] shadow-xl panel-scroll" data-panel-scroll data-keep-cols
      style={{
        background: "linear-gradient(180deg, #3e413b 0%, #32352f 45%, #2a2c28 100%)",
        maxWidth: "min(100%, 460px)",
      }}
    >
      <div className="relative border-b border-[#1e201c] bg-[#2e312c]/90 px-3 py-1">
        <h2 className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#e0d8c0]">
          WINDOW HEAT / ANTI-ICE · P5
        </h2>
      </div>

      <div className="relative px-3 py-3">
        {/* Window heat lights */}
        <div className="grid grid-cols-4 gap-1">
          {wh.map((w) => (
            <div key={w.key} className="flex flex-col items-center gap-0.5">
              <Cap label="OVERHEAT" on={ovhtLight(w.ovht)} tone="caution" />
              <Cap label="ON" on={onLight(w.on, w.ovht) || lampTest} tone="ok" />
              <span className="font-mono text-[5px] uppercase text-[#8a8578]">{w.label}</span>
            </div>
          ))}
        </div>

        {/* Window heat switches: L pair · PWR TEST · R pair */}
        <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-end gap-3 border-t border-[#1e201c]/70 pt-2">
          <div className="flex flex-col items-center gap-1">
            <span className="font-mono text-[7px] font-bold uppercase tracking-wider text-[#b0a890]">L</span>
            <div className="flex gap-3">
              <OnOffToggle label="SIDE" on={s.windowHeatLSide} onToggle={() => setWh("windowHeatLSide", !s.windowHeatLSide)} lit={onLight(s.windowHeatLSide, s.windowHeatOvhtLSide)} />
              <OnOffToggle label="FWD" on={s.windowHeatLFwd} onToggle={() => setWh("windowHeatLFwd", !s.windowHeatLFwd)} lit={onLight(s.windowHeatLFwd, s.windowHeatOvhtLFwd)} />
            </div>
          </div>
          <ThreePos
            label="PWR TEST"
            value={s.windowHeatTest}
            options={[
              { id: "PWR", label: "PWR" },
              { id: "OFF", label: "OFF" },
              { id: "OVHT", label: "OVHT" },
            ]}
            onChange={(id) => s.patch({ windowHeatTest: id as "OFF" | "PWR" | "OVHT" })}
          />
          <div className="flex flex-col items-center gap-1">
            <span className="font-mono text-[7px] font-bold uppercase tracking-wider text-[#b0a890]">R</span>
            <div className="flex gap-3">
              <OnOffToggle label="FWD" on={s.windowHeatRFwd} onToggle={() => setWh("windowHeatRFwd", !s.windowHeatRFwd)} lit={onLight(s.windowHeatRFwd, s.windowHeatOvhtRFwd)} />
              <OnOffToggle label="SIDE" on={s.windowHeatRSide} onToggle={() => setWh("windowHeatRSide", !s.windowHeatRSide)} lit={onLight(s.windowHeatRSide, s.windowHeatOvhtRSide)} />
            </div>
          </div>
        </div>

        {/* Wing / cowl anti-ice annunciators */}
        <div className="mt-3 border-t border-[#1e201c]/70 pt-2">
          <div className="flex justify-center gap-6">
            <Cap label={"COWL\nANTI-ICE"} on={lampTest} tone="caution" />
            <Cap label={"COWL\nANTI-ICE"} on={lampTest} tone="caution" />
          </div>
          <div className="mt-1 grid grid-cols-4 gap-1">
            <Cap label={"LEFT VALVE\nOPEN"} on={lampTest || (dc && s.wingAntiIceL)} tone="blue" />
            <Cap label={"RIGHT VALVE\nOPEN"} on={lampTest || (dc && s.wingAntiIceR)} tone="blue" />
            <Cap label={"COWL VALVE\nOPEN"} on={lampTest || (dc && s.antiIce1)} tone="blue" />
            <Cap label={"COWL VALVE\nOPEN"} on={lampTest || (dc && s.antiIce2)} tone="blue" />
          </div>
        </div>

        {/* Separate left/right wing controls match the shared SimState keys used on the overhead. */}
        <div className="mt-2 grid grid-cols-2 gap-3 border-t border-[#1e201c]/70 pt-2">
          <OnOffToggle label="WING ANTI-ICE L" on={s.wingAntiIceL} onToggle={() => s.patch({ wingAntiIceL: !s.wingAntiIceL }, `LEFT WING ANTI-ICE ${s.wingAntiIceL ? "OFF" : "ON"}`)} lit={dc && s.wingAntiIceL} />
          <OnOffToggle label="WING ANTI-ICE R" on={s.wingAntiIceR} onToggle={() => s.patch({ wingAntiIceR: !s.wingAntiIceR }, `RIGHT WING ANTI-ICE ${s.wingAntiIceR ? "OFF" : "ON"}`)} lit={dc && s.wingAntiIceR} />
        </div>
        <div className="mt-2 flex flex-col items-center gap-1 border-t border-[#1e201c]/70 pt-2">
          <span className="font-mono text-[7px] font-bold uppercase tracking-wider text-[#b0a890]">ENG ANTI-ICE</span>
          <div className="flex gap-3">
            <OnOffToggle label="ENG 1" on={s.antiIce1} onToggle={() => s.patch({ antiIce1: !s.antiIce1 })} lit={dc && s.antiIce1} />
            <OnOffToggle label="ENG 2" on={s.antiIce2} onToggle={() => s.patch({ antiIce2: !s.antiIce2 })} lit={dc && s.antiIce2} />
          </div>
        </div>

        <div className="mt-2 flex justify-center border-t border-[#1e201c]/70 pt-2">
          <OnOffToggle label="ENG 1 FUEL HEAT" on={s.fuelHeat} onToggle={() => s.patch({ fuelHeat: !s.fuelHeat, ...(!s.fuelHeat ? { fuelHeatElapsedSec: 0 } : {}) })} lit={!!d.fuelHeatValveOpen} />
          <OnOffToggle label="ENG 2 FUEL HEAT" on={s.fuelHeat2} onToggle={() => s.patch({ fuelHeat2: !s.fuelHeat2, ...(!s.fuelHeat2 ? { fuelHeat2ElapsedSec: 0 } : {}) })} lit={!!d.fuelHeatValve2Open} />
        </div>
      </div>
    </div>
  );
}
