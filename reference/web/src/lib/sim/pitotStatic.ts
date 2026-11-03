/**
 * ATA 34 — Boeing 737-200 pitot/static + air-data model.
 *
 * Architecture represented from the supplied 737-200 maintenance manual:
 *   • Four combined pitot/static probes: UL CAPT, UR F/O, LR AUX 1, LL AUX 2
 *   • CAPT normal static = UL + LR cross-connected sources
 *   • F/O normal static = UR + LL cross-connected sources
 *   • Two body-mounted alternate static sources, independently selected
 *       (CAPT → left port, F/O → right port)
 *   • Separate CAPT/F/O air-data processing paths
 *   • Auxiliary pitot/static paths and standby pneumatic indication
 *   • Probe heat/icing and removable probe-cover faults
 *   • Pressure-derived IAS, Mach, altitude and VSI rather than display-only flags
 *
 * The trainer state uses psFlightAltFt / psFlightCasKt / psFlightVsFpm as the
 * controlled atmospheric condition. When those values are absent, the model
 * remains compatible with the legacy flight-model aliases.
 *
 * Fix history:
 *   - Corrected alternateStaticTopology descriptive strings (CAPT = LEFT, F/O = RIGHT)
 *     to match runtime logic and the maintenance manual.
 */

export type StaticSource = "NORMAL" | "ALTERNATE";
export type ProbeName = "CAPT" | "FO" | "AUX1" | "AUX2";

export type PitotProbeState = {
  name: ProbeName;
  pitotOk: boolean;
  staticOk: boolean;
  heaterOn: boolean;
  heaterFault: boolean;
  heaterIndicatorOn: boolean;
  pitotBlocked: boolean;
  staticBlocked: boolean;
  coverOn: boolean;
  iced: boolean;
};

export type StaticSourceState = {
  leftOk: boolean;
  rightOk: boolean;
  selected: StaticSource;
  selectedOk: boolean;
  pressureHpa: number;
  source: "NORMAL" | "ALTERNATE_LEFT" | "ALTERNATE_RIGHT";
};

export type PitotStaticInput = {
  psFlightCasKt: number;
  psIcing: boolean;
  probeHeatCaptPitot: boolean;
  probeHeatFoPitot: boolean;
  psPitotCaptCover: boolean;
  psPitotCaptBlocked: boolean;
  psPitotFoCover: boolean;
  psPitotFoBlocked: boolean;
  psPitotAux1Cover: boolean;
  psPitotAux1Blocked: boolean;
  psPitotAux2Cover: boolean;
  psPitotAux2Blocked: boolean;
  psStaticCaptL: boolean;
  psStaticCaptR: boolean;
  psStaticFoL: boolean;
  psStaticFoR: boolean;
  psAltStaticCapt: boolean;
  psAltStaticFo: boolean;
  [key: string]: unknown;
};

export type SideAirData = {
  iasKt: number;
  altFt: number;
  vsiFpm: number;
  mach: number;
  pitotOk: boolean;
  staticOk: boolean;
  staticSource: StaticSource;
  flags: string[];
  probe: PitotProbeState;
  staticSourceState: StaticSourceState;
  pitotPressureHpa: number;
  staticPressureHpa: number;
  dynamicPressureHpa: number;
  adc: { channel: 1 | 2; valid: boolean; data: CadcData };
};

export type CadcData = {
  channel: 1 | 2;
  powered: boolean;
  ac115: boolean;
  ac26: boolean;
  cbClosed: boolean;
  testMode: "OFF" | "FUNCTION" | "SLEW" | "FAIL";
  testValid: boolean;
  failed: boolean;
  inputs: { psHpa: number; ptHpa: number; tiK: number };
  outputs: { correctedAltitudeFt: number; indicatedAirspeedKt: number; mach: number; altitudeRateFpm: number; staticAirTempK: number };
  flags: string[];
};

export type AirData = {
  capt: SideAirData;
  fo: SideAirData;
  standby: {
    iasKt: number; altFt: number; vsiFpm: number; mach: number;
    pitotOk: boolean; staticOk: boolean; flags: string[];
    pitotPressureHpa: number; staticPressureHpa: number;
  };
  aux1: PitotProbeState;
  aux2: PitotProbeState;
  aux1PitotOk: boolean; aux2PitotOk: boolean;
  aux1PitotPressureHpa: number; aux2PitotPressureHpa: number;
  aux1StaticPressureHpa: number; aux2StaticPressureHpa: number;
  aux1StaticOk: boolean; aux2StaticOk: boolean;
  elevPitotLOk: boolean; elevPitotROk: boolean;
  alternateStatic: {
    leftOk: boolean; rightOk: boolean;
    leftPressureHpa: number; rightPressureHpa: number;
    leftLeak: boolean; rightLeak: boolean;
  };
  flight: { altFt: number; casKt: number; vsiFpm: number; trainer: boolean; staticPressureHpa: number };
  disagree: boolean; coverOnInMotion: boolean;
  architecture: Record<string, unknown>;
  downstream: Record<string, unknown>;
  maintenance: Record<string, unknown>;
};

const SEA_LEVEL_HPA = 1013.25;
const SEA_LEVEL_TEMP_K = 288.15;
const LAPSE_K_PER_M = 0.0065;
const R_AIR = 287.05287;
const G = 9.80665;
const GAMMA = 1.4;
const A0_KT = 661.4788;
const FT_PER_M = 3.280839895;

const n = (v: unknown, fallback = 0) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
};
const b = (v: unknown, fallback = false) => (v === undefined ? fallback : Boolean(v));

function first(s: any, keys: string[], fallback: unknown = undefined) {
  for (const key of keys) {
    const parts = key.split(".");
    let v = s;
    for (const part of parts) v = v?.[part];
    if (v !== undefined && v !== null) return v;
  }
  return fallback;
}

function atmosphere(altFt: number) {
  const h = Math.max(-5000, Math.min(60000, altFt)) / FT_PER_M;
  if (h <= 11000) {
    const T = SEA_LEVEL_TEMP_K - LAPSE_K_PER_M * h;
    const p = SEA_LEVEL_HPA * Math.pow(T / SEA_LEVEL_TEMP_K, G / (R_AIR * LAPSE_K_PER_M));
    return { pHpa: p, tempK: T };
  }
  const t11 = SEA_LEVEL_TEMP_K - LAPSE_K_PER_M * 11000;
  const p11 = SEA_LEVEL_HPA * Math.pow(t11 / SEA_LEVEL_TEMP_K, G / (R_AIR * LAPSE_K_PER_M));
  const T = t11;
  const p = p11 * Math.exp((-G * (h - 11000)) / (R_AIR * T));
  return { pHpa: p, tempK: T };
}

function altitudeFromStatic(pHpa: number) {
  const p = Math.max(1, pHpa);
  const exponent = R_AIR * LAPSE_K_PER_M / G;
  const h = (SEA_LEVEL_TEMP_K / LAPSE_K_PER_M) * (1 - Math.pow(p / SEA_LEVEL_HPA, exponent));
  return h * FT_PER_M;
}

function leakToward(targetHpa: number, currentHpa: number, leak: boolean, ratePctPerSec: number, elapsedSec: number) {
  if (!leak || ratePctPerSec <= 0 || elapsedSec <= 0) return currentHpa;
  const k = Math.min(1, 1 - Math.exp(-(ratePctPerSec / 100) * elapsedSec));
  return currentHpa + (targetHpa - currentHpa) * k;
}

/** Shared icing rule used by the schematic and the live pitot/static model.
 * The legacy three-argument signature is retained for callers that only have the
 * requested heat state and DC indication power. The fourth/fifth arguments allow
 * the electrical model to be supplied when available.
 */
export function pitotIced(icing: unknown, heatRequested: unknown, dcPower: unknown, acPower = true, heaterCb = true, groupEnabled = false) {
  const icingOn = Boolean(icing);
  const requested = Boolean(heatRequested) || Boolean(groupEnabled);
  const heaterActuallyOn = requested && Boolean(acPower) && Boolean(heaterCb);
  // The probe heater itself is a 115-V AC load. The 28-V DC circuit only
  // powers the current-sensing/indication path and therefore must not change
  // the physical anti-ice result.
  return icingOn && !heaterActuallyOn;
}

function warningThresholds(s: any) {
  // The supplied ATA 34 excerpt identifies the Mach/airspeed warning switches
  // but does not provide their exact trip setting, so the trainer uses the
  // documented Mach-domain warning interface and never invents a knot limit.
  return { mach: n(first(s, ["machWarningThreshold", "psMachWarningThreshold"]), 0.84) };
}

/** Impact pressure corresponding to calibrated airspeed at sea-level standard density. */
function impactPressureFromCas(casKt: number) {
  const m = Math.max(0, casKt) / A0_KT;
  return SEA_LEVEL_HPA * (Math.pow(1 + ((GAMMA - 1) / 2) * m * m, GAMMA / (GAMMA - 1)) - 1);
}

function machFromDynamicPressure(qHpa: number, staticHpa: number) {
  if (qHpa <= 0 || staticHpa <= 0) return 0;
  const ratio = Math.max(1, qHpa / staticHpa + 1);
  return Math.sqrt((2 / (GAMMA - 1)) * (Math.pow(ratio, (GAMMA - 1) / GAMMA) - 1));
}

function casFromDynamicPressure(qHpa: number) {
  if (qHpa <= 0) return 0;
  const term = Math.pow(qHpa / SEA_LEVEL_HPA + 1, (GAMMA - 1) / GAMMA) - 1;
  return A0_KT * Math.sqrt(Math.max(0, (2 / (GAMMA - 1)) * term));
}

/** 737-200 operating limits shown by the ASI barber pole: VMO 340 KIAS up to the altitude where MMO (M 0.84, same value the Mach warning uses) becomes the lower IAS. TRAINING VALUES: confirm against the AFM / AMM 34-12. */
export const VMO_KT = 340;
export const MMO = 0.84;
/** Barber-pole IAS for the given static pressure: the lower of VMO and the IAS that corresponds to MMO at that pressure. */
export function vmoMmoLimitKt(staticPressureHpa: number): number {
  if (!Number.isFinite(staticPressureHpa) || staticPressureHpa <= 0) return VMO_KT;
  const qAtMmo = staticPressureHpa * (Math.pow(1 + ((GAMMA - 1) / 2) * MMO * MMO, GAMMA / (GAMMA - 1)) - 1);
  return Math.min(VMO_KT, casFromDynamicPressure(qAtMmo));
}

function source(s: any, side: "capt" | "fo"): StaticSource {
  const trainer = side === "capt" ? first(s, ["psAltStaticCapt"]) : first(s, ["psAltStaticFo"]);
  if (trainer !== undefined) return b(trainer) ? "ALTERNATE" : "NORMAL";
  const v = String(first(s, [
    `${side}.staticSource`, `${side}.staticSourceSelector`, `${side}StaticSource`,
    `${side}StaticSelector`, `air.${side}.staticSource`, `air.${side}.staticSourceSelector`,
  ], "NORMAL")).toUpperCase();
  return v === "ALTERNATE" || v === "ALT" ? "ALTERNATE" : "NORMAL";
}

function heatState(s: any, side: "capt" | "fo", acPower: boolean, dcPower: boolean) {
  const groupKey = side === "capt" ? "psPitotStaticA" : "psPitotStaticB";
  const legacyKey = side === "capt" ? "probeHeatCaptPitot" : "probeHeatFoPitot";
  const hasGroupCommand = s[groupKey] !== undefined;
  const groupOn = hasGroupCommand ? b(s[groupKey], false) : b(first(s, [legacyKey, `${side}.pitotHeat`, `${side}PitotHeat`, `${side}PitotHeater`]), false);
  const cb = side === "capt"
    ? b(first(s, ["psCbCaptUpperL", "psPitotCaptHeatCb"]), true)
    : b(first(s, ["psCbFoUpperR", "psPitotFoHeatCb"]), true);
  const on = groupOn && acPower && cb;
  return { requested: groupOn, on, fault: groupOn && (!acPower || !cb), indicationPowered: dcPower, indicatorOn: dcPower && !on };
}

function componentHeatState(s: any, requestKey: string, groupKey: string, cbKey: string, acPower: boolean, dcPower: boolean) {
  const groupOn = b(first(s, [groupKey]), false);
  const requested = groupOn;
  const cb = b(first(s, [cbKey, "psCbTemp"]), true);
  const on = groupOn && acPower && cb;
  return { requested, on, fault: requested && (!acPower || !cb), indicatorOn: dcPower && !on };
}

function probe(s: any, side: "capt" | "fo", acPower: boolean, dcPower: boolean): PitotProbeState {
  const prefix = side === "capt" ? "captPitotStatic" : "foPitotStatic";
  const name: ProbeName = side === "capt" ? "CAPT" : "FO";
  const blocked = b(first(s, [`${side === "capt" ? "psPitotCaptBlocked" : "psPitotFoBlocked"}`, `${prefix}.pitotBlocked`, `${side}.pitotBlocked`]), false);
  const cover = b(first(s, [`${side === "capt" ? "psPitotCaptCover" : "psPitotFoCover"}`, `${prefix}.coverOn`, `${side}.probeCover`]), false);
  const pitotFault = b(first(s, [`${prefix}.pitotFault`, `${side}PitotFault`]), false);
  const staticFault = b(first(s, [`${prefix}.staticFault`, `${side}StaticFault`]), false);
  const heat = heatState(s, side, acPower, dcPower);
  const icing = b(s?.icingConditions, false) || b(first(s, ["psIcing", "icing", "pitotStaticIcing"]), false);
  const iced = icing && !heat.on;
  const staticBlocked = staticFault || cover;
  const pitotBlocked = blocked || cover || iced || pitotFault;
  return {
    name, pitotOk: !pitotBlocked, staticOk: !staticBlocked,
    heaterOn: heat.on, heaterFault: heat.fault, heaterIndicatorOn: heat.indicatorOn, pitotBlocked, staticBlocked,
    coverOn: cover, iced,
  };
}

function auxiliaryProbe(s: any, which: "aux1" | "aux2", acPower: boolean, dcPower: boolean): PitotProbeState {
  const name: ProbeName = which === "aux1" ? "AUX1" : "AUX2";
  const prefix = which === "aux1" ? "aux1PitotStatic" : "aux2PitotStatic";
  const blockedKey = which === "aux1" ? "psPitotAux1Blocked" : "psPitotAux2Blocked";
  const coverKey = which === "aux1" ? "psPitotAux1Cover" : "psPitotAux2Cover";
  const heatKey = which === "aux1" ? "probeHeatFoPitot" : "probeHeatCaptPitot";
  const blocked = b(first(s, [blockedKey, `${prefix}.pitotBlocked`, `${which}PitotBlocked`]), false);
  const cover = b(first(s, [coverKey, `${prefix}.coverOn`]), false);
  const icing = b(s?.icingConditions, false) || b(first(s, ["psIcing", "icing", "pitotStaticIcing"]), false);
  const heaterRequested = b(first(s, [heatKey]), false);
  const group = which === "aux1" ? b(first(s, ["psPitotStaticB"]), false) : b(first(s, ["psPitotStaticA"]), false);
  const hasGroupCommand = which === "aux1" ? s.psPitotStaticB !== undefined : s.psPitotStaticA !== undefined;
  const groupOn = hasGroupCommand ? group : heaterRequested;
  const cb = which === "aux1" ? b(first(s, ["psCbFoLowerR", "psPitotAux1HeatCb"]), true) : b(first(s, ["psCbCaptLowerL", "psPitotAux2HeatCb"]), true);
  const heaterOn = groupOn && acPower && cb;
  const iced = icing && !heaterOn;
  return {
    name,
    pitotOk: !(blocked || cover || iced),
    staticOk: !(blocked || cover),
    heaterOn,
    heaterFault: groupOn && (!acPower || !cb),
    heaterIndicatorOn: dcPower && !heaterOn,
    pitotBlocked: blocked || cover || iced,
    staticBlocked: blocked || cover,
    coverOn: cover,
    iced,
  };
}

function alternateStatic(s: any, flightStaticHpa: number) {
  const leftBlocked = b(first(s, ["alternateStaticLeftBlocked", "alternateStatic.left.blocked", "alternateStatic.leftBlocked", "altStaticLeftBlocked"]), false);
  const rightBlocked = b(first(s, ["alternateStaticRightBlocked", "alternateStatic.right.blocked", "alternateStatic.rightBlocked", "altStaticRightBlocked"]), false);
  const leftFault = b(first(s, ["alternateStaticLeftFault", "alternateStatic.left.fault", "altStaticLeftFault"]), false);
  const rightFault = b(first(s, ["alternateStaticRightFault", "alternateStatic.right.fault", "altStaticRightFault"]), false);
  const leftLeak = b(first(s, ["psAltStaticCaptLeak", "alternateStaticLeftLeak"]), false);
  const rightLeak = b(first(s, ["psAltStaticFoLeak", "alternateStaticRightLeak"]), false);
  const elapsed = n(s.psTestClockSec, 0);
  const rate = n(s.psStaticLeakRatePctPerSec, 0.5);
  const testP = atmosphere(22500).pHpa;
  const testTarget = s.psTestTarget ?? "ALL";
  const leftTest = b(s.psTestVacuumSource, false) && (testTarget === "ALL" || testTarget === "CAPT" || testTarget === "ALTERNATE");
  const rightTest = b(s.psTestVacuumSource, false) && (testTarget === "ALL" || testTarget === "FO" || testTarget === "ALTERNATE");
  return {
    leftOk: !(leftBlocked || leftFault), rightOk: !(rightBlocked || rightFault),
    leftPressureHpa: leftTest ? (leftLeak ? leakToward(flightStaticHpa, testP, true, rate, elapsed) : testP) : flightStaticHpa,
    rightPressureHpa: rightTest ? (rightLeak ? leakToward(flightStaticHpa, testP, true, rate, elapsed) : testP) : flightStaticHpa,
    leftLeak, rightLeak,
  };
}

/** True when the trainer flight state (psFlight*) drives air data: the Pitot/Static trainer is open, OR the airplane has been put
 *  airborne (WOW off) with a flight airspeed set (Flight mode button / 12 nm final). Without this, IAS/altitude read the legacy
 *  keys that do not exist in the sim state and every instrument stays at zero outside the Pitot/Static section. */
export function flightStateActive(s: any): boolean {
  if (b(s?.psTrainerEnabled, false)) return true;
  if (b(s?.wow, true) && b(s?.psGroundRoll, false) && n(s?.psFlightCasKt, 0) > 0) return true; // takeoff / landing roll: IAS follows ground speed
  return !b(s?.wow, true) && n(s?.psFlightCasKt, 0) > 0;
}

function flightInputs(s: any) {
  const trainer = flightStateActive(s);
  const altFt = n(first(s, trainer ? ["psFlightAltFt"] : ["altFt", "altitudeFt", "pressureAltitudeFt", "air.altFt", "flight.altFt"]));
  const casKt = n(first(s, trainer ? ["psFlightCasKt"] : ["iasKt", "indicatedAirspeedKt", "air.iasKt", "flight.iasKt"]));
  const vsiFpm = n(first(s, trainer ? ["psFlightVsFpm"] : ["vsiFpm", "verticalSpeedFpm", "air.vsiFpm", "flight.vsiFpm"]));
  return { altFt, casKt, vsiFpm, trainer };
}

function normalStaticPressure(s: any, side: "capt" | "fo", flightStaticHpa: number, p: PitotProbeState) {
  const portL = side === "capt"
    ? b(s.psStaticCaptL) || b(s.psPitotCaptCover) || b(s.captPitotStatic?.staticFault)
    : b(s.psStaticFoL) || b(s.psPitotAux2Cover) || b(s.aux2PitotStatic?.staticFault);
  const portR = side === "capt"
    ? b(s.psStaticCaptR) || b(s.psPitotAux1Cover) || b(s.aux1PitotStatic?.staticFault)
    : b(s.psStaticFoR) || b(s.psPitotFoCover) || b(s.foPitotStatic?.staticFault);
  const frozen = side === "capt" ? n(s.psStaticCaptFrozenAltFt, n(s.psFlightAltFt)) : n(s.psStaticFoFrozenAltFt, n(s.psFlightAltFt));
  const openCount = Number(!portL) + Number(!portR);
  const leakKey = side === "capt" ? "psStaticCaptLeak" : "psStaticFoLeak";
  const leak = b(s[leakKey], false);
  const elapsed = n(s.psTestClockSec, 0);
  const testTarget = s.psTestTarget ?? "ALL";
  const target = b(s.psTestVacuumSource, false) && (testTarget === "ALL" || testTarget === side.toUpperCase())
    ? atmosphere(22500).pHpa
    : flightStaticHpa;

  if (openCount > 0) {
    const pressureHpa = b(s.psTestVacuumSource, false) && (testTarget === "ALL" || testTarget === side.toUpperCase())
      ? leakToward(flightStaticHpa, target, leak, n(s.psStaticLeakRatePctPerSec, 0.5), elapsed)
      : flightStaticHpa;
    return { ok: true, pressureHpa, onePortBlocked: openCount === 1, trapped: false, leak };
  }
  const trappedPressure = atmosphere(frozen).pHpa;
  const pressureHpa = leak
    ? leakToward(flightStaticHpa, trappedPressure, leak, n(s.psStaticLeakRatePctPerSec, 0.5), elapsed)
    : trappedPressure;
  return { ok: true, pressureHpa, onePortBlocked: false, trapped: true, leak };
}

function indicatedAltitude(pressureAltFt: number, qnhHpa: number) {
  // Standard-pressure altitude adjusted by the selected barometric reference.
  // The trainer does not specify a separate temperature error model.
  if (!Number.isFinite(qnhHpa) || qnhHpa <= 0) return pressureAltFt;
  return pressureAltFt + (qnhHpa - SEA_LEVEL_HPA) * 27.0;
}

function cadcPower(s: any, channel: 1 | 2, dcPower: boolean, acPower: boolean) {
  const cbClosed = b(s[channel === 1 ? "psCadc1Cb" : "psCadc2Cb"], true);
  // ATA 34 DADC electrical inputs are 115-V AC and 26-V AC. The simulator's
  // aircraft AC source represents both buses; individual inputs remain faultable
  // so a missing 26-V reference cannot be silently replaced by DC power.
  const ac115 = b(s[channel === 1 ? "psCadc1Ac115" : "psCadc2Ac115"], true) && acPower;
  const ac26 = b(s[channel === 1 ? "psCadc1Ac26" : "psCadc2Ac26"], true) && acPower;
  return { cbClosed, ac115, ac26, powered: cbClosed && ac115 && ac26 };
}

function cadcProcess(
  s: any,
  channel: 1 | 2,
  psHpa: number,
  ptHpa: number,
  tiK: number,
  vsiFpm: number,
  qnhHpa: number,
  dcPower: boolean,
  acPower: boolean,
): CadcData {
  const pwr = cadcPower(s, channel, dcPower, acPower);
  const mode = String(s[channel === 1 ? "psCadc1Test" : "psCadc2Test"] ?? "OFF").toUpperCase() as CadcData["testMode"];
  const testRequested = mode !== "OFF";
  const testValid = (mode === "FUNCTION" || mode === "SLEW") && pwr.powered;
  const failed = mode === "FAIL" || !pwr.powered;
  let testPs = psHpa;
  let testPt = ptHpa;
  let testVsi = vsiFpm;
  if (mode === "FUNCTION") {
    testPs = atmosphere(10000).pHpa;
    testPt = testPs + impactPressureFromCas(180);
  } else if (mode === "SLEW") {
    testPs = atmosphere(Math.max(-5000, altitudeFromStatic(psHpa) + 600)).pHpa;
    testPt = testPs + Math.max(0, ptHpa - psHpa);
    testVsi = 600;
  }
  const effectivePs = failed ? psHpa : testRequested && testValid ? testPs : psHpa;
  const effectivePt = failed ? ptHpa : testRequested && testValid ? testPt : ptHpa;
  const q = Math.max(0, effectivePt - effectivePs);
  const ias = casFromDynamicPressure(q);
  const mach = machFromDynamicPressure(q, effectivePs);
  const pressureAlt = altitudeFromStatic(effectivePs);
  const correctedAlt = indicatedAltitude(pressureAlt, qnhHpa);
  const flags: string[] = [];
  if (!pwr.cbClosed) flags.push("CADC CB OPEN");
  if (!pwr.ac115) flags.push("115V AC FAIL");
  if (!pwr.ac26) flags.push("26V AC FAIL");
  if (mode === "FAIL") flags.push("CADC TEST FAIL");
  if (testRequested && !testValid) flags.push("TEST INVALID");
  return {
    channel, powered: pwr.powered, ac115: pwr.ac115, ac26: pwr.ac26, cbClosed: pwr.cbClosed,
    testMode: mode, testValid, failed,
    inputs: { psHpa: effectivePs, ptHpa: effectivePt, tiK },
    outputs: { correctedAltitudeFt: correctedAlt, indicatedAirspeedKt: ias, mach, altitudeRateFpm: failed ? 0 : testRequested && testValid ? testVsi : vsiFpm, staticAirTempK: tiK },
    flags,
  };
}

function rawLegacy(s: any, side: "capt" | "fo") {
  return {
    ias: n(first(s, [`${side}.iasKt`, `air.${side}.iasKt`, `${side}IasKt`, "iasKt", "indicatedAirspeedKt"])),
    alt: n(first(s, [`${side}.altFt`, `air.${side}.altFt`, `${side}AltFt`, "altFt", "altitudeFt"])),
    vsi: n(first(s, [`${side}.vsiFpm`, `air.${side}.vsiFpm`, `${side}VsiFpm`, "vsiFpm", "verticalSpeedFpm"])),
  };
}

function sideData(s: any, side: "capt" | "fo", dcPower: boolean, acPower: boolean, channel: 1 | 2, shared: ReturnType<typeof flightInputs>) : SideAirData {
  const p = probe(s, side, acPower, dcPower);
  const altFt = shared.altFt;
  const env = atmosphere(altFt);
  const testTarget = s.psTestTarget ?? "ALL";
  const alt = alternateStatic(s, env.pHpa);
  const normal = normalStaticPressure(s, side, env.pHpa, p);
  const crossTestActive = b(s.psTestVacuumSource, false) && (s.psTestTarget === "AUX1" || s.psTestTarget === "AUX2");
  const crossTestLeak = side === "capt" ? b(s.psAux1StaticLeak, false) : b(s.psAux2StaticLeak, false);
  const crossTestP = atmosphere(22500).pHpa;
  if (crossTestActive && crossTestLeak) {
    normal.pressureHpa = leakToward(env.pHpa, crossTestP, true, n(s.psStaticLeakRatePctPerSec, 0.5), n(s.psTestClockSec, 0));
  }
  const selected = source(s, side);
  // The AMM specifically includes a selector-valve leakage check after the
  // alternate-static vacuum test with the selector returned to NORMAL. Keep
  // that path separate from an alternate-port leak: a leaking selector can
  // allow the alternate vacuum to bleed into the normal static line even when
  // the alternate source itself is tight.
  const selectorLeak = side === "capt" ? b(s.psStaticSelectorCaptLeak, false) : b(s.psStaticSelectorFoLeak, false);
  if (selected === "NORMAL" && b(s.psTestVacuumSource, false) && testTarget === "ALTERNATE" && selectorLeak) {
    const alternateTestPressure = side === "capt" ? alt.leftPressureHpa : alt.rightPressureHpa;
    normal.pressureHpa = leakToward(normal.pressureHpa, alternateTestPressure, true, n(s.psStaticLeakRatePctPerSec, 0.5), n(s.psTestClockSec, 0));
  }
  const normalSelectedPressure = selected === "NORMAL" ? normal.pressureHpa : (side === "capt" ? alt.leftPressureHpa : alt.rightPressureHpa);
  const selectedStaticOk = selected === "NORMAL" ? normal.ok : (side === "capt" ? alt.leftOk : alt.rightOk);
  const testVacuum = b(s.psTestVacuumSource, false);
  const testPressure = b(s.psTestPressureSource, false);
  const testTargetsThisSide = testTarget === "ALL" || testTarget === side.toUpperCase() || testTarget === "ALTERNATE";
  const normalTestActive = testVacuum && (testTarget === "ALL" || testTarget === side.toUpperCase()) && selected === "NORMAL";
  const staticPressureHpa = normalTestActive ? atmosphere(22500).pHpa : normalSelectedPressure;
  const staticOk = normalTestActive ? true : selectedStaticOk;

  const raw = rawLegacy(s, side);
  const qnhHpa = n(first(s, [side === "capt" ? "psBaroCaptHpa" : "psBaroFoHpa"]), SEA_LEVEL_HPA);
  const testPitotThisSide = testTarget === "ALL" || testTarget === side.toUpperCase();
  const baseQ = testPressure && testPitotThisSide ? impactPressureFromCas(300) : (shared.trainer ? impactPressureFromCas(shared.casKt) : impactPressureFromCas(raw.ias));
  const pitotLeak = b(first(s, [side === "capt" ? "psPitotCaptLeak" : "psPitotFoLeak"]), false);
  const leakTargetQ = 0;
  const leakedQ = leakToward(leakTargetQ, baseQ, pitotLeak, n(s.psPitotLeakRatePctPerSec, 0.5), n(s.psTestClockSec, 0));
  const effectiveQ = p.pitotOk ? leakedQ : 0;
  const pitotPressureHpa = staticPressureHpa + effectiveQ;
  const dynamicPressureHpa = Math.max(0, pitotPressureHpa - staticPressureHpa);
  const tiK = atmosphere(altFt).tempK;
  const cadc = cadcProcess(s, channel, staticPressureHpa, pitotPressureHpa, tiK, staticOk && !normal.trapped ? (shared.trainer ? shared.vsiFpm : raw.vsi) : 0, qnhHpa, dcPower, acPower);
  const iasKt = p.pitotOk && staticOk && cadc.powered && !cadc.failed ? cadc.outputs.indicatedAirspeedKt : 0;
  const mach = p.pitotOk && staticOk && cadc.powered && !cadc.failed ? cadc.outputs.mach : 0;
  const altInd = staticOk && cadc.powered && !cadc.failed ? cadc.outputs.correctedAltitudeFt : 0;
  const vsi = staticOk && cadc.powered && !cadc.failed ? cadc.outputs.altitudeRateFpm : 0;

  const flags: string[] = [];
  if (!p.pitotOk) flags.push(p.coverOn ? "COVER" : p.iced ? "PITOT ICE" : "PITOT BLOCKED");
  if (selected === "NORMAL" && !p.staticOk) flags.push("STATIC BLOCKED");
  if (selected === "NORMAL" && normal.onePortBlocked) flags.push("ONE PORT BLOCKED");
  if (normal.trapped && selected === "NORMAL") flags.push("STATIC TRAPPED");
  if (selected === "ALTERNATE") {
    flags.push("ALT STATIC");
    if (!(side === "capt" ? alt.leftOk : alt.rightOk)) flags.push("ALT STATIC FAULT");
  }
  if (p.heaterOn) flags.push("PITOT HEAT");
  if (p.heaterFault) flags.push("PITOT HEAT FAULT");
  if (pitotLeak) flags.push("PITOT LEAK");
  if (normal.leak || alt.leftLeak || alt.rightLeak) flags.push("STATIC LEAK");

  return {
    iasKt, altFt: altInd, vsiFpm: vsi, mach,
    pitotOk: p.pitotOk, staticOk, staticSource: selected, flags,
    probe: p,
    staticSourceState: {
      leftOk: alt.leftOk, rightOk: alt.rightOk, selected,
      selectedOk: staticOk,
      pressureHpa: staticPressureHpa,
      source: selected === "NORMAL" ? "NORMAL" : side === "capt" ? "ALTERNATE_LEFT" : "ALTERNATE_RIGHT",
    },
    pitotPressureHpa, staticPressureHpa, dynamicPressureHpa,
    adc: { channel, valid: p.pitotOk && staticOk && cadc.powered && !cadc.failed, data: cadc },
  };
}

export function computeAirData(s: any, dcPower?: unknown, acPower?: unknown) {
  const dc = dcPower === undefined ? true : Boolean(dcPower);
  const ac = acPower === undefined ? true : Boolean(acPower);
  const flight = flightInputs(s);
  const capt = sideData(s, "capt", dc, ac, 1, flight);
  const fo = sideData(s, "fo", dc, ac, 2, flight);
  const aux1 = auxiliaryProbe(s, "aux1", ac, dc);
  const aux2 = auxiliaryProbe(s, "aux2", ac, dc);
  const env = atmosphere(flight.altFt);
  const testTarget = s.psTestTarget ?? "ALL";
  const alt = alternateStatic(s, env.pHpa);
  const aux1StaticPressureHpa = b(s.psTestVacuumSource, false) && (testTarget === "ALL" || testTarget === "AUX1")
    ? leakToward(env.pHpa, atmosphere(22500).pHpa, b(s.psAux1StaticLeak, false), n(s.psStaticLeakRatePctPerSec, 0.5), n(s.psTestClockSec, 0))
    : env.pHpa;
  const aux2StaticPressureHpa = b(s.psTestVacuumSource, false) && (testTarget === "ALL" || testTarget === "AUX2")
    ? leakToward(env.pHpa, atmosphere(22500).pHpa, b(s.psAux2StaticLeak, false), n(s.psStaticLeakRatePctPerSec, 0.5), n(s.psTestClockSec, 0))
    : env.pHpa;

  const standbyPitotBlocked = b(first(s, ["standby.pitotBlocked", "standbyPitotBlocked", "standby.pitotFault"]), false);
  const standbyStaticBlocked = b(first(s, ["standby.staticBlocked", "standbyStaticBlocked", "standby.staticFault"]), false);
  // The combined standby ALT/AS indicator is pneumatic; its vibrator is an
  // independent electrical load, so loss of the main DC bus does not erase
  // the pneumatic indication.
  const standbyPitotLeak = b(s.psStandbyPitotLeak, false);
  const standbyStaticLeak = b(s.psStandbyStaticLeak, false);
  const standbyTest = b(s.psTestVacuumSource, false) && (testTarget === "ALL" || testTarget === "CAPT");
  const standbyTestP = atmosphere(22500).pHpa;
  const standbyStaticBase = standbyTest ? standbyTestP : (n(s.psStandbyStaticFrozenAltFt, flight.altFt) !== flight.altFt && standbyStaticBlocked ? atmosphere(n(s.psStandbyStaticFrozenAltFt, flight.altFt)).pHpa : env.pHpa);
  const standbyStaticP = standbyTest ? leakToward(env.pHpa, standbyTestP, standbyStaticLeak, n(s.psStaticLeakRatePctPerSec, 0.5), n(s.psTestClockSec, 0)) : (standbyStaticLeak && standbyStaticBlocked ? leakToward(env.pHpa, standbyStaticBase, standbyStaticLeak, n(s.psStaticLeakRatePctPerSec, 0.5), n(s.psTestClockSec, 0)) : standbyStaticBase);
  const standbyQBase = impactPressureFromCas(flight.casKt);
  const standbyQ = b(s.psTestPressureSource, false) && (testTarget === "ALL" || testTarget === "CAPT")
    ? leakToward(0, impactPressureFromCas(300), standbyPitotLeak, n(s.psPitotLeakRatePctPerSec, 0.5), n(s.psTestClockSec, 0))
    : leakToward(0, standbyQBase, standbyPitotLeak, n(s.psPitotLeakRatePctPerSec, 0.5), n(s.psTestClockSec, 0));
  const standbyPitotOk = !standbyPitotBlocked;
  const standbyStaticOk = !standbyStaticBlocked;
  const standbyIas = standbyPitotOk && standbyStaticOk ? casFromDynamicPressure(standbyQ) : 0;
  const standbyMach = standbyPitotOk && standbyStaticOk ? machFromDynamicPressure(standbyQ, standbyStaticP) : 0;
  const standbyFlags: string[] = [];
  if (!standbyPitotOk) standbyFlags.push("STANDBY PITOT FAULT");
  if (!standbyStaticOk) standbyFlags.push("STANDBY STATIC FAULT");

  const aux1PitotPressureHpa = b(s.psTestPressureSource, false) && (testTarget === "ALL" || testTarget === "AUX1")
    ? env.pHpa + (aux1.pitotOk ? leakToward(0, impactPressureFromCas(300), b(s.psAux1PitotLeak,false), n(s.psPitotLeakRatePctPerSec,0.5), n(s.psTestClockSec,0)) : 0)
    : env.pHpa + (aux1.pitotOk ? leakToward(0, impactPressureFromCas(flight.casKt), b(s.psAux1PitotLeak,false), n(s.psPitotLeakRatePctPerSec,0.5), n(s.psTestClockSec,0)) : 0);
  const aux2PitotPressureHpa = b(s.psTestPressureSource, false) && (testTarget === "ALL" || testTarget === "AUX2")
    ? env.pHpa + (aux2.pitotOk ? leakToward(0, impactPressureFromCas(300), b(s.psAux2PitotLeak,false), n(s.psPitotLeakRatePctPerSec,0.5), n(s.psTestClockSec,0)) : 0)
    : env.pHpa + (aux2.pitotOk ? leakToward(0, impactPressureFromCas(flight.casKt), b(s.psAux2PitotLeak,false), n(s.psPitotLeakRatePctPerSec,0.5), n(s.psTestClockSec,0)) : 0);

  const heaterStates = {
    captUpperL: heatState(s, "capt", ac, dc),
    captLowerR: { requested: b(s.psPitotStaticA, false), on: b(s.psPitotStaticA, false) && ac && b(s.psCbCaptLowerL, true), fault: b(s.psPitotStaticA, false) && (!ac || !b(s.psCbCaptLowerL, true)), indicatorOn: dc && !(b(s.psPitotStaticA, false) && ac && b(s.psCbCaptLowerL, true)) },
    foUpperR: heatState(s, "fo", ac, dc),
    foLowerL: { requested: b(s.psPitotStaticB, false), on: b(s.psPitotStaticB, false) && ac && b(s.psCbFoLowerR, true), fault: b(s.psPitotStaticB, false) && (!ac || !b(s.psCbFoLowerR, true)), indicatorOn: dc && !(b(s.psPitotStaticB, false) && ac && b(s.psCbFoLowerR, true)) },
    elevatorL: componentHeatState(s, "probeHeatElevL", "psPitotStaticA", "psCbElevL", ac, dc),
    elevatorR: componentHeatState(s, "probeHeatElevR", "psPitotStaticB", "psCbElevR", ac, dc),
    temperatureL: componentHeatState(s, "probeHeatTemp", "psPitotStaticA", "psCbTempL", ac, dc),
    temperatureR: componentHeatState(s, "probeHeatTemp", "psPitotStaticB", "psCbTempR", ac, dc),
  };

  const testPressureActive = b(s.psTestPressureSource, false);
  const testVacuumActive = b(s.psTestVacuumSource, false);
  const pitotTarget = (target: string) => testPressureActive && (testTarget === "ALL" || testTarget === target);
  const staticTarget = (target: string) => testVacuumActive && (testTarget === "ALL" || testTarget === target);
  const leakLimits = { pitotKtPerMin: 5, staticFtPerMin: 400 };
  const elapsedMin = Math.max(n(s.psTestClockSec, 0) / 60, 1 / 60);
  const pitotLossRate = (observedKt: number) => Math.max(0, 300 - observedKt) / elapsedMin;
  const staticDriftRate = (observedFt: number) => Math.abs(observedFt - 22500) / elapsedMin;
  const pitotLeakage = {
    capt: pitotTarget("CAPT") ? { observedKt: capt.iasKt, lossKt: Math.max(0, 300 - capt.iasKt), lossRateKtPerMin: pitotLossRate(capt.iasKt), pass: pitotLossRate(capt.iasKt) <= leakLimits.pitotKtPerMin } : { observedKt: null, lossKt: null, lossRateKtPerMin: null, pass: null },
    fo: pitotTarget("FO") ? { observedKt: fo.iasKt, lossKt: Math.max(0, 300 - fo.iasKt), lossRateKtPerMin: pitotLossRate(fo.iasKt), pass: pitotLossRate(fo.iasKt) <= leakLimits.pitotKtPerMin } : { observedKt: null, lossKt: null, lossRateKtPerMin: null, pass: null },
    aux1: pitotTarget("AUX1") ? { observedKt: casFromDynamicPressure(Math.max(0, aux1PitotPressureHpa - env.pHpa)), lossKt: Math.max(0, 300 - casFromDynamicPressure(Math.max(0, aux1PitotPressureHpa - env.pHpa))), lossRateKtPerMin: pitotLossRate(casFromDynamicPressure(Math.max(0, aux1PitotPressureHpa - env.pHpa))), pass: pitotLossRate(casFromDynamicPressure(Math.max(0, aux1PitotPressureHpa - env.pHpa))) <= leakLimits.pitotKtPerMin } : { observedKt: null, lossKt: null, lossRateKtPerMin: null, pass: null },
    aux2: pitotTarget("AUX2") ? { observedKt: casFromDynamicPressure(Math.max(0, aux2PitotPressureHpa - env.pHpa)), lossKt: Math.max(0, 300 - casFromDynamicPressure(Math.max(0, aux2PitotPressureHpa - env.pHpa))), lossRateKtPerMin: pitotLossRate(casFromDynamicPressure(Math.max(0, aux2PitotPressureHpa - env.pHpa))), pass: pitotLossRate(casFromDynamicPressure(Math.max(0, aux2PitotPressureHpa - env.pHpa))) <= leakLimits.pitotKtPerMin } : { observedKt: null, lossKt: null, lossRateKtPerMin: null, pass: null },
  };
  const staticLeakage = {
    capt: staticTarget("CAPT") ? { observedFt: capt.altFt, driftFt: Math.abs(capt.altFt - 22500), driftRateFtPerMin: staticDriftRate(capt.altFt), pass: staticDriftRate(capt.altFt) <= leakLimits.staticFtPerMin } : { observedFt: null, driftFt: null, driftRateFtPerMin: null, pass: null },
    fo: staticTarget("FO") ? { observedFt: fo.altFt, driftFt: Math.abs(fo.altFt - 22500), driftRateFtPerMin: staticDriftRate(fo.altFt), pass: staticDriftRate(fo.altFt) <= leakLimits.staticFtPerMin } : { observedFt: null, driftFt: null, driftRateFtPerMin: null, pass: null },
    aux1: staticTarget("AUX1") ? { observedFt: altitudeFromStatic(aux1StaticPressureHpa), driftFt: Math.abs(altitudeFromStatic(aux1StaticPressureHpa) - 22500), driftRateFtPerMin: staticDriftRate(altitudeFromStatic(aux1StaticPressureHpa)), pass: staticDriftRate(altitudeFromStatic(aux1StaticPressureHpa)) <= leakLimits.staticFtPerMin } : { observedFt: null, driftFt: null, driftRateFtPerMin: null, pass: null },
    aux2: staticTarget("AUX2") ? { observedFt: altitudeFromStatic(aux2StaticPressureHpa), driftFt: Math.abs(altitudeFromStatic(aux2StaticPressureHpa) - 22500), driftRateFtPerMin: staticDriftRate(altitudeFromStatic(aux2StaticPressureHpa)), pass: staticDriftRate(altitudeFromStatic(aux2StaticPressureHpa)) <= leakLimits.staticFtPerMin } : { observedFt: null, driftFt: null, driftRateFtPerMin: null, pass: null },
    alternate: staticTarget("ALTERNATE") ? { observedFt: capt.altFt, driftFt: Math.abs(capt.altFt - 22500), driftRateFtPerMin: staticDriftRate(capt.altFt), pass: staticDriftRate(capt.altFt) <= leakLimits.staticFtPerMin } : { observedFt: null, driftFt: null, driftRateFtPerMin: null, pass: null },
  };

  return {
    capt, fo,
    standby: {
      iasKt: standbyIas,
      altFt: standbyStaticOk ? indicatedAltitude(altitudeFromStatic(standbyStaticP), n(first(s, ["psBaroStbyHpa"]), SEA_LEVEL_HPA)) : 0,
      vsiFpm: standbyStaticOk ? flight.vsiFpm : 0,
      mach: standbyMach,
      pitotOk: standbyPitotOk, staticOk: standbyStaticOk, flags: standbyFlags,
      pitotPressureHpa: standbyStaticP + standbyQ, staticPressureHpa: standbyStaticP,
    },
    aux1PitotOk: aux1.pitotOk,
    aux2PitotOk: aux2.pitotOk,
    aux1PitotPressureHpa,
    aux2PitotPressureHpa,
    aux1StaticPressureHpa: b(s.psTestVacuumSource, false) && (testTarget === "ALL" || testTarget === "AUX1")
      ? leakToward(env.pHpa, atmosphere(22500).pHpa, b(s.psAux1StaticLeak,false), n(s.psStaticLeakRatePctPerSec,0.5), n(s.psTestClockSec,0))
      : env.pHpa,
    aux2StaticPressureHpa: b(s.psTestVacuumSource, false) && (testTarget === "ALL" || testTarget === "AUX2")
      ? leakToward(env.pHpa, atmosphere(22500).pHpa, b(s.psAux2StaticLeak,false), n(s.psStaticLeakRatePctPerSec,0.5), n(s.psTestClockSec,0))
      : env.pHpa,
    aux1StaticOk: aux1.staticOk,
    aux2StaticOk: aux2.staticOk,
    aux1, aux2,
    elevPitotLOk: !b(first(s, ["psElevPitotLBlocked"]), false),
    elevPitotROk: !b(first(s, ["psElevPitotRBlocked"]), false),
    alternateStatic: alt,
    cadc: { capt: capt.adc.data, fo: fo.adc.data },
    flight: { ...flight, staticPressureHpa: env.pHpa },
    disagree: Math.abs(capt.iasKt - fo.iasKt) > 3 || Math.abs(capt.vsiFpm - fo.vsiFpm) > 150,
    coverOnInMotion: flight.casKt > 40 && (capt.probe.coverOn || fo.probe.coverOn || aux1.coverOn || aux2.coverOn),
    architecture: {
      probeCount: 4, alternateStaticPortCount: 2, staticSourceSelectors: 2, auxiliarySystems: 2, heaterCircuits: 8,
      drainTrapCount: 2, testFittingNetwork: true, leakageModel: true, cadcCount: 2, cadcIndependentPower: true, standbyPneumatic: true, heaterStates,
      normalStaticTopology: { capt: ["UPPER-LEFT", "LOWER-RIGHT"], fo: ["UPPER-RIGHT", "LOWER-LEFT"] },
      auxiliaryStaticTopology: { aux1: "LOWER-RIGHT", aux2: "LOWER-LEFT", crossLeakTests: { aux1Capt: true, aux2Fo: true } },
      alternateStaticTopology: { capt: "LEFT FLUSH BODY-MOUNTED STATIC PORTS", fo: "RIGHT FLUSH BODY-MOUNTED STATIC PORTS" },
      selectorValveLeakage: { capt: b(s.psStaticSelectorCaptLeak, false), fo: b(s.psStaticSelectorFoLeak, false) },
      drainTestFittings: { alternate: 5, aux2: 8, fo: 9, capt: 11, aux1: 12 },
    },
    downstream: {
      machAirspeedWarning: {
        capt: (capt.mach >= warningThresholds(s).mach || b(s.psMachWarningTest, false)) && !b(s.psAirspeedWarningInhibit, false) && capt.adc.valid,
        fo: (fo.mach >= warningThresholds(s).mach || b(s.psMachWarningTest, false)) && !b(s.psAirspeedWarningInhibit, false) && fo.adc.valid,
        test: b(s.psMachWarningTest, false),
        inhibited: b(s.psAirspeedWarningInhibit, false),
      },
      cabinDifferential: {
        staticPressureHpa: aux1StaticPressureHpa,
        pressureAltitudeFt: altitudeFromStatic(aux1StaticPressureHpa),
      },
      pressureController: {
        captStaticValid: capt.staticOk, foStaticValid: fo.staticOk,
        captPitotValid: capt.pitotOk, foPitotValid: fo.pitotOk,
      },
      // ATA 34 names these as CADC downstream consumers. They now receive the
      // channel-specific CADC outputs rather than generic trainer IAS/altitude.
      autopilot: { cadc1Valid: capt.adc.valid, altitudeFt: capt.adc.data.outputs.correctedAltitudeFt, airspeedKt: capt.adc.data.outputs.indicatedAirspeedKt, mach: capt.adc.data.outputs.mach },
      flightDirector: { cadc1Valid: capt.adc.valid, cadc2Valid: fo.adc.valid, captAltitudeFt: capt.adc.data.outputs.correctedAltitudeFt, foAltitudeFt: fo.adc.data.outputs.correctedAltitudeFt },
      machTrim: { cadc1Valid: capt.adc.valid, mach: capt.adc.data.outputs.mach },
      flapLoadLimiter: { auxiliaryStaticValid: aux1.staticOk && aux2.staticOk, speedKt: Math.max(capt.iasKt, fo.iasKt) },
      flightRecorder: { captAirDataValid: capt.adc.valid, foAirDataValid: fo.adc.valid, staticValid: capt.staticOk && fo.staticOk },
    },
    maintenance: {
      drainTraps: { captStatic: true, foStatic: true },
      testFittings: { pressure: b(s.psTestPressureSource, false), vacuum: b(s.psTestVacuumSource, false), target: testTarget,
        map: { 5: "ALTERNATE STATIC", 8: "AUX 2 STATIC", 9: "F/O STATIC", 11: "CAPT STATIC", 12: "AUX 1 STATIC" } },
      crossLeakTests: { aux1ToCapt: testVacuumActive && testTarget === "AUX1", aux2ToFo: testVacuumActive && testTarget === "AUX2" },
      selectorLeakage: { capt: b(s.psStaticSelectorCaptLeak, false), fo: b(s.psStaticSelectorFoLeak, false) },
      elapsedSec: n(s.psTestClockSec, 0),
      leakageLimits: { pitotKtPerMin: 5, staticFtPerMin: 400 },
      instrumentTolerances: { airspeedKt: 3, mach: 0.012, electricVsiFpm: 150, altimeterFt: "SEE AMM TABLE" },
      leakage: { pitot: pitotLeakage, static: staticLeakage },
    },
  };
}
