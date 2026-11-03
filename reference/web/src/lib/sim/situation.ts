import { create } from "zustand";
import { angDiff, LOC_CAPTURE_DEG, VOR_CAPTURE_DEG, type GsPhase, type LatSub } from "@/lib/sim/autoflight";
import { RWY, type NavData } from "@/lib/sim/radionav";

/**
 * Situation snapshot published by the attitude / autopilot model in MainInstrumentPanel (~5 Hz) so the training views can show
 * where the airplane is relative to the course and glide slope, and explain what the autopilot is doing and why.
 */
export interface Situation {
  /** nm east / north of the RPLL RWY 06 threshold */
  x: number;
  y: number;
  hdg: number;
  altFt: number;
  tasKt: number;
  flying: boolean;
  latSub: LatSub;
  gsPhase: GsPhase;
  gsCapT: number;
  /** recent track, for the trail */
  trail: { x: number; y: number }[];
}

interface SituationStore extends Situation {
  publish: (p: Omit<Situation, "trail">) => void;
  clearTrail: () => void;
}

const TRAIL_MAX = 600;

export const useSituation = create<SituationStore>((set, get) => ({
  x: -12, y: -0.8, hdg: 90, altFt: 0, tasKt: 0, flying: false, latSub: "OFF", gsPhase: "OFF", gsCapT: 0, trail: [],
  publish: (p) => {
    const trail = get().trail;
    const last = trail[trail.length - 1];
    const moved = !last || Math.hypot(p.x - last.x, p.y - last.y) > 0.03;
    set({ ...p, trail: moved ? [...trail.slice(-(TRAIL_MAX - 1)), { x: p.x, y: p.y }] : trail });
  },
  clearTrail: () => set({ trail: [] }),
}));

/** Throttled publisher used from the instrument-panel animation loop. */
let lastPublishMs = 0;
export function publishSituation(p: Omit<Situation, "trail">) {
  const now = performance.now();
  if (now - lastPublishMs < 100) return; // ~10 Hz for smoother display
  lastPublishMs = now;
  useSituation.getState().publish(p);
}

/* ------------------------------------------------------------------ */
/* Plain-language explanation of what the autopilot is doing and why.  */
/* ------------------------------------------------------------------ */

export type Tone = "info" | "armed" | "ok" | "warn";
export interface Line { tone: Tone; text: string }

export interface ExplainIn {
  sit: Situation;
  navOn: boolean;
  tuned: "VOR" | "ILS";
  nav: NavData;
  navValid: boolean;
  selCrs: number;
  selHdg: number;
  apNav: number; // 0 MAN, 1 VOR LOC, 2 AUTO APP, 3 MAN G/S
  apHdgSw: number; // 0 off, 1 hold, 2 sel
  apAil: boolean;
  apElev: boolean;
  apPitch: number; // 2 = ALT HOLD
  /** last disconnect / release reason from the autopilot model ("" = none) */
  apWhy?: string;
  /** VOR deviation for the selected course (deg, + = fly right) and TO flag */
  vorDev: number;
}

const f1 = (n: number) => Math.abs(n).toFixed(1);
const side = (dev: number) => (dev > 0 ? "left of" : "right of");
const turn = (dev: number) => (dev > 0 ? "right" : "left");
const dots = (deg: number, perDot: number) => (Math.abs(deg) / perDot).toFixed(1);
const hd = (n: number) => String(Math.round(((n % 360) + 360) % 360)).padStart(3, "0");

export function explain(i: ExplainIn): { lateral: Line[]; vertical: Line[] } {
  const lat: Line[] = [];
  const vert: Line[] = [];
  const { sit } = i;
  const engaged = i.apAil || i.apElev;

  // Consistent airborne check: trust sit.flying, but also accept altitude > 200 ft as airborne
  const airborne = sit.flying || (sit.altFt != null && sit.altFt > 200);
  if (!airborne) {
    return { lateral: lat, vertical: vert };
  }

  if (!engaged && i.apWhy) lat.push({ tone: "warn", text: `Autopilot is off because: ${i.apWhy.replace(/^A\/P disconnect: /, "")}. Fix the cause, then engage AIL / ELEV again.` });

  const radioSel = i.apNav === 1 || i.apNav === 2;
  const isLoc = i.tuned === "ILS";

  /* ── where am I relative to the beam? (always useful, even with the autopilot off) ── */
  if (i.navOn && i.navValid) {
    if (isLoc) {
      lat.push({ tone: "info", text: `You are ${f1(i.nav.locDev)}° (${dots(i.nav.locDev, 0.5)} dots) ${side(i.nav.locDev)} the localizer. The CDI bar sits to the ${turn(i.nav.locDev)}: it points to where the beam is.` });
      if (Math.abs(angDiff(i.selCrs, RWY.crs)) > 5) lat.push({ tone: "warn", text: `Course selector reads ${hd(i.selCrs)}°, but RPLL RWY 06 inbound course is ${hd(RWY.crs)}°. Set the course to ${hd(RWY.crs)}° so the autopilot intercepts the right way.` });
    } else {
      const to = Math.abs(angDiff(i.nav.radial, i.selCrs)) >= 90;
      lat.push({ tone: "info", text: `You are on the ${hd(i.nav.radial)}° radial, ${f1(i.nav.vorDist)} nm from the VOR. With course ${hd(i.selCrs)}° selected the bar is ${f1(i.vorDev)}° to the ${i.vorDev > 0 ? "right" : "left"} (${to ? "TO" : "FROM"} flag).` });
    }
  } else if (radioSel || i.navOn) {
    lat.push({ tone: "warn", text: !i.navOn ? "NAV receiver is off, so there is no beam to fly. Turn it on in Navigation." : "No valid signal on the tuned frequency, or a nav or compass source has failed. The autopilot cannot capture a beam it cannot see." });
  }

  /* ── lateral channel ── */
  if (!engaged) {
    lat.push({ tone: "info", text: "Autopilot is OFF. You are flying. Set the course and heading, choose NAV mode, then engage AIL (roll) and ELEV (pitch)." });
  } else if (!i.apAil) {
    lat.push({ tone: "info", text: "AIL (roll) is not engaged, so the autopilot is not steering. You are controlling roll." });
  } else if (radioSel && i.navOn && i.navValid) {
    const kind = isLoc ? "localizer" : "VOR";
    const dev = isLoc ? i.nav.locDev : i.vorDev;
    const capDeg = isLoc ? LOC_CAPTURE_DEG : VOR_CAPTURE_DEG;
    const crsErr = angDiff(i.selCrs, sit.hdg);
    switch (sit.latSub) {
      case "INTERCEPT":
        lat.push({ tone: "armed", text: `INTERCEPT (VOR/LOC amber): the ${kind} is ${f1(dev)}° away, so the autopilot points you ${Math.min(45, Math.abs(dev) * (isLoc ? 10 : 4.5)).toFixed(0)}° toward it (max 45°) and banks up to 25°. Heading ${hd(sit.hdg)}°, course ${hd(i.selCrs)}°. Capture starts inside ${capDeg}°.` });
        break;
      case "CAPTURE":
        lat.push({ tone: "ok", text: `CAPTURE (VOR/LOC green): the bar is inside ${capDeg}°, so the autopilot is turning you onto the course. Bank is still allowed to 25° until it is under 6° and you are within 15° of the course (off by ${f1(crsErr)}° now).` });
        break;
      case "ON_COURSE":
        lat.push({ tone: "ok", text: `ON COURSE: tracking the ${kind}. Bank is now limited to 8° to keep corrections small and smooth. Small heading changes are normal.` });
        break;
      case "OVER_STATION":
        lat.push({ tone: "info", text: "OVER THE STATION (zone of confusion): the VOR signal is unreliable overhead, so the autopilot holds the last heading until the bar is usable again." });
        break;
      default:
        lat.push({ tone: "info", text: "Lateral radio mode is selected but not active yet. Check the NAV switch and AIL engage." });
    }
  } else if (i.apHdgSw === 2) {
    const e = angDiff(i.selHdg, sit.hdg);
    lat.push({ tone: Math.abs(e) < 2 ? "ok" : "info", text: Math.abs(e) < 2 ? `HDG SEL: holding heading ${hd(i.selHdg)}°.` : `HDG SEL: turning ${turn(e)} to the heading bug at ${hd(i.selHdg)}°. Heading is ${hd(sit.hdg)}° (${f1(e)}° to go). Bank is limited to 25°.` });
  } else {
    lat.push({ tone: "info", text: "Roll is engaged without a nav mode: the autopilot holds the heading or bank you had when you engaged it. Choose VOR LOC or AUTO APP to fly a beam, or HDG SEL to fly the heading bug." });
  }

  /* ── vertical channel ── */
  const gsWanted = i.apNav === 2 || i.apNav === 3;
  if (i.navOn && isLoc && i.nav.locValid && !i.nav.gsValid && gsWanted) {
    vert.push({ tone: "warn", text: `No glide-slope signal yet: ${f1(i.nav.thrDist)} nm from the threshold. In this trainer the glide slope is valid inside 10 nm, in front of the runway, and within 8° of the localizer.` });
  } else if (i.navOn && isLoc && i.nav.gsValid) {
    vert.push({ tone: "info", text: `You are ${f1(i.nav.gsErr)}° ${i.nav.gsErr > 0 ? "above" : "below"} the 3° glide slope (${Math.round(sit.altFt)} ft, ${f1(i.nav.thrDist)} nm out).` });
  }
  if (sit.gsPhase === "ARMED") vert.push({ tone: "armed", text: "G/S ARMED (amber): waiting until the localizer is captured and you reach the beam, then it captures by itself. If you are below the beam, hold altitude and let it come to you." });
  else if (sit.gsPhase === "CAPTURE") vert.push({ tone: "ok", text: `G/S CAPTURE (green): descending at about 700 ft/min for 10 s (${Math.min(10, sit.gsCapT).toFixed(0)}/10 s) before the beam is fully tracked.` });
  else if (sit.gsPhase === "TRACK") vert.push({ tone: "ok", text: "G/S TRACK: following the beam. The autopilot eases the signal in, then reduces its gain as the beam strengthens near the runway." });
  else if (i.apElev && i.apPitch === 2) vert.push({ tone: "ok", text: `ALT HOLD: holding about ${Math.round(sit.altFt)} ft.` });
  else if (i.apElev) vert.push({ tone: "info", text: "ELEV engaged: the autopilot holds the pitch attitude it had at engagement. Use ALT HOLD to hold altitude, or AUTO APP / MAN G/S to fly the glide slope." });
  else if (engaged) vert.push({ tone: "info", text: "ELEV (pitch) is not engaged. You are controlling pitch." });

  return { lateral: lat, vertical: vert };
}
