package com.oersted.trainer.sim

import com.oersted.trainer.sim.FlightPhases.Phase
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Round trips through the typed holders, and the controller running on them (adapter sanity, not parity). */
class SimPhaseWorldTest {
    private fun world(plan: ActiveFlightPlan? = null): Triple<SimPhaseWorld, SimStore, MipLocal.Holder> {
        val store = SimStore()
        val mip = MipLocal.Holder()
        val ped = Pedestal.Holder()
        val w = SimPhaseWorld(store, mip, ped, FlightNavigator(), { 1_700_000_000_000L }, { 10.0 }, { plan })
        return Triple(w, store, mip)
    }

    private fun plan() = ActiveFlightPlan(
        activatedAt = "2026-11-02T00:00:00Z", callsign = "TEST", departure = "RPLL", destination = "WSSS",
        alternate = "", departureRunway = "06", arrivalRunway = "02L", cruiseAltitudeFt = 35000.0, cruiseSpeedKt = 250.0,
        sid = "", enrouteRoute = "", star = "", approach = "", procedureStatus = "unverified",
        waypoints = emptyList(), arrival = null, timeCompression = null,
    )

    @Test fun simPatchRoundTrips() {
        val (w, store, _) = world()
        w.patchSim(mapOf("gear" to "DN", "wow" to true, "groundSpeedKt" to 12.5, "psFlightProgressive" to true))
        assertEquals("DN", store.current().gear)
        assertTrue(store.current().wow)
        assertEquals(12.5, store.current().groundSpeedKt, 1e-9)
        assertEquals("DN", w.simLive()["gear"])
        assertEquals(12.5, w.simSnapshot()["groundSpeedKt"])
    }

    @Test fun unmappedSimKeyFailsLoudly() {
        val (w, _, _) = world()
        var threw = false
        try { w.patchSim(mapOf("noSuchKey" to 1.0)) } catch (e: IllegalArgumentException) { threw = true }
        assertTrue(threw)
    }

    @Test fun mipPatchRoundTripsIncludingNestedRequest() {
        val (w, _, mip) = world()
        w.patchMip(mapOf("fdMode" to 2.0, "apAil" to false, "attHdgReq" to mapOf("n" to 3.0, "hdg" to 90.0)))
        assertEquals(2, mip.state.fdMode)
        assertFalse(mip.state.apAil)
        assertEquals(3, mip.state.attHdgReq.n)
        assertEquals(90.0, mip.state.attHdgReq.hdg, 1e-9)
        assertEquals(2.0, w.mipLive()["fdMode"])
        val req = w.mipLive()["attHdgReq"] as Map<*, *>
        assertEquals(3.0, req["n"])
    }

    @Test fun pedestalNavLRoundTrips() {
        val store = SimStore()
        val ped = Pedestal.Holder()
        val w = SimPhaseWorld(store, MipLocal.Holder(), ped, FlightNavigator(), { 0L }, { 0.0 }, { null })
        w.patchPedestal(mapOf("navL" to mapOf("act" to 111000.0, "stby" to 112500.0)))
        assertEquals(111000, ped.state.navL.act)
        assertEquals(112500, ped.state.navL.stby)
        assertEquals(112500.0, (w.pedestalLive()["navL"] as Map<*, *>)["stby"])
    }

    @Test fun loadParksThroughTheAdapter() {
        val (w, store, _) = world(plan())
        val c = PhaseController(w)
        assertTrue(c.loadPlanIntoControls())
        assertTrue(c.phase == Phase.READY)
        assertEquals("DN", store.current().gear)
        assertTrue(store.current().wow)
    }

    /** Takeoff roll through the adapter: every key the roll and climb patch must be mapped (an unmapped key throws). */
    @Test fun takeoffRunsThroughTheAdapterWithoutUnmappedKeys() {
        var t = 10.0
        val store = SimStore()
        val mip = MipLocal.Holder()
        val w = SimPhaseWorld(store, mip, Pedestal.Holder(), FlightNavigator(), { (t * 1000).toLong() }, { t }, { plan() })
        val c = PhaseController(w)
        assertTrue(c.loadPlanIntoControls())
        assertTrue(c.startPhase(Phase.TAKEOFF))
        repeat(400) {
            t += 0.25
            c.tick(t)
        }
        assertTrue(c.phase == Phase.TAKEOFF || c.phase == Phase.CLIMB)
        assertTrue(store.current().groundSpeedKt > 0.0)
    }
}
