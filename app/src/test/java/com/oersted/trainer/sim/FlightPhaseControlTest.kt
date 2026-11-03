package com.oersted.trainer.sim

import com.oersted.trainer.sim.FlightPhases.Phase
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Hand-written checks for the pure controller rules in FlightPhaseControl (flightPhases.ts, autoPhases.ts). */
class FlightPhaseControlTest {
    @Test fun cruiseCasIsClampedAndFallsBackFor430() {
        // 430 kt TAS at 35,000 ft is about 275.6 kt CAS, inside the 200..300 clamp.
        assertEquals(430.0 / (1 + 35 * 0.016), FlightPhaseControl.cruiseCasKt(430.0, 35000.0), 1e-9)
        // Zero cruise speed falls back to 430 kt.
        assertEquals(FlightPhaseControl.cruiseCasKt(430.0, 35000.0), FlightPhaseControl.cruiseCasKt(0.0, 35000.0), 1e-12)
        // At sea level 430 kt CAS is clamped down to 300.
        assertEquals(300.0, FlightPhaseControl.cruiseCasKt(430.0, 0.0), 1e-9)
    }

    @Test fun throttleSlewsWithoutOvershoot() {
        assertEquals(0.3, FlightPhaseControl.slewThrottle(0.0, 1.0, 1.0), 1e-9)
        assertEquals(1.0, FlightPhaseControl.slewThrottle(0.9, 1.0, 1.0), 1e-9) // within one step: snaps to target
        assertEquals(0.0, FlightPhaseControl.slewThrottle(0.2, 0.0, 1.0), 1e-9)
    }

    @Test fun throttleSettingsPerPhase() {
        assertEquals(1.0, FlightPhaseControl.throttleFor(Phase.TAKEOFF, 0.0), 0.0)
        assertEquals(0.88, FlightPhaseControl.throttleFor(Phase.TAKEOFF, 1400.0), 0.0)
        assertEquals(0.45, FlightPhaseControl.throttleFor(Phase.LAND), 0.0)
        assertEquals(0.0, FlightPhaseControl.throttleFor(Phase.NO_PLAN), 0.0)
    }

    @Test fun takeoffRollLeverAndCapAtVrPlusFive() {
        val r = FlightPhaseControl.takeoffRollStep(0.0, 0.0, 0.5, 90.0)
        assertEquals(0.5, r.lever, 1e-9)
        assertEquals(0.5, r.t, 1e-9)
        assertTrue(r.gs > 0.0)
        // Long enough at full power: the roll speed is capped at Vr + 5 = 141 kt.
        var gs = 0.0
        var t = 0.0
        repeat(600) {
            val s = FlightPhaseControl.takeoffRollStep(gs, t, 0.1, 90.0)
            gs = s.gs
            t = s.t
        }
        assertEquals(FlightPhases.VR_KT + 5, gs, 1e-9)
    }

    @Test fun takeoffRollWithoutEnginesSpoolsUpSlowerThanWithEngines() {
        val running = FlightPhaseControl.takeoffRollStep(0.0, 0.0, 1.0, 90.0).gs
        val notStarted = FlightPhaseControl.takeoffRollStep(0.0, 0.0, 1.0, 0.0).gs
        assertTrue(notStarted < running)
    }

    @Test fun rolloutStopsBelowHalfKnot() {
        assertTrue(FlightPhaseControl.rolloutStep(2.0, 1.0).stopped) // 2 - 3.4 < 0 => 0
        val mid = FlightPhaseControl.rolloutStep(10.0, 1.0)
        assertEquals(6.6, mid.gs, 1e-9)
        assertTrue(!mid.stopped)
    }

    @Test fun accelHoldRules() {
        assertTrue(FlightPhaseControl.accelHold(Phase.CLIMB, 1000.0, 180.0, 5.0)) // flaps still out
        assertTrue(FlightPhaseControl.accelHold(Phase.CLIMB, 1000.0, 185.0, 0.0)) // clean but slow
        assertTrue(!FlightPhaseControl.accelHold(Phase.CLIMB, 1000.0, 250.0, 0.0)) // clean and fast
        assertTrue(!FlightPhaseControl.accelHold(Phase.CLIMB, 3000.0, 180.0, 5.0)) // above the acceleration band
        assertTrue(!FlightPhaseControl.accelHold(Phase.CRUISE, 1000.0, 180.0, 5.0))
    }

    @Test fun approachScheduleFromSpeedAdvisory() {
        val s = FlightPhaseControl.schedule(Phase.APPROACH, 5000.0, 4000.0, 200.0, 0.0, 10.0, 430.0, null)
        assertEquals(210.0, s.targetCas, 0.0) // no advisory below 10,000 ft
        assertEquals(1.0, s.flaps, 0.0)
        val slow = FlightPhaseControl.schedule(Phase.APPROACH, 5000.0, 4000.0, 200.0, 0.0, 10.0, 430.0, 150.0)
        assertEquals(150.0, slow.targetCas, 0.0)
        assertEquals(5.0, slow.flaps, 0.0)
    }

    @Test fun landScheduleByDistance() {
        val s = FlightPhaseControl.schedule(Phase.LAND, 2000.0, 1900.0, 150.0, 30.0, 10.0, 430.0, null)
        assertEquals(160.0, s.targetCas, 0.0) // d > 8 NM: 160 kt
        assertEquals(30.0, s.flaps, 0.0)      // 5 < d <= 12
        val close = FlightPhaseControl.schedule(Phase.LAND, 100.0, 50.0, 140.0, 40.0, 2.0, 430.0, null)
        assertEquals(142.0, close.targetCas, 0.0)
        assertEquals(40.0, close.flaps, 0.0)
    }

    @Test fun takeoffScheduleAfterAccelerationAltitude() {
        val low = FlightPhaseControl.schedule(Phase.TAKEOFF, 75.0, 0.0, 100.0, 5.0, 40.0, 430.0, null)
        assertEquals(156.0, low.targetCas, 0.0) // V2 + 15
        assertEquals(5.0, low.flaps, 0.0)
        val high = FlightPhaseControl.schedule(Phase.TAKEOFF, 1600.0, 1500.0, 170.0, 5.0, 40.0, 430.0, null)
        assertEquals(220.0, high.targetCas, 0.0)
        assertEquals(1.0, high.flaps, 0.0)
    }

    @Test fun verticalCommandRampsAndCapsForClimb() {
        // Climbing at 1,000 ft toward a target 5,000 ft higher: climbMax = 2450 (perf 1), the ramp is 300 fpm/s.
        val v = FlightPhaseControl.verticalCommand(
            Phase.CLIMB, 1000.0, 75.0, 22.0, 40.0, 250.0, 6000.0, 1.0, false, 0.0, 1.0,
        )
        assertEquals(300.0, v.vsCmd, 1e-9)
        assertEquals(300.0, v.psFlightVsFpm, 0.0)
        assertEquals(6000.0, v.targetAltFt, 0.0)
    }

    @Test fun verticalCommandLandingPathLimits() {
        // Well above the glide path near the threshold: the command descends at the 700 fpm/s ramp.
        val v = FlightPhaseControl.verticalCommand(
            Phase.LAND, 10000.0, 75.0, 22.0, 0.0, 140.0, null, 1.0, false, 0.0, 1.0,
        )
        assertEquals(-700.0, v.vsCmd, 1e-9)
    }

    @Test fun verticalCommandHoldsWhenOnTarget() {
        val v = FlightPhaseControl.verticalCommand(
            Phase.CRUISE, 35000.0, 75.0, 22.0, 40.0, 430.0, 35000.0, 1.0, false, 500.0, 1.0,
        )
        assertEquals(0.0, v.vsCmd, 1e-9)
    }

    @Test fun startGates() {
        assertTrue(!FlightPhaseControl.canStart(Phase.TAKEOFF, false, Phase.READY, true, false).ok)
        assertEquals("Activate a flight plan first", FlightPhaseControl.canStart(Phase.TAKEOFF, false, Phase.READY, true, false).reason)
        assertTrue(FlightPhaseControl.canStart(Phase.TAKEOFF, true, Phase.READY, true, false).ok)
        assertEquals("Start with TAKEOFF", FlightPhaseControl.canStart(Phase.CLIMB, true, Phase.READY, true, false).reason)
        assertEquals("Not airborne", FlightPhaseControl.canStart(Phase.CLIMB, true, Phase.CRUISE, true, false).reason)
        assertEquals("Flight is over", FlightPhaseControl.canStart(Phase.CLIMB, true, Phase.COMPLETE, false, false).reason)
        assertTrue(!FlightPhaseControl.canStart(Phase.LAND, true, Phase.APPROACH, false, false).ok)
        assertTrue(FlightPhaseControl.canStart(Phase.APPROACH, true, Phase.CRUISE, false, false).ok)
    }

    @Test fun autoProgressionHandsOverAtEachGate() {
        val base = FlightPhaseControl.AutoContext(
            agl = 0.0, altFt = 0.0, distThrNm = 50.0, descentTgtFt = 3000.0, gearUp = false,
            locCaptured = false, inVectors = false, todReached = false,
        )
        assertEquals(Phase.CLIMB, FlightPhaseControl.autoNext(Phase.TAKEOFF, 35000.0, base.copy(agl = 1400.0, gearUp = true)))
        assertEquals(null, FlightPhaseControl.autoNext(Phase.TAKEOFF, 35000.0, base.copy(agl = 1400.0, gearUp = false)))
        assertEquals(Phase.CRUISE, FlightPhaseControl.autoNext(Phase.CLIMB, 35000.0, base.copy(altFt = 35100.0)))
        assertEquals(Phase.DESCENT, FlightPhaseControl.autoNext(Phase.CRUISE, 35000.0, base.copy(todReached = true)))
        assertEquals(Phase.APPROACH, FlightPhaseControl.autoNext(Phase.DESCENT, 35000.0, base.copy(altFt = 3200.0)))
        assertEquals(Phase.LAND, FlightPhaseControl.autoNext(Phase.APPROACH, 35000.0, base.copy(locCaptured = true, distThrNm = 10.0)))
        assertEquals(null, FlightPhaseControl.autoNext(Phase.APPROACH, 35000.0, base.copy(locCaptured = true, distThrNm = 20.0)))
    }

    @Test fun routeLengthRpllToWsss() {
        val plan = ActiveFlightPlan(
            activatedAt = "t", callsign = "X", departure = "RPLL", destination = "WSSS", alternate = "", departureRunway = "06",
            arrivalRunway = "02L", cruiseAltitudeFt = 35000.0, cruiseSpeedKt = 430.0, sid = "", enrouteRoute = "", star = "",
            approach = "", procedureStatus = "unverified", waypoints = emptyList(),
        )
        val d = FlightPhaseControl.totalRouteDistanceNm(plan)
        assertTrue(d > 1100 && d < 1300) // about 1,200 NM Manila to Singapore
    }

    private fun activePlanFor(waypoints: List<ActiveFlightWaypoint> = emptyList(), arrival: ActiveArrival? = null) = ActiveFlightPlan(
        activatedAt = "t", callsign = "X", departure = "RPLL", destination = "WSSS", alternate = "", departureRunway = "06",
        arrivalRunway = "02L", cruiseAltitudeFt = 35000.0, cruiseSpeedKt = 430.0, sid = "", enrouteRoute = "", star = "",
        approach = "", procedureStatus = "unverified", waypoints = waypoints, arrival = arrival,
    )

    private val activeGuide = GuidanceResult(
        active = true, headingTrueCmdDeg = 60.0, headingMagCmdDeg = 62.5, targetAltFt = 5000.0, vertMode = VertMode.CRUISE,
        speedAdvisoryKt = 250.0, todDistanceNm = null, distToTodNm = null, ilsArm = false, inVectors = false, note = "x",
    )

    @Test fun guidanceInactiveWithoutPlanOrWhenInactive() {
        assertTrue(FlightPhaseControl.applyPhaseToGuidance(activeGuide, Phase.CLIMB, 1000.0, null) === activeGuide)
        assertTrue(FlightPhaseControl.applyPhaseToGuidance(INACTIVE_GUIDANCE, Phase.CLIMB, 1000.0, activePlanFor()) === INACTIVE_GUIDANCE)
    }

    @Test fun readyAndCompleteSuppressGuidance() {
        val r = FlightPhaseControl.applyPhaseToGuidance(activeGuide, Phase.READY, 0.0, activePlanFor())
        assertEquals("READY - press TAKEOFF", r.note)
        assertTrue(!r.active)
        assertEquals("NO PLAN GUIDANCE", FlightPhaseControl.applyPhaseToGuidance(activeGuide, Phase.COMPLETE, 0.0, activePlanFor()).note)
    }

    @Test fun takeoffHeadsStraightOnRunwayHeadingBelowLateralLimit() {
        // RPLL 06 magnetic heading 62.8; 100 ft above field (elev 75) is inside the 400 ft straight-ahead band.
        val r = FlightPhaseControl.applyPhaseToGuidance(activeGuide, Phase.TAKEOFF, 175.0, activePlanFor())
        assertEquals(62.8, r.headingMagCmdDeg!!, 1e-9)
        assertTrue(r.headingTrueCmdDeg == null)
        assertEquals("TAKEOFF - slow climb to 1575 FT", r.note)
        assertEquals(VertMode.CLIMB, r.vertMode)
    }

    @Test fun cruiseLevelsToPlanAltitudeWhenClose() {
        val near = FlightPhaseControl.applyPhaseToGuidance(activeGuide, Phase.CRUISE, 35200.0, activePlanFor())
        assertEquals(35000.0, near.targetAltFt!!, 0.0)
        assertEquals("CRUISE 35000 FT", near.note)
        val far = FlightPhaseControl.applyPhaseToGuidance(activeGuide, Phase.CRUISE, 33260.0, activePlanFor())
        assertEquals(33300.0, far.targetAltFt!!, 0.0) // rounded to the nearest 100 ft
    }

    @Test fun descentUsesFirstVectorFixAltitude() {
        val arrival = ActiveArrival(airport = "WSSS", runway = "02L", sceneId = "WSSS-02L", firstFixName = "F1", lastFixName = "F2",
            ilsFrequencyMHz = 110.9, courseMag = 23.0)
        val plan = activePlanFor(listOf(ActiveFlightWaypoint("1", "F1", 0.0, 0.0, 6000.0, 250.0)), arrival)
        val r = FlightPhaseControl.applyPhaseToGuidance(activeGuide, Phase.DESCENT, 20000.0, plan)
        assertEquals(6000.0, r.targetAltFt!!, 0.0)
        assertEquals("DESCENT to 6000 FT", r.note)
        assertEquals(3000.0, FlightPhaseControl.applyPhaseToGuidance(activeGuide, Phase.DESCENT, 20000.0, activePlanFor()).targetAltFt!!, 0.0)
    }

    @Test fun landKeepsGuidanceUnchanged() {
        assertTrue(FlightPhaseControl.applyPhaseToGuidance(activeGuide, Phase.LAND, 2000.0, activePlanFor()) === activeGuide)
    }
}
