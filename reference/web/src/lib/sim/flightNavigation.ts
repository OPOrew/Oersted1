import { ACTIVE_FLIGHT_PLAN_EVENT, readActiveFlightPlan, type ActiveArrival, type ActiveFlightPlan, type ActiveFlightWaypoint } from "./activeFlightPlan";
import { AIRPORT_DATA, WSSS_ILS_02L, isWsssArrivalSceneId, magVarAt, type IlsScene } from "./navData";
import { computeGuidance, INACTIVE_GUIDANCE, leadDistanceNm, wrap360, type GuidanceResult } from "./planGuidance";

export const FLIGHT_NAV_STATE_KEY = "oersted-flight-navigation-state-v1";
export const FLIGHT_NAV_STATE_EVENT = "oersted-flight-navigation-updated";

export type FlightPhase = "NO PLAN" | "PARKED" | "GROUND MOVEMENT" | "CLIMB" | "CRUISE" | "DESCENT / APPROACH" | "DESTINATION AREA";
export type FlightNavigationState = {
  version: 1;
  planActivatedAt: string;
  latitude: number;
  longitude: number;
  /** Simulator heading (magnetic), degrees. */
  headingDeg: number;
  altitudeFt: number;
  groundSpeedKt: number;
  activeLegIndex: number;
  activeLegName: string;
  distanceToNextNm: number | null;
  /** True bearing to the active waypoint. */
  bearingToNextDeg: number | null;
  /** Desired true track from the start of the active leg to its target. */
  desiredTrackDeg: number | null;
  /** Signed cross-track error in NM; positive means right of the active leg. */
  crossTrackNm: number | null;
  /** Wrapped difference between desired track and current true heading, degrees. */
  trackErrorDeg: number | null;
  distanceToDestinationNm: number | null;
  phase: FlightPhase;
  positionMode: "INITIALIZED AT DEPARTURE" | "MOVING WITH SIMULATED AIRCRAFT" | "NO GEOGRAPHIC REFERENCE";
  updatedAt: string;
  /** East-positive magnetic variation at the aircraft (magnetic = true - variation). */
  magVarDeg?: number;
  /** True direction the aircraft is actually moving along (what the map symbol should point at); equals the true heading when not route-following. */
  trackTrueDeg?: number;
  /** Current en-route position-time multiplier (1 = real time). */
  timeCompression?: number;
  /** PLAN NAV guidance summary for the planner display. */
  guidanceNote?: string;
  guidanceVertMode?: string;
  guidanceTargetAltFt?: number | null;
  guidanceSpeedKt?: number | null;
  guidanceHeadingMagDeg?: number | null;
  guidanceTodNm?: number | null;
  guidanceDistToTodNm?: number | null;
};

/** Default en-route time compression: the aircraft's POSITION moves along the route at this multiple of its groundspeed while cruising.
 * Speed and altitude are NOT changed. Climb, descent and the approach run at 1x (see enrouteCompression). */
export const DEFAULT_TIME_COMPRESSION = 15;
const smoothstep = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
/**
 * Smooth position-time multiplier (1 .. max). It is 1 on the ground, in the initial climb and from top of descent on, and rises smoothly to `max` only while
 * cruising, so the vertical profile (which the flight model flies in real time) and the final approach / ILS capture are never rushed.
 *  - altitude gate: 1x until 4,000 ft below cruise altitude, full once within 1,000 ft of it
 *  - distance gate: full while more than 60 NM before top of descent (or, without a TOD, more than 160 NM from the destination), back to 1x 10 NM / 110 NM out
 */
export function enrouteCompression(max: number, p: { wow: boolean; altitudeFt: number; cruiseAltitudeFt: number; distToTodNm: number | null; distToDestNm: number | null }): number {
  if (!(max > 1) || p.wow) return 1;
  const altGate = smoothstep((p.altitudeFt - (p.cruiseAltitudeFt - 4000)) / 3000);
  const remaining = p.distToTodNm ?? (p.distToDestNm != null ? p.distToDestNm - 100 : null);
  const distGate = remaining == null ? 0 : smoothstep((remaining - 10) / 50);
  return 1 + (max - 1) * altGate * distGate;
}

/** Heading in degrees that is `w` of the way from `a` to `b` along the shorter arc. */
const blendDeg = (a: number, b: number, w: number) => wrap360(a + ((((b - a) + 540) % 360) - 180) * w);

export type NavigationTelemetry = { dt: number; groundSpeedKt: number; headingDeg: number; altitudeFt: number; wow: boolean };

type GeoPoint = { latitude: number; longitude: number };
const AIRPORTS: Record<string, GeoPoint> = Object.fromEntries(
  Object.values(AIRPORT_DATA).map((a) => [a.icao, { latitude: a.arpLat, longitude: a.arpLon }]),
);
const rad = (n: number) => n * Math.PI / 180;
const deg = (n: number) => (n * 180 / Math.PI + 360) % 360;
export function distanceNm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = rad(bLat - aLat), dLon = rad(bLon - aLon);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 3440.065 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}
export function bearingDeg(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const y = Math.sin(rad(bLon - aLon)) * Math.cos(rad(bLat));
  const x = Math.cos(rad(aLat)) * Math.sin(rad(bLat)) - Math.sin(rad(aLat)) * Math.cos(rad(bLat)) * Math.cos(rad(bLon - aLon));
  return deg(Math.atan2(y, x));
}

/** ILS scene for a plan's vectored arrival, if any. */
export function arrivalScene(plan: ActiveFlightPlan): IlsScene | null {
  if (isWsssArrivalSceneId(plan.arrival?.sceneId)) return WSSS_ILS_02L;
  return null;
}
/** Where the aircraft starts: the departure runway threshold when known, else the aerodrome reference point. */
export function departurePoint(plan: ActiveFlightPlan): GeoPoint | null {
  const ap = AIRPORT_DATA[plan.departure];
  const rwy = ap?.runways[plan.departureRunway];
  if (rwy) return { latitude: rwy.thrLat, longitude: rwy.thrLon };
  return AIRPORTS[plan.departure] ?? null;
}
/** Magnetic heading for the departure runway (to line the aircraft up on load), or null when the runway is not in the data. */
export function departureRunwayHeadingMag(plan: ActiveFlightPlan): number | null {
  const ap = AIRPORT_DATA[plan.departure];
  const rwy = ap?.runways[plan.departureRunway];
  if (!ap || !rwy) return null;
  return wrap360(rwy.trueBrgDeg - ap.magVarDeg);
}

type Target = ActiveFlightWaypoint | { id: string; name: string; latitude: number; longitude: number; altitudeFt: number; speedKt: number };
function targetList(plan: ActiveFlightPlan): Target[] {
  const valid = (plan.waypoints ?? []).filter(w => Number.isFinite(w.latitude) && Number.isFinite(w.longitude) && Math.abs(w.latitude) <= 90 && Math.abs(w.longitude) <= 180);
  const scene = arrivalScene(plan);
  if (scene) return [...valid, { id: `DEST-${plan.destination}-${scene.runway}`, name: `${plan.destination} ${scene.runway}`, latitude: scene.thrLat, longitude: scene.thrLon, altitudeFt: 0, speedKt: 0 }];
  const dest = AIRPORTS[plan.destination];
  return dest ? [...valid, { id: `DEST-${plan.destination}`, name: plan.destination, ...dest, altitudeFt: 0, speedKt: 0 }] : valid;
}
export type RoutePoint = { name: string; latitude: number; longitude: number; altitudeFt: number; speedKt: number; kind: "DEP" | "WPT" | "DEST" };
/** Departure point, every navigable waypoint and the destination (arrival runway threshold for a vectored ILS), in flying order, for route displays. */
export function planRoutePoints(plan: ActiveFlightPlan): RoutePoint[] {
  const out: RoutePoint[] = [];
  const dep = departurePoint(plan);
  if (dep) out.push({ name: plan.departure, latitude: dep.latitude, longitude: dep.longitude, altitudeFt: 0, speedKt: 0, kind: "DEP" });
  const targets = targetList(plan);
  targets.forEach((t, i) => out.push({ name: t.name, latitude: t.latitude, longitude: t.longitude, altitudeFt: t.altitudeFt, speedKt: t.speedKt, kind: i === targets.length - 1 && (arrivalScene(plan) || AIRPORTS[plan.destination]) ? "DEST" : "WPT" }));
  return out;
}
function legStart(plan: ActiveFlightPlan, targets: Target[], legIndex: number): GeoPoint | undefined {
  return legIndex > 0 ? targets[legIndex - 1] : departurePoint(plan) ?? undefined;
}
function routeGuidance(latitude: number, longitude: number, trueHeadingDeg: number, plan: ActiveFlightPlan, legIndex: number, targets = targetList(plan)) {
  const target = targets[legIndex];
  const previous = legStart(plan, targets, legIndex);
  if (!previous || !target) return { desiredTrackDeg: null, crossTrackNm: null, trackErrorDeg: null };
  const desiredTrackDeg = bearingDeg(previous.latitude, previous.longitude, target.latitude, target.longitude);
  const startToAircraftNm = distanceNm(previous.latitude, previous.longitude, latitude, longitude);
  const bearingStartToAircraft = bearingDeg(previous.latitude, previous.longitude, latitude, longitude);
  // Great-circle cross-track distance. Positive is right of track, negative is left.
  // Angular distance is already in radians (NM / Earth radius in NM); the original wrapped this in rad() again, which made cross-track error about 57 times too small.
  const angle = startToAircraftNm / 3440.065;
  const delta = rad((((bearingStartToAircraft - desiredTrackDeg) + 540) % 360) - 180);
  const crossTrackNm = Math.asin(Math.max(-1, Math.min(1, Math.sin(angle) * Math.sin(delta)))) * 3440.065;
  const rawTrackError = desiredTrackDeg - trueHeadingDeg;
  const trackErrorDeg = ((rawTrackError + 540) % 360) - 180;
  return { desiredTrackDeg, crossTrackNm, trackErrorDeg };
}

/* ── state storage ──
 * `live` is the source of truth between ticks. Reading the persisted copy on every tick (it is only written once per
 * second) would throw away the position gained since the last write and make the aircraft crawl at a fraction of its speed. */
let live: FlightNavigationState | null = null;
let liveGuidance: GuidanceResult = INACTIVE_GUIDANCE;
let liveArrival: ActiveArrival | undefined;
function readState(): FlightNavigationState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(FLIGHT_NAV_STATE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as FlightNavigationState;
    if (v.version !== 1 || !Number.isFinite(v.latitude) || !Number.isFinite(v.longitude)) return null;
    return v;
  } catch { return null; }
}
function writeState(state: FlightNavigationState) {
  live = state;
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(FLIGHT_NAV_STATE_KEY, JSON.stringify(state)); } catch { /* browser storage may be unavailable */ }
  window.dispatchEvent(new CustomEvent(FLIGHT_NAV_STATE_EVENT, { detail: state }));
}
function buildState(plan: ActiveFlightPlan, telemetry?: NavigationTelemetry): FlightNavigationState {
  const origin = departurePoint(plan);
  const latitude = origin?.latitude ?? 0;
  const longitude = origin?.longitude ?? 0;
  const targets = targetList(plan);
  const first = targets[0];
  const dest = targets.length ? targets[targets.length - 1] : undefined;
  const magVar = magVarAt(latitude);
  const distanceToNextNm = first && origin ? distanceNm(latitude, longitude, first.latitude, first.longitude) : null;
  const guidance = routeGuidance(latitude, longitude, (telemetry?.headingDeg ?? 0) + magVar, plan, 0, targets);
  return {
    version: 1, planActivatedAt: plan.activatedAt, latitude, longitude,
    headingDeg: telemetry?.headingDeg ?? 0, altitudeFt: telemetry?.altitudeFt ?? 0, groundSpeedKt: telemetry?.groundSpeedKt ?? 0,
    activeLegIndex: 0, activeLegName: first?.name ?? plan.destination,
    distanceToNextNm, bearingToNextDeg: first && origin ? bearingDeg(latitude, longitude, first.latitude, first.longitude) : null,
    ...guidance,
    distanceToDestinationNm: dest && origin ? distanceNm(latitude, longitude, dest.latitude, dest.longitude) : null,
    phase: "PARKED", positionMode: origin ? "INITIALIZED AT DEPARTURE" : "NO GEOGRAPHIC REFERENCE", updatedAt: new Date().toISOString(),
    magVarDeg: magVar,
  };
}
export function readFlightNavigationState(): FlightNavigationState | null { return live ?? readState(); }
/** In-memory live state and guidance for the simulator loop (no storage round trip). */
export function getLiveFlightNavigation(): FlightNavigationState | null { return live; }
export function getLiveFlightGuidance(): GuidanceResult { return liveGuidance; }
export function getLiveArrival(): ActiveArrival | undefined { return liveArrival; }
export function resetFlightNavigationForPlan(plan: ActiveFlightPlan, telemetry?: NavigationTelemetry): FlightNavigationState {
  const state = buildState(plan, telemetry);
  liveGuidance = INACTIVE_GUIDANCE;
  writeState(state);
  return state;
}

let elapsedSincePublish = 0;
/** Called from the simulator tick. This tracks geographic position from simulated groundspeed and heading and computes PLAN NAV guidance; the simulator loop decides whether to apply it. */
export function advanceFlightNavigation(telemetry: NavigationTelemetry): void {
  if (typeof window === "undefined" || !Number.isFinite(telemetry.dt) || telemetry.dt <= 0) return;
  const plan = readActiveFlightPlan();
  if (!plan) { liveGuidance = INACTIVE_GUIDANCE; liveArrival = undefined; return; }
  liveArrival = plan.arrival;
  let state: FlightNavigationState | null = live && live.planActivatedAt === plan.activatedAt ? live : readState();
  if (!state || state.planActivatedAt !== plan.activatedAt) state = buildState(plan, telemetry);
  const origin = departurePoint(plan);
  const targets = targetList(plan);
  const destTarget = targets.length ? targets[targets.length - 1] : undefined;
  if (!origin || state.positionMode === "NO GEOGRAPHIC REFERENCE") {
    state = { ...state, positionMode: "NO GEOGRAPHIC REFERENCE", phase: "NO PLAN", updatedAt: new Date().toISOString() };
    live = state;
    liveGuidance = INACTIVE_GUIDANCE;
    elapsedSincePublish += telemetry.dt;
    if (elapsedSincePublish >= 1) { elapsedSincePublish = 0; writeState(state); }
    return;
  }
  let latitude = state.latitude, longitude = state.longitude;
  const speed = Math.max(0, telemetry.groundSpeedKt);
  const dt = Math.min(telemetry.dt, 1);
  const magVar = magVarAt(latitude);
  const trueHeading = wrap360(telemetry.headingDeg + magVar);
  const maxCompression = plan.timeCompression ?? DEFAULT_TIME_COMPRESSION;
  const compression = enrouteCompression(maxCompression, {
    wow: telemetry.wow, altitudeFt: telemetry.altitudeFt, cruiseAltitudeFt: plan.cruiseAltitudeFt,
    distToTodNm: liveGuidance.todDistanceNm != null ? liveGuidance.distToTodNm : null,
    distToDestNm: state.distanceToDestinationNm,
  });
  let legIndex = Math.min(state.activeLegIndex, Math.max(0, targets.length - 1));
  let target = targets[legIndex];
  let range = target ? distanceNm(latitude, longitude, target.latitude, target.longitude) : null;

  // Move in short sub-steps so that, even when compressed, the aircraft never jumps over a waypoint.
  const totalNm = speed > 1 ? (speed * dt / 3600) * compression : 0;
  let lastMoveBearing = trueHeading;
  const steps = totalNm > 0 ? Math.min(400, Math.max(1, Math.ceil(totalNm / 0.3))) : 1;
  for (let i = 0; i < steps; i++) {
    if (totalNm > 0) {
      // At 1x the aircraft flies its heading. As compression rises it is steered along the route instead (the heading cannot turn 15x faster),
      // blended smoothly so there is no jump when compression starts or ends.
      const w = maxCompression > 1 ? Math.max(0, Math.min(1, (compression - 1) / Math.max(1, maxCompression - 1))) : 0;
      const toTarget = target ? bearingDeg(latitude, longitude, target.latitude, target.longitude) : trueHeading;
      const moveBearing = w > 0 ? blendDeg(trueHeading, toTarget, w) : trueHeading;
      lastMoveBearing = moveBearing;
      let stepNm = totalNm / steps;
      if (compression > 1.01 && range !== null) stepNm = Math.min(stepNm, range); // do not overshoot the active waypoint when compressed
      const angularDistance = stepNm / 3440.065;
      const bearing = rad(moveBearing);
      const lat1 = rad(latitude), lon1 = rad(longitude);
      const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angularDistance) + Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing));
      const lon2 = lon1 + Math.atan2(Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1), Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2));
      latitude = lat2 * 180 / Math.PI;
      longitude = ((lon2 * 180 / Math.PI + 540) % 360) - 180;
      range = target ? distanceNm(latitude, longitude, target.latitude, target.longitude) : null;
    }
    // Fly-by sequencing: switch to the next waypoint at the turn-anticipation distance for the track change (minimum 0.7 NM).
    while (target && range !== null && legIndex < targets.length - 1) {
      const start = legStart(plan, targets, legIndex);
      const next = targets[legIndex + 1];
      const inbound = start ? bearingDeg(start.latitude, start.longitude, target.latitude, target.longitude) : bearingDeg(latitude, longitude, target.latitude, target.longitude);
      const outbound = bearingDeg(target.latitude, target.longitude, next.latitude, next.longitude);
      const threshold = Math.max(0.7, leadDistanceNm(Math.max(speed, 120), outbound - inbound));
      if (range > threshold) break;
      legIndex += 1;
      target = targets[legIndex];
      range = target ? distanceNm(latitude, longitude, target.latitude, target.longitude) : null;
    }
  }
  const distanceToDestinationNm = destTarget ? distanceNm(latitude, longitude, destTarget.latitude, destTarget.longitude) : null;
  const route = routeGuidance(latitude, longitude, trueHeading, plan, legIndex, targets);
  const bearingToNext = target ? bearingDeg(latitude, longitude, target.latitude, target.longitude) : null;
  let phase: FlightPhase = "PARKED";
  if (telemetry.wow) phase = speed > 1 ? "GROUND MOVEMENT" : "PARKED";
  else if (distanceToDestinationNm !== null && distanceToDestinationNm <= 60) phase = "DESCENT / APPROACH";
  else if (telemetry.altitudeFt < plan.cruiseAltitudeFt - 1500) phase = "CLIMB";
  else if (telemetry.altitudeFt >= plan.cruiseAltitudeFt - 1500) phase = "CRUISE";
  if (distanceToDestinationNm !== null && distanceToDestinationNm < 2) phase = "DESTINATION AREA";

  const guidance = computeGuidance({
    plan, targets, legIndex, latitude, longitude, altitudeFt: telemetry.altitudeFt, groundSpeedKt: speed,
    desiredTrackDeg: route.desiredTrackDeg, crossTrackNm: route.crossTrackNm, bearingToNextDeg: bearingToNext,
    distanceToNextNm: range, magVarDeg: magVar, distToThresholdNm: arrivalScene(plan) ? distanceToDestinationNm : null,
  });
  liveGuidance = guidance;

  state = {
    ...state, latitude, longitude, headingDeg: ((telemetry.headingDeg % 360) + 360) % 360,
    altitudeFt: telemetry.altitudeFt, groundSpeedKt: speed, activeLegIndex: legIndex,
    activeLegName: target?.name ?? plan.destination, distanceToNextNm: range,
    bearingToNextDeg: bearingToNext,
    ...route, distanceToDestinationNm, phase,
    positionMode: speed > 1 ? "MOVING WITH SIMULATED AIRCRAFT" : state.positionMode,
    updatedAt: new Date().toISOString(),
    timeCompression: Math.round(compression * 10) / 10,
    trackTrueDeg: Math.round(lastMoveBearing * 10) / 10,
    magVarDeg: magVar, guidanceNote: guidance.note, guidanceVertMode: guidance.vertMode, guidanceTargetAltFt: guidance.targetAltFt,
    guidanceSpeedKt: guidance.speedAdvisoryKt, guidanceHeadingMagDeg: guidance.headingMagCmdDeg,
    guidanceTodNm: guidance.todDistanceNm, guidanceDistToTodNm: guidance.distToTodNm,
  };
  live = state;
  elapsedSincePublish += telemetry.dt;
  if (elapsedSincePublish >= 1 || state.planActivatedAt !== plan.activatedAt) { elapsedSincePublish = 0; writeState(state); }
}

if (typeof window !== "undefined") {
  window.addEventListener(ACTIVE_FLIGHT_PLAN_EVENT, (event) => {
    const plan = (event as CustomEvent<ActiveFlightPlan>).detail;
    if (plan?.version === 1) resetFlightNavigationForPlan(plan);
  });
}
