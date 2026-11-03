// Hydraulic users list of derive.ts (ATA 29/27/32/52): which system (A, B, standby, electric alternate) supplies each user.
// Compared as "id|label|systemA|systemB|standby|electricAlternate|activeSource" lines, in TS order.
export const FIELDS = ["hydraulicUsers"];
export const EXPR = { hydraulicUsers: 'd.hydraulicUsers.joinToString("\\n") { listOf(it.id, it.label, it.systemA, it.systemB, it.standby, it.electricAlternate, it.activeSource).joinToString("|") }' };
const DC = { battery: true };
const HYD_A = { hydAPress: 3000 };
const HYD_B = { hydBPress: 3000 };
const SPOILERS = { spoilerA: true, spoilerB: true };
export const SCENARIOS: Array<{ name: string; ov: Record<string, any> }> = [
  { name: "all_quiet_no_hydraulics", ov: { ...DC } },
  { name: "system_a_only", ov: { ...DC, ...HYD_A, ...SPOILERS } },
  { name: "system_b_only", ov: { ...DC, ...HYD_B, ...SPOILERS } },
  { name: "both_systems_pressurised", ov: { ...DC, ...HYD_A, ...HYD_B, ...SPOILERS } },
  { name: "both_low_stby_auto", ov: { ...DC, stbyHyd: "AUTO", hydAPress: 1000, hydBPress: 1000, hydSQty: 10 } },
  { name: "ground_spoilers_wow_speedbrake_up", ov: { ...DC, ...HYD_A, ...SPOILERS, wow: true, speedBrake: "UP" } },
  { name: "alt_flaps_takeover_dn", ov: { ...DC, ...HYD_A, lever1: true, n2_1: 60, gen1: true, altFlapsArm: true, altFlapsControl: "DN", flapPos: 10, hydSQty: 10 } },
  { name: "gear_up_hyd_a_only", ov: { ...DC, ...HYD_A, gear: "UP" } },
];
