// Scenario list for radioNav (radionav.ts). Each case: position, altitude, tuned kind, optional frequency, scene.
export const CASES = [
  { name: "rpll_ils_on_course_low", p: [-8, 0], alt: 1500, tuned: "ILS", freq: 109.1, scene: "RPLL06" },
  { name: "rpll_ils_wrong_freq", p: [-8, 0], alt: 1500, tuned: "ILS", freq: 110.0, scene: "RPLL06" },
  { name: "rpll_vor_overhead_ish", p: [0.5, -0.3], alt: 3000, tuned: "VOR", freq: 112.0, scene: "RPLL06" },
  { name: "rpll_vor_far", p: [60, 40], alt: 9000, tuned: "VOR", freq: 112.0, scene: "RPLL06" },
  { name: "rpll_vor_too_close", p: [0.5, -0.25], alt: 3000, tuned: "VOR", freq: 112.0, scene: "RPLL06" },
  { name: "rpll_ils_past_threshold", p: [0.5, 0.0], alt: 200, tuned: "ILS", freq: 109.1, scene: "RPLL06" },
  { name: "rpll_no_frequency_ils", p: [-6, 0.5], alt: 900, tuned: "ILS", freq: null, scene: "RPLL06" },
  { name: "wsss_ils_02l_final", p: [-6, -1], alt: 1200, tuned: "ILS", freq: "WSSS", scene: "WSSS02L" },
  { name: "wsss_ils_wrong_scene", p: [-6, -1], alt: 1200, tuned: "ILS", freq: 109.1, scene: "WSSS02L" },
  { name: "wsss_ils_beyond_range", p: [-30, -30], alt: 5000, tuned: "ILS", freq: "WSSS", scene: "WSSS02L" },
];
