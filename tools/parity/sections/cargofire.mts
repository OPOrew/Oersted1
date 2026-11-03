// Cargo fire detection and FIRE WARN summary of derive.ts (ATA 26). Runs after the start/annunciator block.
export const FIELDS = ["cargoFwdFireWarn", "cargoAftFireWarn", "fireWarn"];
const DC = { battery: true };
const INST = { cargoFireInstalled: true };
export const SCENARIOS: Array<{ name: string; ov: Record<string, any> }> = [
  { name: "cargo_not_installed_fire_ignored", ov: { ...DC, cargoFwdFire: true } },
  { name: "installed_loop_a_only_no_fire", ov: { ...DC, ...INST, cargoLoopA: true } },
  { name: "both_loops_fwd_level_above_035", ov: { ...DC, ...INST, cargoLoopA: true, cargoLoopB: true, cargoFwdLevel: 0.4 } },
  { name: "single_loop_fwd_level_040_no_warn", ov: { ...DC, ...INST, cargoLoopA: true, cargoFwdLevel: 0.4 } },
  { name: "single_loop_fwd_level_070_warn", ov: { ...DC, ...INST, cargoLoopB: true, cargoFwdLevel: 0.7 } },
  { name: "aft_fire_both_loops", ov: { ...DC, ...INST, cargoLoopA: true, cargoLoopB: true, cargoAftFire: true } },
  { name: "installed_no_loops_fire_ignored", ov: { ...DC, ...INST, cargoFwdFire: true } },
  { name: "cargo_fire_no_dc_power_dark", ov: { ...INST, cargoLoopA: true, cargoFwdFire: true } },
  { name: "engine1_fire_drives_fire_warn", ov: { ...DC, faults: { engineFire1: true } } },
];
