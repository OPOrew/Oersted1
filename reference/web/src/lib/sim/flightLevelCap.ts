import { useEffect, useState } from "react";

/**
 * Simulation-only maximum flight level. The 737-200 has no flight-level window; this is a trainer setting.
 * The cap is a CEILING on the active flight plan: the planned cruise altitude and every waypoint altitude above it are held at the cap
 * (see applyFlightLevelCap, applied where the active plan is read). Empty = the flight plan's own altitudes are used.
 */
export const FL_CAP_KEY = "oersted-flight-level-cap-v1";
export const FL_CAP_EVENT = "oersted-flight-level-cap-updated";
export const FL_CAP_MIN = 10;
export const FL_CAP_MAX = 410;

/** Cap in feet, or null when none is set. */
export function readFlightLevelCapFt(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(FL_CAP_KEY);
    if (!raw) return null;
    const fl = Number(raw);
    return Number.isFinite(fl) && fl >= FL_CAP_MIN && fl <= FL_CAP_MAX ? Math.round(fl) * 100 : null;
  } catch { return null; }
}

/** Set the cap as a flight level number (e.g. 350 = FL350). null / empty clears it. Returns the stored FL or null. */
export function setFlightLevelCap(fl: number | null): number | null {
  if (typeof window === "undefined") return null;
  const ok = fl != null && Number.isFinite(fl) && fl >= FL_CAP_MIN && fl <= FL_CAP_MAX ? Math.round(fl) : null;
  try {
    if (ok == null) window.localStorage.removeItem(FL_CAP_KEY); else window.localStorage.setItem(FL_CAP_KEY, String(ok));
  } catch { /* storage unavailable: the cap just does not persist */ }
  window.dispatchEvent(new CustomEvent(FL_CAP_EVENT, { detail: ok }));
  return ok;
}

/** Return the plan with its cruise altitude and every waypoint altitude held at or below the cap (altitude 0 = "no restriction" stays 0). */
export function applyFlightLevelCap<T extends { cruiseAltitudeFt: number; waypoints: { altitudeFt: number }[] }>(plan: T): T {
  const cap = readFlightLevelCapFt();
  if (cap == null) return plan;
  const needs = plan.cruiseAltitudeFt > cap || plan.waypoints.some((w) => w.altitudeFt > cap);
  if (!needs) return plan;
  return {
    ...plan,
    cruiseAltitudeFt: Math.min(plan.cruiseAltitudeFt, cap),
    waypoints: plan.waypoints.map((w) => (w.altitudeFt > cap ? { ...w, altitudeFt: cap } : w)),
  };
}

/** Flight level number (e.g. 350) or null, kept in step with the stored cap. */
export function useFlightLevelCap(): number | null {
  const [fl, setFl] = useState<number | null>(null);
  useEffect(() => {
    const read = () => { const ft = readFlightLevelCapFt(); setFl(ft == null ? null : ft / 100); };
    read();
    window.addEventListener(FL_CAP_EVENT, read);
    window.addEventListener("storage", read);
    return () => { window.removeEventListener(FL_CAP_EVENT, read); window.removeEventListener("storage", read); };
  }, []);
  return fl;
}
