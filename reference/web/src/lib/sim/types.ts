import type { LightComponent, LightStatus } from "./lights";
export type ApuMaster = "OFF" | "ON" | "START";
export type StartSwitch = "GRD" | "OFF" | "IGN_L" | "IGN_R" | "FLT";
export type Isolation = "OPEN" | "AUTO" | "CLOSE";
export type StbyHyd = "AUTO" | "ON" | "OFF";
export type GearLever = "UP" | "OFF" | "DN";
export type LandingGearFault = "NONE" | "NOSE" | "LEFT_MAIN" | "RIGHT_MAIN";
export type AltFlapSwitch = "UP" | "OFF" | "DN";
export type PressMode = "AUTO" | "STBY" | "MAN_AC" | "MAN_DC";
export type SpeedBrake = "DOWN" | "ARMED" | "FLIGHT" | "UP";
export type TimeScale = 1 | 4 | 10;
export type RunwayCondition = "DRY" | "WET" | "ICY";
export type RunwayPatch = "NONE" | "LEFT" | "RIGHT";
export type RunwayPhase = "IDLE" | "APPROACH" | "ROLLOUT" | "STOPPED" | "OVERRUN";

/** Modeled P6 circuit-breaker channels. This is an interactive trainer subset, not a complete aircraft WDM pinout. */
export type CircuitBreakerId =
  | "eng1-ign-left" | "eng1-ign-right" | "eng2-ign-left" | "eng2-ign-right" | "alpha-vane-left" | "alpha-vane-right"
  | "fuel-heat-1" | "fuel-heat-2" | "fuel-temp-indication" | "ac-28v-main-bus-2" | "recirc-fan" | "mix-valve"
  | "equipment-cooling-supply" | "equipment-cooling-exhaust" | "yaw-damper"
  | "gen-drive-disc-1" | "gen-drive-disc-2" | "gen-drive-indication-1" | "gen-drive-indication-2"
  | "window-heat-left" | "window-heat-right" | "rain-repellent-left" | "rain-repellent-right"
  | "drain-heater" | "drain-mast-air" | "drain-mast-ground" | "crew-oxygen-indication" | "passenger-oxygen-control"
  | "door-warning" | "cvr" | "elt" | "irs-left" | "irs-right" | "service-interphone" | "hf-1" | "hf-2"
  | "antiskid-inbd" | "antiskid-outbd" | "autobrake";
export type CircuitBreakers = Record<CircuitBreakerId, boolean>;

export type SystemId =
  | "apu"
  | "powerplant"
  | "hydraulics"
  | "aircond"
  | "pneumatic"
  | "cabin"
  | "flightcontrols"
  | "landinggear"
  | "antiice"
  | "fuel"
  | "fire"
  | "electrical"
  | "navigation"
  | "lights"
  | "oxygen";

export interface Faults {
  apuDoorJam: boolean;
  hydALeak: boolean;
  packOverheat: boolean;
  packOverheatR: boolean;
  bleedOverheat1: boolean;
  bleedOverheat2: boolean;
  apuFireDetected: boolean;
  engineFire1: boolean;
  engineFire2: boolean;
  hydBLeak: boolean;
  tr1Failure: boolean;
  tr2Failure: boolean;
  generator1Failure: boolean;
  generator2Failure: boolean;
  transferRelay1Failure: boolean;
  transferRelay2Failure: boolean;
  btb1Failure: boolean;
  btb2Failure: boolean;
  apuGeneratorBreakerFailure: boolean;
  apuOverspeed: boolean;
  apuLowOilPressure: boolean;
  apuHighOilTemperature: boolean;
  externalPowerContactorFailure: boolean;
  openPhase1: boolean;
  openPhase2: boolean;
  tr3Failure: boolean;
  batteryFailure: boolean;
  staticInverterFailure: boolean;
  teFlapHydMotorFail: boolean;
  /** Injected trailing-edge flap asymmetry event; inhibits flap-drive motion. */
  flapAsymmetry: boolean;
  antiskidInop: boolean;
  antiskidInbdInop: boolean;
  antiskidOutbdInop: boolean;
  generator1OverFrequency: boolean;
  generator1UnderFrequency: boolean;
  generator1OverVoltage: boolean;
  generator1UnderVoltage: boolean;
  generator1OverCurrent: boolean;
  generator1Differential: boolean;
  generator2OverFrequency: boolean;
  generator2UnderFrequency: boolean;
  generator2OverVoltage: boolean;
  generator2UnderVoltage: boolean;
  generator2OverCurrent: boolean;
  generator2Differential: boolean;
  fuelTank1Leak: boolean;
  fuelTank2Leak: boolean;
  fuelCenterLeak: boolean;
  /** Legacy tank-level pump failure flags: fail both boost pumps in the named tank. */
  fuelBoostPump1Fail: boolean;
  fuelBoostPump2Fail: boolean;
  fuelCenterPumpFail: boolean;
  fuelTank1FwdPumpFail: boolean;
  fuelTank1AftPumpFail: boolean;
  fuelTank2FwdPumpFail: boolean;
  fuelTank2AftPumpFail: boolean;
  fuelCenterPump1Fail: boolean;
  fuelCenterPump2Fail: boolean;
  fuelCrossfeedValveFail: boolean;
  oilChip1: boolean;
  oilChip2: boolean;
  oilLow1: boolean;
  oilLow2: boolean;
  /** ATA 24-11 generator-drive / CSD fault injection, trainer-level. */
  genDriveDisconnectFailure1: boolean;
  genDriveDisconnectFailure2: boolean;
  genDriveOilPressureLow1: boolean;
  genDriveOilPressureLow2: boolean;
  genDriveOilOverheat1: boolean;
  genDriveOilOverheat2: boolean;
  /** Added faults for newly modeled AMM/WDM systems. */
  yawDamperFailure: boolean;
  equipmentCoolingFailure: boolean;
  oxygenSystemFailure: boolean;
  doorWarningFailure: boolean;
  recircFanFailure: boolean;
  mixValveJamL: boolean;
  mixValveJamR: boolean;
  cvrFailure: boolean;
  rainRepellentFailure: boolean;
  /** Engine fuel-heater failures are modeled per engine (ATA 73-14-0). */
  fuelHeatFailure: boolean;
  fuelHeatFailure2: boolean;
  /** Injected engine fuel-filter icing event; cleared by heater action or fault reset. */
  fuelFilterIcingFault1: boolean;
  fuelFilterIcingFault2: boolean;
  windowHeatFailureL: boolean;
  windowHeatFailureR: boolean;
  /** Igniter/exciter channel failures are independent trainer fault-injection paths. */
  igniter1LeftFailure: boolean;
  igniter1RightFailure: boolean;
  igniter2LeftFailure: boolean;
  igniter2RightFailure: boolean;
  /** ATA 30-71 faults: forward/aft toilet drain heaters on common CB, plus drain-mast mode circuits. */
  drainHeaterFailure1: boolean;
  drainHeaterFailure2: boolean;
  drainMastAirFailure: boolean;
  drainMastGroundFailure: boolean;
  alphaVaneHeatFailureL: boolean;
  alphaVaneHeatFailureR: boolean;
}

export interface SimState {
  battery: boolean;
  timeScale: TimeScale;

  apuMaster: ApuMaster;
  apuBleed: boolean;
  apuGen: boolean;
  apuLeftControl: boolean;
  apuRightControl: boolean;
  apuFirePulled: boolean;
  apuBottleFired: boolean;
  // Wheel well and cargo compartment fire training state
  wheelWellFire: boolean; // fire source active (overheat loop tripped)
  wheelWellLevel: number; // 0..1 fire intensity
  cargoFwdFire: boolean;
  cargoAftFire: boolean;
  cargoFwdLevel: number;
  cargoAftLevel: number;
  cargoArmed: "NONE" | "FWD" | "AFT"; // CARGO FIRE ARM selector
  cargoBottleDischarged: boolean;
  cargoAgentTimer: number; // s since discharge into the armed compartment
  /** Effectivity: cargo smoke detection + extinguishing per SB 26A1081. When false the cargo fire system is not installed. */
  cargoFireInstalled: boolean;
  /** Dual-loop cargo detector health (A/B). Only meaningful when cargoFireInstalled. */
  cargoLoopA: boolean;
  cargoLoopB: boolean;
  engine1FirePulled: boolean;
  engine2FirePulled: boolean;
  fireBottleLDischarged: boolean;
  fireBottleRDischarged: boolean;
  apuFuelValve: number;
  apuDoor: number;
  apuRpm: number;
  apuEgt: number;
  apuStarter: boolean;
  apuBleedValve: number;
  apuOilPsi: number;
  apuStartTimer: number;
  /** ATA 49 effectivity: modified 50% starter cutout / 90-second timer. */
  apuStart50PercentEffectivityInstalled: boolean;
  apuLowOilShutdownTimer: number;
  /** ATA 49 pressure-switch hysteresis: light extinguishes at 55 psi, relights at 45 psi. */
  apuLowOilLightOn: boolean;
  fuelTank1: number;
  fuelTankCenter: number;
  fuelTank2: number;
  fuelPump1Fwd: boolean;
  fuelPump1Aft: boolean;
  fuelPump2Fwd: boolean;
  fuelPump2Aft: boolean;
  fuelPumpCenter1: boolean;
  fuelPumpCenter2: boolean;
  /** ATA 28 effectivity: post-SB 28A1228 center-pump low-pressure auto-shutoff. */
  fuelCenterPumpAutoShutoffInstalled: boolean;
  fuelCenterPump1RelayTripped: boolean;
  fuelCenterPump2RelayTripped: boolean;
  fuelCenterPump1LowPressureTimer: number;
  fuelCenterPump2LowPressureTimer: number;
  fuelCrossfeed: boolean;
  fuelScavengeTimer: number;

  externalPowerConnected: boolean;
  groundPowerOn: boolean;
  groundServiceOn: boolean;
  groundPneumaticConnected: boolean;
  groundPneumaticPsi: number;
  /** ATA 29 dedicated external air connection to hydraulic reservoir pressurization test valve. */
  hydReservoirAirConnected: boolean;
  hydReservoirAirPsi: number;
  /** ATA 21 ground service conditioned-air cart connection; separate from ATA 36 pneumatic service. */
  groundConditionedAirConnected: boolean;
  groundConditionedAirPsi: number;
  hydServicingConnected: boolean;
  hydGroundPowerConnected: boolean;
  waterServiceConnected: boolean;
  wasteServiceConnected: boolean;
  potableWater: number;
  wasteLevel: number;

  start1: StartSwitch;
  start2: StartSwitch;
  // Engine start/fuel levers (IDLE/CUTOFF). These are NOT thrust levers.
  lever1: boolean;
  lever2: boolean;
  // Forward thrust lever position, 0 = idle and 1 = takeoff/max forward thrust.
  throttle1: number;
  throttle2: number;
  n2_1: number;
  n2_2: number;
  n1_1: number;
  n1_2: number;
  egt1: number;
  egt2: number;
  ff1: number;
  ff2: number;
  oilPsi1: number;
  oilPsi2: number;
  oilQty1: number;
  oilQty2: number;
  startValve1: boolean;
  startValve2: boolean;
  starterOnTime1: number;
  starterOnTime2: number;
  starterCooldown1: number;
  starterCooldown2: number;
  starterExtendedUsed1: boolean;
  starterExtendedUsed2: boolean;
  startLightTimer1: number;
  startLightTimer2: number;
  startAbortTimer1: number;
  startAbortTimer2: number;
  startHungTimer1: number;
  startHungTimer2: number;
  /** Trainer one-touch engine start: GRD selected, IDLE introduced automatically at ~20% N2. */
  autoStart1: boolean;
  autoStart2: boolean;
  gen1: boolean;
  gen2: boolean;
  bleed1: boolean;
  bleed2: boolean;
  antiIce1: boolean;
  antiIce2: boolean;
  wingAntiIceL: boolean;
  wingAntiIceR: boolean;
  /** Engine No.1 fuel-heater switch (existing key retained for compatibility). */
  fuelHeat: boolean;
  /** Engine No.2 fuel-heater switch promoted from overhead-local state. */
  fuelHeat2: boolean;
  /** Interactive circuit-breaker state: true = closed/in, false = open/pulled. */
  circuitBreakers: CircuitBreakers;
  /** ATA 73-14-0 engine No.1 fuel-heat command timer; AMM cutoff is 60 seconds. */
  fuelHeatElapsedSec: number;
  /** ATA 73-14-0 engine No.2 fuel-heat command timer; AMM cutoff is 60 seconds. */
  fuelHeat2ElapsedSec: number;
  /** Local engine fuel-heater outlet temperatures (trainer-only qualitative values); not the tank No.1 fuel-temperature gauge. */
  fuelHeater1OutletTempC: number;
  fuelHeater2OutletTempC: number;
  /** Fraction of simulated ice blockage in each engine fuel filter (0..1). */
  fuelFilterIceFraction1: number;
  fuelFilterIceFraction2: number;
  /** Prevents an active fault-injection toggle from reseeding ice after heater melt. */
  fuelFilterIceInjected1: boolean;
  fuelFilterIceInjected2: boolean;
  /** ATA 30-71 effectivity-359 drain elements; temperatures are qualitative trainer values. */
  drainHeater1TempC: number; // forward toilet drain heater
  drainHeater2TempC: number; // aft toilet drain heater
  drainMastForwardTempC: number;
  drainMastForwardLineTempC: number;
  drainMastAftTempC: number;
  /** ATA 28 fuel-temperature indication in °C (AMM D6-12005 §28-43-0; supplied WDM §28-42-01). */
  fuelTempC: number;
  /** ATA 22-15 yaw damper command; effective only with DC and hydraulic B pressure. */
  yawDamper: boolean;
  /** ATA 24-11 generator-drive disconnect switches and trainer indication values. */
  gen1Disc: boolean;
  gen2Disc: boolean;
  genDriveOilTemp1C: number;
  genDriveOilTemp2C: number;
  genDriveOilPressure1Psi: number;
  genDriveOilPressure2Psi: number;
  /** ATA 21 equipment cooling selector positions (P5). */
  equipSupply: "NORMAL" | "ALTERNATE";
  equipExhaust: "NORMAL" | "ALTERNATE";
  /** Qualitative E/E bay temperature used for equipment-cooling training; °C. */
  equipmentBayTempC: number;
  /** ATA 35 shared oxygen-system state, replacing P5-only local state. */
  crewOxyPsi: number;
  crewOxyMode: "NORMAL" | "ON";
  crewMaskMic: boolean;
  passOxyMode: "NORMAL" | "ON";
  passOxyAutoDeploy: boolean;
  /** ATA 26/52/23/30/22 systems previously trapped in local panel state. */
  eltMode: "OFF" | "ARM" | "ON";
  irsLMode: "OFF" | "ALIGN" | "NAV" | "ATT";
  irsRMode: "OFF" | "ALIGN" | "NAV" | "ATT";
  irsAlignL: number;
  irsAlignR: number;
  irsHeadingL: number;
  irsHeadingR: number;
  navXfr: "BOTH ON 1" | "NORMAL" | "BOTH ON 2";
  irsXfr: "BOTH ON L" | "NORMAL" | "BOTH ON R";
  efiXfr: "BOTH ON L" | "NORMAL" | "BOTH ON R";
  serviceInterphoneOn: boolean;
  cabinCallActive: boolean;
  groundCrewCallActive: boolean;
  rainRepelTimerL: number;
  rainRepelTimerR: number;
  rainRepelPulseL: number;
  rainRepelPulseR: number;
  flightRecorderMode: "TEST" | "NORMAL";
  cvrTest: boolean;
  cvrErase: boolean;
  cvrMemoryErased: boolean;
  cvrElapsedSec: number;
  doorPositions: { fwdEntry: boolean; cargo: boolean; fwdCargo: boolean; fwdService: boolean; aftEntry: boolean; equip: boolean; aftCargo: boolean; aftService: boolean };
  /** P5-9 window heat (ATA 30-41). FWD = No.1 windshield; SIDE = No.2/4/5 side windows. */
  windowHeatLFwd: boolean;
  windowHeatLSide: boolean;
  windowHeatRFwd: boolean;
  windowHeatRSide: boolean;
  /** Momentary test switch: OFF | PWR | OVHT (spring-centered on the real panel). */
  windowHeatTest: "OFF" | "PWR" | "OVHT";
  /** Latched overheat per window group (cleared when that switch is cycled OFF). */
  windowHeatOvhtLFwd: boolean;
  windowHeatOvhtLSide: boolean;
  windowHeatOvhtRFwd: boolean;
  windowHeatOvhtRSide: boolean;
  /** P5-9 pitot / probe heat (ATA 30-31). Combined with window heat on the real module. */
  probeHeatCaptPitot: boolean;
  probeHeatFoPitot: boolean;
  probeHeatElevL: boolean;
  probeHeatElevR: boolean;
  probeHeatTemp: boolean;
  probeHeatAlphaL: boolean;
  probeHeatAlphaR: boolean;
  /** Shared icing toggle and qualitative alpha-vane ice accretion, 0..1. */
  icingConditions: boolean;
  alphaVaneIceL: number;
  alphaVaneIceR: number;
  /** ATA 30 P5-9 group switches and individual P18 pitot-static heater CBs. */
  psPitotStaticA: boolean;
  psPitotStaticB: boolean;
  psCbCaptUpperL: boolean;
  psCbCaptLowerL: boolean;
  psCbFoUpperR: boolean;
  psCbFoLowerR: boolean;
  psCbElevL: boolean;
  psCbElevR: boolean;
  psCbTempL: boolean;
  psCbTempR: boolean;
  /** Legacy combined temperature-probe CB retained for saved-state compatibility. */
  psCbTemp: boolean;
  // Pitot-static trainer (ATA 34). Disabled means use the live flight model.
  psTrainerEnabled: boolean;
  /** Current (integrated) altitude used by the air-data model. */
  psFlightAltFt: number;
  /** Target altitude the progressive climb/descent profile is flying toward. */
  psFlightTargetAltFt: number;
  /** Current calibrated airspeed. */
  psFlightCasKt: number;
  /** Target CAS the progressive profile is accelerating/decelerating toward. */
  psFlightTargetCasKt: number;
  /** Vertical speed used for progressive altitude change (fpm). */
  psFlightVsFpm: number;
  /** When true, altitude and CAS move progressively toward their targets. */
  psFlightProgressive: boolean;
  /** True during the scripted takeoff / landing ground roll: air data (IAS) follows ground speed while the wheels are on the runway. */
  psGroundRoll: boolean;
  psIcing: boolean;
  /** Combined probe positions: upper-left CAPT, upper-right F/O, lower-right AUX 1, lower-left AUX 2. */
  psPitotCaptCover: boolean;
  psPitotFoCover: boolean;
  psPitotAux1Cover: boolean;
  psPitotAux2Cover: boolean;
  psPitotCaptBlocked: boolean;
  psPitotFoBlocked: boolean;
  psPitotAux1Blocked: boolean;
  psPitotAux2Blocked: boolean;
  psStaticCaptL: boolean;
  psStaticCaptR: boolean;
  psStaticFoL: boolean;
  psStaticFoR: boolean;
  /** Altitude the static line was holding when its ports were blocked. */
  psStaticCaptFrozenAltFt: number;
  psStaticFoFrozenAltFt: number;
  psAltStaticCapt: boolean;
  psAltStaticFo: boolean;
  psBaroCaptHpa: number;
  psBaroFoHpa: number;
  /** standby altimeter baro setting (hPa): independent of the CADC channels */
  psBaroStbyHpa: number;
  psElevPitotLBlocked: boolean;
  psElevPitotRBlocked: boolean;
  /** ATA 34 trainer maintenance/test network. */
  psStaticCaptLeak: boolean;
  psStaticFoLeak: boolean;
  psAux1StaticLeak: boolean;
  psAux2StaticLeak: boolean;
  psAltStaticCaptLeak: boolean;
  psAltStaticFoLeak: boolean;
  /** Leakage through the captain/first-officer static source selector valves. */
  psStaticSelectorCaptLeak: boolean;
  psStaticSelectorFoLeak: boolean;
  psPitotCaptLeak: boolean;
  psPitotFoLeak: boolean;
  psAux1PitotLeak: boolean;
  psAux2PitotLeak: boolean;
  psStandbyPitotLeak: boolean;
  psStandbyStaticLeak: boolean;
  psStandbyStaticFrozenAltFt: number;
  psCadc1Cb: boolean;
  psCadc2Cb: boolean;
  /** CADC electrical/test inputs from ATA 34 DADC architecture. */
  psCadc1Ac115: boolean;
  psCadc1Ac26: boolean;
  psCadc2Ac115: boolean;
  psCadc2Ac26: boolean;
  psCadc1Test: "OFF" | "FUNCTION" | "SLEW" | "FAIL";
  psCadc2Test: "OFF" | "FUNCTION" | "SLEW" | "FAIL";
  psCadc1TestValid: boolean;
  psCadc2TestValid: boolean;
  psStaticLeakRatePctPerSec: number;
  psPitotLeakRatePctPerSec: number;
  psTestClockSec: number;
  psTestPressureSource: boolean;
  psTestVacuumSource: boolean;
  psTestTarget: "ALL" | "CAPT" | "FO" | "AUX1" | "AUX2" | "ALTERNATE";
  psMachWarningTest: boolean;
  /** Trainer warning-computer test state shared across overhead variants. */
  psStallWarningTest: boolean;
  psAirspeedWarningInhibit: boolean;
  /** Windshield wipers (ATA 30-42). */
  wiperL: "PARK" | "INT" | "LOW" | "HIGH";
  wiperR: "PARK" | "INT" | "LOW" | "HIGH";
  rev1: boolean;
  rev2: boolean;

  isolation: Isolation;
  packL: boolean;
  packR: boolean;
  recirc: boolean;
  packTripL: boolean;
  packTripR: boolean;
  bleedTrip1: boolean;
  bleedTrip2: boolean;
  mixCabin: number;
  mixPass: number;
  /** Temperature-control selector mode per ATA 21 / P5-17: AUTO / MANUAL COOL / MANUAL WARM / OFF. */
  tempModeL?: "AUTO" | "MANUAL_COOL" | "MANUAL_WARM" | "OFF" | "MANUAL";
  tempModeR?: "AUTO" | "MANUAL_COOL" | "MANUAL_WARM" | "OFF" | "MANUAL";
  /** Selected cabin temperature, matching the documented 65–85°F AUTO range. */
  tempSelectL?: number;
  tempSelectR?: number;
  /** Simulated cabin temperatures used by the closed-loop AUTO temperature model. */
  controlCabinTempF?: number;
  passengerCabinTempF?: number;
  ambientTempF?: number;
  /** Trainer-only temperature-control fault injection. */
  tempControlFaultL?: "NONE" | "STUCK_COLD" | "STUCK_HOT" | "SENSOR_FAIL" | "REGULATOR_FAIL" | "DUCT_OVERHEAT" | "DUCT_OVERHEAT_250" | "COMPRESSOR_OVERHEAT" | "TURBINE_OVERHEAT" | "PACK_OVERHEAT" | "F35_SENSOR_FAIL" | "F35_VALVE_FAIL";
  tempControlFaultR?: "NONE" | "STUCK_COLD" | "STUCK_HOT" | "SENSOR_FAIL" | "REGULATOR_FAIL" | "DUCT_OVERHEAT" | "DUCT_OVERHEAT_250" | "COMPRESSOR_OVERHEAT" | "TURBINE_OVERHEAT" | "PACK_OVERHEAT" | "F35_SENSOR_FAIL" | "F35_VALVE_FAIL";

  engHyd1: boolean;
  engHyd2: boolean;
  elecHyd1: boolean;
  elecHyd2: boolean;
  stbyHyd: StbyHyd;
  groundInterconnect: boolean;
  fltCtrlA: boolean;
  fltCtrlB: boolean;
  spoilerA: boolean;
  spoilerB: boolean;
  hydAPress: number;
  hydBPress: number;
  hydSPress: number;
  hydAQty: number;
  hydBQty: number;
  hydSQty: number;

  wow: boolean;
  groundSenseTest: boolean;
  airborneTest: boolean;
  parkingBrake: boolean;
  gear: GearLever;
  gearLeverOverride: boolean;
  gearPos: number;
  // Individual physical landing-gear positions. 0 = up/locked, 1 = down/locked.
  noseGearPos: number;
  leftMainGearPos: number;
  rightMainGearPos: number;
  // Manual-extension controls located in the cabin floor access panel.
  manualExtendNose: boolean;
  manualExtendLeftMain: boolean;
  manualExtendRightMain: boolean;
  // Persistent manual-extension release state. The T-handle itself is
  // momentary; once pulled, the respective uplock remains released until
  // that gear reaches down-and-locked.
  manualReleasedNose: boolean;
  manualReleasedLeftMain: boolean;
  manualReleasedRightMain: boolean;
  antiskidInbd: boolean;
  antiskidOutbd: boolean;
  autobrake: 0 | 1 | 2 | 3 | 4;
  groundSpeedKt: number;
  autobrakeTestTimer: number;
  autobrakeRtoArmed: boolean;
  /** ATA 32-42: landing autobrake on-ramp has passed wheel spin-up threshold. */
  autobrakeLandingActivated: boolean;
  /** Landing-autobrake dropout latch; reset by selecting AUTOBRAKE OFF. */
  autobrakeLandingDisarmed: boolean;
  speedBrake: SpeedBrake;
  flaps: number;
  flapPos: number;
  lePos: number;
  altFlapsArm: boolean;
  altFlapsControl: AltFlapSwitch;
  spoilerPos: number;
  yokePitch: number;
  yokeRoll: number;
  /** the P5 panel model (MainInstrumentPanel) is mounted and owns attitude, autopilot and navigation telemetry; the systems-model fallback then stays idle */
  afPanelOwned: boolean;
  attitudeRollDeg: number;
  attitudePitchDeg: number;
  attitudeHeadingDeg: number;
  attitudeYawRate: number;
  rudderPedal: number;
  stabTrimCutoutA: boolean;
  stabTrimCutoutB: boolean;
  stabTrimUnits: number;
  stabTrimOverride: boolean;
  adverseYawScenario: boolean;
  tiller: number;
  leftBrakePedal: number;
  rightBrakePedal: number;
  wheelSpeeds: { li: number; lo: number; ri: number; ro: number };
  wheelBrakePressures: { li: number; lo: number; ri: number; ro: number };
  actualDecel: number;
  // Landing / rollout trainer (Brakes tab)
  runway: RunwayCondition;
  rwyPhase: RunwayPhase;
  rwyPosM: number; // metres from threshold along the runway (negative = short of it)
  rwyAltFt: number; // height above runway on approach
  tireWear: { li: number; lo: number; ri: number; ro: number }; // 0..1 flat-spot damage
  rwyNote: string;
  rwyLatM: number; // lateral offset from centreline (m, + = right)
  rwyHdgDeg: number; // aircraft heading relative to runway (deg, + = nose right)
  rwyTrackDeg: number; // direction of travel relative to runway (deg)
  rwyYawRate: number; // deg/s
  rwyPatch: RunwayPatch; // icy patch on one half of the runway

  pressMode: PressMode;
  cabinDiff: number;
  outflow: number;

  busTie: boolean;
  transferRelay1Timer: number;
  transferRelay2Timer: number;
  generator1ProtectionTimer: number;
  generator2ProtectionTimer: number;
  generator1ProtectionLatched: boolean;
  generator2ProtectionLatched: boolean;
  standbyPower: "OFF" | "AUTO" | "BAT";
  // ATA 33 lighting (see lights.ts)
  ltRetL: "RETRACT" | "EXT" | "ON";
  ltRetR: "RETRACT" | "EXT" | "ON";
  ltFixedL: boolean;
  ltFixedR: boolean;
  ltTurnoffL: boolean;
  ltTurnoffR: boolean;
  ltTaxi: boolean;
  ltWing: boolean;
  ltLogo: boolean;
  ltWheelWell: boolean;
  ltPosition: "OFF" | "STEADY" | "STROBE_STEADY";
  ltAntiCol: boolean;
  ltDome: "OFF" | "DIM" | "BRT";
  ltPanelOvhd: number;
  ltPanelCapt: number;
  ltPanelFo: number;
  ltPanelPed: number;
  ltMapCapt: boolean;
  ltMapFo: boolean;
  ltStorm: boolean;
  ltCompass: boolean;
  ltObserver: boolean;
  ltShieldEmer: boolean;
  ltMasterDim: "BRT" | "DIM";
  ltTest: boolean;
  ltCabin: "OFF" | "DIM" | "BRT";
  ltEntry: boolean;
  ltGalley: boolean;
  ltLav: boolean;
  ltReading: boolean;
  ltSidewall: boolean;
  ltWindow: boolean;
  ltAttWork: boolean;
  ltCall: boolean;
  ltLavMirror: boolean;
  ltThreshold: boolean;
  ltCloset: boolean;
  ltCargo: boolean;
  ltEquip: boolean;
  ltAftAccessory: boolean;
  ltApuComp: boolean;
  ltTailCone: boolean;
  ltNoSmoking: "OFF" | "AUTO" | "ON";
  ltSeatBelt: "OFF" | "AUTO" | "ON";
  ltEmergency: "OFF" | "ARMED" | "ON";
  ltFail: string;
  ltCb: string;
  landingGearFault: LandingGearFault;
  faults: Faults;
  log: LogEntry[];
}

export interface LogEntry {
  t: number;
  text: string;
  tone: "info" | "ok" | "caution" | "warn";
  control?: string;
  before?: string;
  after?: string;
}

export interface ComponentStatus {
  id: string;
  label: string;
  active: boolean;
  cb: string;
  detail?: string;
}

export interface Derived {
  dcPower: boolean;
  acPower: boolean;
  /** Main AC buses are distinct from alternate-fed transfer buses in the WDM. */
  acMainBus1Powered: boolean;
  acMainBus2Powered: boolean;
  /** 28V AC Main Bus No.2 is transformer-fed from 115V AC Main Bus No.2. */
  ac28vMainBus2Powered: boolean;
  recircFanPowered: boolean;
  recircAirflow: number;
  fuelHeaterPowered: boolean;
  fuelHeater2Powered: boolean;
  fuelHeatValveOpen: boolean;
  fuelHeatValve2Open: boolean;
  fuelFilterDeltaP1Psi: number;
  fuelFilterDeltaP2Psi: number;
  fuelFilterIcing1: boolean;
  fuelFilterIcing2: boolean;
  fuelTempLow: boolean;
  fuelTempIndicationPowered: boolean;
  drainHeater1Powered: boolean;
  drainHeater2Powered: boolean;
  drainHeater1Hot: boolean;
  drainHeater2Hot: boolean;
  drainMastAirPowered: boolean;
  drainMastGroundPowered: boolean;
  drainMastForwardPowered: boolean;
  drainMastForwardLinePowered: boolean;
  drainMastAftPowered: boolean;
  alphaVaneHeatedL: boolean;
  alphaVaneHeatedR: boolean;
  doorPressureLeak: boolean;
  equipmentCoolingSupplyPowered: boolean;
  equipmentCoolingExhaustPowered: boolean;
  equipmentCoolingOverheat: boolean;
  equipmentCoolingFlow: number;
  yawDamperEffective: boolean;
  passengerOxygenDeployed: boolean;
  oxygenPressureIndicated: boolean;
  doorWarning: boolean;
  cvrPowered: boolean;
  cvrOff: boolean;
  serviceInterphoneEffective: boolean;
  serviceCallEffective: boolean;
  eltTransmitting: boolean;
  rainRepellentLActive: boolean;
  rainRepellentRActive: boolean;
  generatorDrive1Disconnected: boolean;
  generatorDrive2Disconnected: boolean;
  generatorDrive1LowOilPressure: boolean;
  generatorDrive2LowOilPressure: boolean;
  generatorDrive1HighOilTemp: boolean;
  generatorDrive2HighOilTemp: boolean;
  ignition1LeftOn: boolean;
  ignition1RightOn: boolean;
  ignition2LeftOn: boolean;
  ignition2RightOn: boolean;
  apuAvailable: boolean;
  apuLowOil: boolean;
  groundPowerAvailable: boolean;
  externalPowerContactorClosed: boolean;
  externalPowerNotInUse: boolean;
  apuGenOnBus: boolean;
  eng1Running: boolean;
  eng2Running: boolean;
  /** Effective reverser deployment after ground/engine/idle/fire/System A interlocks. */
  thrustReverser1Active: boolean;
  thrustReverser2Active: boolean;
  ductPsi: number;
  leftDuctPsi: number;
  rightDuctPsi: number;
  leftManifold: boolean;
  rightManifold: boolean;
  isolationOpen: boolean;
  dualBleed: boolean;
  packLFlow: boolean;
  packRFlow: boolean;
  packLFlowRate: number;
  packRFlowRate: number;
  packLInletPsi: number;
  packRInletPsi: number;
  packLColdTempF: number;
  packRColdTempF: number;
  packL35SensorTempF: number;
  packR35SensorTempF: number;
  packLHotBypassRate: number;
  packRHotBypassRate: number;
  packLWarmAirTempF: number;
  packRWarmAirTempF: number;
  packLColdAirFlow: number;
  packRColdAirFlow: number;
  packLWarmAirFlow: number;
  packRWarmAirFlow: number;
  packLMixedAirFlow: number;
  packRMixedAirFlow: number;
  packLAirMixValve: number;
  packRAirMixValve: number;
  packLMixTempF: number;
  packRMixTempF: number;
  packLMixingChamberTempF: number;
  packRMixingChamberTempF: number;
  packLCompressorDischargeTempF: number;
  packRCompressorDischargeTempF: number;
  packLTurbineInletTempF: number;
  packRTurbineInletTempF: number;
  packLCompressorOverheat: boolean;
  packRCompressorOverheat: boolean;
  packLTurbineOverheat: boolean;
  packRTurbineOverheat: boolean;
  packLPackOverheatRelay: boolean;
  packRPackOverheatRelay: boolean;
  packLDuctOverheat: boolean;
  packRDuctOverheat: boolean;
  packLDuctLimitDemand: boolean;
  packRDuctLimitDemand: boolean;
  packLMixValveHotLimit: boolean;
  packRMixValveHotLimit: boolean;
  packLMixValveColdLimit: boolean;
  packRMixValveColdLimit: boolean;
  packLHotBypassFlow: number;
  packRHotBypassFlow: number;
  packLCoolingPathFlow: number;
  packRCoolingPathFlow: number;
  packLF35BypassFlow: number;
  packRF35BypassFlow: number;
  packLAcColdFlow: number;
  packRAcmColdFlow: number;
  packLSeparatorFlow: number;
  packRSeparatorFlow: number;
  packLTripActive: boolean;
  packRTripActive: boolean;
  packLTurbineDischargeTempF: number;
  packRTurbineDischargeTempF: number;
  packLF35SensorFailure: boolean;
  packRF35SensorFailure: boolean;
  packLF35ValveFailure: boolean;
  packRF35ValveFailure: boolean;
  packLPackTrip250: boolean;
  packRPackTrip250: boolean;
  /** Turbofan valve open fraction (0–1). Per ATA 21: modulates open when duct pressure is below ~27–33 psi regulating range / ground, closes with ram air. */
  packLTurbofanValve: number;
  packRTurbofanValve: number;
  /** Ground conditioned-air service check valve is open only when aircraft pack supply is absent. */
  groundConditionedAirActive: boolean;
  controlCabinSupplyTempF: number;
  passengerCabinSupplyTempF: number;
  controlCabinTempF: number;
  passengerCabinTempF: number;
  packLStages: { packValve: boolean; primaryHx: boolean; acmCompressor: boolean; secondaryHx: boolean; turbine: boolean; waterSeparator: boolean; f35Valve: boolean; mixValve: boolean; hotBypass: boolean; coldCheckValve: boolean; hotCheckValve: boolean };
  fuelFeedPressure1: number;
  fuelFeedPressure2: number;
  fuelFeedSource1: string;
  fuelFeedSource2: string;
  /** Tank-level pressure status: true when selected pumps cannot pressurize the tank feed. */
  fuelLowPressure1: boolean;
  fuelLowPressure2: boolean;
  fuelCenterLowPressure: boolean;
  /** Individual pump output pressure / availability. */
  fuelPump1FwdOn: boolean;
  fuelPump1AftOn: boolean;
  fuelPump2FwdOn: boolean;
  fuelPump2AftOn: boolean;
  fuelCenterPump1On: boolean;
  fuelCenterPump2On: boolean;
  fuelPump1FwdLowPressure: boolean;
  fuelPump1AftLowPressure: boolean;
  fuelPump2FwdLowPressure: boolean;
  fuelPump2AftLowPressure: boolean;
  fuelCenterPump1LowPressure: boolean;
  fuelCenterPump2LowPressure: boolean;
  fuelScavengeActive: boolean;
  fuelQuantityIndicationPowered: boolean;
  /** Aggregate pump-group status retained for feed logic and older UI consumers. */
  fuelPump1On: boolean;
  fuelPump2On: boolean;
  fuelCenterPumpOn: boolean;
  fuelShutoff1Open: boolean;
  fuelShutoff2Open: boolean;
  oilPressure1: number;
  oilPressure2: number;
  ignition1On: boolean;
  ignition2On: boolean;
  epr1: number;
  epr2: number;
  oilChipDetected1: boolean;
  oilChipDetected2: boolean;
  packRStages: { packValve: boolean; primaryHx: boolean; acmCompressor: boolean; secondaryHx: boolean; turbine: boolean; waterSeparator: boolean; f35Valve: boolean; mixValve: boolean; hotBypass: boolean; coldCheckValve: boolean; hotCheckValve: boolean };
  cabinSupplyFlow: number;
  cabinExhaustFlow: number;
  acSupplyLeft: boolean;
  acSupplyRight: boolean;
  bleed1Available: boolean;
  bleed2Available: boolean;
  hydA: number;
  hydAPump1On: boolean;
  hydAPump2On: boolean;
  hydBPump1On: boolean;
  hydBPump2On: boolean;
  // Engine bleed air is available to pressurize the hydraulic reservoirs.
  reservoirPressurized: boolean;
  // Reservoirs are being pressurized by the ground air cart (alternate to ground nitrogen).
  reservoirGroundAir: boolean;
  hydB: number;
  hydS: number;
  groundAPress: number;
  hydAQty: number;
  hydBQty: number;
  hydSQty: number;
  hydALow: boolean;
  hydBLow: boolean;
  hydBPump1Low: boolean;
  hydBPump2Low: boolean;
  stbyOn: boolean;
  gearTransit: boolean;
  gearDown: boolean;
  gearUp: boolean;
  gearPositionDisagree: boolean;
  gearPositions: { nose: number; leftMain: number; rightMain: number };
  gearLights: { nose: { green: boolean; red: boolean }; leftMain: { green: boolean; red: boolean }; rightMain: { green: boolean; red: boolean } };
  gearWarningHorn: boolean;
  masterCaution: boolean;
  lights: LightStatus[];
  lightComponents: LightComponent[];
  fireWarn: boolean;
  engine1FireWarn: boolean;
  engine2FireWarn: boolean;
  apuFireWarn: boolean;
  wheelWellFireWarn: boolean;
  cargoFwdFireWarn: boolean;
  cargoAftFireWarn: boolean;
  standbyRudderPowered: boolean;
  alternateFlapDrivePowered: boolean;
  alternateFlapArmed: boolean;
  teFlapHydraulicDriveAvailable: boolean;
  leDriveAvailable: boolean;
  leExtended: boolean;
  leTransit: boolean;
  flightControlAAvailable: boolean;
  flightControlBAvailable: boolean;
  apuGenOffBus: boolean;
  gen1OffBus: boolean;
  gen2OffBus: boolean;
  transferRelay1Alt: boolean;
  transferRelay2Alt: boolean;
  startValveOpen1: boolean;
  startValveOpen2: boolean;
  bleed13Available1: boolean;
  bleed13Available2: boolean;
  alternateFlapTakeover: boolean;
  feelDiff: boolean;
  speedBrakeArmed: boolean;
  interlocks: Interlock[];
  components: ComponentStatus[];
  hydraulicUsers: HydraulicUserStatus[];
  electricalUsers: ElectricalUserStatus[];
  generator1BusPowered: boolean;
  generator2BusPowered: boolean;
  generator1ProtectionTripped: boolean;
  generator2ProtectionTripped: boolean;
  generator1ThreePhaseHealthy: boolean;
  generator2ThreePhaseHealthy: boolean;
  transferBus1Powered: boolean;
  transferBus2Powered: boolean;
  tr1Powered: boolean;
  tr2Powered: boolean;
  tr3Powered: boolean;
  dcBus1Powered: boolean;
  dcBus2Powered: boolean;
  electricalSource1: string;
  electricalSource2: string;
  batteryPower: boolean;
  hotBatteryBusPowered: boolean;
  batteryBusPowered: boolean;
  essentialDcPower: boolean;
  standbyAcPowered: boolean;
  standbyDcPowered: boolean;
  externalDcControl: boolean;
  standbyAcSource: "TRANSFER BUS 1" | "STATIC INVERTER" | "NONE";
  standbyDcSource: "DC BUS 1" | "BATTERY BUS" | "NONE";
  staticInverterPowered: boolean;
  groundServiceBusPowered: boolean;
  batteryChargerPowered: boolean;
  ac28vPowered: boolean;
  standbyAutoTransfer: boolean;
  antiskidOperational: boolean;
  antiskidInbdOperational: boolean;
  antiskidOutbdOperational: boolean;
  autobrakeTestPassed: boolean;
  autobrakeArmed: boolean;
  autobrakeActive: boolean;
  autobrakeDisarm: boolean;
  autobrakePressure: number;
  antiskidModulating: boolean;
  wheelSpeeds: { li: number; lo: number; ri: number; ro: number };
  wheelBrakePressures: { li: number; lo: number; ri: number; ro: number };
  targetDecel: number;
  actualDecel: number;
  manualBrakeOverride: boolean;
  controlSurfaces: { elevator: number; aileronL: number; aileronR: number; rudder: number; spoiler: number; spoilerL: number; spoilerR: number; spoiler2: number; spoiler3: number; spoiler6: number; spoiler7: number };
  controlAuthority: { elevator: number; aileron: number; rudder: number };
  adverseYawCue: number;
  adverseYawDirection: "LEFT" | "RIGHT" | "NONE";
  adverseYawCorrected: boolean;
  noseWheelSteeringAngle: number;
  noseWheelSteeringAvailable: boolean;
  brakeSource: { li: string; lo: string; ri: string; ro: string };
}

export interface ElectricalUserStatus {
  id: string;
  label: string;
  source: string;
  powered: boolean;
  bus: string;
  detail?: string;
}

export interface HydraulicUserStatus {
  id: string;
  label: string;
  systemA: boolean;
  systemB: boolean;
  standby: boolean;
  electricAlternate: boolean;
  activeSource: string;
}


export interface Interlock {
  id: string;
  text: string;
  tone: "info" | "caution" | "warn";
}
