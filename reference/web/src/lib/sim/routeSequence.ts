/**
 * Sequential radio-navigation targets for the Manila → Changi trainer.
 * When the aircraft gets within SWITCH_DISTANCE_NM of the current target,
 * the next frequency is automatically written into the pedestal NAV receiver.
 *
 * This matches classic 737-200 practice: the crew (or the trainer) tunes
 * the next VOR / ADF / ILS as the aircraft progresses along the route.
 */
import type { ActiveFlightPlan } from "./activeFlightPlan";
import { CHANGI_NAVAIDS, type Navaid } from "./navaids-changi";

export type SequenceItem = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Frequency to tune when this item becomes active (MHz for VOR/ILS, kHz for NDB) */
  frequency: number;
  kind: "VOR" | "ILS" | "NDB";
  /** Course / OBS to set when tuning this station (magnetic) */
  courseMag?: number;
  /** Optional note shown to the student */
  note?: string;
};

const SWITCH_DISTANCE_NM = 4.0;
/** An ILS is tuned once the aircraft is this close to its localizer, even if the previous station was never overflown (vectored arrivals). */
const ILS_TUNE_DISTANCE_NM = 30.0;

/**
 * Ordered, chart-backed radio targets for the RPLL → WSSS training route.
 *
 * IMPORTANT: this is not an airway/ATS-route database. The supplied Philippine
 * en-route chart does not cover the full Manila–Singapore corridor, so no
 * invented intermediate VOR/NDBs are inserted. The long MIA→VTK leg is shown
 * as a training route segment, not as a cleared or chart-validated airway.
 */
export const RPLL_WSSS_SEQUENCE: SequenceItem[] = [
  {
    id: "MIA",
    name: "Manila VOR/DME",
    lat: 14 + 30 / 60 + 28 / 3600,
    lon: 121 + 1 / 60 + 18.2 / 3600,
    frequency: 114.4,
    kind: "VOR",
    courseMag: 180,
    note: "RPLL VOR RWY 06/13/24 charts: MIA 114.4 MHz, DME channel 91X. Chart date 30 Nov 2023; verify current AIP before use.",
  },
  {
    id: "VTK",
    name: "Tekong DVOR/DME",
    lat: 1 + 24 / 60 + 55 / 3600,
    lon: 104 + 1 / 60 + 20 / 3600,
    frequency: 116.5,
    kind: "VOR",
    courseMag: 200,
    note: "CAAS AIP ENR 4.1, effective 03 Sep 2026: VTK 116.5 MHz / 112X. Intermediate route/airway between MIA and VTK is not validated here.",
  },
  {
    id: "ICW",
    name: "Changi ILS RWY 02L",
    lat: 1 + 23 / 60 + 7.03 / 3600,
    lon: 103 + 59 / 60 + 34.03 / 3600,
    frequency: 110.9,
    kind: "ILS",
    courseMag: 23,
    note: "CAAS AIP WSSS AD 2.19 / IAC-1: ICW localizer 110.9 MHz, RWY 02L. This target identifies the localizer; it does not encode the complete approach procedure.",
  },
];

export function findNextSequenceItem(
  currentLat: number,
  currentLon: number,
  currentIndex: number,
  sequence: SequenceItem[] = RPLL_WSSS_SEQUENCE,
): { next: SequenceItem | null; index: number; distanceNm: number } {
  if (currentIndex >= sequence.length) {
    return { next: null, index: currentIndex, distanceNm: 0 };
  }
  const target = sequence[currentIndex];
  const d = distanceNm(currentLat, currentLon, target.lat, target.lon);
  const following = sequence[currentIndex + 1];
  if (following) {
    const reachedTarget = d <= SWITCH_DISTANCE_NM;
    const nearIls = following.kind === "ILS" && distanceNm(currentLat, currentLon, following.lat, following.lon) <= ILS_TUNE_DISTANCE_NM;
    if (reachedTarget || nearIls) return { next: following, index: currentIndex + 1, distanceNm: d };
  }
  return { next: target, index: currentIndex, distanceNm: d };
}

/**
 * Radio-navigation sequence built from the ACTIVE flight plan (instead of the fixed RPLL -> WSSS list):
 * every plan waypoint that is a catalogued VOR / NDB / ILS (matched by catalog id, or by identifier AND position within 1 NM,
 * so synthetic fixes such as SID points or VCT-A never pick up a station by name), in route order,
 * followed by the plan's selected ILS as the final target. Waypoints without a radio aid (SID fixes, custom fixes) are not tuned.
 */
export function buildPlanSequence(plan: ActiveFlightPlan | null | undefined): SequenceItem[] {
  if (!plan) return [];
  const items: SequenceItem[] = [];
  const seen = new Set<string>();
  const toItem = (n: Navaid, note?: string): SequenceItem => ({
    id: n.id,
    name: n.name,
    lat: n.lat,
    lon: n.lon,
    frequency: n.frequency,
    kind: n.kind === "NDB" ? "NDB" : n.kind === "ILS" || n.kind === "LOC" ? "ILS" : "VOR",
    courseMag: n.courseMag,
    note: note ?? n.source,
  });
  for (const wp of plan.waypoints ?? []) {
    const aid = CHANGI_NAVAIDS.find((n) => n.available && n.kind !== "DME" && (n.id === wp.id
      || (n.ident === wp.name && distanceNm(wp.latitude, wp.longitude, n.lat, n.lon) <= 1)));
    if (!aid || seen.has(aid.id)) continue;
    seen.add(aid.id);
    items.push(toItem(aid));
  }
  const ils = plan.ils;
  if (ils && !seen.has(ils.id)) {
    const cat = CHANGI_NAVAIDS.find((n) => n.id === ils.id);
    items.push({
      id: ils.id,
      name: cat?.name ?? `${ils.airport} ILS RWY ${ils.runway}`,
      lat: ils.latitude,
      lon: ils.longitude,
      frequency: ils.frequencyMHz,
      kind: "ILS",
      courseMag: ils.courseMag,
      note: `${ils.ident} localizer ${ils.frequencyMHz.toFixed(2)} MHz, RWY ${ils.runway}, course ${String(Math.round(ils.courseMag)).padStart(3, "0")}° (selected in the Flight Plan).`,
    });
  } else if (ils) {
    // The ILS was also added as a waypoint: make sure it is the last target.
    const i = items.findIndex((it) => it.id === ils.id);
    if (i >= 0 && i < items.length - 1) items.push(...items.splice(i, 1));
  }
  return items;
}

function distanceNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3440.065;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export { SWITCH_DISTANCE_NM };
