// Scenario list for resolveLrra (lrra.ts). aglFt null means no radio altitude.
export const CASES = [
  { name: "both_channels_healthy", agl: 500, vs: 0, dc: true, cb1: true, cb2: true, f1: false, f2: false, dh1: 200, dh2: 200 },
  { name: "rounding_and_channel_bias", agl: 123.4, vs: 0, dc: true, cb1: true, cb2: true, f1: false, f2: false, dh1: 100, dh2: 100 },
  { name: "excessive_sink_rate_blanks", agl: 500, vs: -6500, dc: true, cb1: true, cb2: true, f1: false, f2: false, dh1: 200, dh2: 200 },
  { name: "above_2500_is_invalid", agl: 2600, vs: 0, dc: true, cb1: true, cb2: true, f1: false, f2: false, dh1: 200, dh2: 200 },
  { name: "boundary_2500_valid", agl: 2507, vs: 0, dc: true, cb1: true, cb2: true, f1: false, f2: false, dh1: 200, dh2: 200 },
  { name: "parked_clamped_to_zero", agl: 3, vs: 0, dc: true, cb1: true, cb2: true, f1: false, f2: false, dh1: 200, dh2: 200 },
  { name: "no_dc_power", agl: 500, vs: 0, dc: false, cb1: true, cb2: true, f1: false, f2: false, dh1: 200, dh2: 200 },
  { name: "channel1_breaker_out", agl: 500, vs: 0, dc: true, cb1: false, cb2: true, f1: false, f2: false, dh1: 200, dh2: 200 },
  { name: "channel2_failed", agl: 500, vs: 0, dc: true, cb1: true, cb2: true, f1: false, f2: true, dh1: 200, dh2: 200 },
  { name: "self_test_channel1", agl: 500, vs: 0, dc: true, cb1: true, cb2: true, f1: false, f2: false, dh1: 150, dh2: 50, t1: true },
  { name: "no_radio_altitude", agl: null, vs: 0, dc: true, cb1: true, cb2: true, f1: false, f2: false, dh1: 200, dh2: 200 },
  { name: "decision_height_light", agl: 150, vs: 0, dc: true, cb1: true, cb2: true, f1: false, f2: false, dh1: 200, dh2: 100 },
];
