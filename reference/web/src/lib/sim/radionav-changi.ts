/**
 * Changi-focused radio navigation engine.
 * Uses the real frequency database (navaids-changi.ts) and the geographic
 * position from flightNavigation.ts / activeFlightPlan.
 *
 * Drop-in replacement / extension for the existing radionav.ts TRAINING_NAV_STATIONS.
 */
import {
  CHANGI_NAVAIDS,
  findChangiNavaid,
  WSSS_RUNWAYS,
  type Navaid,
} from "./navaids-changi";
import { distNm, bearingTrue } from "./navaids-changi"; // re-export helpers if needed

export type NavSolution = {
  valid: boolean;
  navaid: Navaid | null;
  distanceNm: number;
  bearingTrueDeg: number;
  radialFrom: number;       // VOR radial FROM station (magnetic)
  toFlag: boolean;
  locDevDeg: number;        // positive = fly right
  gsDevDeg: number;         // positive = above GS
  locValid: boolean;
  gsValid: boolean;
  vorValid: boolean;
  adfValid: boolean;
  ident: string;
  frequency: number;
};

const EMPTY: NavSolution = {
  valid: false,
  navaid: null,
  distanceNm: 0,
  bearingTrueDeg: 0,
  radialFrom: 0,
  toFlag: true,
  locDevDeg: 0,
  gsDevDeg: 0,
  locValid: false,
  gsValid: false,
  vorValid: false,
  adfValid: false,
  ident: "----",
  frequency: 0,
};

function angDiff(a: number, b: number): number {
  return ((a - b + 540) % 360) - 180;
}

/**
 * Compute radio-navigation guidance from a tuned frequency.
 * Only returns valid guidance when the station exists, is available,
 * and the aircraft is inside its service volume.
 */
export function computeChangiRadioNav(
  acLat: number,
  acLon: number,
  acAltFt: number,
  tunedFreqMHzOrKhz: number,
  mode: "VOR" | "ILS" | "NDB",
  selectedCourseMag = 0,
): NavSolution {
  const navaid = findChangiNavaid(tunedFreqMHzOrKhz, mode);
  if (!navaid) return { ...EMPTY, frequency: tunedFreqMHzOrKhz };

  const dist = distNm(acLat, acLon, navaid.lat, navaid.lon);
  if (dist > navaid.rangeNm || dist < 0.05) {
    return { ...EMPTY, navaid, frequency: navaid.frequency, ident: navaid.ident, distanceNm: dist };
  }

  const brgTrue = bearingTrue(acLat, acLon, navaid.lat, navaid.lon);
  const magVar = navaid.magVarDeg;
  const brgMag = (brgTrue - magVar + 360) % 360;

  const sol: NavSolution = {
    valid: true,
    navaid,
    distanceNm: dist,
    bearingTrueDeg: brgTrue,
    radialFrom: 0,
    toFlag: true,
    locDevDeg: 0,
    gsDevDeg: 0,
    locValid: false,
    gsValid: false,
    vorValid: false,
    adfValid: false,
    ident: navaid.ident,
    frequency: navaid.frequency,
  };

  if (navaid.kind === "NDB") {
    sol.adfValid = true;
    sol.radialFrom = brgMag; // instrument will convert to relative bearing
    return sol;
  }

  if (navaid.kind === "VOR" || navaid.kind === "VOR_DME") {
    const radialFrom = (brgMag + 180) % 360;
    const diff = angDiff(selectedCourseMag, radialFrom);
    sol.vorValid = true;
    sol.radialFrom = radialFrom;
    sol.toFlag = Math.abs(diff) <= 90;
    sol.locDevDeg = sol.toFlag ? -diff : diff;
    return sol;
  }

  // ILS / LOC
  if (navaid.kind === "ILS" || navaid.kind === "LOC") {
    const courseMag = navaid.courseMag ?? 0;
    const courseTrue = courseMag + magVar;
    // Bearing of aircraft FROM the localizer antenna
    const brgFromAnt = bearingTrue(navaid.lat, navaid.lon, acLat, acLon);
    const locDev = angDiff(brgFromAnt, (courseTrue + 180) % 360);
    sol.locValid = Math.abs(locDev) < 35 && dist < 25;
    sol.locDevDeg = locDev;
    sol.radialFrom = courseMag;

    if (navaid.gsDeg && sol.locValid) {
      const heightAbove = Math.max(0, acAltFt - (navaid.elevFt ?? 20));
      const gsAngle = (Math.atan2(heightAbove, dist * 6076.12) * 180) / Math.PI;
      sol.gsDevDeg = gsAngle - navaid.gsDeg;
      sol.gsValid =
        dist < 12 &&
        Math.abs(locDev) < 8 &&
        gsAngle < 8 &&
        gsAngle > 0.5;
    }
    return sol;
  }

  return { ...EMPTY, frequency: tunedFreqMHzOrKhz };
}

/** Convenience: convert pedestal frequency (stored as 109950 = 109.95) to MHz */
export function pedestalFreqToMHz(raw: number): number {
  return raw / 1000;
}

export { CHANGI_NAVAIDS, WSSS_RUNWAYS, findChangiNavaid };
