import { useSim, useDerivedPick } from "@/lib/sim/store";
import { useMip } from "@/lib/sim/mipLocal";
import { computeAirData } from "@/lib/sim/pitotStatic";
import { NO_NAV } from "@/lib/sim/radionav";
import { sourcesOf } from "@/lib/sim/sources";
import { usePedestal } from "@/lib/sim/pedestal";
import { angDiff } from "@/lib/sim/autoflight";
import { adiNavFrom } from "@/components/panel/instruments";

/** Captain's instrument feeds — same derivation as Panel() in the 2D panel / the 3D node table. */
export function useCaptainFeeds() {
  const s = useSim();
  const d = useDerivedPick("acPower", "dcPower");
  const m = useMip();
  const pw = !!d.dcPower;
  const air = computeAirData(s, d.dcPower, d.acPower);
  const capt = air.capt;
  const captPowered = air.capt.adc.data.powered;
  const sp = m.srcPower;
  const displayNavSel = s.navXfr === "BOTH ON 1" ? 0 : s.navXfr === "BOTH ON 2" ? 2 : m.navSel;
  const displayEfiSide = s.efiXfr === "BOTH ON L" ? 0 : s.efiXfr === "BOTH ON R" ? 2 : null;
  const displayCompSel = displayEfiSide ?? m.compSel;
  const displayGyroSel = displayEfiSide ?? m.gyroSel;
  const src = sourcesOf({ navSel: displayNavSel, compSel: displayCompSel, gyroSel: displayGyroSel }, m.srcFail);
  if (displayEfiSide !== null && s.irsXfr === "NORMAL") {
    const left = displayEfiSide === 0;
    src.capt.att = src.fo.att = left ? m.srcFail.gyro1 : m.srcFail.gyro2;
    src.capt.hdg = src.fo.hdg = left ? m.srcFail.comp1 : m.srcFail.comp2;
  }
  const failC = {
    ...m.fail,
    att: m.fail.att || src.capt.att || !m.attCapt.attValid || (!sp.gyro1Cb && displayGyroSel !== 0) || (!sp.gyroAuxCb && displayGyroSel === 0),
    hdg: m.fail.hdg || src.capt.hdg || !m.attCapt.hdgValid || (!sp.comp1Cb && displayCompSel !== 2) || (!sp.comp2Cb && displayCompSel === 2),
    loc: m.fail.loc || src.capt.nav || (displayNavSel === 2 ? !sp.nav2Cb : !sp.nav1Cb),
    gs: m.fail.gs || src.capt.nav || (displayNavSel === 2 ? !sp.nav2GsCb : !sp.nav1GsCb),
    dme1: m.fail.dme1 || !sp.dme1Cb,
    dme2: m.fail.dme2 || !sp.dme2Cb,
    adf: m.fail.adf || (!sp.adf1Cb && !sp.adf2Cb),
  };
  const navC = failC.loc ? NO_NAV : m.nav;
  const tasKt = capt.iasKt * (1 + (capt.altFt / 1000) * 0.016);
  const gsKt = s.wow ? s.groundSpeedKt : tasKt;
  const adiNavC = adiNavFrom(
    !!(m.navOn && m.navTuned === "ILS"),
    m.navOn && m.navTuned === "ILS" && navC.locValid ? navC.locDev : null,
    m.navOn && m.navTuned === "ILS" && navC.gsValid ? navC.gsErr : null,
  );
  const dmeNm = (side: 0 | 1, fail: boolean): number | null => (fail ? null : (side === 0 ? m.dmeCh?.ch1 : m.dmeCh?.ch2)?.displayNm ?? null);
  const rmiBrg = (needle: 0 | 1, adf: number | null): number | null => {
    const ped = usePedestal.getState();
    const sel = (needle === 0 ? ped.rmiNeedle1 : ped.rmiNeedle2)?.[0] ?? needle;
    if (sel === 0 && m.navOn && navC.vorValid) {
      return angDiff(navC.radial, m.attCapt.hdg);
    }
    return adf;
  };
  return { s, m, pw, capt, captPowered, failC, navC, tasKt, gsKt, adiNavC, dmeNm, rmiBrg };
}
