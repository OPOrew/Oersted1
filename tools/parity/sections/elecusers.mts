// Electrical users list of derive.ts (ATA 24/26/29/30/21/52): supply source, powered state, bus and detail per user.
// Compared as "id|label|source|powered|bus|detail" lines in TS order.
export const FIELDS = ["electricalUsers"];
export const EXPR = { electricalUsers: 'd.electricalUsers.joinToString("\\n") { listOf(it.id, it.label, it.source, it.powered, it.bus, it.detail).joinToString("|") }' };
const DC = { battery: true };
const GEN1 = { lever1: true, n2_1: 60, gen1: true };
const GEN2 = { lever2: true, n2_2: 60, gen2: true };
export const SCENARIOS: Array<{ name: string; ov: Record<string, any> }> = [
  { name: "dark_no_power", ov: {} },
  { name: "battery_only", ov: { ...DC } },
  { name: "gen1_pump1_powered", ov: { ...DC, ...GEN1, elecHyd1: true } },
  { name: "gen1_open_phase_fault", ov: { ...DC, ...GEN1, elecHyd1: true, faults: { openPhase1: true } } },
  { name: "gen2_failed_pump2_switch_on", ov: { ...DC, ...GEN1, elecHyd2: true, faults: { generator2Failure: true } } },
  { name: "gpu_external_power", ov: { ...DC, groundPowerOn: true, elecHyd1: true } },
  { name: "apu_gen_tie_bus", ov: { ...DC, apuRpm: 100, apuMaster: "ON", apuGen: true, apuLeftControl: true, elecHyd1: true } },
  { name: "tr1_failed_gen1_present", ov: { ...DC, ...GEN1, faults: { tr1Failure: true } } },
  { name: "tr3_backup_from_gen2", ov: { ...DC, ...GEN2 } },
  { name: "tr3_failed", ov: { ...DC, ...GEN2, faults: { tr3Failure: true } } },
  { name: "static_inverter_bat_standby", ov: { ...DC, standbyPower: "BAT" } },
  { name: "standby_auto_transfer", ov: { ...DC, standbyPower: "AUTO", stbyHyd: "AUTO", hydAPress: 1000, hydBPress: 1000, hydSQty: 10 } },
  { name: "stby_pump_no_quantity", ov: { ...DC, standbyPower: "BAT", stbyHyd: "ON", hydSQty: 0 } },
  { name: "recirc_and_cooling_on_gen1", ov: { ...DC, ...GEN1, recirc: true } },
  { name: "apu_starter_engaged", ov: { ...DC, apuStarter: true } },
  { name: "battery_charger_ground_service", ov: { ...DC, groundPowerOn: true } },
  { name: "cooling_blower_failed", ov: { ...DC, ...GEN1, faults: { equipmentCoolingFailure: true } } },
];
