import { useSim, useDerived, type SimStore } from "@/lib/sim/store";
import type { CircuitBreakerId } from "@/lib/sim/types";
import { cn } from "@/lib/utils";

type PitotBreakerId = "psCbCaptUpperL" | "psCbCaptLowerL" | "psCbFoUpperR" | "psCbFoLowerR" | "psCbElevL" | "psCbElevR" | "psCbTempL" | "psCbTempR" | "psCbTemp";
type PanelBreakerId = CircuitBreakerId | PitotBreakerId;
function isPitotBreakerId(id: PanelBreakerId): id is PitotBreakerId { return id.startsWith("psCb"); }
type BreakerRow = { id: PanelBreakerId; label: string; ata: string; purpose: string };

const BREAKERS: { group: string; rows: BreakerRow[] }[] = [
  { group: "Powerplant / electrical · ATA 24 / 74", rows: [
    { id: "gen-drive-disc-1", label: "GEN DRIVE DISC 1", ata: "24-11", purpose: "Disconnect solenoid control" },
    { id: "gen-drive-disc-2", label: "GEN DRIVE DISC 2", ata: "24-11", purpose: "Disconnect solenoid control" },
    { id: "gen-drive-indication-1", label: "GEN DRIVE IND 1", ata: "24-11", purpose: "Drive oil pressure / temperature indications" },
    { id: "gen-drive-indication-2", label: "GEN DRIVE IND 2", ata: "24-11", purpose: "Drive oil pressure / temperature indications" },
    { id: "ac-28v-main-bus-2", label: "28V AC MAIN BUS 2", ata: "24-53-21", purpose: "Logical bus feed gate from 115V AC Main Bus No.2; WDM-specific breaker number/effectivity varies" },
    { id: "eng1-ign-left", label: "ENG 1 IGN LEFT", ata: "74", purpose: "Engine 1 left igniter/exciter channel" },
    { id: "eng1-ign-right", label: "ENG 1 IGN RIGHT", ata: "74", purpose: "Engine 1 right igniter/exciter channel" },
    { id: "eng2-ign-left", label: "ENG 2 IGN LEFT", ata: "74", purpose: "Engine 2 left igniter/exciter channel" },
    { id: "eng2-ign-right", label: "ENG 2 IGN RIGHT", ata: "74", purpose: "Engine 2 right igniter/exciter channel" },
    { id: "alpha-vane-left", label: "ALPHA VANE HEAT L", ata: "30-31", purpose: "Left alpha-vane heater power path" },
    { id: "alpha-vane-right", label: "ALPHA VANE HEAT R", ata: "30-31", purpose: "Right alpha-vane heater power path" },
  ]},
  { group: "Air conditioning · ATA 21", rows: [
    { id: "recirc-fan", label: "RECIRC FAN", ata: "21-24/26", purpose: "Cabin / gasper fan path" },
    { id: "mix-valve", label: "AIR MIX VALVE", ata: "21-61/67", purpose: "Manual/automatic mix-valve control path" },
    { id: "equipment-cooling-supply", label: "EQUIP COOL SUPPLY", ata: "21-58", purpose: "Equipment cooling supply blower" },
    { id: "equipment-cooling-exhaust", label: "EQUIP COOL EXHAUST", ata: "21-58", purpose: "Equipment cooling exhaust blower" },
  ]},
  { group: "Fuel / ice and rain · ATA 28 / 30", rows: [
    { id: "fuel-heat-1", label: "ENG 1 FUEL HEAT", ata: "75-12-01 · WDM sheets 1/21", purpose: "C401 · 28V DC BUS-1 feed to engine 1 fuel de-icing / heater control path" },
    { id: "fuel-heat-2", label: "ENG 2 FUEL HEAT", ata: "75-12-01 · WDM sheets 1/21", purpose: "C402 · 28V DC BUS-2 feed to engine 2 fuel de-icing / heater control path" },
    { id: "fuel-temp-indication", label: "FUEL TEMP IND", ata: "WDM 28-42-01; AMM D6-12005 28-43-0", purpose: "Branch feed from 28V AC MAIN BUS No.2; powers the Tank No.1 temperature gauge" },
    { id: "window-heat-left", label: "WINDOW HEAT LEFT", ata: "30-41", purpose: "Left window heat group" },
    { id: "window-heat-right", label: "WINDOW HEAT RIGHT", ata: "30-41", purpose: "Right window heat group" },
    { id: "rain-repellent-left", label: "RAIN REPELLENT LEFT", ata: "30-44", purpose: "Left rain-repellent pulse" },
    { id: "rain-repellent-right", label: "RAIN REPELLENT RIGHT", ata: "30-44", purpose: "Right rain-repellent pulse" },
    { id: "drain-heater", label: "DRAIN HEATER", ata: "30-71 · P18", purpose: "C233 common 115V AC MAIN BUS No.2 path for forward and aft toilet drain heaters" },
    { id: "drain-mast-air", label: "DRAIN MAST HEATER AIR", ata: "30-71 · P18", purpose: "C700 · 115V AC MAIN BUS-1 high-heat path in air mode (WDM 30-71-01 sheet 21, effectivity 359)" },
    { id: "drain-mast-ground", label: "DRAIN MAST HEATER GROUND", ata: "30-71 · P18", purpose: "C224 · 28V AC MAIN BUS-2 low-heat path in ground mode (WDM 30-71-01 sheet 21, effectivity 359)" },
  ]},
  { group: "Pitot / probe heat · ATA 30 / 34", rows: [
    { id: "psCbCaptUpperL", label: "CAPT UPPER-L HEATER", ata: "30-31", purpose: "Captain pitot heater circuit breaker" },
    { id: "psCbCaptLowerL", label: "CAPT LOWER-L HEATER", ata: "30-31", purpose: "Captain secondary heater channel" },
    { id: "psCbFoUpperR", label: "F/O UPPER-R HEATER", ata: "30-31", purpose: "First officer pitot heater circuit breaker" },
    { id: "psCbFoLowerR", label: "F/O LOWER-R HEATER", ata: "30-31", purpose: "First officer secondary heater channel" },
    { id: "psCbElevL", label: "ELEVATOR PROBE L", ata: "30-31", purpose: "Left elevator probe heater CB" },
    { id: "psCbElevR", label: "ELEVATOR PROBE R", ata: "30-31", purpose: "Right elevator probe heater CB" },
    { id: "psCbTempL", label: "TEMP PROBE L", ata: "30-31", purpose: "Left temperature probe heater CB" },
    { id: "psCbTempR", label: "TEMP PROBE R", ata: "30-31", purpose: "Right temperature probe heater CB" },
    { id: "psCbTemp", label: "TEMP PROBE LEGACY", ata: "30-31", purpose: "Compatibility CB retained for prior trainer state" },
  ]},
  { group: "Navigation / communications / warning / recording · ATA 22 / 23 / 33 / 35 / 52", rows: [
    { id: "yaw-damper", label: "YAW DAMPER", ata: "22-15", purpose: "Yaw damper power and signal path" },
    { id: "irs-left", label: "IRS LEFT", ata: "34 (trainer source path)", purpose: "Left IRS alignment / attitude source" },
    { id: "irs-right", label: "IRS RIGHT", ata: "34 (trainer source path)", purpose: "Right IRS alignment / attitude source" },
    { id: "elt", label: "ELT", ata: "25/23 trainer path", purpose: "ELT arm/on transmission cue" },
    { id: "crew-oxygen-indication", label: "CREW OXY IND", ata: "35-21", purpose: "Crew oxygen pressure indication" },
    { id: "passenger-oxygen-control", label: "PASS OXY CONTROL", ata: "35-21", purpose: "Passenger oxygen deployment/control model" },
    { id: "door-warning", label: "DOOR WARNING", ata: "52-71", purpose: "Door position warning annunciation" },
    { id: "cvr", label: "CVR", ata: "23-71", purpose: "Recorder power, test and erase interlock" },
    { id: "service-interphone", label: "SERVICE INTERPHONE", ata: "23-41", purpose: "Service/attendant interphone path" },
    { id: "hf-1", label: "HF COMM 1", ata: "23-11", purpose: "Trainer-separate HF-1 radio power path" },
    { id: "hf-2", label: "HF COMM 2", ata: "23-11", purpose: "Trainer-separate HF-2 radio power path; exact aircraft CB wiring remains WDM-effectivity dependent" },
  ]},
  { group: "Brakes · ATA 32", rows: [
    { id: "antiskid-inbd", label: "ANTISKID INBOARD", ata: "32-41", purpose: "Independent inboard antiskid channel" },
    { id: "antiskid-outbd", label: "ANTISKID OUTBOARD", ata: "32-41", purpose: "Independent outboard antiskid channel" },
    { id: "autobrake", label: "AUTOBRAKE CONTROL", ata: "32-42", purpose: "Autobrake control/arming path; channel rule remains effectivity-sensitive" },
  ]},
];

function derivedStatus(id: PanelBreakerId, s: SimStore, d: ReturnType<typeof useDerived>) {
  if (isPitotBreakerId(id)) return `SHARED PITOT / PROBE CIRCUIT · ${s[id] ? "CLOSED" : "OPEN"}`;
  switch (id) {
    case "eng1-ign-left": return d.ignition1LeftOn ? "ENERGIZED" : "NOT ENERGIZED";
    case "eng1-ign-right": return d.ignition1RightOn ? "ENERGIZED" : "NOT ENERGIZED";
    case "eng2-ign-left": return d.ignition2LeftOn ? "ENERGIZED" : "NOT ENERGIZED";
    case "eng2-ign-right": return d.ignition2RightOn ? "ENERGIZED" : "NOT ENERGIZED";
    case "alpha-vane-left": return s.probeHeatAlphaL && s.circuitBreakers["alpha-vane-left"] ? "LEFT HEATER SELECTED" : "LEFT HEATER OFF";
    case "alpha-vane-right": return s.probeHeatAlphaR && s.circuitBreakers["alpha-vane-right"] ? "RIGHT HEATER SELECTED" : "RIGHT HEATER OFF";
    case "fuel-heat-1": return `${d.fuelHeatValveOpen ? "VALVE OPEN" : "VALVE CLOSED"} / ΔP ${d.fuelFilterDeltaP1Psi.toFixed(1)} PSI · ${Math.ceil(Math.max(0, 60 - s.fuelHeatElapsedSec))}s`;
    case "fuel-heat-2": return `${d.fuelHeatValve2Open ? "VALVE OPEN" : "VALVE CLOSED"} / ΔP ${d.fuelFilterDeltaP2Psi.toFixed(1)} PSI · ${Math.ceil(Math.max(0, 60 - s.fuelHeat2ElapsedSec))}s`;
    case "fuel-temp-indication": return !d.fuelTempIndicationPowered ? "OFF / NO 28V AC BUS 2" : d.fuelTempLow ? "LOW TEMP CUE" : `FUEL ${Math.round(s.fuelTempC)}°C`;
    case "recirc-fan": return d.recircFanPowered ? "FAN RUNNING" : "FAN OFF";
    case "mix-valve": return "MIX-VALVE PATH";
    case "equipment-cooling-supply": return d.equipmentCoolingSupplyPowered ? "SUPPLY POWERED" : "SUPPLY OFF";
    case "equipment-cooling-exhaust": return d.equipmentCoolingExhaustPowered ? "EXHAUST POWERED" : "EXHAUST OFF";
    case "yaw-damper": return d.yawDamperEffective ? "DAMPING EFFECTIVE" : "NOT EFFECTIVE";
    case "gen-drive-disc-1": return d.generatorDrive1Disconnected ? "DRIVE DISCONNECTED" : s.gen1Disc ? "COMMAND INHIBITED / SOLENOID FAIL" : "DRIVE CONNECTED";
    case "gen-drive-disc-2": return d.generatorDrive2Disconnected ? "DRIVE DISCONNECTED" : s.gen2Disc ? "COMMAND INHIBITED / SOLENOID FAIL" : "DRIVE CONNECTED";
    case "gen-drive-indication-1": return s.circuitBreakers["gen-drive-indication-1"] ? `OIL ${Math.round(s.genDriveOilPressure1Psi)} PSI / ${Math.round(s.genDriveOilTemp1C)}°C` : "INDICATION CIRCUIT OPEN";
    case "gen-drive-indication-2": return s.circuitBreakers["gen-drive-indication-2"] ? `OIL ${Math.round(s.genDriveOilPressure2Psi)} PSI / ${Math.round(s.genDriveOilTemp2C)}°C` : "INDICATION CIRCUIT OPEN";
    case "ac-28v-main-bus-2": return d.ac28vMainBus2Powered ? "28V AC BUS 2 POWERED" : !d.acMainBus2Powered ? "NO 115V AC MAIN BUS 2 SOURCE" : "28V AC BUS 2 FEED CB OPEN";
    case "window-heat-left": return s.windowHeatLFwd || s.windowHeatLSide ? "LEFT HEAT SELECTED" : "LEFT HEAT OFF";
    case "window-heat-right": return s.windowHeatRFwd || s.windowHeatRSide ? "RIGHT HEAT SELECTED" : "RIGHT HEAT OFF";
    case "rain-repellent-left": return d.rainRepellentLActive ? "PULSE ACTIVE" : "NO ACTIVE PULSE";
    case "rain-repellent-right": return d.rainRepellentRActive ? "PULSE ACTIVE" : "NO ACTIVE PULSE";
    case "drain-heater": return `FWD ${Math.round(s.drainHeater1TempC)}°C / AFT ${Math.round(s.drainHeater2TempC)}°C · ${d.drainHeater1Powered || d.drainHeater2Powered ? "115V AC PATH" : "OFF / NO BUS"}`;
    case "drain-mast-air": return d.drainMastAirPowered ? `AIR MODE · FWD ${Math.round(s.drainMastForwardTempC)}°C / AFT ${Math.round(s.drainMastAftTempC)}°C` : "AIR MODE NOT POWERED";
    case "drain-mast-ground": return d.drainMastGroundPowered ? `GROUND MODE · FWD ${Math.round(s.drainMastForwardTempC)}°C / LINE ${Math.round(s.drainMastForwardLineTempC)}°C` : "GROUND MODE NOT POWERED";
    case "crew-oxygen-indication": return d.oxygenPressureIndicated ? `${Math.round(s.crewOxyPsi)} PSI INDICATED` : "INDICATION OFF";
    case "passenger-oxygen-control": return d.passengerOxygenDeployed ? "DEPLOYED" : "NOT DEPLOYED";
    case "door-warning": return d.doorWarning ? "DOOR WARNING ACTIVE" : "WARNING INACTIVE";
    case "cvr": return d.cvrPowered ? "RECORDER POWERED" : "RECORDER OFF";
    case "elt": return !s.circuitBreakers.elt ? "CIRCUIT OPEN" : d.eltTransmitting ? "TRANSMITTING CUE" : `MODE ${s.eltMode}`;
    case "irs-left": return !s.circuitBreakers["irs-left"] ? "CB OPEN" : `${s.irsLMode} · ${Math.round(s.irsAlignL * 100)}%`;
    case "irs-right": return !s.circuitBreakers["irs-right"] ? "CB OPEN" : `${s.irsRMode} · ${Math.round(s.irsAlignR * 100)}%`;
    case "service-interphone": return d.serviceInterphoneEffective ? "INTERPHONE POWERED" : s.serviceInterphoneOn ? "SELECTED / CB OR POWER OFF" : "OFF";
    case "hf-1": return s.circuitBreakers["hf-1"] ? "HF-1 BREAKER CLOSED · RADIO POWER STILL REQUIRES DC" : "HF-1 CIRCUIT OPEN";
    case "hf-2": return s.circuitBreakers["hf-2"] ? "HF-2 BREAKER CLOSED · RADIO POWER STILL REQUIRES DC" : "HF-2 CIRCUIT OPEN";
    case "antiskid-inbd": return d.antiskidInbdOperational ? "CHANNEL OPERATIVE" : "CHANNEL INOP / INHIBITED";
    case "antiskid-outbd": return d.antiskidOutbdOperational ? "CHANNEL OPERATIVE" : "CHANNEL INOP / INHIBITED";
    case "autobrake": return d.autobrakeArmed ? "ARMED" : d.autobrakeDisarm ? "DISARMED" : "NOT ARMED";
  }
}

export function P6CircuitBreakerPanel() {
  const s = useSim();
  const d = useDerived();
  const isClosed = (id: PanelBreakerId) => isPitotBreakerId(id) ? Boolean(s[id]) : s.circuitBreakers[id] !== false;
  const toggle = (id: PanelBreakerId, closed: boolean, label: string) => {
    if (isPitotBreakerId(id)) {
      s.patch({ [id]: !closed } as never, `${label}: ${closed ? "OPEN" : "CLOSED"}`);
    } else {
      s.patch({ circuitBreakers: { ...s.circuitBreakers, [id]: !closed } }, `${label}: ${closed ? "PULLED / OPEN" : "RESET / CLOSED"}`);
    }
  };
  return (
    <section className="min-w-0 overflow-hidden rounded-md border-2 border-[#171915] bg-[#343730] text-[#e9e3ce] shadow-xl" aria-label="P6 circuit breaker trainer">
      <header className="border-b border-[#171915] bg-[#242720] px-3 py-2">
        <div className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]">P6 · Circuit Breaker Trainer</div>
        <p className="mt-1 text-[10px] leading-relaxed text-[#bcb8a6]">Tap a breaker to pull/open it or reset it closed. Open breakers interrupt the corresponding modeled path. This is an interactive trainer subset, not a complete aircraft-specific P6/P18 wiring layout. WDM 30-71-01 page 21 shows the three separate drain-heater breaker paths in P18 for effectivity 359.</p>
      </header>
      <div className="space-y-3 p-3">
        {BREAKERS.map((group) => (
          <div key={group.group} className="rounded border border-[#181a16] bg-[#2a2d27] p-2">
            <h3 className="mb-2 border-b border-[#4b4e44] pb-1 font-mono text-[9px] font-bold uppercase tracking-wider text-[#cfc8ae]">{group.group}</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {group.rows.map((breaker) => {
                const closed = isClosed(breaker.id);
                const state = derivedStatus(breaker.id, s, d);
                return (
                  <button
                    key={breaker.id}
                    type="button"
                    aria-pressed={!closed}
                    title={`${breaker.ata}: ${breaker.purpose}`}
                    onClick={() => toggle(breaker.id, closed, breaker.label)}
                    className={cn("flex min-h-[68px] min-w-0 items-stretch gap-2 rounded border px-2 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dfc76c]", closed ? "border-[#77796c] bg-[#3c4037] hover:bg-[#484c42]" : "border-red-400/70 bg-red-950/60 hover:bg-red-900/70")}
                  >
                    <span className={cn("mt-0.5 flex h-8 w-5 shrink-0 items-center justify-center rounded-sm border font-mono text-[8px] font-bold", closed ? "border-[#9da08f] bg-[#b6b9a7] text-[#242720]" : "border-red-300 bg-red-500 text-white")}>{closed ? "IN" : "OUT"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words font-mono text-[9px] font-bold uppercase tracking-wide">{breaker.label}</span>
                      <span className="mt-1 block break-words text-[9px] leading-snug text-[#b9b6a8]">{breaker.purpose}</span>
                      <span className={cn("mt-1 block break-words text-[9px] font-semibold", closed ? "text-emerald-300" : "text-red-200")}>{state}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <details className="rounded border border-[#181a16] bg-[#2a2d27] p-2">
          <summary className="cursor-pointer select-none font-mono text-[9px] font-bold uppercase tracking-wider text-[#e3dcbf]">Fault injection · igniters, fuel heat and drain heaters</summary>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {([
              ["igniter1LeftFailure", "ENG 1 LEFT IGNITER FAIL"],
              ["igniter1RightFailure", "ENG 1 RIGHT IGNITER FAIL"],
              ["igniter2LeftFailure", "ENG 2 LEFT IGNITER FAIL"],
              ["igniter2RightFailure", "ENG 2 RIGHT IGNITER FAIL"],
              ["fuelFilterIcingFault1", "ENG 1 FUEL FILTER ICING"],
              ["fuelFilterIcingFault2", "ENG 2 FUEL FILTER ICING"],
              ["fuelHeatFailure", "ENG 1 FUEL HEATER FAIL"],
              ["fuelHeatFailure2", "ENG 2 FUEL HEATER FAIL"],
              ["drainHeaterFailure1", "FWD TOILET DRAIN HEATER FAIL"],
              ["drainHeaterFailure2", "AFT TOILET DRAIN HEATER FAIL"],
              ["drainMastAirFailure", "DRAIN MAST AIR CIRCUIT FAIL"],
              ["drainMastGroundFailure", "DRAIN MAST GROUND CIRCUIT FAIL"],
              ["alphaVaneHeatFailureL", "LEFT ALPHA VANE HEAT FAIL"],
              ["alphaVaneHeatFailureR", "RIGHT ALPHA VANE HEAT FAIL"],
            ] as const).map(([fault, label]) => {
              const active = s.faults[fault];
              return <button type="button" key={fault} aria-pressed={active} onClick={() => s.toggleFault(fault)} className={cn("rounded border px-2 py-2 text-left font-mono text-[9px] font-bold", active ? "border-red-400 bg-red-950 text-red-100" : "border-[#77796c] bg-[#3c4037] text-[#ddd7c2]")}>{label} · {active ? "FAULT ACTIVE" : "NORMAL"}</button>;
            })}
          </div>
        </details>
        <p className="text-[9px] leading-relaxed text-[#b4b09f]">Verification note: exact breaker names, location, bus source and aircraft effectivity must be traced to the applicable WDM sheets before treating this panel as an aircraft-accurate P6 reproduction.</p>
      </div>
    </section>
  );
}
