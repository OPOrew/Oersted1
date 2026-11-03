import type { ActiveArrival } from "./activeFlightPlan";

/**
 * Plan guidance for the trainer autopilot ("PLAN NAV").
 * Pure functions only: the simulator loop feeds in the geographic state and applies the result.
 * Lateral guidance is a heading command (the modeled SP-77 flies it like HDG SEL), vertical guidance is an
 * altitude target for ALT HOLD. Speed is ADVISORY only: a 737-200 has no autothrottle.
 * A real 737-200 has no FMC / LNAV, so this is a trainer aid, not period-accurate equipment.
 */
export type GuidanceTarget = { name: string; latitude: number; longitude: number; altitudeFt: number; speedKt: number };

export type VertMode = "NONE" | "CLIMB" | "CRUISE" | "DESCENT" | "VECTOR";
export type GuidanceResult = {
  active: boolean;
  headingTrueCmdDeg: number | null;
  /** heading command in the simulator's (magnetic) frame */
  headingMagCmdDeg: number | null;
  targetAltFt: number | null;
  vertMode: VertMode;
  speedAdvisoryKt: number | null;
  /** distance before the first vector fix at which the descent should start */
  todDistanceNm: number | null;
  distToTodNm: number | null;
  /** true once the aircraft is close enough to the intercept fix for the ILS to be tuned and armed */
  ilsArm: boolean;
  inVectors: boolean;
  note: string;
};
export const INACTIVE_GUIDANCE: GuidanceResult = {
  active: false, headingTrueCmdDeg: null, headingMagCmdDeg: null, targetAltFt: null, vertMode: "NONE",
  speedAdvisoryKt: null, todDistanceNm: null, distToTodNm: null, ilsArm: false, inVectors: false, note: "NO PLAN GUIDANCE",
};

export const wrap360 = (d: number) => ((d % 360) + 360) % 360;
export const wrap180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const rad = (n: number) => (n * Math.PI) / 180;
const R_NM = 3440.065;

export function distNm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = rad(bLat - aLat), dLon = rad(bLon - aLon);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return R_NM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}
export function brgTrue(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const y = Math.sin(rad(bLon - aLon)) * Math.cos(rad(bLat));
  const x = Math.cos(rad(aLat)) * Math.sin(rad(bLat)) - Math.sin(rad(aLat)) * Math.cos(rad(bLat)) * Math.cos(rad(bLon - aLon));
  return wrap360((Math.atan2(y, x) * 180) / Math.PI);
}

/** Distance before a waypoint at which to start a turn of `turnDeg` (fly-by), assuming a standard bank. */
export function leadDistanceNm(groundSpeedKt: number, turnDeg: number, bankDeg = 20): number {
  const t = Math.abs(wrap180(turnDeg));
  if (t < 5) return 0;
  const radiusNm = (1.4565e-5 * groundSpeedKt * groundSpeedKt) / Math.tan(rad(bankDeg));
  return clamp(radiusNm * Math.tan(rad(Math.min(t, 150) / 2)), 0, 8);
}

/** Heading to fly (true): direct to the waypoint when far off track, else the leg track corrected for cross-track error. */
export function lateralCommandTrue(args: { desiredTrackDeg: number | null; crossTrackNm: number | null; bearingToNextDeg: number | null }): number | null {
  const { desiredTrackDeg, crossTrackNm, bearingToNextDeg } = args;
  if (desiredTrackDeg == null || crossTrackNm == null) return bearingToNextDeg;
  if (Math.abs(crossTrackNm) > 2 && bearingToNextDeg != null) return bearingToNextDeg;
  // Positive cross-track = right of track, so steer left (subtract); capped at 25 deg intercept.
  return wrap360(desiredTrackDeg - clamp(crossTrackNm * 12, -25, 25));
}

/** Distance from the first vector fix at which to start descending from cruise: 1,500 fpm at the mean of cruise and 250 kt groundspeed, plus 10 NM to slow down. */
export function todDistanceNm(cruiseAltFt: number, targetAltFt: number, cruiseGsKt: number): number {
  const delta = Math.max(0, cruiseAltFt - targetAltFt);
  const minutes = delta / 1500;
  const meanGs = (Math.max(cruiseGsKt, 250) + 250) / 2;
  return (minutes * meanGs) / 60 + 10;
}

export type GuidanceInput = {
  plan: { cruiseAltitudeFt: number; cruiseSpeedKt: number; arrival?: ActiveArrival };
  targets: GuidanceTarget[];
  legIndex: number;
  latitude: number;
  longitude: number;
  altitudeFt: number;
  groundSpeedKt: number;
  desiredTrackDeg: number | null;
  crossTrackNm: number | null;
  bearingToNextDeg: number | null;
  distanceToNextNm: number | null;
  /** east-positive magnetic variation at the aircraft */
  magVarDeg: number;
  /** distance to the arrival runway threshold, if known (for the final-approach speed advisory) */
  distToThresholdNm?: number | null;
};

export function remainingRouteNm(latitude: number, longitude: number, targets: GuidanceTarget[], fromIndex: number, toIndex: number): number {
  if (fromIndex > toIndex || !targets[fromIndex]) return 0;
  let total = distNm(latitude, longitude, targets[fromIndex].latitude, targets[fromIndex].longitude);
  for (let i = fromIndex; i < toIndex; i++) total += distNm(targets[i].latitude, targets[i].longitude, targets[i + 1].latitude, targets[i + 1].longitude);
  return total;
}

export function computeGuidance(input: GuidanceInput): GuidanceResult {
  const { plan, targets, legIndex } = input;
  const active = targets[legIndex];
  if (!active) return INACTIVE_GUIDANCE;

  const arrival = plan.arrival;
  const firstIdx = arrival ? targets.findIndex((t) => t.name === arrival.firstFixName) : -1;
  const lastIdx = arrival ? targets.findIndex((t) => t.name === arrival.lastFixName) : -1;
  // The leg TO the first vector fix is still planned with the cruise / top-of-descent logic; vectors begin once that fix is passed.
  const inVectors = firstIdx >= 0 && legIndex > firstIdx;
  const cruise = plan.cruiseAltitudeFt;

  let vertMode: VertMode = "NONE";
  let targetAlt: number | null = null;
  let tod: number | null = null;
  let distToTod: number | null = null;
  let note = "";

  if (inVectors) {
    vertMode = "VECTOR";
    targetAlt = active.altitudeFt > 0 ? active.altitudeFt : null;
    note = `VECTORS ${active.name}`;
  } else if (firstIdx >= 0) {
    const approachAlt = targets[firstIdx].altitudeFt > 0 ? targets[firstIdx].altitudeFt : 5000;
    tod = todDistanceNm(cruise, approachAlt, Math.max(input.groundSpeedKt, plan.cruiseSpeedKt));
    const toFix = remainingRouteNm(input.latitude, input.longitude, targets, legIndex, firstIdx);
    distToTod = toFix - tod;
    if (toFix <= tod) { vertMode = "DESCENT"; targetAlt = approachAlt; note = `DESCENT to ${approachAlt} FT`; }
    else if (input.altitudeFt < cruise - 300) { vertMode = "CLIMB"; targetAlt = cruise; note = `CLIMB to ${cruise} FT`; }
    else { vertMode = "CRUISE"; targetAlt = cruise; note = `CRUISE, TOD in ${Math.max(0, distToTod).toFixed(0)} NM`; }
  } else {
    vertMode = input.altitudeFt < cruise - 300 ? "CLIMB" : "CRUISE";
    targetAlt = cruise;
    note = vertMode === "CLIMB" ? `CLIMB to ${cruise} FT` : "CRUISE";
  }

  // Speed advisory (pilot flies the throttles).
  let speed: number | null = null;
  const thr = input.distToThresholdNm ?? null;
  if (inVectors && lastIdx >= 0 && legIndex >= lastIdx && thr != null) speed = thr > 8 ? 180 : thr > 4 ? 150 : null;
  else if (inVectors) speed = active.speedKt > 0 ? active.speedKt : 220;
  else speed = input.altitudeFt < 10000 ? 250 : plan.cruiseSpeedKt;

  const ilsArm = lastIdx >= 0 && (legIndex > lastIdx || (legIndex === lastIdx && (input.distanceToNextNm ?? 99) <= 6));
  const hdgTrue = lateralCommandTrue({ desiredTrackDeg: input.desiredTrackDeg, crossTrackNm: input.crossTrackNm, bearingToNextDeg: input.bearingToNextDeg });
  return {
    active: true,
    headingTrueCmdDeg: hdgTrue,
    headingMagCmdDeg: hdgTrue == null ? null : wrap360(hdgTrue - input.magVarDeg),
    targetAltFt: targetAlt,
    vertMode, speedAdvisoryKt: speed, todDistanceNm: tod, distToTodNm: distToTod, ilsArm, inVectors, note,
  };
}
