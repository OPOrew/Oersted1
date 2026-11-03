import { create } from "zustand";
import { NAV_START } from "@/lib/sim/radionav";

/**
 * Training weather scene for the weather radar. Same frame as the radio-nav scene (nm, x = east, y = north).
 * The main instrument panel publishes the dead-reckoned airplane position / heading here (about twice a second).
 */
export const useWxrNav = create<{ x: number; y: number; hdg: number }>(() => ({ x: NAV_START.x, y: NAV_START.y, hdg: NAV_START.hdg }));

export interface WxCell {
  x: number; y: number;
  /** radius (nm) of the outer, light-rain contour */
  r: number;
  /** elongation (1 = round) and orientation (deg true) of the major axis */
  asp: number; ang: number;
}

/** Thunderstorm cells: three nested contours (levels 1 / 2 / 3 = green / yellow / red) at 100 / 62 / 30 percent of the radius. */
export const WX_CELLS: WxCell[] = [
  { x: 12, y: 6, r: 7, asp: 1.6, ang: 40 },
  { x: 22, y: -10, r: 9, asp: 1.3, ang: 120 },
  { x: 5, y: -14, r: 5, asp: 1.2, ang: 80 },
  { x: 35, y: 8, r: 12, asp: 2.0, ang: 60 },
  { x: -4, y: 24, r: 8, asp: 1.5, ang: 20 },
  { x: -30, y: -6, r: 6, asp: 1.2, ang: 0 },
  { x: 62, y: -1, r: 8, asp: 1.4, ang: 90 },
  { x: 90, y: 30, r: 15, asp: 1.8, ang: 70 },
];

/** Coast line and cities for the MAP mode (the same nm frame). */
export const WX_COAST: [number, number][] = [[-40, -26], [-20, -22], [-6, -17], [4, -11], [14, -12], [26, -17], [40, -24], [60, -26], [90, -34]];
export const WX_CITIES: [number, number][] = [[18, -16], [40, -24], [-6, -17]];

/** How much of a storm the tilted beam shows: 1 = full depth, 0 = beam above / below the storm. Cells are modelled as 3,000 to 38,000 ft. */
export function beamFactor(rangeNm: number, tiltDeg: number, altFt: number) {
  const beam = altFt + rangeNm * 6076 * Math.tan((tiltDeg * Math.PI) / 180);
  return Math.max(0, 1 - Math.abs(beam - 20500) / 21000);
}

/** Live precipitation cells derived from real weather (RainViewer sampling). */
export const useLiveWx = create<{ cells: WxCell[]; intensity: number; inWeather: boolean; thunderstorm: boolean }>(() => ({
  cells: [],
  intensity: 0,
  inWeather: false,
  thunderstorm: false,
}));

/** Convert a geographic offset (nm east/north) into the radar's local frame and store cells. */
export function setLiveWeather(cells: WxCell[], intensity: number, thunderstorm = false) {
  useLiveWx.setState({ cells, intensity, inWeather: intensity > 0.15, thunderstorm: thunderstorm || intensity > 0.75 });
}

/** Rough intensity 0-1 from a simple color sample (used when a tile is fetched). */
export function intensityFromRgb(r: number, g: number, b: number): number {
  // RainViewer Universal Blue: higher intensity → more red/yellow, less blue
  const warmth = (r + g * 0.6) / (b + 40);
  return Math.max(0, Math.min(1, (warmth - 0.4) * 1.8));
}

/** Turbulence level 0-1 derived from precipitation intensity (realistic scaling). */
export function turbulenceFromIntensity(intensity: number): number {
  if (intensity < 0.15) return 0;
  if (intensity < 0.4) return 0.25; // light
  if (intensity < 0.7) return 0.55; // moderate
  return 0.85; // severe
}
