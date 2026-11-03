// Antiskid and autobrake section of derive.ts (ATA 32): antiskid channel operation, autobrake arming,
// landing and RTO activation, thrust/pedal disarm, brake pressure command.
// Only fields that derive() returns are listed; TS locals (throttlesIdle, rtoActive, ...) are not observable.
export const FIELDS = [
  "antiskidOperational", "antiskidInbdOperational", "antiskidOutbdOperational", "autobrakeTestPassed",
  "autobrakeArmed", "autobrakeActive", "autobrakeDisarm", "autobrakePressure", "antiskidModulating",
];
const DN = { gear: "DN", antiskidInbd: true, antiskidOutbd: true };
const LANDING = { battery: true, hydAPress: 3000, hydBPress: 3000, autobrake: 2, autobrakeTestTimer: 3, speedBrake: "ARMED", throttle1: 0, throttle2: 0, wow: true, groundSpeedKt: 70 };
export const SCENARIOS: Array<{ name: string; ov: Record<string, any> }> = [
  { name: "autobrake_off_default", ov: { battery: true } },
  { name: "antiskid_both_channels", ov: { battery: true, ...DN } },
  { name: "gear_up_disables_antiskid", ov: { battery: true, antiskidInbd: true, antiskidOutbd: true, gear: "UP" } },
  { name: "inbd_antiskid_cb_open", ov: { battery: true, ...DN, circuitBreakers: { "antiskid-inbd": false } } },
  { name: "landing_autobrake_active", ov: { ...LANDING, ...DN } },
  { name: "landing_thrust_advanced_disarm", ov: { ...LANDING, ...DN, throttle1: 0.5 } },
  { name: "landing_hyd_low_disarm", ov: { ...LANDING, ...DN, hydAPress: 1000 } },
  { name: "landing_pedal_override", ov: { ...LANDING, ...DN, leftBrakePedal: 0.5 } },
  { name: "landing_disarmed_latched", ov: { ...LANDING, ...DN, autobrakeLandingDisarmed: true } },
  { name: "rto_armed_stopped_fast", ov: { ...LANDING, ...DN, autobrake: 4, autobrakeRtoArmed: true, groundSpeedKt: 95 } },
  { name: "landing_autobrake_max_pressure", ov: { ...LANDING, ...DN, autobrake: 3 } },
];
