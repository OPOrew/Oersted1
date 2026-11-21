package com.oersted.trainer.sim

import com.oersted.trainer.sim.FlightPhases.Phase

/**
 * Port of the logic of AutopilotSimulator.tsx's "Fly the plan" button: one tap loads the active plan into the controls (runway heading, PLAN NAV, flaps,
 * HDG SEL bug), turns AUTO PHASES on and starts TAKEOFF; climb, cruise, descent, approach and landing then follow by themselves.
 */
object FlyThePlanRules {
    const val NO_PLAN_REASON = "Activate a flight plan first"
    const val TOOLTIP = "Load the active plan, turn AUTO PHASES on and start TAKEOFF; the aircraft then flies the plan (heading from the waypoints, climb and descent schedule, thrust)"

    /** Reason the button is disabled ("" when it can be pressed). */
    fun disabledReason(hasPlan: Boolean): String = if (!hasPlan) NO_PLAN_REASON else ""

    /** On the ground and not already READY the plan is (re)loaded into the controls first; if that fails nothing else happens. */
    fun needsLoad(hasPlan: Boolean, wow: Boolean, phase: Phase): Boolean = hasPlan && wow && phase != Phase.READY
}
