package com.oersted.trainer.sim

import com.oersted.trainer.sim.FlightPhases.Phase
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class NavigationPhaseTextTest {
    private val t = NavigationPhaseText

    private fun plan(waypoints: List<ActiveFlightWaypoint> = emptyList(), arrival: ActiveArrival? = null, callsign: String = "PAL123") = ActiveFlightPlan(
        activatedAt = "t", callsign = callsign, departure = "RPLL", destination = "WSSS", alternate = "", departureRunway = "06",
        arrivalRunway = "02L", cruiseAltitudeFt = 35000.0, cruiseSpeedKt = 430.0, sid = "", enrouteRoute = "", star = "",
        approach = "", procedureStatus = "unverified", waypoints = waypoints, arrival = arrival,
    )

    @Test fun headingPadsToThreeDigitsAndWraps() {
        assertEquals("007", t.pad3(7.0))
        assertEquals("359", t.pad3(-1.0))
        assertEquals("000", t.pad3(360.0))
        assertEquals("090", t.pad3(89.5))   // Math.round(89.5) = 90
    }

    @Test fun altitudesGroupThousands() {
        assertEquals("35,000", t.fmtFt(35000.0))
        assertEquals("999", t.fmtFt(999.4))
    }

    @Test fun gearTextFromTheThreePositions() {
        assertEquals("DOWN & LOCKED", t.gearText(1.0, 1.0, 1.0))
        assertEquals("UP & LOCKED", t.gearText(0.0, 0.0, 0.0))
        assertEquals("IN TRANSIT", t.gearText(1.0, 0.5, 1.0))
        assertEquals("UP & LOCKED", t.gearText(0.05, 0.0, 0.0))   // average 0.0167 < 0.02
    }

    @Test fun liveConfigLine() {
        assertEquals("DOWN & LOCKED · FLAPS 5 · SPEEDBRAKE ARMED", t.liveConfig(1.0, 1.0, 1.0, 5.0, "ARMED"))
        assertEquals("UP & LOCKED · FLAPS 0 · SPEEDBRAKE UP (DEPLOYED)", t.liveConfig(0.0, 0.0, 0.0, 0.0, "UP"))
        assertEquals("IN TRANSIT · FLAPS 12.5 · SPEEDBRAKE -", t.liveConfig(0.5, 0.5, 0.5, 12.5, ""))
    }

    @Test fun eteNeedsGroundSpeedAndDividesByTimeCompression() {
        assertNull(t.etaMinutes(500.0, 30.0, 1.0))             // not above 30 kt
        assertNull(t.etaMinutes(null, 400.0, 1.0))
        assertEquals(75.0, t.etaMinutes(500.0, 400.0, 1.0)!!, 1e-9)   // 500 / 400 h = 75 min
        assertEquals(5.0, t.etaMinutes(500.0, 400.0, 15.0)!!, 1e-9)
        assertEquals(75.0, t.etaMinutes(500.0, 400.0, 0.2)!!, 1e-9)   // compression below 1 counts as 1
    }

    @Test fun destinationCell() {
        assertEquals("-", t.toDestination(null, null))
        assertEquals("500 NM", t.toDestination(500.4, null))
        assertEquals("500 NM · ETE 1h15", t.toDestination(500.0, 75.0))
        assertEquals("120 NM · ETE 0h08", t.toDestination(120.0, 8.0))
        assertEquals("501 NM", t.toDestination(500.5, null))     // toFixed(0) rounds .5 up
    }

    @Test fun nextWaypointCell() {
        assertEquals("-", t.nextWaypoint(null, 1.0, 1.0))
        assertEquals("-", t.nextWaypoint("", 1.0, 1.0))
        assertEquals("WP1 · 12.3 NM · 045°T", t.nextWaypoint("WP1", 12.34, 45.0))
        assertEquals("WP1 · - NM · ", t.nextWaypoint("WP1", null, null))
    }

    @Test fun plannedCruiseCell() {
        assertEquals("-", t.plannedCruise(null, null))
        assertEquals("35,000 ft", t.plannedCruise(plan(), null))
        assertEquals("35,000 ft · max FL350", t.plannedCruise(plan(), 350))
    }

    @Test fun altitudeTargetByPhase() {
        assertEquals("35,000 ft", t.altitudeTarget(Phase.CLIMB, plan()))
        assertEquals("35,000 ft", t.altitudeTarget(Phase.CRUISE, plan()))
        assertEquals("not commanded", t.altitudeTarget(Phase.READY, plan()))
        assertEquals("not commanded", t.altitudeTarget(Phase.TAKEOFF, null))
        assertEquals("-", t.altitudeTarget(Phase.CLIMB, null))
        // descent: no arrival fix -> 3,000; with a fix, that waypoint's altitude; zero altitude falls back to 3,000 like JS ||
        assertEquals("3,000 ft", t.altitudeTarget(Phase.DESCENT, plan()))
        val arrival = ActiveArrival(airport = "WSSS", runway = "02L", sceneId = "s", firstFixName = "F1", lastFixName = "F2", ilsFrequencyMHz = 110.9, courseMag = 23.0)
        val wp = ActiveFlightWaypoint("1", "F1", 0.0, 0.0, 6000.0, 250.0)
        assertEquals("6,000 ft", t.altitudeTarget(Phase.APPROACH, plan(listOf(wp), arrival)))
        assertEquals("3,000 ft", t.altitudeTarget(Phase.APPROACH, plan(listOf(wp.copy(altitudeFt = 0.0)), arrival)))
        assertEquals("3,000 ft", t.altitudeTarget(Phase.DESCENT, plan(emptyList(), arrival)))
    }

    @Test fun headerLine() {
        assertEquals("no active plan", t.planHeader(null))
        assertEquals("PAL123 · RPLL → WSSS · 35,000 ft", t.planHeader(plan()))
        assertEquals("RPLL → WSSS · 35,000 ft", t.planHeader(plan(callsign = "")))
    }

    @Test fun buttonProgressColours() {
        assertEquals("here", t.buttonProgress(Phase.CLIMB, Phase.CLIMB))
        assertEquals("done", t.buttonProgress(Phase.TAKEOFF, Phase.CLIMB))
        assertEquals("todo", t.buttonProgress(Phase.CRUISE, Phase.CLIMB))
        assertEquals("here", t.buttonProgress(Phase.LAND, Phase.ROLLOUT))
        assertEquals("here", t.buttonProgress(Phase.LAND, Phase.COMPLETE))
        assertEquals("done", t.buttonProgress(Phase.APPROACH, Phase.ROLLOUT))
        assertEquals("todo", t.buttonProgress(Phase.TAKEOFF, Phase.NO_PLAN))
    }
}
