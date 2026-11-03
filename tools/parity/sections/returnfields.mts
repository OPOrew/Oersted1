// Return-object outputs from derive.ts: nose-wheel steering, brake source, wheel speeds/pressures,
// decel, control-surface authority, LE/speed-brake flags, engine oil/EPR, cabin temperatures,
// standby quantity and reservoir air (TS ~1178-1262, ~1401-1403, return object ~1552-1706).
export const FIELDS = [
  "noseWheelSteeringAvailable", "noseWheelSteeringAngle",
  "brakeSource.li", "brakeSource.lo", "brakeSource.ri", "brakeSource.ro",
  "wheelSpeeds.li", "wheelSpeeds.lo", "wheelSpeeds.ri", "wheelSpeeds.ro",
  "wheelBrakePressures.li", "wheelBrakePressures.lo", "wheelBrakePressures.ri", "wheelBrakePressures.ro",
  "targetDecel", "manualBrakeOverride", "actualDecel",
  "controlAuthority.elevator", "controlAuthority.aileron", "controlAuthority.rudder",
  "leExtended", "leTransit", "feelDiff", "speedBrakeArmed",
  "epr1", "epr2", "oilPressure1", "oilPressure2", "oilChipDetected1", "oilChipDetected2",
  "controlCabinTempF", "passengerCabinTempF",
  "hydAQty", "hydBQty", "hydSQty", "stbyOn", "reservoirPressurized", "reservoirGroundAir",
];
const DC = { battery: true };
const WHEELS = { li: 0, lo: 0, ri: 0, ro: 0 };
export const SCENARIOS: Array<{ name: string; ov: Record<string, any> }> = [
  { name: "quiet_default", ov: { ...DC } },
  { name: "nws_tiller_partial", ov: { ...DC, wow: true, hydAPress: 3000, tiller: 0.5, rudderPedal: 0.2 } },
  { name: "nws_tiller_full_clamp", ov: { ...DC, wow: true, hydAPress: 3000, tiller: 1, rudderPedal: 1 } },
  { name: "nws_no_wow", ov: { ...DC, wow: false, hydAPress: 3000, tiller: 0.5 } },
  { name: "brake_source_sys_a_only", ov: { ...DC, hydAPress: 3000, hydBPress: 0 } },
  { name: "brake_source_both", ov: { ...DC, hydAPress: 3000, hydBPress: 3000 } },
  { name: "autobrake_med_target", ov: { ...DC, autobrake: 3 } },
  { name: "autobrake_max_target", ov: { ...DC, autobrake: 4, actualDecel: 12.5 } },
  { name: "manual_brake_override", ov: { ...DC, leftBrakePedal: 0.5, wheelBrakePressures: { li: 1000, lo: 0, ri: 0, ro: 0 } } },
  { name: "wheel_pressures_no_pedal", ov: { ...DC, wheelBrakePressures: { ...WHEELS, li: 800 } } },
  { name: "le_extended", ov: { ...DC, lePos: 1 } },
  { name: "le_transit", ov: { ...DC, lePos: 0.5 } },
  { name: "speedbrake_armed", ov: { ...DC, speedBrake: "ARMED" } },
  { name: "rudder_authority_standby", ov: { ...DC, stbyHyd: "ON", hydSQty: 10 } },
  { name: "epr_idle_running", ov: { ...DC, lever1: true, n2_1: 60, n1_1: 32 } },
  { name: "epr_takeoff_both", ov: { ...DC, lever1: true, n2_1: 95, n1_1: 100, lever2: true, n2_2: 95, n1_2: 100 } },
  { name: "oil_low_chip", ov: { ...DC, oilPsi1: 10, faults: { oilChip1: true } } },
  { name: "cabin_temps_overridden", ov: { ...DC, controlCabinTempF: 80, passengerCabinTempF: 70 } },
  { name: "reservoir_ground_air", ov: { ...DC, hydReservoirAirConnected: true, wow: true, hydReservoirAirPsi: 40 } },
  { name: "standby_quantity_selected", ov: { ...DC, stbyHyd: "ON", hydSQty: 10 } },
];
