import { create } from "zustand";
import { NO_NAV, type NavData, type NavSceneId } from "@/lib/sim/radionav";
import type { Light } from "@/lib/sim/autoflight";
import { NO_SRC_FAIL, type SrcFail } from "@/lib/sim/sources";
import { DEFAULT_SRC_POWER, type SrcPower } from "@/lib/sim/instrumentSources";
import { useSim } from "@/lib/sim/store";

/** Main-instrument-panel items the systems model doesn't simulate: clocks, GPWS, test switches, selectors, radios. */

/** Instrument flag failures, one per system. A flag shows only when its own system has failed, lost power, or its TEST is held. */
export interface MipFail { att: boolean; fd: boolean; gs: boolean; loc: boolean; spd: boolean; ht: boolean; hdg: boolean; dme1: boolean; dme2: boolean; adf: boolean; vsi: boolean; tat: boolean }
export const NO_FAIL: MipFail = { att: false, fd: false, gs: false, loc: false, spd: false, ht: false, hdg: false, dme1: false, dme2: false, adf: false, vsi: false, tat: false };

/** Collins FD-108 flight director + Sperry SP-77 autopilot panel state (AMM 34-31 / 22-11). */
export interface FdCmd { show: boolean; bank: number; pitch: number; flag: boolean }

export interface MipStore {
  /** FD control panel: mode 0 GA, 1 OFF, 2 HDG, 3 VOR/LOC, 4 AUTO APPR; ALT HOLD toggle (solenoid held); PITCH CMD knob (deg) */
  fdMode: number;
  fdAlt: boolean;
  fdPitch: number;
  /** first-officer FD controller (glareshield, right): mode, ALT HOLD, PITCH CMD. Panel controls only; the flight-director model follows the captain's controller. */
  fdMode2: number;
  fdAlt2: boolean;
  fdPitch2: number;
  /** selected course (CDI course counter), selected heading (CDI heading cursor), first-officer course; deg */
  selCrs: number;
  selHdg: number;
  selCrs2: number;
  /** SP-77 control panel: NAV 0 MAN, 1 VOR LOC, 2 AUTO APP, 3 MAN G/S (spring-returns to MAN); pitch 0 TURB, 1 OFF, 2 ALT HOLD;
   *  HDG toggle 0 HDG OFF, 1 centre (hold), 2 HDG SEL; AIL / ELEV engage switches (latched only while interlocks hold) */
  apNav: number;
  apPitch: number;
  apHdgSw: number;
  apAil: boolean;
  apElev: boolean;
  /** autopilot disengage warning lights flash until reset */
  apWarn: boolean;
  /** why the autopilot last disconnected or released a mode (shown in the autopilot trainer while the warning is active) */
  apWhy: string;
  /** radio-nav training station: on / tuned receiver / reset counter (re-positions the airplane on final) / live receiver data */
  /** failures of the individual gyro / compass / VHF NAV sources the selectors choose between */
  srcFail: SrcFail;
  /** Per-radio / per-gyro circuit breakers and fast-erect (AMM-style power path; default closed) */
  srcPower: SrcPower;
  /** Compass HDG flag from fast-sync abuse (AMM 34-21); auto-clears after resync window */
  compSyncFlag: { c1: boolean; c2: boolean };
  /** gyro frozen-memory (independent channel attitudes) */
  gyroMem: { g1: { pitch: number; roll: number; driftP: number; driftR: number; tumbled: boolean; wasPowered: boolean }; g2: { pitch: number; roll: number; driftP: number; driftR: number; tumbled: boolean; wasPowered: boolean }; gAux: { pitch: number; roll: number; driftP: number; driftR: number; tumbled: boolean; wasPowered: boolean } };
  /** DME channel search/track state */
  dmeCh: { ch1: { displayNm: number | null; searching: boolean; locked: boolean; lockT: number; memoryT: number; lagNm: number | null }; ch2: { displayNm: number | null; searching: boolean; locked: boolean; lockT: number; memoryT: number; lagNm: number | null } };
  hfCh: { ch1: { tuning: boolean; usability: number }; ch2: { tuning: boolean; usability: number } };
  /** LRRA heights / DH lights */
  lrra: { h1: number | null; h2: number | null; dh1: boolean; dh2: boolean };
  navOn: boolean;
  navTuned: "VOR" | "ILS";
  /** Active simulated NAV frequency; only frequencies in TRAINING_NAV_STATIONS can produce guidance. */
  navFrequencyMHz: number;
  navResetN: number;
  /** radio-nav scene the receiver works in: the original RPLL RWY 06 training ILS, or the WSSS RWY 02L ILS used by the PLAN NAV vectored arrival */
  navScene: NavSceneId;
  /** PLAN NAV: the active flight plan steers the modeled autopilot (lateral heading + ALT HOLD target) while AIL / ELEV are engaged. A trainer aid: a 737-200 has no FMC / LNAV. */
  planNav: boolean;
  /** one-shot request to set the aircraft heading (used to line up on the departure runway when a plan is loaded); `n` increments per request */
  attHdgReq: { n: number; hdg: number };
  /** status published by the PLAN NAV logic for displays */
  planNavStatus: string;
  /** Captain-side receiver (NAV 1 or selected by VHF NAV transfer). AFCS uses this. */
  nav: NavData;
  /** First-officer-side receiver (NAV 2 or selected by VHF NAV transfer). */
  navFo: NavData;
  /** ADF relative bearings (deg) for RMI needles; null = no lock / failed / off. */
  adfBrg1: number | null;
  adfBrg2: number | null;
  /** computed by the attitude model: flight-director steering commands for the ADI V-pointers */
  fdCmd: FdCmd;
  /** approach progress display lights computed by the autopilot model (AMM 22-11-0) */
  apAnn: { voc: Light; gs: Light };
  /** True aircraft attitude from the flight model (AFCS / shared). */
  att: { pitch: number; roll: number; hdg: number };
  /** Captain-side displayed attitude from selected VG + compass (may flag invalid). */
  attCapt: { pitch: number; roll: number; hdg: number; attValid: boolean; hdgValid: boolean };
  /** First-officer-side displayed attitude from selected VG + compass. */
  attFo: { pitch: number; roll: number; hdg: number; attValid: boolean; hdgValid: boolean };
  /** true while a mounted panel is running the attitude / autopilot / nav model (other views then follow it) */
  attLive: boolean;
  /** injected instrument failures (all clear by default) */
  fail: MipFail;
  clock: { running: boolean; elapsed: number };
  gpwsInhibit: boolean;
  gpwsTest: boolean;
  nwsAlt: boolean;
  raDh: number;
  raTest: boolean;
  navSel: number;
  compSel: number;
  gyroSel: number;
  markerHigh: boolean;
  /** ILS marker beacon reception (trainer geometry, see markerBeacons.ts); written by the instrument-panel tick */
  markers: { om: boolean; mm: boolean; im: boolean };
  annTest: number;
  floodCapt: number;
  floodFo: number;
  footAirCapt: boolean;
  footAirFo: boolean;
  masterCautionAck: boolean;
  recall: boolean;
  /** LIGHT TEST key: 0 BRT, 1 DIM, 2 TEST */
  lightKey: 0 | 1 | 2;
  /** BRAKE TEST push-buttons (0 = none held) */
  brakeTest: 0 | 1 | 2 | 3;
  /** YAW DAMPER test: 0 off, 1 L, 2 R */
  yawTest: 0 | 1 | 2;
  oilQtyTest: boolean;
  qtyTest: boolean;
  fuelSel: boolean;
  compTest: boolean;
  /** ADI TEST buttons (AMM 34-22 / 34-26): simulate +10 deg pitch, +20 deg right bank and show only the ATT flag. */
  adiTestCapt: boolean;
  adiTestFo: boolean;
  /** baro settings (inHg) */
  /** @deprecated baro settings now live in the sim state (psBaroCaptHpa / psBaroFoHpa / psBaroStbyHpa) so the altimeters and the CADC use one value */
  baroCapt: number;
  baroFo: number;
  /** ASI speed bug (knots), set with the knob under each airspeed indicator */
  bugCapt: number;
  bugFo: number;
  baroStby: number;
  /** VHF COMM (kHz / 10, i.e. 11900 = 119.00) */
  comAct: number;
  comStby: number;
  comTest: boolean;
  cvrTest: boolean;
  gpsOn: boolean;
  /** Sperry Primus 90 weather radar (AMM 34-41-01): mode pushbuttons 0 PUSH (all out) 1 STBY 2 WX 3 CYC 4 MAP */
  radarMode: number;
  /** GAIN knob: 0 = PRESET detent, >0 = variable gain (WX and MAP only) */
  radarGain: number;
  /** antenna tilt, +/-15 degrees */
  radarTilt: number;
  /** RANGE switch: 0 TEST, then 10 / 25 / 50 / 100 / 200 / 300 NM */
  radarRange: number;
  /** INT knob (display intensity) 0..1 */
  radarInt: number;
  radarStab: boolean;
  /** SEC SCAN in = 80 degree sector, out = 160 degrees */
  radarSector: boolean;
  radarFrz: boolean;
  radarAzim: boolean;
  radarTgt: boolean;
  /** time (ms) the radar left the all-buttons-out state; 0 = cold. STBY warm-up is 70 s. */
  radarStbyAt: number;
  /** transponder: 0 STBY 1 ALT OFF 2 ALT ON 3 TEST */
  xpdrMode: number;
  xpdrCode: string;
  atcSel: 1 | 2;
  set: (p: Partial<MipStore>) => void;
}

export const useMip = create<MipStore>((set) => ({
  fdMode: 1,
  fdAlt: false,
  fdPitch: 0,
  fdMode2: 1,
  fdAlt2: false,
  fdPitch2: 0,
  selCrs: 52,
  selHdg: 58,
  selCrs2: 59,
  apNav: 0,
  apPitch: 1,
  apHdgSw: 1,
  apAil: false,
  apElev: false,
  apWarn: false,
  apWhy: "",
  srcFail: NO_SRC_FAIL,
  srcPower: { ...DEFAULT_SRC_POWER },
  compSyncFlag: { c1: false, c2: false },
  gyroMem: { g1: { pitch: 0, roll: 0, driftP: 0, driftR: 0, tumbled: false, wasPowered: true }, g2: { pitch: 0, roll: 0, driftP: 0, driftR: 0, tumbled: false, wasPowered: true }, gAux: { pitch: 0, roll: 0, driftP: 0, driftR: 0, tumbled: false, wasPowered: true } },
  dmeCh: {
    ch1: { displayNm: null, searching: false, locked: false, lockT: 0, memoryT: 0, lagNm: null },
    ch2: { displayNm: null, searching: false, locked: false, lockT: 0, memoryT: 0, lagNm: null },
  },
  hfCh: { ch1: { tuning: false, usability: 0 }, ch2: { tuning: false, usability: 0 } },
  lrra: { h1: null, h2: null, dh1: false, dh2: false },
  navOn: false,
  navTuned: "ILS",
  navFrequencyMHz: 109.1,
  navResetN: 0,
  navScene: "RPLL06",
  planNav: false,
  attHdgReq: { n: 0, hdg: 0 },
  planNavStatus: "OFF",
  nav: NO_NAV,
  navFo: NO_NAV,
  adfBrg1: null,
  adfBrg2: null,
  fdCmd: { show: false, bank: 0, pitch: 0, flag: false },
  apAnn: { voc: "OFF", gs: "OFF" },
  att: { pitch: 0, roll: 0, hdg: 0 },
  attCapt: { pitch: 0, roll: 0, hdg: 0, attValid: true, hdgValid: true },
  attFo: { pitch: 0, roll: 0, hdg: 0, attValid: true, hdgValid: true },
  attLive: false,
  fail: { ...NO_FAIL },
  clock: { running: false, elapsed: 0 },
  gpwsInhibit: false,
  gpwsTest: false,
  nwsAlt: false,
  raDh: 200,
  raTest: false,
  navSel: 1,
  compSel: 1,
  gyroSel: 1,
  markerHigh: true,
  markers: { om: false, mm: false, im: false },
  annTest: 0,
  floodCapt: 0.6,
  floodFo: 0.6,
  footAirCapt: false,
  footAirFo: false,
  masterCautionAck: false,
  recall: false,
  lightKey: 0,
  brakeTest: 0,
  yawTest: 0,
  oilQtyTest: false,
  qtyTest: false,
  fuelSel: true,
  compTest: false,
  adiTestCapt: false,
  adiTestFo: false,
  baroCapt: 29.92,
  baroFo: 29.92,
  bugCapt: 140,
  bugFo: 140,
  baroStby: 30.62,
  comAct: 11900,
  comStby: 13590,
  comTest: false,
  cvrTest: false,
  gpsOn: false,
  radarMode: 0,
  radarGain: 0,
  radarTilt: 0,
  radarRange: 4,
  radarInt: 0.6,
  radarStab: true,
  radarSector: false,
  radarFrz: false,
  radarAzim: false,
  radarTgt: false,
  radarStbyAt: 0,
  xpdrMode: 0,
  xpdrCode: "1200",
  atcSel: 1,
  set: (p) => set(p),
}));

/** Mirror "a mounted panel owns attitude / autopilot / navigation telemetry" into the systems model, which then skips its fallback writers (store.tick). */
useMip.subscribe((m) => {
  if (useSim.getState().afPanelOwned !== m.attLive) useSim.setState({ afPanelOwned: m.attLive });
});
