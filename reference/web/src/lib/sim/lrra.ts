/**
 * ATA 34-33 — dual radio altimeter (LRRA) training model.
 * Dual channels, antenna offset, self-test heights, excessive-rate blank, DH lights.
 */
export interface LrraChannel {
  powered: boolean;
  valid: boolean;
  heightFt: number | null;
  dhFt: number;
  dhLight: boolean;
  testing: boolean;
}

const LRRA_MAX_FT = 2500;
const ANTENNA_OFFSET_FT = 7; // gear/antenna above ground when parked
/** Self-test drives indicators to fixed heights (AMM-style cue). */
const TEST_HEIGHT_FT = 100;

export function resolveLrra(args: {
  aglFt: number | null;
  /** vertical speed ft/min — excessive rate blanks RA */
  vsFpm?: number;
  dcPower: boolean;
  cb1: boolean;
  cb2: boolean;
  fail1: boolean;
  fail2: boolean;
  dh1: number;
  dh2: number;
  test1?: boolean;
  test2?: boolean;
}): { ch1: LrraChannel; ch2: LrraChannel } {
  const vs = args.vsFpm ?? 0;
  const rateBlank = Math.abs(vs) > 6000; // excessive rate inhibit

  const mk = (
    cb: boolean,
    fail: boolean,
    dh: number,
    test: boolean,
    biasFt: number,
  ): LrraChannel => {
    const powered = args.dcPower && cb;
    if (test && powered && !fail) {
      return {
        powered,
        valid: true,
        heightFt: TEST_HEIGHT_FT,
        dhFt: dh,
        dhLight: TEST_HEIGHT_FT <= dh,
        testing: true,
      };
    }
    const raw = args.aglFt;
    const corrected =
      raw != null && Number.isFinite(raw) ? Math.max(0, raw - ANTENNA_OFFSET_FT + biasFt) : null;
    const inRange =
      corrected != null && corrected >= 0 && corrected <= LRRA_MAX_FT && !rateBlank;
    const valid = powered && !fail && inRange;
    const heightFt = valid ? Math.round(corrected!) : null;
    return {
      powered,
      valid,
      heightFt,
      dhFt: dh,
      dhLight: valid && heightFt != null && heightFt <= dh,
      testing: false,
    };
  };

  return {
    ch1: mk(args.cb1, args.fail1, args.dh1, !!args.test1, 0),
    ch2: mk(args.cb2, args.fail2, args.dh2, !!args.test2, 3), // slight dual-channel bias
  };
}
