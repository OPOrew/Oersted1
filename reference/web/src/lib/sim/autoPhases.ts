/**
 * Automatic phase progression (AUTO PHASES). Pure rules, kept apart from the controller so they can be unit-tested.
 * Same gates as the phase buttons (the controller still checks canStart); a phase hands over once it has done its job:
 * TAKEOFF -> CLIMB when clean at the acceleration altitude, CLIMB -> CRUISE at the planned cruise altitude,
 * CRUISE -> DESCENT at top of descent, DESCENT -> APPROACH when level at the approach altitude or in vectors,
 * APPROACH -> LAND once the localizer is captured within 14 NM.
 */
export const ACCEL_ALT_AGL_FT = 1500;
export type AutoCtx = { agl: number; altFt: number; distThr: number; descentTgtFt: number; gearUp: boolean; locCaptured: boolean; inVectors: boolean; todReached: boolean };
export type AutoPhase = "CLIMB" | "CRUISE" | "DESCENT" | "APPROACH" | "LAND";

export function autoNext(phase: string, plan: { cruiseAltitudeFt: number }, c: AutoCtx): AutoPhase | null {
  switch (phase) {
    case "TAKEOFF": return c.agl >= ACCEL_ALT_AGL_FT - 150 && c.gearUp ? "CLIMB" : null;
    case "CLIMB": return Math.abs(c.altFt - plan.cruiseAltitudeFt) < 150 ? "CRUISE" : null;
    case "CRUISE": return c.todReached ? "DESCENT" : null;
    case "DESCENT": return c.inVectors || c.altFt - c.descentTgtFt < 400 ? "APPROACH" : null;
    case "APPROACH": return c.locCaptured && c.distThr < 14 ? "LAND" : null;
    default: return null;
  }
}
