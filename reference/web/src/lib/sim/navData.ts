/**
 * Real-chart navigation data used by the flight-plan guidance (trainer use only).
 *
 * Every number here was read from the CAAP / CAAS AIP pages supplied or fetched in the session, and each
 * block records its source edition. Nothing here is a certified navigation database: editions are mixed
 * (see NAV_DATA_EDITIONS) and the user is expected to re-check against current charts.
 *
 * Magnetic variation is east-positive (magnetic = true - variation).
 */
export const NAV_DATA_EDITIONS = {
  rpllSid: "RPLL AD 2-15/16 SID, AIRAC AIP AMDT 003/25 (30 OCT 25)",
  rpllArea: "RPLL AD 2-13 Area Chart, AIRAC AIP AMDT 087/24 (26 DEC 24)",
  rpllAerodrome: "RPLL AD 2 aerodrome data, AIRAC AIP AMDT 003/26 (14 MAY 26) - pages marked DRAFT",
  wsssIls02L: "WSSS AD 2 IAC-1 ILS/DME RWY 02L (ICW), AIP Singapore AMDT 01/2025 (20 FEB 2025)",
} as const;

export type Runway = {
  id: string;
  /** true bearing of the runway centreline, degrees */
  trueBrgDeg: number;
  thrLat: number;
  thrLon: number;
  lengthM: number;
};
export type AirportData = {
  icao: string;
  name: string;
  /** aerodrome reference point (used for distance-to-destination only) */
  arpLat: number;
  arpLon: number;
  magVarDeg: number;
  runways: Record<string, Runway>;
};

const dms = (d: number, m: number, s: number, hemi: "N" | "S" | "E" | "W" = "N") => {
  const v = d + m / 60 + s / 3600;
  return hemi === "S" || hemi === "W" ? -v : v;
};
/** Parse an AIP style coordinate such as 140248.9N / 1210134.9E. */
export function parseAipCoord(text: string): number {
  const m = /^(\d{2,3})(\d{2})(\d{2}(?:\.\d+)?)([NSEW])$/.exec(text.trim());
  if (!m) throw new Error(`Bad AIP coordinate: ${text}`);
  return dms(Number(m[1]), Number(m[2]), Number(m[3]), m[4] as "N" | "S" | "E" | "W");
}

export const AIRPORT_DATA: Record<string, AirportData> = {
  RPLL: {
    icao: "RPLL", name: "Manila / Ninoy Aquino Intl",
    arpLat: dms(14, 30, 36), arpLon: dms(121, 0, 49),
    // AIP: 3 deg W (2021), increasing ~6 min/yr -> about 2.5 deg W for 2026.
    magVarDeg: -2.5,
    runways: {
      "06": { id: "06", trueBrgDeg: 60.3, thrLat: dms(14, 29, 54.83), thrLon: dms(121, 0, 5.11), lengthM: 3514 },
      // RWY 24 position = the end-of-runway coordinate in the AIP aerodrome table (the RWY 24 threshold row was not separately legible).
      // It lies about 100 m short of the listed 3514 m, so treat it as the runway end, within roughly 100 m of the threshold.
      "24": { id: "24", trueBrgDeg: 240.3, thrLat: dms(14, 30, 49.78), thrLon: dms(121, 1, 44.02), lengthM: 3514 },
    },
  },
  WSSS: {
    icao: "WSSS", name: "Singapore Changi",
    arpLat: 1.3502, arpLon: 103.9940,
    // IAC-1: VAR 0 deg 23' E (2020)
    magVarDeg: 0.38,
    runways: {
      "02L": { id: "02L", trueBrgDeg: 23.02, thrLat: dms(1, 20, 56.27), thrLon: dms(103, 58, 38.82), lengthM: 4000 },
      "02C": { id: "02C", trueBrgDeg: 23.01, thrLat: dms(1, 19, 43.51), thrLon: dms(103, 59, 5.86), lengthM: 4000 },
    },
  },
  WMKK: { icao: "WMKK", name: "Kuala Lumpur Intl", arpLat: 2.7456, arpLon: 101.7072, magVarDeg: 0.2, runways: {} },
};

/** East-positive magnetic variation, interpolated by latitude between the two charted endpoints (RPLL -> WSSS). */
export function magVarAt(latitude: number): number {
  const north = { lat: 14.5, v: AIRPORT_DATA.RPLL.magVarDeg };
  const south = { lat: 1.35, v: AIRPORT_DATA.WSSS.magVarDeg };
  const t = Math.max(0, Math.min(1, (latitude - south.lat) / (north.lat - south.lat)));
  return south.v + (north.v - south.v) * t;
}

/* ── RPLL published SID reporting points (SID chart coordinate table) ── */
const RAW_FIXES: Record<string, [string, string]> = {
  ATMIG: ["142808.0N", "1202705.6E"], BALAY: ["135409.6N", "1204342.0E"], BATAN: ["143937.0N", "1203333.3E"],
  BETEL: ["141038.1N", "1201046.1E"], BORGA: ["142259.8N", "1204210.6E"], BUCAL: ["133559.6N", "1203456.0E"],
  CAMBA: ["141926.6N", "1211457.4E"], CARMO: ["141540.0N", "1210407.5E"], DILAN: ["142925.9N", "1204552.7E"],
  FONSO: ["150454.3N", "1205705.8E"], IBAGO: ["133237.8N", "1211834.3E"], INDAN: ["141124.9N", "1205203.0E"],
  IPATA: ["135157.4N", "1214848.0E"], KEERO: ["141355.9N", "1201907.2E"], LABON: ["143826.0N", "1205218.7E"],
  LAIYA: ["133418.9N", "1212340.4E"], LIGPA: ["135722.4N", "1210736.1E"], MIGEL: ["150313.6N", "1210318.5E"],
  NATIB: ["144247.2N", "1202352.8E"], OLIVA: ["145657.8N", "1204320.4E"], RADEG: ["145221.3N", "1205449.6E"],
  REPAT: ["144952.8N", "1203920.5E"], SABIG: ["140918.7N", "1212727.6E"], SIMBO: ["144740.2N", "1202352.8E"],
  SIRCA: ["142738.3N", "1202002.3E"], TAALA: ["140248.9N", "1210134.9E"], TALIM: ["142123.7N", "1211941.2E"],
  TANAY: ["143326.0N", "1212039.4E"], TIMON: ["140309.5N", "1215622.7E"], TONDO: ["143343.6N", "1205127.8E"],
  VERDE: ["133013.2N", "1210154.4E"], VOTAS: ["144238.1N", "1205304.2E"],
};
export const RPLL_FIXES: Record<string, { lat: number; lon: number }> = Object.fromEntries(
  Object.entries(RAW_FIXES).map(([name, [la, lo]]) => [name, { lat: parseAipCoord(la), lon: parseAipCoord(lo) }]),
);
/** MIA DVOR/DME 114.4 (Area chart / SID chart). */
export const MIA_DVOR = { lat: dms(14, 30, 28.7), lon: dms(121, 1, 18.2), freqMHz: 114.4 };

export type SidFix = { name: string; minAltFt: number | null };
export type SidDef = {
  base: string;
  /** MIA radial the SID tracks out on (magnetic) - informational */
  radial: number;
  fixes: SidFix[];
  /** Suffix printed on the chart for RWY 06 / 24 / 13 (SID chart page 2, AMDT 003/25). */
  suffixes: [string, string, string];
  /** Take-off instruction printed for each runway. */
  initial: { "06": string; "24": string; "13": string };
  remarks?: string;
};
const L5 = "Left turn within 5.0 NM";
const R5 = "Right turn within 5.0 NM";
const S3R = "Straight-out departure to 3000 FT, then right climbing turn";
const S3L_P1 = "Straight-out departure to 3000 FT, then left climbing turn avoiding RP-P1";
const H113R = "Turn left heading 113\u00B0M to 3000 FT, then right climbing turn";
export const RPLL_SID_NOTES = "RWY 06 PDG 5.0% until 3000 FT then 3.3%. From sunrise to sunset IFR departures on RWY 06/24 climb in the IFR Climb/Descent Area to cross the VFR area at or above 3000 FT.";
export const RPLL_SIDS: Record<string, SidDef> = {
  VERDE: { base: "VERDE", radial: 182, suffixes: ["2A", "2B", "2C"], fixes: [{ name: "TAALA", minAltFt: 8000 }, { name: "VERDE", minAltFt: 11000 }], initial: { "06": S3R, "24": L5, "13": H113R }, remarks: "Crossing altitude restriction at TAALA may be increased by ATC subject to RP-R72 and MTA-2 activities." },
  BETEL: { base: "BETEL", radial: 251, suffixes: ["2A", "2B", "2C"], fixes: [{ name: "BORGA", minAltFt: 5000 }, { name: "KEERO", minAltFt: 6000 }, { name: "BETEL", minAltFt: null }], initial: { "06": S3R, "24": R5, "13": H113R } },
  BUCAL: { base: "BUCAL", radial: 208, suffixes: ["2A", "2B", "2C"], fixes: [{ name: "INDAN", minAltFt: 5000 }, { name: "BALAY", minAltFt: 6000 }, { name: "BUCAL", minAltFt: 9000 }], initial: { "06": S3R, "24": L5, "13": H113R } },
  IBAGO: { base: "IBAGO", radial: 172, suffixes: ["2A", "2B", "2C"], fixes: [{ name: "CARMO", minAltFt: 5000 }, { name: "LIGPA", minAltFt: 9000 }, { name: "IBAGO", minAltFt: null }], initial: { "06": S3R, "24": L5, "13": H113R } },
  IPATA: { base: "IPATA", radial: 133, suffixes: ["2A", "2B", "2C"], fixes: [{ name: "CAMBA", minAltFt: 6000 }, { name: "SABIG", minAltFt: 10000 }, { name: "IPATA", minAltFt: null }], initial: { "06": S3R, "24": L5, "13": H113R } },
  LAIYA: { base: "LAIYA", radial: 172, suffixes: ["2A", "2B", "2C"], fixes: [{ name: "CARMO", minAltFt: 5000 }, { name: "LIGPA", minAltFt: 8000 }, { name: "LAIYA", minAltFt: null }], initial: { "06": S3R, "24": L5, "13": H113R }, remarks: "Crossing altitude at LIGPA may be increased by ATC subject to RP-R72 and MTA-2 activities." },
  TIMON: { base: "TIMON", radial: 120, suffixes: ["2A", "2B", "2C"], fixes: [{ name: "TALIM", minAltFt: 5000 }, { name: "TIMON", minAltFt: 8000 }], initial: { "06": S3R, "24": L5, "13": H113R } },
  NATIB: { base: "NATIB", radial: 292, suffixes: ["2A", "2B", "2C"], fixes: [{ name: "TONDO", minAltFt: 6000 }, { name: "BATAN", minAltFt: null }, { name: "NATIB", minAltFt: null }], initial: { "06": S3L_P1, "24": S3R, "13": H113R } },
  OLIVA: { base: "OLIVA", radial: 330, suffixes: ["2A", "2B", "2C"], fixes: [{ name: "VOTAS", minAltFt: 6000 }, { name: "OLIVA", minAltFt: null }], initial: { "06": S3L_P1, "24": S3R, "13": H113R } },
  SIRCA: { base: "SIRCA", radial: 269, suffixes: ["2D", "2E", "2F"], fixes: [{ name: "DILAN", minAltFt: 6500 }, { name: "ATMIG", minAltFt: 7000 }, { name: "SIRCA", minAltFt: null }], initial: { "06": S3R, "24": S3R, "13": H113R } },
};
/** CAB, JOM and SIMBO SIDs (VOR track-in or special turns) are not encoded: they need leg types this planner does not model. */

export function sidProcedureName(base: string, rwy: string): string | null {
  const def = RPLL_SIDS[base];
  if (!def) return null;
  if (rwy === "06") return `${def.base}${def.suffixes[0]}`;
  if (rwy === "24") return `${def.base}${def.suffixes[1]}`;
  if (rwy === "13") return `${def.base}${def.suffixes[2]}`;
  return null;
}

/* ── WSSS ILS/DME RWY 02L (ICW) ── */
export type IlsScene = {
  id: string;
  airport: string;
  runway: string;
  stationId: string;
  frequencyMHz: number;
  /** published final approach course, magnetic */
  courseMag: number;
  trueCourseDeg: number;
  gsDeg: number;
  /** distance (NM) from threshold along the course to the localizer antenna, beyond the far runway end. ASSUMED, not charted. */
  locAntBeyondThrNm: number;
  /** glide-slope validity range (NM). ICAO minimum coverage is 10 NM; the chart intercepts 3500 ft at about 10.9 NM. */
  gsRangeNm: number;
  thrLat: number;
  thrLon: number;
  /** charted fixes along the final approach, with distance from threshold (NM, DME ICW = threshold DME) */
  fixes: { name: string; dmeNm: number; altFt: number | null; lat?: number; lon?: number }[];
  source: string;
};
export const WSSS_ILS_02L: IlsScene = {
  id: "WSSS-02L", airport: "WSSS", runway: "02L", stationId: "SIM-WSSS-ILS-02L",
  frequencyMHz: 110.9, courseMag: 23, trueCourseDeg: 23.02, gsDeg: 3.0,
  locAntBeyondThrNm: 2.4, gsRangeNm: 12,
  thrLat: AIRPORT_DATA.WSSS.runways["02L"].thrLat, thrLon: AIRPORT_DATA.WSSS.runways["02L"].thrLon,
  fixes: [
    { name: "SAMKO", dmeNm: 16.6, altFt: null, lat: dms(1, 6, 18), lon: dms(103, 52, 28) },
    { name: "APIPA", dmeNm: 16, altFt: 3500 },
    { name: "ANUMA", dmeNm: 11.1, altFt: 3500 },
    { name: "AKIPO", dmeNm: 7.8, altFt: 2500 },
    { name: "ADNIK", dmeNm: 4.6, altFt: 1500, lat: dms(1, 16, 51), lon: dms(103, 56, 55) },
    { name: "ABVON", dmeNm: 0.7, altFt: null },
  ],
  source: NAV_DATA_EDITIONS.wsssIls02L,
};

/** True for the WSSS 02L arrival scene id. Accepts the legacy un-hyphenated spelling too, so plans saved before the id was unified still work. */
export function isWsssArrivalSceneId(id: string | undefined | null): boolean {
  return id === WSSS_ILS_02L.id || id === "WSSS02L";
}

/* ── geometry helpers ── */
const R_NM = 3440.065;
const toRad = (d: number) => (d * Math.PI) / 180;
export function destPoint(lat: number, lon: number, brgTrueDeg: number, distNm: number) {
  const la = toRad(lat), lo = toRad(lon), b = toRad(brgTrueDeg), d = distNm / R_NM;
  const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
  const lo2 = lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
  return { lat: (la2 * 180) / Math.PI, lon: (((lo2 * 180) / Math.PI + 540) % 360) - 180 };
}

export type PlanWaypoint = { id: string; name: string; latitude: number; longitude: number; altitudeFt: number; speedKt: number; source?: "charted" | "user" | "vector" };

/** Departure fixes for a SID on a runway, using published coordinates and chart minimum altitudes. */
export function buildSidWaypoints(base: string): PlanWaypoint[] {
  const def = RPLL_SIDS[base];
  if (!def) return [];
  return def.fixes.map((f) => {
    const c = RPLL_FIXES[f.name];
    return { id: `SID-${f.name}`, name: f.name, latitude: c.lat, longitude: c.lon, altitudeFt: f.minAltFt ?? 0, speedKt: 0, source: "charted" as const };
  });
}

/**
 * Synthetic radar-vector pattern for a conventional (non-RNAV) arrival to an ILS runway.
 * Fixes VCT-A/B/C are NOT charted points: they stand in for ATC vectors (downwind, base, intercept).
 * Coming from the right of the final course the pattern is built on the right, otherwise on the left.
 */
export function buildVectorArrival(scene: IlsScene, fromLat: number, fromLon: number): { waypoints: PlanWaypoint[]; side: 1 | -1 } {
  const c = scene.trueCourseDeg;
  const brgThrToFrom = (Math.atan2(Math.sin(toRad(fromLon - scene.thrLon)) * Math.cos(toRad(fromLat)),
    Math.cos(toRad(scene.thrLat)) * Math.sin(toRad(fromLat)) - Math.sin(toRad(scene.thrLat)) * Math.cos(toRad(fromLat)) * Math.cos(toRad(fromLon - scene.thrLon))) * 180) / Math.PI;
  const rel = ((((brgThrToFrom - c) + 540) % 360) - 180);
  const side: 1 | -1 = rel >= 0 ? 1 : -1;
  const recip = (c + 180) % 360;
  const offBrg = (c + 90 * side + 360) % 360;
  const A = destPoint(scene.thrLat, scene.thrLon, offBrg, 8);
  const B = destPoint(A.lat, A.lon, recip, 25);
  const C = destPoint(scene.thrLat, scene.thrLon, recip, 13.5);
  const mk = (n: string, p: { lat: number; lon: number }, alt: number, spd: number): PlanWaypoint => ({ id: `VCT-${n}`, name: `VCT-${n}`, latitude: p.lat, longitude: p.lon, altitudeFt: alt, speedKt: spd, source: "vector" });
  return { side, waypoints: [mk("A", A, 5000, 220), mk("B", B, 4000, 200), mk("C", C, 3500, 190)] };
}
