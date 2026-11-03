/**
 * Flight-instrument source selection (AMM ch. 34 / 22 test procedures): the VHF NAV and COMPASS selectors are BOTH ON 1 / NORMAL / BOTH ON 2,
 * the VERTICAL GYRO selector is CAPT ON AUX / NORMAL / F/O ON AUX. Normal: captain on system 1, first officer on system 2.
 * The simulator has one true attitude, heading and position, so a source differs only by being failed.
 */
export interface SrcFail { gyro1: boolean; gyro2: boolean; gyroAux: boolean; comp1: boolean; comp2: boolean; nav1: boolean; nav2: boolean }
export const NO_SRC_FAIL: SrcFail = { gyro1: false, gyro2: false, gyroAux: false, comp1: false, comp2: false, nav1: false, nav2: false };

export interface SideSrc { att: boolean; hdg: boolean; nav: boolean }
/** Which sides' selected sources are failed (true = the source feeding that side is failed). */
export function sourcesOf(sel: { navSel: number; compSel: number; gyroSel: number }, f: SrcFail): { capt: SideSrc; fo: SideSrc } {
  return {
    capt: { att: sel.gyroSel === 0 ? f.gyroAux : f.gyro1, hdg: sel.compSel === 2 ? f.comp2 : f.comp1, nav: sel.navSel === 2 ? f.nav2 : f.nav1 },
    fo: { att: sel.gyroSel === 2 ? f.gyroAux : f.gyro2, hdg: sel.compSel === 0 ? f.comp1 : f.comp2, nav: sel.navSel === 0 ? f.nav1 : f.nav2 },
  };
}
