package com.oersted.trainer.sim

import com.oersted.trainer.sim.FlightPhases.Phase
import com.oersted.trainer.sim.PhaseController.Companion.num
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PhaseControllerTest {

    /** In-memory world: holders are plain maps, patches merge top-level keys, the clock is set by the test. */
    private class FakeWorld(var plan: ActiveFlightPlan?) : PhaseWorld {
        var t = 0.0
        var sim: Map<String, Any?> = emptyMap()
        var mip: Map<String, Any?> = emptyMap()
        var ped: Map<String, Any?> = emptyMap()
        override fun nowMs(): Long = (t * 1000).toLong()
        override fun perfSec(): Double = t
        override fun activePlan(): ActiveFlightPlan? = plan
        override fun resetNavigation(plan: ActiveFlightPlan) {}
        override fun liveNavigation(): FlightNavigationState? = null
        override fun liveGuidance(): GuidanceResult = INACTIVE_GUIDANCE
        override fun simLive(): Map<String, Any?> = sim
        override fun simSnapshot(): Map<String, Any?> = sim.toMap()
        override fun patchSim(p: Map<String, Any?>) { sim = sim + p }
        override fun mipLive(): Map<String, Any?> = mip
        override fun mipSnapshot(): Map<String, Any?> = mip.toMap()
        override fun patchMip(p: Map<String, Any?>) { mip = mip + p }
        override fun pedestalLive(): Map<String, Any?> = ped
        override fun patchPedestal(p: Map<String, Any?>) { ped = ped + p }
    }

    private fun plan(depRunway: String = "06") = ActiveFlightPlan(
        activatedAt = "2026-11-02T00:00:00Z", callsign = "TEST", departure = "RPLL", destination = "WSSS",
        alternate = "", departureRunway = depRunway, arrivalRunway = "02L", cruiseAltitudeFt = 35000.0, cruiseSpeedKt = 250.0,
        sid = "", enrouteRoute = "", star = "", approach = "", procedureStatus = "unverified",
        waypoints = emptyList(), arrival = null, timeCompression = null,
    )

    @Test fun loadWithoutPlanRefusesAndLogs() {
        val w = FakeWorld(null)
        val c = PhaseController(w)
        assertFalse(c.loadPlanIntoControls())
        assertEquals(Phase.NO_PLAN, c.phase)
        assertTrue(c.log.last().text.startsWith("No active flight plan"))
    }

    @Test fun loadParksAircraftAndArmsPlanNav() {
        val w = FakeWorld(plan())
        val c = PhaseController(w)
        assertTrue(c.loadPlanIntoControls())
        assertEquals(Phase.READY, c.phase)
        assertTrue(c.running)
        assertEquals("DN", w.sim["gear"])
        assertEquals(5.0, num(w.sim["flaps"]), 1e-9)
        assertEquals(true, w.sim["wow"])
        assertEquals(true, w.mip["planNav"])
        assertEquals(2.0, num(w.mip["fdMode"]), 1e-9)
        // RWY 06 magnetic heading 62.8 rounds to 63
        assertEquals(63.0, num(w.mip["selHdg"]), 1e-9)
        assertTrue(c.checklist.any { it.label == "Route" && it.value.contains("0 waypoints") })
    }

    @Test fun takeoffIsTheOnlyStartFromReady() {
        val w = FakeWorld(plan())
        val c = PhaseController(w)
        c.loadPlanIntoControls()
        assertFalse(c.startPhase(Phase.CLIMB))          // on the ground: CLIMB is refused
        assertEquals(Phase.READY, c.phase)
        assertTrue(c.startPhase(Phase.TAKEOFF))
        assertEquals(Phase.TAKEOFF, c.phase)
        assertEquals(0.0, num(w.sim["throttle1"]), 1e-9)
    }

    @Test fun parkKeepsPlanAndReturnsToReady() {
        val w = FakeWorld(plan())
        val c = PhaseController(w)
        c.loadPlanIntoControls()
        c.startPhase(Phase.TAKEOFF)
        c.parkAtDeparture()
        assertEquals(Phase.READY, c.phase)
        assertEquals("DN", w.sim["gear"])
        assertEquals(true, w.sim["wow"])
    }

    @Test fun groundRollAcceleratesThenLiftsOff() {
        val w = FakeWorld(plan())
        val c = PhaseController(w)
        c.loadPlanIntoControls()
        c.startPhase(Phase.TAKEOFF)
        var last = 0.0
        var liftedAt = -1
        for (i in 1..400) {
            w.t += 0.2
            c.tick(w.t)
            val gs = num(w.sim["groundSpeedKt"])
            assertTrue(gs + 1e-9 >= last)
            last = gs
            if (w.sim["wow"] == false) { liftedAt = i; break }
        }
        assertTrue(liftedAt > 0)
        assertEquals(Phase.TAKEOFF, c.phase)
        // lift-off patch keeps gear DN; gear up follows at positive rate in the airborne branch (web order)
        assertEquals("DN", w.sim["gear"])
        assertTrue(c.log.any { it.text.startsWith("Rotate at 136") })
    }

    @Test fun resetReturnsToNoPlan() {
        val w = FakeWorld(plan())
        val c = PhaseController(w)
        c.loadPlanIntoControls()
        c.resetFlightPhases()
        assertEquals(Phase.NO_PLAN, c.phase)
        assertFalse(c.running)
        assertTrue(c.checklist.isEmpty())
    }

    @Test fun logKeepsOnlyTheLatestThirty() {
        val w = FakeWorld(null)
        val c = PhaseController(w)
        repeat(40) { c.loadPlanIntoControls() }
        assertEquals(30, c.log.size)
    }
}
