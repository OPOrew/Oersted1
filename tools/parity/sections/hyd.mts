// Hydraulic pressure section of derive.ts (ATA 29): System A engine pumps, System B electric pumps,
// ground hydraulic service, ground interconnect, flight-control availability, thrust reversers,
// standby pump demand. Only fields the web derive() returns are asserted (probe-fields.mts).
export const FIELDS = [
  "hydAPump1On", "hydAPump2On", "hydA", "hydBPump1On", "hydBPump2On", "hydB", "groundAPress",
  "flightControlAAvailable", "flightControlBAvailable", "thrustReverser1Active", "thrustReverser2Active", "hydS",
];
const GEN1_RUN = { battery: true, lever1: true, n2_1: 60, gen1: true, start1: "GRD" };
const GEN2_RUN = { battery: true, lever2: true, n2_2: 60, gen2: true, start2: "GRD" };
const GROUND = { battery: true, externalPowerConnected: true, groundPowerOn: true };
export const SCENARIOS: Array<{ name: string; ov: Record<string, any> }> = [
  { name: "no_hyd_power", ov: { battery: true } },
  { name: "sysA_pump1_eng1", ov: { ...GEN1_RUN, engHyd1: true } },
  { name: "sysA_pump2_eng2", ov: { ...GEN2_RUN, engHyd2: true } },
  { name: "sysA_leak_limited", ov: { ...GEN1_RUN, engHyd1: true, faults: { hydALeak: true } } },
  { name: "sysB_pump1_gen1", ov: { ...GEN1_RUN, elecHyd1: true } },
  { name: "sysB_pump1_gen1_open_phase", ov: { ...GEN1_RUN, elecHyd1: true, faults: { openPhase1: true } } },
  { name: "sysB_ground_tie_pump", ov: { ...GROUND, elecHyd1: true, lever1: true, n2_1: 60, start1: "GRD" } },
  { name: "sysB_ground_service_source", ov: { battery: true, hydGroundPowerConnected: true, wow: true } },
  { name: "ground_interconnect_parking_brake", ov: { battery: true, hydGroundPowerConnected: true, wow: true, parkingBrake: true, groundInterconnect: true } },
  { name: "ground_interconnect_brake_released", ov: { battery: true, hydGroundPowerConnected: true, wow: true, parkingBrake: false, groundInterconnect: true } },
  { name: "reservoir_air_ground_cart", ov: { ...GROUND, hydReservoirAirConnected: true, hydReservoirAirPsi: 40, wow: true, elecHyd1: true } },
  { name: "standby_auto_primary_loss", ov: { battery: true, standbyPower: "BAT", stbyHyd: "AUTO" } },
  { name: "standby_alt_flaps_arm", ov: { battery: true, standbyPower: "BAT", altFlapsArm: true } },
  { name: "thrust_reverser1_idle", ov: { ...GEN1_RUN, engHyd1: true, rev1: true, wow: true, throttle1: 0 } },
  { name: "flight_control_A_switch_on", ov: { ...GEN1_RUN, engHyd1: true, fltCtrlA: true } },
];
