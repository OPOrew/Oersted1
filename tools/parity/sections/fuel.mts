// ATA 28 fuel feed section of derive.ts: boost pumps, center pumps, crossfeed, engine shutoff, feed pressure
// and source labels, low-pressure lights, scavenge flag.
export const FIELDS = [
  "fuelPump1FwdOn", "fuelPump1AftOn", "fuelPump2FwdOn", "fuelPump2AftOn", "fuelCenterPump1On", "fuelCenterPump2On",
  "fuelPump1On", "fuelPump2On", "fuelCenterPumpOn", "fuelPump1FwdLowPressure", "fuelCenterPump1LowPressure",
  "fuelShutoff1Open", "fuelShutoff2Open", "fuelFeedPressure1", "fuelFeedPressure2",
  "fuelFeedSource1", "fuelFeedSource2", "fuelLowPressure1", "fuelLowPressure2", "fuelCenterLowPressure",
  "fuelScavengeActive", "fuelQuantityIndicationPowered",
];
const GEN1_RUN = { battery: true, lever1: true, n2_1: 60, gen1: true, start1: "GRD" };
const BOTH_RUN = { battery: true, lever1: true, lever2: true, n2_1: 60, n2_2: 60, gen1: true, gen2: true, start1: "GRD", start2: "GRD" };
export const SCENARIOS: Array<{ name: string; ov: Record<string, any> }> = [
  { name: "pumps_off_suction", ov: { ...GEN1_RUN } },
  { name: "tank1_fwd_pump_on", ov: { ...GEN1_RUN, fuelPump1Fwd: true } },
  { name: "both_tanks_pumped_crossfeed", ov: { ...BOTH_RUN, fuelPump1Fwd: true, fuelPump2Fwd: true, fuelCrossfeed: true } },
  { name: "crossfeed_tank2_pump_only", ov: { ...BOTH_RUN, fuelPump2Fwd: true, fuelCrossfeed: true } },
  { name: "center_pump1_on", ov: { ...GEN1_RUN, fuelPumpCenter1: true, fuelTankCenter: 100 } },
  { name: "center_pump1_relay_tripped", ov: { ...GEN1_RUN, fuelPumpCenter1: true, fuelTankCenter: 100, fuelCenterPump1RelayTripped: true } },
  { name: "eng1_fire_shutoff", ov: { ...GEN1_RUN, fuelPump1Fwd: true, engine1FirePulled: true } },
  { name: "tank1_boost_pump_failed", ov: { ...GEN1_RUN, fuelPump1Fwd: true, faults: { fuelBoostPump1Fail: true } } },
  { name: "tank1_empty", ov: { ...GEN1_RUN, fuelTank1: 0 } },
  { name: "crossfeed_valve_failed", ov: { ...BOTH_RUN, fuelPump2Fwd: true, fuelCrossfeed: true, faults: { fuelCrossfeedValveFail: true } } },
  { name: "scavenge_center_pump_off", ov: { ...GEN1_RUN, fuelPump1Fwd: true, fuelScavengeTimer: 100, fuelTankCenter: 100 } },
  { name: "fuel_qty_dc_power", ov: { battery: true } },
];
