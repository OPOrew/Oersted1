/**
 * Realistic 737-200 Cabin pressurization panel.
 *   Controller (AUTO / STANDBY / MAN AC / MAN DC) · FLT ALT · LAND ALT · CABIN RATE
 *   Cabin altitude gauge · Differential pressure gauge · Outflow valve position
 *   ALT HORN CUTOUT · Cabin altitude warning horn
 * Cabin altitude is computed from the live flight altitude and the simulated cabin differential.
 */
import { useEffect, useState } from "react";
import { useSimPick, useDerivedPick } from "@/lib/sim/store";
import type { PressMode } from "@/lib/sim/types";
import { Cap, NumberKnob, PanelShell, PushButton, RotaryKnob, RoundGauge } from "./OverheadParts";

const MODES: { id: PressMode; label: string }[] = [
  { id: "AUTO", label: "AUTO" },
  { id: "STBY", label: "STANDBY" },
  { id: "MAN_AC", label: "MAN AC" },
  { id: "MAN_DC", label: "MAN DC" },
];

/** ISA pressure (psi) at altitude (ft) and its inverse. */
const pAt = (ft: number) => 14.696 * Math.pow(1 - 6.8756e-6 * ft, 5.2559);
const altAt = (psi: number) => (1 - Math.pow(psi / 14.696, 1 / 5.2559)) / 6.8756e-6;

export function RealisticPressPanel() {
  const s = useSimPick("cabinDiff", "ltTest", "outflow", "patch", "pressMode", "psFlightAltFt", "wow");
  const d = useDerivedPick("cabinSupplyFlow", "dcPower");
  const [fltAlt, setFltAlt] = useState(35000);
  const [landAlt, setLandAlt] = useState(200);
  const [rate, setRate] = useState(500);
  const [hornCutout, setHornCutout] = useState(false);

  const acftAlt = s.wow ? 0 : Math.max(0, Number(s.psFlightAltFt ?? 0));
  const diff = Math.max(0, Number(s.cabinDiff ?? 0));
  const cabinAlt = Math.max(0, Math.round(altAt(pAt(acftAlt) + diff)));
  const manual = s.pressMode === "MAN_AC" || s.pressMode === "MAN_DC";
  const outflow = Math.max(0, Math.min(1, Number(s.outflow ?? 0)));
  const dcOn = !!d.dcPower;
  const lampTest = !!s.ltTest && dcOn;
  const horn = cabinAlt > 10000 && !hornCutout;
  useEffect(() => {
    if (cabinAlt < 10000) setHornCutout(false);
  }, [cabinAlt]);

  return (
    <PanelShell title="CABIN PRESSURIZATION · P5">
      <div className="grid grid-cols-3 items-start gap-3">
        <NumberKnob label="FLT ALT" value={fltAlt} min={0} max={41000} step={1000} onChange={setFltAlt} fmt={(v) => String(v).padStart(5, "0")} />
        <div className="flex flex-col items-center gap-1">
          <RotaryKnob
            label="CABIN PRESS CONTROL"
            size={92}
            tone="white"
            value={s.pressMode}
            onChange={(m) => s.patch({ pressMode: m })}
            options={MODES.map((m) => ({ id: m.id, label: m.label.replace(" ", "\n") }))}
          />
          <div className="flex gap-1">
            <Cap label="AUTO FAIL" on={lampTest || (dcOn && s.pressMode === "AUTO" && !s.wow && Number(d.cabinSupplyFlow ?? 1) <= 0.01)} />
            <Cap label={"OFF SCHED\nDESCENT"} on={lampTest} />
            <Cap label="STANDBY" on={lampTest || (dcOn && s.pressMode === "STBY")} tone="ok" />
            <Cap label="MANUAL" on={lampTest || (dcOn && manual)} tone="ok" />
          </div>
        </div>
        <NumberKnob label="LAND ALT" value={landAlt} min={-1000} max={14000} step={100} onChange={setLandAlt} />
      </div>

      <div className="mt-3 grid grid-cols-3 items-end gap-2 border-t border-[#1e201c]/70 pt-3">
        <RoundGauge label="CABIN ALT" value={cabinAlt / 1000} min={0} max={15} ticks={6} unit="x1000 ft" />
        <RoundGauge label="DIFF PSI" value={diff} min={0} max={10} ticks={6} unit="psi" />
        <RoundGauge label="OUTFLOW" value={outflow * 100} min={0} max={100} ticks={3} unit="% open" />
      </div>

      <div className="mt-3 grid grid-cols-3 items-center gap-2 border-t border-[#1e201c]/70 pt-3">
        <NumberKnob label="CABIN RATE" value={rate} min={100} max={2000} step={100} onChange={setRate} fmt={(v) => `${v} fpm`} />
        <div className="flex justify-center">
          <PushButton label={hornCutout ? "HORN CUTOUT ✓" : "ALT HORN CUTOUT"} onDown={() => setHornCutout(true)} onUp={() => {}} />
        </div>
        <div className="flex flex-col items-center gap-1">
          <Cap label={"CABIN ALT\nWARNING"} on={horn} tone="warn" />
          <span className="font-mono text-[6px] text-[#8a8570]">{cabinAlt.toLocaleString()} ft cabin</span>
        </div>
      </div>

      {manual && (
        <div className="mt-3 flex items-center justify-center gap-2 border-t border-[#1e201c]/70 pt-3">
          <span className="font-mono text-[7px] uppercase text-[#c8c0a8]">OUTFLOW VALVE (MANUAL)</span>
          <button
            type="button"
            onClick={() => s.patch({ outflow: Math.max(0, outflow - 0.1) })}
            className="rounded-[2px] border border-[#1e201c] bg-[#1c1e1a] px-2 py-0.5 font-mono text-[7px] text-[#c8c0a8]"
          >
            CLOSE
          </button>
          <button
            type="button"
            onClick={() => s.patch({ outflow: Math.min(1, outflow + 0.1) })}
            className="rounded-[2px] border border-[#1e201c] bg-[#1c1e1a] px-2 py-0.5 font-mono text-[7px] text-[#c8c0a8]"
          >
            OPEN
          </button>
        </div>
      )}
    </PanelShell>
  );
}
