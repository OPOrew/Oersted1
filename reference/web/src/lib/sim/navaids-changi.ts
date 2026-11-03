/**
 * Oersted — Changi (WSSS) focused Navaid Database
 * ================================================
 * Regional radio-navigation catalog for the Manila–Singapore training area.
 * Includes CAAS-listed regional VOR/DME aids, Philippine VOR/DME stations transcribed
 * from user screenshots, Changi ILS facilities, Manila MIA, and disabled legacy NDB records.
 * Designed for the 737-200 Navigation Trainer.
 *
 * Primary sources (2025–2026 CAAS AIP):
 *  - GEN 2.5 List of Radio Navigation Aids
 *  - AD 2.WSSS Runway Physical Characteristics & Radio Navigation Aids
 *  - Existing navData.ts runway thresholds already verified in the project
 *
 * All coordinates are true (WGS-84). Magnetic variation ≈ 0.38° E (2020 chart).
 * This file is training-only. Cross-check frequencies/coordinates against
 * the current official AIP before any operational use.
 */

export type NavaidKind = "VOR" | "VOR_DME" | "ILS" | "LOC" | "NDB" | "DME";

export interface Navaid {
  id: string;
  ident: string;
  name: string;
  kind: NavaidKind;
  /** MHz for VOR/ILS, kHz for NDB */
  frequency: number;
  lat: number;
  lon: number;
  elevFt?: number;
  /** east-positive */
  magVarDeg: number;
  rangeNm: number;
  /** published magnetic course (ILS/LOC) */
  courseMag?: number;
  gsDeg?: number;
  runway?: string;
  /** ICAO airport or regional area associated with the aid */
  airport: string;
  /** DME channel when collocated */
  dmeChannel?: string;
  source: string;
  available: boolean;
}

export function dms(d: number, m: number, s: number, hemi: "N" | "S" | "E" | "W" = "N") {
  const v = d + m / 60 + s / 3600;
  return hemi === "S" || hemi === "W" ? -v : v;
}

/** Official runway threshold coordinates from CAAS AIP AD 2.12 (2025/2026) */
export const WSSS_RUNWAYS = {
  "02L": {
    trueBrg: 23.02,
    thrLat: dms(1, 20, 56.27),
    thrLon: dms(103, 58, 38.82),
    elevFt: 22,
    lengthM: 4000,
  },
  "20R": {
    trueBrg: 203.02,
    thrLat: dms(1, 22, 34.02),   // displaced threshold
    thrLon: dms(103, 59, 20.09),
    elevFt: 13,
    lengthM: 4000,
    displacedM: 740,
  },
  "02C": {
    trueBrg: 23.01,
    thrLat: dms(1, 19, 43.51),
    thrLon: dms(103, 59, 5.86),
    elevFt: 16,
    lengthM: 4000,
  },
  "20C": {
    trueBrg: 203.01,
    thrLat: dms(1, 21, 43.37),
    thrLon: dms(103, 59, 56.46),
    elevFt: 16,
    lengthM: 4000,
  },
  "02R": {
    trueBrg: 23.01,
    thrLat: dms(1, 19, 20.59),
    thrLon: dms(103, 59, 59.45),
    elevFt: 16,
    lengthM: 4000,
  },
  "20L": {
    trueBrg: 203.01,
    thrLat: dms(1, 21, 20.45),
    thrLon: dms(104, 0, 50.05),
    elevFt: 16,
    lengthM: 4000,
  },
} as const;

export const CHANGI_NAVAIDS: Navaid[] = [
  // ─── Regional VOR/DME stations (current CAAS AIP ENR 4.1) ───────
  {
    id: "WMKJ-VJB", ident: "VJB", name: "Johor Bahru DVOR/DME", kind: "VOR_DME",
    frequency: 112.5, lat: dms(1, 39, 50), lon: dms(103, 39, 39), elevFt: 141,
    magVarDeg: 0.38, rangeNm: 200, airport: "WMKJ", dmeChannel: "72X",
    source: "CAAS AIP Singapore ENR 4.1, effective 03 Sep 2026; Malaysian-operated aid", available: true,
  },
  {
    id: "WMKM-VMR", ident: "VMR", name: "Mersing DVOR/DME", kind: "VOR_DME",
    frequency: 116.8, lat: dms(2, 23, 18), lon: dms(103, 52, 18),
    magVarDeg: 0.38, rangeNm: 200, airport: "WMKM", dmeChannel: "115X",
    source: "CAAS AIP Singapore ENR 4.1, effective 03 Sep 2026; Malaysian-operated aid", available: true,
  },
  {
    id: "WSAP-PU", ident: "PU", name: "Papa Uniform DVOR/DME", kind: "VOR_DME",
    frequency: 115.1, lat: dms(1, 25, 24), lon: dms(103, 56, 0), elevFt: 190,
    magVarDeg: 0.38, rangeNm: 200, airport: "WSAP", dmeChannel: "98X",
    source: "CAAS AIP Singapore ENR 4.1, effective 03 Sep 2026", available: true,
  },
  {
    id: "WIDN-TPG", ident: "TPG", name: "Tanjungpinang VOR/DME", kind: "VOR_DME",
    frequency: 114.8, lat: dms(0, 54, 13), lon: dms(104, 30, 52),
    magVarDeg: 0.38, rangeNm: 40, airport: "WIDN", dmeChannel: "95X",
    source: "CAAS AIP Singapore ENR 4.1, effective 03 Sep 2026; hours limited to 0000–1400 UTC", available: true,
  },
  {
    id: "WIII-BTM", ident: "BTM", name: "Batam/Hang Nadim VOR/DME", kind: "VOR_DME",
    frequency: 116.0, lat: dms(1, 8, 12.77), lon: dms(104, 7, 57.32),
    magVarDeg: 0.38, rangeNm: 100, airport: "WIDD", dmeChannel: "107X",
    source: "Older CAAS AIP ENR 4.1 listing; current operational status not confirmed", available: false,
  },
  {
    id: "RPLL-MIA", ident: "MIA", name: "Manila VOR/DME", kind: "VOR_DME",
    frequency: 114.4, lat: dms(14, 30, 28), lon: dms(121, 1, 18.2),
    magVarDeg: 0, rangeNm: 100, airport: "RPLL", dmeChannel: "91X",
    source: "User-supplied RPLL VOR RWY 06/13/24 charts, dated 30 Nov 2023; current AIP confirmation pending", available: true,
  },

  // ─── Primary Singapore VORs ─────────────────────────────────────
  {
    id: "WSSS-VTK",
    ident: "VTK",
    name: "Tekong DVOR/DME",
    kind: "VOR_DME",
    frequency: 116.50,
    lat: dms(1, 24, 55),
    lon: dms(104, 1, 20),
    elevFt: 150,
    magVarDeg: 0.38,
    rangeNm: 200,
    airport: "WSSS",
    dmeChannel: "112X",
    source: "CAAS AIP GEN 2.5 / ENR 4.1 – Tekong",
    available: true,
  },
  {
    id: "WSSS-SJ",
    ident: "SJ",
    name: "Sinjon DVOR/DME",
    kind: "VOR_DME",
    frequency: 113.50,
    lat: dms(1, 13, 21.34),
    lon: dms(103, 51, 15.22),
    elevFt: 150,
    magVarDeg: 0.38,
    rangeNm: 200,
    airport: "WSSS",
    dmeChannel: "82X",
    source: "CAAS AIP GEN 2.5 / ENR 4.1 – Sinjon",
    available: true,
  },


  // ─── Philippine VOR/DME stations transcribed from user-provided VATSIM Radar screenshots ──
  // Coordinates are approximate map-position estimates; frequency/ident values are screenshot-derived,
  // not yet cross-checked against the current CAAP AIP. Keep source metadata explicit.
  {
    id: "RPVS-ZAM", ident: "ZAM", name: "Zamboanga VOR/DME", kind: "VOR_DME",
    frequency: 113.9, lat: 6.9224, lon: 122.0596, magVarDeg: -1.3, rangeNm: 50,
    elevFt: 100, airport: "RPVZ", source: "User-provided VATSIM Radar station panel; approximate map coordinates; CAAP AIP verification pending", available: true,
  },
  {
    id: "RPVB-BCD", ident: "BCD", name: "Bacolod VOR/DME", kind: "VOR_DME",
    frequency: 115.3, lat: 10.776, lon: 122.975, magVarDeg: -2, rangeNm: 60,
    elevFt: 100, airport: "RPVB", source: "User-provided VATSIM Radar station panel; approximate map coordinates; CAAP AIP verification pending", available: true,
  },
  {
    id: "RPVD-DGT", ident: "DGT", name: "Dumaguete VOR/DME", kind: "VOR_DME",
    frequency: 114.1, lat: 9.334, lon: 123.301, magVarDeg: -1.8, rangeNm: 130,
    airport: "RPVD", source: "User-provided VATSIM Radar station panel; approximate map coordinates; CAAP AIP verification pending", available: true,
  },
  {
    id: "RPVP-PR", ident: "PR", name: "Puerto Princesa VOR/DME", kind: "VOR_DME",
    frequency: 115.9, lat: 9.742, lon: 118.759, magVarDeg: -1.6, rangeNm: 130,
    elevFt: 100, airport: "RPVP", source: "User-provided VATSIM Radar station panel; approximate map coordinates; CAAP AIP verification pending", available: true,
  },
  {
    id: "RPVJ-JOM", ident: "JOM", name: "Jomalig VOR/DME", kind: "VOR_DME",
    frequency: 116.7, lat: 14.706, lon: 122.376, magVarDeg: -2.8, rangeNm: 90,
    elevFt: 77, airport: "PH-JOMALIG", source: "User-provided VATSIM Radar station panel; approximate map coordinates; CAAP AIP verification pending", available: true,
  },
  {
    id: "RPLB-CIA", ident: "CIA", name: "Clark VOR/DME", kind: "VOR_DME",
    frequency: 113.1, lat: 15.185, lon: 120.560, magVarDeg: 0, rangeNm: 100,
    airport: "RPLC", source: "User-provided VATSIM Radar screenshot; approximate map coordinates; CAAP AIP verification pending", available: true,
  },
  {
    id: "RPUB-SBA", ident: "SBA", name: "Subic Bay VOR/DME", kind: "VOR_DME",
    frequency: 113.5, lat: 14.795, lon: 120.271, magVarDeg: 0, rangeNm: 100,
    airport: "RPLB", source: "User-provided VATSIM Radar screenshot; approximate map coordinates; CAAP AIP verification pending", available: true,
  },
  {
    id: "RPLO-LAO", ident: "LAO", name: "Laoag VOR/DME", kind: "VOR_DME",
    frequency: 112.9, lat: 18.182, lon: 120.532, magVarDeg: 0, rangeNm: 100,
    airport: "RPLI", source: "User-provided VATSIM Radar screenshot; approximate map coordinates; CAAP AIP verification pending", available: true,
  },
  {
    id: "RPLO-PRD", ident: "PRD", name: "Laoag-area VOR/DME (second map entry)", kind: "VOR_DME",
    frequency: 114.1, lat: 18.20, lon: 120.57, magVarDeg: 0, rangeNm: 50,
    airport: "RPLI", source: "User-provided VATSIM Radar screenshot; station identity/location ambiguous; do not treat as verified", available: false,
  },
  {
    id: "RPVT-TUG", ident: "TUG", name: "Tuguegarao VOR/DME", kind: "VOR_DME",
    frequency: 112.1, lat: 17.643, lon: 121.733, magVarDeg: 0, rangeNm: 100,
    airport: "RPUT", source: "User-provided VATSIM Radar screenshot; approximate map coordinates; CAAP AIP verification pending", available: true,
  },
  {
    id: "RPUY-CUY", ident: "CUY", name: "Cauayan VOR/DME", kind: "VOR_DME",
    frequency: 116.5, lat: 16.929, lon: 121.753, magVarDeg: 0, rangeNm: 100,
    airport: "RPUY", source: "User-provided VATSIM Radar screenshot; approximate map coordinates; CAAP AIP verification pending", available: true,
  },
  {
    id: "RPVC-CAB", ident: "CAB", name: "Cabanatuan VOR/DME", kind: "VOR_DME",
    frequency: 112.7, lat: 15.486, lon: 120.973, magVarDeg: 0, rangeNm: 100,
    airport: "PH-CABANATUAN", source: "User-provided VATSIM Radar screenshot; approximate map coordinates; CAAP AIP verification pending", available: true,
  },
  {
    id: "RPNO-NGA", ident: "NGA", name: "Naga (Pili) VOR/DME", kind: "VOR_DME",
    frequency: 114.7, lat: 13.585, lon: 123.270, magVarDeg: 0, rangeNm: 100,
    airport: "RPUN", source: "User-provided VATSIM Radar screenshot; approximate map coordinates; CAAP AIP verification pending", available: true,
  },
  {
    id: "RPVB-BIK", ident: "BIK", name: "Bicol VOR/DME", kind: "VOR_DME",
    frequency: 113.6, lat: 13.157, lon: 123.746, magVarDeg: 0, rangeNm: 100,
    airport: "PH-BICOL", source: "User-provided VATSIM Radar screenshot; approximate map coordinates; CAAP AIP verification pending", available: true,
  },
  {
    id: "RPVS-SAJ", ident: "SAJ", name: "San Jose VOR/DME", kind: "VOR_DME",
    frequency: 117.1, lat: 12.361, lon: 121.047, magVarDeg: 0, rangeNm: 100,
    airport: "RPUH", source: "User-provided VATSIM Radar screenshot; approximate map coordinates; CAAP AIP verification pending", available: true,
  },
  {
    id: "RPVM-MBT", ident: "MBT", name: "Masbate VOR/DME", kind: "VOR_DME",
    frequency: 115.7, lat: 12.369, lon: 123.630, magVarDeg: 0, rangeNm: 100,
    airport: "RPVJ", source: "User-provided VATSIM Radar screenshot; approximate map coordinates; CAAP AIP verification pending", available: true,
  },
  {
    id: "RPVO-ROX", ident: "ROX", name: "Roxas VOR/DME", kind: "VOR_DME",
    frequency: 112.9, lat: 11.598, lon: 122.751, magVarDeg: 0, rangeNm: 100,
    airport: "RPVR", source: "User-provided VATSIM Radar screenshot; approximate map coordinates; CAAP AIP verification pending", available: true,
  },
  {
    id: "RPLI-TAC", ident: "TAC", name: "Tacloban VOR/DME", kind: "VOR_DME",
    frequency: 115.5, lat: 11.228, lon: 125.027, magVarDeg: 0, rangeNm: 100,
    airport: "RPVA", source: "User-provided VATSIM Radar screenshot; approximate map coordinates; CAAP AIP verification pending", available: true,
  },
  {
    id: "RPVM-MCT", ident: "MCT", name: "Mactan (Lapu-Lapu) VOR/DME", kind: "VOR_DME",
    frequency: 114.3, lat: 10.307, lon: 123.979, magVarDeg: 0, rangeNm: 100,
    airport: "RPVM", source: "User-provided VATSIM Radar screenshot; approximate map coordinates; CAAP AIP verification pending", available: true,
  },
  {
    id: "RPVB-BHL", ident: "BHL", name: "Panglao VOR/DME", kind: "VOR_DME",
    frequency: 116.2, lat: 9.576, lon: 123.770, magVarDeg: 0, rangeNm: 100,
    airport: "RPSP", source: "User-provided VATSIM Radar screenshot; approximate map coordinates; CAAP AIP verification pending", available: true,
  },
  {
    id: "RPMD-LGD", ident: "LGD", name: "Laguindingan VOR/DME", kind: "VOR_DME",
    frequency: 116.1, lat: 8.612, lon: 124.456, magVarDeg: 0, rangeNm: 100,
    airport: "RPMY", source: "User-provided VATSIM Radar screenshot; approximate map coordinates; CAAP AIP verification pending", available: true,
  },
  {
    id: "RPMB-BN", ident: "BN", name: "Butuan VOR/DME", kind: "VOR_DME",
    frequency: 112.5, lat: 8.952, lon: 125.478, magVarDeg: 0, rangeNm: 100,
    airport: "RPME", source: "User-provided VATSIM Radar screenshot; approximate map coordinates; CAAP AIP verification pending", available: true,
  },
  {
    id: "RPMR-COT", ident: "COT", name: "Cotabato VOR/DME", kind: "VOR_DME",
    frequency: 113.7, lat: 7.165, lon: 124.209, magVarDeg: 0, rangeNm: 100,
    airport: "RPMC", source: "User-provided VATSIM Radar screenshot; approximate map coordinates; CAAP AIP verification pending", available: true,
  },
  {
    id: "RPMR-GSA", ident: "GSA", name: "Tambler (General Santos) VOR/DME", kind: "VOR_DME",
    frequency: 114.5, lat: 6.058, lon: 125.096, magVarDeg: 0, rangeNm: 100,
    airport: "RPMR", source: "User-provided VATSIM Radar screenshot; approximate map coordinates; CAAP AIP verification pending", available: true,
  },
  {
    id: "RPMD-DAO", ident: "DAO", name: "Davao VOR/DME", kind: "VOR_DME",
    frequency: 112.1, lat: 7.125, lon: 125.646, magVarDeg: 0, rangeNm: 100,
    airport: "RPMD", source: "User-provided VATSIM Radar screenshot; approximate map coordinates; CAAP AIP verification pending", available: true,
  },
  {
    id: "RPLI-BS", ident: "BS", name: "Basco VOR/DME", kind: "VOR_DME",
    frequency: 116.0, lat: 20.451, lon: 121.980, magVarDeg: 0, rangeNm: 100,
    airport: "RPUO", source: "User-provided VATSIM Radar screenshot; approximate map coordinates; CAAP AIP verification pending", available: true,
  },
  {
    id: "RPVP-KLO", ident: "KLO", name: "Kalibo VOR/DME", kind: "VOR_DME",
    frequency: 113.0, lat: 11.679, lon: 122.376, magVarDeg: 0, rangeNm: 100,
    airport: "RPVK", source: "User-provided VATSIM Radar screenshot; approximate map coordinates; CAAP AIP verification pending", available: true,
  },
  {
    id: "RPVI-IOO", ident: "IOO", name: "Iloilo VOR/DME", kind: "VOR_DME",
    frequency: 116.3, lat: 10.713, lon: 122.545, magVarDeg: 0, rangeNm: 100,
    airport: "RPVI", source: "User-provided VATSIM Radar screenshot; approximate map coordinates; CAAP AIP verification pending", available: true,
  },

  // ─── ILS systems (all 3° GS) ────────────────────────────────────
  {
    id: "WSSS-ILS-02C",
    ident: "ICE",
    name: "Changi ILS/DME RWY 02C",
    kind: "ILS",
    frequency: 108.30,
    lat: dms(1, 21, 54.47),          // LOC antenna (approx from AIP)
    lon: dms(104, 0, 1.18),
    elevFt: 20,
    magVarDeg: 0.38,
    rangeNm: 25,
    courseMag: 23,
    gsDeg: 3.0,
    runway: "02C",
    airport: "WSSS",
    dmeChannel: "20X",
    source: "CAAS AIP AD 2.WSSS – ICE 108.3 / GP 334.1",
    available: true,
  },
  {
    id: "WSSS-ILS-20C",
    ident: "ICC",
    name: "Changi ILS/DME RWY 20C",
    kind: "ILS",
    frequency: 109.70,
    lat: dms(1, 19, 32.40),
    lon: dms(103, 59, 1.32),
    elevFt: 20,
    magVarDeg: 0.38,
    rangeNm: 25,
    courseMag: 203,
    gsDeg: 3.0,
    runway: "20C",
    airport: "WSSS",
    dmeChannel: "34X",
    source: "CAAS AIP AD 2.WSSS – ICC 109.7 / GP 333.2",
    available: true,
  },
  {
    id: "WSSS-ILS-02L",
    ident: "ICW",
    name: "Changi ILS/DME RWY 02L",
    kind: "ILS",
    frequency: 110.90,
    lat: dms(1, 23, 7.03),
    lon: dms(103, 59, 34.03),
    elevFt: 20,
    magVarDeg: 0.38,
    rangeNm: 25,
    courseMag: 23,
    gsDeg: 3.0,
    runway: "02L",
    airport: "WSSS",
    dmeChannel: "46X",
    source: "CAAS AIP AD 2.WSSS – ICW 110.9 (already used in existing WSSS_ILS_02L)",
    available: true,
  },
  {
    id: "WSSS-ILS-20R",
    ident: "ICH",
    name: "Changi ILS/DME RWY 20R",
    kind: "ILS",
    frequency: 108.90,
    lat: dms(1, 20, 45.23),
    lon: dms(103, 58, 34.17),
    elevFt: 20,
    magVarDeg: 0.38,
    rangeNm: 25,
    courseMag: 203,
    gsDeg: 3.0,
    runway: "20R",
    airport: "WSSS",
    source: "CAAS AIP AD 2.WSSS – ICH 108.9 / GP 329.3",
    available: true,
  },
  {
    id: "WSSS-ILS-02R",
    ident: "ICX",
    name: "Changi ILS/DME RWY 02R",
    kind: "ILS",
    frequency: 110.50,
    lat: dms(1, 21, 31.46),
    lon: dms(104, 0, 54.70),
    elevFt: 16,
    magVarDeg: 0.38,
    rangeNm: 25,
    courseMag: 23,
    gsDeg: 3.0,
    runway: "02R",
    airport: "WSSS",
    source: "CAAS AIP AD 2.WSSS – ICX 110.5",
    available: true,
  },


  // ─── Philippine NDB/ADF stations transcribed from user screenshots ─────────
  // Frequencies/identifiers are screenshot-derived. Coordinates are approximate
  // map-position estimates and are NOT verified against the current CAAP AIP.
  // These records are enabled for simulator display/tuning only, with source
  // status exposed in each marker popup; not for real-world navigation.
  {
    id: "RPUB-NDB-BA", ident: "BA", name: "Bagabag NDB", kind: "NDB",
    frequency: 339, lat: 16.52, lon: 121.25, magVarDeg: 0, rangeNm: 25,
    airport: "RPUB", source: "User-provided VATSIM Radar screenshot; 339 kHz / BA; approximate coordinates; CAAP AIP verification pending", available: true,
  },
  {
    id: "RPUB-NDB-BG", ident: "BG", name: "Baguio NDB", kind: "NDB",
    frequency: 272, lat: 16.375, lon: 120.62, magVarDeg: 0, rangeNm: 25,
    airport: "RPUB", source: "User-provided VATSIM Radar screenshot; 272 kHz / BG; approximate coordinates; CAAP AIP verification pending", available: true,
  },
  {
    id: "RPVK-NDB-CT", ident: "CT", name: "Caticlan NDB", kind: "NDB",
    frequency: 379, lat: 11.925, lon: 121.954, magVarDeg: 0, rangeNm: 25,
    airport: "RPVK", source: "User-provided VATSIM Radar screenshot; 379 kHz / CT; approximate coordinates; CAAP AIP verification pending", available: true,
  },
  {
    id: "RPVK-NDB-KL", ident: "KL", name: "Kalibo NDB", kind: "NDB",
    frequency: 298, lat: 11.68, lon: 122.38, magVarDeg: 0, rangeNm: 25,
    airport: "RPVK", source: "User-provided VATSIM Radar screenshot; 298 kHz / KL; approximate coordinates; CAAP AIP verification pending", available: true,
  },
  {
    id: "RPUV-NDB-VC", ident: "VC", name: "Virac NDB", kind: "NDB",
    frequency: 268, lat: 13.58, lon: 124.24, magVarDeg: 0, rangeNm: 25,
    airport: "RPUV", source: "User-provided VATSIM Radar screenshot; 268 kHz / VC; approximate coordinates; CAAP AIP verification pending", available: true,
  },
  {
    id: "RPMG-NDB-DI", ident: "DI", name: "Dipolog NDB", kind: "NDB",
    frequency: 389, lat: 8.60, lon: 123.34, magVarDeg: 0, rangeNm: 25,
    airport: "RPMG", source: "User-provided VATSIM Radar screenshot; 389 kHz / DI; approximate coordinates; CAAP AIP verification pending", available: true,
  },
  {
    id: "RPMA-NDB-OZ", ident: "OZ", name: "Ozamis NDB", kind: "NDB",
    frequency: 267, lat: 8.18, lon: 123.84, magVarDeg: 0, rangeNm: 25,
    airport: "RPMA", source: "User-provided VATSIM Radar screenshot; 267 kHz / OZ; approximate coordinates; CAAP AIP verification pending", available: true,
  },
  {
    id: "RPMR-NDB-AV", ident: "AV", name: "Allah Valley (Surallah) NDB", kind: "NDB",
    frequency: 377, lat: 6.37, lon: 124.75, magVarDeg: 0, rangeNm: 25,
    airport: "RPMR", source: "User-provided VATSIM Radar screenshot; 377 kHz / AV; approximate coordinates; CAAP AIP verification pending", available: true,
  },
  {
    id: "PH-NDB-PIN", ident: "PIN", name: "Pamali(can) (Quinaluban Island) NDB", kind: "NDB",
    frequency: 373, lat: 11.65, lon: 119.90, magVarDeg: 0, rangeNm: 25,
    airport: "PH-QUINALUBAN", source: "User-provided VATSIM Radar screenshot; 373 kHz / PIN; approximate offshore coordinates; CAAP AIP verification pending", available: true,
  },
  {
    id: "PH-NDB-MP", ident: "MP", name: "Malampaya NDB", kind: "NDB",
    frequency: 315, lat: 10.95, lon: 116.10, magVarDeg: 0, rangeNm: 25,
    airport: "PH-MALAMPAYA", source: "User-provided VATSIM Radar screenshot; 315 kHz / MP; approximate offshore coordinates; CAAP AIP verification pending", available: true,
  },

  // ─── Legacy NDB records (disabled pending current-AIP confirmation) ─
  // The current CAAS ENR 4.1 (03 Sep 2026) does not list these NDBs.
  // They are retained for audit traceability but must not tune as active aids.
  {
    id: "LEGACY-NDB-BM", ident: "BM", name: "Batam/Hang Nadim NDB (legacy listing)",
    kind: "NDB", frequency: 370, lat: dms(1, 7, 16.54), lon: dms(104, 6, 38.07),
    magVarDeg: 0.38, rangeNm: 25, airport: "WIDD",
    source: "Older CAAS AIP ENR 4.1 listing; current operational status not confirmed", available: false,
  },
  {
    id: "LEGACY-NDB-JR", ident: "JR", name: "Johor Bahru NDB (legacy listing)",
    kind: "NDB", frequency: 245, lat: dms(1, 40, 30), lon: dms(103, 39, 36),
    magVarDeg: 0.38, rangeNm: 25, airport: "WMKJ",
    source: "Older CAAS AIP ENR 4.1 listing; current operational status not confirmed", available: false,
  },
  {
    id: "LEGACY-NDB-JB", ident: "JB", name: "Jaybee NDB (legacy listing)",
    kind: "NDB", frequency: 400, lat: dms(1, 30, 0), lon: dms(103, 42, 42),
    magVarDeg: 0.38, rangeNm: 25, airport: "WSSS",
    source: "Older CAAS AIP ENR 4.1 listing; current operational status not confirmed", available: false,
  },
];

/** Find by frequency (MHz for VOR/ILS, kHz for NDB) */
export function findChangiNavaid(freq: number, kind?: "VOR" | "ILS" | "NDB"): Navaid | undefined {
  const tol = kind === "NDB" ? 0.6 : 0.01;
  return CHANGI_NAVAIDS.find((n) => {
    if (!n.available) return false;
    if (Math.abs(n.frequency - freq) > tol) return false;
    if (!kind) return true;
    if (kind === "VOR") return n.kind === "VOR" || n.kind === "VOR_DME";
    if (kind === "ILS") return n.kind === "ILS" || n.kind === "LOC";
    return n.kind === "NDB";
  });
}

/** All Changi ILS stations */
export function changiIlsList() {
  return CHANGI_NAVAIDS.filter((n) => n.available && n.kind === "ILS");
}

/** All Changi VORs */
export function changiVorList() {
  return CHANGI_NAVAIDS.filter((n) => n.available && (n.kind === "VOR" || n.kind === "VOR_DME"));
}

export default CHANGI_NAVAIDS;

/** Great-circle distance (NM) */
export function distNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3440.065;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** True bearing from point A to point B (degrees 0–360) */
export function bearingTrue(fromLat: number, fromLon: number, toLat: number, toLon: number): number {
  const φ1 = (fromLat * Math.PI) / 180;
  const φ2 = (toLat * Math.PI) / 180;
  const Δλ = ((toLon - fromLon) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

