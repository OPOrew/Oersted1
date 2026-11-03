/**
 * ATA 34-57 — ADF bearing model (training only, not RF propagation).
 * Modes: 0 OFF, 1 ANT (sense only), 2 ADF (bearing), 3 TEST (fixed relative bearing per AMM),
 * optional 4 LOOP (manual loop — no auto relative bearing in this trainer).
 */
import { CHANGI_NAVAIDS, bearingTrue, distNm, findChangiNavaid } from "@/lib/sim/navaids-changi";
import { usePedestal } from "@/lib/sim/pedestal";
import { readFlightNavigationState } from "@/lib/sim/flightNavigation";
import { angDiff } from "@/lib/sim/autoflight";

export interface AdfResult {
  brg1: number | null;
  brg2: number | null;
  dist1Nm: number | null;
  dist2Nm: number | null;
}

export interface AdfPowerOpts {
  adf1Powered?: boolean;
  adf2Powered?: boolean;
  mode1?: number;
  mode2?: number;
}

/** AMM self-test drives indicator toward a fixed relative bearing (~45°). */
const ADF_TEST_REL_BRG = 45;

export function computeAdfBearings(
  hdgMag: number,
  powered: boolean,
  failAdf: boolean,
  opts: AdfPowerOpts = {},
): AdfResult {
  const empty: AdfResult = { brg1: null, brg2: null, dist1Nm: null, dist2Nm: null };
  if (!powered || failAdf) return empty;

  const nav = readFlightNavigationState();
  const ped = usePedestal.getState();
  const mode1 = opts.mode1 ?? ped.adfMode?.[0] ?? 2;
  const mode2 = opts.mode2 ?? ped.adfMode?.[1] ?? 2;
  const p1 = opts.adf1Powered !== false;
  const p2 = opts.adf2Powered !== false;

  const one = p1 ? resolveOne(ped.adf.l, mode1, nav, hdgMag) : { brg: null, dist: null };
  const two = p2 ? resolveOne(ped.adf.r, mode2, nav, hdgMag) : { brg: null, dist: null };
  return { brg1: one.brg, brg2: two.brg, dist1Nm: one.dist, dist2Nm: two.dist };
}

function resolveOne(
  freqKhz: number,
  mode: number,
  nav: ReturnType<typeof readFlightNavigationState>,
  hdgMag: number,
): { brg: number | null; dist: number | null } {
  // OFF / ANT / LOOP → no auto relative bearing
  if (mode === 0 || mode === 1 || mode === 4) return { brg: null, dist: null };
  // TEST → fixed relative bearing (AMM calibration cue)
  if (mode === 3) return { brg: ADF_TEST_REL_BRG, dist: null };

  if (!nav || !Number.isFinite(nav.latitude) || !Number.isFinite(nav.longitude)) {
    return { brg: null, dist: null };
  }
  const station = findChangiNavaid(freqKhz, "NDB")
    ?? CHANGI_NAVAIDS.find((n) => n.kind === "NDB" && n.available && Math.abs(n.frequency - freqKhz) < 1);
  if (!station) return { brg: null, dist: null };
  const dist = distNm(nav.latitude, nav.longitude, station.lat, station.lon);
  if (dist > (station.rangeNm ?? 25)) return { brg: null, dist: null };
  const trueBrg = bearingTrue(nav.latitude, nav.longitude, station.lat, station.lon);
  const magBrg = (trueBrg - (station.magVarDeg ?? 0) + 360) % 360;
  return { brg: angDiff(magBrg, hdgMag), dist };
}
