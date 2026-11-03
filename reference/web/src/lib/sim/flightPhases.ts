import { create } from "zustand";
import { autoNext } from "@/lib/sim/autoPhases";
import { flightModePatch } from "@/components/panel/FlightModeControl";
import { readActiveFlightPlan, type ActiveFlightPlan } from "@/lib/sim/activeFlightPlan";
import { arrivalScene, departureRunwayHeadingMag, distanceNm, getLiveFlightGuidance, getLiveFlightNavigation, planRoutePoints, resetFlightNavigationForPlan } from "@/lib/sim/flightNavigation";
import { useMip } from "@/lib/sim/mipLocal";
import { INACTIVE_GUIDANCE, type GuidanceResult } from "@/lib/sim/planGuidance";
import { useSim, withSilentPatch } from "@/lib/sim/store";
import { tuneNav1 } from "@/lib/sim/navReceiver";

/**
 * Flight phases for the trainer. Loading a plan puts its values into the cockpit controls (runway heading and course, HDG SEL, PLAN NAV, transponder, flaps, takeoff speeds);
 * each phase button then arms what that phase needs and the pilot decides when to press the next one:
 *   TAKEOFF  - scripted ground roll to rotation, lift-off, gear up, level off at 1,500 ft above the field (flown by the phase controller)
 *   CLIMB    - PLAN NAV climbs to the planned cruise altitude, speed 250 kt below 10,000 ft
 *   CRUISE   - holds altitude, cruise speed from the plan
 *   DESCENT  - descends to the first approach fix altitude
 *   APPROACH - PLAN NAV vectors to the ILS, flaps 1 then 5, tunes the ILS and arms AUTO APP
 *   LAND     - gear down, flaps 15/30/40, final speed schedule, touchdown and rollout
 * This is a trainer aid, not an FMC: the 737-200 has no autothrottle, so thrust, flaps, gear and speed targets are set by this controller; vertical and lateral paths are flown by the
 * modeled autopilot through PLAN NAV, and the pilot can still take over at any time (HDG SEL, ALT HOLD, yoke CWS).
 */
export type Phase = "NO PLAN" | "READY" | "TAKEOFF" | "CLIMB" | "CRUISE" | "DESCENT" | "APPROACH" | "LAND" | "ROLLOUT" | "COMPLETE";
export const PHASE_BUTTONS = ["TAKEOFF", "CLIMB", "CRUISE", "DESCENT", "APPROACH", "LAND"] as const;
export type PhaseButton = (typeof PHASE_BUTTONS)[number];

export const FIELD_ELEV_FT: Record<string, number> = { RPLL: 75, WSSS: 22, WMKK: 69 };
/** Trainer takeoff speeds (flaps 5, about 100,000 lb); not a performance calculation. */
export const V_SPEEDS = { v1: 128, vr: 136, v2: 141 } as const;
const fieldElev = (icao: string) => FIELD_ELEV_FT[icao] ?? 0;
const ACCEL_ALT_AGL_FT = 1500;
const GEAR_UP_AGL_FT = 50; // gear up at a positive rate of climb, a few seconds after lift-off, so the gear never holds the aircraft in the take-off configuration
const LATERAL_NAV_AGL_FT = 400;
const TAKEOFF_CLIMB_STEP_FT = 450;
/** Climb rate at lift-off (fpm). Without a target above the aircraft and a positive rate the altitude integrator pins the aircraft at the lift-off altitude and it sits back on the runway. */
const LIFTOFF_VS_FPM = 600;
const LIFTOFF_MARGIN_KT = 5;
/** Trainer climb performance, not a performance calculation: gross weight is estimated from the fuel quantity (tanks are in %), temperature is a fixed hot-day deviation. */
const TRAINER_ISA_DEV_C = 15;
function climbPerformance(sim: Record<string, unknown>): { weightLb: number; factor: number } {
  const pct = (k: string) => Math.max(0, Math.min(100, Number(sim[k] ?? 100) || 0));
  const fuelFrac = (pct("fuelTank1") + pct("fuelTankCenter") + pct("fuelTank2")) / 300;
  const weightLb = Math.round((82000 + 38000 * fuelFrac) / 500) * 500; // 82,000 lb dry + payload ... 120,000 lb full
  const weightFactor = Math.max(0.8, Math.min(1.08, 1 - (weightLb - 100000) / 130000));
  const tempFactor = 1 - 0.0027 * TRAINER_ISA_DEV_C; // about 4% less climb rate at ISA+15
  return { weightLb, factor: weightFactor * tempFactor };
} // lift-off speed above VR; the ground-roll speed is capped at VR + 5

/** Configuration the controller commands in each phase (shown next to the live gear / flap / speedbrake state in the Flight Phases panel). */
export const PHASE_CONFIG: Record<Phase, string> = {
  "NO PLAN": "-",
  READY: "Gear DOWN · flaps 5 · speedbrake ARMED (parked, takeoff configuration)",
  TAKEOFF: "Flaps 5 · gear UP at positive rate (~50 ft) · speedbrake ARMED on the roll, then DOWN · clean-up at 1,500 ft",
  CLIMB: "Gear UP · flaps retract on the speed schedule (not below 800 ft) · speedbrake DOWN",
  CRUISE: "Gear UP · flaps 0 · speedbrake DOWN",
  DESCENT: "Gear UP · flaps 0 · speedbrake DOWN",
  APPROACH: "Flaps 0 / 1 / 5 by speed · gear DOWN once flaps 5 or within 15 NM of the runway · speedbrake DOWN",
  LAND: "Gear DOWN · flaps 15 → 30 → 40 · speedbrake ARMED",
  ROLLOUT: "Gear DOWN · flaps 40 · speedbrake UP (spoilers deployed)",
  COMPLETE: "Gear DOWN · stopped",
};
const GEAR_UP_PATCH = { gear: "UP", noseGearPos: 0, leftMainGearPos: 0, rightMainGearPos: 0 } as const;
const GEAR_DN_PATCH = { gear: "DN", noseGearPos: 1, leftMainGearPos: 1, rightMainGearPos: 1 } as const;
const MIN_FLAP_RETRACT_AGL_FT = 800;

export type ChecklistItem = { label: string; value: string };
type PhaseStore = {
  phase: Phase;
  since: number;
  checklist: ChecklistItem[];
  log: { t: number; text: string }[];
  hint: string;
  trail: { lat: number; lon: number }[];
  /** AUTO PHASES: TAKEOFF -> CLIMB -> CRUISE -> DESCENT -> APPROACH -> LAND advance by themselves (the buttons still work and can override) */
  auto: boolean;
};
export const usePhase = create<PhaseStore>(() => ({ phase: "NO PLAN", since: 0, checklist: [], log: [], hint: "Activate a flight plan to load it into the controls.", trail: [], auto: true }));
export const setAutoPhases = (auto: boolean) => usePhase.setState({ auto });

const say = (text: string) => usePhase.setState((s) => ({ log: [...s.log.slice(-29), { t: Date.now(), text }] }));
const setPhase = (phase: Phase, text?: string) => { usePhase.setState({ phase, since: Date.now() }); if (text) say(text); };
const patchSim = (p: Record<string, unknown>) => withSilentPatch(() => useSim.getState().patch(p as never));
/** patch only the keys that really change (avoids re-deriving the whole model five times a second for nothing) */
function patchChanged(p: Record<string, number | string | boolean>, tol = 0.25) {
  const cur = useSim.getState() as unknown as Record<string, unknown>;
  const diff: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) {
    const c = cur[k];
    if (typeof v === "number" && typeof c === "number" ? Math.abs(v - c) > tol : v !== c) diff[k] = v;
  }
  if (Object.keys(diff).length) patchSim(diff);
}

const tasFromCas = (casKt: number, altFt: number) => casKt * (1 + (altFt / 1000) * 0.016);
const casFromTas = (tasKt: number, altFt: number) => tasKt / (1 + (altFt / 1000) * 0.016);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Total planned route length in NM: departure, every waypoint, destination. Used for the 75 % automatic descent trigger. */
function totalRouteDistanceNm(plan: ActiveFlightPlan): number {
  const pts = planRoutePoints(plan);
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += distanceNm(pts[i - 1].latitude, pts[i - 1].longitude, pts[i].latitude, pts[i].longitude);
  return total;
}

/* ───────── plan → controls ───────── */

function groundReadyPatch(plan: ActiveFlightPlan) {
  const elev = fieldElev(plan.departure);
  // Explicit parked-on-ground preset only. Do NOT spread flightModePatch here:
  // that helper is the airborne trainer preset (wow off, 160 kt, gear up) and
  // any residual field from it can leave the aircraft airborne so the map moves
  // as soon as a flight plan is selected / loaded.
  return {
    battery: true,
    wow: true,
    airborneTest: false,
    groundSenseTest: false,
    // Engine/APU state is deliberately untouched when loading a route.
    // Start engines, configure bleed air, and bring generators/hydraulic pumps
    // online through their own cockpit controls.
    gear: "DN",
    noseGearPos: 1,
    leftMainGearPos: 1,
    rightMainGearPos: 1,
    fltCtrlA: true,
    fltCtrlB: true,
    spoilerA: true,
    spoilerB: true,
    hydServicingConnected: false,
    hydGroundPowerConnected: false,
    groundPneumaticConnected: false,
    groundPneumaticPsi: 0,
    externalPowerConnected: false,
    parkingBrake: false,
    hydAPress: 3000,
    hydBPress: 3000,
    flaps: 5,
    speedBrake: "ARMED",
    // takeoff brake configuration: both anti-skid channels ON and the autobrake selector on RTO (it arms itself above 90 kt with the throttles up)
    antiskidInbd: true,
    antiskidOutbd: true,
    autobrake: 4,
    throttle1: 0,
    throttle2: 0,
    groundSpeedKt: 0,
    psFlightCasKt: 0,
    psFlightTargetCasKt: 0,
    psGroundRoll: false,
    psFlightVsFpm: 0,
    psFlightAltFt: elev,
    psFlightTargetAltFt: elev,
    psFlightProgressive: true,
    yokePitch: 0,
    yokeRoll: 0,
    rudderPedal: 0,
    tiller: 0,
    // Clear runway-trainer state too: an old APPROACH scenario forces
    // airborneTest=true inside derive() on every tick, overriding READY.
    rwyPhase: "IDLE",
    rwyPosM: -1800,
    rwyAltFt: 0,
    rwyLatM: 0,
    rwyHdgDeg: 0,
    rwyTrackDeg: 0,
    rwyYawRate: 0,
    rwyNote: "",
    wheelSpeeds: { li: 0, lo: 0, ri: 0, ro: 0 },
    wheelBrakePressures: { li: 0, lo: 0, ri: 0, ro: 0 },
    actualDecel: 0,
  };
}

/** Load the active flight plan into the cockpit controls and move to READY. Returns false when there is no active plan. */
export function loadPlanIntoControls(): boolean {
  const plan = readActiveFlightPlan();
  if (!plan) { say("No active flight plan. Activate one on the Flight Plan page first."); return false; }
  // Loading ALWAYS parks the aircraft on the departure runway: stopped, on the ground, autopilot off, position back at the threshold.
  // Nothing moves until the pilot presses TAKEOFF. (Previously an airborne aircraft skipped this and kept flying, and the TAKEOFF button stayed disabled.)
  resetFlightNavigationForPlan(plan);
  roll.gs = 0; roll.t = 0; vsCmd = 0; gearDownDone = false;
  const rwyHdg = departureRunwayHeadingMag(plan);
  const mip = useMip.getState();
  const elev = fieldElev(plan.departure);
  const items: ChecklistItem[] = [];

  patchSim(groundReadyPatch(plan));
  items.push({ label: "Gear · flaps · speedbrake", value: "DOWN · 5 · ARMED" }, { label: "Anti-skid · autobrake", value: "INBD ON · OUTBD ON · RTO (arms above 90 kt: needs DC power and hydraulic A/B above 1,500 psi)" });
  const perf0 = climbPerformance(useSim.getState() as unknown as Record<string, unknown>);
  items.push({ label: "Climb performance (trainer)", value: `about ${perf0.weightLb.toLocaleString("en-US")} lb · ISA+${TRAINER_ISA_DEV_C} · climb rate ×${perf0.factor.toFixed(2)}` });

  // PLAN NAV is ARMED on load but cannot steer or move anything: the READY phase blocks its guidance and the autopilot axes stay off until TAKEOFF.
  const mipPatch: Record<string, unknown> = { planNav: true, planNavStatus: "ARMED - WAITING FOR TAKEOFF", apAil: false, apElev: false, apNav: 0, apHdgSw: 0, fdMode: 2, xpdrMode: 2, apWarn: false, apWhy: "", navResetN: mip.navResetN + 1 };
  if (rwyHdg != null) {
    const h = Math.round(rwyHdg);
    Object.assign(mipPatch, { selHdg: h, selCrs: h, attHdgReq: { n: mip.attHdgReq.n + 1, hdg: rwyHdg } });
    items.push({ label: `RWY ${plan.departureRunway} heading / course`, value: `${String(h).padStart(3, "0")}° M (HDG SEL bug and course set)` });
  } else items.push({ label: "Runway heading", value: `RWY ${plan.departureRunway} not in nav data - set heading manually` });
  useMip.setState(mipPatch);
  items.push({ label: "PLAN NAV", value: "ARMED - no movement until TAKEOFF" }, { label: "Flight director", value: "HDG" }, { label: "Transponder", value: "ALT ON" });
  items.push({ label: "Cruise altitude / speed", value: `${plan.cruiseAltitudeFt.toLocaleString("en-US")} ft · ${plan.cruiseSpeedKt} kt` });
  items.push({ label: "Takeoff speeds (trainer)", value: `V1 ${V_SPEEDS.v1} · VR ${V_SPEEDS.vr} · V2 ${V_SPEEDS.v2}` });
  if (plan.ils && !plan.arrival) items.push({ label: `ILS ${plan.ils.ident} ${plan.ils.airport} RWY ${plan.ils.runway}`, value: `${plan.ils.frequencyMHz.toFixed(2)} MHz · course ${String(Math.round(plan.ils.courseMag)).padStart(3, "0")}° - selected in the Flight Plan; the Navigation map tunes it as the last radio target` });
  if (plan.arrival) items.push({ label: `ILS ${plan.arrival.airport} RWY ${plan.arrival.runway}`, value: `${plan.arrival.ilsFrequencyMHz.toFixed(2)} MHz · course ${String(Math.round(plan.arrival.courseMag)).padStart(3, "0")}° - tuned automatically on APPROACH` });
  items.push({ label: "Route", value: `${plan.departure} → ${plan.waypoints.length} waypoint${plan.waypoints.length === 1 ? "" : "s"} → ${plan.destination}` });

  usePhase.setState({ checklist: items, trail: [], hint: "Flight plan loaded. Engine/APU state unchanged; start and configure the aircraft manually. Press TAKEOFF only when ready to depart." });
  setPhase("READY", `Plan ${plan.callsign || `${plan.departure}-${plan.destination}`} loaded into controls${elev ? ` (field elevation ${elev} ft)` : ""}.`);
  ensureFlightPhaseController();
  return true;
}

/**
 * Ready for departure: put the phase machine back to READY and the aircraft back at the threshold without touching the systems preset.
 * Without this, a TAKEOFF phase left over from an earlier flight would start the ground roll again as soon as the aircraft is back on the ground.
 */
export function parkAtDeparture(): void {
  roll.gs = 0; roll.t = 0; vsCmd = 0; gearDownDone = false;
  const plan = activePlan();
  const phase = usePhase.getState().phase;
  const elev = plan ? fieldElev(plan.departure) : 0;

  // Enforce the parked physical state even if this is called after a previous
  // airborne/landing exercise. In particular, do not rely only on changing the
  // phase label: other trainers share the same SimState and may leave runway
  // or airborne-test flags active.
  useSim.setState({
    wow: true, airborneTest: false, groundSenseTest: false,
    gear: "DN", noseGearPos: 1, leftMainGearPos: 1, rightMainGearPos: 1,
    groundSpeedKt: 0, psFlightCasKt: 0, psFlightTargetCasKt: 0, psFlightVsFpm: 0, psGroundRoll: false,
    psFlightAltFt: elev, psFlightTargetAltFt: elev, psFlightProgressive: true,
    rwyPhase: "IDLE", rwyPosM: -1800, rwyAltFt: 0, rwyLatM: 0,
    rwyHdgDeg: 0, rwyTrackDeg: 0, rwyYawRate: 0, rwyNote: "",
    wheelSpeeds: { li: 0, lo: 0, ri: 0, ro: 0 },
    wheelBrakePressures: { li: 0, lo: 0, ri: 0, ro: 0 }, actualDecel: 0,
  });
  if (!plan || phase === "NO PLAN") return;

  resetFlightNavigationForPlan(plan);
  const mip = useMip.getState();
  const rwyHdg = departureRunwayHeadingMag(plan);
  const mipPatch: Record<string, unknown> = {
    planNav: true, planNavStatus: "ARMED - WAITING FOR TAKEOFF",
    apAil: false, apElev: false, apNav: 0, apHdgSw: 0,
    navResetN: mip.navResetN + 1,
  };
  if (rwyHdg != null) {
    const h = Math.round(rwyHdg);
    Object.assign(mipPatch, { selHdg: h, selCrs: h, attHdgReq: { n: mip.attHdgReq.n + 1, hdg: rwyHdg } });
  }
  useMip.setState(mipPatch);
  usePhase.setState({ trail: [], hint: "Aircraft parked and lined up. PLAN NAV armed. Press TAKEOFF to start moving." });
  setPhase("READY", "Ready for departure - parked, waiting for TAKEOFF.");
}

/* ───────── phase gating of PLAN NAV guidance ───────── */

const activePlan = () => readActiveFlightPlan();
/** Altitude the descent should level at: the first vector fix, else the plan's approach altitude, else 3,000 ft. */
function descentTargetFt(plan: ActiveFlightPlan): number {
  const fix = plan.arrival ? plan.waypoints.find((w) => w.name === plan.arrival!.firstFixName) : undefined;
  if (fix && fix.altitudeFt > 0) return fix.altitudeFt;
  return 3000;
}

/** Called by the instrument-panel model each tick: PLAN NAV only does what the pressed phase allows. */
export function applyPhaseToGuidance(g: GuidanceResult, altFt: number): GuidanceResult {
  const phase = usePhase.getState().phase;
  const plan = activePlan();
  if (!g.active || !plan) return g;
  switch (phase) {
    case "NO PLAN": case "READY": case "ROLLOUT": case "COMPLETE":
      return { ...INACTIVE_GUIDANCE, note: phase === "READY" ? "READY - press TAKEOFF" : "NO PLAN GUIDANCE" };
    case "TAKEOFF": {
      const elev = fieldElev(plan.departure);
      const rwy = departureRunwayHeadingMag(plan);
      const straight = rwy != null && altFt - elev < LATERAL_NAV_AGL_FT;
      // Slow initial climb: command a target only ~450 ft above the aircraft (about 650 fpm), capped at 1,500 ft AGL. The full climb rate comes with CLIMB.
      const stepTarget = Math.min(elev + ACCEL_ALT_AGL_FT, Math.max(altFt, elev) + TAKEOFF_CLIMB_STEP_FT);
      return { ...g, targetAltFt: stepTarget, vertMode: "CLIMB", ilsArm: false, inVectors: false, speedAdvisoryKt: V_SPEEDS.v2 + 15, note: `TAKEOFF - slow climb to ${elev + ACCEL_ALT_AGL_FT} FT`,
        ...(straight ? { headingMagCmdDeg: rwy, headingTrueCmdDeg: null } : {}) };
    }
    case "CLIMB":
      return { ...g, targetAltFt: plan.cruiseAltitudeFt, vertMode: "CLIMB", ilsArm: false, inVectors: false, note: `CLIMB to ${plan.cruiseAltitudeFt} FT` };
    case "CRUISE": {
      const level = Math.abs(altFt - plan.cruiseAltitudeFt) < 500 ? plan.cruiseAltitudeFt : Math.round(altFt / 100) * 100;
      return { ...g, targetAltFt: level, vertMode: "CRUISE", ilsArm: false, inVectors: false, note: `CRUISE ${level} FT` };
    }
    case "DESCENT": {
      const tgt = descentTargetFt(plan);
      return { ...g, targetAltFt: tgt, vertMode: "DESCENT", ilsArm: false, note: `DESCENT to ${tgt} FT` };
    }
    case "APPROACH": case "LAND": {
      if (g.inVectors || phase === "LAND") return g;
      const tgt = descentTargetFt(plan);
      return { ...g, targetAltFt: tgt, vertMode: "DESCENT", ilsArm: false, note: `APPROACH - descend to ${tgt} FT` };
    }
    default:
      return g;
  }
}

/* ───────── controller ───────── */

const roll = { gs: 0, t: 0 };
/** Takeoff-roll acceleration at full thrust (kt/s at zero speed) and its fall-off with speed. */
const ROLL_ACCEL_KT_S = 7.2; // ~24 s from brake release to Vr at takeoff thrust (the old 5.4 took ~35 s and felt "very delayed")
const ROLL_DRAG_PER_KT = 0.0165;
let timer: number | undefined;
let lastTick = 0;
let trailT = 0;
let gearDownDone = false;
let climbThrustCalled = false;
let vsCmd = 0; // commanded vertical speed (fpm) of the controller-flown profile

export function ensureFlightPhaseController() {
  if (typeof window === "undefined" || timer !== undefined) return;
  lastTick = performance.now();
  timer = window.setInterval(controllerTick, 200);
}
export function stopFlightPhaseController() {
  if (timer !== undefined) { window.clearInterval(timer); timer = undefined; }
}

function cruiseCasKt(plan: ActiveFlightPlan, altFt: number) {
  return clamp(casFromTas(plan.cruiseSpeedKt || 430, altFt), 200, 300);
}

/** Move the thrust levers like a hand would (about 0.3 of full travel per second) instead of snapping to the next phase setting. */
function slewThrottle(cur: number, target: number, dt: number): number {
  const step = 0.3 * dt;
  return Math.abs(target - cur) <= step ? target : cur + Math.sign(target - cur) * step;
}

function throttleFor(phase: Phase, agl = 0): number {
  switch (phase) {
    case "TAKEOFF": return agl >= ACCEL_ALT_AGL_FT - 200 ? 0.88 : 1; // climb thrust once the acceleration altitude is reached
    case "CLIMB": return 0.88;
    case "CRUISE": return 0.72;
    case "DESCENT": return 0.3;
    case "APPROACH": return 0.5;
    case "LAND": return 0.45;
    default: return 0;
  }
}

/** While AUTO PHASES is on the hints say the next phase starts by itself instead of asking the trainee to press it. */
function autoHint() {
  const s = usePhase.getState();
  if (!s.auto) return;
  const h = s.hint.replace(/[Pp]ress (CLIMB|CRUISE|DESCENT|APPROACH|LAND)( when clean)?\.?/g, (_m, p: string) => `${p} starts automatically.`);
  if (h !== s.hint) usePhase.setState({ hint: h });
}

/**
 * Mirror what the program is commanding onto the real controls, so the cockpit shows what is being flown (nothing here steers the aircraft by itself):
 *  - glareshield HDG SEL bug follows the commanded heading (left alone once the pilot engages AIL);
 *  - glareshield pitch-mode knob sits at ALT HOLD in CRUISE and returns to OFF afterwards (left alone once the pilot engages ELEV or moves the knob);
 *  - glareshield COURSE and the pedestal NAV 1 radio take the arrival ILS course / frequency on APPROACH and LAND.
 * The throttle levers, flap lever, gear lever and speedbrake lever are moved by the controller's own aircraft-state patches.
 */
let altHoldSetByProgram = false;
let ilsTunedFor = "";
function mirrorToControls(phase: Phase, plan: ActiveFlightPlan, guide: GuidanceResult): void {
  const mip = useMip.getState();
  const patch: Record<string, unknown> = {};
  if (!mip.apAil && guide.headingMagCmdDeg != null) {
    const h = Math.round(((guide.headingMagCmdDeg % 360) + 360) % 360) % 360;
    if (mip.selHdg !== h) patch.selHdg = h;
  }
  if (!mip.apElev) {
    if (phase === "CRUISE" && mip.apPitch === 1) { patch.apPitch = 2; altHoldSetByProgram = true; }
    else if (phase !== "CRUISE" && altHoldSetByProgram && mip.apPitch === 2) { patch.apPitch = 1; altHoldSetByProgram = false; }
  }
  if ((phase === "APPROACH" || phase === "LAND") && plan.arrival) {
    const crs = Math.round(plan.arrival.courseMag);
    if (mip.selCrs !== crs) patch.selCrs = crs;
    const key = `${plan.activatedAt}:${plan.arrival.ilsFrequencyMHz}`;
    if (ilsTunedFor !== key) {
      ilsTunedFor = key;
      tuneNav1(plan.arrival.ilsFrequencyMHz, { powerOn: true, source: "plan" });
      if (!mip.navOn) patch.navOn = true;
    }
  }
  if (Object.keys(patch).length) useMip.setState(patch);
}

function controllerTick() {
  const now = performance.now();
  const dt = Math.min(2, (now - lastTick) / 1000); // real elapsed time (a busy phone delays the timer; do not drop that time)
  lastTick = now;
  const st = usePhase.getState();
  const phase = st.phase;
  const plan = activePlan();
  const sim = useSim.getState();
  const nav = getLiveFlightNavigation();
  if (!plan || phase === "NO PLAN") return;

  // route trail for the map
  trailT += dt;
  if (nav && trailT >= 2 && nav.positionMode !== "NO GEOGRAPHIC REFERENCE" && (!sim.wow || nav.groundSpeedKt > 1)) {
    trailT = 0;
    usePhase.setState((s) => ({ trail: [...s.trail.slice(-499), { lat: nav.latitude, lon: nav.longitude }] }));
  }
  if (phase === "READY" || phase === "COMPLETE") return;

  const elev = fieldElev(plan.departure);
  const altFt = Number(sim.psFlightAltFt ?? 0);
  const airborne = !sim.wow;
  const mip = useMip.getState();
  const guide = getLiveFlightGuidance();

  /* ground roll */
  if (phase === "TAKEOFF" && sim.wow) {
    /* Thrust levers are advanced by the "pilot" over ~2 s, then the aircraft accelerates on the thrust the engines
     * REALLY produce (N1 from the spool model), so the roll follows the engine response: a short lag, then a brisk
     * push that tapers with drag. a = thrust * (A0 - DRAG * gs) -> ~35 s from brake release to Vr at full N1. */
    roll.t += dt;
    /* Takeoff thrust is set promptly: the levers go straight to full over ~1 s (no 2 s pause at 55%). */
    const lever = Math.min(1, roll.t / 1.0);
    const n1Avg = (Number(sim.n1_1 ?? 0) + Number(sim.n1_2 ?? 0)) / 2;
    const enginesRunning = n1Avg > 25;
    // integrate in <=0.1 s sub-steps so a late timer tick still gives the same roll as a punctual one
    const t0 = roll.t - dt;
    for (let rem = dt, k = 0; rem > 1e-6 && k < 40; k++) {
      const h = Math.min(0.1, rem); rem -= h;
      const tt = t0 + (dt - rem);
      /* Thrust follows the lever through a short (~1.2 s) lag, so full throttle means full power almost at once. The real N1 spool
       * (idle -> takeoff in a few seconds) still shows on the engine gauges but no longer holds the aircraft back. */
      const leverNow = Math.min(1, tt / 1.0);
      const thrustFrac = enginesRunning ? clamp(Math.max((n1Avg - 32) / 60, leverNow * (1 - Math.exp(-tt / 0.6))), 0, 1) : Math.min(1, tt / 1.5); // un-started trainer: scripted spool-up
      roll.gs = Math.min(V_SPEEDS.vr + 5, roll.gs + Math.max(0, thrustFrac * (ROLL_ACCEL_KT_S - ROLL_DRAG_PER_KT * roll.gs)) * h);
    }
    /* The airspeed indicator reads the roll speed too (no wind): before this it sat at 0 on the ground and jumped to the lift-off speed. */
    patchChanged({ groundSpeedKt: Math.round(roll.gs * 4) / 4, psFlightCasKt: Math.round(roll.gs * 2) / 2, psFlightTargetCasKt: Math.round(roll.gs * 2) / 2, psGroundRoll: true, throttle1: lever, throttle2: lever, speedBrake: "ARMED" }, 0.2);
    /* Rotation starts at VR; the aircraft leaves the ground a few knots later (about 3 s of rotation), so the nose is already up at lift-off. */
    if (roll.gs >= V_SPEEDS.vr + LIFTOFF_MARGIN_KT) {
      const cas = V_SPEEDS.vr + LIFTOFF_MARGIN_KT;
      /* flightModePatch is the generic "start airborne" preset: it forces both cores to N2 70 and the start levers on. Applied at lift-off
       * that made N2 (and with it the engine sound pitch, EGT, fuel flow) jump from wherever the engines really were. Keep the REAL engine
       * state when the engines are running; only an un-started trainer gets the preset, at idle N2 so it spools up smoothly. */
      const fm = flightModePatch(elev + 15);
      if (enginesRunning) { delete fm.n2_1; delete fm.n2_2; delete fm.lever1; delete fm.lever2; } else { fm.n2_1 = 57; fm.n2_2 = 57; }
      patchSim({ ...fm, autobrake: 0, gear: "DN", noseGearPos: 1, leftMainGearPos: 1, rightMainGearPos: 1, flaps: 5, groundSpeedKt: tasFromCas(cas, elev), psFlightCasKt: cas, psFlightTargetCasKt: V_SPEEDS.v2 + 15, psGroundRoll: false, psFlightProgressive: true, psFlightAltFt: elev + 15, psFlightTargetAltFt: elev + 15 + TAKEOFF_CLIMB_STEP_FT, psFlightVsFpm: LIFTOFF_VS_FPM, throttle1: 1, throttle2: 1 });
      climbThrustCalled = false;
      vsCmd = LIFTOFF_VS_FPM; // the rotation already gives a positive rate; the controller builds on it instead of starting from zero
      useMip.setState({ apAil: false, apElev: false, apNav: 0, fdMode: 2 });
      say(`Rotate at ${V_SPEEDS.vr} kt - lift-off. Flown by the phase controller (autopilot not engaged).`);
      usePhase.setState({ hint: "Airborne. Gear up at positive rate; press CLIMB when clean." });
      autoHint();
    }
    return;
  }
  if (!airborne) {
    if (phase === "ROLLOUT") rollout(dt);
    return;
  }

  const agl = altFt - elev;
  const cas = Number(sim.psFlightCasKt ?? 0);
  const distThr = nav?.distanceToDestinationNm ?? 99;
  const toDestinationElev = fieldElev(plan.destination);
  // Automatically begin descent after approximately 75% of the route is covered.
  // Do not trigger while READY, TAKEOFF, or CLIMB: the pilot must explicitly select
  // CLIMB and CRUISE before the cruise-to-descent transition is allowed.
  const routeNm = totalRouteDistanceNm(plan);
  if (phase === "CRUISE" && routeNm > 1 && nav?.distanceToDestinationNm != null && nav.distanceToDestinationNm <= routeNm * 0.25) {
    setPhase("DESCENT", "Automatic descent initiated at approximately 75% route progress.");
    usePhase.setState({ hint: "Route progress 75% or greater. Beginning gradual descent to the approach altitude." });
  }
  const scene = arrivalScene(plan);

  if (st.auto && Date.now() - st.since > 4000) {
    const next = autoNext(phase, plan, {
      agl, altFt, distThr, descentTgtFt: descentTargetFt(plan), gearUp: sim.gear === "UP", locCaptured: !!scene && (mip.nav.locValid || distThr <= 10), /* no autopilot LOC capture needed: the controller flies the final */ inVectors: !!guide.inVectors,
      todReached: guide.distToTodNm != null && guide.distToTodNm <= 0,
    });
    if (next && canStart(next).ok) { startPhase(next); say(`AUTO PHASES: ${phase} complete, ${next} started.`); return; }
  }

  /* speed, thrust, configuration per phase */
  let targetCas = cas;
  let flaps = Number(sim.flaps);
  /* Acceleration segment: at about 1,500 ft the climb levels off (reduced rate, then level) while the speed builds and the flaps retract on the schedule
   * (5 -> 1 at 165 kt, 1 -> up at 180 kt); the normal climb resumes once clean at 190 kt. */
  const accelHold = phase === "CLIMB" && agl < ACCEL_ALT_AGL_FT + 300 && (Number(sim.flaps) > 0 || cas < 190);
  switch (phase) {
    case "TAKEOFF":
      targetCas = V_SPEEDS.v2 + 15;
      if (agl >= ACCEL_ALT_AGL_FT - 200 && !climbThrustCalled) { climbThrustCalled = true; say("Acceleration altitude - climb thrust."); }
      if (agl >= ACCEL_ALT_AGL_FT - 200) { targetCas = 220; flaps = cas >= 180 ? 0 : cas >= 165 ? 1 : 5; usePhase.setState({ hint: "Level acceleration at 1,500 ft, flaps retracting. Press CLIMB." }); }
      break;
    case "CLIMB":
      targetCas = altFt < 10000 ? 250 : Math.min(cruiseCasKt(plan, altFt) + 5, 290);
      // never retract flaps close to the ground, even if the pilot pressed CLIMB early
      if (agl >= MIN_FLAP_RETRACT_AGL_FT) flaps = cas >= 180 ? 0 : cas >= 165 ? 1 : flaps;
      if (accelHold) usePhase.setState({ hint: `Level acceleration at ${(elev + ACCEL_ALT_AGL_FT).toLocaleString("en-US")} ft - flaps retract on the speed schedule, then the climb resumes.` });
      else if (Math.abs(altFt - plan.cruiseAltitudeFt) < 300) usePhase.setState({ hint: "At cruise altitude. Press CRUISE." }); else usePhase.setState({ hint: `Climbing to ${plan.cruiseAltitudeFt.toLocaleString("en-US")} ft.` });
      break;
    case "CRUISE":
      targetCas = cruiseCasKt(plan, altFt);
      flaps = 0;
      usePhase.setState({ hint: guide.distToTodNm != null && guide.distToTodNm <= 0 ? "Top of descent. Press DESCENT." : guide.distToTodNm != null ? `Cruise. Top of descent in ${Math.max(0, guide.distToTodNm).toFixed(0)} NM.` : "Cruise." });
      break;
    case "DESCENT": {
      targetCas = altFt > 10000 ? 280 : 250;
      flaps = 0;
      const tgt = descentTargetFt(plan);
      usePhase.setState({ hint: altFt - tgt < 400 ? "Level at the approach altitude. Press APPROACH." : `Descending to ${tgt.toLocaleString("en-US")} ft.${guide.inVectors ? " Vectors started - press APPROACH." : ""}` });
      break;
    }
    case "APPROACH": {
      targetCas = guide.speedAdvisoryKt ?? (altFt < 10000 ? 210 : 250);
      targetCas = clamp(targetCas, 140, 250);
      flaps = targetCas <= 190 ? 5 : targetCas <= 220 ? 1 : 0;
      // landing configuration: gear comes down once flaps 5 is selected or the runway is within 15 NM
      if (sim.gear !== "DN" && (flaps >= 5 || (scene && distThr <= 15))) { patchSim({ ...GEAR_DN_PATCH }); say("Approach configuration - gear down."); }
      usePhase.setState({ hint: !scene ? "No ILS in this plan - fly the descent with PLAN NAV; LAND needs the vectored ILS arrival." : mip.nav.locValid ? (mip.apNav >= 1 ? "Localizer captured. Press LAND." : "Localizer alive. Press LAND.") : guide.ilsArm ? "Intercepting - ILS tuned." : "Vectors to the ILS." });
      break;
    }
    case "LAND":
      targetCas = distThr > 8 ? 160 : distThr > 4 ? 150 : 142;
      flaps = distThr > 12 ? 15 : distThr > 5 ? 30 : 40;
      if (!gearDownDone) { gearDownDone = true; patchSim({ gear: "DN", noseGearPos: 1, leftMainGearPos: 1, rightMainGearPos: 1, speedBrake: "ARMED" }); say("Gear down, speedbrake armed."); }
      usePhase.setState({ hint: `Final approach, ${distThr.toFixed(1)} NM to the threshold. ${mip.apNav >= 2 ? "Localizer / glide slope tracking." : "Waiting for LOC / GS capture."}` });
      if (altFt <= toDestinationElev + 18 || (scene && distThr < 0.12 && altFt < toDestinationElev + 150)) { touchdown(plan, cas, altFt); return; }
      break;
    default:
      break;
  }

  /* gear and speedbrake follow the phase so the cockpit always shows the real configuration */
  if (phase === "TAKEOFF" || phase === "CLIMB" || phase === "CRUISE" || phase === "DESCENT") {
    if (agl > GEAR_UP_AGL_FT && vsCmd > 150 && sim.gear !== "UP") { patchSim({ ...GEAR_UP_PATCH }); say("Positive rate - gear up."); }
  }
  const sbWanted = phase === "LAND" ? "ARMED" : "DOWN";
  if (sim.speedBrake !== sbWanted) patchSim({ speedBrake: sbWanted });

  /* Hand-flying by the phase buttons. TAKEOFF / CLIMB / CRUISE / DESCENT / APPROACH / LAND fly the aircraft themselves, the way a pilot would,
   * instead of relying on the autopilot of the main instrument panel (which only runs while that panel is on screen):
   *  - vertical: a rate-of-climb command that builds like a rotation (~700 fpm per second), limited per phase, flattening onto the target altitude;
   *    on LAND it flies a 3 degree path to the threshold.
   *  - lateral: banks toward the plan heading (standard-rate turns) - the yoke roll input drives the panel's own bank / turn model when it is on screen.
   * If the pilot engages the autopilot AIL or ELEV axis, that axis is left alone. */
  const phaseGuide = applyPhaseToGuidance(guide, altFt);
  mirrorToControls(phase, plan, phaseGuide);
  if (!mip.apElev) {
    let tgtAlt = phaseGuide.targetAltFt ?? altFt;
    // TAKEOFF flies its own slow climb: never depend on the PLAN NAV guidance being active (inactive guidance gave tgtAlt = altFt, i.e. no climb at all).
    if (phase === "TAKEOFF") tgtAlt = Math.min(elev + ACCEL_ALT_AGL_FT, Math.max(altFt, elev) + TAKEOFF_CLIMB_STEP_FT);
    if (accelHold) tgtAlt = Math.min(tgtAlt, elev + ACCEL_ALT_AGL_FT); // level off to accelerate and clean up
    let wanted: number;
    if (phase === "LAND") {
      const pathAlt = toDestinationElev + 40 + Math.max(0, distThr) * 318; // 3 degree glide path, aim point ~ 40 ft above the threshold
      const gsFpm = Math.max(100, Number(sim.groundSpeedKt ?? 140)) * 5.3; // vertical speed that holds the 3 degree path
      wanted = clamp(-gsFpm + (pathAlt - altFt) * 6, -1500, 1000);
      tgtAlt = wanted >= 0 ? altFt + 200 : toDestinationElev;
    } else {
      // 737-200 (JT8D): about 2,000-2,500 fpm at 250 kt low down, falling with altitude; the first climb after lift-off (flaps 5, V2+15) is gentler.
      const perf = climbPerformance(sim as unknown as Record<string, unknown>).factor; // heavier / hotter = lower climb rate
      const climbMax = (phase === "TAKEOFF" ? 1800 : clamp(2500 - altFt * 0.05, 800, 2500)) * perf;
      const descMax = phase === "APPROACH" ? 1500 : 2000;
      wanted = clamp((tgtAlt - altFt) * 6, -descMax, climbMax); // tapers to zero within ~300-400 ft of the target
    }
    const vsRamp = phase === "TAKEOFF" || phase === "CLIMB" ? 300 : 700; // fpm per second: the rate builds like a steady pitch-up, not a jump
    vsCmd += clamp(wanted - vsCmd, -vsRamp * dt, vsRamp * dt);
    if (phase !== "LAND" && Math.abs(tgtAlt - altFt) < 2) vsCmd = 0;
    patchChanged({ psFlightProgressive: true, psFlightTargetAltFt: Math.round(tgtAlt), psFlightVsFpm: Math.round(vsCmd / 10) * 10 }, 4);
  }
  if (!mip.apAil && phaseGuide.headingMagCmdDeg != null) {
    const curHdg = mip.attLive ? mip.att.hdg : Number(sim.attitudeHeadingDeg ?? 0);
    const err = ((phaseGuide.headingMagCmdDeg - curHdg + 540) % 360) - 180;
    if (mip.attLive) {
      patchChanged({ yokeRoll: clamp(err * 0.07, -0.8, 0.8) }, 0.02); // bank up to ~24 degrees; the panel's attitude model turns the aircraft
    } else {
      const rate = clamp(err * 0.5, -3, 3); // deg/s, standard rate
      useSim.setState({ attitudeHeadingDeg: (((curHdg + rate * dt) % 360) + 360) % 360 } as never);
    }
  } else if (!mip.apAil && Math.abs(Number(sim.yokeRoll ?? 0)) > 0.02) patchChanged({ yokeRoll: 0 }, 0.02);

  /* trainer-set thrust / flaps / speed target, groundspeed from true airspeed so the route tracker moves at the right rate */
  const tgtFlaps = flaps;
  const tas = tasFromCas(cas, altFt);
  patchChanged({ psFlightTargetCasKt: targetCas, psFlightProgressive: true, groundSpeedKt: Math.round(tas), throttle1: slewThrottle(Number(sim.throttle1 ?? 0), throttleFor(phase, agl), dt), throttle2: slewThrottle(Number(sim.throttle2 ?? 0), throttleFor(phase, agl), dt), ...(tgtFlaps !== Number(sim.flaps) ? { flaps: tgtFlaps } : {}) }, 0.8);
  if (phase === "APPROACH" && scene) { /* ILS tuning is done by PLAN NAV in the instrument-panel model once the last vector fix is close */ }
  autoHint();
}

function touchdown(plan: ActiveFlightPlan, cas: number, altFt: number) {
  const elev = fieldElev(plan.destination);
  vsCmd = 0;
  patchSim({ wow: true, airborneTest: false, groundSenseTest: false, gear: "DN", noseGearPos: 1, leftMainGearPos: 1, rightMainGearPos: 1, speedBrake: "UP", yokeRoll: 0, throttle1: 0, throttle2: 0, autobrake: 2, groundSpeedKt: Math.round(tasFromCas(cas, altFt)), psFlightCasKt: Math.round(cas), psFlightTargetCasKt: Math.round(cas), psGroundRoll: true, psFlightVsFpm: 0, psFlightAltFt: elev, psFlightTargetAltFt: elev });
  useMip.setState({ apAil: false, apElev: false, apNav: 0, fdMode: 1 });
  roll.gs = Math.round(tasFromCas(cas, altFt));
  setPhase("ROLLOUT", `Touchdown at ${Math.round(roll.gs)} kt - speedbrake UP, autobrake MED, autopilot off.`);
  usePhase.setState({ hint: "Rollout." });
}

function rollout(dt: number) {
  roll.gs = Math.max(0, roll.gs - 3.4 * dt);
  patchChanged({ groundSpeedKt: Math.round(roll.gs * 2) / 2, psFlightCasKt: Math.round(roll.gs * 2) / 2, psFlightTargetCasKt: Math.round(roll.gs * 2) / 2 }, 0.4);
  if (roll.gs <= 0.5) {
    patchSim({ groundSpeedKt: 0, psFlightCasKt: 0, psFlightTargetCasKt: 0, psGroundRoll: false, autobrake: 0 });
    setPhase("COMPLETE", "Aircraft stopped. Flight complete.");
    usePhase.setState({ hint: "Flight complete. Load the plan again to fly another." });
  }
}

/* ───────── buttons ───────── */

export function canStart(p: PhaseButton): { ok: boolean; reason: string } {
  const { phase } = usePhase.getState();
  const plan = activePlan();
  const wow = useSim.getState().wow;
  if (!plan || phase === "NO PLAN") return { ok: false, reason: "Activate a flight plan first" };
  if (phase === "READY" && p !== "TAKEOFF" && wow) return { ok: false, reason: "Start with TAKEOFF" };
  if (p === "TAKEOFF") return wow && (phase === "READY" || phase === "COMPLETE") ? { ok: true, reason: "" } : { ok: false, reason: wow ? "Load the plan first" : "Already airborne" };
  if (wow) return { ok: false, reason: "Not airborne" };
  if (phase === "ROLLOUT" || phase === "COMPLETE") return { ok: false, reason: "Flight is over" };
  if (p === "LAND" && !arrivalScene(plan)) return { ok: false, reason: "Auto-land needs the vectored ILS arrival (WSSS RWY 02L)" };
  if (p === "APPROACH" && !arrivalScene(plan)) return { ok: true, reason: "" };
  return { ok: true, reason: "" };
}

export function startPhase(p: PhaseButton): boolean {
  const gate = canStart(p);
  if (!gate.ok) { say(`${p} not available: ${gate.reason}.`); return false; }
  const plan = activePlan()!;
  const mip = useMip.getState();
  ensureFlightPhaseController();
  if (p === "TAKEOFF") {
    // TAKEOFF is the sole command that starts movement from READY.
    useMip.setState({ planNav: true, apAil: false, apElev: false, apNav: 0, apHdgSw: 0 });
    patchChanged({ groundSpeedKt: 0, psFlightCasKt: 0, psFlightTargetCasKt: 0, psFlightVsFpm: 0, psFlightTargetAltFt: Number(useSim.getState().psFlightAltFt ?? 0), throttle1: 0, throttle2: 0, psGroundRoll: false }, 0.1);
    roll.gs = 0; roll.t = 0; vsCmd = 0; gearDownDone = false;
    setPhase("TAKEOFF", "TAKEOFF - thrust set, accelerating.");
    usePhase.setState({ hint: `Accelerating: V1 ${V_SPEEDS.v1}, rotate ${V_SPEEDS.vr}.` });
    return true;
  }
  // airborne phases: the phase controller flies the aircraft (thrust, pitch/vertical speed, heading) like a pilot hand-flying it.
  // The autopilot axes are NOT engaged for the pilot; if the pilot engages AP AIL / ELEV himself, that axis is left to the autopilot.
  useMip.setState({ planNav: true, ...(mip.fdMode === 1 ? { fdMode: 2 } : {}) });
  if (p === "LAND") gearDownDone = false;
  const text: Record<PhaseButton, string> = {
    TAKEOFF: "", CLIMB: `CLIMB - to ${plan.cruiseAltitudeFt} ft, 250 kt below 10,000 ft.`, CRUISE: "CRUISE - altitude hold, plan cruise speed.",
    DESCENT: `DESCENT - to ${descentTargetFt(plan)} ft.`, APPROACH: "APPROACH - vectors to the ILS, speed and flaps scheduled.", LAND: "LAND - gear down, final flaps, ILS tracking.",
  };
  setPhase(p, text[p]);
  return true;
}

/** Back to a clean state (used when the plan is deactivated). */
export function resetFlightPhases() {
  stopFlightPhaseController();
  usePhase.setState({ phase: "NO PLAN", checklist: [], trail: [], hint: "Activate a flight plan to load it into the controls." });
}
