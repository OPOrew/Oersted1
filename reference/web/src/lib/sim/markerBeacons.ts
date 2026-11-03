/**
 * ILS marker beacons (ATA 34 / 23): OUTER (blue, 400 Hz dashes), MIDDLE (amber, 1300 Hz alternating dot-dash), INNER / AIRWAYS (white, 3000 Hz dots).
 * Trainer geometry only — the positions and coverage below are synthetic training values for the simulated ILS scenes, NOT chart data.
 * The MIP marker lamps (OUTER / MIDDLE / AIRWAYS) and the tone driver read the same `markers` state, so lamps, tone and the side-view display agree.
 */
import { sceneGeom, type NavSceneId } from "./radionav.ts";

export type MarkerId = "om" | "mm" | "im";
export interface MarkerSpec { id: MarkerId; name: string; lamp: "OUTER" | "MIDDLE" | "AIRWAYS"; color: string; distNm: number; halfNm: number; hz: number; morse: string }

/** Typical ILS siting: OM ~4-7 NM, MM ~3,500 ft, IM ~1,000 ft before the threshold. Coverage half-length is along-track at low height. */
export const MARKERS: readonly MarkerSpec[] = [
  { id: "om", name: "Outer marker", lamp: "OUTER", color: "#4a8dff", distNm: 4.6, halfNm: 0.30, hz: 400, morse: "dashes · 2 per second" },
  { id: "mm", name: "Middle marker", lamp: "MIDDLE", color: "#ffb02e", distNm: 0.58, halfNm: 0.13, hz: 1300, morse: "alternating dot-dash" },
  { id: "im", name: "Inner marker", lamp: "AIRWAYS", color: "#f2f4f6", distNm: 0.16, halfNm: 0.07, hz: 3000, morse: "dots · 6 per second" },
];
export const NO_MARKERS = { om: false, mm: false, im: false } as const;
export type MarkerState = { om: boolean; mm: boolean; im: boolean };

/** Receiver coverage: the cone widens with height, and the HIGH sensitivity position widens it further. Above 3,500 ft AGL nothing is received. */
export function markerCoverage(sceneId: NavSceneId | undefined, pos: { x: number; y: number }, altFt: number, high: boolean): MarkerState {
  const g = sceneGeom(sceneId);
  const c = (g.crs * Math.PI) / 180;
  const along = pos.x * Math.sin(c) + pos.y * Math.cos(c); // +ve past the threshold
  const cross = pos.x * Math.cos(c) - pos.y * Math.sin(c);
  const dist = -along; // NM before the threshold
  const agl = altFt - g.fieldElevFt;
  if (agl > 3500 || agl < -50) return { ...NO_MARKERS };
  const sens = high ? 1.5 : 1;
  const widen = 1 + Math.max(0, agl) / 1800;
  const inCone = (m: MarkerSpec) => Math.abs(dist - m.distNm) <= m.halfNm * widen * sens && Math.abs(cross) <= 0.45 * widen * sens;
  const [om, mm, im] = MARKERS.map(inCone);
  return { om, mm, im };
}

/** Is the keyed tone / lamp ON at time t (seconds)? Standard keying: OM 2 dashes/s, MM alternating dot-dash (~95/min), IM 6 dots/s. */
export function markerKeyed(id: MarkerId, t: number): boolean {
  if (id === "om") return t % 0.5 < 0.36;
  if (id === "im") return t % (1 / 6) < 0.07;
  const p = t % 0.63; // MM: dot, gap, dash, gap
  return p < 0.1 || (p >= 0.2 && p < 0.5);
}

export function activeMarker(s: MarkerState): MarkerId | null {
  return s.im ? "im" : s.mm ? "mm" : s.om ? "om" : null;
}
export const markerSpec = (id: MarkerId): MarkerSpec => MARKERS.find((m) => m.id === id)!;
