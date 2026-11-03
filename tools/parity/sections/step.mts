// Trajectory scenarios for step(): each runs `steps` ticks of `dt` seconds from the given overrides.
// dt = 1/30 matches the app's 30 Hz ticker. APU_AIR supplies pneumatic air (APU bleed), AC power (APU gen)
// and a running APU, so the engine start sequence has the air, fuel and power it needs.
const DT = 1 / 30;
const APU_AIR = { battery: true, apuMaster: "ON", apuRpm: 100, apuOilPsi: 95, apuFuelValve: 1, apuDoor: 1, apuGen: true, apuLeftControl: true, apuBleed: true, apuBleedValve: 1 };
export const SCENARIOS: Array<{ name: string; ov: Record<string, any>; steps: number; dt: number; wx?: number; wxAfter?: [number, number] }> = [
  { name: "idle_quiet_no_power", ov: {}, steps: 300, dt: DT },
  { name: "apu_start_to_running", ov: { battery: true, apuMaster: "START", apuGen: false }, steps: 1500, dt: DT },
  { name: "apu_gen_running_bleed", ov: { ...APU_AIR, apuOilPsi: 95 }, steps: 600, dt: DT },
  { name: "eng1_grd_start_apu_air", ov: { ...APU_AIR, start1: "GRD", lever1: true, throttle1: 0, fuelPump1Fwd: true, fuelTank1: 60 }, steps: 2400, dt: DT },
  { name: "eng2_grd_start_apu_air", ov: { ...APU_AIR, start2: "GRD", lever2: true, throttle2: 0, fuelPump2Fwd: true, fuelTank2: 60 }, steps: 2400, dt: DT },
  { name: "eng1_running_takeoff_thrust", ov: { ...APU_AIR, n2_1: 60, n1_1: 40, egt1: 400, ff1: 800, lever1: true, throttle1: 1, fuelPump1Fwd: true, fuelTank1: 60 }, steps: 900, dt: DT },
  { name: "eng1_fire_pulled_shutdown", ov: { ...APU_AIR, n2_1: 60, n1_1: 40, egt1: 400, ff1: 800, lever1: true, engine1FirePulled: true, fuelPump1Fwd: true, fuelTank1: 60 }, steps: 300, dt: DT },
  { name: "eng1_low_oil_running", ov: { ...APU_AIR, n2_1: 60, n1_1: 40, egt1: 350, ff1: 700, lever1: true, throttle1: 0.5, fuelPump1Fwd: true, fuelTank1: 60, oilQty1: 5 }, steps: 600, dt: DT },
  { name: "takeoff_rollout_autobrake_rto", ov: { battery: true, wow: true, hydAPress: 3000, hydBPress: 3000, rwyPhase: "ROLLOUT", groundSpeedKt: 120, rwyPosM: 500, autobrake: 4, antiskidInbd: true, antiskidOutbd: true, speedBrake: "ARMED", throttle1: 0, throttle2: 0 }, steps: 1200, dt: DT },
  { name: "manual_braking_wet_patch", ov: { battery: true, wow: true, hydAPress: 3000, hydBPress: 3000, rwyPhase: "ROLLOUT", groundSpeedKt: 80, runway: "WET", rwyPatch: "LEFT", leftBrakePedal: 0.6, rightBrakePedal: 0.2, rwyPosM: 390, rwyLatM: 0 }, steps: 900, dt: DT },
  { name: "gear_retract_airborne", ov: { battery: true, hydAPress: 3000, hydBPress: 3000, gear: "UP", wow: false, airborneTest: true }, steps: 600, dt: DT },
  { name: "pressurization_climb_progressive", ov: { battery: true, packL: true, packR: true, psTrainerEnabled: true, psFlightProgressive: true, psFlightTargetAltFt: 10000, psFlightVsFpm: 1500, psFlightCasKt: 250, psFlightTargetCasKt: 280, wow: false, pressMode: "AUTO" }, steps: 1200, dt: DT },
  { name: "wheel_well_fire_gear_down", ov: { battery: true, wheelWellFire: true, wheelWellLevel: 0.5, gear: "DN", noseGearPos: 1, leftMainGearPos: 1, rightMainGearPos: 1 }, steps: 600, dt: DT },
  { name: "cargo_fire_fwd_discharged", ov: { battery: true, cargoFireInstalled: true, cargoFwdFire: true, cargoFwdLevel: 0.6, cargoArmed: "FWD", cargoBottleDischarged: true }, steps: 900, dt: DT },
  { name: "icing_unheated_precip", ov: { battery: true, psFlightAltFt: 10000, psFlightCasKt: 280, wow: false }, steps: 900, dt: DT, wx: 0.5 },
  { name: "icing_then_light_precip_band", ov: { battery: true, psFlightAltFt: 10000, psFlightCasKt: 280, wow: false }, steps: 900, dt: DT, wx: 0.5, wxAfter: [450, 0.12] },
  { name: "icing_then_clear_sky", ov: { battery: true, psFlightAltFt: 10000, psFlightCasKt: 280, wow: false }, steps: 900, dt: DT, wx: 0.5, wxAfter: [450, 0.0] },
  // Coverage added in session 26: paths the first 17 scenarios did not exercise.
  { name: "pack_overheat_trip_latched", ov: { ...APU_AIR, packL: true, packR: true, faults: { packOverheat: true } }, steps: 600, dt: DT },
  { name: "bleed1_overheat_trip", ov: { ...APU_AIR, packL: true, packR: true, faults: { bleedOverheat1: true } }, steps: 600, dt: DT },
  { name: "rto_full_stop_autobrake", ov: { battery: true, wow: true, hydAPress: 3000, hydBPress: 3000, rwyPhase: "ROLLOUT", groundSpeedKt: 60, rwyPosM: 500, autobrake: 4, antiskidInbd: true, antiskidOutbd: true, speedBrake: "ARMED", throttle1: 0, throttle2: 0 }, steps: 2400, dt: DT },
  { name: "manual_gear_release_extend", ov: { battery: true, wow: false, gear: "UP", noseGearPos: 0, leftMainGearPos: 0, rightMainGearPos: 0, manualReleasedNose: true, manualExtendNose: true, manualReleasedLeftMain: true, manualExtendLeftMain: true }, steps: 900, dt: DT },
  { name: "center_pump_relay_cutout_unpowered", ov: { battery: true, fuelPumpCenter1: true, fuelTankCenter: 50, fuelCenterPumpAutoShutoffInstalled: true }, steps: 900, dt: DT },
  { name: "cabin_temp_packs_on_supply", ov: { ...APU_AIR, packL: true, packR: true, wow: true }, steps: 1200, dt: DT },
];
