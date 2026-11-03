import type { Derived, Interlock, SimState } from "./types";
import { deriveLights } from "./lights.ts";
import { PARTS } from "../../data/components.ts";

export function derive(s: SimState): Derived {
  // Electrical sources are modeled independently: engine generators, APU
  // generator, and external (GPU) power are AC sources. Engine starters are
  // deliberately NOT electrical loads; their starter valves/meters use DC
  // control power while the starter itself is pneumatic.
  const batteryPower = s.battery && !s.faults.batteryFailure;
  const groundPowerAvailable = s.externalPowerConnected;
  const externalAcConnected = groundPowerAvailable && s.groundPowerOn && !s.faults.externalPowerContactorFailure;
  const apuAvailable = s.apuRpm >= 95 && s.apuMaster !== "OFF" && !s.apuFirePulled && !s.faults.apuOverspeed && !s.faults.apuHighOilTemperature;
  const apuLowOil = s.apuMaster !== "OFF" && (s.apuLowOilLightOn || s.apuOilPsi <= 45);
  // Combustion/thrust state and mechanical accessory rotation are distinct.
  // After fuel cutoff, the compressor/accessory gearbox keeps rotating during
  // rundown. Do not tie the EDP to the fuel lever or the 40% combustion/idle
  // boundary. The 5% N2 cutoff below is a trainer approximation for near-stop
  // pump delivery, not a Boeing-published EDP cutout value.
  const eng1AccessoryDriven = s.n2_1 > 5;
  const eng2AccessoryDriven = s.n2_2 > 5;
  // Breaker defaults are fail-safe for old saves that predate the P6 model.
  const cbClosed = (id: keyof SimState["circuitBreakers"]) => s.circuitBreakers?.[id] !== false;
  const eng1Running = eng1AccessoryDriven && s.lever1;
  const eng2Running = eng2AccessoryDriven && s.lever2;
  // Generator protection follows ATA 24: abnormal frequency/voltage/current or
  // differential conditions trip the generator after the protection delay.
  // Open-phase is deliberately NOT treated as total generator loss; it affects
  // three-phase users and their protective breakers.
  const generator1ProtectionDemand = s.gen1 && (s.faults.generator1OverFrequency || s.faults.generator1UnderFrequency || s.faults.generator1OverVoltage || s.faults.generator1UnderVoltage || s.faults.generator1OverCurrent || s.faults.generator1Differential);
  const generator2ProtectionDemand = s.gen2 && (s.faults.generator2OverFrequency || s.faults.generator2UnderFrequency || s.faults.generator2OverVoltage || s.faults.generator2UnderVoltage || s.faults.generator2OverCurrent || s.faults.generator2Differential);
  const generator1ProtectionTripped = s.generator1ProtectionLatched || (generator1ProtectionDemand && s.generator1ProtectionTimer >= 0.40);
  const generator2ProtectionTripped = s.generator2ProtectionLatched || (generator2ProtectionDemand && s.generator2ProtectionTimer >= 0.40);
  const generator1ThreePhaseHealthy = !s.faults.openPhase1 && !generator1ProtectionTripped;
  const generator2ThreePhaseHealthy = !s.faults.openPhase2 && !generator2ProtectionTripped;
  const externalPowerSelected = externalAcConnected;
  // ATA 26-21-0: pulling the engine fire switch trips the generator control
  // relay. The relay de-energizes the generator field and disconnects the
  // generator from the AC bus within 5–10 seconds (cross-ref AMM 76-21-00).
  // Modelled here as an immediate source removal once the handle is pulled;
  // the physical field collapse is within the cited window.
  const gen1DriveDisconnected = s.gen1Disc && cbClosed("gen-drive-disc-1") && !s.faults.genDriveDisconnectFailure1;
  const gen2DriveDisconnected = s.gen2Disc && cbClosed("gen-drive-disc-2") && !s.faults.genDriveDisconnectFailure2;
  const gen1Source = eng1Running && s.gen1 && !gen1DriveDisconnected && !s.groundPowerOn && !externalPowerSelected && !s.faults.generator1Failure && !generator1ProtectionTripped && !s.engine1FirePulled;
  const gen2Source = eng2Running && s.gen2 && !gen2DriveDisconnected && !s.groundPowerOn && !externalPowerSelected && !s.faults.generator2Failure && !generator2ProtectionTripped && !s.engine2FirePulled;
  // ATA 24: there is ONE APU generator. The left/right APU control switches
  // select which associated load bus the APU generator is connected to; they
  // are not separate left/right generators.
  // GRD PWR and the APU generator are interlocked: when the external-power
  // contactor is energized, the APU generator breaker is tripped so the two
  // AC sources cannot be paralleled.
  const apuGeneratorAvailable =
    apuAvailable && s.apuGen && !s.groundPowerOn && !s.faults.apuGeneratorBreakerFailure && !externalAcConnected;
  const apuLeftSource = apuGeneratorAvailable && s.apuLeftControl;
  const apuRightSource = apuGeneratorAvailable && s.apuRightControl;

  // ATA 24: engine generators take their associated generator buses when
  // selected and valid. External/APU power supplies only the load-bus side
  // not already occupied by that engine generator. This models source
  // transfer without paralleling unlike sources on the same bus.
  // External power cannot remain paralleled with an engine generator. The
  // external-power contactor drops out when a selected engine generator is
  // actually valid (not merely when the engine is running).
  const externalAc = externalAcConnected && !gen1Source && !gen2Source;
  const externalPowerContactorClosed = externalAc;
  const generator1BusPowered = gen1Source;
  const generator2BusPowered = gen2Source;
  // NOT IN USE is a safe-to-remove indication only after the external source
  // has dropped out because another aircraft source has taken the buses.
  const externalPowerNotInUse = groundPowerAvailable && !externalPowerContactorClosed;
  const tieSource1 = !generator1BusPowered && !s.faults.btb1Failure && (externalAc || apuLeftSource);
  const tieSource2 = !generator2BusPowered && !s.faults.btb2Failure && (externalAc || apuRightSource);

  // R3/R4 are the engine-generator transfer relays. They are used only when
  // the corresponding transfer bus has no direct generator/tie source and the
  // BUS TRANSFER switch is in AUTO. The failed-side transfer bus is then
  // picked up from the opposite generator bus.
  // ATA 24 transfer relays R3/R4 have a short transfer delay. The state
  // timers are accumulated by step(); derive only closes the alternate path
  // after the documented 0.1–0.2 s transfer interval has elapsed.
  const transferRelay1Demand = s.busTie && !s.faults.transferRelay1Failure && !generator1BusPowered && !tieSource1 && generator2BusPowered;
  const transferRelay2Demand = s.busTie && !s.faults.transferRelay2Failure && !generator2BusPowered && !tieSource2 && generator1BusPowered;
  const transferRelay1Alt = transferRelay1Demand && s.transferRelay1Timer >= 0.15;
  const transferRelay2Alt = transferRelay2Demand && s.transferRelay2Timer >= 0.15;
  const transferBus1Powered = generator1BusPowered || tieSource1 || transferRelay1Alt;
  const transferBus2Powered = generator2BusPowered || tieSource2 || transferRelay2Alt;
  // Main AC buses are separate WDM subjects from the transfer buses. The main
  // buses do not inherit an alternate transfer-relay feed merely because the
  // opposite transfer bus has power. Keep those paths distinct for loads whose
  // WDM feed is explicitly MAIN BUS 1/2 (not TRANSFER BUS 1/2).
  const acMainBus1Powered = generator1BusPowered || tieSource1;
  const acMainBus2Powered = generator2BusPowered || tieSource2;
  // WDM CH24 24-53-21 shows 28V AC MAIN BUS NO.2 fed from 115V AC MAIN BUS
  // NO.2 through its bus circuit. Circuit-breaker naming/position can vary by
  // effectivity, so this trainer CB is a logical representation of that feed.
  const ac28vMainBus2Powered = acMainBus2Powered && cbClosed("ac-28v-main-bus-2");
  const btb1Closed = tieSource1;
  const btb2Closed = tieSource2;

  // ATA 24-31-00, DC Generation System D&O, PDF page 163 / printed AMM
  // 24-31-0 page 1: TR1 is fed by Transfer Bus 1, TR2 by Transfer Bus 2,
  // while TR3 is fed specifically from Generator Bus 2 and supplies the DC
  // tie bus. Preserve that topology: an alternate source on Transfer Bus 2
  // may run TR2, but must not falsely energize TR3 when Generator Bus 2 is dead.
  const tr1InputAvailable =
    (generator1BusPowered && generator1ThreePhaseHealthy) ||
    tieSource1 ||
    (transferRelay1Alt && generator2ThreePhaseHealthy);
  const tr2InputAvailable =
    (generator2BusPowered && generator2ThreePhaseHealthy) ||
    tieSource2 ||
    (transferRelay2Alt && generator1ThreePhaseHealthy);
  const tr1Powered = tr1InputAvailable && !s.faults.tr1Failure;
  const tr2Powered = tr2InputAvailable && !s.faults.tr2Failure;
  const tr3InputAvailable = (generator2BusPowered && generator2ThreePhaseHealthy) || tieSource2;
  const tr3Powered = tr3InputAvailable && !s.faults.tr3Failure;
  const dcBus1Powered = tr1Powered || tr3Powered;
  const dcBus2Powered = tr2Powered || tr3Powered;
  // The battery bus can be supplied from TR3 while the battery switch is ON;
  // the hot-battery bus remains battery-only. This distinction is required
  // for the documented TR3/BAT BUS test with external or APU power.
  const hotBatteryBusPowered = batteryPower;
  const batteryBusPowered = batteryPower || (s.battery && tr3Powered);
  const essentialDcPower = batteryBusPowered || dcBus1Powered || dcBus2Powered;
  const dcPower = essentialDcPower;
  // ATA 74: ignition is energized only with DC control power and an applicable
  // start/continuous-ignition selection. A ground start also requires the
  // start lever to be in IDLE; the lever then both introduces fuel and enables
  // the ignition circuit. L/R IGN provide continuous ignition after start.
  // Independent exciter paths: GRD/FLT command both channels in this trainer;
  // IGN_L and IGN_R command only the selected channel. Each path has its own CB
  // and injected failure, so a failed/unpowered igniter is no longer masked by
  // a single shared ignition boolean.
  const ignition1LeftOn = dcPower && s.lever1 && cbClosed("eng1-ign-left") && !s.faults.igniter1LeftFailure && (s.start1 === "GRD" || s.start1 === "FLT" || s.start1 === "IGN_L");
  const ignition1RightOn = dcPower && s.lever1 && cbClosed("eng1-ign-right") && !s.faults.igniter1RightFailure && (s.start1 === "GRD" || s.start1 === "FLT" || s.start1 === "IGN_R");
  const ignition2LeftOn = dcPower && s.lever2 && cbClosed("eng2-ign-left") && !s.faults.igniter2LeftFailure && (s.start2 === "GRD" || s.start2 === "FLT" || s.start2 === "IGN_L");
  const ignition2RightOn = dcPower && s.lever2 && cbClosed("eng2-ign-right") && !s.faults.igniter2RightFailure && (s.start2 === "GRD" || s.start2 === "FLT" || s.start2 === "IGN_R");
  const ignition1On = ignition1LeftOn || ignition1RightOn;
  const ignition2On = ignition2LeftOn || ignition2RightOn;
  const externalDcControl = externalAc || tieSource1 || tieSource2;
  const acPower = transferBus1Powered || transferBus2Powered;
  const indicationPower = dcPower || externalDcControl;
  // ATA 21/22/23/24/26/30/35/52: global controls and indications formerly
  // stored only by the overhead UI. Rates and simplified auto-deploy criteria
  // are trainer behaviour, not maintenance limits published by Boeing.
  const recircFanPowered = !!s.recirc && acPower && cbClosed("recirc-fan") && !s.faults.recircFanFailure;
  const recircAirflow = recircFanPowered ? 0.18 : 0;
  // ATA 75-12-01 WDM, sheet 1 and sheet 21: the ENG 1 FUEL HEAT circuit
  // (C401) is supplied from 28V DC BUS-1; ENG 2 FUEL HEAT (C402) is supplied
  // from 28V DC BUS-2. Keep these feeds independent: a live general DC system
  // must not make both engine heater channels available when only one bus is
  // powered. The WDM sheets supplied include different effectivity groups, but
  // both show this Bus-1 / Bus-2 separation. AMM ATA 73-14-0 provides the
  // semiautomatic one-minute switch/timer behavior; thermal rates remain trainer
  // values rather than Boeing calibration limits.
  const fuelHeatControlAvailable1 = dcBus1Powered && cbClosed("fuel-heat-1");
  const fuelHeatControlAvailable2 = dcBus2Powered && cbClosed("fuel-heat-2");
  const fuelHeaterPowered = fuelHeatControlAvailable1 && s.fuelHeat && s.fuelHeatElapsedSec < 60 && !s.faults.fuelHeatFailure;
  const fuelHeater2Powered = fuelHeatControlAvailable2 && s.fuelHeat2 && s.fuelHeat2ElapsedSec < 60 && !s.faults.fuelHeatFailure2;
  const fuelAmbientC = (Number(s.ambientTempF ?? 59) - 32) * 5 / 9;
  const fuelHeatValveOpen = fuelHeaterPowered;
  const fuelHeatValve2Open = fuelHeater2Powered;
  // AMM ATA 73-14-0: the differential-pressure switch closes at 4.4–5.8 psi.
  // Use 5.1 psi as a midpoint trainer trip point (not a new maintenance limit).
  // The filter icing light is only visible with indication power and when its
  // respective engine is running and producing fuel-filter differential.
  const fuelFilterDeltaP1Psi = eng1Running ? 3.0 + 2.5 * Math.max(0, Math.min(1, s.fuelFilterIceFraction1)) : 0;
  const fuelFilterDeltaP2Psi = eng2Running ? 3.0 + 2.5 * Math.max(0, Math.min(1, s.fuelFilterIceFraction2)) : 0;
  const fuelFilterIcing1 = indicationPower && eng1Running && fuelFilterDeltaP1Psi >= 5.1;
  const fuelFilterIcing2 = indicationPower && eng2Running && fuelFilterDeltaP2Psi >= 5.1;
  // Supplied WDM sheet 28-42-01 (effectivity 359) shows C355 FUEL TEMP
  // WDM CH28 fuel-temperature indication and CH24 24-53-21 place this gauge
  // on 28V AC MAIN BUS NO.2. Do not substitute 115V AC TRANSFER BUS NO.2.
  const fuelTempIndicationPowered = ac28vMainBus2Powered && cbClosed("fuel-temp-indication");
  const fuelTempLow = fuelTempIndicationPowered && s.fuelTempC < 0;
  const equipmentCoolingSupplyPowered = acPower && cbClosed("equipment-cooling-supply") && !s.faults.equipmentCoolingFailure;
  const equipmentCoolingExhaustPowered = acPower && cbClosed("equipment-cooling-exhaust") && !s.faults.equipmentCoolingFailure;
  // Selector NORMAL has greater trainer flow than ALTERNATE; this is a
  // qualitative training model, not an AMM airflow quantity.
  const supplyCoolingFactor = s.equipSupply === "NORMAL" ? 1 : 0.65;
  const exhaustCoolingFactor = s.equipExhaust === "NORMAL" ? 1 : 0.65;
  const equipmentCoolingFlow = (equipmentCoolingSupplyPowered ? 0.5 * supplyCoolingFactor : 0) + (equipmentCoolingExhaustPowered ? 0.5 * exhaustCoolingFactor : 0);
  const equipmentCoolingOverheat = indicationPower && (s.faults.equipmentCoolingFailure || s.equipmentBayTempC >= 45);
  const yawDamperEffective = !!s.yawDamper && dcPower && cbClosed("yaw-damper") && s.hydBPress >= 800 && !s.faults.yawDamperFailure;
  const estimatedCabinAltitudeFt = Math.max(0, Number(s.psFlightAltFt ?? 0) - Math.max(0, Number(s.cabinDiff ?? 0)) * 1600);
  const oxygenPressureIndicated = dcPower && cbClosed("crew-oxygen-indication") && !s.faults.oxygenSystemFailure;
  const passengerOxygenDeployed = !s.faults.oxygenSystemFailure && cbClosed("passenger-oxygen-control") && (s.passOxyMode === "ON" || (s.passOxyAutoDeploy && estimatedCabinAltitudeFt >= 14000));
  const doorWarning = indicationPower && cbClosed("door-warning") && !s.faults.doorWarningFailure && Object.values(s.doorPositions).some(Boolean);
  const cvrPowered = dcPower && cbClosed("cvr") && !s.faults.cvrFailure;
  const cvrOff = !cvrPowered;
  const serviceInterphoneEffective = !!s.serviceInterphoneOn && dcPower && cbClosed("service-interphone");
  const serviceCallEffective = (s.cabinCallActive || s.groundCrewCallActive) && dcPower && cbClosed("service-interphone");
  const eltTransmitting = cbClosed("elt") && (s.eltMode === "ON" || (s.eltMode === "ARM" && (s.rwyPhase === "OVERRUN" || (s.rwyPhase === "STOPPED" && Math.abs(s.rwyYawRate) > 18))));
  const rainRepellentLActive = indicationPower && cbClosed("rain-repellent-left") && s.rainRepelTimerL > 0 && !s.faults.rainRepellentFailure;
  const rainRepellentRActive = indicationPower && cbClosed("rain-repellent-right") && s.rainRepelTimerR > 0 && !s.faults.rainRepellentFailure;
  const generatorDrive1LowOilPressure = indicationPower && cbClosed("gen-drive-indication-1") && eng1AccessoryDriven && (s.genDriveOilPressure1Psi < 15 || s.faults.genDriveOilPressureLow1 || gen1DriveDisconnected);
  const generatorDrive2LowOilPressure = indicationPower && cbClosed("gen-drive-indication-2") && eng2AccessoryDriven && (s.genDriveOilPressure2Psi < 15 || s.faults.genDriveOilPressureLow2 || gen2DriveDisconnected);
  const generatorDrive1HighOilTemp = indicationPower && cbClosed("gen-drive-indication-1") && (s.genDriveOilTemp1C >= 120 || s.faults.genDriveOilOverheat1);
  const generatorDrive2HighOilTemp = indicationPower && cbClosed("gen-drive-indication-2") && (s.genDriveOilTemp2C >= 120 || s.faults.genDriveOilOverheat2);
  // WDM CH30 sheet 30-71-01, printed page 21, effectivity 359, is the
  // authority for these wire-level source assignments:
  // C233 toilet drain heater: 115V AC BUS NO.2;
  // C700 drain-mast AIR: 115V AC BUS NO.1;
  // C224 drain-mast GROUND: 28V AC MAIN BUS NO.2.
  // Do not substitute Transfer Bus power for a named MAIN BUS feed: the
  // transfer relay can energize a transfer bus from the opposite generator
  // without proving the corresponding main bus is energized. The 28V AC MAIN
  // BUS NO.2 transformer/feed is a separate logical trainer gate.
  const drainHeater1Powered = acMainBus2Powered && cbClosed("drain-heater") && !s.faults.drainHeaterFailure1;
  const drainHeater2Powered = acMainBus2Powered && cbClosed("drain-heater") && !s.faults.drainHeaterFailure2;
  const drainMastAirPowered = !s.wow && !externalAc && acMainBus1Powered && cbClosed("drain-mast-air") && !s.faults.drainMastAirFailure;
  const drainMastGroundPowered = s.wow && ac28vMainBus2Powered && cbClosed("drain-mast-ground") && !s.faults.drainMastGroundFailure;
  const drainMastForwardPowered = drainMastAirPowered || drainMastGroundPowered;
  const drainMastForwardLinePowered = drainMastForwardPowered;
  const drainMastAftPowered = drainMastForwardPowered;
  const drainHeater1Hot = drainHeater1Powered && s.drainHeater1TempC >= 20;
  const drainHeater2Hot = drainHeater2Powered && s.drainHeater2TempC >= 20;
  // ATA 30-31 alpha-vane heater power and icing response are shared system
  // state. Thermal/ice rates are trainer-only qualitative values.
  const alphaVaneHeatedL = acPower && cbClosed("alpha-vane-left") && s.probeHeatAlphaL && !s.faults.alphaVaneHeatFailureL;
  const alphaVaneHeatedR = acPower && cbClosed("alpha-vane-right") && s.probeHeatAlphaR && !s.faults.alphaVaneHeatFailureR;
  const doorPressureLeak = Object.values(s.doorPositions).some(Boolean);

  // Standby power: in AUTO, normal standby AC/DC follow Transfer Bus 1 and
  // DC Bus 1. If either normal source is lost, the battery/static-inverter
  // branch takes over. BAT selects the battery/static-inverter branch directly.
  const standbyAutoNormal = s.standbyPower === "AUTO" && s.battery && batteryPower && transferBus1Powered && dcBus1Powered;
  const standbyAutoTransfer = s.standbyPower === "AUTO" && s.battery && batteryPower && !standbyAutoNormal;
  const staticInverterPowered = batteryPower && !s.faults.staticInverterFailure && (s.standbyPower === "BAT" || standbyAutoTransfer);
  const standbyAcPowered = standbyAutoNormal || staticInverterPowered;
  const standbyDcPowered = standbyAutoNormal ? dcBus1Powered : staticInverterPowered;
  const standbyAcSource = standbyAutoNormal ? "TRANSFER BUS 1" : staticInverterPowered ? "STATIC INVERTER" : "NONE";
  const standbyDcSource = standbyAutoNormal ? "DC BUS 1" : staticInverterPowered ? "BATTERY BUS" : "NONE";

  // Ground service is a separate branch: it can be energized without making
  // the whole aircraft AC distribution live. When AC power is available, the
  // selected GROUND SERVICE switch energizes the service bus. The battery
  // charger is supplied from this service network and may also receive an
  // alternate aircraft-source feed through the generator/main-bus network.
  // GROUND SERVICE is a separate AC service-bus function. The external
  // receptacle must actually be energized, or an aircraft AC source must be
  // available; merely having a cable physically connected is not AC power.
  // Ground-service switch is a separate external-power function. GROUND POWER
  // overrides/deactivates the ground-service switch; when GROUND POWER is on,
  // the service circuits are already fed by the normal external-power path.
  const groundServiceSource = groundPowerAvailable || generator1BusPowered || transferRelay1Alt || apuLeftSource;
  const groundServiceBusPowered = (externalAcConnected) || (s.groundServiceOn && !s.groundPowerOn && groundServiceSource);
  // Battery charger input is the ground-service bus or the No.2 main bus
  // alternate charger feed. This permits the documented three-generator, APU,
  // and external-power charging cases without making every AC bus a charger input.
  const no2MainBusChargerFeed = transferBus2Powered;
  const batteryChargerPowered = groundServiceBusPowered || no2MainBusChargerFeed;
  // ATA 24 identifies a separate 28-VAC single-phase branch derived from the
  // 115-VAC system through transformers.
  const ac28vPowered = acPower;

  const electricalSource1 = generator1BusPowered ? "GEN 1" : externalAc ? "GPU" : apuLeftSource ? "APU GEN" : transferRelay1Alt ? "GEN 2 XFER" : "NONE";
  const electricalSource2 = generator2BusPowered ? "GEN 2" : externalAc ? "GPU" : apuRightSource ? "APU GEN" : transferRelay2Alt ? "GEN 1 XFER" : "NONE";

  const apuBleedOpen = apuAvailable && s.apuBleed && s.apuBleedValve > 0.7;
  // ATA 28 fuel-feed model. Each tank has independently powered boost pumps;
  // pumps in the same tank are intentionally not treated as one electrical
  // source. The crossfeed valve opens a common manifold so either tank can
  // feed either engine. With pumps off, the engine can still draw by suction,
  // but feed pressure is low and the P5 LOW PRESSURE indication remains on.
  const fuelPump1Selected = s.fuelPump1Fwd || s.fuelPump1Aft;
  const fuelPump2Selected = s.fuelPump2Fwd || s.fuelPump2Aft;
  const fuelCenterSelected = s.fuelPumpCenter1 || s.fuelPumpCenter2;
  // Each P5 boost-pump switch feeds an individual pump. The legacy tank-level
  // fault controls still fail both pumps in that tank for backwards-compatible
  // scenarios; the individual fault controls permit single-pump isolation.
  const fuelPump1FwdOn = acPower && s.fuelPump1Fwd && !s.faults.fuelBoostPump1Fail && !s.faults.fuelTank1FwdPumpFail && s.fuelTank1 > 0.5;
  const fuelPump1AftOn = acPower && s.fuelPump1Aft && !s.faults.fuelBoostPump1Fail && !s.faults.fuelTank1AftPumpFail && s.fuelTank1 > 0.5;
  const fuelPump2FwdOn = acPower && s.fuelPump2Fwd && !s.faults.fuelBoostPump2Fail && !s.faults.fuelTank2FwdPumpFail && s.fuelTank2 > 0.5;
  const fuelPump2AftOn = acPower && s.fuelPump2Aft && !s.faults.fuelBoostPump2Fail && !s.faults.fuelTank2AftPumpFail && s.fuelTank2 > 0.5;
  const fuelCenterPump1On = acPower && s.fuelPumpCenter1 && !s.faults.fuelCenterPumpFail && !s.faults.fuelCenterPump1Fail && !s.fuelCenterPump1RelayTripped && s.fuelTankCenter > 0.5;
  const fuelCenterPump2On = acPower && s.fuelPumpCenter2 && !s.faults.fuelCenterPumpFail && !s.faults.fuelCenterPump2Fail && !s.fuelCenterPump2RelayTripped && s.fuelTankCenter > 0.5;
  const fuelPump1On = fuelPump1FwdOn || fuelPump1AftOn;
  const fuelPump2On = fuelPump2FwdOn || fuelPump2AftOn;
  const fuelCenterPumpOn = fuelCenterPump1On || fuelCenterPump2On;
  const fuelPump1FwdLowPressure = s.fuelPump1Fwd && !fuelPump1FwdOn;
  const fuelPump1AftLowPressure = s.fuelPump1Aft && !fuelPump1AftOn;
  const fuelPump2FwdLowPressure = s.fuelPump2Fwd && !fuelPump2FwdOn;
  const fuelPump2AftLowPressure = s.fuelPump2Aft && !fuelPump2AftOn;
  const fuelCenterPump1LowPressure = s.fuelPumpCenter1 && !fuelCenterPump1On;
  const fuelCenterPump2LowPressure = s.fuelPumpCenter2 && !fuelCenterPump2On;
  const crossfeedOpen = dcPower && s.fuelCrossfeed && !s.faults.fuelCrossfeedValveFail;
  // Engine fuel shutoff valves are the final aircraft-side isolation point.
  // ATA 26-21-0 / 26-21-01: pulling the fire switch closes the fuel shutoff
  // valve on the affected engine. ATA 28/76: start-lever cutoff also closes
  // it on effectivities equipped with the control-stand switch.
  const fuelShutoff1Open = dcPower && s.lever1 && !s.engine1FirePulled;
  const fuelShutoff2Open = dcPower && s.lever2 && !s.engine2FirePulled;
  const own1Pressure = fuelPump1On ? 32 : s.fuelTank1 > 0.5 ? 5 : 0;
  const own2Pressure = fuelPump2On ? 32 : s.fuelTank2 > 0.5 ? 5 : 0;
  const centerPressure = fuelCenterPumpOn ? 32 : 0;
  const feed1Candidates = crossfeedOpen ? [own1Pressure, own2Pressure, centerPressure] : [own1Pressure, centerPressure];
  const feed2Candidates = crossfeedOpen ? [own2Pressure, own1Pressure, centerPressure] : [own2Pressure, centerPressure];
  const fuelFeedPressure1 = fuelShutoff1Open ? Math.max(...feed1Candidates) : 0;
  const fuelFeedPressure2 = fuelShutoff2Open ? Math.max(...feed2Candidates) : 0;
  // Labels follow what fuelDrawSource() actually draws: center tank first when its
  // pumps are on, then (crossfeed open) the shared manifold supplied by the pumped
  // wing tanks, then the engine's own tank.
  const fuelFeedSource1 = fuelFeedPressure1 <= 0 ? "SHUTOFF" : fuelCenterPumpOn ? "CENTER BOOST" : crossfeedOpen && fuelPump1On && fuelPump2On ? "TANKS 1+2 CROSSFEED" : crossfeedOpen && fuelPump2On && !fuelPump1On ? "TANK 2 CROSSFEED" : fuelPump1On ? "TANK 1 BOOST" : "TANK 1 SUCTION";
  const fuelFeedSource2 = fuelFeedPressure2 <= 0 ? "SHUTOFF" : fuelCenterPumpOn ? "CENTER BOOST" : crossfeedOpen && fuelPump1On && fuelPump2On ? "TANKS 1+2 CROSSFEED" : crossfeedOpen && fuelPump1On && !fuelPump2On ? "TANK 1 CROSSFEED" : fuelPump2On ? "TANK 2 BOOST" : "TANK 2 SUCTION";
  // ATA 28-42: main-tank low-pressure lights are driven by the pump pressure
  // switches and remain illuminated when a selected pump is off/unpressurized.
  // Center-tank indications extinguish when the center pumps are selected OFF.
  const fuelLowPressure1 = fuelPump1Selected && !fuelPump1On;
  const fuelLowPressure2 = fuelPump2Selected && !fuelPump2On;
  const fuelCenterLowPressure = fuelCenterSelected && !fuelCenterPumpOn;
  const fuelScavengeActive = s.fuelScavengeTimer > 0 && s.fuelScavengeTimer < 1200 && fuelPump1On && !fuelCenterPumpOn && s.fuelTankCenter > 0.5;
  const fuelQuantityIndicationPowered = dcPower;


  // APU bleed is modeled as the left-side pneumatic source in this simulator.
  // The isolation valve can cross-feed it to the right side when open. Ground
  // pneumatic service connects in the right pack bay, so it feeds the RIGHT
  // manifold only and reaches the left side through the isolation valve.
  const apuBleedLeft = apuBleedOpen;
  const groundBleed = s.groundPneumaticConnected;
  // ATA 26-21-0 / 26-21-01: pulling the engine fire switch closes the air bleed
  // valve on the affected engine (in addition to fuel shutoff, hydraulic shutoff
  // and generator field trip). The bleed switch position is ignored once the
  // fire handle is pulled.
  const leftBleed = eng1Running && s.bleed1 && !s.bleedTrip1 && !s.engine1FirePulled;
  const rightBleed = eng2Running && s.bleed2 && !s.bleedTrip2 && !s.engine2FirePulled;

  // Per ATA 36, AUTO is closed only when BOTH engine bleed switches and BOTH
  // pack switches are ON (AUTO or HIGH). Any other switch combination commands
  // OPEN. The manual explicitly states this is based on switch positions, not
  // whether the bleed/pack valves have actually tripped.
  const packLOn = s.packL;
  const packROn = s.packR;
  const isolationOpen =
    s.isolation === "OPEN" ||
    (s.isolation === "AUTO" && !(s.bleed1 && s.bleed2 && packLOn && packROn));

  const leftManifold = apuBleedLeft || leftBleed || ((rightBleed || groundBleed) && isolationOpen);
  const rightManifold = groundBleed || rightBleed || (leftBleed && isolationOpen) || (apuBleedLeft && isolationOpen);

  const apuPsi = apuBleedOpen ? 30 + s.apuBleedValve * 14 : 0;
  const groundPsi = s.groundPneumaticConnected ? s.groundPneumaticPsi : 0;
  const engine1Psi = leftBleed ? 44 : 0;
  const engine2Psi = rightBleed ? 44 : 0;

  // Preserve the physical left/right pneumatic network. A source only reaches
  // the opposite side through the isolation valve; pressure is never copied
  // from the strongest aircraft source to both manifolds.
  // Engine/wing thermal anti-ice is a pneumatic load. It uses engine bleed air
  // rather than an independent electrical source; keep the left/right paths
  // separate and reduce the local duct pressure only when the corresponding
  // engine is actually supplying bleed air.
  const antiIceLoad1 = s.antiIce1 && leftBleed ? 5 : 0;
  const antiIceLoad2 = s.antiIce2 && rightBleed ? 5 : 0;
  const leftLocalPsi = Math.max(0, Math.max(apuPsi, engine1Psi) - antiIceLoad1);
  const rightLocalPsi = Math.max(0, Math.max(groundPsi, engine2Psi) - antiIceLoad2);
  const leftDuctPsi = leftManifold ? Math.max(leftLocalPsi, isolationOpen ? rightLocalPsi : 0) : 0;
  const rightDuctPsi = rightManifold ? Math.max(rightLocalPsi, isolationOpen ? leftLocalPsi : 0) : 0;
  const ductPsi = Math.max(leftDuctPsi, rightDuctPsi);

  // ATA 36: DUAL BLEED is an APU/engine source conflict indication.
  // It illuminates when the APU bleed valve is open, either engine bleed
  // valve is open, and the isolation valve is open. It is not simply an
  // indication that both engine bleed switches are ON.
  const dualBleed = apuBleedOpen && isolationOpen && (leftBleed || rightBleed);

  const bleed1Available = leftBleed;
  const bleed2Available = rightBleed;

  // ATA 36/21 pack-flow model. Keep the left/right paths separate and carry
  // the air through the pack stages:
  // pack valve → primary HX → ACM compressor → secondary HX → turbine →
  // water separator → 35°F valve → mix valve.
  // Pure -200 pack control is OFF/ON; the model intentionally has no HIGH mode.
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  // ATA 21 / 737-200: the pack valve feeds a downstream split at the air-mix
  // valve. The mix valve sends part of the hot pneumatic air directly toward the
  // mixing chamber while the remainder goes through the complete air-cycle path.
  // The 35°F system is independent of cabin temperature control: it takes warm
  // air from the primary-HX exit and bypasses the ACM to the turbine-discharge /
  // water-separator inlet to prevent separator icing.
  const derivePack = (
    ductPsi: number,
    packMode: "OFF" | "AUTO",
    trip: boolean,
    apuSource: boolean,
    ground: boolean,
    flaps: number,
    groundSpeedKt: number,
    mix: number,
    tempFault: SimState["tempControlFaultL"] = "NONE",
    tempMode: SimState["tempModeL"] = "MANUAL",
    tempSelectF = 75,
    cabinTempF = 75,
    ambientF = 75,
    controlPower = true,
    mixValveJammed = false,
  ) => {
    const packOn = packMode !== "OFF";
    // Pure 737-200 pack switches are modeled as OFF / ON (AUTO terminology on
    // this UI). Do not apply Classic/NG HIGH-flow schedules to this variant.
    // Ambient correction remains a small trainer approximation.
    const ambientFlowBias = clamp01((75 - ambientF) / 40) * 0.06; // 0–0.06
    const flowSchedule = apuSource
      ? 1.05 + ambientFlowBias * 0.5
      : 1.0 + ambientFlowBias * 0.3;
    const commandedInletPsi = packOn && !trip ? Math.max(0, ductPsi) : 0;
    const packValveInitiallyOpen = commandedInletPsi >= 18;
    // Normalised flow (0–1) then scaled to lbs/min for indication.
    // 1.0 schedule at full duct pressure ≈ 68 lbs/min (engine AUTO mid-point).
    const PACK_FLOW_LBS_PER_UNIT = 68;
    const totalFlowNorm = packValveInitiallyOpen
      ? clamp01((commandedInletPsi - 18) / 28) * flowSchedule
      : 0;
    const totalFlow = totalFlowNorm;
    const totalFlowLbsMin = totalFlowNorm * PACK_FLOW_LBS_PER_UNIT;

    // ATA 21 Air Mix Valve (P5-17 CONT/PASS CABIN selectors):
    // AUTO / MANUAL COOL / MANUAL WARM / OFF. AUTO uses the documented
    // temperature-regulator bridge approximation. MANUAL COOL / WARM set fixed
    // hot-fraction biases; OFF drives the valve full cold (same as pack-valve
    // closed-limit behaviour). Legacy "MANUAL" keeps continuous mix for older saves.
    let airMixValve: number;
    if (tempMode === "AUTO") {
      // Duct-limit authority: the automatic regulator never asks for more hot air than keeps the
      // supply duct under the ~140°F limit region (cold core ≈ 38°F, hot bleed ≈ 370°F → ≈ 31% hot).
      // Without this a cold-soaked cabin demanded 100% hot, the 190°F duct-overheat switch tripped,
      // the valve was driven full cold, the cabin never warmed and DUCT OVERHEAT stayed latched.
      const DUCT_LIMIT_MAX_HOT = 0.31;
      airMixValve = Math.min(DUCT_LIMIT_MAX_HOT, clamp01(0.12 + (tempSelectF - cabinTempF) * 0.045));
    } else if (tempMode === "MANUAL_COOL") {
      airMixValve = 0.12;
    } else if (tempMode === "MANUAL_WARM") {
      airMixValve = 0.82;
    } else if (tempMode === "OFF") {
      airMixValve = 0;
    } else {
      // Legacy continuous MANUAL or unknown
      airMixValve = clamp01(mix);
    }

    if (tempFault === "STUCK_COLD") airMixValve = 0;
    if (tempFault === "STUCK_HOT") airMixValve = 1;
    if (tempFault === "SENSOR_FAIL" || tempFault === "REGULATOR_FAIL") {
      // A failed automatic regulating element does not invent a pack trip. It
      // removes automatic authority and leaves the valve at its last/manual
      // commanded bias for this trainer model.
      airMixValve = tempMode === "AUTO" ? clamp01(mix) : airMixValve;
    }
    // A jammed mix valve remains at the stored mechanical mix position instead
    // of following AUTO/COOL/WARM selector changes.
    if (mixValveJammed) airMixValve = clamp01(mix);
    if (!packValveInitiallyOpen || !controlPower) airMixValve = 0;

    const mixValveHotLimit = airMixValve >= 0.995;
    const mixValveColdLimit = airMixValve <= 0.005;
    const hotBypassFlow = totalFlow * airMixValve;
    const coolingPathFlow = totalFlow * (1 - airMixValve);

    // ATA 21-52: the turbofan/ram-air sequence is discrete.
    // - Ground (air/ground relay): actuator FULL OPEN (1.0)
    // - Flight, flaps extended: intermediate position (~0.40)
    // - Flight, flaps up: CLOSED (0); pure ram-air cooling takes over
    // Pressure schedule (27–33 psi) modulates within the commanded region but
    // does not override the discrete air/ground + flap sequence.
    const coolingActive = coolingPathFlow > 0.05;
    const turbofanFullOpen = ground && coolingActive ? 1.0 : 0;
    const turbofanIntermediate = !ground && flaps > 0.02 && coolingActive ? 0.40 : 0;
    const turbofanValve = Math.max(turbofanFullOpen, turbofanIntermediate);
    const ramCooling = clamp01(groundSpeedKt / 220);
    // Ram-air cooling increases with airspeed after the turbofan closes; the
    // ground turbofan provides the cooling path while the aircraft is stopped.
    const coolingEffect = clamp01(
      0.28 +
      ramCooling * 0.38 +
      turbofanValve * 0.32 +
      (ground ? 0.04 : 0)
    );

    // Cold path: primary HX -> ACM compressor -> secondary HX -> turbine.
    const primaryHx = coolingPathFlow > 0.05;
    const primaryHxOutTempF = primaryHx
      ? Math.max(90, 150 - coolingEffect * 55 + (ambientF - 75) * 0.10)
      : 0;
    const acmCompressor = primaryHx;
    // ACM thermal model (AMM 21-51-0): two thermal switches protect the air-cycle
    // machine. One senses compressor discharge temperature; the other senses
    // turbine inlet temperature. Actuation of either closes the pack valve.
    // Trainer set-points (365 °F compressor discharge / 210 °F turbine inlet)
    // keep normal operation below the protection points described in the AMM.
    const compressorDischargeTempF = acmCompressor
      ? primaryHxOutTempF + 62 + commandedInletPsi * 0.78
      : 0;
    const secondaryHx = acmCompressor;
    const turbineInletTempF = secondaryHx
      ? compressorDischargeTempF - (42 + coolingEffect * 34)
      : 0;

    const forcedCompressorOverheat = tempFault === "COMPRESSOR_OVERHEAT";
    const forcedTurbineOverheat = tempFault === "TURBINE_OVERHEAT";
    const compressorOverheat = forcedCompressorOverheat || compressorDischargeTempF >= 365;
    const turbineOverheat = forcedTurbineOverheat || turbineInletTempF >= 210;
    const packOverheatRelay = compressorOverheat || turbineOverheat;

    // The ACM turbine is the coldest point in the cycle. The 35°F system then
    // adds a controlled amount of primary-HX air at the turbine discharge.
    const turbine = secondaryHx && !packOverheatRelay;
    const turbineDischargeTempF = turbine
      ? Math.max(5, 20 + (1 - coolingEffect) * 34 + (1 - coolingPathFlow) * 10)
      : 0;
    const waterSeparator = turbine;

    const f35TargetF = 38.5;
    const f35SensorFailure = tempFault === "F35_SENSOR_FAIL";
    const f35ValveFailure = tempFault === "F35_VALVE_FAIL";
    let f35BypassRate = 0;
    if (waterSeparator && !f35SensorFailure && controlPower) {
      const delta = f35TargetF - turbineDischargeTempF;
      const warmDelta = Math.max(1, primaryHxOutTempF - f35TargetF);
      f35BypassRate = clamp01(delta > 0 ? delta / warmDelta : 0);
    }
    if (f35ValveFailure) f35BypassRate = 0;
    const f35Valve = waterSeparator && f35BypassRate > 0.01;
    const f35BypassFlow = f35Valve ? coolingPathFlow * f35BypassRate : 0;
    const acmColdFlow = Math.max(0, coolingPathFlow - f35BypassFlow);
    const f35BypassTempF = primaryHx ? primaryHxOutTempF : 0;
    const separatorFlow = acmColdFlow + f35BypassFlow;
    const separatorSensorTempF = separatorFlow > 0
      ? ((turbineDischargeTempF * acmColdFlow) + (f35BypassTempF * f35BypassFlow)) / separatorFlow
      : 0;
    const coldTempF = separatorSensorTempF;

    // Hot bypass remains at the pneumatic-manifold temperature and joins the
    // cold air only at the mixing chamber through its dedicated check valve.
    // ATA 21 describes the hot stream as the portion of pneumatic bleed air
    // that bypasses the air-cycle machine and passes unchanged to the mixing
    // chamber.  Normal engine pneumatic air is regulated to approximately
    // 370°F (limited to 450°F) in the supplied 737-200 manual.
    const warmAirTempF = packValveInitiallyOpen ? 370 : 0;
    const coldAirFlow = separatorFlow;
    const warmAirFlow = hotBypassFlow;
    const mixedAirFlow = coldAirFlow + warmAirFlow;
    const rawMixTempF = mixedAirFlow > 0
      ? ((coldTempF * coldAirFlow) + (warmAirTempF * warmAirFlow)) / mixedAirFlow
      : 0;

    // 190°F duct switch: remove heat demand and drive the mix valve FULL COLD.
    // 250°F switch: pack overheat relay closes the pack valve and illuminates
    // PACK TRIP OFF. These are intentionally separate protection functions.
    const ductOverheat190 = tempFault === "DUCT_OVERHEAT" || rawMixTempF >= 190;
    const packTrip250 = tempFault === "PACK_OVERHEAT" || tempFault === "DUCT_OVERHEAT_250" || rawMixTempF >= 250;
    const finalMixValve = ductOverheat190 ? 0 : airMixValve;
    const mixingChamberTempF = mixedAirFlow > 0
      ? (ductOverheat190
        ? ((coldTempF * totalFlow) + (warmAirTempF * 0)) / Math.max(totalFlow, 0.0001)
        : rawMixTempF)
      : 0;

    // Thermal protection is a trip request. step() latches the resulting pack
    // trip until TRIP RESET is pressed after the overheat condition is gone.
    const effectivePackTrip = trip || packOverheatRelay || packTrip250;
    const finalPackValve = packValveInitiallyOpen && !effectivePackTrip;
    const finalFlowRate = finalPackValve ? totalFlow : 0;
    const finalFlowLbsMin = finalPackValve ? totalFlowLbsMin : 0;
    const finalColdAirFlow = finalPackValve ? coldAirFlow : 0;
    const finalWarmAirFlow = finalPackValve ? warmAirFlow : 0;
    const finalMixedAirFlow = finalPackValve ? mixedAirFlow : 0;

    return {
      inletPsi: finalPackValve ? commandedInletPsi : 0,
      flowRate: finalFlowRate,
      flowLbsMin: finalFlowLbsMin, // AMM 21-00-00 Fig. 603 single-pack expected flow (lbs/min)
      coldTempF: finalPackValve ? coldTempF : 0,
      sensorTempF: finalPackValve ? separatorSensorTempF : 0,
      hotBypassRate: finalPackValve ? f35BypassRate : 0,
      warmAirTempF: finalPackValve ? warmAirTempF : 0,
      coldAirFlow: finalColdAirFlow,
      warmAirFlow: finalWarmAirFlow,
      mixedAirFlow: finalMixedAirFlow,
      airMixValve: finalPackValve ? finalMixValve : 0,
      mixTempF: finalPackValve ? (ductOverheat190 ? coldTempF : rawMixTempF) : 0,
      mixingChamberTempF: finalPackValve ? mixingChamberTempF : 0,
      compressorDischargeTempF,
      turbineInletTempF,
      turbineDischargeTempF,
      compressorOverheat,
      turbineOverheat,
      packOverheatRelay,
      ductOverheat: ductOverheat190,
      ductLimitDemand: ductOverheat190 || rawMixTempF >= 140,
      packTrip250,
      mixValveHotLimit: finalPackValve && finalMixValve >= 0.995,
      mixValveColdLimit: finalPackValve && finalMixValve <= 0.005,
      hotBypassFlow: finalPackValve ? hotBypassFlow : 0,
      coolingPathFlow: finalPackValve ? coolingPathFlow : 0,
      f35BypassFlow: finalPackValve ? f35BypassFlow : 0,
      acmColdFlow: finalPackValve ? acmColdFlow : 0,
      separatorFlow: finalPackValve ? separatorFlow : 0,
      f35SensorFailure,
      f35ValveFailure,
      packTrip: effectivePackTrip,
      tempControlFault: tempFault,
      turbofanValve: finalPackValve ? turbofanValve : 0,
      stages: {
        packValve: finalPackValve,
        primaryHx: finalPackValve && primaryHx,
        acmCompressor: finalPackValve && acmCompressor,
        secondaryHx: finalPackValve && secondaryHx,
        turbine: finalPackValve && turbine,
        waterSeparator: finalPackValve && waterSeparator,
        f35Valve: finalPackValve && f35Valve,
        mixValve: finalPackValve,
        hotBypass: finalPackValve && hotBypassFlow > 0.01,
        coldCheckValve: finalPackValve && coldAirFlow > 0.01,
        hotCheckValve: finalPackValve && warmAirFlow > 0.01,
      },
    };
  };
  const leftPack = derivePack(leftDuctPsi, s.packL ? "AUTO" : "OFF", s.packTripL, apuBleedLeft, !!s.wow, s.flaps, s.groundSpeedKt, s.mixCabin, s.tempControlFaultL, s.tempModeL ?? "MANUAL", Number(s.tempSelectL ?? 75), Number(s.controlCabinTempF ?? 75), Number(s.ambientTempF ?? 75), acPower, s.faults.mixValveJamL || !cbClosed("mix-valve"));
  const rightPack = derivePack(rightDuctPsi, s.packR ? "AUTO" : "OFF", s.packTripR, false, !!s.wow, s.flaps, s.groundSpeedKt, s.mixPass, s.tempControlFaultR, s.tempModeR ?? "MANUAL", Number(s.tempSelectR ?? 75), Number(s.passengerCabinTempF ?? 75), Number(s.ambientTempF ?? 75), acPower, s.faults.mixValveJamR || !cbClosed("mix-valve"));
  const packLFlow = leftPack.flowRate > 0.05;
  const packRFlow = rightPack.flowRate > 0.05;

  // ATA 21-21: the main distribution manifold normally sends the left pack to
  // the control cabin and the right pack to the passenger cabin. If either pack
  // is OFF, the remaining pack can supply BOTH distribution systems. A separate
  // ground-service conditioned-air connection can supply the manifold when the
  // airplane packs are OFF; its check valve closes when aircraft pack air is
  // being supplied. The manual does not give a simulator flow-rate value, so the
  // ground-cart flow below is deliberately normalized for the trainer.
  const groundConditionedAirActive =
    !!s.groundConditionedAirConnected &&
    s.groundConditionedAirPsi > 0 &&
    !packLFlow &&
    !packRFlow;
  const groundConditionedAirFlow = groundConditionedAirActive ? 0.65 : 0;
  const controlCabinSupplyFlow = packLFlow && packRFlow
    ? leftPack.flowRate
    : packLFlow
      ? leftPack.flowRate
      : packRFlow
        ? rightPack.flowRate
        : groundConditionedAirFlow;
  const passengerCabinSupplyFlow = packLFlow && packRFlow
    ? rightPack.flowRate
    : packLFlow
      ? leftPack.flowRate
      : packRFlow
        ? rightPack.flowRate
        : groundConditionedAirFlow;
  const cabinSupplyFlow = clamp01(Math.max(controlCabinSupplyFlow, passengerCabinSupplyFlow));
  const controlCabinSupplyTempF = packLFlow && packRFlow
    ? leftPack.mixingChamberTempF
    : packLFlow
      ? leftPack.mixingChamberTempF
      : packRFlow
        ? rightPack.mixingChamberTempF
        : groundConditionedAirActive
          ? Number(s.ambientTempF ?? 75)
          : 0;
  const passengerCabinSupplyTempF = packLFlow && packRFlow
    ? rightPack.mixingChamberTempF
    : packLFlow
      ? leftPack.mixingChamberTempF
      : packRFlow
        ? rightPack.mixingChamberTempF
        : groundConditionedAirActive
          ? Number(s.ambientTempF ?? 75)
          : 0;
  const cabinExhaustFlow = clamp01(s.outflow);

  // Each engine-driven pump is an independent System A pressure source.
  // An engine fire handle isolates only its associated pump; the other engine
  // can continue supplying System A. Both pumps feed the same 3000-psi manifold,
  // so pressure is not additive when both are operating.
  // Reservoir pneumatic head is required before an aircraft hydraulic pump can
  // establish normal pressure. Normal source = engine bleed. On the ground, when a
  // nitrogen supply is not available, the ground air cart supplies the same
  // pressurization manifold (ground only, cart pressure must be usable).
  // ATA 29-09-300: reservoir pressurization is a separate regulated-air path.
  // Engine bleed takeoffs pressurize reservoirs independently of the downstream
  // engine bleed switch; the dedicated ground reservoir-air test connection is
  // not the same as the ATA 36 pneumatic service cart.
  const groundReservoirAir = !!s.hydReservoirAirConnected && !!s.wow && s.hydReservoirAirPsi >= 30;
  const reservoirEngineAir1 = eng1AccessoryDriven && !s.engine1FirePulled;
  const reservoirEngineAir2 = eng2AccessoryDriven && !s.engine2FirePulled;
  const reservoirAirAvailable = reservoirEngineAir1 || reservoirEngineAir2 || groundReservoirAir;

  const hydAPump1On = reservoirAirAvailable && eng1AccessoryDriven && s.engHyd1 && !s.engine1FirePulled && s.hydAQty > 0;
  const hydAPump2On = reservoirAirAvailable && eng2AccessoryDriven && s.engHyd2 && !s.engine2FirePulled && s.hydAQty > 0;

  // The AMM describes the engine-driven pumps as pressure-compensated: they
  // regulate toward approximately 3000 psi as system demand changes. Do not
  // linearly derate pressure simply because the reservoir is partially full;
  // quantity loss becomes a pressure-source failure when the reservoir is
  // exhausted rather than turning 50% fluid into an arbitrary 1500-psi system.
  const hydAReservoirAvailable = s.hydAQty > 0;
  let hydA = (hydAPump1On && hydAReservoirAvailable || hydAPump2On && hydAReservoirAvailable) ? 3000 : 0;
  if (s.faults.hydALeak) hydA = Math.min(hydA, hydAReservoirAvailable ? 400 : 0);

  // System B electric pumps are 115V AC motor pumps fed from the aircraft
  // AC distribution (Transfer Bus 1 / Transfer Bus 2). On the ground they must
  // run from GPU or APU via the bus-tie path, not only from an engine
  // generator bus. Three-phase health is required when the feed is an engine
  // generator (or a cross-side transfer from that generator); GPU/APU tie
  // feeds are treated as healthy three-phase sources.
  //
  const hydBBus1Electrical =
    (generator1BusPowered && generator1ThreePhaseHealthy) ||
    (!!tieSource1) ||
    (transferRelay1Alt && generator2ThreePhaseHealthy);
  const hydBBus2Electrical =
    (generator2BusPowered && generator2ThreePhaseHealthy) ||
    (!!tieSource2) ||
    (transferRelay2Alt && generator1ThreePhaseHealthy);
  const hydBPump1On =
    reservoirAirAvailable && s.hydBQty > 0 && hydBBus1Electrical && s.elecHyd1;
  const hydBPump2On =
    reservoirAirAvailable && s.hydBQty > 0 && hydBBus2Electrical && s.elecHyd2;
  const hydBReservoirAvailable = s.hydBQty > 0;
  let hydB = ((hydBPump1On && hydBReservoirAvailable) || (hydBPump2On && hydBReservoirAvailable)) ? 3000 : 0;
  if (s.faults.hydBLeak) hydB = Math.min(hydB, hydBReservoirAvailable ? 400 : 0);

  // Ground hydraulic service pressure enters System B first. The supplied
  // AMM requires the ground interconnect to be ground/parking-brake
  // interlocked: with the parking brake set, the valve may be opened to
  // transfer System B pressure to System A; with the parking brake released
  // and electrical power present, the valve is forced closed.
  const groundHydraulicSource = s.hydGroundPowerConnected && s.wow && s.hydBQty > 0 ? 3000 : 0;
  hydB = Math.max(hydB, groundHydraulicSource);
  const groundInterconnectPermitted = s.wow && s.parkingBrake;
  const groundAPress = s.groundInterconnect && groundInterconnectPermitted ? hydB : 0;
  if (groundAPress > 0) hydA = Math.max(hydA, groundAPress);

  // Flight-control shutoff switches gate the hydraulic users, not the
  // pressure source itself. Spoiler switches further gate their respective
  // spoiler users.
  const flightControlAAvailable = hydA > 1500 && s.fltCtrlA;
  const flightControlBAvailable = hydB > 1500 && s.fltCtrlB;
  // ATA 29-00-00 identifies System A as the thrust-reverser hydraulic source.
  // Deployment additionally requires ground sensing, a running engine, idle
  // thrust lever, and no associated fire-handle shutdown.
  const thrustReverser1Active = !!s.rev1 && !!s.wow && eng1Running && s.throttle1 <= 0.05 && hydA > 1500 && !s.engine1FirePulled;
  const thrustReverser2Active = !!s.rev2 && !!s.wow && eng2Running && s.throttle2 <= 0.05 && hydA > 1500 && !s.engine2FirePulled;

  // ALTERNATE FLAPS ARM is itself an activation command for the standby
  // electric pump; the separate STBY HYD selector is not required for this
  // alternate-flap function. AUTO/ON also provide the normal standby demand.
  const primaryHydraulicLoss = hydA < 1500 && hydB < 1500;
  const standbyRudderDemand = primaryHydraulicLoss;
  const stbyNeed =
    s.altFlapsArm ||
    s.stbyHyd === "ON" ||
    (s.stbyHyd === "AUTO" && standbyRudderDemand);
  // The standby reservoir is a dedicated hydraulic reservoir tied into the
  // common reservoir balance/pressurization arrangement. Do not gate standby
  // pump demand on the *current* engine-bleed availability: an automatic
  // standby demand is specifically needed when the primary hydraulic systems
  // are unavailable, while the aircraft can still retain usable reservoir
  // head. The pump itself remains gated by standby AC power, demand, quantity,
  // and the standby pump path.
  const hydS = standbyAcPowered && stbyNeed && s.hydSQty > 0 ? 2900 : 0;

  const gearPositions = {
    nose: Math.max(0, Math.min(1, s.noseGearPos)),
    leftMain: Math.max(0, Math.min(1, s.leftMainGearPos)),
    rightMain: Math.max(0, Math.min(1, s.rightMainGearPos)),
  };
  const gearDown = Object.values(gearPositions).every((p) => p >= 0.98);
  const gearUp = Object.values(gearPositions).every((p) => p <= 0.02);

  // Each gear has its own position/lock indication. The AMM calls for a
  // red warning light whenever the individual gear is not down-and-locked
  // or its physical position disagrees with the selector.
  // An injected landing-gear position fault is a persistent unsafe condition.
  // Its red indication remains visible even with the electrical indication
  // Indications are electrically powered; an injected mechanical fault is
  // therefore still hidden when the landing-gear indication power is absent.
  const injectedGearFault = {
    nose: s.landingGearFault === "NOSE" && gearPositions.nose < 0.98,
    leftMain: s.landingGearFault === "LEFT_MAIN" && gearPositions.leftMain < 0.98,
    rightMain: s.landingGearFault === "RIGHT_MAIN" && gearPositions.rightMain < 0.98,
  };
  const throttlesRetardedForGearWarning = s.throttle1 <= 0.12 || s.throttle2 <= 0.12;
  const gearWarningHorn = dcPower && !gearDown && (
    throttlesRetardedForGearWarning || s.flaps > 15
  );
  const gearLights = {
    nose: {
      green: dcPower && gearPositions.nose >= 0.98,
      red: dcPower && (injectedGearFault.nose || gearPositions.nose > 0.02 && gearPositions.nose < 0.98 || (throttlesRetardedForGearWarning && gearPositions.nose < 0.98) || s.gear === "DN" && gearPositions.nose < 0.98 || s.gear === "UP" && gearPositions.nose > 0.02),
    },
    leftMain: {
      green: dcPower && gearPositions.leftMain >= 0.98,
      red: dcPower && (injectedGearFault.leftMain || gearPositions.leftMain > 0.02 && gearPositions.leftMain < 0.98 || (throttlesRetardedForGearWarning && gearPositions.leftMain < 0.98) || s.gear === "DN" && gearPositions.leftMain < 0.98 || s.gear === "UP" && gearPositions.leftMain > 0.02),
    },
    rightMain: {
      green: dcPower && gearPositions.rightMain >= 0.98,
      red: dcPower && (injectedGearFault.rightMain || gearPositions.rightMain > 0.02 && gearPositions.rightMain < 0.98 || (throttlesRetardedForGearWarning && gearPositions.rightMain < 0.98) || s.gear === "DN" && gearPositions.rightMain < 0.98 || s.gear === "UP" && gearPositions.rightMain > 0.02),
    },
  };
  const gearPositionDisagree =
    (s.gear === "UP" && !gearUp) ||
    (s.gear === "DN" && !gearDown);
  const gearTransit =
    gearPositions.nose > 0.02 && gearPositions.nose < 0.98 ||
    gearPositions.leftMain > 0.02 && gearPositions.leftMain < 0.98 ||
    gearPositions.rightMain > 0.02 && gearPositions.rightMain < 0.98 ||
    gearPositionDisagree;

  // 737-200 antiskid/autobrake relationship: inboard and outboard channels
  // independently protect their wheel pairs. AMM ATA 32-09-100, page 506,
  // steps (p)-(s), demonstrates the automatic-brake/speedbrake ARMED logic
  // remains armed with OUTBOARD ANTISKID CB open, but drops when INBOARD CB
  // is opened. Therefore the inboard channel is the arming interlock; an
  // outboard-only failure removes protection from its wheel pair but does not
  // itself disarm automatic braking. This is grounded in the supplied AMM test.
  // AMM 32-42-0: two microswitches on the gear lever disable antiskid
  // whenever the lever is selected UP (gear retraction), independent of the
  // antiskid channel switches themselves.
  const gearLeverRetract = s.gear === "UP";
  const antiskidInbdOperational = s.antiskidInbd && cbClosed("antiskid-inbd") && !s.faults.antiskidInop && !s.faults.antiskidInbdInop && !gearLeverRetract;
  const antiskidOutbdOperational = s.antiskidOutbd && cbClosed("antiskid-outbd") && !s.faults.antiskidInop && !s.faults.antiskidOutbdInop && !gearLeverRetract;
  const antiskidOperational = antiskidInbdOperational && antiskidOutbdOperational;
  const autobrakePowerAvailable = dcPower && cbClosed("autobrake");
  const autobrakeHydraulicReady = s.hydAPress > 1500 && s.hydBPress > 1500;
  const autobrakeTestPassed = s.autobrake > 0 && s.autobrakeTestTimer >= 2.5 &&
    autobrakePowerAvailable && antiskidInbdOperational && autobrakeHydraulicReady;
  const landingAutobrakeSelected = s.autobrake >= 1 && s.autobrake <= 3;
  const rtoSelected = s.autobrake === 4;
  const autobrakeArmed = autobrakeTestPassed &&
    ((landingAutobrakeSelected && !s.autobrakeLandingDisarmed && s.speedBrake === "ARMED") ||
     (rtoSelected && s.autobrakeRtoArmed));
  // Thrust "retarded": legacy scenarios model this with both levers CUT; in the
  // landing/rollout trainer the engines stay running and thrust goes to idle.
  // The autobrake system senses the forward thrust levers, not the engine start/fuel levers.
  // ATA 32-43-0 / 32-43-01: either forward thrust lever advanced out of
  // idle must inhibit or drop out landing autobraking, including during
  // rollout. Runway phase is not a substitute for the actual lever positions.
  const throttlesIdle = s.throttle1 <= 0.05 && s.throttle2 <= 0.05;
  const landingAutobrakeThrustDisarm = landingAutobrakeSelected && s.wow &&
    (s.groundSpeedKt > 60 || s.autobrakeLandingActivated) && autobrakeTestPassed && !throttlesIdle;
  // ATA 32-42-0: automatic braking stays off until wheel spin-up corresponds
  // to roughly 60-65 kt. Once the on-ramp has been crossed, preserve the active
  // state down through the rollout instead of re-applying a low-speed threshold.
  const landingAutobrakeActive = autobrakeArmed && landingAutobrakeSelected && s.wow &&
    (s.groundSpeedKt > 60 || s.autobrakeLandingActivated) && throttlesIdle;
  const rtoActive = autobrakeArmed && rtoSelected && s.wow &&
    s.throttle1 <= 0.05 && s.throttle2 <= 0.05 && s.groundSpeedKt > 88 && s.autobrakeRtoArmed;
  // Pilot pedal braking overrides (disarms) the autobrake, as on the real aircraft.
  const pedalOverride = s.leftBrakePedal > 0.067 || s.rightBrakePedal > 0.067;
  const autobrakeActive = (landingAutobrakeActive || rtoActive) && !pedalOverride;
  const autobrakeDisarm = s.autobrake > 0 && (
    !autobrakePowerAvailable ||
    !antiskidInbdOperational ||
    s.autobrakeLandingDisarmed ||
    !autobrakeHydraulicReady ||
    (landingAutobrakeSelected && s.speedBrake !== "ARMED" && !autobrakeActive) ||
    (autobrakeActive && !throttlesIdle) ||
    landingAutobrakeThrustDisarm ||
    (pedalOverride && s.wow && s.groundSpeedKt > 20 && (landingAutobrakeActive || rtoActive))
  );
  // The AMM describes MIN/MED/MAX as deceleration selections rather than
  // fixed wheel-brake pressures. Use a proportional simulator command while
  // routing the actual command through the antiskid path.
  const autobrakePressure = !autobrakeActive ? 0 : s.autobrake === 1 ? 1000 : s.autobrake === 2 ? 2000 : 3000;
  const antiskidModulating = autobrakeActive && (antiskidInbdOperational || antiskidOutbdOperational);

  const startValveOpen1 = s.startValve1 && leftDuctPsi >= 30 && dcPower;
  const startValveOpen2 = s.startValve2 && rightDuctPsi >= 30 && dcPower;
  // ATA 21/36/75: 13th-stage air supplements the 8th-stage supply when
  // 8th-stage pressure is insufficient. The start-bleed control valve
  // interrupts 13th-stage actuating air during engine start, so a commanded
  // starter valve must NOT make 13th-stage bleed available. This is a
  // normalized trainer indication rather than a manufacturer performance map.
  // ATA 75: during engine start the start-bleed control interrupts 13th-stage
  // actuating air. Once the starter has cut out and the engine is at governed
  // running speed, the 13th-stage source is available when the engine bleed
  // system is selected and not tripped. The supplied manual does not provide
  // a single universal N2 threshold for the complete pressure-ratio schedule,
  // so do not invent one; starter cutout is the modeled boundary here.
  const bleed13Demand1 = eng1Running && s.bleed1 && !s.bleedTrip1 && !startValveOpen1;
  const bleed13Demand2 = eng2Running && s.bleed2 && !s.bleedTrip2 && !startValveOpen2;
  const bleed13Available1 = bleed13Demand1;
  const bleed13Available2 = bleed13Demand2;

  const apuGenOnBus = apuLeftSource || apuRightSource;
  // GEN OFF BUS lights when the generator is capable (or selected) but not
  // actually powering its bus — including protection trips, breaker faults,
  // and APU gen interlocked off by external power.
  const apuGenOffBus = indicationPower && apuAvailable && s.apuGen && !apuGenOnBus;
  const gen1OffBus = indicationPower && eng1Running && s.gen1 && !generator1BusPowered;
  const gen2OffBus = indicationPower && eng2Running && s.gen2 && !generator2BusPowered;

  // FIRE WARN reflects detection, not the handle — pulling the handle is the
  // crew's response to the light, not the cause of it.
  const engine1FireWarn = indicationPower && s.faults.engineFire1;
  const engine2FireWarn = indicationPower && s.faults.engineFire2;
  const apuFireWarn = indicationPower && s.faults.apuFireDetected;
  // ATA 26 detector warnings are electrically indicated; do not show fire/overheat
  // annunciation with the aircraft indication buses completely unpowered.
  const wheelWellFireWarn = indicationPower && (s.wheelWellFire || s.wheelWellLevel >= 0.5);
  // Cargo detection requires the SB 26A1081 installation and at least one healthy loop.
  // Both loops healthy → normal threshold; single loop → delayed/higher threshold for training.
  const cargoDetOk = s.cargoFireInstalled && (s.cargoLoopA || s.cargoLoopB);
  const cargoThreshold = s.cargoLoopA && s.cargoLoopB ? 0.35 : 0.65;
  const cargoFwdFireWarn = indicationPower && (s.cargoFwdFire || s.cargoFwdLevel >= cargoThreshold) && cargoDetOk;
  const cargoAftFireWarn = indicationPower && (s.cargoAftFire || s.cargoAftLevel >= cargoThreshold) && cargoDetOk;
  const fireWarn = engine1FireWarn || engine2FireWarn || apuFireWarn || wheelWellFireWarn || cargoFwdFireWarn || cargoAftFireWarn;
  // LOW PRESS indications represent actual hydraulic pressure, not merely the
  // commanded/target pressure. They are also electrically powered indications.
  // ATA 26-21-0 NOTE: when the hydraulic fluid shutoff valve is closed by the
  // fire switch, the associated low-pressure lights are bypassed to prevent a
  // false low-pressure warning.
  const hydAPump1Selected = s.engHyd1 && eng1AccessoryDriven && !s.engine1FirePulled;
  const hydAPump2Selected = s.engHyd2 && eng2AccessoryDriven && !s.engine2FirePulled;
  const hydALow = indicationPower && (hydAPump1Selected || hydAPump2Selected) && s.hydAPress < 1500;
  const hydBPump1Low = indicationPower && s.elecHyd1 && (!hydBPump1On || s.hydBPress < 1500);
  const hydBPump2Low = indicationPower && s.elecHyd2 && (!hydBPump2On || s.hydBPress < 1500);
  const hydBLow = indicationPower && (hydBPump1Low || hydBPump2Low);

  const masterCaution = indicationPower && (
    dualBleed ||
    hydALow ||
    hydBLow ||
    s.faults.hydBLeak ||
    s.packTripL ||
    s.packTripR ||
    s.bleedTrip1 ||
    s.bleedTrip2 ||
    s.faults.packOverheat ||
    s.faults.apuDoorJam ||
    (s.fuelCenterPumpAutoShutoffInstalled && (s.fuelCenterPump1LowPressureTimer >= 10 || s.fuelCenterPump2LowPressureTimer >= 10))
  );

  const interlocks: Interlock[] = [];
  if (apuLowOil) {
    interlocks.push({
      id: "apu-low-oil",
      text: "APU LOW OIL PRESSURE — normal during start until oil pressure reaches 55 psi; abnormal if it remains low at service speed.",
      tone: "caution",
    });
  }
  if (s.apuMaster === "START" && s.apuDoor < 0.98) {
    interlocks.push({
      id: "apu-door",
      text: "Starter lockout relay held — APU inlet door is not fully open.",
      tone: "caution",
    });
  }
  if (s.apuMaster !== "OFF" && s.apuFuelValve < 0.95 && s.apuDoor < 0.05) {
    interlocks.push({
      id: "apu-fuel",
      text: "Inlet door waits on the fuel shutoff valve. Valve must reach full open first.",
      tone: "info",
    });
  }
  if (
    (s.start1 === "GRD" && leftDuctPsi < 30) ||
    (s.start2 === "GRD" && rightDuctPsi < 30)
  ) {
    interlocks.push({
      id: "start-air",
      text: "Pneumatic starter needs ≥ 30 psi at the starter. Use APU bleed, the ground pneumatic source, an engine bleed, or cross-bleed as applicable.",
      tone: "caution",
    });
  }
  if (s.start1 === "GRD" && !s.lever1 && s.n2_1 > 18 && s.n2_1 < 35) {
    interlocks.push({
      id: "idle-1",
      text: "Engine 1 N2 is on starter. Move start lever to IDLE to introduce fuel and ignition.",
      tone: "info",
    });
  }
  if (s.start2 === "GRD" && !s.lever2 && s.n2_2 > 18 && s.n2_2 < 35) {
    interlocks.push({
      id: "idle-2",
      text: "Engine 2 N2 is on starter. Move start lever to IDLE to introduce fuel and ignition.",
      tone: "info",
    });
  }
  if (dualBleed) {
    interlocks.push({
      id: "dual-bleed",
      text: "DUAL BLEED — APU bleed valve is open, an engine bleed valve is open, and the isolation valve is open (ATA 36 source conflict).",
      tone: "warn",
    });
  }
  if (generator1ProtectionTripped && s.gen1) {
    interlocks.push({
      id: "gen1-off-bus-protection",
      text: "GEN 1 OFF BUS — protection trip has removed GEN 1 from its generator bus. Transfer relay can pick up Transfer Bus 1 from GEN 2 if BUS TRANSFER is AUTO.",
      tone: "warn",
    });
  }
  if (generator2ProtectionTripped && s.gen2) {
    interlocks.push({
      id: "gen2-off-bus-protection",
      text: "GEN 2 OFF BUS — protection trip has removed GEN 2 from its generator bus. Transfer relay can pick up Transfer Bus 2 from GEN 1 if BUS TRANSFER is AUTO.",
      tone: "warn",
    });
  }
  if (s.gear === "UP" && hydA < 1500) {
    interlocks.push({
      id: "gear-hyd",
      text: "Landing gear is powered by Hydraulic System A only. Pressure is too low to retract.",
      tone: "caution",
    });
  }
  if (s.rev1 && !thrustReverser1Active) {
    interlocks.push({
      id: "rev1-isolation",
      text: "ENGINE 1 thrust reverser inhibited — requires WOW, engine running, idle thrust lever, System A hydraulic pressure, and no fire-handle shutdown.",
      tone: "warn",
    });
  }
  if (s.rev2 && !thrustReverser2Active) {
    interlocks.push({
      id: "rev2-isolation",
      text: "ENGINE 2 thrust reverser inhibited — requires WOW, engine running, idle thrust lever, System A hydraulic pressure, and no fire-handle shutdown.",
      tone: "warn",
    });
  }
  if (s.faults.apuDoorJam) {
    interlocks.push({
      id: "door-jam",
      text: "Fault injected: APU inlet door actuator jammed. Start will not complete.",
      tone: "warn",
    });
  }
  if (s.faults.hydALeak) {
    interlocks.push({
      id: "hyd-leak",
      text: "Fault injected: System A leak. Standby pump can cover rudder / LE flaps.",
      tone: "warn",
    });
  }
  if (s.faults.packOverheat) {
    interlocks.push({
      id: "pack-oh",
      text: "Fault injected: L pack overheat. PACK TRIP OFF — mix valve drives full cold.",
      tone: "warn",
    });
  }
  if (s.faults.packOverheatR) {
    interlocks.push({
      id: "pack-oh-r",
      text: "Fault injected: R pack overheat. PACK TRIP OFF — mix valve drives full cold.",
      tone: "warn",
    });
  }
  if (s.faults.bleedOverheat1) {
    interlocks.push({
      id: "bleed-oh-1",
      text: "Fault injected: engine 1 bleed duct overheat. BLEED TRIP 1 — bleed valve closed.",
      tone: "warn",
    });
  }
  if (s.faults.bleedOverheat2) {
    interlocks.push({
      id: "bleed-oh-2",
      text: "Fault injected: engine 2 bleed duct overheat. BLEED TRIP 2 — bleed valve closed.",
      tone: "warn",
    });
  }
  if (s.faults.engineFire1 && !s.engine1FirePulled) {
    interlocks.push({ id: "eng1-fire", text: "ENGINE 1 FIRE — pull the ENG 1 fire handle to shut down the engine and arm extinguishing.", tone: "warn" });
  }
  if (s.faults.engineFire2 && !s.engine2FirePulled) {
    interlocks.push({ id: "eng2-fire", text: "ENGINE 2 FIRE — pull the ENG 2 fire handle to shut down the engine and arm extinguishing.", tone: "warn" });
  }
  if (s.faults.apuFireDetected && !s.apuFirePulled) {
    interlocks.push({
      id: "apu-fire",
      text: "APU FIRE WARN — fire detected. Pull the APU FIRE handle to shut down and arm the bottle.",
      tone: "warn",
    });
  }
  if (s.faults.tr1Failure) {
    interlocks.push({ id: "tr1-fail", text: "TR 1 failure injected — DC Bus 1 relies on TR 3 backup from Generator Bus 2 when that AC input is available.", tone: "warn" });
  }
  if (s.faults.tr2Failure) {
    interlocks.push({ id: "tr2-fail", text: "TR 2 failure injected — DC Bus 2 relies on TR 3 backup from Generator Bus 2 when that AC input is available.", tone: "warn" });
  }
  if (s.faults.generator1Failure) interlocks.push({ id: "gen1-fail", text: "GEN 1 failure injected — GEN 1 is unavailable; BUS TRANSFER AUTO can transfer the No. 1 side to GEN 2.", tone: "warn" });
  if (s.faults.generator2Failure) interlocks.push({ id: "gen2-fail", text: "GEN 2 failure injected — GEN 2 is unavailable; BUS TRANSFER AUTO can transfer the No. 2 side to GEN 1.", tone: "warn" });
  if (generator1ProtectionTripped) interlocks.push({ id: "gen1-protection", text: "GEN 1 protection trip — abnormal generator condition persisted for 0.40 s; generator breaker/source is tripped.", tone: "warn" });
  if (generator2ProtectionTripped) interlocks.push({ id: "gen2-protection", text: "GEN 2 protection trip — abnormal generator condition persisted for 0.40 s; generator breaker/source is tripped.", tone: "warn" });
  if (s.faults.transferRelay1Failure) interlocks.push({ id: "xfr1-fail", text: "XFR BUS 1 relay failure — automatic transfer to GEN 2 is unavailable.", tone: "warn" });
  if (s.faults.transferRelay2Failure) interlocks.push({ id: "xfr2-fail", text: "XFR BUS 2 relay failure — automatic transfer to GEN 1 is unavailable.", tone: "warn" });
  if (s.faults.btb1Failure) interlocks.push({ id: "btb1-fail", text: "BTB 1 failure — APU or external power cannot connect to load bus 1 through BTB 1.", tone: "warn" });
  if (s.faults.btb2Failure) interlocks.push({ id: "btb2-fail", text: "BTB 2 failure — APU or external power cannot connect to load bus 2 through BTB 2.", tone: "warn" });
  if (s.faults.apuGeneratorBreakerFailure) interlocks.push({ id: "apu-gb-fail", text: "APU generator breaker failure — APU generator is unavailable to the tie bus.", tone: "warn" });
  if (s.faults.apuOverspeed) interlocks.push({ id: "apu-overspeed", text: "APU overspeed shutdown fault — APU control has tripped the unit.", tone: "warn" });
  if (s.faults.apuLowOilPressure) interlocks.push({ id: "apu-low-oil-fault", text: "APU low-oil-pressure shutdown fault — automatic shutdown is active.", tone: "warn" });
  if (s.faults.apuHighOilTemperature) interlocks.push({ id: "apu-high-oil-temp", text: "APU high-oil-temperature shutdown fault — automatic shutdown is active.", tone: "warn" });
  if (s.faults.externalPowerContactorFailure) interlocks.push({ id: "epc-fail", text: "External power contactor failure — GPU is connected but cannot energize the aircraft AC buses.", tone: "warn" });
  if (s.faults.openPhase1) interlocks.push({ id: "phase1-fail", text: "GEN 1 open-phase fault — three-phase loads on the No. 1 source lose the affected phase; TR1 and System B electric pump 1 cannot establish healthy three-phase power. The generator bus itself is not treated as a total loss.", tone: "warn" });
  if (s.faults.openPhase2) interlocks.push({ id: "phase2-fail", text: "GEN 2 open-phase fault — three-phase loads on the No. 2 source lose the affected phase; TR2, TR3 and System B electric pump 2 cannot establish healthy three-phase power. The generator bus itself is not treated as a total loss.", tone: "warn" });
  if (s.faults.tr3Failure) interlocks.push({ id: "tr3-fail", text: "TR 3 failure — DC backup path unavailable.", tone: "warn" });
  if (s.faults.batteryFailure) interlocks.push({ id: "battery-fail", text: "Battery failure — battery-backed standby power and hot-battery functions are unavailable.", tone: "warn" });
  if (s.faults.staticInverterFailure) interlocks.push({ id: "inv-fail", text: "Static inverter failure — AUTO standby cannot transfer to standby AC from the battery path.", tone: "warn" });
  if (s.faults.teFlapHydMotorFail && !s.altFlapsArm) {
    interlocks.push({ id: "te-flap-hyd-fail", text: "TE flap hydraulic motor failure — normal System A drive is unavailable. Arm ALTERNATE FLAPS and use the alternate position switch for electric drive.", tone: "warn" });
  }
  if (s.faults.antiskidInop) {
    interlocks.push({ id: "antiskid-fail", text: "ANTISKID fault injected — automatic braking is inhibited while the fault is present.", tone: "warn" });
  }
  if (s.landingGearFault !== "NONE") {
    const label = s.landingGearFault === "NOSE" ? "NOSE GEAR" : s.landingGearFault === "LEFT_MAIN" ? "LEFT MAIN GEAR" : "RIGHT MAIN GEAR";
    interlocks.push({ id: "gear-position-fault", text: `Fault injected: ${label} position fault — selector DN but the affected gear is not down-and-locked.`, tone: "warn" });
  }

  if (s.autobrake > 0 && !antiskidOperational) {
    interlocks.push({ id: "autobrake-antiskid", text: "AUTOBRAKE DISARM — both antiskid channels must be operative.", tone: "warn" });
  }
  if (gearLeverRetract) {
    interlocks.push({ id: "antiskid-gear-retract", text: "ANTISKID DISABLED — two microswitches on the gear lever inhibit antiskid while the lever is selected UP (gear retraction).", tone: "caution" });
  }

  // Standby pump demand can come from ALT FLAPS, but that alone does not mean
  // the standby rudder actuator is selected/pressurized. Keep the rudder path
  // tied to STBY HYD ON or the AUTO primary-hydraulic-loss demand.
  const standbyRudderActuatorDemand = s.stbyHyd === "ON" || (s.stbyHyd === "AUTO" && standbyRudderDemand);
  const standbyRudderPowered = hydS > 1800 && standbyRudderActuatorDemand;
  const alternateFlapArmed = s.altFlapsArm;
  // ALT FLAPS ARM commands the electrically operated TE hydraulic-motor bypass
  // and demands standby hydraulic pressure. The selector then drives TE flaps
  // electrically UP/DN; OFF stops TE motion. LE devices use standby hydraulics
  // only on the DN command and remain a separate path from the electric TE FPU.
  const alternateFlapTakeover = alternateFlapArmed && dcPower;
  const alternateFlapLimitReached =
    (s.altFlapsControl === "DN" && s.flapPos >= 39.99) ||
    (s.altFlapsControl === "UP" && s.flapPos <= 0.01);
  const teFlapAsymmetryShutdown = !!s.faults.flapAsymmetry;
  const alternateFlapDrivePowered = alternateFlapTakeover && s.altFlapsControl !== "OFF" &&
    acPower && !alternateFlapLimitReached && !teFlapAsymmetryShutdown;
  const teFlapHydraulicDriveAvailable = hydA > 1500 && !alternateFlapTakeover &&
    !s.faults.teFlapHydMotorFail && !teFlapAsymmetryShutdown;
  const leSystemAAvailable = hydA > 1500 && !alternateFlapTakeover;
  const leStandbyAvailable = alternateFlapTakeover && s.altFlapsControl === "DN" && hydS > 1800;
  const leDriveAvailable = leSystemAAvailable || leStandbyAvailable;
  // Ground spoilers are an A-system function only when the aircraft is on the
  // ground and the speed-brake lever commands UP. Do not advertise the ground
  // spoiler user as continuously available merely because the A spoiler
  // shutoff switch is selected ON.
  const groundSpoilerAvailable = !!s.wow && s.speedBrake === "UP" && flightControlAAvailable && s.spoilerA;

  // Each hydraulic user has its own source path. A/B pressure is therefore
  // propagated to the applicable users instead of declaring an entire system
  // available to every user.
  const hydraulicUsers = [
    { id: "ailerons", label: "Ailerons", systemA: flightControlAAvailable, systemB: flightControlBAvailable, standby: false, electricAlternate: false, activeSource: flightControlAAvailable && flightControlBAvailable ? "A + B" : flightControlAAvailable ? "A" : flightControlBAvailable ? "B" : "MECH REVERSION" },
    { id: "elevators", label: "Elevators", systemA: flightControlAAvailable, systemB: flightControlBAvailable, standby: false, electricAlternate: false, activeSource: flightControlAAvailable && flightControlBAvailable ? "A + B" : flightControlAAvailable ? "A" : flightControlBAvailable ? "B" : "MECH REVERSION" },
    { id: "rudder", label: "Rudder", systemA: flightControlAAvailable, systemB: flightControlBAvailable, standby: standbyRudderPowered, electricAlternate: false, activeSource: flightControlAAvailable && flightControlBAvailable ? "A + B MAIN PCU" : flightControlAAvailable ? "SYSTEM A MAIN PCU" : flightControlBAvailable ? "SYSTEM B MAIN PCU" : standbyRudderPowered ? "STBY ACTUATOR" : "NONE" },
    { id: "le-devices", label: "LE devices", systemA: leSystemAAvailable, systemB: false, standby: leStandbyAvailable, electricAlternate: false, activeSource: leSystemAAvailable && leStandbyAvailable ? "A + STBY" : leSystemAAvailable ? "A" : leStandbyAvailable ? "STBY" : "NONE" },
    { id: "te-flaps", label: "TE flaps", systemA: teFlapHydraulicDriveAvailable, systemB: false, standby: false, electricAlternate: alternateFlapDrivePowered, activeSource: alternateFlapDrivePowered ? "FPU ELEC" : teFlapHydraulicDriveAvailable ? "A" : "NONE" },
    { id: "thrust-reversers", label: "Thrust reversers", systemA: hydA > 1500, systemB: false, standby: false, electricAlternate: false, activeSource: hydA > 1500 ? "A" : "NONE" },
    { id: "inboard-flight-spoilers", label: "Flight spoilers 3 / 6 (System A)", systemA: flightControlAAvailable && s.spoilerA, systemB: false, standby: false, electricAlternate: false, activeSource: flightControlAAvailable && s.spoilerA ? "A" : "NONE" },
    { id: "outboard-flight-spoilers", label: "Flight spoilers 2 / 7 (System B)", systemA: false, systemB: flightControlBAvailable && s.spoilerB, standby: false, electricAlternate: false, activeSource: flightControlBAvailable && s.spoilerB ? "B" : "NONE" },
    { id: "ground-spoilers", label: "Ground spoilers", systemA: groundSpoilerAvailable, systemB: false, standby: false, electricAlternate: false, activeSource: groundSpoilerAvailable ? "A" : "NONE" },
    { id: "landing-gear", label: "Landing gear", systemA: hydA > 1500, systemB: false, standby: false, electricAlternate: false, activeSource: hydA > 1500 ? "A" : "NONE" },
    { id: "nose-wheel-steering", label: "Nose-wheel steering", systemA: hydA > 1500, systemB: false, standby: false, electricAlternate: false, activeSource: hydA > 1500 ? "A" : "NONE" },
    { id: "inboard-brakes", label: "Inboard brakes", systemA: hydA > 1500, systemB: false, standby: false, electricAlternate: false, activeSource: hydA > 1500 ? "A" : "NONE" },
    { id: "outboard-brakes", label: "Outboard brakes", systemA: false, systemB: hydB > 1500, standby: false, electricAlternate: false, activeSource: hydB > 1500 ? "B" : "NONE" },
  ];

  // Pilot flight-control inputs are separate from hydraulic availability.
  // The animation shows commanded surfaces limited by the hydraulic sources
  // actually available to each control group.
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  // ATA 27: aileron/elevator PCUs are split A/B; loss of both hydraulic
  // supplies does not freeze the surfaces because pilot input mechanically
  // positions them. The supplied manual does not specify a numeric reduced
  // authority, so the trainer preserves normalized surface travel and marks
  // the source as mechanical reversion.
  const elevatorAuthority = flightControlAAvailable || flightControlBAvailable ? 1 : 1;
  const aileronAuthority = flightControlAAvailable || flightControlBAvailable ? 1 : 1;
  // ATA 27-21: the main rudder PCU has independent System A and System B
  // hydraulic supply paths. Either system alone provides full rudder control;
  // the standby rudder actuator is an independent alternate powered path.
  const rudderMainPowered = flightControlAAvailable || flightControlBAvailable;
  const rudderAuthority = rudderMainPowered || standbyRudderPowered ? 1 : 0;
  // The SP-77 autopilot / FD-108 model runs in the P5 panel (MainInstrumentPanel); the systems model only sees the pilot's yoke.
  const commandedRoll = s.yokeRoll;
  const commandedPitch = s.yokePitch;
  const aileronL = clamp(-commandedRoll * aileronAuthority, -1, 1);
  const aileronR = clamp(commandedRoll * aileronAuthority, -1, 1);
  const spoilerBase = clamp(s.spoilerPos, 0, 1);
  // AMM 27-61: the flight spoilers supplement the ailerons. The spoiler
  // panels rise on the wing with the up aileron and remain faired on the
  // down-aileron wing. When the speed brakes are deployed, both wings have
  // a baseline spoiler command and the aileron signal is mixed on top of it.
  // The exact ratio-changer curve is not specified in the supplied manual,
  // so the model uses a normalized mixer rather than inventing a numeric
  // maintenance value.
  // AMM 27-00 identifies flight spoilers 2/7 as System B and 3/6 as
  // System A. Keep the four panels independently source-gated; spoilerL/R
  // are aggregate wing displays for existing cockpit graphics.
  const spoiler3 = (flightControlAAvailable && s.spoilerA)
    ? clamp(spoilerBase + Math.max(aileronL, 0) * (1 - spoilerBase), 0, 1) : 0;
  const spoiler2 = (flightControlBAvailable && s.spoilerB)
    ? clamp(spoilerBase + Math.max(aileronL, 0) * (1 - spoilerBase), 0, 1) : 0;
  const spoiler6 = (flightControlAAvailable && s.spoilerA)
    ? clamp(spoilerBase + Math.max(aileronR, 0) * (1 - spoilerBase), 0, 1) : 0;
  const spoiler7 = (flightControlBAvailable && s.spoilerB)
    ? clamp(spoilerBase + Math.max(aileronR, 0) * (1 - spoilerBase), 0, 1) : 0;
  const spoilerL = Math.max(spoiler2, spoiler3);
  const spoilerR = Math.max(spoiler6, spoiler7);
  const rudder = clamp(s.rudderPedal * rudderAuthority, -1, 1);
  // Training cue for the adverse-yaw scenario: roll input produces a yaw
  // tendency opposite the commanded turn. Rudder input in the same direction
  // as the roll command reduces the cue. This is a training visualization,
  // not a flight-dynamics prediction.
  const rollMagnitude = Math.abs(commandedRoll);
  const rollDirection = commandedRoll > 0 ? 1 : commandedRoll < 0 ? -1 : 0;
  const spoilerDifferential = Math.abs(spoilerR - spoilerL);
  const rawAdverseYaw = clamp(rollMagnitude * 0.55 + spoilerDifferential * 0.45, 0, 1);
  const rudderCorrection = rollDirection !== 0 && Math.sign(rudder) === rollDirection
    ? Math.min(Math.abs(rudder) * 0.85, rawAdverseYaw)
    : 0;
  const adverseYawCue = s.adverseYawScenario
    ? clamp(rawAdverseYaw - rudderCorrection, 0, 1)
    : 0;
  const adverseYawDirection = adverseYawCue > 0.03
    ? (rollDirection > 0 ? "LEFT" : "RIGHT")
    : "NONE";
  const adverseYawCorrected = s.adverseYawScenario && rollMagnitude > 0.15 &&
    rollDirection !== 0 && Math.sign(rudder) === rollDirection && Math.abs(rudder) >= 0.28 && adverseYawCue < 0.18;
  const controlSurfaces = {
    elevator: clamp(commandedPitch * elevatorAuthority, -1, 1),
    aileronL,
    aileronR,
    rudder,
    spoiler: spoilerBase,
    spoilerL,
    spoilerR,
    spoiler2,
    spoiler3,
    spoiler6,
    spoiler7,
  };
  // Nose-wheel steering is a ground function: the steering depressurization
  // valve only supplies the steering actuators with the nose gear down and
  // weight-on-wheels. Rudder pedals provide limited steering; the tiller is
  // the primary steering input.
  const noseWheelSteeringAvailable = gearDown && s.wow && hydA > 1500;
  const noseWheelSteeringAngle = noseWheelSteeringAvailable
    ? clamp(s.tiller * 78 + s.rudderPedal * 7, -78, 78)
    : 0;
  const brakeSource = {
    li: s.hydAPress > 1500 ? "A" : "NONE",
    lo: s.hydBPress > 1500 ? "B" : "NONE",
    ri: s.hydAPress > 1500 ? "A" : "NONE",
    ro: s.hydBPress > 1500 ? "B" : "NONE",
  };
  const wheelSpeeds = s.wheelSpeeds;
  const wheelBrakePressures = s.wheelBrakePressures;
  const targetDecel = s.autobrake === 4 ? 22 : s.autobrake === 3 ? 16 : s.autobrake === 2 ? 11 : s.autobrake === 1 ? 7 : 0;
  const manualBrakeOverride = Math.max(s.leftBrakePedal, s.rightBrakePedal) > 0.05 && Math.max(wheelBrakePressures.li, wheelBrakePressures.lo, wheelBrakePressures.ri, wheelBrakePressures.ro) > 0;
  const actualDecel = s.actualDecel;
  // Standby hydraulic pump is powered from the standby AC bus (normal Transfer
  // Bus 1 path, or static inverter when AUTO transfers / BAT is selected) —
  // not from the main transfer-bus aggregate flag alone.
  const stbyHydElectricalSource = standbyAcPowered
    ? standbyAcSource === "STATIC INVERTER"
      ? "STATIC INVERTER"
      : electricalSource1 !== "NONE"
        ? electricalSource1
        : electricalSource2
    : "NONE";
  const electricalUsers = [
    { id: "hyd-elec-pump-1", label: "System B electric hydraulic pump 1", source: electricalSource1, powered: hydBPump1On, bus: "TRANSFER BUS 1", detail: hydBPump1On ? `Powered from ${electricalSource1}` : !s.elecHyd1 ? "SWITCH OFF" : !hydBBus1Electrical ? (generator1BusPowered && !generator1ThreePhaseHealthy ? "OPEN PHASE / UNHEALTHY 3φ on GEN 1" : transferRelay1Alt && s.elecHyd2 ? "XFER blocked — ELEC 2 still ON (load mgmt)" : "TRANSFER BUS 1 unavailable") : "No reservoir head or quantity" },
    { id: "hyd-elec-pump-2", label: "System B electric hydraulic pump 2", source: electricalSource2, powered: hydBPump2On, bus: "TRANSFER BUS 2", detail: hydBPump2On ? `Powered from ${electricalSource2}` : !s.elecHyd2 ? "SWITCH OFF" : !hydBBus2Electrical ? (generator2BusPowered && !generator2ThreePhaseHealthy ? "OPEN PHASE / UNHEALTHY 3φ on GEN 2" : transferRelay2Alt && s.elecHyd1 ? "XFER blocked — ELEC 1 still ON (load mgmt)" : "TRANSFER BUS 2 unavailable") : "No reservoir head or quantity" },
    { id: "stby-hyd-pump", label: "Standby hydraulic AC motor pump", source: stbyHydElectricalSource, powered: standbyAcPowered && stbyNeed && s.hydSQty > 0, bus: "STANDBY AC", detail: standbyAcPowered && stbyNeed && s.hydSQty > 0 ? `AC motor energized — ${stbyHydElectricalSource}` : !stbyNeed ? "Pump not demanded" : !standbyAcPowered ? "No standby AC (check STANDBY POWER / static inverter)" : s.hydSQty <= 0 ? "No standby reservoir quantity" : "Unavailable" },
    { id: "te-flap-fpu", label: "TE flap alternate FPU electric motor", source: electricalSource2 !== "NONE" ? electricalSource2 : electricalSource1, powered: alternateFlapDrivePowered, bus: "AC", detail: alternateFlapDrivePowered ? "Alternate electric drive powered" : "Alternate drive OFF" },
    { id: "apu-starter-battery", label: "APU starter", source: batteryPower ? "BATTERY" : externalDcControl ? "EXT DC" : "NONE", powered: s.apuStarter && (batteryPower || externalDcControl), bus: "28V DC CONTROL", detail: s.apuStarter && (batteryPower || externalDcControl) ? "ELECTRIC STARTER ENGAGED" : "Not engaged" },
    { id: "tr1", label: "TR 1", source: generator1BusPowered && generator1ThreePhaseHealthy ? "TRANSFER BUS 1 / GEN 1" : tieSource1 ? externalAc ? "TRANSFER BUS 1 / GPU" : "TRANSFER BUS 1 / APU GEN" : transferRelay1Alt ? "TRANSFER BUS 1 / GEN 2 XFER" : generator1BusPowered ? "GEN 1 OPEN PHASE" : "NONE", powered: tr1Powered, bus: "DC BUS 1", detail: tr1Powered ? "TRANSFER BUS 1 AC input — feeds DC Bus 1" : s.faults.tr1Failure ? "TR 1 FAILED" : "NO HEALTHY AC INPUT ON TRANSFER BUS 1" },
    { id: "tr2", label: "TR 2", source: generator2BusPowered && generator2ThreePhaseHealthy ? "TRANSFER BUS 2 / GEN 2" : tieSource2 ? externalAc ? "TRANSFER BUS 2 / GPU" : "TRANSFER BUS 2 / APU GEN" : transferRelay2Alt ? "TRANSFER BUS 2 / GEN 1 XFER" : generator2BusPowered ? "GEN 2 OPEN PHASE" : "NONE", powered: tr2Powered, bus: "DC BUS 2", detail: tr2Powered ? "TRANSFER BUS 2 AC input — feeds DC Bus 2" : s.faults.tr2Failure ? "TR 2 FAILED" : "NO HEALTHY AC INPUT ON TRANSFER BUS 2" },
    { id: "tr3", label: "TR 3", source: tr3Powered ? (generator2BusPowered ? "GENERATOR BUS 2" : externalAc ? "EXTERNAL AC → BUS 2" : "APU GEN → BUS 2") : generator2BusPowered && !generator2ThreePhaseHealthy ? "GEN 2 BUS (OPEN PHASE)" : "NONE", powered: tr3Powered, bus: "DC TIE / BACKUP", detail: tr3Powered ? "FED FROM GEN BUS 2 / VALID BUS 2 SOURCE — backup for DC Bus 1 and 2" : s.faults.tr3Failure ? "TR 3 FAILED" : !tr3InputAvailable ? "NO VALID INPUT FROM GENERATOR BUS 2 / BUS 2 SOURCE" : "NO TR 3 OUTPUT" },
    { id: "ac-28v-main-bus-2", label: "28V AC MAIN BUS NO. 2", source: ac28vMainBus2Powered ? "115V AC MAIN BUS NO. 2 / TRANSFORMER" : "NONE", powered: ac28vMainBus2Powered, bus: "28V AC MAIN BUS 2", detail: ac28vMainBus2Powered ? "MAIN BUS 2 FEED AVAILABLE" : !acMainBus2Powered ? "115V AC MAIN BUS 2 SOURCE LOST" : "28V AC BUS 2 FEED CB OPEN" },
    { id: "battery-charger", label: "Battery charger", source: batteryChargerPowered ? (groundServiceBusPowered ? "GROUND SERVICE BUS" : "NO. 2 MAIN / TRANSFER BUS") : "NONE", powered: batteryChargerPowered, bus: "28V DC CHARGE", detail: batteryChargerPowered ? "Charger input available" : "No ground-service or No. 2 bus feed" },
    { id: "static-inverter", label: "Static inverter", source: staticInverterPowered ? "BATTERY" : "NONE", powered: staticInverterPowered, bus: "STANDBY AC", detail: staticInverterPowered ? "Inverting battery DC to standby AC" : s.faults.staticInverterFailure ? "INVERTER FAILED" : "Not selected / battery unavailable" },
    { id: "recirc-fan", label: "Cabin recirculation / gasper fan", source: recircFanPowered ? "AC BUS" : "NONE", powered: recircFanPowered, bus: "AC", detail: recircFanPowered ? "RECIRC FAN RUNNING — TRAINER FLOW CONTRIBUTION ACTIVE" : s.faults.recircFanFailure ? "FAN FAILED" : !s.recirc ? "SWITCH OFF" : "AC POWER UNAVAILABLE" },
    { id: "equip-cooling-supply", label: "Equipment cooling supply blower", source: equipmentCoolingSupplyPowered ? "AC BUS" : "NONE", powered: equipmentCoolingSupplyPowered, bus: "AC", detail: equipmentCoolingSupplyPowered ? `SUPPLY ${s.equipSupply}` : s.faults.equipmentCoolingFailure ? "BLOWER FAILED" : `SUPPLY ${s.equipSupply} / NO VALID POWER` },
    { id: "equip-cooling-exhaust", label: "Equipment cooling exhaust blower", source: equipmentCoolingExhaustPowered ? "AC BUS" : "NONE", powered: equipmentCoolingExhaustPowered, bus: "AC", detail: equipmentCoolingExhaustPowered ? `EXHAUST ${s.equipExhaust}` : s.faults.equipmentCoolingFailure ? "BLOWER FAILED" : `EXHAUST ${s.equipExhaust} / NO VALID POWER` },
    { id: "antiskid-controller", label: "Antiskid controller", source: dcPower ? "28V DC" : "NONE", powered: dcPower && antiskidOperational, bus: "28V DC", detail: antiskidOperational ? "INBD + OUTBD CHANNELS AVAILABLE" : gearLeverRetract ? "DISABLED — GEAR LEVER UP (RETRACTION)" : "ANTISKID FAULT / SWITCH OFF" },
    { id: "autobrake-controller", label: "Autobrake controller", source: dcPower ? "28V DC" : "NONE", powered: dcPower && s.autobrake > 0 && !s.faults.antiskidInop && !s.faults.antiskidInbdInop && !s.faults.antiskidOutbdInop, bus: "28V DC", detail: s.autobrake > 0 ? "SELECTED — CHANNEL AVAILABILITY SUBJECT TO -200 EFFECTIVITY" : "AUTOBRAKE OFF" },
  ];

  const components = [
    { id: "gen1-drive", label: "GENERATOR DRIVE / CSD 1", active: eng1AccessoryDriven && !gen1DriveDisconnected, cb: "P5-5 / ATA 24-11", detail: gen1DriveDisconnected ? "DISCONNECTED BY SOLENOID" : s.faults.genDriveDisconnectFailure1 && s.gen1Disc ? "DISCONNECT SOLENOID FAILED — DRIVE STILL CONNECTED" : "DRIVE CONNECTED" },
    { id: "gen2-drive", label: "GENERATOR DRIVE / CSD 2", active: eng2AccessoryDriven && !gen2DriveDisconnected, cb: "P5-5 / ATA 24-11", detail: gen2DriveDisconnected ? "DISCONNECTED BY SOLENOID" : s.faults.genDriveDisconnectFailure2 && s.gen2Disc ? "DISCONNECT SOLENOID FAILED — DRIVE STILL CONNECTED" : "DRIVE CONNECTED" },
    { id: "cabin-recirc-fan", label: "CABIN RECIRCULATION FAN", active: recircFanPowered, cb: "ATA 21-24 / 21-26", detail: recircFanPowered ? `FLOW CONTRIBUTION ${Math.round(recircAirflow * 100)}%` : s.faults.recircFanFailure ? "FAILED" : "OFF / UNPOWERED" },
    { id: "engine-fuel-filter-icing", label: "ENGINE FUEL FILTER ICING DETECTION", active: fuelFilterIcing1 || fuelFilterIcing2, cb: "ATA 73-14-0 / engine fuel-heat interface", detail: `ENG 1 ΔP ${fuelFilterDeltaP1Psi.toFixed(1)} PSI ${fuelFilterIcing1 ? "ICING LIGHT ON" : "LIGHT OFF"} · ENG 2 ΔP ${fuelFilterDeltaP2Psi.toFixed(1)} PSI ${fuelFilterIcing2 ? "ICING LIGHT ON" : "LIGHT OFF"}` },
    { id: "equipment-cooling", label: "EQUIPMENT COOLING BLOWERS", active: equipmentCoolingSupplyPowered || equipmentCoolingExhaustPowered, cb: "ATA 21-58", detail: equipmentCoolingOverheat ? `E/E BAY OVERHEAT / BLOWER FAULT — ${Math.round(s.equipmentBayTempC)}°C` : `SUPPLY ${s.equipSupply} / EXHAUST ${s.equipExhaust} / FLOW ${Math.round(equipmentCoolingFlow * 100)}%` },
    { id: "crew-oxygen", label: "CREW OXYGEN PRESSURE INDICATION", active: oxygenPressureIndicated && s.crewOxyPsi > 0, cb: "ATA 35-21", detail: s.faults.oxygenSystemFailure ? "OXYGEN SYSTEM FAILURE" : `${Math.round(s.crewOxyPsi)} PSI` },
    { id: "toilet-drain-fwd", label: "FORWARD TOILET DRAIN HEATER", active: drainHeater1Powered, cb: "P18 DRAIN HEATER / ATA 30-71", detail: `${Math.round(s.drainHeater1TempC)}°C · ${s.faults.drainHeaterFailure1 ? "HEATER FAULT" : drainHeater1Powered ? "115V AC POWERED" : "OFF / NO BUS"}` },
    { id: "toilet-drain-aft", label: "AFT TOILET DRAIN HEATER", active: drainHeater2Powered, cb: "P18 DRAIN HEATER / ATA 30-71", detail: `${Math.round(s.drainHeater2TempC)}°C · ${s.faults.drainHeaterFailure2 ? "HEATER FAULT" : drainHeater2Powered ? "115V AC POWERED" : "OFF / NO BUS"}` },
    { id: "drain-mast-fwd", label: "FORWARD DRAIN MAST HEATER", active: drainMastForwardPowered, cb: "P18 DRAIN MAST AIR/GROUND / ATA 30-71", detail: `${Math.round(s.drainMastForwardTempC)}°C · ${drainMastAirPowered ? "AIR / 115V AC" : drainMastGroundPowered ? "GROUND / 28V AC" : "OFF / NO BUS"}` },
    { id: "drain-mast-fwd-line", label: "FORWARD DRAIN MAST LINE HEATER", active: drainMastForwardLinePowered, cb: "P18 DRAIN MAST AIR/GROUND / ATA 30-71", detail: `${Math.round(s.drainMastForwardLineTempC)}°C · ${drainMastAirPowered ? "AIR / 115V AC" : drainMastGroundPowered ? "GROUND / 28V AC" : "OFF / NO BUS"}` },
    { id: "drain-mast-aft", label: "AFT DRAIN MAST HEATER", active: drainMastAftPowered, cb: "P18 DRAIN MAST AIR/GROUND / ATA 30-71", detail: `${Math.round(s.drainMastAftTempC)}°C · ${drainMastAirPowered ? "AIR / 115V AC" : drainMastGroundPowered ? "GROUND / 28V AC" : "OFF / NO BUS"}` },
    { id: "alpha-vane-left", label: "LEFT ALPHA VANE HEATER", active: alphaVaneHeatedL, cb: "ATA 30-31", detail: `${Math.round(s.alphaVaneIceL * 100)}% TRAINER ICE · ${s.faults.alphaVaneHeatFailureL ? "HEATER FAILED" : alphaVaneHeatedL ? "HEATED" : "OFF / UNPOWERED"}` },
    { id: "alpha-vane-right", label: "RIGHT ALPHA VANE HEATER", active: alphaVaneHeatedR, cb: "ATA 30-31", detail: `${Math.round(s.alphaVaneIceR * 100)}% TRAINER ICE · ${s.faults.alphaVaneHeatFailureR ? "HEATER FAILED" : alphaVaneHeatedR ? "HEATED" : "OFF / UNPOWERED"}` },
    { id: "passenger-oxygen", label: "PASSENGER OXYGEN CONTROL", active: passengerOxygenDeployed, cb: "ATA 35-21", detail: passengerOxygenDeployed ? "PASSENGER OXYGEN DEPLOYED / ON" : "NORMAL / STOWED" },
    { id: "door-warning", label: "DOOR WARNING", active: doorWarning, cb: "ATA 52-71", detail: doorWarning ? "ONE OR MORE DOORS OPEN" : s.faults.doorWarningFailure ? "WARNING CIRCUIT FAILED" : "ALL MONITORED DOORS CLOSED" },
    { id: "cvr", label: "COCKPIT VOICE RECORDER", active: cvrPowered && s.flightRecorderMode === "NORMAL", cb: "ATA 23-71", detail: s.faults.cvrFailure ? "CVR FAILED" : cvrPowered ? (s.cvrMemoryErased ? "POWERED — MEMORY ERASED" : "POWERED — RECORDING STATE") : "OFF / UNPOWERED" },
    { id: "service-interphone", label: "SERVICE INTERPHONE / CALL", active: serviceInterphoneEffective || serviceCallEffective, cb: "ATA 23-41/42", detail: serviceInterphoneEffective ? "INTERPHONE ON / DC POWERED" : serviceCallEffective ? "CALL ACTIVE" : "OFF / UNPOWERED / CB OPEN" },
    { id: "eng1-start-cb", label: "ENGINE START VALVE 1 CB", active: dcPower, cb: "P6-2", detail: "28V DC control circuit" },
    { id: "eng1-starter-valve", label: "ENGINE 1 STARTER VALVE", active: startValveOpen1, cb: "ENGINE START VALVES", detail: startValveOpen1 ? "OPEN — pneumatic starter supplied" : "CLOSED" },
    { id: "eng1-starter", label: "ENGINE 1 PNEUMATIC STARTER", active: startValveOpen1 && s.n2_1 < 40, cb: "ENGINE START VALVES", detail: startValveOpen1 ? "MOToring N2" : "OFF" },
    { id: "eng1-ignition", label: "ENGINE 1 IGNITION EXCITER", active: ignition1On, cb: "START IGNITION / LOW ENERGY IGNITION", detail: ignition1On ? `${s.start1} · ENERGIZED` : `${s.start1} · OFF` },
    { id: "eng2-start-cb", label: "ENGINE START VALVE 2 CB", active: dcPower, cb: "P6-2", detail: "28V DC control circuit" },
    { id: "eng2-starter-valve", label: "ENGINE 2 STARTER VALVE", active: startValveOpen2, cb: "ENGINE START VALVES", detail: startValveOpen2 ? "OPEN — pneumatic starter supplied" : "CLOSED" },
    { id: "eng2-starter", label: "ENGINE 2 PNEUMATIC STARTER", active: startValveOpen2 && s.n2_2 < 40, cb: "ENGINE START VALVES", detail: startValveOpen2 ? "MOToring N2" : "OFF" },
    { id: "eng2-ignition", label: "ENGINE 2 IGNITION EXCITER", active: ignition2On, cb: "START IGNITION / LOW ENERGY IGNITION", detail: ignition2On ? `${s.start2} · ENERGIZED` : `${s.start2} · OFF` },
    { id: "fuel-crossfeed-valve", label: "FUEL CROSSFEED VALVE", active: crossfeedOpen, cb: "FUEL CROSSFEED", detail: s.faults.fuelCrossfeedValveFail ? "FAILED — VALVE UNAVAILABLE" : crossfeedOpen ? `OPEN — ${fuelFeedSource1} / ${fuelFeedSource2}` : "CLOSED" },
    { id: "fuel-boost-pump-set", label: "FUEL BOOST PUMP SET", active: fuelPump1On || fuelPump2On || fuelCenterPumpOn, cb: "FUEL BOOST PUMPS", detail: `T1 ${fuelPump1On ? "PRESS" : "LOW PRESSURE"} · CTR ${fuelCenterPumpOn ? "PRESS" : (fuelCenterSelected ? "LOW PRESSURE" : "OFF")} · T2 ${fuelPump2On ? "PRESS" : "LOW PRESSURE"}` },
    { id: "fire-module-p8", label: "FIRE PROTECTION MODULE P8-1", active: fireWarn, cb: "FIRE PROTECTION", detail: fireWarn ? "WARNING INPUT ACTIVE" : "MONITORING" },
    { id: "wheelwell-fire-det", label: "WHEEL-WELL OVERHEAT DETECTION", active: wheelWellFireWarn, cb: "WHEEL WELL FIRE", detail: wheelWellFireWarn ? "OVERHEAT/FIRE WARNING" : "NORMAL" },
    { id: "cargo-fwd-fire-det", label: "FWD CARGO SMOKE DETECTION", active: cargoFwdFireWarn, cb: "CARGO FIRE FWD DET", detail: cargoFwdFireWarn ? "SMOKE WARNING" : "NORMAL" },
    { id: "cargo-aft-fire-det", label: "AFT CARGO SMOKE DETECTION", active: cargoAftFireWarn, cb: "CARGO FIRE AFT DET", detail: cargoAftFireWarn ? "SMOKE WARNING" : "NORMAL" },
    { id: "engine-fire-bottles", label: "ENGINE FIRE EXTINGUISHER BOTTLES", active: s.fireBottleLDischarged || s.fireBottleRDischarged, cb: "FIRE EXT", detail: s.fireBottleLDischarged || s.fireBottleRDischarged ? "DISCHARGED" : "ARMED / AVAILABLE" },
    { id: "fuel-tank-1", label: "NO. 1 FUEL TANK", active: fuelQuantityIndicationPowered && s.fuelTank1 > 0.5, cb: "FUEL QTY", detail: fuelQuantityIndicationPowered ? `${s.fuelTank1.toFixed(1)}% · ${fuelLowPressure1 ? "LOW PRESSURE" : "FEED AVAILABLE"}` : "NO INDICATION — NO DC POWER" },
    { id: "fuel-center-tank", label: "CENTER FUEL TANK", active: fuelQuantityIndicationPowered && s.fuelTankCenter > 0.5, cb: "FUEL QTY", detail: fuelQuantityIndicationPowered ? `${s.fuelTankCenter.toFixed(1)}% · ${fuelCenterLowPressure ? "LOW PRESSURE" : "FEED AVAILABLE"}${fuelScavengeActive ? " · SCAVENGE ACTIVE" : ""}` : "NO INDICATION — NO DC POWER" },
    { id: "fuel-tank-2", label: "NO. 2 FUEL TANK", active: fuelQuantityIndicationPowered && s.fuelTank2 > 0.5, cb: "FUEL QTY", detail: fuelQuantityIndicationPowered ? `${s.fuelTank2.toFixed(1)}% · ${fuelLowPressure2 ? "LOW PRESSURE" : "FEED AVAILABLE"}` : "NO INDICATION — NO DC POWER" },
    { id: "engine-1-fuel-feed", label: "ENGINE 1 FUEL FEED", active: fuelFeedPressure1 > 0.5, cb: "ENG 1 FUEL SHUTOFF", detail: `${fuelFeedPressure1.toFixed(0)} PSI · ${fuelFeedSource1} · VALVE ${fuelShutoff1Open ? "OPEN" : "CLOSED"}` },
    { id: "engine-2-fuel-feed", label: "ENGINE 2 FUEL FEED", active: fuelFeedPressure2 > 0.5, cb: "ENG 2 FUEL SHUTOFF", detail: `${fuelFeedPressure2.toFixed(0)} PSI · ${fuelFeedSource2} · VALVE ${fuelShutoff2Open ? "OPEN" : "CLOSED"}` },
    { id: "engine-1-oil", label: "ENGINE 1 OIL SYSTEM", active: s.oilPsi1 > 30, cb: "OIL TEMP & PRESS", detail: `${s.oilPsi1.toFixed(0)} PSI · USABLE QTY ${s.oilQty1.toFixed(1)}%${s.faults.oilLow1 || s.oilPsi1 < 30 ? " · LOW PRESSURE" : ""}${s.faults.oilChip1 ? " · CHIP DETECTED" : ""}` },
    { id: "engine-2-oil", label: "ENGINE 2 OIL SYSTEM", active: s.oilPsi2 > 30, cb: "OIL TEMP & PRESS", detail: `${s.oilPsi2.toFixed(0)} PSI · USABLE QTY ${s.oilQty2.toFixed(1)}%${s.faults.oilLow2 || s.oilPsi2 < 30 ? " · LOW PRESSURE" : ""}${s.faults.oilChip2 ? " · CHIP DETECTED" : ""}` },
    { id: "apu-fuel-valve", label: "APU FUEL SHUTOFF VALVE", active: s.apuFuelValve > 0.95, cb: "APU CONT", detail: `${Math.round(s.apuFuelValve * 100)}% OPEN` },
    { id: "apu-inlet-door", label: "APU INLET DOOR", active: s.apuDoor > 0.95, cb: "APU CONT", detail: `${Math.round(s.apuDoor * 100)}% OPEN` },
    { id: "apu-starter", label: "APU STARTER", active: s.apuStarter, cb: "APU CONT", detail: s.apuStarter ? "ENGAGED" : "OFF" },
    { id: "apu-bleed-valve", label: "APU BLEED AIR VALVE", active: s.apuBleedValve > 0.7, cb: "APU CONT", detail: s.apuBleedValve > 0.7 ? "OPEN" : "CLOSED" },
    { id: "stby-pump", label: "STANDBY HYDRAULIC PUMP", active: hydS > 500, cb: "STBY HYD CONTROL", detail: hydS > 500 ? "PRESSURIZED — STANDBY AC POWER" : "OFF / NO STANDBY AC OR NO DEMAND" },
    { id: "stby-rudder", label: "STANDBY RUDDER POWER", active: standbyRudderPowered, cb: "STBY HYD CONTROL", detail: standbyRudderPowered ? "AVAILABLE" : "NO STANDBY PRESSURE" },
    { id: "alt-flap-te", label: "TE ALTERNATE ELECTRIC DRIVE", active: alternateFlapDrivePowered, cb: "ALT FLAPS", detail: alternateFlapDrivePowered ? "115V AC ELECTRIC MOTOR DRIVING FPU" : "OFF / NOT COMMANDED" },
    { id: "te-bypass", label: "TE FLAP BYPASS VALVE", active: alternateFlapTakeover, cb: "ALT FLAPS", detail: alternateFlapTakeover ? "BYPASS — HYDRAULIC MOTOR ISOLATED FOR ELECTRIC FPU DRIVE" : "NORMAL HYDRAULIC PATH" },
    { id: "te-hyd-motor", label: "TE FLAP HYDRAULIC MOTOR", active: teFlapHydraulicDriveAvailable, cb: "TE FLAP DRIVE", detail: s.faults.teFlapHydMotorFail ? "FAILED — ALTERNATE DRIVE REQUIRED" : teFlapHydraulicDriveAvailable ? "SYSTEM A HYDRAULIC DRIVE AVAILABLE" : "BYPASSED" },
    { id: "flt-ctrl-a", label: "FLIGHT CONTROL A SHUTOFF", active: flightControlAAvailable, cb: "FLT CTRL A", detail: flightControlAAvailable ? "SYSTEM A USERS SUPPLIED" : "OFF / LOW PRESSURE" },
    { id: "flt-ctrl-b", label: "FLIGHT CONTROL B SHUTOFF", active: flightControlBAvailable, cb: "FLT CTRL B", detail: flightControlBAvailable ? "SYSTEM B USERS SUPPLIED" : "OFF / LOW PRESSURE" },
    { id: "spoiler-a", label: "SPOILER A SHUTOFF", active: flightControlAAvailable && s.spoilerA, cb: "SPOILER A", detail: flightControlAAvailable && s.spoilerA ? "INBOARD / GROUND SPOILER PATH AVAILABLE" : "OFF" },
    { id: "spoiler-b", label: "SPOILER B SHUTOFF", active: flightControlBAvailable && s.spoilerB, cb: "SPOILER B", detail: flightControlBAvailable && s.spoilerB ? "OUTBOARD SPOILER PATH AVAILABLE" : "OFF" },
    { id: "hyd-a", label: "HYDRAULIC SYSTEM A", active: hydA > 1500, cb: "HYD CONTROL", detail: `${Math.round(hydA)} PSI` },
    { id: "hyd-b", label: "HYDRAULIC SYSTEM B", active: hydB > 1500, cb: "HYD CONTROL", detail: `${Math.round(hydB)} PSI` },
    { id: "hyd-a-edp-1", label: "SYSTEM A ENGINE 1 PUMP", active: eng1AccessoryDriven && s.engHyd1 && !s.engine1FirePulled, cb: "ENG 1 HYD PUMP", detail: eng1AccessoryDriven && s.engHyd1 && !s.engine1FirePulled ? "ACCESSORY ROTATING / PRESSURE SOURCE AVAILABLE" : "OFF / ACCESSORY NOT ROTATING" },
    { id: "hyd-a-edp-2", label: "SYSTEM A ENGINE 2 PUMP", active: eng2AccessoryDriven && s.engHyd2 && !s.engine2FirePulled, cb: "ENG 2 HYD PUMP", detail: eng2AccessoryDriven && s.engHyd2 && !s.engine2FirePulled ? "ACCESSORY ROTATING / PRESSURE SOURCE AVAILABLE" : "OFF / ACCESSORY NOT ROTATING" },
    { id: "hyd-b-elec-1", label: "SYSTEM B ELECTRIC PUMP 1", active: hydBPump1On, cb: "B ELEC HYD PUMP 1", detail: hydBPump1On ? `3000 PSI SOURCE — ${electricalSource1}` : !s.elecHyd1 ? "SWITCH OFF" : !hydBBus1Electrical ? "NO HEALTHY AC ON TRANSFER BUS 1" : "NO RESERVOIR HEAD / QTY" },
    { id: "hyd-b-elec-2", label: "SYSTEM B ELECTRIC PUMP 2", active: hydBPump2On, cb: "B ELEC HYD PUMP 2", detail: hydBPump2On ? `3000 PSI SOURCE — ${electricalSource2}` : !s.elecHyd2 ? "SWITCH OFF" : !hydBBus2Electrical ? "NO HEALTHY AC ON TRANSFER BUS 2" : "NO RESERVOIR HEAD / QTY" },
    { id: "hyd-a-module", label: "SYSTEM A MODULE / DISTRIBUTION", active: hydA > 1500, cb: "HYD A PRESSURE", detail: `${Math.round(hydA)} PSI — routes to A users` },
    { id: "hyd-b-module", label: "SYSTEM B MODULE / DISTRIBUTION", active: hydB > 1500, cb: "HYD B PRESSURE", detail: `${Math.round(hydB)} PSI — routes to B users` },
    { id: "stby-module", label: "STANDBY MODULE / DISTRIBUTION", active: hydS > 1800, cb: "STBY HYD CONTROL", detail: `${Math.round(hydS)} PSI — rudder / LE devices` },
    { id: "gear-selector-valve", label: "LANDING GEAR SELECTOR VALVE", active: hydA > 1500 && s.gear !== "OFF", cb: "LANDING GEAR LEVER", detail: hydA > 1500 ? `SYSTEM A PRESSURE — ${s.gear}` : "NO SYSTEM A PRESSURE" },
    { id: "main-gear-isolation", label: "MAIN GEAR ISOLATION VALVE", active: gearDown || (!gearUp && hydA > 1500), cb: "LANDING GEAR", detail: "NORMAL OPEN — MAINTENANCE ISOLATION PATH" },
    { id: "gear-actuators", label: "GEAR ACTUATORS / LOCKS", active: hydA > 1500 || groundAPress > 1500, cb: "LANDING GEAR", detail: gearDown ? "DOWN / LOCKED" : gearUp ? "UP / LOCKED" : "IN TRANSIT" },
    { id: "nose-steering-valve", label: "NOSE-WHEEL STEERING DEPRESSURIZATION VALVE", active: noseWheelSteeringAvailable, cb: "LANDING GEAR", detail: noseWheelSteeringAvailable ? "PRESSURIZED — GND / NOSE GEAR DOWN" : "DEPRESSURIZED" },
    { id: "brake-source-a", label: "INBOARD BRAKE HYDRAULIC PATH", active: brakeSource.li === "A" || brakeSource.ri === "A", cb: "BRAKE SYSTEM", detail: `SYSTEM A — LI ${Math.round(wheelBrakePressures.li)} / RI ${Math.round(wheelBrakePressures.ri)} PSI` },
    { id: "brake-source-b", label: "OUTBOARD BRAKE HYDRAULIC PATH", active: brakeSource.lo === "B" || brakeSource.ro === "B", cb: "BRAKE SYSTEM", detail: `SYSTEM B — LO ${Math.round(wheelBrakePressures.lo)} / RO ${Math.round(wheelBrakePressures.ro)} PSI` },
    { id: "antiskid-inbd", label: "INBD ANTISKID CHANNEL", active: indicationPower && antiskidInbdOperational, cb: "INBOARD ANTISKID", detail: antiskidInbdOperational ? "CHANNEL ON" : gearLeverRetract ? "INHIBITED — GEAR LEVER UP" : "SWITCH OFF / FAULT" },
    { id: "antiskid-outbd", label: "OUTBD ANTISKID CHANNEL", active: indicationPower && antiskidOutbdOperational, cb: "OUTBOARD ANTISKID", detail: antiskidOutbdOperational ? "CHANNEL ON" : gearLeverRetract ? "INHIBITED — GEAR LEVER UP" : "SWITCH OFF / FAULT" },
    { id: "autobrake-module", label: "AUTOBRAKE PRESSURE CONTROL", active: autobrakeActive, cb: "AUTOBRAKE CONTR", detail: autobrakeActive ? `${s.autobrake === 4 ? "RTO" : ["", "MIN", "MED", "MAX"][s.autobrake]} — ${autobrakePressure} PSI COMMAND` : "OFF / ARMED / DISARMED" },
    { id: "antiskid-valves", label: "ANTISKID VALVES → BRAKES", active: antiskidModulating, cb: "ANTISKID CONTR", detail: antiskidModulating ? "AUTOBRAKE PRESSURE ROUTED THROUGH ANTISKID" : "NO AUTOMATIC BRAKE COMMAND" },
  ];

  // Keep the complete manual-derived component inventory visible to the
  // simulator audit. Some parts are intentionally represented through a
  // higher-level system state rather than having a separate physics state;
  // they are still exposed here with their ATA/control relationship so the
  // system map and trainer audit cannot silently omit them.
  const modeledIds = new Set(components.map((c) => c.id));
  const systemHealth: Record<SimState["faults"] extends never ? string : string, boolean> = {
    powerplant: acPower || dcPower,
    hydraulics: hydA > 1500 || hydB > 1500 || hydS > 1800,
    aircond: packLFlow || packRFlow,
    pneumatic: leftManifold || rightManifold,
    cabin: s.cabinDiff > 0.05 || cabinSupplyFlow > 0.01,
    flightcontrols: flightControlAAvailable || flightControlBAvailable || standbyRudderPowered,
    landinggear: gearDown || gearUp || gearTransit,
    fuel: fuelFeedPressure1 > 0.5 || fuelFeedPressure2 > 0.5 || s.fuelTank1 > 0.5 || s.fuelTank2 > 0.5 || s.fuelTankCenter > 0.5,
    fire: fireWarn,
    apu: apuAvailable || s.apuMaster !== "OFF",
    antiice: s.antiIce1 || s.antiIce2,
  };
  const inventoryComponents = PARTS
    .filter((part) => !modeledIds.has(part.id))
    .map((part) => ({
      id: part.id,
      label: part.name,
      active: !!systemHealth[part.system],
      cb: part.controls || `ATA ${part.ata}`,
      detail: `ATA ${part.ata} · ${part.group} · system-level state represented; control: ${part.controls}`,
    }));
  const allComponents = [...components, ...inventoryComponents];

  // ATA 77 EPR indication: the real system derives EPR from Pt2/Pt7 pressure
  // sensing. The simulator does not model those pressure probes directly, so
  // this is a normalized trainer indication anchored to the supplied JT8D
  // idle reference (~1.06), rather than a claim of a manufacturer trim curve.
  // EPR is trainer-normalized to N1: ~1.15 at idle N1 (32%), ~2.0 at 100% N1 (takeoff).
  const eprFromN1 = (n1: number) => (n1 <= 32 ? 1.0 + 0.15 * (Math.max(0, n1) / 32) : 1.15 + 0.85 * (Math.min(100, n1) - 32) / 68);
  const epr1 = eng1Running ? eprFromN1(s.n1_1) : 0;
  const epr2 = eng2Running ? eprFromN1(s.n1_2) : 0;

  const { lights, lightComponents } = deriveLights(
    s,
    { ac1: transferBus1Powered, ac2: transferBus2Powered, dc1: dcBus1Powered, dc2: dcBus2Powered, bat: batteryBusPowered, hot: hotBatteryBusPowered, ac28: ac28vPowered, dc: dcPower },
    { gearUp, flaps: s.flaps },
  );

  return {
    lights,
    lightComponents,
    dcPower,
    acPower,
    acMainBus1Powered,
    acMainBus2Powered,
    ac28vMainBus2Powered,
    recircFanPowered,
    recircAirflow,
    fuelHeaterPowered,
    fuelHeater2Powered,
    fuelHeatValveOpen,
    fuelHeatValve2Open,
    fuelFilterDeltaP1Psi,
    fuelFilterDeltaP2Psi,
    fuelFilterIcing1,
    fuelFilterIcing2,
    fuelTempLow,
    fuelTempIndicationPowered,
    drainHeater1Powered,
    drainHeater2Powered,
    drainHeater1Hot,
    drainHeater2Hot,
    drainMastAirPowered,
    drainMastGroundPowered,
    drainMastForwardPowered,
    drainMastForwardLinePowered,
    drainMastAftPowered,
    alphaVaneHeatedL,
    alphaVaneHeatedR,
    doorPressureLeak,
    equipmentCoolingSupplyPowered,
    equipmentCoolingExhaustPowered,
    equipmentCoolingOverheat,
    equipmentCoolingFlow,
    yawDamperEffective,
    passengerOxygenDeployed,
    oxygenPressureIndicated,
    doorWarning,
    cvrPowered,
    cvrOff,
    serviceInterphoneEffective,
    serviceCallEffective,
    eltTransmitting,
    rainRepellentLActive,
    rainRepellentRActive,
    generatorDrive1Disconnected: gen1DriveDisconnected,
    generatorDrive2Disconnected: gen2DriveDisconnected,
    generatorDrive1LowOilPressure,
    generatorDrive2LowOilPressure,
    generatorDrive1HighOilTemp,
    generatorDrive2HighOilTemp,
    ignition1LeftOn,
    ignition1RightOn,
    ignition2LeftOn,
    ignition2RightOn,
    apuAvailable,
    apuLowOil,
    groundPowerAvailable,
    apuGenOnBus,
    eng1Running,
    eng2Running,
    thrustReverser1Active,
    thrustReverser2Active,
    ductPsi,
    leftDuctPsi,
    rightDuctPsi,
    leftManifold,
    rightManifold,
    isolationOpen,
    dualBleed,
    packLFlow,
    packRFlow,
    packLFlowRate: leftPack.flowRate,
    packRFlowRate: rightPack.flowRate,
    packLInletPsi: leftPack.inletPsi,
    packRInletPsi: rightPack.inletPsi,
    packLColdTempF: leftPack.coldTempF,
    packRColdTempF: rightPack.coldTempF,
    packL35SensorTempF: leftPack.sensorTempF,
    packR35SensorTempF: rightPack.sensorTempF,
    packLHotBypassRate: leftPack.hotBypassRate,
    packRHotBypassRate: rightPack.hotBypassRate,
    packLWarmAirTempF: leftPack.warmAirTempF,
    packRWarmAirTempF: rightPack.warmAirTempF,
    packLColdAirFlow: leftPack.coldAirFlow,
    packRColdAirFlow: rightPack.coldAirFlow,
    packLWarmAirFlow: leftPack.warmAirFlow,
    packRWarmAirFlow: rightPack.warmAirFlow,
    packLMixedAirFlow: leftPack.mixedAirFlow,
    packRMixedAirFlow: rightPack.mixedAirFlow,
    packLAirMixValve: leftPack.airMixValve,
    packRAirMixValve: rightPack.airMixValve,
    packLMixTempF: leftPack.mixTempF,
    packRMixTempF: rightPack.mixTempF,
    packLMixingChamberTempF: leftPack.mixingChamberTempF,
    packRMixingChamberTempF: rightPack.mixingChamberTempF,
    packLCompressorDischargeTempF: leftPack.compressorDischargeTempF,
    packRCompressorDischargeTempF: rightPack.compressorDischargeTempF,
    packLTurbineInletTempF: leftPack.turbineInletTempF,
    packRTurbineInletTempF: rightPack.turbineInletTempF,
    packLCompressorOverheat: leftPack.compressorOverheat,
    packRCompressorOverheat: rightPack.compressorOverheat,
    packLTurbineOverheat: leftPack.turbineOverheat,
    packRTurbineOverheat: rightPack.turbineOverheat,
    packLPackOverheatRelay: leftPack.packOverheatRelay,
    packRPackOverheatRelay: rightPack.packOverheatRelay,
    packLDuctOverheat: leftPack.ductOverheat,
    packRDuctOverheat: rightPack.ductOverheat,
    packLDuctLimitDemand: leftPack.ductLimitDemand,
    packRDuctLimitDemand: rightPack.ductLimitDemand,
    packLMixValveHotLimit: leftPack.mixValveHotLimit,
    packRMixValveHotLimit: rightPack.mixValveHotLimit,
    packLMixValveColdLimit: leftPack.mixValveColdLimit,
    packRMixValveColdLimit: rightPack.mixValveColdLimit,
    packLHotBypassFlow: leftPack.hotBypassFlow,
    packRHotBypassFlow: rightPack.hotBypassFlow,
    packLCoolingPathFlow: leftPack.coolingPathFlow,
    packRCoolingPathFlow: rightPack.coolingPathFlow,
    packLF35BypassFlow: leftPack.f35BypassFlow,
    packRF35BypassFlow: rightPack.f35BypassFlow,
    packLAcColdFlow: leftPack.acmColdFlow,
    packRAcmColdFlow: rightPack.acmColdFlow,
    packLSeparatorFlow: leftPack.separatorFlow,
    packRSeparatorFlow: rightPack.separatorFlow,
    packLTripActive: leftPack.packTrip,
    packRTripActive: rightPack.packTrip,
    packLTurbineDischargeTempF: leftPack.turbineDischargeTempF,
    packRTurbineDischargeTempF: rightPack.turbineDischargeTempF,
    packLF35SensorFailure: leftPack.f35SensorFailure,
    packRF35SensorFailure: rightPack.f35SensorFailure,
    packLF35ValveFailure: leftPack.f35ValveFailure,
    packRF35ValveFailure: rightPack.f35ValveFailure,
    packLPackTrip250: leftPack.packTrip250,
    packRPackTrip250: rightPack.packTrip250,
    packLTurbofanValve: leftPack.turbofanValve,
    packRTurbofanValve: rightPack.turbofanValve,
    groundConditionedAirActive,
    controlCabinSupplyTempF,
    passengerCabinSupplyTempF,
    controlCabinTempF: Number(s.controlCabinTempF ?? 75),
    passengerCabinTempF: Number(s.passengerCabinTempF ?? 75),
    packLStages: leftPack.stages,
    packRStages: rightPack.stages,
    cabinSupplyFlow,
    cabinExhaustFlow,
    acSupplyLeft: controlCabinSupplyFlow > 0.01,
    acSupplyRight: passengerCabinSupplyFlow > 0.01,
    bleed1Available,
    bleed2Available,
    fuelFeedPressure1,
    fuelFeedPressure2,
    fuelFeedSource1,
    fuelFeedSource2,
    fuelLowPressure1,
    fuelLowPressure2,
    fuelCenterLowPressure,
    fuelPump1FwdOn,
    fuelPump1AftOn,
    fuelPump2FwdOn,
    fuelPump2AftOn,
    fuelCenterPump1On,
    fuelCenterPump2On,
    fuelPump1FwdLowPressure,
    fuelPump1AftLowPressure,
    fuelPump2FwdLowPressure,
    fuelPump2AftLowPressure,
    fuelCenterPump1LowPressure,
    fuelCenterPump2LowPressure,
    fuelScavengeActive,
    fuelQuantityIndicationPowered,
    fuelPump1On,
    fuelPump2On,
    fuelCenterPumpOn,
    fuelShutoff1Open,
    fuelShutoff2Open,
    oilPressure1: s.oilPsi1,
    oilPressure2: s.oilPsi2,
    ignition1On,
    ignition2On,
    epr1,
    epr2,
    oilChipDetected1: s.faults.oilChip1,
    oilChipDetected2: s.faults.oilChip2,
    hydA,
    hydAPump1On,
    hydAPump2On,
    hydBPump1On,
    hydBPump2On,
    reservoirPressurized: reservoirAirAvailable,
    reservoirGroundAir: groundReservoirAir,
    hydB,
    hydS,
    groundAPress,
    hydAQty: s.hydAQty,
    hydBQty: s.hydBQty,
    hydSQty: s.hydSQty,
    hydALow,
    hydBLow,
    hydBPump1Low,
    hydBPump2Low,
    stbyOn: hydS > 500,
    gearTransit,
    gearDown,
    gearUp,
    gearPositionDisagree,
    gearPositions,
    gearLights,
    gearWarningHorn,
    masterCaution,
    fireWarn,
    engine1FireWarn,
    engine2FireWarn,
    apuFireWarn,
    wheelWellFireWarn,
    cargoFwdFireWarn,
    cargoAftFireWarn,
    standbyRudderPowered,
    alternateFlapDrivePowered,
    alternateFlapTakeover,
    alternateFlapArmed,
    teFlapHydraulicDriveAvailable,
    leDriveAvailable,
    leExtended: s.lePos > 0.97,
    leTransit: s.lePos > 0.03 && s.lePos < 0.97,
    flightControlAAvailable,
    flightControlBAvailable,
    apuGenOffBus,
    gen1OffBus,
    gen2OffBus,
    transferRelay1Alt,
    transferRelay2Alt,
    startValveOpen1,
    startValveOpen2,
    bleed13Available1,
    bleed13Available2,
    feelDiff: false,
    speedBrakeArmed: s.speedBrake === "ARMED",
    interlocks,
    components: allComponents,
    hydraulicUsers,
    electricalUsers,
    generator1BusPowered,
    generator2BusPowered,
    generator1ProtectionTripped,
    generator2ProtectionTripped,
    generator1ThreePhaseHealthy,
    generator2ThreePhaseHealthy,
    transferBus1Powered,
    transferBus2Powered,
    tr1Powered,
    tr2Powered,
    tr3Powered,
    dcBus1Powered,
    dcBus2Powered,
    electricalSource1,
    electricalSource2,
    batteryPower,
    externalPowerContactorClosed,
    externalPowerNotInUse,
    hotBatteryBusPowered,
    batteryBusPowered,
    essentialDcPower,
    standbyAcPowered,
    standbyDcPowered,
    externalDcControl,
    standbyAcSource,
    standbyDcSource,
    staticInverterPowered,
    groundServiceBusPowered,
    batteryChargerPowered,
    ac28vPowered,
    standbyAutoTransfer,
    antiskidOperational,
    antiskidInbdOperational,
    antiskidOutbdOperational,
    autobrakeTestPassed,
    autobrakeArmed,
    autobrakeActive,
    autobrakeDisarm,
    autobrakePressure,
    antiskidModulating,
    wheelSpeeds,
    wheelBrakePressures,
    targetDecel,
    actualDecel,
    manualBrakeOverride,
    controlSurfaces,
    controlAuthority: { elevator: elevatorAuthority, aileron: aileronAuthority, rudder: rudderAuthority },
    adverseYawCue,
    adverseYawDirection,
    adverseYawCorrected,
    noseWheelSteeringAngle,
    noseWheelSteeringAvailable,
    brakeSource,
  };
}

function approach(value: number, target: number, rate: number, dt: number) {
  if (value < target) return Math.min(target, value + rate * dt);
  if (value > target) return Math.max(target, value - rate * dt);
  return value;
}

/**
 * Turbine spool model (JT8D-class). A real engine does not ramp linearly: when the thrust lever is
 * slammed forward the core accelerates at the compressor-stall-limited maximum rate (fuel schedule
 * cap), then the response rounds off exponentially as it nears the target. Deceleration is similar
 * but a little lazier. `k` is the proportional gain (1/s), `maxRate` the cap in %/s, `minRate` keeps
 * the final approach from stalling asymptotically short of the target.
 */
function spool(value: number, target: number, dt: number, accel: { k: number; max: number; min: number }, decel: { k: number; max: number; min: number }) {
  const err = target - value;
  if (Math.abs(err) < 1e-4) return target;
  const c = err > 0 ? accel : decel;
  const rate = Math.min(c.max, Math.max(c.min, Math.abs(err) * c.k));
  const step = rate * dt;
  return Math.abs(err) <= step ? target : value + Math.sign(err) * step;
}
// Idle -> takeoff N1 in roughly 6-7 s, takeoff -> idle in roughly 6 s (slam accel / chop).
const N1_ACCEL = { k: 0.75, max: 15, min: 3 };
const N1_ACCEL_TO = { k: 1.3, max: 26, min: 6 };
const N1_DECEL = { k: 0.6, max: 13, min: 2.5 };
const N2_ACCEL = { k: 0.85, max: 9, min: 2.5 };
const N2_DECEL = { k: 0.65, max: 8, min: 2 };

// Trainer runway (short-field 737-200 style) — used by the Brakes tab scene.
export const RUNWAY_LENGTH_M = 1800;
export const RUNWAY_AIMPOINT_M = 300;
export const RUNWAY_HALF_WIDTH_M = 22.9;
export const PATCH_START_M = 400;
export const PATCH_END_M = 1000;

export function step(s: SimState, dt: number): SimState {
  const n = { ...s, faults: { ...s.faults } };
  const d = derive(n);
  // ATA 28-42-01 WDM (effectivity 359) places the temperature bulb in Tank
  // No.1. ATA 73-14-0 describes engine-local fuel heating downstream of the
  // tank; therefore an engine heat cycle must NOT artificially raise the tank
  // temperature gauge. The only prescribed timer duration used here is the
  // AMM's one-minute auto-return. Outlet temperature rates/targets are trainer
  // visuals, not Boeing limits or an engine fuel-ice melting schedule.
  const fuelAmbientC = (Number(n.ambientTempF ?? 59) - 32) * 5 / 9;
  n.fuelTempC = approach(n.fuelTempC, fuelAmbientC, 0.008, dt);
  const fuelHeatTimerDt = dt * n.timeScale;
  // ATA 75-12-01 WDM: ENG 1 heater/timer circuit follows DC Bus 1 and ENG 2
  // follows DC Bus 2. Do not substitute aggregate DC availability here.
  const fuelHeatControlAvailable1 = d.dcBus1Powered && n.circuitBreakers["fuel-heat-1"];
  const fuelHeatControlAvailable2 = d.dcBus2Powered && n.circuitBreakers["fuel-heat-2"];
  if (n.fuelHeat && fuelHeatControlAvailable1) {
    n.fuelHeatElapsedSec = Math.min(60, n.fuelHeatElapsedSec + fuelHeatTimerDt);
    if (n.fuelHeatElapsedSec >= 60) n.fuelHeat = false;
  } else if (!n.fuelHeat && n.fuelHeatElapsedSec < 60) {
    n.fuelHeatElapsedSec = 0;
  } else if (!n.circuitBreakers["fuel-heat-1"]) {
    n.fuelHeatElapsedSec = 0;
  }
  if (n.fuelHeat2 && fuelHeatControlAvailable2) {
    n.fuelHeat2ElapsedSec = Math.min(60, n.fuelHeat2ElapsedSec + fuelHeatTimerDt);
    if (n.fuelHeat2ElapsedSec >= 60) n.fuelHeat2 = false;
  } else if (!n.fuelHeat2 && n.fuelHeat2ElapsedSec < 60) {
    n.fuelHeat2ElapsedSec = 0;
  } else if (!n.circuitBreakers["fuel-heat-2"]) {
    n.fuelHeat2ElapsedSec = 0;
  }
  if (n.faults.fuelFilterIcingFault1 && !n.fuelFilterIceInjected1) {
    n.fuelFilterIceFraction1 = 1;
    n.fuelFilterIceInjected1 = true;
  } else if (!n.faults.fuelFilterIcingFault1) {
    n.fuelFilterIceInjected1 = false;
    n.fuelFilterIceFraction1 = 0;
  }
  if (n.faults.fuelFilterIcingFault2 && !n.fuelFilterIceInjected2) {
    n.fuelFilterIceFraction2 = 1;
    n.fuelFilterIceInjected2 = true;
  } else if (!n.faults.fuelFilterIcingFault2) {
    n.fuelFilterIceInjected2 = false;
    n.fuelFilterIceFraction2 = 0;
  }
  // AMM says warm fuel gradually melts ice from the main filter during the
  // one-minute engine fuel-heater cycle. This linear ice-clearance rate is a
  // trainer approximation; the AMM does not specify a universal melt rate.
  if (d.fuelHeatValveOpen && d.eng1Running) n.fuelFilterIceFraction1 = Math.max(0, n.fuelFilterIceFraction1 - fuelHeatTimerDt / 60);
  if (d.fuelHeatValve2Open && d.eng2Running) n.fuelFilterIceFraction2 = Math.max(0, n.fuelFilterIceFraction2 - fuelHeatTimerDt / 60);
  const fuelHeater1Effective = d.fuelHeaterPowered && d.eng1Running;
  const fuelHeater2Effective = d.fuelHeater2Powered && d.eng2Running;
  const fuelHeater1OutletTarget = fuelHeater1Effective ? Math.max(fuelAmbientC + 35, 45) : fuelAmbientC;
  const fuelHeater2OutletTarget = fuelHeater2Effective ? Math.max(fuelAmbientC + 35, 45) : fuelAmbientC;
  n.fuelHeater1OutletTempC = approach(n.fuelHeater1OutletTempC, fuelHeater1OutletTarget, fuelHeater1Effective ? 0.7 : 0.06, dt);
  n.fuelHeater2OutletTempC = approach(n.fuelHeater2OutletTempC, fuelHeater2OutletTarget, fuelHeater2Effective ? 0.7 : 0.06, dt);
  // ATA 30-71 heater response follows the WDM's distinct toilet-drain and
  // drain-mast electrical feeds. Thermal rates are trainer-only; the WDM
  // establishes which AC bus/circuit is selected, not temperature-time rates.
  const drainAmbientC = (Number(n.ambientTempF ?? 59) - 32) * 5 / 9;
  const toiletFwdOn = d.acMainBus2Powered && n.circuitBreakers["drain-heater"] && !n.faults.drainHeaterFailure1;
  const toiletAftOn = d.acMainBus2Powered && n.circuitBreakers["drain-heater"] && !n.faults.drainHeaterFailure2;
  const drainMastOn = d.drainMastAirPowered || d.drainMastGroundPowered;
  n.drainHeater1TempC = approach(n.drainHeater1TempC, toiletFwdOn ? Math.max(25, drainAmbientC + 20) : drainAmbientC, toiletFwdOn ? 0.22 : 0.02, dt);
  n.drainHeater2TempC = approach(n.drainHeater2TempC, toiletAftOn ? Math.max(25, drainAmbientC + 20) : drainAmbientC, toiletAftOn ? 0.22 : 0.02, dt);
  n.drainMastForwardTempC = approach(n.drainMastForwardTempC, drainMastOn ? Math.max(25, drainAmbientC + (d.drainMastAirPowered ? 28 : 18)) : drainAmbientC, drainMastOn ? 0.22 : 0.02, dt);
  n.drainMastForwardLineTempC = approach(n.drainMastForwardLineTempC, drainMastOn ? Math.max(25, drainAmbientC + (d.drainMastAirPowered ? 24 : 14)) : drainAmbientC, drainMastOn ? 0.22 : 0.02, dt);
  n.drainMastAftTempC = approach(n.drainMastAftTempC, drainMastOn ? Math.max(25, drainAmbientC + (d.drainMastAirPowered ? 28 : 18)) : drainAmbientC, drainMastOn ? 0.22 : 0.02, dt);

  // ATA 24-11: simplified drive-oil pressure and temperature responses. The
  // disconnect solenoid, low-pressure and over-temperature paths are modeled
  // separately so DISC does not merely flip the generator switch.
  for (const side of [1, 2] as const) {
    const n2 = side === 1 ? n.n2_1 : n.n2_2;
    const connected = side === 1 ? !(n.gen1Disc && n.circuitBreakers["gen-drive-disc-1"] && !n.faults.genDriveDisconnectFailure1) : !(n.gen2Disc && n.circuitBreakers["gen-drive-disc-2"] && !n.faults.genDriveDisconnectFailure2);
    const lowFault = side === 1 ? n.faults.genDriveOilPressureLow1 : n.faults.genDriveOilPressureLow2;
    const hotFault = side === 1 ? n.faults.genDriveOilOverheat1 : n.faults.genDriveOilOverheat2;
    const pressureTarget = n2 > 5 && connected && !lowFault ? 60 : 0;
    const tempTarget = hotFault ? 135 : n2 > 5 && connected ? 99 : (Number(n.ambientTempF ?? 59) - 32) * 5 / 9;
    if (side === 1) {
      n.genDriveOilPressure1Psi = approach(n.genDriveOilPressure1Psi, pressureTarget, 80, dt);
      n.genDriveOilTemp1C = approach(n.genDriveOilTemp1C, tempTarget, hotFault ? 2.4 : 0.25, dt);
    } else {
      n.genDriveOilPressure2Psi = approach(n.genDriveOilPressure2Psi, pressureTarget, 80, dt);
      n.genDriveOilTemp2C = approach(n.genDriveOilTemp2C, tempTarget, hotFault ? 2.4 : 0.25, dt);
    }
  }
  // Momentary P5 controls are timers so repeated clicks are visible system events.
  n.rainRepelTimerL = n.circuitBreakers["rain-repellent-left"] ? Math.max(0, n.rainRepelTimerL - dt) : 0;
  n.rainRepelTimerR = n.circuitBreakers["rain-repellent-right"] ? Math.max(0, n.rainRepelTimerR - dt) : 0;
  if (n.irsLMode === "OFF") n.irsAlignL = 0;
  else if (d.dcPower && n.circuitBreakers["irs-left"] && n.irsLMode === "ALIGN") n.irsAlignL = Math.min(1, n.irsAlignL + dt / 90);
  if (n.irsRMode === "OFF") n.irsAlignR = 0;
  else if (d.dcPower && n.circuitBreakers["irs-right"] && n.irsRMode === "ALIGN") n.irsAlignR = Math.min(1, n.irsAlignR + dt / 90);
  if (n.irsLMode === "NAV" && n.irsAlignL >= 1 && d.dcPower && n.circuitBreakers["irs-left"]) n.irsHeadingL = n.attitudeHeadingDeg;
  if (n.irsRMode === "NAV" && n.irsAlignR >= 1 && d.dcPower && n.circuitBreakers["irs-right"]) n.irsHeadingR = n.attitudeHeadingDeg;
  if (n.cvrErase && d.dcPower && n.circuitBreakers.cvr && n.wow && n.parkingBrake && !n.faults.cvrFailure) n.cvrMemoryErased = true;
  if (d.dcPower && n.circuitBreakers.cvr && !n.faults.cvrFailure && n.flightRecorderMode === "NORMAL") n.cvrElapsedSec += dt;
  // Qualitative E/E bay thermal response: both fans and NORMAL selections
  // remove heat; lost power/fault/ALTERNATE selections increase residual temp.
  const coolingNow = d.equipmentCoolingFlow;
  const ambientC = (Number(n.ambientTempF ?? 75) - 32) * 5 / 9;
  const equipmentBayTargetC = coolingNow > 0 && !n.faults.equipmentCoolingFailure
    ? ambientC + 12 + (1 - coolingNow) * 16
    : ambientC + 55;
  n.equipmentBayTempC = approach(n.equipmentBayTempC, equipmentBayTargetC, coolingNow > 0 ? 0.025 : 0.012, dt);
  // ATA 35 oxygen use/leakage: state response is intentionally qualitative trainer behavior;
  // bottle pressure is not held static when crew oxygen is selected or the system has a leak.
  if (n.faults.oxygenSystemFailure) n.crewOxyPsi = Math.max(0, n.crewOxyPsi - 0.35 * dt);
  else if (n.crewOxyMode === "ON" && n.crewOxyPsi > 0) n.crewOxyPsi = Math.max(0, n.crewOxyPsi - 0.06 * dt);
  if (n.engine1FirePulled) n.cvrTest = false;
  if (n.rev1 && !d.thrustReverser1Active) n.rev1 = false;
  if (n.rev2 && !d.thrustReverser2Active) n.rev2 = false;

  // ATA 28-22-0 post-SB 28A1228: center pump low-pressure caution at 10 s,
  // relay cutout at 15 s. The panel switch remains ON until the crew cycles it OFF.
  for (const side of [1, 2] as const) {
    const switchOn = side === 1 ? n.fuelPumpCenter1 : n.fuelPumpCenter2;
    const pumpPowered = side === 1 ? d.fuelCenterPump1On : d.fuelCenterPump2On;
    const tripKey = side === 1 ? "fuelCenterPump1RelayTripped" : "fuelCenterPump2RelayTripped";
    const timerKey = side === 1 ? "fuelCenterPump1LowPressureTimer" : "fuelCenterPump2LowPressureTimer";
    if (!switchOn) {
      n[tripKey] = false;
      n[timerKey] = 0;
    } else if (n.fuelCenterPumpAutoShutoffInstalled && !pumpPowered) {
      n[timerKey] += dt;
      if (n[timerKey] >= 15) n[tripKey] = true;
    } else if (pumpPowered) {
      n[timerKey] = 0;
    }
  }

  // Trainer flight-attitude model. ATA 27 defines the hydraulic control-surface
  // interfaces; the supplied manuals do not provide a flight-dynamics model,
  // so these rates are deliberately normalized rather than presented as AMM
  // performance data.
  const af = derive(n);
  const rollCmd = af.controlSurfaces.aileronR;
  const pitchCmd = af.controlSurfaces.elevator;
  const speedFactor = Math.max(0.25, Math.min(1, n.psFlightCasKt / 140));
  n.attitudeRollDeg = approach(n.attitudeRollDeg, rollCmd * 28, 16 * speedFactor, dt);
  const trimCutoutActive = (n.stabTrimCutoutA || n.stabTrimCutoutB) && !n.stabTrimOverride;
  const trimPitchBias = trimCutoutActive ? 0 : (n.stabTrimUnits - 5) * 0.08;
  n.attitudePitchDeg = approach(n.attitudePitchDeg, pitchCmd * 12 + trimPitchBias, 5.5, dt);
  n.attitudeYawRate = approach(n.attitudeYawRate, af.controlSurfaces.rudder * 4 + n.attitudeRollDeg * 0.035, 2.5, dt);
  // ATA 22-15: yaw damping is a training response gated by DC, System B pressure,
  // and the yaw-damper control-system health state.
  if (af.yawDamperEffective) n.attitudeYawRate *= 0.35;
  n.attitudeHeadingDeg = (n.attitudeHeadingDeg + n.attitudeYawRate * dt + 360) % 360;

  if (n.apuFirePulled) {
    n.apuMaster = "OFF";
    n.apuBleed = false;
    n.apuGen = false;
    n.apuLeftControl = false;
    n.apuRightControl = false;
  }

  if (n.engine1FirePulled) {
    n.lever1 = false;
    n.gen1 = false;
    n.bleed1 = false;
    n.engHyd1 = false;
    n.start1 = "OFF";
  }
  if (n.engine2FirePulled) {
    n.lever2 = false;
    n.gen2 = false;
    n.bleed2 = false;
    n.engHyd2 = false;
    n.start2 = "OFF";
  }

  // ---- wheel well + cargo fire behaviour (training model) ------------------
  // Wheel well: an enclosed fire builds with the gear retracted and is starved /
  // cooled by airflow once the gear is extended.
  if (n.wheelWellFire) {
    const geared = (n.noseGearPos + n.leftMainGearPos + n.rightMainGearPos) / 3;
    if (geared < 0.3) n.wheelWellLevel = Math.min(1, n.wheelWellLevel + 0.04 * dt);
    else if (geared > 0.9) n.wheelWellLevel = Math.max(0, n.wheelWellLevel - 0.1 * dt);
    if (n.wheelWellLevel <= 0.02 && geared > 0.9) { n.wheelWellFire = false; n.wheelWellLevel = 0; }
  } else if (n.wheelWellLevel > 0) {
    n.wheelWellLevel = Math.max(0, n.wheelWellLevel - 0.2 * dt);
  }
  // Cargo (effectivity-dependent, SB 26A1081): dual-loop smoke detection + single bottle.
  // When cargoFireInstalled is false the system is not present — fires still grow for
  // training visibility but produce no warnings and cannot be armed/discharged.
  if (n.cargoBottleDischarged) n.cargoAgentTimer += dt;
  (["Fwd", "Aft"] as const).forEach((c) => {
    const fireKey = `cargo${c}Fire` as "cargoFwdFire" | "cargoAftFire";
    const levelKey = `cargo${c}Level` as "cargoFwdLevel" | "cargoAftLevel";
    const armedHere = n.cargoFireInstalled && n.cargoArmed === c.toUpperCase();
    if (n[fireKey]) {
      if (n.cargoBottleDischarged && armedHere) {
        // Agent rapidly suppresses the fire; residual smoke clears more slowly.
        // Real bottle provides a finite discharge window; after ~30 s the residual rate slows.
        const agentRate = n.cargoAgentTimer < 30 ? 0.12 : 0.03;
        n[levelKey] = Math.max(0.02, n[levelKey] - agentRate * dt);
        if (n[levelKey] <= 0.08 && n.cargoAgentTimer > 8) n[fireKey] = false;
      } else {
        n[levelKey] = Math.min(1, n[levelKey] + 0.015 * dt);
      }
    } else if (n[levelKey] > 0) {
      n[levelKey] = Math.max(0, n[levelKey] - 0.04 * dt);
    }
  });
  // Dual-loop health: a failed loop reduces detection sensitivity (both loops required for full credit).
  if (!n.cargoFireInstalled) {
    n.cargoArmed = "NONE";
    n.cargoBottleDischarged = false;
  }

  // Window heat P5-9 (ATA 30-41): OVHT test latches overheat on any window that is ON.
  // Real test is momentary; we clear latches only when that window switch is cycled OFF (done in UI).
  if (n.windowHeatTest === "OVHT") {
    if (n.windowHeatLFwd) n.windowHeatOvhtLFwd = true;
    if (n.windowHeatLSide) n.windowHeatOvhtLSide = true;
    if (n.windowHeatRFwd) n.windowHeatOvhtRFwd = true;
    if (n.windowHeatRSide) n.windowHeatOvhtRSide = true;
  }

  // ATA 28-15 center-tank scavenge: when both center boost pumps are OFF,
  // the scavenge system is enabled for a 20-minute timed period and uses the
  // No. 1 boost-pump flow to siphon residual center-tank fuel into tank No. 1.
  // The transfer quantity is deliberately trainer-normalized because the manual
  // describes the timed operation but does not provide a simulator flow rate.
  const centerPumpsOff = !n.fuelPumpCenter1 && !n.fuelPumpCenter2;
  if (!centerPumpsOff || n.fuelTankCenter <= 0.5 || !d.fuelPump1On) n.fuelScavengeTimer = 0;
  else if (n.fuelScavengeTimer <= 0) n.fuelScavengeTimer = 0.01;
  if (n.fuelScavengeTimer > 0 && n.fuelScavengeTimer < 1200 && d.fuelPump1On && n.fuelTankCenter > 0.5) {
    n.fuelScavengeTimer = Math.min(1200, n.fuelScavengeTimer + dt);
    const transfer = Math.min(n.fuelTankCenter, 0.015 * dt);
    n.fuelTankCenter -= transfer;
    n.fuelTank1 = Math.min(100, n.fuelTank1 + transfer);
  }

  // ATA 49-11-0: start control is powered by the hot battery bus. Once the
  // APU is running, its generator control-unit TR can maintain the control
  // circuit if battery-bus power is lost. The aircraft AC GPU is not a
  // substitute for the separate 24–28 VDC external supply described in the AMM.
  const apuControlPower = d.batteryPower ||
    (d.apuAvailable && n.apuGen && !n.faults.apuGeneratorBreakerFailure && !n.apuFirePulled);
  const wantFuel = n.apuMaster !== "OFF" && !n.apuFirePulled && apuControlPower ? 1 : 0;
  n.apuFuelValve = approach(n.apuFuelValve, wantFuel, 1.2, dt);

  const apuFuelValveClosed = n.apuFuelValve <= 0.02;
  const doorTarget = n.apuFirePulled
    ? 0
    : n.apuFuelValve > 0.98 && n.apuMaster !== "OFF"
      ? (n.faults.apuDoorJam ? 0.35 : 1)
      : apuFuelValveClosed
        ? 0
        : n.apuDoor;
  n.apuDoor = approach(n.apuDoor, doorTarget, 0.1, dt); // ~10 s inlet door travel

  // ATA 49-11-0: during start, the starter motor is powered from the hot
  // battery bus. A separate 24–28 VDC supply cart is a maintenance provision;
  // the aircraft AC GPU is not wired as a direct substitute in this trainer.
  // Starter engagement requires the fully-open inlet door and speed limits.
  const apuStarterElectrical = d.batteryPower;
  const apuStarterCutoutPercent = n.apuStart50PercentEffectivityInstalled ? 50 : 35;
  const apuStartTimeoutSeconds = n.apuStart50PercentEffectivityInstalled ? 90 : 60;
  const starter =
    n.apuMaster === "START" &&
    n.apuDoor > 0.98 &&
    n.apuRpm < apuStarterCutoutPercent &&
    apuStarterElectrical;
  n.apuStarter = starter;

  let rpmTarget = 0;
  const lightoffPermitted = n.apuOilPsi >= 4.5;
  const lowOilRunningHold = n.faults.apuLowOilPressure && n.apuRpm >= 95;
  if (n.apuMaster !== "OFF" && n.apuFuelValve > 0.5 && n.apuDoor > 0.98 &&
      (lightoffPermitted || lowOilRunningHold) && !n.faults.apuOverspeed && !n.faults.apuHighOilTemperature) {
    rpmTarget = starter || n.apuRpm > 12 ? 100 : n.apuRpm;
  }
  // The selected AMM effectivity determines starter cutout and start timeout.
  if (starter) n.apuRpm = approach(n.apuRpm, 55, 2.5, dt);
  else if (n.apuRpm > 12 && n.apuMaster !== "OFF") n.apuRpm = approach(n.apuRpm, rpmTarget, 4, dt);
  else n.apuRpm = approach(n.apuRpm, 0, 3, dt);

  if (n.apuMaster === "START" && n.apuRpm >= apuStarterCutoutPercent) n.apuMaster = "ON";
  // ATA 49-11-0 starts the 60/90-second timer only after the inlet door is
  // fully open and the cranking circuit is enabled, not while the door travels.
  const apuStartAttemptActive = n.apuDoor > 0.98 && (n.apuMaster === "START" ||
    (n.apuMaster === "ON" && n.apuStartTimer > 0 && n.apuRpm < 95));
  if (apuStartAttemptActive && n.apuRpm < 95) n.apuStartTimer += dt;
  else if (!apuStartAttemptActive || n.apuRpm >= 95) n.apuStartTimer = 0;
  if (n.apuStartTimer >= apuStartTimeoutSeconds && n.apuRpm < 95) {
    n.apuMaster = "OFF";
    n.apuStarter = false;
    n.apuStartTimer = 0;
  }
  // ATA 49-00-00: low-oil abnormal indication occurs at approximately 45 psi;
  // automatic shutdown follows in 10 +/- 2 seconds. The 55-psi recovery point
  // is handled separately by the indication latch below.
  if (n.apuRpm >= 95 && n.apuOilPsi <= 45) n.apuLowOilShutdownTimer += dt;
  else n.apuLowOilShutdownTimer = 0;
  if (n.apuRpm >= 95 && (n.faults.apuOverspeed || n.faults.apuHighOilTemperature || n.faults.apuFireDetected || n.apuLowOilShutdownTimer >= 10)) {
    n.apuMaster = "OFF";
    n.apuStarter = false;
    n.apuBleed = false;
    n.apuGen = false;
    n.apuLeftControl = false;
    n.apuRightControl = false;
    n.apuStartTimer = 0;
  }

  // The AMM establishes the start sequence and oil-pressure thresholds, but
  // does not give a fixed 30-second EGT transient. Keep EGT continuous rather
  // than inventing a timed step.
  // Trainer assumption: EGT rises with a modest light-off/acceleration hump
  // (peak near 70% rpm) and settles to the running value above 95%.
  const apuEgtHump = n.apuRpm > 8 && n.apuRpm < 95 ? 160 * Math.max(0, 1 - Math.abs(n.apuRpm - 70) / 30) : 0;
  // Fuel and ignition are sequenced by the oil-pressure switch, not merely
  // by opening the upstream APU fuel valve / rotating the engine.
  const apuCombustion = n.apuMaster !== "OFF" && n.apuFuelValve > 0.98 &&
    lightoffPermitted && n.apuRpm > 8 && !n.apuFirePulled;
  const apuEgtTarget = apuCombustion
    ? 340 + n.apuBleedValve * 80 + (n.apuGen ? 30 : 0) + apuEgtHump
    : 18;
  n.apuEgt = approach(n.apuEgt, apuEgtTarget, 25, dt);

  // ATA 49-11-0: oil pressure rises while the starter is rotating the APU;
  // the ~4.5-psig sequencing switch must close before the 35%/50% starter
  // cutout so fuel and ignition can establish light-off. A previous step
  // modeled zero oil pressure below 35% RPM, making the sequence impossible:
  // the starter cut out first, then the APU spooled down before reaching 4.5.
  // The manual gives the sequencing threshold and the 55-psig low-oil-light
  // cutoff, not a full RPM/pressure curve; this ramp is a trainer approximation.
  const apuOilTarget = n.faults.apuLowOilPressure ? 0 : n.apuRpm >= 75 ? 95 : n.apuRpm >= 35 ? 50 : n.apuRpm > 5 ? (n.apuRpm / 35) * 50 : 0;
  n.apuOilPsi = approach(n.apuOilPsi, apuOilTarget, 8, dt);
  // The pressure switch has hysteresis: master ON/start illuminates at low
  // pressure; it goes out at 55 psi and does not relight on rundown until 45 psi.
  if (n.apuMaster === "OFF") n.apuLowOilLightOn = false;
  else if (n.apuOilPsi <= 45) n.apuLowOilLightOn = true;
  else if (n.apuOilPsi >= 55) n.apuLowOilLightOn = false;

  const bleedWant = d.apuAvailable && n.apuBleed ? 1 : 0;
  n.apuBleedValve = approach(n.apuBleedValve, bleedWant, 1 / 13, dt); // 12–14 s per AMM data

  const runEngine = (
    start: typeof n.start1,
    lever: boolean,
    n2: number,
    n1: number,
    egt: number,
    ff: number,
    valve: boolean,
    side: 1 | 2,
    sidePsi: number,
    fuelPsi: number,
    throttle: number,
    ignitionLeftOn: boolean,
    ignitionRightOn: boolean,
  ) => {
    const ignitionOn = ignitionLeftOn || ignitionRightOn;
    const psiOk = sidePsi >= 30;
    const fuelAvailable = fuelPsi > 0.5;
    // On the 737-200 the pneumatic starter valve is commanded by GRD for a
    // normal ground start. L/R IGN are ignition selections; they do not open
    // the pneumatic starter valve. FLT is retained as an ignition/start
    // selection for the model but does not create ground-start air.
    const startCommand = start === "GRD";
    const priorOnTime = side === 1 ? n.starterOnTime1 : n.starterOnTime2;
    const priorCooldown = side === 1 ? n.starterCooldown1 : n.starterCooldown2;
    const extendedUsed = side === 1 ? n.starterExtendedUsed1 : n.starterExtendedUsed2;
    const abortTimer = side === 1 ? n.startAbortTimer1 : n.startAbortTimer2;
    const hungTimer = side === 1 ? n.startHungTimer1 : n.startHungTimer2;
    // ATA 71: starter re-engagement is recommended at 0% N2 and is not
    // permitted above 20% N2. A continuing starter run may cross 20% while
    // the valve is already open; only a NEW engagement is restricted.
    const reengagementAllowed = priorOnTime > 0 || n2 <= 20;
    const normalDutyAvailable = priorCooldown <= 0.01 && priorOnTime < 30;
    const extendedDutyAvailable = priorCooldown <= 0.01 && priorOnTime < 60 && (extendedUsed || n2 < 35);
    const dutyAvailable = normalDutyAvailable || (priorOnTime >= 30 && extendedDutyAvailable);
    const wantValve = startCommand && psiOk && d.dcPower && n2 < 38 && dutyAvailable && reengagementAllowed;
    const nextValve = wantValve || (abortTimer > 0 && psiOk && d.dcPower && n2 < 38);
    let nextN2 = n2;
    let nextN1 = n1;
    let nextEgt = egt;
    let nextFf = ff;
    let nextOilPsi = side === 1 ? n.oilPsi1 : n.oilPsi2;
    // Trainer timing (1x): starter alone turns N2 up at ~1.4 %/s (≈15 s to the
    // ~20% fuel-on point, dry motoring cuts out at 38%).
    if (nextValve) nextN2 = approach(n2, 42, 1.4, dt);
    // Fuel/ignition can be introduced only after the starter has established
    // meaningful N2 rotation. This prevents the IDLE lever from magically
    // creating an engine start with no pneumatic motoring.
    // Ignition is required to establish light-off, but it is not a continuous
    // fuel-running requirement. On the real start sequence the starter switch
    // returns to OFF at approximately 35–40% N2 and the igniters are removed;
    // the engine must nevertheless continue running on its established fuel
    // flow. Keep ignition as a light-off gate only, then latch combustion once
    // fuel flow/engine speed has been established.
    const combustionEstablished = ff > 25 && n2 > 24;
    const hotStart = lever && !combustionEstablished && n2 > 18 && (ff >= 1100 || egt >= 400);
    const startLightTimer = side === 1 ? n.startLightTimer1 : n.startLightTimer2;
    if (lever && n2 >= 15 && !combustionEstablished && !hotStart) {
      const nextLightTimer = startLightTimer + dt;
      if (side === 1) n.startLightTimer1 = nextLightTimer;
      else n.startLightTimer2 = nextLightTimer;
      // ATA 71: no light-off within 20 seconds is an abnormal start.
      if (nextLightTimer >= 20) {
        if (side === 1) { n.lever1 = false; n.startAbortTimer1 = 12; }
        else { n.lever2 = false; n.startAbortTimer2 = 12; }
      }
    } else if (combustionEstablished) {
      if (side === 1) n.startLightTimer1 = 0;
      else n.startLightTimer2 = 0;
    }
    if (hotStart) {
      // ATA 71: return the start lever to CUTOFF and motor the engine to
      // clear fuel/vapor. The 12 s trainer timer represents the specified
      // 10–15 s clearing period.
      if (side === 1) { n.lever1 = false; n.startAbortTimer1 = 12; }
      else { n.lever2 = false; n.startAbortTimer2 = 12; }
    }
    if (combustionEstablished) {
      const nextHungTimer = hungTimer + dt;
      if (side === 1) n.startHungTimer1 = nextHungTimer;
      else n.startHungTimer2 = nextHungTimer;
      // ATA 71: never permit more than 30 seconds from light-off to idle.
      // The trainer's idle target is 57% N2.
      if (n2 >= 56) {
        if (side === 1) n.startHungTimer1 = 0;
        else n.startHungTimer2 = 0;
      } else if (nextHungTimer >= 30) {
        if (side === 1) { n.lever1 = false; n.startAbortTimer1 = 12; }
        else { n.lever2 = false; n.startAbortTimer2 = 12; }
      }
    } else if (!lever) {
      if (side === 1) n.startHungTimer1 = 0;
      else n.startHungTimer2 = 0;
    }
    if (lever && n2 > 18 && fuelAvailable && (ignitionOn || combustionEstablished) && !hotStart) {
      // Fuel on at ~20% N2: light-off EGT hump around 30–40% N2, then the
      // engine accelerates to idle (~57% N2) — roughly 40–50 s from START.
      const egtHump = n2 > 20 && n2 < 48 ? 200 * Math.max(0, 1 - Math.abs(n2 - 32) / 16) : 0;
      const thrust = Math.max(0, Math.min(1, throttle));
      const n1Target = 32 + 60 * thrust; // idle ~32% -> 100% at full thrust
      const n2Target = 57 + 41 * thrust; // idle ~57% -> ~98% at full thrust
      const ffTarget = 650 + 1250 * thrust;
      // Above ~55% N2 the engine is self-sustaining and answers the thrust lever like a real
      // turbine (fast, rounded response). Below that we are still in the start sequence, which keeps
      // the slow, AMM-timed acceleration to idle (~40-50 s from START).
      const selfSustaining = n2 >= 55;
      if (selfSustaining) {
        nextN2 = spool(nextN2, n2Target, dt, N2_ACCEL, N2_DECEL);
        // slamming to takeoff thrust (>=95% lever) uses the quicker takeoff schedule so N1 / EPR follow the lever within ~3-4 s
        nextN1 = spool(n1, n1Target, dt, thrust >= 0.95 ? N1_ACCEL_TO : N1_ACCEL, N1_DECEL);
        // fuel flow leads the spool (the FCU meters fuel first), EGT overshoots slightly while accelerating
        nextFf = approach(ff, ffTarget + Math.max(0, n1Target - n1) * 9, 520, dt);
        const accelBump = Math.max(0, Math.min(45, (n1Target - n1) * 1.1));
        nextEgt = approach(egt, 320 + n1 * 0.7 + thrust * 70 + accelBump, 110, dt);
      } else {
        nextFf = approach(ff, ffTarget, 180, dt);
        nextEgt = approach(egt, 320 + n1 * 0.7 + egtHump + thrust * 70, 60, dt);
        nextN2 = approach(nextN2, n2Target, 1.35, dt);
        nextN1 = approach(n1, n1Target, 0.9, dt);
      }
      nextOilPsi = approach(nextOilPsi, n2 >= 75 ? 95 : n2 >= 20 ? 50 : 0, 15, dt);
    } else {
      nextFf = approach(ff, 0, 400, dt);
      if (!nextValve) {
        // Coast-down / cool-down (~1 min at 1x).
        nextN2 = approach(n2, 0, 0.9, dt);
        nextN1 = approach(n1, 0, 0.6, dt);
        nextEgt = approach(egt, 12, 8, dt);
        nextOilPsi = approach(nextOilPsi, 0, 2, dt);
      }
    }
    // ATA 80/71: the starter cutout switch opens at 35–40% N2 and the GRD
    // start switch returns to OFF automatically, independent of whether the
    // start lever was left in CUTOFF. This is the actual starter cutout
    // boundary; it is not a trainer-only convenience.
    if (startCommand && nextN2 >= 38) {
      if (side === 1) n.start1 = "OFF";
      else n.start2 = "OFF";
    }
    return { nextValve, nextN2, nextN1, nextEgt, nextFf, nextOilPsi };
  };

  const e1 = runEngine(n.start1, n.lever1, n.n2_1, n.n1_1, n.egt1, n.ff1, n.startValve1, 1, d.leftDuctPsi, d.fuelFeedPressure1, n.throttle1, d.ignition1LeftOn, d.ignition1RightOn);
  const priorValve1 = n.startValve1;
  const priorOnTime1 = n.starterOnTime1;
  n.startValve1 = e1.nextValve;
  n.starterOnTime1 = n.startValve1 ? priorOnTime1 + dt : 0;
  if (n.startAbortTimer1 > 0) n.startAbortTimer1 = Math.max(0, n.startAbortTimer1 - dt);
  if (priorValve1 && !n.startValve1) {
    const extended = priorOnTime1 >= 30;
    n.starterCooldown1 = extended ? 300 : 60;
    n.starterExtendedUsed1 = extended;
  } else {
    n.starterCooldown1 = Math.max(0, n.starterCooldown1 - dt);
    if (n.starterCooldown1 <= 0.01 && !n.startValve1) n.starterExtendedUsed1 = false;
  }
  if (n.starterOnTime1 >= 30 && !n.starterExtendedUsed1 && n.n2_1 < 35) n.starterExtendedUsed1 = true;
  if (n.startAbortTimer1 <= 0 && !n.lever1 && n.startLightTimer1 > 0) n.startLightTimer1 = 0;
  if (n.startAbortTimer1 <= 0 && !n.lever1) n.startHungTimer1 = 0;
  n.n2_1 = e1.nextN2;
  n.n1_1 = e1.nextN1;
  n.egt1 = e1.nextEgt;
  n.ff1 = e1.nextFf;
  n.oilPsi1 = e1.nextOilPsi;

  const e2 = runEngine(n.start2, n.lever2, n.n2_2, n.n1_2, n.egt2, n.ff2, n.startValve2, 2, d.rightDuctPsi, d.fuelFeedPressure2, n.throttle2, d.ignition2LeftOn, d.ignition2RightOn);
  const priorValve2 = n.startValve2;
  const priorOnTime2 = n.starterOnTime2;
  n.startValve2 = e2.nextValve;
  n.starterOnTime2 = n.startValve2 ? priorOnTime2 + dt : 0;
  if (n.startAbortTimer2 > 0) n.startAbortTimer2 = Math.max(0, n.startAbortTimer2 - dt);
  if (priorValve2 && !n.startValve2) {
    const extended = priorOnTime2 >= 30;
    n.starterCooldown2 = extended ? 300 : 60;
    n.starterExtendedUsed2 = extended;
  } else {
    n.starterCooldown2 = Math.max(0, n.starterCooldown2 - dt);
    if (n.starterCooldown2 <= 0.01 && !n.startValve2) n.starterExtendedUsed2 = false;
  }
  if (n.starterOnTime2 >= 30 && !n.starterExtendedUsed2 && n.n2_2 < 35) n.starterExtendedUsed2 = true;
  if (n.startAbortTimer2 <= 0 && !n.lever2 && n.startLightTimer2 > 0) n.startLightTimer2 = 0;
  if (n.startAbortTimer2 <= 0 && !n.lever2) n.startHungTimer2 = 0;
  n.n2_2 = e2.nextN2;
  n.n1_2 = e2.nextN1;
  n.egt2 = e2.nextEgt;
  n.ff2 = e2.nextFf;
  n.oilPsi2 = e2.nextOilPsi;

  // ATA 79 trainer model: pressure follows engine speed only when useful oil
  // quantity remains. LOW OIL faults suppress pressure; magnetic chip
  // detection is retained as a discrete maintenance indication rather than
  // being incorrectly treated as an immediate engine shutdown.
  if (n.n1_1 > 20) n.oilQty1 = Math.max(0, n.oilQty1 - 0.0015 * n.n1_1 * dt);
  if (n.n1_2 > 20) n.oilQty2 = Math.max(0, n.oilQty2 - 0.0015 * n.n1_2 * dt);
  if (n.faults.oilLow1 || n.oilQty1 < 8) n.oilPsi1 = Math.min(n.oilPsi1, Math.max(0, n.n1_1 * 0.55));
  if (n.faults.oilLow2 || n.oilQty2 < 8) n.oilPsi2 = Math.min(n.oilPsi2, Math.max(0, n.n1_2 * 0.55));

  // ATA 28 fuel consumption: fuel flow (kg/h) is the engine's actual consumption
  // signal. Tank quantity is shown in percent of a tank; the trainer scale is
  // 100% = ~3,700 kg per tank, so 1% = ~37 kg. Idle (650 kg/h) therefore burns
  // ~0.005 %/s per engine at 1x, and a tank lasts hours rather than minutes.
  const KG_PER_TANK_PERCENT = 37;
  const consume = (ff: number) => (Math.max(0, ff) / 3600 / KG_PER_TANK_PERCENT) * dt;
  const c1 = consume(n.ff1);
  const c2 = consume(n.ff2);
  // Snapshot fuel-source state before consumption. These values must exist before
  // the draw runs; declaring them afterward causes a TDZ ReferenceError exactly
  // when engine fuel flow begins during start.
  const d2 = derive(n);
  const fuelPump1On = d2.acPower && ((n.fuelPump1Fwd && !n.faults.fuelTank1FwdPumpFail) || (n.fuelPump1Aft && !n.faults.fuelTank1AftPumpFail)) && !n.faults.fuelBoostPump1Fail && n.fuelTank1 > 0.5;
  const fuelPump2On = d2.acPower && ((n.fuelPump2Fwd && !n.faults.fuelTank2FwdPumpFail) || (n.fuelPump2Aft && !n.faults.fuelTank2AftPumpFail)) && !n.faults.fuelBoostPump2Fail && n.fuelTank2 > 0.5;
  const fuelCenterPumpOn = d2.acPower && ((n.fuelPumpCenter1 && !n.faults.fuelCenterPump1Fail) || (n.fuelPumpCenter2 && !n.faults.fuelCenterPump2Fail)) && !n.faults.fuelCenterPumpFail && n.fuelTankCenter > 0.5;
  const crossfeedOpen = d2.dcPower && n.fuelCrossfeed && !n.faults.fuelCrossfeedValveFail;
  const fuelShutoff1Open = d.fuelShutoff1Open;
  const fuelShutoff2Open = d.fuelShutoff2Open;
  // Draw order (matches the feed-source labels in derive()):
  //  1. Center tank first, for both engines, while its boost pumps are on.
  //  2. Crossfeed OPEN: both engines share one manifold supplied by the pumped
  //     wing tanks. With both pumps on, the load splits evenly between tanks 1
  //     and 2; with one pump on, that tank supplies both engines.
  //  3. Crossfeed CLOSED (or no wing pump pressure): each engine draws on its own tank.
  const fuelDrawSource = (want1: number, want2: number) => {
    let r1 = want1;
    let r2 = want2;
    if (fuelCenterPumpOn) {
      const t1 = Math.min(n.fuelTankCenter, r1); n.fuelTankCenter -= t1; r1 -= t1;
      const t2 = Math.min(n.fuelTankCenter, r2); n.fuelTankCenter -= t2; r2 -= t2;
    }
    if (crossfeedOpen && (fuelPump1On || fuelPump2On) && r1 + r2 > 0) {
      let shared = r1 + r2;
      r1 = 0; r2 = 0;
      if (fuelPump1On && fuelPump2On) {
        const half = shared / 2;
        const a1 = Math.min(n.fuelTank1, half);
        const a2 = Math.min(n.fuelTank2, half);
        n.fuelTank1 -= a1; n.fuelTank2 -= a2; shared -= a1 + a2;
      }
      // One tank ran dry (or only one pump is on): the pumped tank(s) pick up the rest.
      if (fuelPump1On) { const t = Math.min(n.fuelTank1, shared); n.fuelTank1 -= t; shared -= t; }
      if (fuelPump2On) { const t = Math.min(n.fuelTank2, shared); n.fuelTank2 -= t; shared -= t; }
      // Anything left is drawn by suction from the tanks.
      if (shared > 0) { const t = Math.min(n.fuelTank1, shared); n.fuelTank1 -= t; shared -= t; }
      if (shared > 0) { const t = Math.min(n.fuelTank2, shared); n.fuelTank2 -= t; shared -= t; }
      return;
    }
    n.fuelTank1 = Math.max(0, n.fuelTank1 - r1);
    n.fuelTank2 = Math.max(0, n.fuelTank2 - r2);
  };
  let engine1FuelDemand = 0;
  let engine2FuelDemand = 0;
  if (fuelShutoff1Open && n.ff1 > 0) engine1FuelDemand = c1;
  if (fuelShutoff2Open && n.ff2 > 0) engine2FuelDemand = c2;
  fuelDrawSource(engine1FuelDemand, engine2FuelDemand);
  if (n.faults.fuelTank1Leak) n.fuelTank1 = Math.max(0, n.fuelTank1 - 0.08 * dt);
  if (n.faults.fuelTank2Leak) n.fuelTank2 = Math.max(0, n.fuelTank2 - 0.08 * dt);
  if (n.faults.fuelCenterLeak) n.fuelTankCenter = Math.max(0, n.fuelTankCenter - 0.08 * dt);

  // Reservoir quantity (percent). Ground servicing (hand pump -> shared fill
  // manifold -> A/B/STBY reservoirs) only adds fluid while on the ground and
  // never creates hydraulic pressure by itself. A System A / B leak drains its
  // own reservoir; an empty reservoir removes that system's pump pressure
  // (the pump logic in derive() already requires quantity > 0).
  const servicingRate = 2.5; // % per second
  const leakRate = 2; // % per second
  if (n.hydServicingConnected && n.wow) {
    n.hydAQty = Math.min(100, n.hydAQty + servicingRate * dt);
    n.hydBQty = Math.min(100, n.hydBQty + servicingRate * dt);
    n.hydSQty = Math.min(100, n.hydSQty + servicingRate * dt);
  }
  if (n.faults.hydALeak) n.hydAQty = Math.max(0, n.hydAQty - leakRate * dt);
  if (n.faults.hydBLeak) n.hydBQty = Math.max(0, n.hydBQty - leakRate * dt);

  n.hydAPress = approach(n.hydAPress, d2.hydA, 2400, dt);
  n.hydBPress = approach(n.hydBPress, d2.hydB, 2400, dt);
  n.hydSPress = approach(n.hydSPress, d2.hydS, 2400, dt);

  // Automatic-braking turn-on self-check. The real system holds the selector
  // in a waiting state after its approximately 2.5-second self-check.
  const abPrereq = n.autobrake > 0 && n.circuitBreakers.autobrake &&
    n.antiskidInbd && n.antiskidOutbd && n.circuitBreakers["antiskid-inbd"] && n.circuitBreakers["antiskid-outbd"] &&
    !n.faults.antiskidInop && !n.faults.antiskidInbdInop && !n.faults.antiskidOutbdInop && d2.dcPower && n.hydAPress > 1500 && n.hydBPress > 1500;
  n.autobrakeTestTimer = abPrereq ? Math.min(3, n.autobrakeTestTimer + dt) : 0;
  if (!abPrereq || n.autobrake === 0) n.autobrakeRtoArmed = false;
  if (n.autobrake === 4 && n.autobrakeTestTimer >= 2.5 && n.wow && n.throttle1 > 0.75 && n.throttle2 > 0.75 && n.groundSpeedKt > 90) {
    n.autobrakeRtoArmed = true;
  }
  if (n.autobrake !== 4) n.autobrakeRtoArmed = false;

  // ATA 32-42-0 / 32-43-0: landing autobrake has a wheel-spin-up on-ramp at
  // about 60-65 kt. After it activates, it remains active below that speed until
  // a dropout condition occurs. Thrust-lever advancement, pedal override, speed
  // brake disarm, hydraulic/electrical loss, antiskid loss, or leaving ground
  // mode latches a disarm until the selector is cycled OFF.
  const landingAutobrakeSelectedNow = n.autobrake >= 1 && n.autobrake <= 3;
  const landingAutobrakePrereqNow = n.autobrakeTestTimer >= 2.5 && d2.dcPower && n.circuitBreakers.autobrake &&
    n.hydAPress > 1500 && n.hydBPress > 1500 &&
    n.antiskidInbd && n.antiskidOutbd && n.circuitBreakers["antiskid-inbd"] && n.circuitBreakers["antiskid-outbd"] && !n.faults.antiskidInop && !n.faults.antiskidInbdInop && !n.faults.antiskidOutbdInop &&
    n.speedBrake === "ARMED";
  const landingPedalOverride = n.leftBrakePedal > 0.067 || n.rightBrakePedal > 0.067;
  const landingThrottlesIdle = n.throttle1 <= 0.05 && n.throttle2 <= 0.05;
  if (n.autobrake === 0) {
    n.autobrakeLandingActivated = false;
    n.autobrakeLandingDisarmed = false;
  } else if (n.autobrakeLandingActivated &&
    (!landingAutobrakeSelectedNow || !landingAutobrakePrereqNow || !n.wow ||
     !landingThrottlesIdle || landingPedalOverride)) {
    n.autobrakeLandingActivated = false;
    n.autobrakeLandingDisarmed = true;
  }
  if (!n.autobrakeLandingDisarmed && landingAutobrakeSelectedNow && n.wow &&
      n.groundSpeedKt > 60 && landingAutobrakePrereqNow && landingThrottlesIdle &&
      !landingPedalOverride) {
    n.autobrakeLandingActivated = true;
  }

  // Training braking dynamics: automatic and pilot metered pressure compete at
  // the shuttle valves; antiskid then trims individual wheel pressure when slip
  // becomes excessive. This is a training approximation, not a performance model.
  const brakeState = derive(n);
  const autoPressure = brakeState.autobrakeActive ? brakeState.autobrakePressure : 0;
  const manualLeft = n.leftBrakePedal * 3000;
  const manualRight = n.rightBrakePedal * 3000;
  // In this simulator's supplied 737-200 reference model, inboard brakes are
  // supplied by A and outboard brakes by B. Autobrake pressure is routed into
  // the same brake/antiskid path, so a wheel cannot develop pressure when its
  // actual hydraulic source is unavailable.
  const brakeSource = {
    li: n.hydAPress > 1500 ? "A" : "NONE",
    lo: n.hydBPress > 1500 ? "B" : "NONE",
    ri: n.hydAPress > 1500 ? "A" : "NONE",
    ro: n.hydBPress > 1500 ? "B" : "NONE",
  };
  // ATA 32-41-0: the antiskid switches enable skid-control modulation; they
  // do not remove normal hydraulic pedal braking. With antiskid OFF, the pilot
  // controls braking by pedal travel and the antiskid valves must not be modeled
  // as a brake shutoff. Automatic pressure is already zero unless the autobrake
  // controller has passed its antiskid-dependent arming/interlock checks.
  const rawPressures = {
    li: brakeSource.li === "A" ? Math.max(autoPressure, manualLeft) : 0,
    lo: brakeSource.lo === "B" ? Math.max(autoPressure, manualLeft) : 0,
    ri: brakeSource.ri === "A" ? Math.max(autoPressure, manualRight) : 0,
    ro: brakeSource.ro === "B" ? Math.max(autoPressure, manualRight) : 0,
  };
  // ---- Landing / rollout trainer -------------------------------------------
  // Approach -> touchdown -> rollout, including directional (yaw) dynamics.
  // Runs on the sim clock so pause / time scale apply.
  // Improved training model: peak friction µ_peak, optimal slip band, and a
  // simple Pacejka-style fall-off past peak so antiskid has a realistic target.
  // Still intentionally simplified vs a full performance model.
  const RWY_LEN_M = RUNWAY_LENGTH_M;
  const KT_TO_MS = 0.5144;
  // Peak friction coefficients (µ_peak). Wet/icy values chosen so antiskid
  // modulation is clearly visible while still allowing a stop on a short runway.
  const MU_PEAK: Record<string, number> = { DRY: 0.72, WET: 0.42, ICY: 0.18 };
  const G = 28; // kt/s reference decel at µ=1 and full pressure (sim units)
  const keys = ["li", "lo", "ri", "ro"] as const;
  type WK = (typeof keys)[number];
  const WHEEL_R: Record<WK, number> = { lo: -3.0, li: -2.2, ri: 2.2, ro: 3.0 }; // m right of CG
  const rad = Math.PI / 180;
  /** Simple friction vs slip ratio: rises to peak near 12–15 % slip, then falls. */
  const muFromSlip = (muPeak: number, slip: number) => {
    const s = Math.max(0, Math.min(1, slip));
    // Peak around 0.13 slip; linear rise then linear fall to ~0.55·peak at lock.
    if (s <= 0.13) return muPeak * (s / 0.13);
    return muPeak * (0.55 + 0.45 * (1 - (s - 0.13) / 0.87));
  };

  if (n.rwyPhase === "APPROACH") {
    n.rwyPosM += n.groundSpeedKt * KT_TO_MS * dt;
    n.rwyAltFt = Math.max(0, (RUNWAY_AIMPOINT_M - n.rwyPosM) * 0.172);
    n.airborneTest = true;
    n.wow = false;
    if (n.rwyPosM >= RUNWAY_AIMPOINT_M) {
      n.rwyPhase = "ROLLOUT";
      n.airborneTest = false;
      n.wow = true;
      n.rwyAltFt = 0;
      n.wheelSpeeds = { li: 0, lo: 0, ri: 0, ro: 0 }; // wheels spin up on touchdown
      n.rwyNote = "TOUCHDOWN — wheels spinning up";
    }
  } else if (n.rwyPhase === "ROLLOUT" || n.rwyPhase === "OVERRUN") {
    n.rwyPosM += n.groundSpeedKt * KT_TO_MS * Math.cos(n.rwyTrackDeg * rad) * dt;
  }
  const rolling = n.rwyPhase === "ROLLOUT" || n.rwyPhase === "OVERRUN";

  // Per-wheel peak surface friction: base surface, icy half-runway patch, grass off the edge.
  const muPeakOf = (k: WK) => {
    const wLat = n.rwyLatM + WHEEL_R[k] * Math.cos(n.rwyHdgDeg * rad);
    const wPos = n.rwyPosM;
    if (wPos > RWY_LEN_M || Math.abs(wLat) > RUNWAY_HALF_WIDTH_M) return 0.28; // grass / overrun
    let mu = MU_PEAK[n.runway] ?? 0.72;
    const inPatch = wPos >= PATCH_START_M && wPos <= PATCH_END_M &&
      ((n.rwyPatch === "LEFT" && wLat < 0) || (n.rwyPatch === "RIGHT" && wLat > 0));
    if (inPatch) mu = Math.min(mu, 0.12);
    return mu;
  };
  const muPeakW = { li: muPeakOf("li"), lo: muPeakOf("lo"), ri: muPeakOf("ri"), ro: muPeakOf("ro") };
  const offRunway = n.rwyPosM > RWY_LEN_M || Math.abs(n.rwyLatM) > RUNWAY_HALF_WIDTH_M + 2.5;

  // Antiskid control approximation based on AMM 32-42-0:
  // each wheel has its own control channel; locked-wheel protection compares
  // LI/RI and LO/RO pairs.  The controller compares each wheel with a velocity
  // reference and overdrives the valve when a slow wheel falls to ~25 % of the
  // paired wheel. Locked-wheel protection drops out below ~11–25 kt.
  // Modulation targets the rising side of the friction curve (≈10–15 % slip)
  // rather than a fixed binary threshold, giving smoother pressure recovery.
  const nextWheelPressures = { ...rawPressures };
  const pairRef = (a: WK, b: WK) => Math.max(n.wheelSpeeds[a], n.wheelSpeeds[b]);
  const pairLocked = (slow: WK, ref: number) =>
    n.groundSpeedKt > 25 && ref > 11 && n.wheelSpeeds[slow] > 0 && n.wheelSpeeds[slow] <= ref * 0.25;
  const pairProtection = (a: WK, b: WK) => {
    const ref = pairRef(a, b);
    const aLocked = pairLocked(a, ref);
    const bLocked = pairLocked(b, ref);
    if (aLocked && n.wheelSpeeds[a] < n.wheelSpeeds[b]) nextWheelPressures[a] = 0;
    if (bLocked && n.wheelSpeeds[b] < n.wheelSpeeds[a]) nextWheelPressures[b] = 0;
  };

  if (n.wow && n.groundSpeedKt > 11) {
    // Inboard and outboard antiskid switches control their own wheel pairs.
    // One channel being OFF/inoperative must not disable the healthy channel.
    if (brakeState.antiskidInbdOperational) pairProtection("li", "ri");
    if (brakeState.antiskidOutbdOperational) pairProtection("lo", "ro");
    keys.forEach((key) => {
      const channelOperational = key === "li" || key === "ri"
        ? brakeState.antiskidInbdOperational
        : brakeState.antiskidOutbdOperational;
      if (!channelOperational) return;
      const wheel = n.wheelSpeeds[key];
      const ref = Math.max(n.groundSpeedKt, wheel);
      const slip = ref > 8 ? Math.max(0, 1 - wheel / ref) : 0;
      // Target the rising side of the µ-slip curve. Begin relief near 10 % slip,
      // reach strong relief by ~28 % so the wheel stays near peak friction.
      const modulation = Math.max(0, Math.min(1, (slip - 0.10) / 0.18));
      nextWheelPressures[key] *= 1 - modulation * 0.88;
    });
  }
  if (!n.wow) keys.forEach((key) => { nextWheelPressures[key] = 0; });
  n.wheelBrakePressures = nextWheelPressures;

  // Wheel slip: demand above what that wheel's surface can give drives it toward lock.
  // Friction is evaluated on the µ-slip curve so peak force occurs near 12–15 % slip.
  const nextWheelSpeeds = { ...n.wheelSpeeds };
  const wheelForce = { li: 0, lo: 0, ri: 0, ro: 0 };
  let lockedCount = 0;
  keys.forEach((key) => {
    const frac = nextWheelPressures[key] / 3000;
    const demand = frac * G;
    // Estimate current slip from previous wheel speed, then evaluate available µ.
    const prevSlip = n.groundSpeedKt > 8 ? Math.max(0, 1 - n.wheelSpeeds[key] / n.groundSpeedKt) : 0;
    const avail = muFromSlip(muPeakW[key], prevSlip) * G;
    const excess = Math.max(0, demand - avail * 0.95) / Math.max(avail, 0.4);
    const slipTarget = Math.min(1, frac * 0.06 + excess * 1.4);
    const targetWheelSpeed = n.wow ? Math.max(0, n.groundSpeedKt * (1 - slipTarget)) : 0;
    const rate = targetWheelSpeed < nextWheelSpeeds[key] ? 160 : 95;
    nextWheelSpeeds[key] = n.wow ? approach(nextWheelSpeeds[key], targetWheelSpeed, rate, dt) : 0;
    const locked = n.wow && n.groundSpeedKt > 20 && nextWheelSpeeds[key] < n.groundSpeedKt * 0.25 && nextWheelPressures[key] > 200;
    if (locked) {
      lockedCount++;
      n.tireWear = { ...n.tireWear, [key]: Math.min(1, n.tireWear[key] + dt * 0.06) };
    }
    const slipNow = n.groundSpeedKt > 8 ? Math.max(0, 1 - nextWheelSpeeds[key] / n.groundSpeedKt) : 0;
    const muNow = muFromSlip(muPeakW[key], slipNow);
    wheelForce[key] = Math.min(demand, muNow * G * (locked ? 0.55 : 1));
  });
  n.wheelSpeeds = nextWheelSpeeds;

  // Deceleration: brake command, capped by the friction available under each wheel.
  const meanOf = (o: Record<WK, number>) => (o.li + o.lo + o.ri + o.ro) / 4;
  const meanFrac = meanOf(nextWheelPressures) / 3000;
  const hydraulicBrakeAvailable = n.hydAPress > 1500 || n.hydBPress > 1500;
  const preReliefMean = meanOf(rawPressures) / 3000;
  const relief = preReliefMean > 0.01 ? Math.min(1, meanFrac / preReliefMean) : 1;
  const autoDecel = brakeState.autobrakeActive ? brakeState.targetDecel * relief : 0;
  const pedalDecel = meanFrac * G;
  const peakCap = meanOf({
    li: muPeakW.li * G,
    lo: muPeakW.lo * G,
    ri: muPeakW.ri * G,
    ro: muPeakW.ro * G,
  });
  const capMean = meanOf(wheelForce) > 0
    ? Math.max(meanOf(wheelForce) * (lockedCount ? 0.75 * (1 - lockedCount / 8) : 1), 0)
    : peakCap;
  let commandedDecel = hydraulicBrakeAvailable ? Math.max(autoDecel, pedalDecel) : 0;
  commandedDecel = Math.min(commandedDecel, Math.max(capMean, peakCap * 0.3));
  const reverseThrustDecel = (d2.thrustReverser1Active ? 2.5 : 0) + (d2.thrustReverser2Active ? 2.5 : 0); // trainer-normalized, not an AMM performance value
  const drag = rolling && n.wow ? 0.35 + (n.speedBrake === "UP" || n.speedBrake === "ARMED" ? 0.9 : 0) + reverseThrustDecel + (offRunway ? 2.5 : 0) : 0;
  n.actualDecel = approach(n.actualDecel, commandedDecel, 18, dt);
  n.groundSpeedKt = Math.max(0, n.groundSpeedKt - (n.actualDecel + drag) * dt);

  // ---- Directional dynamics (top-down heading / drift) ----------------------
  if (rolling && n.wow) {
    const gs = n.groundSpeedKt;
    const gsMs = gs * KT_TO_MS;
    const spd = Math.min(1, gs / 12);
    // How much each side is actually braking (share of the real deceleration).
    const meanF = Math.max(meanOf(wheelForce), 0.01);
    const scaleF = Math.min(1.6, n.actualDecel / meanF);
    const FL = ((wheelForce.li + wheelForce.lo) / 2) * scaleF;
    const FR = ((wheelForce.ri + wheelForce.ro) / 2) * scaleF;
    // Cornering grip: friction remaining after wheel slip (locked wheels give none).
    let grip = 0;
    keys.forEach((k) => {
      const slip = gs > 8 ? Math.max(0, 1 - n.wheelSpeeds[k] / gs) : 0;
      grip += (muFromSlip(muPeakW[k], slip) * (1 - Math.min(1, slip) * 0.85)) / 4;
    });
    grip = Math.max(0, Math.min(1, grip));
    const rudderAuth = brakeState.controlSurfaces.rudder; // -1..1, hydraulic authority included
    const aero = Math.min(1.5, (gs / 90) * (gs / 90));
    const nws = brakeState.noseWheelSteeringAvailable ? brakeState.noseWheelSteeringAngle : 0;
    const beta = n.rwyHdgDeg - n.rwyTrackDeg; // side-slip
    const yawAcc =
      0.95 * (FR - FL) * spd + // differential braking: more brake on the right yaws right
      7.0 * rudderAuth * aero + // aerodynamic rudder (needs speed)
      0.9 * nws * (0.35 + 0.65 * grip) * Math.min(1, gs / 6) - // nose-wheel steering
      1.1 * beta * (0.15 + grip) * Math.min(1.5, gs / 50) - // main-gear weathercock / cornering restoring moment
      1.6 * n.rwyYawRate;
    n.rwyYawRate += yawAcc * dt;
    n.rwyHdgDeg += n.rwyYawRate * dt;
    // The track follows the heading through tyre side force.
    n.rwyTrackDeg += (beta * 0.9 * grip * Math.min(1, gs / 25) * dt);
    n.rwyLatM += gsMs * Math.sin(n.rwyTrackDeg * rad) * dt;
    if (gs < 1) { n.rwyYawRate *= 0.9; }
  }

  if (rolling) {
    if (n.rwyPhase === "ROLLOUT" && offRunway && n.groundSpeedKt > 1) {
      n.rwyPhase = "OVERRUN";
      n.rwyNote = n.rwyPosM > RWY_LEN_M ? "RUNWAY OVERRUN" : `RUNWAY EXCURSION — ${n.rwyLatM < 0 ? "LEFT" : "RIGHT"}`;
    }
    if (n.groundSpeedKt <= 1) {
      n.groundSpeedKt = 0;
      n.rwyYawRate = 0;
      if (n.rwyPhase === "ROLLOUT") { n.rwyPhase = "STOPPED"; n.rwyNote = `STOPPED — ${Math.max(0, Math.round(RWY_LEN_M - n.rwyPosM))} m of runway remaining · ${Math.abs(n.rwyLatM).toFixed(0)} m ${n.rwyLatM < 0 ? "left" : "right"} of centreline`; }
      else if (n.rwyPhase === "OVERRUN") { n.rwyPhase = "STOPPED"; n.rwyNote = n.rwyPosM > RWY_LEN_M ? `STOPPED ${Math.round(n.rwyPosM - RWY_LEN_M)} m BEYOND RUNWAY END` : `STOPPED OFF THE RUNWAY — ${Math.abs(n.rwyLatM).toFixed(0)} m ${n.rwyLatM < 0 ? "LEFT" : "RIGHT"}`; }
    }
  }

  // UP and DN command all three gears through the hydraulic system A path.
  // OFF removes the command and leaves each gear where it is.
  // The physical selector lock prevents UP on the ground; the manual override
  // trigger can bypass that lock for maintenance/testing or loss of electrical
  // power, as described in ATA 32-22-11.
  const gearCommandUpLocked = n.wow && n.gear === "UP" && !n.gearLeverOverride;
  if (gearCommandUpLocked) n.gear = "OFF";
  if (n.gearLeverOverride && !n.wow) n.gearLeverOverride = false;
  const groundAPressureAvailable = n.groundInterconnect && n.wow && n.hydBPress > 1500;
  const gearHydraulicAvailable = n.hydAPress > 1500 || groundAPressureAvailable;
  const gearTarget = n.gear === "UP" ? 0 : n.gear === "DN" ? 1 : null;
  const gearRate = gearHydraulicAvailable ? 0.45 : 0;

  // Manual extension is an individual, full-travel operation. Pulling one
  // red T-handle releases only that gear's uplock. Its physical position then
  // runs to the full DOWN/LOCKED endpoint even though the handle itself
  // returns to its stowed position. The other two gears remain untouched.
  const manualRate = 4.0;
  const manualNoseReleased = n.manualReleasedNose;
  const manualLeftReleased = n.manualReleasedLeftMain;
  const manualRightReleased = n.manualReleasedRightMain;

  n.noseGearPos = manualNoseReleased
    ? approach(n.noseGearPos, 1, manualRate, dt)
    : n.landingGearFault === "NOSE" ? n.noseGearPos
    : gearTarget === null ? n.noseGearPos : approach(n.noseGearPos, gearTarget, gearRate, dt);

  n.leftMainGearPos = manualLeftReleased
    ? approach(n.leftMainGearPos, 1, manualRate, dt)
    : n.landingGearFault === "LEFT_MAIN" ? n.leftMainGearPos
    : gearTarget === null ? n.leftMainGearPos : approach(n.leftMainGearPos, gearTarget, gearRate, dt);

  n.rightMainGearPos = manualRightReleased
    ? approach(n.rightMainGearPos, 1, manualRate, dt)
    : n.landingGearFault === "RIGHT_MAIN" ? n.rightMainGearPos
    : gearTarget === null ? n.rightMainGearPos : approach(n.rightMainGearPos, gearTarget, gearRate, dt);

  // The T-handle is momentary. The separate manualReleased state keeps the
  // selected uplock released after the handle springs back, so only that
  // gear continues all the way to DOWN/LOCKED.
  if (manualNoseReleased && n.noseGearPos >= 0.999) {
    n.noseGearPos = 1;
    n.manualReleasedNose = false;
    n.manualExtendNose = false;
  }
  if (manualLeftReleased && n.leftMainGearPos >= 0.999) {
    n.leftMainGearPos = 1;
    n.manualReleasedLeftMain = false;
    n.manualExtendLeftMain = false;
  }
  if (manualRightReleased && n.rightMainGearPos >= 0.999) {
    n.rightMainGearPos = 1;
    n.manualReleasedRightMain = false;
    n.manualExtendRightMain = false;
  }

  // A position fault is considered recovered once the affected gear reaches
  // the full DOWN/LOCKED endpoint. This also extinguishes the persistent red
  // fault indication and restores selector/position agreement.
  if (n.landingGearFault === "NOSE" && n.noseGearPos >= 0.999) n.landingGearFault = "NONE";
  else if (n.landingGearFault === "LEFT_MAIN" && n.leftMainGearPos >= 0.999) n.landingGearFault = "NONE";
  else if (n.landingGearFault === "RIGHT_MAIN" && n.rightMainGearPos >= 0.999) n.landingGearFault = "NONE";

  // Keep the legacy aggregate position used by existing trainer widgets as
  // the mean of the three physical gear positions.
  n.gearPos = (n.noseGearPos + n.leftMainGearPos + n.rightMainGearPos) / 3;

  // Training model: weight-on-wheels normally follows the physical
  // landing-gear position (down-and-locked is GND; fully retracted is AIR).
  // That alone is circular on the ground: the gear lever is inhibited from
  // UP while wow is true, and wow only clears once the gear is retracted —
  // so without an independent way to signal "airborne," the gear could
  // never move. The airborne-test override breaks that deadlock by letting
  // the training console assert liftoff directly, the same way the
  // ground-sensing override asserts on-ground; once gearPos actually drops
  // to <=0.02 the position-based logic keeps holding wow false on its own,
  // so the override can be switched back off after retraction.
  if (n.groundSenseTest) n.wow = true;
  else if (n.airborneTest) n.wow = false;
  else if (n.noseGearPos >= 0.98 && n.leftMainGearPos >= 0.98 && n.rightMainGearPos >= 0.98) n.wow = true;
  else if (n.noseGearPos <= 0.02 && n.leftMainGearPos <= 0.02 && n.rightMainGearPos <= 0.02) n.wow = false;

  if (!n.altFlapsArm) n.altFlapsControl = "OFF";

  const alternateFlapsCommanded = d2.alternateFlapTakeover && n.altFlapsControl !== "OFF";
  const flapTarget = alternateFlapsCommanded
    ? (n.altFlapsControl === "DN" ? 40 : 0)
    : n.flaps;
  const normalFlapDriveAvailable = d2.teFlapHydraulicDriveAvailable || (n.hydGroundPowerConnected && n.groundInterconnect && n.wow && n.parkingBrake);
  const alternateFlapDriveAvailable = alternateFlapsCommanded && d2.alternateFlapDrivePowered;
  if (normalFlapDriveAvailable || alternateFlapDriveAvailable) {
    const rate = alternateFlapDriveAvailable && !normalFlapDriveAvailable ? 0.08 : 0.45;
    n.flapPos = approach(n.flapPos, flapTarget, rate, dt);
  }

  n.spoilerPos = approach(
    n.spoilerPos,
    n.speedBrake === "UP" && n.wow ? 1 : n.speedBrake === "FLIGHT" ? 0.45 : 0,
    n.hydAPress > 1200 || n.hydBPress > 1200 ? 1.4 : 0,
    dt,
  );

  // ATA 27 leading-edge devices do not simply jump between fully retracted
  // and fully extended. The supplied 737-200 manual describes an intermediate
  // leading-edge configuration during flap retraction. Use the actual TE flap
  // position to command three LE states: retracted, intermediate, extended.
  // The exact transition schedule is effectivity-dependent in the manual, so
  // the trainer uses the supplied ranges as a normalized 0..1 representation.
  const leDriveAvailable = d2.leDriveAvailable;
  const normalizedFlapTarget = Math.max(0, Math.min(40, flapTarget)) / 40;
  const altFlapsHoldLeadingEdge = d2.alternateFlapTakeover && n.altFlapsControl !== "DN";
  const leTarget = altFlapsHoldLeadingEdge ? n.lePos : normalizedFlapTarget <= 0.02 ? 0 : normalizedFlapTarget < 0.28 ? 0.5 : 1;
  if (leDriveAvailable) {
    n.lePos = approach(n.lePos, leTarget, 0.35, dt);
  }

  if (n.faults.packOverheat || n.tempControlFaultL === "PACK_OVERHEAT") {
    n.packTripL = true;
  }
  if (n.faults.packOverheatR || n.tempControlFaultR === "PACK_OVERHEAT") {
    n.packTripR = true;
  }
  if (n.faults.bleedOverheat1) {
    n.bleedTrip1 = true;
  }
  if (n.faults.bleedOverheat2) {
    n.bleedTrip2 = true;
  }

  // Cabin-temperature dynamics for the automatic temperature-control model.
  // The real system senses the cabin and supply duct continuously; this trainer
  // keeps the same feedback relationship without requiring a separate CFD model.
  const acNow = derive(n);
  const ambientF = Number(n.ambientTempF ?? 75);
  if (acNow.packLPackOverheatRelay || acNow.packLPackTrip250) n.packTripL = true;
  if (acNow.packRPackOverheatRelay || acNow.packRPackTrip250) n.packTripR = true;

  const leftSupply = Number(acNow.controlCabinSupplyTempF ?? 0);
  const rightSupply = Number(acNow.passengerCabinSupplyTempF ?? 0);
  const leftCabinTarget = Number(n.tempSelectL ?? 75);
  const rightCabinTarget = Number(n.tempSelectR ?? 75);
  const leftCabinAir = leftSupply > 0 ? leftSupply : ambientF;
  const rightCabinAir = rightSupply > 0 ? rightSupply : ambientF;
  const recircDamping = acNow.recircAirflow > 0 ? 0.78 : 1;
  n.controlCabinTempF = approach(Number(n.controlCabinTempF ?? ambientF), leftCabinAir, 0.22 * recircDamping, dt);
  n.passengerCabinTempF = approach(Number(n.passengerCabinTempF ?? ambientF), rightCabinAir, 0.18 * recircDamping, dt);
  if (n.tempModeL === "AUTO") n.controlCabinTempF = approach(n.controlCabinTempF, leftCabinTarget, 0.015, dt);
  if (n.tempModeR === "AUTO") n.passengerCabinTempF = approach(n.passengerCabinTempF, rightCabinTarget, 0.012, dt);


  // Live-weather effects: performance penalty and turbulence when in precipitation
  const wxInt = (globalThis as any).__oerstedLiveWxIntensity ?? 0;
  if (wxInt > 0.25) {
    // Slight drag increase (trainer approximation)
    (n as any).__wxDragPenalty = 0.02 + wxInt * 0.06;
    (n as any).__wxTurbulence = wxInt > 0.7 ? 0.85 : wxInt > 0.4 ? 0.55 : 0.25;
  } else {
    (n as any).__wxDragPenalty = 0;
    (n as any).__wxTurbulence = 0;
  }

  // Live-weather icing: at altitude in precipitation the aircraft can accumulate ice.
  // Ice & rain protection (wing anti-ice, probe heat, window heat) counters it.
  const liveWx = (globalThis as any).__oerstedLiveWxIntensity ?? 0;
  const altFt = Number(n.psFlightAltFt ?? 0);
  const inIcingBand = altFt > 4000 && altFt < 28000;
  const highSpeed = Number(n.psFlightCasKt ?? 0) > 250;
  if (liveWx > 0.2 && inIcingBand) {
    n.icingConditions = true;
    // Higher accretion when fast and in heavier precip
    const rateBoost = highSpeed ? 1.6 : 1.0;
    (n as any).__iceRate = 0.012 * rateBoost * Math.min(1, liveWx * 2);
  } else if (liveWx < 0.08) {
    n.icingConditions = false;
    (n as any).__iceRate = 0;
  }

  // ATA 30-31 alpha-vane icing trainer model. These rates are qualitative
  // simulator effects, not AMM-published accretion/cutoff thresholds.
  for (const side of ["L", "R"] as const) {
    const heated = side === "L" ? acNow.alphaVaneHeatedL : acNow.alphaVaneHeatedR;
    const key = side === "L" ? "alphaVaneIceL" : "alphaVaneIceR";
    if (n.icingConditions && !heated) n[key] = Math.min(1, n[key] + ((n as any).__iceRate || 0.012) * dt);
    else if (heated) n[key] = Math.max(0, n[key] - 0.08 * dt);
    else n[key] = Math.max(0, n[key] - 0.018 * dt);
  }

  // ATA 38 servicing is ground-only: the potable tank is filled through the
  // external service connection and the waste tank is emptied through the
  // external waste service panel. The trainer exposes these as service-cart
  // controls and never permits servicing while airborne.
  if (n.wow && n.waterServiceConnected) n.potableWater = Math.min(100, n.potableWater + 8 * dt);
  if (n.wow && n.wasteServiceConnected) n.wasteLevel = Math.max(0, n.wasteLevel - 10 * dt);

  // Cabin pressurization: pack output is the inflow side; the outflow valve is
  // the controlled exhaust side. AUTO/STBY closes the valve as cabin pressure
  // is below the scheduled target and opens it as pressure rises above target.
  // MAN AC/DC leaves the valve at the crew-commanded position. The safety
  // relief path prevents the simulated differential from exceeding ~8.3 psi.
  const supply = d2.cabinSupplyFlow;
  const autoPress = n.pressMode === "AUTO" || n.pressMode === "STBY";
  const doorOpen = Object.values(n.doorPositions).some(Boolean);
  const targetDiff = n.wow || supply <= 0.01 || doorOpen ? 0 : 7.4;
  if (autoPress) {
    const pressureError = targetDiff - n.cabinDiff;
    const controlBias = pressureError * 0.06;
    const flowBalanceValve = supply / 1.05;
    n.outflow = approach(n.outflow, doorOpen ? 0.98 : Math.max(0.02, Math.min(0.98, flowBalanceValve - controlBias)), 0.70, dt);
  }
  const exhaustCapacity = Math.max(0, Math.min(1, n.outflow * 1.05));
  const netPressure = supply - exhaustCapacity;
  const targetFromFlow = n.wow || doorOpen ? 0 : Math.max(0, Math.min(8.3, n.cabinDiff + netPressure * 2.8));
  n.cabinDiff = approach(n.cabinDiff, targetFromFlow, doorOpen ? 2.5 : 0.95, dt);
  if (n.cabinDiff > 8.3) {
    n.cabinDiff = approach(n.cabinDiff, 8.3, 2.5, dt);
    n.outflow = Math.max(n.outflow, 0.82);
  }
  if (n.wow && n.cabinDiff > 0.05) n.cabinDiff = approach(n.cabinDiff, 0, 1.5, dt);

  // ---- ATA 34 progressive flight profile (trainer) ---------------------------
  // When the pitot/static trainer is active and progressive mode is enabled,
  // altitude and CAS move smoothly toward their targets instead of jumping.
  // Altitude integrates using the commanded VSI (fpm → ft/s). CAS accelerates
  // at a modest fixed rate so the instruments show a realistic climb profile.
  if ((n.psTrainerEnabled || (!n.wow && n.psFlightCasKt > 0)) && n.psFlightProgressive) {
    const targetAlt = Number.isFinite(n.psFlightTargetAltFt) ? n.psFlightTargetAltFt : n.psFlightAltFt;
    const targetCas = Number.isFinite(n.psFlightTargetCasKt) ? n.psFlightTargetCasKt : n.psFlightCasKt;
    const vsFpm = Number.isFinite(n.psFlightVsFpm) ? n.psFlightVsFpm : 0;

    // Integrate altitude toward the target at the current vertical speed.
    if (Math.abs(targetAlt - n.psFlightAltFt) > 1) {
      const dir = Math.sign(targetAlt - n.psFlightAltFt);
      const rateFps = Math.abs(vsFpm) / 60; // fpm → ft/s
      const stepFt = dir * rateFps * dt;
      const nextAlt = n.psFlightAltFt + stepFt;
      // Do not overshoot the target.
      if ((dir > 0 && nextAlt >= targetAlt) || (dir < 0 && nextAlt <= targetAlt)) {
        n.psFlightAltFt = targetAlt;
        // Level off automatically when the target is reached.
        if (Math.abs(vsFpm) > 0) n.psFlightVsFpm = 0;
      } else {
        n.psFlightAltFt = nextAlt;
      }
    } else {
      n.psFlightAltFt = targetAlt;
      if (Math.abs(vsFpm) > 0 && Math.abs(targetAlt - n.psFlightAltFt) <= 1) {
        n.psFlightVsFpm = 0;
      }
    }

    // Gentle CAS transition (~3 kt/s) toward the target airspeed.
    if (Math.abs(targetCas - n.psFlightCasKt) > 0.5) {
      const casDir = Math.sign(targetCas - n.psFlightCasKt);
      // Airspeed gain follows the real thrust being produced (N1) instead of a fixed 3 kt/s:
      // full takeoff thrust accelerates briskly, a thrust reduction lets the speed bleed off gently.
      const thrustFrac = Math.max(0, Math.min(1, ((n.n1_1 + n.n1_2) / 2 - 32) / 60));
      const casRate = casDir > 0 ? 2.5 + 3.5 * thrustFrac : 2.5;
      const nextCas = n.psFlightCasKt + casDir * casRate * dt;
      if ((casDir > 0 && nextCas >= targetCas) || (casDir < 0 && nextCas <= targetCas)) {
        n.psFlightCasKt = targetCas;
      } else {
        n.psFlightCasKt = nextCas;
      }
    } else {
      n.psFlightCasKt = targetCas;
    }
  }

  return n;
}

export function controlLabel(key: string): string {
  const labels: Record<string, string> = {
    battery: "BATTERY", apuGen: "APU GEN", groundPowerOn: "GRD PWR", gen1: "GEN 1", gen2: "GEN 2", busTie: "BUS TRANSFER",
    fltCtrlA: "FLT CTRL A", fltCtrlB: "FLT CTRL B", spoilerA: "SPOILER A", spoilerB: "SPOILER B", altFlapsArm: "ALT FLAPS ARM", altFlapsControl: "ALT FLAPS",
    engHyd1: "ENG 1 HYD PUMP", engHyd2: "ENG 2 HYD PUMP", elecHyd1: "ELEC 1 HYD PUMP", elecHyd2: "ELEC 2 HYD PUMP", stbyHyd: "STANDBY HYD", groundInterconnect: "GROUND INTERCONNECT",
    apuMaster: "APU MASTER", apuBleed: "APU BLEED", bleed1: "BLEED 1", bleed2: "BLEED 2", isolation: "ISOLATION VALVE", packL: "L PACK", packR: "R PACK", recirc: "RECIRC", fuelHeat: "ENG 1 FUEL HEAT", fuelHeat2: "ENG 2 FUEL HEAT", yawDamper: "YAW DAMPER", gen1Disc: "GEN DRIVE 1 DISCONNECT", gen2Disc: "GEN DRIVE 2 DISCONNECT", equipSupply: "EQUIPMENT COOLING SUPPLY", equipExhaust: "EQUIPMENT COOLING EXHAUST", passOxyMode: "PASSENGER OXYGEN", eltMode: "ELT", irsLMode: "IRS L MODE", irsRMode: "IRS R MODE", serviceInterphoneOn: "SERVICE INTERPHONE", cabinCallActive: "CABIN CALL", groundCrewCallActive: "GROUND CREW CALL", flightRecorderMode: "FLIGHT RECORDER", groundPneumaticConnected: "GROUND AIR",
    waterServiceConnected: "WATER CART", wasteServiceConnected: "WASTE CART", start1: "ENG 1 START", lever1: "ENG 1 IDLE", throttle1: "ENG 1 THRUST", start2: "ENG 2 START", lever2: "ENG 2 IDLE", throttle2: "ENG 2 THRUST", antiIce1: "ANTI-ICE 1", antiIce2: "ANTI-ICE 2",
    antiskidInbd: "INBD ANTISKID", antiskidOutbd: "OUTBD ANTISKID", autobrake: "AUTOBRAKE", gear: "GEAR LEVER", parkingBrake: "PARKING BRAKE", flaps: "FLAP LEVER", speedBrake: "SPEED BRAKE", groundSenseTest: "GROUND SENSE TEST", airborneTest: "AIRBORNE TEST",
    engine1FirePulled: "ENG 1 FIRE", engine2FirePulled: "ENG 2 FIRE", apuFirePulled: "APU FIRE", apuBottleFired: "APU BOTTLE", fireBottleLDischarged: "ENG 1 BOTTLE", fireBottleRDischarged: "ENG 2 BOTTLE",
  };
  return labels[key] ?? key.replace(/([A-Z])/g, " $1").toUpperCase();
}

export function pushLog(s: SimState, text: string, tone: SimState["log"][0]["tone"], meta?: Pick<SimState["log"][0], "control" | "before" | "after">): SimState {
  const last = s.log[0];
  if (last && last.text === text) return s;
  return {
    ...s,
    log: [{ t: Date.now(), text, tone, ...meta }, ...s.log].slice(0, 100),
  };
}
