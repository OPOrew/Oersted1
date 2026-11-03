// Hydraulic LOW PRESS lights and MASTER CAUTION summary of derive.ts (ATA 26/29/36).
export const FIELDS = ["hydALow", "hydBLow", "hydBPump1Low", "hydBPump2Low", "masterCaution"];
const DC = { battery: true };
const ENG1 = { lever1: true, n2_1: 60, engHyd1: true };
export const SCENARIOS: Array<{ name: string; ov: Record<string, any> }> = [
  { name: "hyd_quiet_default", ov: { ...DC } },
  { name: "hydA_pump1_low_pressure", ov: { ...DC, ...ENG1, hydAPress: 1000 } },
  { name: "hydA_pressure_ok", ov: { ...DC, ...ENG1, hydAPress: 3000 } },
  { name: "hydA_engine1_fire_pulled_bypassed", ov: { ...DC, ...ENG1, hydAPress: 1000, engine1FirePulled: true } },
  { name: "hydB_elec_pump1_low", ov: { ...DC, elecHyd1: true, hydBPress: 1000 } },
  { name: "hydB_elec_pump1_no_power_dark", ov: { elecHyd1: true, hydBPress: 1000 } },
  { name: "hydB_elec_pump2_ok_pressure", ov: { ...DC, elecHyd2: true, hydBPress: 3000 } },
  { name: "master_caution_pack_trip_left", ov: { ...DC, packTripL: true } },
  { name: "master_caution_hydB_leak", ov: { ...DC, faults: { hydBLeak: true } } },
  { name: "master_caution_fuel_pump_timer", ov: { ...DC, fuelCenterPumpAutoShutoffInstalled: true, fuelCenterPump1LowPressureTimer: 12 } },
  { name: "master_caution_none_with_power", ov: { ...DC } },
];
