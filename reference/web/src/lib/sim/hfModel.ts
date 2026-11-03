/**
 * ATA 23 — HF COMM training model (coupler tune, band limits, simple usability).
 * Not ionospheric propagation — day/night band table only.
 */
export type HfMode = 0 | 1 | 2; // OFF | USB | AM

export interface HfChannelState {
  mode: HfMode;
  actKhz: number;
  stbyKhz: number;
  /** coupler tuning in progress */
  tuning: boolean;
  tuneT: number;
  /** 0 unusable, 1 marginal, 2 good */
  usability: 0 | 1 | 2;
  powered: boolean;
}

const TUNE_SEC = 3.5;
const HF_MIN = 2000;
const HF_MAX = 29999;

/** Simplified day/night usability by frequency family (kHz). */
export function hfUsability(khz: number, isDay: boolean): 0 | 1 | 2 {
  if (khz < HF_MIN || khz > HF_MAX) return 0;
  // Very low HF — better at night
  if (khz < 4000) return isDay ? 0 : 2;
  if (khz < 8000) return isDay ? 1 : 2;
  if (khz < 12000) return isDay ? 2 : 1;
  if (khz < 18000) return isDay ? 2 : 0;
  // High HF — day only
  return isDay ? 1 : 0;
}

export function stepHfChannel(args: {
  prev: HfChannelState;
  mode: HfMode;
  actKhz: number;
  stbyKhz: number;
  powered: boolean;
  /** request coupler retune (freq change or TUNE press) */
  retune: boolean;
  isDay: boolean;
  dtSec: number;
}): HfChannelState {
  const { mode, actKhz, stbyKhz, powered, isDay, dtSec } = args;
  if (!powered || mode === 0) {
    return {
      mode,
      actKhz,
      stbyKhz,
      tuning: false,
      tuneT: 0,
      usability: 0,
      powered: false,
    };
  }

  let tuneT = args.prev.tuneT;
  let tuning = args.prev.tuning;
  const freqChanged = args.prev.actKhz !== actKhz;
  if (args.retune || freqChanged) {
    tuning = true;
    tuneT = 0;
  }
  if (tuning) {
    tuneT += dtSec;
    if (tuneT >= TUNE_SEC) {
      tuning = false;
      tuneT = TUNE_SEC;
    }
  }

  const usability = tuning ? 0 : hfUsability(actKhz, isDay);
  return {
    mode,
    actKhz,
    stbyKhz,
    tuning,
    tuneT,
    usability,
    powered: true,
  };
}

export const IDLE_HF: HfChannelState = {
  mode: 0,
  actKhz: 5628,
  stbyKhz: 8942,
  tuning: false,
  tuneT: 0,
  usability: 0,
  powered: false,
};
