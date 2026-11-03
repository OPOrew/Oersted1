import { angDiff } from "./autoflight.ts";
import { WSSS_ILS_02L } from "./navData.ts";
import { brgTrue, distNm } from "./planGuidance.ts";

/**
 * Training radio-navigation scenes. Each scene is a local frame in NM (x = east, y = north, runway threshold at the origin).
 *  - RPLL06: the original simulated RPLL RWY 06 ILS plus a training VOR.
 *  - WSSS02L: the Changi ILS/DME RWY 02L (ICW 110.9) used by the PLAN NAV vectored arrival; the aircraft position
 *    is taken from the geographic route tracker instead of being dead-reckoned locally.
 * The airplane position is dead-reckoned from heading and true airspeed (no wind). This is a simplified training model, not an RF model.
 */
export const RWY = { crs: 62, gsDeg: 3.01 } as const;

export type NavSceneId = "RPLL06" | "WSSS02L";
export interface NavSceneGeom {
  id: NavSceneId;
  /** inbound course used for the beam geometry, degrees */
  crs: number;
  gsDeg: number;
  locAnt: { x: number; y: number };
  /** glide-slope validity range, NM from the threshold */
  gsRangeNm: number;
  /** threshold elevation subtracted from the altitude for the glide-slope angle, ft */
  fieldElevFt: number;
  label: string;
}

/** Synthetic, local-only training stations. The RPLL training ILS and VOR are deliberately NOT a real-world RF model; the WSSS ILS frequency is the one printed on the ICW ILS/DME RWY 02L chart. */
export const TRAINING_NAV_STATIONS = [
  { id: "SIM-VOR-1", kind: "VOR", frequencyMHz: 112.0, label: "Training VOR 1", available: true, scene: undefined as NavSceneId | undefined },
  { id: "SIM-RPLL-ILS-06", kind: "ILS", frequencyMHz: 109.1, label: "Simulated RPLL ILS RWY 06", available: true, scene: "RPLL06" as NavSceneId | undefined },
  { id: WSSS_ILS_02L.stationId, kind: "ILS", frequencyMHz: WSSS_ILS_02L.frequencyMHz, label: "Simulated WSSS ILS RWY 02L (ICW)", available: true, scene: "WSSS02L" as NavSceneId | undefined },
] as const;
export type NavStationKind = "VOR" | "ILS";
export function findTrainingNavStation(frequencyMHz: number) {
  return TRAINING_NAV_STATIONS.find((station) => Math.abs(station.frequencyMHz - frequencyMHz) < 0.0001);
}
export const VOR_POS = { x: 0.5, y: -0.3 };
const RWY_RAD = (62 * Math.PI) / 180;
export const LOC_ANT = { x: 1.6 * Math.sin(RWY_RAD), y: 1.6 * Math.cos(RWY_RAD) };
export const NAV_START = { x: -12 * Math.sin(RWY_RAD), y: -12 * Math.cos(RWY_RAD), hdg: 62 };
const NM_FT = 6076.12;
const DEG = 180 / Math.PI;

const WSSS_C = (WSSS_ILS_02L.trueCourseDeg * Math.PI) / 180;
export const NAV_SCENES: Record<NavSceneId, NavSceneGeom> = {
  RPLL06: { id: "RPLL06", crs: RWY.crs, gsDeg: RWY.gsDeg, locAnt: LOC_ANT, gsRangeNm: 10, fieldElevFt: 0, label: "RPLL RWY 06" },
  WSSS02L: {
    id: "WSSS02L", crs: WSSS_ILS_02L.trueCourseDeg, gsDeg: WSSS_ILS_02L.gsDeg,
    locAnt: { x: WSSS_ILS_02L.locAntBeyondThrNm * Math.sin(WSSS_C), y: WSSS_ILS_02L.locAntBeyondThrNm * Math.cos(WSSS_C) },
    gsRangeNm: WSSS_ILS_02L.gsRangeNm, fieldElevFt: 22, label: "WSSS RWY 02L",
  },
};
export function sceneGeom(id: NavSceneId | undefined): NavSceneGeom { return NAV_SCENES[id ?? "RPLL06"]; }

/** Local position (NM east / north of the 02L threshold) for a geographic position, for the WSSS scene. */
export function wsssLocalPos(latitude: number, longitude: number): { x: number; y: number } {
  const d = distNm(WSSS_ILS_02L.thrLat, WSSS_ILS_02L.thrLon, latitude, longitude);
  const b = (brgTrue(WSSS_ILS_02L.thrLat, WSSS_ILS_02L.thrLon, latitude, longitude) * Math.PI) / 180;
  return { x: d * Math.sin(b), y: d * Math.cos(b) };
}

export interface NavData {
  vorValid: boolean; locValid: boolean; gsValid: boolean;
  /** bearing from the VOR to the airplane (radial), deg */
  radial: number;
  /** localizer deviation, deg: positive = deflect bar right (airplane left of course) */
  locDev: number;
  /** glide-slope error, deg: positive = above the beam */
  gsErr: number;
  vorDist: number; thrDist: number;
}
export const NO_NAV: NavData = { vorValid: false, locValid: false, gsValid: false, radial: 0, locDev: 0, gsErr: 0, vorDist: 0, thrDist: 0 };

export function stepPos(p: { x: number; y: number }, hdg: number, tasKt: number, dt: number) {
  const d = (tasKt / 3600) * dt, h = hdg / DEG;
  return { x: p.x + d * Math.sin(h), y: p.y + d * Math.cos(h) };
}

export function radioNav(p: { x: number; y: number }, altFt: number, tuned: NavStationKind, frequencyMHz?: number, sceneId: NavSceneId = "RPLL06"): NavData {
  const scene = NAV_SCENES[sceneId];
  const station = frequencyMHz === undefined
    ? TRAINING_NAV_STATIONS.find((item) => item.kind === tuned && item.available && (item.kind === "VOR" || item.scene === sceneId))
    : findTrainingNavStation(frequencyMHz);
  // A wrong frequency or unavailable station must produce invalid navigation, never a plausible live signal.
  if (!station || !station.available || station.kind !== tuned) return NO_NAV;
  // An ILS only works in its own scene (the RPLL 109.1 localizer does not exist while the aircraft is near Changi, and vice versa).
  if (station.kind === "ILS" && station.scene !== sceneId) return NO_NAV;
  const dxv = p.x - VOR_POS.x, dyv = p.y - VOR_POS.y;
  const vorDist = Math.hypot(dxv, dyv);
  const radial = (Math.atan2(dxv, dyv) * DEG + 360) % 360;
  const dxa = p.x - scene.locAnt.x, dya = p.y - scene.locAnt.y;
  const antDist = Math.hypot(dxa, dya);
  const brg = (Math.atan2(dxa, dya) * DEG + 360) % 360;
  const locDev = angDiff(brg, (scene.crs + 180) % 360);
  const locValid = tuned === "ILS" && antDist < 25 && antDist > 0.1 && Math.abs(locDev) < 35;
  const thrDist = Math.hypot(p.x, p.y);
  const c = (scene.crs * Math.PI) / 180;
  const along = p.x * Math.sin(c) + p.y * Math.cos(c); // distance past the threshold along the course (negative = on the approach side)
  const gsAng = Math.atan2(Math.max(0, altFt - scene.fieldElevFt), Math.max(thrDist, 0.01) * NM_FT) * DEG;
  const pastThreshold = sceneId === "RPLL06" ? p.x >= 0.2 : along >= 0.2; // RPLL06 keeps the original east-coordinate test
  const gsValid = locValid && !pastThreshold && thrDist < scene.gsRangeNm && thrDist > 0.1 && Math.abs(locDev) < 8 && gsAng < 8;
  return { vorValid: tuned === "VOR" && vorDist < 80 && vorDist > 0.2, locValid, gsValid, radial, locDev, gsErr: gsAng - scene.gsDeg, vorDist, thrDist };
}

/** VOR deviation for a selected course: positive = bar right; `to` = TO flag. */
export function vorDevOf(radial: number, crs: number) {
  const from = Math.abs(angDiff(radial, crs)) < 90;
  const dev = from ? angDiff(crs, radial) : angDiff(radial, (crs + 180) % 360);
  return { dev: Math.max(-90, Math.min(90, dev)), to: !from };
}
