import { create } from "zustand";

/**
 * P5 forward-overhead controls that have no effect on the systems model:
 * IRS, ELT, audio selectors, flight recorder, oxygen, warning tests, yaw damper, equipment cooling,
 * circuit-breaker / panel brightness, transfer switches, service interphone, cabin call, etc.
 * Everything the sim does model (generators, hydraulics, bleed, packs, fuel, anti-ice, lights...) is
 * read from / written to useSim directly by the panel.
 */

export type IrsMode = "OFF" | "ALIGN" | "NAV" | "ATT";
export type DsplSel = "TK/GS" | "PPOS" | "WIND" | "HDG/STS";

export interface OverheadLocalStore {
  elt: "OFF" | "ARM" | "ON";
  irsL: IrsMode;
  irsR: IrsMode;
  irsAlignL: number; // 0..1 alignment progress
  irsAlignR: number;
  irsSysDspl: "L" | "R";
  irsDsplSel: DsplSel;
  irsEntry: string;
  irsKeyTest: boolean;
  service: "OFF" | "ON";
  dome: "DIM" | "OFF" | "BRIGHT";
  audioRx: Record<string, boolean>;
  audioTx: string;
  audioMask: "MASK" | "BOOM";
  audioRtIc: boolean;
  audioAlt: boolean;
  flightRecorder: "TEST" | "NORMAL";
  recorderOff: boolean;
  machWarn: 0 | 1 | 2; // 0 none, 1 test #1, 2 test #2
  stallTest: 0 | 1 | 2;
  passOxy: "NORMAL" | "ON";
  oxyPsi: number;
  yawDamper: boolean;
  machTrimTest: boolean;
  compassDg: boolean;
  compassHdg: number;
  equipSupply: "NORMAL" | "ALTERNATE";
  equipExhaust: "NORMAL" | "ALTERNATE";
  cbBright: number;
  panelBright: number;
  attendCall: boolean;
  callLight: boolean;
  rainRepL: boolean;
  rainRepR: boolean;
  hornCutout: boolean;
  cvrTest: boolean;
  cvrErase: boolean;
  navXfr: "BOTH ON 1" | "NORMAL" | "BOTH ON 2";
  irsXfr: "BOTH ON L" | "NORMAL" | "BOTH ON R";
  efiXfr: "BOTH ON 1" | "NORMAL" | "BOTH ON 2";
  gen1Disc: boolean;
  gen2Disc: boolean;
  reverserTest: [boolean, boolean];
  set: (p: Partial<OverheadLocalStore>) => void;
}

export const useOverheadLocal = create<OverheadLocalStore>((set) => ({
  elt: "OFF",
  irsL: "OFF",
  irsR: "OFF",
  irsAlignL: 0,
  irsAlignR: 0,
  irsSysDspl: "L",
  irsDsplSel: "PPOS",
  irsEntry: "",
  irsKeyTest: false,
  service: "OFF",
  dome: "OFF",
  audioRx: {},
  audioTx: "",
  audioMask: "MASK",
  audioRtIc: false,
  audioAlt: false,
  flightRecorder: "NORMAL",
  recorderOff: false,
  machWarn: 0,
  stallTest: 0,
  passOxy: "NORMAL",
  oxyPsi: 1850,
  yawDamper: false,
  machTrimTest: false,
  compassDg: false,
  compassHdg: 0,
  equipSupply: "NORMAL",
  equipExhaust: "NORMAL",
  cbBright: 0.5,
  panelBright: 0.5,
  attendCall: false,
  callLight: false,
  rainRepL: false,
  rainRepR: false,
  hornCutout: false,
  cvrTest: false,
  cvrErase: false,
  navXfr: "NORMAL",
  irsXfr: "NORMAL",
  efiXfr: "NORMAL",
  gen1Disc: false,
  gen2Disc: false,
  reverserTest: [false, false],
  set: (p) => set(p),
}));
