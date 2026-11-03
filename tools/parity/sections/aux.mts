// Aux power section of derive.ts: drain heaters/masts, alpha-vane heat, standby power, ground service,
// battery charger feed, 28VAC branch, electrical source labels, door-pressure flag.
export const FIELDS = [
  "drainHeater1Powered", "drainHeater2Powered", "drainMastAirPowered", "drainMastGroundPowered",
  "drainMastForwardPowered", "drainMastAftPowered", "drainHeater1Hot", "drainHeater2Hot",
  "alphaVaneHeatedL", "alphaVaneHeatedR", "doorPressureLeak", "staticInverterPowered", "standbyAcPowered",
  "standbyDcPowered", "standbyAcSource", "standbyDcSource", "groundServiceBusPowered", "batteryChargerPowered",
  "ac28vPowered", "electricalSource1", "electricalSource2",
];
const GEN1_RUN = { battery: true, lever1: true, n2_1: 60, gen1: true, start1: "GRD" };
const GEN2_RUN = { battery: true, lever2: true, n2_2: 60, gen2: true, start2: "GRD" };
export const SCENARIOS: Array<{ name: string; ov: Record<string, any> }> = [
  { name: "drain_heater1_cold", ov: { ...GEN2_RUN, drainHeater1TempC: 10 } },
  { name: "drain_heater1_hot", ov: { ...GEN2_RUN, drainHeater1TempC: 25 } },
  { name: "drain_mast_air_in_flight_on_gen1", ov: { ...GEN1_RUN, wow: false } },
  { name: "drain_mast_ground_wow_ac28", ov: { ...GEN2_RUN, wow: true } },
  { name: "alpha_vane_left_heated", ov: { ...GEN1_RUN, probeHeatAlphaL: true } },
  { name: "alpha_vane_left_failed", ov: { ...GEN1_RUN, probeHeatAlphaL: true, faults: { alphaVaneHeatFailureL: true } } },
  { name: "standby_auto_normal_transfer_bus1", ov: { ...GEN1_RUN, standbyPower: "AUTO" } },
  { name: "standby_auto_no_gen_inverter", ov: { battery: true, standbyPower: "AUTO" } },
  { name: "standby_bat_inverter", ov: { battery: true, standbyPower: "BAT" } },
  { name: "standby_inverter_failed", ov: { battery: true, standbyPower: "BAT", faults: { staticInverterFailure: true } } },
  { name: "ground_service_on_ext_power", ov: { battery: true, externalPowerConnected: true, groundPowerOn: true, groundServiceOn: true } },
  { name: "ground_service_on_gen1", ov: { ...GEN1_RUN, groundServiceOn: true } },
  { name: "charger_fed_from_bus2_transfer", ov: { ...GEN2_RUN } },
  { name: "door_aft_open_leak_flag", ov: { battery: true, doorPositions: { aftEntry: true } } },
];
