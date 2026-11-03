// Step sequences for stepDmeChannel (dmeModel.ts). Each step: mode 0 STBY/1 NORM/2 ORIDE, geom nm or null, dAlt ft, dt s.
const S = (mode: number, geom: number | null, dt: number, o: any = {}) =>
  ({ mode, geom, dAlt: o.dAlt ?? 0, dt, test: o.test ?? false, powered: o.powered ?? true });
export const CASES = [
  { name: "acquire_near_then_track", steps: [S(1, 10, 0.5), S(1, 10, 0.5), S(1, 10, 0.5), S(1, 10, 1.0), S(1, 10.2, 0.5)] },
  { name: "acquire_far_slower", steps: [S(1, 150, 1.0), S(1, 150, 1.0), S(1, 150, 1.0), S(1, 150, 1.0), S(1, 150, 1.0)] },
  { name: "slant_range_with_altitude", steps: [S(1, 5, 2.0, { dAlt: 6076.12 }), S(1, 5, 2.0, { dAlt: 6076.12 }), S(1, 5, 2.0, { dAlt: 6076.12 })] },
  { name: "signal_lost_memory_hold", steps: [S(1, 20, 2.0), S(1, 20, 2.0), S(1, 20, 2.0), S(1, 20, 2.0), S(1, null, 2.0), S(1, null, 2.0), S(1, null, 5.0), S(1, null, 5.0)] },
  { name: "memory_expires", steps: [S(1, 20, 2.0), S(1, 20, 2.0), S(1, 20, 2.0), S(1, 20, 2.0), S(1, null, 6.0), S(1, null, 6.0), S(1, null, 6.0)] },
  { name: "over_range_norm_200_then_oride", steps: [S(1, 250, 2.0), S(2, 250, 2.0), S(2, 250, 2.0), S(2, 250, 2.0), S(2, 250, 2.0)] },
  { name: "standby_drops_lock", steps: [S(1, 10, 2.0), S(1, 10, 2.0), S(1, 10, 2.0), S(0, 10, 2.0)] },
  { name: "unpowered_dashes", steps: [S(1, 10, 2.0, { powered: false }), S(1, 10, 2.0, { powered: false })] },
  { name: "self_test", steps: [S(1, 50, 0.1, { test: true }), S(1, 50, 0.1, { test: true })] },
  { name: "negative_range_invalid", steps: [S(1, -1, 2.0), S(1, -1, 2.0)] },
];
