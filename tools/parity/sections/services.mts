// Services section of derive.ts: recirc, fuel heat/filter icing, equipment cooling, yaw damper,
// oxygen, doors, CVR, interphone, ELT, rain repellent, generator-drive indications.
export const FIELDS = [
  "recircFanPowered", "recircAirflow", "fuelHeaterPowered", "fuelHeater2Powered",
  "fuelFilterDeltaP1Psi", "fuelFilterDeltaP2Psi", "fuelFilterIcing1", "fuelFilterIcing2",
  "fuelTempIndicationPowered", "fuelTempLow", "equipmentCoolingSupplyPowered", "equipmentCoolingExhaustPowered",
  "equipmentCoolingFlow", "equipmentCoolingOverheat", "yawDamperEffective", "oxygenPressureIndicated",
  "passengerOxygenDeployed", "doorWarning", "cvrPowered", "serviceInterphoneEffective", "serviceCallEffective",
  "eltTransmitting", "rainRepellentLActive", "rainRepellentRActive", "generatorDrive1LowOilPressure",
  "generatorDrive2LowOilPressure", "generatorDrive1HighOilTemp", "generatorDrive2HighOilTemp",
];
const GEN1_RUN = { battery: true, lever1: true, n2_1: 60, gen1: true, start1: "GRD" };
const GEN2_RUN = { battery: true, lever2: true, n2_2: 60, gen2: true, start2: "GRD" };
export const SCENARIOS: Array<{ name: string; ov: Record<string, any> }> = [
  { name: "recirc_on_with_ac", ov: { ...GEN1_RUN, recirc: true } },
  { name: "recirc_fan_failed", ov: { ...GEN1_RUN, recirc: true, faults: { recircFanFailure: true } } },
  { name: "fuel_heat1_on_bus1", ov: { ...GEN1_RUN, fuelHeat: true, fuelHeatElapsedSec: 10 } },
  { name: "fuel_heat1_no_dc_bus1", ov: { fuelHeat: true, fuelHeatElapsedSec: 10 } },
  { name: "fuel_heat1_timed_out", ov: { ...GEN1_RUN, fuelHeat: true, fuelHeatElapsedSec: 60 } },
  { name: "fuel_filter_iced_eng1", ov: { ...GEN1_RUN, fuelFilterIceFraction1: 1.0 } },
  { name: "fuel_temp_cold_ac28", ov: { ...GEN2_RUN, fuelTempC: -5 } },
  { name: "equip_cooling_alternate_supply", ov: { ...GEN1_RUN, equipSupply: "ALTERNATE", equipExhaust: "NORMAL" } },
  { name: "equip_bay_hot", ov: { ...GEN1_RUN, equipmentBayTempC: 50 } },
  { name: "yaw_damper_hyd_low", ov: { battery: true, yawDamper: true, hydBPress: 500 } },
  { name: "yaw_damper_hyd_ok", ov: { battery: true, yawDamper: true, hydBPress: 2950 } },
  { name: "oxygen_auto_deploy_high_alt", ov: { battery: true, passOxyAutoDeploy: true, psFlightAltFt: 20000, cabinDiff: 0 } },
  { name: "door_open_warning", ov: { battery: true, doorPositions: { fwdEntry: true } } },
  { name: "cvr_on_battery", ov: { battery: true } },
  { name: "cvr_failed", ov: { battery: true, faults: { cvrFailure: true } } },
  { name: "elt_arm_overrun", ov: { battery: true, eltMode: "ARM", rwyPhase: "OVERRUN" } },
  { name: "rain_repel_left_active", ov: { battery: true, rainRepelTimerL: 5 } },
  { name: "gen_drive1_low_oil", ov: { ...GEN1_RUN, genDriveOilPressure1Psi: 10 } },
  { name: "gen_drive1_hot", ov: { ...GEN1_RUN, genDriveOilTemp1C: 130 } },
  { name: "interphone_cabin_call", ov: { battery: true, serviceInterphoneOn: true, cabinCallActive: true } },
];
