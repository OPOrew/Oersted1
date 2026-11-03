// Inputs for situation.ts explain(). nav uses web NavData keys; the generator maps them to RadioNavData.
const base = {
  navOn: true, tuned: "VOR", navValid: true, selCrs: 90, selHdg: 90, apNav: 1, apHdgSw: 0, apAil: true, apElev: true, apPitch: 0, apWhy: "", vorDev: 0,
  nav: { vorValid: true, locValid: false, gsValid: false, radial: 270, locDev: 0, gsErr: 0, vorDist: 12.3, thrDist: 40 },
};
const sit = (o: any) => ({ x: 0, y: 0, hdg: 90, altFt: 3000, tasKt: 140, flying: true, latSub: "ON_COURSE", gsPhase: "OFF", gsCapT: 0, trail: [], ...o });
export const EXPLAIN_CASES = [
  { name: "not_airborne_empty", inp: { ...base, sit: sit({ flying: false, altFt: 0 }) } },
  { name: "autopilot_off_flying_with_reason", inp: { ...base, apAil: false, apElev: false, apWhy: "A/P disconnect: attitude gyro invalid", sit: sit({ latSub: "OFF" }) } },
  { name: "vor_intercept_amber", inp: { ...base, vorDev: 6, sit: sit({ latSub: "INTERCEPT", hdg: 60 }) } },
  { name: "vor_capture_green", inp: { ...base, vorDev: 1.5, sit: sit({ latSub: "CAPTURE", hdg: 84 }) } },
  { name: "vor_over_station", inp: { ...base, vorDev: 0.4, sit: sit({ latSub: "OVER_STATION" }) } },
  { name: "ils_track_with_gs", inp: { ...base, tuned: "ILS", apNav: 2, selCrs: 60, nav: { vorValid: false, locValid: true, gsValid: true, radial: 0, locDev: -0.8, gsErr: 0.3, vorDist: 0, thrDist: 6.2 }, sit: sit({ latSub: "ON_COURSE", gsPhase: "TRACK", hdg: 60, altFt: 1800 }) } },
  { name: "ils_wrong_course_warning", inp: { ...base, tuned: "ILS", apNav: 2, selCrs: 200, nav: { vorValid: false, locValid: true, gsValid: false, radial: 0, locDev: 2.0, gsErr: 0, vorDist: 0, thrDist: 14 }, sit: sit({ latSub: "CAPTURE", hdg: 60 }) } },
  { name: "gs_armed_no_signal", inp: { ...base, tuned: "ILS", apNav: 3, nav: { vorValid: false, locValid: true, gsValid: false, radial: 0, locDev: 0.2, gsErr: 0, vorDist: 0, thrDist: 9.5 }, sit: sit({ latSub: "CAPTURE", gsPhase: "ARMED", hdg: 60 }) } },
  { name: "gs_capture_counts", inp: { ...base, tuned: "ILS", apNav: 2, nav: { vorValid: false, locValid: true, gsValid: true, radial: 0, locDev: 0.1, gsErr: -0.9, vorDist: 0, thrDist: 6 }, sit: sit({ latSub: "CAPTURE", gsPhase: "CAPTURE", gsCapT: 4.6, hdg: 60, altFt: 1400.4 }) } },
  { name: "hdg_sel_turning", inp: { ...base, apNav: 0, apHdgSw: 2, selHdg: 120, sit: sit({ latSub: "OFF", hdg: 90 }) } },
  { name: "alt_hold_vertical", inp: { ...base, apNav: 0, apHdgSw: 1, apPitch: 2, sit: sit({ latSub: "OFF", altFt: 5000.6 }) } },
  { name: "nav_receiver_off", inp: { ...base, navOn: false, apNav: 1, sit: sit({ latSub: "OFF" }) } },
];
