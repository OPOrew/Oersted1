// Start valve, 13th-stage bleed and off-bus/fire annunciator block of derive.ts (ATA 21/36/75/24/26).
export const FIELDS = [
  "startValveOpen1", "startValveOpen2", "bleed13Available1", "bleed13Available2",
  "apuGenOffBus", "gen1OffBus", "gen2OffBus", "engine1FireWarn", "engine2FireWarn", "apuFireWarn", "wheelWellFireWarn",
];
const DC = { battery: true };
const APU_RUN = { apuRpm: 100, apuMaster: "ON", apuBleed: true, apuBleedValve: 1 };
const ENG1 = { lever1: true, bleed1: true };
export const SCENARIOS: Array<{ name: string; ov: Record<string, any> }> = [
  { name: "start_valve1_closed_default", ov: { ...DC } },
  { name: "start_valve1_open_with_apu_duct", ov: { ...DC, ...APU_RUN, startValve1: true } },
  { name: "start_valve1_no_dc_power", ov: { ...APU_RUN, startValve1: true } },
  { name: "bleed13_eng1_running", ov: { ...DC, ...ENG1 } },
  { name: "bleed13_inhibited_by_starter", ov: { ...DC, ...ENG1, ...APU_RUN, startValve1: true } },
  { name: "apu_gen_off_bus_ground_power", ov: { ...DC, ...APU_RUN, apuGen: true, groundPowerOn: true } },
  { name: "gen1_off_bus_fault", ov: { ...DC, ...ENG1, gen1: true } },
  { name: "engine1_fire_detected", ov: { ...DC, faults: { engineFire1: true } } },
  { name: "engine2_fire_detected", ov: { ...DC, faults: { engineFire2: true } } },
  { name: "apu_fire_no_power_dark", ov: { faults: { apuFireDetected: true } } },
  { name: "wheel_well_fire", ov: { ...DC, wheelWellFire: true } },
  { name: "wheel_well_level_warn", ov: { ...DC, wheelWellLevel: 0.6 } },
];
