/**
 * Pure helpers for the Collins FD-108 flight director and Sperry SP-77 autopilot (737-100/200 AMM 34-31-0, 22-11-0).
 * No imports and no React: the P5 panel model (MainInstrumentPanel) calls these every tick and scripts/autopilot.test.mjs tests them directly.
 */

export const angDiff = (to: number, from: number) => ((((to - from) % 360) + 540) % 360) - 180;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* ------------------------------------------------------------------ */
/* Tunables. Everything that is a number the manual gives is in AMM;   */
/* everything chosen to keep the trainer loop stable is in TRAINER and  */
/* is NOT claimed as a Boeing value.                                    */
/* ------------------------------------------------------------------ */

export const AMM = {
  /** AMM 22-11-0: radio lateral law - intercept the course at up to 45 deg; bank 25 deg intercepting, 8 deg on course (also the TURB limit) */
  interceptMaxDeg: 45,
  bankInterceptDeg: 25,
  bankOnCourseDeg: 8,
  /** roll-rate limits, deg/s: intercept 4, VOR on-course 1.3, LOC on-course 4 */
  rollRateInterceptDps: 4,
  rollRateVorOnCourseDps: 1.3,
  rollRateLocOnCourseDps: 4,
  /** AMM 34-31-0: flight-director steering commands limited to 30 deg roll, 12 deg pitch */
  fdBankDeg: 30,
  fdPitchDeg: 12,
  /** capture thresholds derived from AMM test levels: LOC about 1.0 deg (~2 dots, 34-26-0 FD test green band), VOR 3 deg (34-31-0 nav capture) */
  locCaptureDeg: 1.0,
  vorCaptureDeg: 3,
  /** AMM 22-11-0: capture -> on-course when bank < 6 deg and course error < 15 deg */
  onCourseBankDeg: 6,
  onCourseCrsErrDeg: 15,
  /** AMM 22-11-0: glide-slope capture phase 10 s at 700 ft/min, gain reduced with the radio altimeter below 1500 ft; nominal beam 3 deg */
  gsCaptureS: 10,
  gsCaptureFpm: 700,
  gsRaGainFt: 1500,
  gsBeamDeg: 3,
} as const;

export const TRAINER = {
  /** proportional gains: degrees of intercept angle per degree of beam deviation, and bank per degree of course error */
  locInterceptGain: 10,
  vorInterceptGain: 4.5,
  courseGain: 1.2,
  /** on-course window on the beam deviation, deg */
  locOnCourseDevDeg: 0.6,
  vorOnCourseDevDeg: 2,
  /** glide slope: correction per degree of beam error (limited to +/- gsErrClampDeg) and the VBS drop-out window */
  gsErrGain: 4,
  gsErrClampDeg: 3,
  gsCaptureErrDeg: 0.25,
  /** gain programmer shapes: 10 s ease-on, floor 0.25, time-since-capture roll-off above 1500 ft */
  gsEaseOnS: 10,
  gsGainFloor: 0.25,
  gsGainDecayStartS: 90,
  gsGainDecayS: 120,
  /** VOR zone of confusion: ground radius = this x altitude (nm), never under the minimum */
  zoneK: 1.2,
  zoneMinNm: 0.15,
  /** altitude acquire: commanded vertical speed per foot of altitude error, its limit, and the band inside which ALT HOLD is annunciated */
  altAcqFpmPerFt: 1.5,
  altAcqMaxFpm: 1800,
  altHoldBandFt: 100,
} as const;

export const FD_LIMIT = { bank: AMM.fdBankDeg, pitch: AMM.fdPitchDeg } as const;
export const LOC_CAPTURE_DEG = AMM.locCaptureDeg;
export const VOR_CAPTURE_DEG = AMM.vorCaptureDeg;
export const ONCOURSE_BANK_DEG = AMM.onCourseBankDeg;
export const ONCOURSE_CRSERR_DEG = AMM.onCourseCrsErrDeg;
export const GS_CAPTURE_S = AMM.gsCaptureS;
export const GS_CAPTURE_FPM = AMM.gsCaptureFpm;
export const GS_CAPTURE_ERR_DEG = TRAINER.gsCaptureErrDeg;
export const GS_EASE_ON_S = TRAINER.gsEaseOnS;
export const GS_RA_GAIN_FT = AMM.gsRaGainFt;

/* ------------------------------------------------------------------ */
/* Engage interlocks and disconnect reasons                             */
/* ------------------------------------------------------------------ */

export interface AfPlant {
  /** electronic bus 1 / dc power available */
  pw: boolean;
  /** hydraulic system B pressure good (system select switch is locked to B; AMM 22-11-0 p.10) */
  hydB: boolean;
  /** vertical gyro (ATT) and compass (HDG) valid */
  attOk: boolean;
  hdgOk: boolean;
}

/** AIL / ELEV engage interlocks. The engage switch is latched DISENGAGED unless these are met, and the holding solenoid drops if they break (AMM 22-11-0 p.9, p.32). */
export const afInterlocks = (p: AfPlant) => p.pw && p.hydB && p.attOk && p.hdgOk;

/** Which interlock broke, in the order a technician would check them; null while all hold. Shown to the trainee when the A/P disconnects. */
export function afDisconnectReason(p: AfPlant): string | null {
  if (!p.pw) return "DC power lost";
  if (!p.hydB) return "hydraulic system B pressure low";
  if (!p.attOk) return "attitude gyro (vertical gyro) invalid";
  if (!p.hdgOk) return "compass (heading) invalid";
  return null;
}

/** Fault drills for the Autopilot trainer: which failure to inject and what the autopilot must then do (the instructor checks the pass criterion). */
export const AP_DRILLS = [
  { id: "gyro", label: "Vertical gyro fails", expect: "A/P disconnects (A/P DISC light); reason: attitude gyro invalid. Select the other VERTICAL GYRO source to recover." },
  { id: "compass", label: "Compass fails", expect: "A/P disconnects; reason: compass invalid. Select the other COMPASS source to recover." },
  { id: "altitude", label: "Altitude source fails", expect: "ALT HOLD releases and pitch returns to attitude hold; the A/P stays engaged." },
] as const;
export type ApDrillId = (typeof AP_DRILLS)[number]["id"];

/* ------------------------------------------------------------------ */
/* Lateral                                                              */
/* ------------------------------------------------------------------ */

/** Radio lateral law (AMM 22-11-0): intercept the selected course at up to 45 deg; bank limit 25 deg while intercepting, 8 deg once on course
 *  (roll-rate limits: intercept 4 deg/s, VOR on-course 1.3 deg/s, LOC on-course 4 deg/s). `dev` is the bar deflection in degrees (positive = fly right). */
export function radioLateral(kind: "VOR" | "LOC", dev: number, crs: number, hdg: number) {
  const inter = clamp(dev * (kind === "LOC" ? TRAINER.locInterceptGain : TRAINER.vorInterceptGain), -AMM.interceptMaxDeg, AMM.interceptMaxDeg);
  const onCourse = Math.abs(dev) < (kind === "LOC" ? TRAINER.locOnCourseDevDeg : TRAINER.vorOnCourseDevDeg) && Math.abs(angDiff(crs, hdg)) < AMM.onCourseCrsErrDeg;
  const lim = onCourse ? AMM.bankOnCourseDeg : AMM.bankInterceptDeg;
  return { bank: clamp(angDiff(crs + inter, hdg) * TRAINER.courseGain, -lim, lim), lim, rate: onCourse && kind === "VOR" ? AMM.rollRateVorOnCourseDps : AMM.rollRateInterceptDps };
}

export type Light = "OFF" | "AMBER" | "GREEN";
/** Roll channel radio submodes: intercept (VOR/LOC light amber) -> capture (LBS drop-out, light green) -> on-course; VOR also has over-station. */
export type LatSub = "OFF" | "INTERCEPT" | "CAPTURE" | "ON_COURSE" | "OVER_STATION";
/** Pitch channel glide-slope phases: armed (GLIDE SLOPE amber) -> capture (VBS drop-out, green, 10 s) -> track. */
export type GsPhase = "OFF" | "ARMED" | "CAPTURE" | "TRACK";

export interface LatIn {
  /** NAV switch held in VOR LOC or AUTO APP with a valid beam */
  active: boolean;
  kind: "VOR" | "LOC";
  /** beam deviation, deg (positive = fly right) */
  dev: number;
  bank: number;
  /** heading minus selected course, deg */
  crsErr: number;
  /** VOR zone of confusion */
  overStation: boolean;
}

export function stepLateral(prev: LatSub, i: LatIn): LatSub {
  if (!i.active) return "OFF";
  if (prev === "OFF" || prev === "INTERCEPT") return Math.abs(i.dev) < (i.kind === "LOC" ? LOC_CAPTURE_DEG : VOR_CAPTURE_DEG) ? "CAPTURE" : "INTERCEPT";
  if (prev === "CAPTURE") return Math.abs(i.bank) < ONCOURSE_BANK_DEG && Math.abs(i.crsErr) < ONCOURSE_CRSERR_DEG ? "ON_COURSE" : "CAPTURE";
  if (i.kind !== "VOR") return "ON_COURSE";
  return i.overStation ? "OVER_STATION" : "ON_COURSE";
}

/** Zone of confusion: roughly a cone above the station (ground radius = zoneK x altitude), never under the minimum. */
export const inZoneOfConfusion = (vorDistNm: number, altFt: number) => vorDistNm < Math.max(TRAINER.zoneMinNm, (Math.max(0, altFt) / 6076.12) * TRAINER.zoneK);

/** Roll command for the current submode. Bank limits and roll rates are the AMM values: intercept/capture 25 deg and 4 deg/s,
 *  on-course 8 deg (VOR 1.3 deg/s, LOC 4 deg/s), over-station holds the drift-corrected heading with the on-course limits. */
export function lateralLaw(sub: LatSub, kind: "VOR" | "LOC", dev: number, crs: number, hdg: number, holdHdg: number) {
  const onLim = AMM.bankOnCourseDeg;
  const inLim = AMM.bankInterceptDeg;
  if (sub === "OVER_STATION") return { bank: clamp(angDiff(holdHdg, hdg) * TRAINER.courseGain, -onLim, onLim), lim: onLim, rate: AMM.rollRateVorOnCourseDps };
  const base = radioLateral(kind, dev, crs, hdg);
  if (sub === "ON_COURSE") return { bank: clamp(base.bank, -onLim, onLim), lim: onLim, rate: kind === "VOR" ? AMM.rollRateVorOnCourseDps : AMM.rollRateLocOnCourseDps };
  return { bank: clamp(base.bank, -inLim, inLim), lim: inLim, rate: AMM.rollRateInterceptDps };
}

/* ------------------------------------------------------------------ */
/* Vertical                                                             */
/* ------------------------------------------------------------------ */

export interface GsIn {
  /** AUTO APP or MAN G/S held with a valid glide slope and pitch engaged */
  want: boolean;
  /** MAN G/S: the intercept phase is bypassed and capture begins at once */
  manual: boolean;
  /** localizer already captured (green VOR/LOC) */
  locCaptured: boolean;
  /** glide-slope error, deg (positive = above the beam) */
  gsErr: number;
}

export function stepGlide(prev: GsPhase, capT: number, i: GsIn, dt: number): { phase: GsPhase; capT: number } {
  if (!i.want) return { phase: "OFF", capT: 0 };
  if (prev === "OFF" || prev === "ARMED") {
    if (i.manual || (i.locCaptured && Math.abs(i.gsErr) < GS_CAPTURE_ERR_DEG)) return { phase: "CAPTURE", capT: 0 };
    return { phase: "ARMED", capT: 0 };
  }
  if (prev === "CAPTURE") {
    const t = capT + dt;
    return t >= GS_CAPTURE_S ? { phase: "TRACK", capT: t } : { phase: "CAPTURE", capT: t };
  }
  return { phase: "TRACK", capT: Math.min(capT + dt, 120) };
}

/** Glide-slope track: flight-path angle command (deg) for a 3 deg beam, with error gain. gsErr positive = above the beam. */
export const gsGamma = (gsErr: number) => -AMM.gsBeamDeg - clamp(gsErr * TRAINER.gsErrGain, -TRAINER.gsErrClampDeg, TRAINER.gsErrClampDeg);

/** Gain programmer (AMM 22-11-0): the glide-slope signal is eased in after the 10 s capture phase (easy-on), and reduced as the beam
 *  strengthens near the transmitter - with the radio altimeter below 1500 ft, otherwise as a function of time since capture. Trainer shapes. */
export function glideGain(capT: number, raFt: number) {
  const ease = clamp((capT - GS_CAPTURE_S) / TRAINER.gsEaseOnS, 0, 1);
  const floor = TRAINER.gsGainFloor;
  const ra = raFt < GS_RA_GAIN_FT ? clamp(raFt / GS_RA_GAIN_FT, floor, 1) : clamp(1 - Math.max(0, capT - TRAINER.gsGainDecayStartS) / TRAINER.gsGainDecayS, floor, 1);
  return ease * ra;
}

/** Flight-path angle (deg) that gives a vertical speed (fpm) at a true airspeed (kt). */
export const fpmToGamma = (fpm: number, tasKt: number) => (Math.asin(clamp(fpm / 60 / Math.max(tasKt * 1.688, 60), -0.3, 0.3)) * 180) / Math.PI;

/** Flight-path angle command (deg): capture flies the 700 ft/min descent bias, track follows the beam through the gain programmer. */
export function glideGamma(phase: GsPhase, gsErr: number, tasKt: number, capT = GS_CAPTURE_S + TRAINER.gsEaseOnS, raFt = 9999) {
  if (phase === "CAPTURE") return -fpmToGamma(GS_CAPTURE_FPM, tasKt);
  return gsGamma(gsErr * glideGain(capT, raFt));
}

/** ALT HOLD: altitude acquire then hold. The commanded vertical speed is proportional to the altitude error and limited, so the aircraft eases
 *  onto the altitude instead of overshooting it. `errFt` = selected altitude minus current (positive = climb). ACQ until within the hold band. */
export function altAcquire(errFt: number, tasKt: number) {
  const vsFpm = clamp(errFt * TRAINER.altAcqFpmPerFt, -TRAINER.altAcqMaxFpm, TRAINER.altAcqMaxFpm);
  return { vsFpm, gamma: fpmToGamma(vsFpm, tasKt), phase: Math.abs(errFt) < TRAINER.altHoldBandFt ? ("HOLD" as const) : ("ACQ" as const) };
}

/** FD mode knob: 0 GA, 1 OFF, 2 HDG, 3 VOR/LOC, 4 AUTO APPR. Selecting GA while flying ends the approach modes and ALT HOLD (the pilot follows the GA command). */
export const goAroundSelected = (fdMode: number, flying: boolean) => flying && fdMode === 0;

/** Approach progress display (AMM 22-11-0, Approach Progress Display Operation). Lights latch green until MAN is selected. */
export function nextLight(prev: Light, selected: boolean, captured: boolean): Light {
  if (!selected) return "OFF";
  if (captured) return "GREEN";
  return prev === "GREEN" ? "GREEN" : "AMBER";
}
