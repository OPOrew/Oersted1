// Interlocks advisory list of derive.ts (ATA 21/24/26/29/32/36). Compared as "id|text|tone" lines, in TS push order.
export const FIELDS = ["interlocks", "apuLowOil", "generator1ProtectionTripped", "generator2ProtectionTripped"];
export const EXPR = { interlocks: 'd.interlocks.joinToString("\\n") { it.id + "|" + it.text + "|" + it.tone }' };
const DC = { battery: true };
export const SCENARIOS: Array<{ name: string; ov: Record<string, any> }> = [
  { name: "quiet_default", ov: { ...DC } },
  { name: "apu_low_oil_light_running", ov: { ...DC, apuMaster: "ON", apuLowOilLightOn: true } },
  { name: "apu_door_start_lockout", ov: { ...DC, apuMaster: "START", apuDoor: 0.5 } },
  { name: "apu_fuel_valve_wait", ov: { ...DC, apuMaster: "ON", apuFuelValve: 0.5, apuDoor: 0 } },
  { name: "start_air_low_duct_grd", ov: { ...DC, start1: "GRD" } },
  { name: "idle_prompt_eng1_n2_window", ov: { ...DC, start1: "GRD", lever1: false, n2_1: 25 } },
  { name: "dual_bleed_apu_and_eng1", ov: { ...DC, apuRpm: 100, apuMaster: "ON", apuBleed: true, apuBleedValve: 1, bleed1: true, lever1: true, n2_1: 60 } },
  { name: "gen1_protection_latched", ov: { ...DC, gen1: true, generator1ProtectionLatched: true } },
  { name: "gen2_protection_timer_over_threshold", ov: { ...DC, gen2: true, faults: { generator2OverVoltage: true }, generator2ProtectionTimer: 0.5 } },
  { name: "gear_up_hydA_low", ov: { ...DC, gear: "UP", hydAPress: 1000 } },
  { name: "rev1_inhibited_no_wow", ov: { ...DC, rev1: true } },
  { name: "fault_bundle_hydA_pack_tr1_antiskid", ov: { ...DC, faults: { hydALeak: true, packOverheatR: true, tr1Failure: true, antiskidInop: true } } },
  { name: "gear_position_fault_nose", ov: { ...DC, gear: "DN", landingGearFault: "NOSE" } },
  { name: "autobrake_antiskid_disarm", ov: { ...DC, autobrake: 2, faults: { antiskidInop: true } } },
  { name: "gear_lever_up_antiskid_disabled", ov: { ...DC, gear: "UP", antiskidInbd: true, antiskidOutbd: true } },
  { name: "engine1_fire_not_pulled", ov: { ...DC, faults: { engineFire1: true } } },
  { name: "te_flap_motor_fail_no_alt_arm", ov: { ...DC, faults: { teFlapHydMotorFail: true }, altFlapsArm: false } },
];
