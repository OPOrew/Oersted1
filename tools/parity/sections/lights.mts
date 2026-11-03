// Lighting model from lib/sim/lights.ts, returned by derive() as `lights` and `lightComponents`.
// Each array element is compared as one "|"-joined line (see EXPR for the Kotlin side).
export const FIELDS = ["lights", "lightComponents"];
export const EXPR = {
  lights: "LightsDerive.lightLines(d.lights)",
  lightComponents: "LightsDerive.componentLines(d.lightComponents)",
};
const DC = { battery: true };
const DC_ON = { ...DC, dcBus1Powered: true };
export const SCENARIOS: Array<{ name: string; ov: Record<string, any> }> = [
  { name: "quiet_default", ov: { ...DC } },
  { name: "retractable_ext_lights_on", ov: { ...DC, ltRetL: "ON", ltRetR: "EXT", ltFixedL: true } },
  { name: "retractable_extended_no_power", ov: { ...DC, ltRetL: "EXT" } },
  { name: "strobe_steady_position", ov: { ...DC, ltPosition: "STROBE_STEADY", ltAntiCol: true } },
  { name: "emergency_armed_dc_lost", ov: { ...DC, ltEmergency: "ARMED" } },
  { name: "emergency_on", ov: { ...DC, ltEmergency: "ON", ltShieldEmer: true } },
  { name: "bulb_failed_landing", ov: { ...DC, ltFixedL: true, ltFail: "ldg-fix-l" } },
  { name: "cb_pulled_panel", ov: { ...DC, ltPanelOvhd: 0.5, ltPanelCapt: 1, ltCb: "PANEL LTS" } },
  { name: "master_dim_flight_deck", ov: { ...DC, ltMasterDim: "DIM", ltDome: "BRT", ltNoSmoking: "ON", ltStorm: true } },
  { name: "cabin_dim_and_signs_auto", ov: { ...DC, ltCabin: "DIM", ltNoSmoking: "AUTO", ltSeatBelt: "AUTO" } },
  { name: "exit_sign_emergency_fallback", ov: { ...DC, ltEmergency: "ON" } },
  { name: "test_mode_with_breakers_pulled", ov: { ...DC, ltTest: true, ltCb: "POSITION LTS|MAP LTS" } },
];
