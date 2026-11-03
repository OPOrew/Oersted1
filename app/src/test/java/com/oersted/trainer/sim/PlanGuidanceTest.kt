package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Hand-written checks for PlanGuidance, ActiveFlightPlanLogic (planGuidance.ts, activeFlightPlan.ts, flightLevelCap.ts). */
class PlanGuidanceTest {
    private fun wp(name: String, lat: Double, lon: Double, alt: Double) = GuidanceTarget(name, lat, lon, alt, 250.0)

    @Test fun wrapAnglesStayInRange() {
        assertEquals(10.0, PlanGuidance.wrap360(370.0), 1e-9)
        assertEquals(350.0, PlanGuidance.wrap360(-10.0), 1e-9)
        assertEquals(-10.0, PlanGuidance.wrap180(350.0), 1e-9)
        assertEquals(170.0, PlanGuidance.wrap180(170.0), 1e-9)
    }

    @Test fun distanceOneDegreeOfLatitudeIsSixtyNm() {
        assertEquals(60.0, PlanGuidance.distNm(0.0, 0.0, 1.0, 0.0), 0.05)
        assertEquals(0.0, PlanGuidance.distNm(5.0, 5.0, 5.0, 5.0), 1e-9)
    }

    @Test fun bearingDueNorthAndDueEast() {
        assertEquals(0.0, PlanGuidance.brgTrue(0.0, 0.0, 1.0, 0.0), 1e-9)
        assertEquals(90.0, PlanGuidance.brgTrue(0.0, 0.0, 0.0, 1.0), 1e-9)
    }

    @Test fun leadDistanceZeroForSmallTurnAndCapped() {
        assertEquals(0.0, PlanGuidance.leadDistanceNm(250.0, 3.0), 0.0)
        assertTrue(PlanGuidance.leadDistanceNm(400.0, 170.0) <= 8.0)
    }

    @Test fun lateralCommandFliesDirectWhenFarOffTrack() {
        // Far off track: fly direct to the next waypoint.
        assertEquals(77.0, PlanGuidance.lateralCommandTrue(90.0, 5.0, 77.0)!!, 1e-9)
        // On track: fly the leg track.
        assertEquals(90.0, PlanGuidance.lateralCommandTrue(90.0, 0.0, 77.0)!!, 1e-9)
        // Right of track by 1 NM: steer left by 12 deg.
        assertEquals(78.0, PlanGuidance.lateralCommandTrue(90.0, 1.0, 77.0)!!, 1e-9)
        // Missing track data: falls back to the bearing.
        assertTrue(PlanGuidance.lateralCommandTrue(null, null, null) == null)
    }

    @Test fun todDistanceFromCruiseToFix() {
        // 10,000 ft to descend at 1,500 fpm = 6.667 min at mean GS 250 kt => 27.78 NM + 10 NM.
        assertEquals(37.7778, PlanGuidance.todDistanceNm(35000.0, 25000.0, 250.0), 1e-3)
        // No descent needed: only the 10 NM margin.
        assertEquals(10.0, PlanGuidance.todDistanceNm(3000.0, 5000.0, 250.0), 1e-9)
    }

    @Test fun inactiveWhenNoTargetAtLeg() {
        val r = PlanGuidance.computeGuidance(
            GuidanceInput(GuidancePlan(20000.0, 250.0), emptyList(), 0, 0.0, 0.0, 5000.0, 200.0, null, null, null, null, 0.0),
        )
        assertFalse(r.active)
        assertEquals(VertMode.NONE, r.vertMode)
    }

    @Test fun climbsWhenBelowCruiseAndNoArrival() {
        val targets = listOf(wp("A", 0.0, 0.0, 0.0))
        val r = PlanGuidance.computeGuidance(
            GuidanceInput(GuidancePlan(20000.0, 250.0), targets, 0, 0.0, 0.0, 5000.0, 200.0, 90.0, 0.0, 90.0, null, 0.0),
        )
        assertTrue(r.active)
        assertEquals(VertMode.CLIMB, r.vertMode)
        assertEquals("CLIMB to 20000 FT", r.note)
        assertEquals(20000.0, r.targetAltFt!!, 0.0)
        assertEquals(250.0, r.speedAdvisoryKt!!, 0.0) // below 10,000 ft: 250 kt advisory
        assertEquals(90.0, r.headingMagCmdDeg!!, 1e-9) // magVar 0
    }

    @Test fun magneticHeadingAppliesVariation() {
        val targets = listOf(wp("A", 0.0, 0.0, 0.0))
        val r = PlanGuidance.computeGuidance(
            GuidanceInput(GuidancePlan(20000.0, 250.0), targets, 0, 0.0, 0.0, 20000.0, 200.0, 90.0, 0.0, 90.0, null, 10.0),
        )
        assertEquals(80.0, r.headingMagCmdDeg!!, 1e-9)
    }

    @Test fun descentStartsInsideTopOfDescentDistance() {
        // Fix F1 at 3,000 ft; aircraft is 5 NM from it, well inside the TOD distance.
        val arrival = ActiveArrival(airport = "WSSS", runway = "02L", sceneId = "s", firstFixName = "F1", lastFixName = "F2",
            ilsFrequencyMHz = 110.0, courseMag = 20.0)
        val targets = listOf(wp("F1", 0.0, 0.0, 3000.0), wp("F2", 0.0, -0.1, 2000.0))
        val lat = 0.0
        val lon = 5.0 / 60.0 // about 5 NM east of F1 along the equator
        val r = PlanGuidance.computeGuidance(
            GuidanceInput(GuidancePlan(35000.0, 250.0, arrival), targets, 0, lat, lon, 20000.0, 250.0, null, null, null, null, 0.0),
        )
        assertEquals(VertMode.DESCENT, r.vertMode)
        assertEquals("DESCENT to 3000 FT", r.note)
        assertEquals(3000.0, r.targetAltFt!!, 0.0)
    }

    @Test fun flightLevelCapHoldsAltitudesWithoutChangingInput() {
        val plan = ActiveFlightPlan(
            activatedAt = "t", callsign = "X", departure = "RPLL", destination = "WSSS", alternate = "", departureRunway = "",
            arrivalRunway = "", cruiseAltitudeFt = 35000.0, cruiseSpeedKt = 250.0, sid = "", enrouteRoute = "", star = "",
            approach = "", procedureStatus = "unverified",
            waypoints = listOf(ActiveFlightWaypoint("1", "A", 0.0, 0.0, 40000.0, 250.0)),
        )
        val capped = ActiveFlightPlanLogic.applyFlightLevelCap(plan, 30000.0)
        assertEquals(30000.0, capped.cruiseAltitudeFt, 0.0)
        assertEquals(30000.0, capped.waypoints[0].altitudeFt, 0.0)
        // The original plan is unchanged.
        assertEquals(35000.0, plan.cruiseAltitudeFt, 0.0)
        // No cap, or a cap above the plan: returned as-is.
        assertTrue(ActiveFlightPlanLogic.applyFlightLevelCap(plan, null) === plan)
        assertTrue(ActiveFlightPlanLogic.applyFlightLevelCap(plan, 50000.0) === plan)
    }

    @Test fun usablePlanNeedsVersionOneAndAirports() {
        val base = ActiveFlightPlan(
            activatedAt = "t", callsign = "X", departure = "RPLL", destination = "WSSS", alternate = "", departureRunway = "",
            arrivalRunway = "", cruiseAltitudeFt = 1.0, cruiseSpeedKt = 1.0, sid = "", enrouteRoute = "", star = "",
            approach = "", procedureStatus = "unverified", waypoints = emptyList(),
        )
        assertTrue(ActiveFlightPlanLogic.isUsable(base))
        assertFalse(ActiveFlightPlanLogic.isUsable(base.copy(destination = "")))
        assertFalse(ActiveFlightPlanLogic.isUsable(base.copy(version = 2)))
    }
}
