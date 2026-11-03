/**
 * Realistic 737-200 electrical meters (DC AMPS / DC VOLTS / AC AMPS / AC VOLTS / FREQ)
 * with the TR/BAT DC selector and the GEN/APU/GRD AC selector, as on the P5 panel.
 */
import { useState } from "react";
import { useSimPick, useDerivedPick } from "@/lib/sim/store";
import { RotaryKnob, RoundGauge } from "./OverheadParts";

type DcSel = "BAT BUS" | "BAT" | "TR1" | "TR2" | "TR3" | "STBY PWR" | "TEST";
type AcSel = "GRD PWR" | "GEN1" | "APU GEN" | "GEN2" | "STBY PWR" | "TEST";

export function RealisticElecMeters() {
  const s = useSimPick("apuGen", "battery", "externalPowerConnected", "gen1", "gen2", "groundPowerOn");
  const d = useDerivedPick("acPower", "apuAvailable", "batteryBusPowered", "batteryPower", "generator1BusPowered", "generator2BusPowered", "groundPowerAvailable", "standbyAcPowered", "standbyDcPowered", "tr1Powered", "tr2Powered", "tr3Powered");
  const [dc, setDc] = useState<DcSel>("TR1");
  const [ac, setAc] = useState<AcSel>("GEN1");

  const gpu = !!(d.groundPowerAvailable ?? s.externalPowerConnected) && s.groundPowerOn;

  const dcRead = ((): { v: number; a: number } => {
    switch (dc) {
      case "TR1": return d.tr1Powered ? { v: 28, a: 35 } : { v: 0, a: 0 };
      case "TR2": return d.tr2Powered ? { v: 28, a: 30 } : { v: 0, a: 0 };
      case "TR3": return d.tr3Powered ? { v: 28, a: 25 } : { v: 0, a: 0 };
      case "BAT": return s.battery && d.batteryPower ? { v: d.acPower ? 28 : 24, a: d.acPower ? 5 : -30 } : { v: 0, a: 0 };
      case "BAT BUS": return d.batteryBusPowered ? { v: 27, a: 0 } : { v: 0, a: 0 };
      case "STBY PWR": return d.standbyDcPowered ? { v: 27, a: 0 } : { v: 0, a: 0 };
      case "TEST": return { v: 28, a: 0 };
    }
  })();

  const acRead = ((): { v: number; a: number; hz: number } => {
    const on115 = (ok: boolean, a: number) => (ok ? { v: 115, a, hz: 400 } : { v: 0, a: 0, hz: 0 });
    switch (ac) {
      case "GEN1": return on115(!!d.generator1BusPowered && s.gen1, 55);
      case "GEN2": return on115(!!d.generator2BusPowered && s.gen2, 55);
      case "APU GEN": return on115(!!d.apuAvailable && s.apuGen, 60);
      case "GRD PWR": return on115(gpu, 40);
      case "STBY PWR": return on115(!!d.standbyAcPowered, 8);
      case "TEST": return { v: 115, a: 0, hz: 400 };
    }
  })();

  return (
    <div className="min-w-0 max-w-full mt-3 rounded border border-[#1e201c] bg-[#2a2c28]/80 p-2">
      <div className="mb-1 text-center font-mono text-[7px] uppercase tracking-wider text-[#c8c0a8]">
        DC / AC METERS
      </div>
      <div className="grid grid-cols-5 items-end gap-1">
        <RoundGauge label="DC AMPS" value={dcRead.a} min={-50} max={100} ticks={4} size={56} />
        <RoundGauge label="DC VOLTS" value={dcRead.v} min={0} max={40} ticks={5} size={56} />
        <RoundGauge label="AC AMPS" value={acRead.a} min={0} max={200} ticks={5} size={56} />
        <RoundGauge label="AC VOLTS" value={acRead.v} min={0} max={130} ticks={5} size={56} />
        <RoundGauge label="FREQ" value={acRead.hz} min={380} max={420} ticks={3} size={56} />
      </div>
      <div className="mt-2 grid grid-cols-2 place-items-center gap-3 border-t border-[#1e201c] pt-2">
        <RotaryKnob
          label="DC METER"
          size={96}
          tone="black"
          value={dc}
          onChange={setDc}
          options={(["BAT BUS", "BAT", "TR1", "TR2", "TR3", "STBY PWR", "TEST"] as DcSel[]).map((o) => ({ id: o, label: o.replace(" ", "\n") }))}
        />
        <RotaryKnob
          label="AC METER"
          size={96}
          tone="black"
          value={ac}
          onChange={setAc}
          options={(["GRD PWR", "GEN1", "APU GEN", "GEN2", "STBY PWR", "TEST"] as AcSel[]).map((o) => ({ id: o, label: o.replace(" ", "\n") }))}
        />
      </div>
    </div>
  );
}
