// Standby rudder, alternate flaps, aileron/spoiler mixer, rudder and adverse-yaw cue of derive.ts (ATA 27/29/32).
// The hydraulic and electrical "users" arrays are a separate section.
export const FIELDS = [
  "controlSurfaces", "standbyRudderPowered", "alternateFlapTakeover", "alternateFlapArmed", "alternateFlapDrivePowered",
  "teFlapHydraulicDriveAvailable", "leDriveAvailable", "adverseYawCue", "adverseYawDirection", "adverseYawCorrected",
];
const DC = { battery: true };
const HYD_A = { hydAPress: 3000 };
const HYD_B = { hydBPress: 3000 };
const SPOILERS = { spoilerA: true, spoilerB: true };
const ENG1_GEN = { lever1: true, n2_1: 60, gen1: true };
export const SCENARIOS: Array<{ name: string; ov: Record<string, any> }> = [
  { name: "quiet_default", ov: { ...DC } },
  { name: "stby_on_switch_selected", ov: { ...DC, stbyHyd: "ON", hydSQty: 10 } },
  { name: "stby_auto_primary_loss", ov: { ...DC, stbyHyd: "AUTO", hydAPress: 1000, hydBPress: 1000, hydSQty: 10 } },
  { name: "alt_flaps_armed_dn_electric", ov: { ...DC, ...ENG1_GEN, altFlapsArm: true, altFlapsControl: "DN", flapPos: 10 } },
  { name: "alt_flaps_dn_limit_reached", ov: { ...DC, ...ENG1_GEN, altFlapsArm: true, altFlapsControl: "DN", flapPos: 40 } },
  { name: "alt_flaps_flap_asymmetry_shutdown", ov: { ...DC, ...ENG1_GEN, altFlapsArm: true, altFlapsControl: "DN", flapPos: 10, faults: { flapAsymmetry: true } } },
  { name: "roll_right_spoilers_sys_a", ov: { ...DC, ...HYD_A, ...SPOILERS, yokeRoll: 0.5 } },
  { name: "roll_left_spoilers_sys_b", ov: { ...DC, ...HYD_B, ...SPOILERS, yokeRoll: -0.6 } },
  { name: "speedbrake_baseline_both_systems", ov: { ...DC, ...HYD_A, ...HYD_B, ...SPOILERS, spoilerPos: 0.4, speedBrake: "UP", yokeRoll: 0.2 } },
  { name: "adverse_yaw_roll_no_rudder", ov: { ...DC, ...HYD_A, adverseYawScenario: true, yokeRoll: 0.8, rudderPedal: 0 } },
  { name: "adverse_yaw_rudder_corrected", ov: { ...DC, ...HYD_A, adverseYawScenario: true, yokeRoll: 0.8, rudderPedal: 0.5 } },
  { name: "rudder_pedal_no_hydraulics", ov: { ...DC, rudderPedal: 0.7 } },
  { name: "rudder_pedal_standby_only", ov: { ...DC, stbyHyd: "ON", hydSQty: 10, rudderPedal: -0.6 } },
  { name: "le_standby_alt_flaps_dn", ov: { ...DC, ...ENG1_GEN, altFlapsArm: true, altFlapsControl: "DN", flapPos: 10, hydSQty: 10, stbyHyd: "ON" } },
];
