/**
 * ATA 34 / 22 — multi-channel instrument sources (AMM-aligned training model).
 *
 * Independent vertical gyro channels (VG-1, VG-2, AUX): freeze, drift, tumble,
 * erect (~60 s) with cutout in maneuvers, re-erect after power interrupt.
 * Compass channels support SLAVED/DG + SYNC flag.
 */
import type { SrcFail } from "./sources.ts";
import { sourcesOf } from "./sources.ts";

export interface GyroChannel {
  id: "gyro1" | "gyro2" | "gyroAux";
  powered: boolean;
  /** 0 = caged/off, 1 = erecting, 2 = erected */
  erect: 0 | 1 | 2;
  failed: boolean;
  valid: boolean;
  pitch: number;
  roll: number;
  frozen: boolean;
  tumbled: boolean;
}

export interface CompassChannel {
  id: "comp1" | "comp2";
  powered: boolean;
  failed: boolean;
  valid: boolean;
  hdg: number;
  syncFlag: boolean;
  mode: 0 | 1;
}

export interface NavRadioPower {
  nav1Vor: boolean;
  nav2Vor: boolean;
  nav1Gs: boolean;
  nav2Gs: boolean;
  nav1: boolean;
  nav2: boolean;
  dme1: boolean;
  dme2: boolean;
  adf1: boolean;
  adf2: boolean;
  comm1: boolean;
  comm2: boolean;
  hf1: boolean;
  hf2: boolean;
  lrra1: boolean;
  lrra2: boolean;
}

export interface SrcPower {
  nav1Cb: boolean;
  nav2Cb: boolean;
  nav1GsCb: boolean;
  nav2GsCb: boolean;
  dme1Cb: boolean;
  dme2Cb: boolean;
  adf1Cb: boolean;
  adf2Cb: boolean;
  comm1Cb: boolean;
  comm2Cb: boolean;
  hf1Cb: boolean;
  /** Trainer-separate HF-2 protection control; confirm exact aircraft breaker wiring by WDM/effectivity. */
  hf2Cb: boolean;
  lrra1Cb: boolean;
  lrra2Cb: boolean;
  gyro1Cb: boolean;
  gyro2Cb: boolean;
  gyroAuxCb: boolean;
  comp1Cb: boolean;
  comp2Cb: boolean;
  gyroFastErect: boolean;
}

export const DEFAULT_SRC_POWER: SrcPower = {
  nav1Cb: true,
  nav2Cb: true,
  nav1GsCb: true,
  nav2GsCb: true,
  dme1Cb: true,
  dme2Cb: true,
  adf1Cb: true,
  adf2Cb: true,
  comm1Cb: true,
  comm2Cb: true,
  hf1Cb: true,
  hf2Cb: true,
  lrra1Cb: true,
  lrra2Cb: true,
  gyro1Cb: true,
  gyro2Cb: true,
  gyroAuxCb: true,
  comp1Cb: true,
  comp2Cb: true,
  gyroFastErect: false,
};

const ERECT_SEC_NORMAL = 60;
const ERECT_SEC_FAST = 2.5;
/** Free gyro drift (deg/s) when valid but slightly imperfect */
const DRIFT_PITCH = 0.008;
const DRIFT_ROLL = 0.012;
/** Tumble threshold (deg/s body rate) */
const TUMBLE_RATE = 40;

export interface GyroMemory {
  pitch: number;
  roll: number;
  /** accumulated free drift offsets */
  driftP: number;
  driftR: number;
  tumbled: boolean;
  /** was powered last frame — detect power interrupt */
  wasPowered: boolean;
}

export interface ResolvedInstruments {
  gyros: { gyro1: GyroChannel; gyro2: GyroChannel; gyroAux: GyroChannel };
  compass: { comp1: CompassChannel; comp2: CompassChannel };
  radioPower: NavRadioPower;
  capt: {
    attValid: boolean;
    hdgValid: boolean;
    navPowered: boolean;
    navGsPowered: boolean;
    pitch: number;
    roll: number;
    hdg: number;
  };
  fo: {
    attValid: boolean;
    hdgValid: boolean;
    navPowered: boolean;
    navGsPowered: boolean;
    pitch: number;
    roll: number;
    hdg: number;
  };
}

export function stepErect(
  prev: 0 | 1 | 2,
  powered: boolean,
  failed: boolean,
  fast: boolean,
  dtSec: number,
  erectTimer: number,
  cutout = false,
  /** force re-erect after power interrupt */
  forceReerect = false,
): { erect: 0 | 1 | 2; timer: number } {
  if (!powered || failed) return { erect: 0, timer: 0 };
  if (forceReerect) return { erect: 1, timer: 0 };
  if (prev === 2) return { erect: 2, timer: 0 };
  if (cutout) {
    return { erect: prev === 0 ? 1 : prev, timer: erectTimer };
  }
  const need = fast ? ERECT_SEC_FAST : ERECT_SEC_NORMAL;
  const t = erectTimer + dtSec;
  if (prev === 0) return { erect: 1, timer: t };
  if (t >= need) return { erect: 2, timer: 0 };
  return { erect: 1, timer: t };
}

export function resolveInstrumentSources(args: {
  truePitch: number;
  trueRoll: number;
  trueHdg: number;
  acPower: boolean;
  dcPower: boolean;
  ac115?: boolean;
  ac26?: boolean;
  srcFail: SrcFail;
  srcPower: SrcPower;
  sel: { navSel: number; compSel: number; gyroSel: number };
  erectTimers?: { g1: number; g2: number; gAux: number };
  dtSec?: number;
  auxBiasDeg?: number;
  compSyncFlag?: { c1: boolean; c2: boolean };
  compMode?: { c1: 0 | 1; c2: 0 | 1 };
  gyroMem?: { g1: GyroMemory; g2: GyroMemory; gAux: GyroMemory };
  pitchRate?: number;
  rollRate?: number;
}): ResolvedInstruments & {
  erectTimers: { g1: number; g2: number; gAux: number };
  gyroMem: { g1: GyroMemory; g2: GyroMemory; gAux: GyroMemory };
} {
  const ac115 = args.ac115 ?? args.acPower;
  const ac26 = args.ac26 ?? args.acPower;
  const dc = args.dcPower;
  const dt = args.dtSec ?? 0.1;
  const timers = args.erectTimers ?? { g1: 0, g2: 0, gAux: 0 };
  const bias = args.auxBiasDeg ?? 0.4;
  const f = args.srcFail;
  const p = args.srcPower;
  const syncF = args.compSyncFlag ?? { c1: false, c2: false };
  const cMode = args.compMode ?? { c1: 0, c2: 0 };
  const emptyMem = (): GyroMemory => ({
    pitch: 0,
    roll: 0,
    driftP: 0,
    driftR: 0,
    tumbled: false,
    wasPowered: false,
  });
  const mem = args.gyroMem ?? { g1: emptyMem(), g2: emptyMem(), gAux: emptyMem() };
  const pRate = args.pitchRate ?? 0;
  const rRate = args.rollRate ?? 0;
  const cutout = Math.abs(pRate) > 3 || Math.abs(rRate) > 5;
  const tumbling = Math.abs(pRate) > TUMBLE_RATE || Math.abs(rRate) > TUMBLE_RATE;

  const mkGyro = (
    id: GyroChannel["id"],
    cb: boolean,
    failed: boolean,
    prevErect: 0 | 1 | 2,
    timerKey: "g1" | "g2" | "gAux",
    pitchOff: number,
    rollOff: number,
    last: GyroMemory,
    driftSign: number,
  ): { ch: GyroChannel; timer: number; mem: GyroMemory } => {
    const powered = ac115 && dc && cb;
    const powerInterrupt = last.wasPowered && !powered;
    const forceReerect = powerInterrupt;
    // tumble clears erect
    let erectIn = prevErect;
    let tumbled = last.tumbled;
    if (tumbling && powered) {
      tumbled = true;
      erectIn = 0;
    }
    if (powered && !tumbling && tumbled && prevErect === 0) {
      // start re-erect after tumble stops
      tumbled = false;
    }
    const stepped = stepErect(
      erectIn,
      powered,
      failed || tumbled,
      p.gyroFastErect,
      dt,
      timers[timerKey],
      cutout,
      forceReerect,
    );
    const valid = powered && !failed && !tumbled && stepped.erect === 2;

    let driftP = last.driftP;
    let driftR = last.driftR;
    let pitch: number;
    let roll: number;
    if (valid) {
      // slow independent drift while erected
      driftP += DRIFT_PITCH * driftSign * dt;
      driftR += DRIFT_ROLL * driftSign * dt;
      // clamp drift accumulation
      driftP = Math.max(-2, Math.min(2, driftP));
      driftR = Math.max(-2, Math.min(2, driftR));
      pitch = args.truePitch + pitchOff + driftP;
      roll = args.trueRoll + rollOff + driftR;
    } else {
      pitch = last.pitch;
      roll = last.roll;
    }

    return {
      ch: {
        id,
        powered,
        erect: stepped.erect,
        failed,
        valid,
        pitch,
        roll,
        frozen: !valid && powered,
        tumbled,
      },
      timer: stepped.timer,
      mem: {
        pitch,
        roll,
        driftP: valid ? driftP : last.driftP,
        driftR: valid ? driftR : last.driftR,
        tumbled,
        wasPowered: powered,
      },
    };
  };

  const p1 = timers.g1 < 0 ? 2 : timers.g1 === 0 ? 0 : 1;
  const p2 = timers.g2 < 0 ? 2 : timers.g2 === 0 ? 0 : 1;
  const pA = timers.gAux < 0 ? 2 : timers.gAux === 0 ? 0 : 1;

  // Ensure mem has new fields
  const ensure = (m: GyroMemory | { pitch: number; roll: number }): GyroMemory => ({
    pitch: m.pitch,
    roll: m.roll,
    driftP: "driftP" in m ? m.driftP : 0,
    driftR: "driftR" in m ? m.driftR : 0,
    tumbled: "tumbled" in m ? m.tumbled : false,
    wasPowered: "wasPowered" in m ? m.wasPowered : true,
  });

  const g1 = mkGyro("gyro1", p.gyro1Cb, f.gyro1, p1, "g1", 0, 0, ensure(mem.g1), 1);
  const g2 = mkGyro("gyro2", p.gyro2Cb, f.gyro2, p2, "g2", 0.05, -0.03, ensure(mem.g2), -1);
  const gA = mkGyro(
    "gyroAux",
    p.gyroAuxCb,
    f.gyroAux,
    pA,
    "gAux",
    bias,
    -bias * 0.5,
    ensure(mem.gAux),
    0.5,
  );

  const mkComp = (
    id: CompassChannel["id"],
    cb: boolean,
    failed: boolean,
    hdgOff: number,
    syncFlag: boolean,
    mode: 0 | 1,
  ): CompassChannel => {
    const powered = ac115 && dc && cb;
    const valid = powered && !failed && !syncFlag;
    return {
      id,
      powered,
      failed,
      valid,
      hdg: powered && !failed ? ((args.trueHdg + hdgOff) % 360 + 360) % 360 : 0,
      syncFlag,
      mode,
    };
  };
  const c1 = mkComp("comp1", p.comp1Cb, f.comp1, 0, syncF.c1, cMode.c1);
  const c2 = mkComp("comp2", p.comp2Cb, f.comp2, 0.15, syncF.c2, cMode.c2);

  const radioPower: NavRadioPower = {
    nav1Vor: dc && ac26 && p.nav1Cb,
    nav2Vor: dc && ac26 && p.nav2Cb,
    nav1Gs: dc && ac26 && p.nav1GsCb,
    nav2Gs: dc && ac26 && p.nav2GsCb,
    nav1: dc && ac26 && p.nav1Cb,
    nav2: dc && ac26 && p.nav2Cb,
    dme1: ac115 && dc && p.dme1Cb,
    dme2: ac115 && dc && p.dme2Cb,
    adf1: dc && p.adf1Cb,
    adf2: dc && p.adf2Cb,
    comm1: dc && p.comm1Cb,
    comm2: dc && p.comm2Cb,
    hf1: dc && p.hf1Cb,
    hf2: dc && p.hf2Cb,
    lrra1: dc && p.lrra1Cb,
    lrra2: dc && p.lrra2Cb,
  };

  const pickGyro = (side: "capt" | "fo"): GyroChannel => {
    const sel = args.sel.gyroSel;
    if (side === "capt") return sel === 0 ? gA.ch : g1.ch;
    return sel === 2 ? gA.ch : g2.ch;
  };
  const pickComp = (side: "capt" | "fo"): CompassChannel => {
    const sel = args.sel.compSel;
    if (side === "capt") return sel === 2 ? c2 : c1;
    return sel === 0 ? c1 : c2;
  };
  const navVor = (side: "capt" | "fo") => {
    const sel = args.sel.navSel;
    if (side === "capt") return sel === 2 ? radioPower.nav2Vor : radioPower.nav1Vor;
    return sel === 0 ? radioPower.nav1Vor : radioPower.nav2Vor;
  };
  const navGs = (side: "capt" | "fo") => {
    const sel = args.sel.navSel;
    if (side === "capt") return sel === 2 ? radioPower.nav2Gs : radioPower.nav1Gs;
    return sel === 0 ? radioPower.nav1Gs : radioPower.nav2Gs;
  };

  const cg = pickGyro("capt");
  const fg = pickGyro("fo");
  const cc = pickComp("capt");
  const fc = pickComp("fo");
  const sideMap = sourcesOf(args.sel, f);

  const packSide = (
    g: GyroChannel,
    c: CompassChannel,
    vor: boolean,
    gs: boolean,
    softFail: { att: boolean; hdg: boolean },
  ) => ({
    attValid: g.valid && !softFail.att,
    hdgValid: c.valid && !softFail.hdg,
    navPowered: vor,
    navGsPowered: gs,
    pitch: g.pitch,
    roll: g.roll,
    hdg: c.powered && !c.failed ? c.hdg : 0,
  });

  return {
    gyros: { gyro1: g1.ch, gyro2: g2.ch, gyroAux: gA.ch },
    compass: { comp1: c1, comp2: c2 },
    radioPower,
    capt: packSide(cg, cc, navVor("capt"), navGs("capt"), sideMap.capt),
    fo: packSide(fg, fc, navVor("fo"), navGs("fo"), sideMap.fo),
    erectTimers: {
      g1: g1.ch.erect === 2 ? -1 : g1.timer,
      g2: g2.ch.erect === 2 ? -1 : g2.timer,
      gAux: gA.ch.erect === 2 ? -1 : gA.timer,
    },
    gyroMem: { g1: g1.mem, g2: g2.mem, gAux: gA.mem },
  };
}
