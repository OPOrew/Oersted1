// Named SimState scenarios for parity tests. Overrides are applied on top of initialSim.
// Keys: flat SimState fields; "faults" and "circuitBreakers" are merged objects.
export const ELEC_SCENARIOS: Array<{ name: string; ov: Record<string, any> }> = [
  { name: "cold_and_dark", ov: {} },
  { name: "battery_only", ov: { battery: true } },
  { name: "eng1_running_gen1", ov: { battery: true, lever1: true, n2_1: 60, start1: "GRD", gen1: true } },
  { name: "both_engines_gen_bus_tie", ov: { battery: true, lever1: true, lever2: true, n2_1: 60, n2_2: 60, gen1: true, gen2: true, busTie: true } },
  { name: "external_power_only", ov: { battery: true, externalPowerConnected: true, groundPowerOn: true } },
  { name: "apu_gen_left_control", ov: { battery: true, apuMaster: "ON", apuRpm: 100, apuGen: true, apuLeftControl: true } },
  { name: "tr1_failed_gen1", ov: { battery: true, lever1: true, n2_1: 60, gen1: true, faults: { tr1Failure: true } } },
  { name: "gen1_open_phase", ov: { battery: true, lever1: true, n2_1: 60, gen1: true, faults: { openPhase1: true } } },
  { name: "ignition_grd_both_cb_on", ov: { battery: true, lever1: true, start1: "GRD" } },
  { name: "ignition_left_cb_open", ov: { battery: true, lever1: true, start1: "IGN_L", circuitBreakers: { "eng1-ign-left": false } } },
  { name: "gen1_protection_latched", ov: { battery: true, lever1: true, n2_1: 60, gen1: true, generator1ProtectionLatched: true } },
  { name: "gen2_only_bus_tie_relay_alt", ov: { battery: true, lever2: true, n2_2: 60, gen2: true, busTie: true, transferRelay1Timer: 0.2 } },
  { name: "gen1_fire_pulled", ov: { battery: true, lever1: true, n2_1: 60, gen1: true, engine1FirePulled: true } },
];
