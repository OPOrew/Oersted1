// Bleed/pneumatic manifold section of derive.ts (ATA 36): engine bleed valves, isolation, manifold
// pressures, anti-ice load, duct pressure, DUAL BLEED. Only returned fields are asserted (probe-fields.mts).
export const FIELDS = [
  "bleed1Available", "bleed2Available", "dualBleed", "leftDuctPsi", "rightDuctPsi", "ductPsi",
];
const GEN1_RUN = { battery: true, lever1: true, n2_1: 60, gen1: true, start1: "GRD" };
const BOTH_RUN = { battery: true, lever1: true, lever2: true, n2_1: 60, n2_2: 60, gen1: true, gen2: true, start1: "GRD", start2: "GRD" };
const APU_ON = { battery: true, apuMaster: "ON", apuRpm: 100, apuBleed: true, apuBleedValve: 1.0 };
export const SCENARIOS: Array<{ name: string; ov: Record<string, any> }> = [
  { name: "engine1_bleed_on", ov: { ...GEN1_RUN, bleed1: true } },
  { name: "engine1_bleed_tripped", ov: { ...GEN1_RUN, bleed1: true, bleedTrip1: true } },
  { name: "engine1_fire_closes_bleed", ov: { ...GEN1_RUN, bleed1: true, engine1FirePulled: true } },
  { name: "both_bleed_isolation_auto_closed", ov: { ...BOTH_RUN, bleed1: true, bleed2: true, isolation: "AUTO", packL: true, packR: true } },
  { name: "isolation_open_crosses_bleed", ov: { ...BOTH_RUN, bleed1: true, isolation: "OPEN" } },
  { name: "apu_bleed_left_manifold", ov: { ...APU_ON } },
  { name: "apu_and_eng2_dual_bleed", ov: { ...APU_ON, lever2: true, n2_2: 60, gen2: true, start2: "GRD", bleed2: true, isolation: "OPEN" } },
  { name: "ground_pneumatic_right", ov: { battery: true, groundPneumaticConnected: true, groundPneumaticPsi: 40 } },
  { name: "anti_ice1_load_on_bleed1", ov: { ...GEN1_RUN, bleed1: true, antiIce1: true } },
];
