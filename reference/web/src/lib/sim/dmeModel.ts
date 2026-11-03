/**
 * ATA 34-55 — DME interrogator training model.
 * Slant-range geometry, search/track, lock memory, display lag. Not pulse-pair RF.
 */
export type DmeMode = 0 | 1 | 2; // STBY | NORM | ORIDE

export interface DmeChannelState {
  /** null = dashes (STBY / searching / lost) */
  displayNm: number | null;
  searching: boolean;
  locked: boolean;
  lockT: number;
  /** seconds remaining of memory hold after signal loss */
  memoryT: number;
  /** lagged display value for 1 s smoothing */
  lagNm: number | null;
}

const SEARCH_SEC_NEAR = 1.2;
const SEARCH_SEC_FAR = 4.0;
const NORM_MAX_NM = 200;
const ORIDE_MAX_NM = 300;
const MEMORY_SEC = 12;
const LAG_TAU = 0.85; // ~1 s display lag

/** Convert horizontal range + height difference to slant range (nm). */
export function slantRangeNm(horizNm: number, deltaAltFt: number): number {
  const deltaNm = deltaAltFt / 6076.12;
  return Math.sqrt(horizNm * horizNm + deltaNm * deltaNm);
}

function searchTimeForRange(nm: number): number {
  // Longer search at long range
  const t = SEARCH_SEC_NEAR + (SEARCH_SEC_FAR - SEARCH_SEC_NEAR) * Math.min(1, nm / 150);
  return t;
}

export function stepDmeChannel(args: {
  prev: DmeChannelState;
  mode: DmeMode;
  test: boolean;
  powered: boolean;
  /** horizontal range nm, or null if no station */
  geomNm: number | null;
  /** aircraft minus station elevation, ft (for slant range) */
  deltaAltFt?: number;
  dtSec: number;
}): DmeChannelState {
  const { prev, mode, test, powered, geomNm, dtSec } = args;
  const dAlt = args.deltaAltFt ?? 0;

  if (!powered || mode === 0) {
    return { displayNm: null, searching: false, locked: false, lockT: 0, memoryT: 0, lagNm: null };
  }
  if (test) {
    return { displayNm: 0, searching: false, locked: true, lockT: 2, memoryT: 0, lagNm: 0 };
  }

  const maxR = mode === 2 ? ORIDE_MAX_NM : NORM_MAX_NM;
  const horizOk = geomNm != null && Number.isFinite(geomNm) && geomNm >= 0 && geomNm <= maxR;
  const slant = horizOk ? slantRangeNm(geomNm!, dAlt) : null;
  const inRange = slant != null && slant <= maxR;

  // Signal lost while previously locked → memory hold
  if (!inRange) {
    if (prev.locked || prev.memoryT > 0) {
      const mem = (prev.memoryT > 0 ? prev.memoryT : MEMORY_SEC) - dtSec;
      if (mem > 0) {
        return {
          displayNm: prev.displayNm,
          searching: false,
          locked: false,
          lockT: 0,
          memoryT: mem,
          lagNm: prev.lagNm ?? prev.displayNm,
        };
      }
    }
    return { displayNm: null, searching: true, locked: false, lockT: 0, memoryT: 0, lagNm: null };
  }

  const need = searchTimeForRange(slant!);
  let lockT = prev.locked ? need : prev.lockT + dtSec;
  if (!prev.locked && lockT < need) {
    return { displayNm: null, searching: true, locked: false, lockT, memoryT: 0, lagNm: null };
  }

  const raw = Math.round(slant! * 10) / 10;
  // lag toward raw
  const lagPrev = prev.lagNm ?? raw;
  const alpha = 1 - Math.exp(-dtSec / LAG_TAU);
  const lagNm = lagPrev + (raw - lagPrev) * alpha;
  const displayNm = Math.round(lagNm * 10) / 10;

  return {
    displayNm,
    searching: false,
    locked: true,
    lockT: need,
    memoryT: 0,
    lagNm,
  };
}

export const IDLE_DME: DmeChannelState = {
  displayNm: null,
  searching: false,
  locked: false,
  lockT: 0,
  memoryT: 0,
  lagNm: null,
};
