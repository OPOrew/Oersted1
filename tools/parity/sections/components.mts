// Component status list of derive.ts (ATA 21-73, all systems): one entry per panel component with active flag,
// circuit-breaker reference and detail text. Compared as "id|label|active|cb|detail" lines in TS order.
export const FIELDS = ["components"];
export const EXPR = { components: 'd.components.joinToString("\\n") { listOf(it.id, it.label, it.active, it.cb, it.detail).joinToString("|") }' };
const DC = { battery: true };
const GEN1 = { lever1: true, n2_1: 60, gen1: true };
export const SCENARIOS: Array<{ name: string; ov: Record<string, any> }> = [
  { name: "dark_default", ov: {} },
  { name: "dc_only", ov: { ...DC } },
  { name: "gen1_running_drive_connected", ov: { ...DC, ...GEN1, elecHyd1: true } },
  { name: "gen1_drive_disconnect_failed", ov: { ...DC, ...GEN1, gen1Disc: true, faults: { genDriveDisconnectFailure1: true } } },
  { name: "recirc_and_cooling_running", ov: { ...DC, ...GEN1, recirc: true } },
  { name: "equipment_bay_overheat", ov: { ...DC, equipmentBayTempC: 70, faults: { equipmentCoolingFailure: true } } },
  { name: "oxygen_and_passenger_oxy", ov: { ...DC, crewOxyPsi: 1800, passOxyMode: "ON" } },
  { name: "oxygen_system_failure", ov: { ...DC, faults: { oxygenSystemFailure: true } } },
  { name: "engine1_start_grd_starter", ov: { ...DC, start1: "GRD", startValve1: true, apuRpm: 100, apuMaster: "ON", apuBleed: true, apuBleedValve: 1, n2_1: 20 } },
  { name: "engine2_start_flt_ignition", ov: { ...DC, start2: "FLT", lever2: true, n2_2: 30 } },
  { name: "fuel_crossfeed_open_both_tanks", ov: { ...DC, fuelCrossfeed: true, fuelTank1: 40, fuelTank2: 40, fuelTankCenter: 10 } },
  { name: "fuel_crossfeed_valve_failed", ov: { ...DC, fuelCrossfeed: true, faults: { fuelCrossfeedValveFail: true } } },
  { name: "fire_handles_and_bottles", ov: { ...DC, faults: { engineFire1: true }, fireBottleLDischarged: true } },
  { name: "oil_low_and_chip", ov: { ...DC, oilPsi1: 20, oilQty1: 50, faults: { oilLow1: true, oilChip2: true } } },
  { name: "brake_sources_with_pressure", ov: { ...DC, hydAPress: 3000, hydBPress: 3000 } },
  { name: "gear_up_hyd_a", ov: { ...DC, gear: "UP", hydAPress: 3000 } },
  { name: "autobrake_rto_active", ov: { ...DC, autobrake: 4, autobrakeRtoArmed: true, wow: true, groundSpeedKt: 95, hydAPress: 3000, hydBPress: 3000, antiskidInbd: true, antiskidOutbd: true, gear: "DN", autobrakeTestTimer: 3, speedBrake: "ARMED" } },
  { name: "cvr_memory_erased", ov: { ...DC, cvrMemoryErased: true, flightRecorderMode: "NORMAL" } },
];
