// Landing gear position and indication section of derive.ts (ATA 32): gear down/up, transit, selector
// disagreement, warning horn, per-gear green/red lights, injected gear faults.
export const FIELDS = [
  "gearPositions", "gearDown", "gearUp", "gearWarningHorn", "gearLights", "gearPositionDisagree", "gearTransit",
];
const DC = { battery: true };
const DOWN = { noseGearPos: 1, leftMainGearPos: 1, rightMainGearPos: 1, gear: "DN" };
export const SCENARIOS: Array<{ name: string; ov: Record<string, any> }> = [
  { name: "gear_down_locked", ov: { ...DC, ...DOWN } },
  { name: "gear_up_locked", ov: { ...DC, noseGearPos: 0, leftMainGearPos: 0, rightMainGearPos: 0, gear: "UP" } },
  { name: "gear_transit_down", ov: { ...DC, noseGearPos: 0.5, leftMainGearPos: 0.5, rightMainGearPos: 0.5, gear: "DN" } },
  { name: "gear_selector_up_gear_down", ov: { ...DC, ...DOWN, gear: "UP" } },
  { name: "gear_nose_fault_injected", ov: { ...DC, ...DOWN, noseGearPos: 0.7, landingGearFault: "NOSE" } },
  { name: "gear_left_main_fault_injected", ov: { ...DC, ...DOWN, leftMainGearPos: 0.9, landingGearFault: "LEFT_MAIN" } },
  { name: "gear_horn_throttle_retarded", ov: { ...DC, noseGearPos: 0, leftMainGearPos: 0, rightMainGearPos: 0, gear: "UP", throttle1: 0.05, throttle2: 0.05 } },
  { name: "gear_horn_flaps_over_15", ov: { ...DC, noseGearPos: 0, leftMainGearPos: 0, rightMainGearPos: 0, gear: "UP", flaps: 30 } },
  { name: "gear_no_dc_power_lights_dark", ov: { noseGearPos: 0.5, leftMainGearPos: 0.5, rightMainGearPos: 0.5, gear: "DN" } },
];
