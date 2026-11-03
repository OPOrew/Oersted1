import { useEffect, useState } from "react";
import { FL_CAP_EVENT, applyFlightLevelCap } from "./flightLevelCap";

/** Shared browser-side active flight plan bridge for the planner, pedestal display and the PLAN NAV trainer guidance.
 * This is a trainer feed, not a certified FMC. PLAN NAV only steers while the modeled autopilot is engaged (see planGuidance.ts).
 */
export const ACTIVE_FLIGHT_PLAN_KEY = "oersted-active-flight-plan-v1";
export const ACTIVE_FLIGHT_PLAN_EVENT = "oersted-active-flight-plan-updated";

export type ActiveFlightWaypoint = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  altitudeFt: number;
  speedKt: number;
};

/** Vectored (non-RNAV) arrival to an ILS: VCT-A/B/C stand in for ATC vectors; the ILS takes over from the last fix. */
export type ActiveArrival = {
  kind: "vector-ils";
  airport: string;
  runway: string;
  /** ILS scene id (see radionav.ts) */
  sceneId: string;
  firstFixName: string;
  lastFixName: string;
  ilsFrequencyMHz: number;
  courseMag: number;
};

/** ILS / localizer chosen in the planner as the approach guidance source. It is NOT a route endpoint: the destination airport still ends the route. */
export type ActiveIls = {
  /** navaid catalog id, e.g. "WSSS-ILS-02L" */
  id: string;
  ident: string;
  name: string;
  airport: string;
  runway: string;
  frequencyMHz: number;
  courseMag: number;
  /** localizer antenna position */
  latitude: number;
  longitude: number;
};

export type ActiveFlightPlan = {
  version: 1;
  activatedAt: string;
  callsign: string;
  departure: string;
  destination: string;
  alternate: string;
  departureRunway: string;
  arrivalRunway: string;
  cruiseAltitudeFt: number;
  cruiseSpeedKt: number;
  sid: string;
  enrouteRoute: string;
  star: string;
  approach: string;
  procedureStatus: "unverified" | "chart-checked";
  waypoints: ActiveFlightWaypoint[];
  /** present for a vectored ILS arrival */
  arrival?: ActiveArrival;
  /** En-route position-time multiplier (1 = real time). Defaults to 15 when absent. Speed and altitude are unchanged. */
  timeCompression?: number;
  /** ILS / localizer selected for the approach (tuned by the navigation panel as the last radio target) */
  ils?: ActiveIls;
};

export function publishActiveFlightPlan(plan: Omit<ActiveFlightPlan, "version" | "activatedAt">): ActiveFlightPlan {
  const active: ActiveFlightPlan = {
    ...plan,
    version: 1,
    activatedAt: new Date().toISOString(),
    waypoints: Array.isArray(plan.waypoints) ? plan.waypoints : [],
  };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(ACTIVE_FLIGHT_PLAN_KEY, JSON.stringify(active));
    window.dispatchEvent(new CustomEvent(ACTIVE_FLIGHT_PLAN_EVENT, { detail: active }));
  }
  return active;
}

export function readActiveFlightPlan(): ActiveFlightPlan | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ACTIVE_FLIGHT_PLAN_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as ActiveFlightPlan;
    if (value?.version !== 1 || !value.departure || !value.destination) return null;
    // simulation-only maximum flight level: cruise and waypoint altitudes above it are held at it (the stored plan itself is never changed)
    return applyFlightLevelCap({ ...value, waypoints: Array.isArray(value.waypoints) ? value.waypoints : [] });
  } catch {
    return null;
  }
}


/** React subscription to the shared active plan. Safe during SSR and responsive to
 * same-tab plan activation plus cross-tab localStorage updates.
 */
export function useActiveFlightPlan(): ActiveFlightPlan | null {
  const [plan, setPlan] = useState<ActiveFlightPlan | null>(() => readActiveFlightPlan());

  useEffect(() => {
    const refresh = () => setPlan(readActiveFlightPlan());
    refresh();
    window.addEventListener(ACTIVE_FLIGHT_PLAN_EVENT, refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener(FL_CAP_EVENT, refresh);
    return () => {
      window.removeEventListener(FL_CAP_EVENT, refresh);
      window.removeEventListener(ACTIVE_FLIGHT_PLAN_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return plan;
}
