import { create } from "zustand";

/**
 * State for the centre-pedestal controls that have no effect on the aircraft systems model
 * (radios, transponder, CDU, trim indications, test switches). Everything that DOES affect the
 * systems (thrust levers, fuel levers, flaps, speed brake, fire handles, bottles, cargo fire arm /
 * discharge, parking brake) lives in the main sim store (useSim).
 */

export type FireTest = "OFF" | "FAULT" | "OVHT_FIRE";
export type OvhtDet = "NORMAL" | "A" | "B";
export type CargoDet = "NORM" | "A" | "B";
export type XpdrMode = "SBY" | "AUTO" | "ON" | "TEST";
export type TcasMode = "TA_RA" | "TA" | "ABV" | "OFF" | "BLW" | "TRAFFIC";
export type WxrMode = "OFF" | "STBY" | "TEST" | "WX" | "WX_TURB" | "MAP";

export interface CduSide {
  pad: string;
  page: string;
  exec: boolean;
  msg: string;
  fields: Record<string, string>;
}

export interface PedestalStore {
  // communications
  commL: { act: number; stby: number }; // kHz
  commR: { act: number; stby: number };
  navL: { act: number; stby: number }; // kHz
  navR: { act: number; stby: number };
  navAutoL: boolean;
  navAutoR: boolean;
  adf: { l: number; r: number }; // kHz
  mic: Record<string, boolean>;
  micMask: { l: "MASK" | "BOOM"; r: "MASK" | "BOOM" };
  micRtIc: { l: boolean; r: boolean }; // false = R/T, true = I/C
  micVbr: { l: string; r: string };
  micAlt: { l: boolean; r: boolean }; // false = NORM
  adiBrt: { l: number; r: number };
  hsiBrt: { l: number; r: number };
  // transponder / TCAS
  xpdrCode: string;
  xpdrEntry: string; // digits being typed
  xpdrMode: XpdrMode;
  xpdrSel: 1 | 2;
  identUntil: number;
  tcasMode: TcasMode;
  xpdrFault: boolean;
  adfAnt: [boolean, boolean];
  /** ADF control-head mode per side: 0 OFF, 1 ANT, 2 ADF, 3 TEST, 4 LOOP */
  adfMode: [number, number];
  /** DME mode per side: 0 STBY, 1 NORM, 2 ORIDE (AMM 34-55) */
  dmeMode: [number, number];
  /** DME self-test held */
  dmeTest: [boolean, boolean];
  /** VHF NAV control-head self-test held (AMM 34-31) */
  navTest: [boolean, boolean];
  /** HF COMM (kHz) active / standby + mode 0 OFF 1 USB 2 AM */
  hfL: { act: number; stby: number; mode: number };
  hfR: { act: number; stby: number; mode: number };
  adfTone: boolean;
  /** RMI needle source selectors per side: 0 VOR, 1 ADF */
  rmiNeedle1: [number, number];
  rmiNeedle2: [number, number];
  /** Compass mode: 0 SLAVED, 1 DG */
  compMode: [number, number];
  /** LRRA decision height ft */
  lrraDh: [number, number];
  /** LRRA self-test held */
  lrraTest: [boolean, boolean];
  /** HF coupler retune request (momentary) */
  hfTuneReq: [boolean, boolean];
  /** Push-to-talk held (either side). Transmit only while true and a TX radio is selected. */
  ptt: boolean;
  /** COMM TEST: opens squelch (receiver hiss) when powered. */
  commTest: boolean;
  // flight-deck lighting knobs not modelled in the lights system
  flood: number;
  // trim
  stabTrim: number; // units, 0..17 (green band about 3.5..7.5 for T/O)
  stabCutoutA: boolean;
  stabCutoutB: boolean;
  stabOverride: boolean;
  rudderTrim: number; // -1..1 (L..R)
  aileronTrim: number; // -1..1
  // thrust-lever extras
  atDisc: [boolean, boolean];
  // ADI / HSI / radar
  dhRefL: number;
  dhRefR: number;
  hsiModeL: number; // 0 APP, 1 VOR, 2 MAP, 3 PLN
  hsiModeR: number;
  hsiRangeL: number; // 0..5 -> 10 20 40 80 160 320
  hsiRangeR: number;
  wxrMode: WxrMode;
  wxrGain: number;
  wxrTilt: number;
  wxrTest: boolean;
  wxrRange: number;
  wxrStab: boolean;
  gpsPage: string;
  // fire / overheat panel (P8)
  ovhtDet: [OvhtDet, OvhtDet];
  fireTest: FireTest;
  fireOverrideUntil: number;
  bellSilenced: boolean;
  cargoDetFwd: CargoDet;
  cargoDetAft: CargoDet;
  cargoExtTest: boolean;
  extTest: "1" | "OFF" | "2"; // ENGINES EXT TEST switch (spring-loaded)
  // cab door annunciator
  cabDoorUnlocked: boolean;
  // generic persisted knob / switch state used by the photo-accurate pedestal (volumes, selectors, stab brake release ...)
  knobs: Record<string, number>;
  sw: Record<string, boolean>;
  // CDUs
  cduL: CduSide;
  cduR: CduSide;
  // actions
  set: (p: Partial<PedestalStore>) => void;
  setCdu: (side: "L" | "R", p: Partial<CduSide>) => void;
  reset: () => void;
}

const fresh = () => ({
  commL: { act: 121950, stby: 121800 },
  commR: { act: 131550, stby: 121500 },
  navL: { act: 109950, stby: 112500 },
  navR: { act: 109950, stby: 112500 },
  navAutoL: false,
  navAutoR: false,
  adf: { l: 353, r: 316 },
  // all audio-selector toggles are ON (green lamps lit) in the reference photo
  mic: {"L:rx:1":true,"L:rx:NAV":true,"L:rx:2":true,"L:rx:ADF-1":true,"L:rx:ADF-2":true,"L:rx:MKR":true,"L:rx:SPKR":true,"R:rx:1":true,"R:rx:NAV":true,"R:rx:2":true,"R:rx:ADF-1":true,"R:rx:ADF-2":true,"R:rx:MKR":true,"R:rx:SPKR":true,"L:vol:VHF-1":true,"L:vol:VHF-2":true,"L:vol:HF-1":true,"L:vol:HF-2":true,"L:vol:CABIN":true,"L:vol:INT":true,"L:vol:PA":true,"R:vol:VHF-1":true,"R:vol:VHF-2":true,"R:vol:HF-1":true,"R:vol:HF-2":true,"R:vol:CABIN":true,"R:vol:INT":true,"R:vol:PA":true} as Record<string, boolean>,
  micMask: { l: "MASK" as const, r: "MASK" as const },
  micRtIc: { l: false, r: false },
  micVbr: { l: "B", r: "B" },
  micAlt: { l: false, r: false },
  adiBrt: { l: 0.7, r: 0.7 },
  hsiBrt: { l: 0.7, r: 0.7 },
  xpdrCode: "0000",
  xpdrEntry: "",
  xpdrMode: "SBY" as XpdrMode,
  xpdrSel: 1 as 1 | 2,
  identUntil: 0,
  tcasMode: "TA" as TcasMode,
  xpdrFault: true,
  adfAnt: [false, false] as [boolean, boolean],
  adfMode: [2, 2] as [number, number],
  dmeMode: [1, 1] as [number, number],
  dmeTest: [false, false] as [boolean, boolean],
  navTest: [false, false] as [boolean, boolean],
  hfL: { act: 5628, stby: 8942, mode: 0 },
  hfR: { act: 5628, stby: 8942, mode: 0 },
  adfTone: false,
  rmiNeedle1: [0, 0] as [number, number],
  rmiNeedle2: [1, 1] as [number, number],
  compMode: [0, 0] as [number, number],
  lrraDh: [200, 200] as [number, number],
  lrraTest: [false, false] as [boolean, boolean],
  hfTuneReq: [false, false] as [boolean, boolean],
  ptt: false,
  commTest: false,
  flood: 0,
  stabTrim: 5,
  stabCutoutA: false,
  stabCutoutB: false,
  stabOverride: false,
  rudderTrim: 0,
  aileronTrim: 0,
  atDisc: [false, false] as [boolean, boolean],
  dhRefL: 0,
  dhRefR: 0,
  hsiModeL: 2,
  hsiModeR: 2,
  hsiRangeL: 2,
  hsiRangeR: 2,
  wxrMode: "STBY" as WxrMode,
  wxrGain: 0.6,
  wxrTilt: 0.5,
  wxrTest: false,
  wxrRange: 3,
  wxrStab: true,
  gpsPage: "NAV",
  ovhtDet: ["NORMAL", "NORMAL"] as [OvhtDet, OvhtDet],
  fireTest: "OFF" as FireTest,
  fireOverrideUntil: 0,
  bellSilenced: false,
  cargoDetFwd: "NORM" as CargoDet,
  cargoDetAft: "NORM" as CargoDet,
  cargoExtTest: false,
  extTest: "OFF" as "1" | "OFF" | "2",
  cabDoorUnlocked: false,
  knobs: {} as Record<string, number>,
  sw: {} as Record<string, boolean>,
});

const cduInit = (page: string): CduSide => ({ pad: "", page, exec: false, msg: "", fields: {} });

export const usePedestal = create<PedestalStore>((set) => ({
  ...fresh(),
  cduL: cduInit("CRZ"),
  cduR: cduInit("LEGS"),
  set: (p) => set(p),
  setCdu: (side, p) => set((s) => (side === "L" ? { cduL: { ...s.cduL, ...p } } : { cduR: { ...s.cduR, ...p } })),
  reset: () => set({ ...fresh(), cduL: cduInit("CRZ"), cduR: cduInit("LEGS") }),
}));
