package com.oersted.trainer.sim

import com.oersted.trainer.sim.FlightPhases.Phase
import com.oersted.trainer.sim.MarkerBeacons.MarkerId
import com.oersted.trainer.sim.RunwaySceneRules as R
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RunwaySceneRulesTest {
    private fun inp(
        wow: Boolean = true, alt: Double = 0.0, cas: Double = 0.0, gs: Double = 0.0, gear: String = "DN", phase: Phase = Phase.READY,
        sitX: Double = 0.0, sitY: Double = 0.0, flying: Boolean = false, navOn: Boolean = false, pitch: Double = 0.0, vsCmd: Double = 0.0,
        om: Boolean = false, mm: Boolean = false, im: Boolean = false,
    ) = R.Inputs(wow, alt, cas, gs, 5.0, 5.0, gear, vsCmd, sitX, sitY, flying, navOn, "ILS", true, phase, pitch, om, mm, im)

    @Test fun throttleSkipsTicksUnder50ms() {
        val m = R.RunwaySceneModel { _, _ -> true }
        assertNotNull(m.step(inp(), 100.0)); assertNull(m.step(inp(), 120.0)); assertNotNull(m.step(inp(), 160.0))
    }

    @Test fun parkedAtLineUpShowsBanner() {
        val m = R.RunwaySceneModel { _, _ -> true }
        val v = m.step(inp(), 100.0)!!
        assertEquals(R.Mode.TAKEOFF, v.mode); assertEquals("LINED UP · PRESS TAKEOFF", v.banner); assertEquals(400.0, v.xFt, 0.0)
        assertEquals("takeoff", R.title(v))
        assertEquals("ON THE RUNWAY", m.step(inp(phase = Phase.TAKEOFF), 200.0)!!.banner)
    }

    @Test fun takeoffRollAccumulatesDistanceAndAnnouncesV1ThenRotate() {
        val m = R.RunwaySceneModel { _, _ -> true }
        m.step(inp(phase = Phase.TAKEOFF, gs = 10.0), 100.0)
        val a = m.step(inp(phase = Phase.TAKEOFF, gs = 100.0), 200.0)!!
        assertTrue(a.xFt > 400.0); assertEquals("TAKEOFF ROLL · 100 KT", a.banner)
        assertEquals("V1 128", m.step(inp(phase = Phase.TAKEOFF, gs = 130.0), 300.0)!!.banner)
        val r = m.step(inp(phase = Phase.TAKEOFF, gs = 137.0), 400.0)!!
        assertEquals("ROTATE · VR 136", r.banner); assertTrue(R.bannerIsAmber(r.banner))
        assertTrue(r.pitch > 0.0)
    }

    @Test fun liftOffSetsFromRollAndZoomEasesTowardRoll() {
        val m = R.RunwaySceneModel { _, _ -> true }
        m.step(inp(phase = Phase.TAKEOFF, gs = 140.0), 100.0)
        val v = m.step(inp(wow = false, alt = 50.0, cas = 150.0, gs = 150.0, phase = Phase.TAKEOFF, vsCmd = 1500.0), 200.0)!!
        assertEquals(R.Mode.FLIGHT, v.mode); assertTrue(v.fromRoll); assertTrue(v.flying)
        assertTrue(v.zoom > R.ZOOM_WIDE)
    }

    @Test fun gearRetractsAtSixTenthsPerSecond() {
        val m = R.RunwaySceneModel { _, _ -> true }
        m.step(inp(wow = false, alt = 500.0, cas = 200.0, gs = 200.0, phase = Phase.CLIMB, gear = "DN"), 100.0)
        var v = m.step(inp(wow = false, alt = 500.0, cas = 200.0, gs = 200.0, phase = Phase.CLIMB, gear = "UP"), 1100.0)!!
        assertEquals(0.4, v.gear, 1e-9)               // dt capped at 1.5 s, 0.6 per second: 1.0 -> 0.4
        v = m.step(inp(wow = false, alt = 500.0, cas = 200.0, gs = 200.0, phase = Phase.CLIMB, gear = "UP"), 1160.0)!!
        assertTrue(v.gear < 1.0)
    }

    @Test fun approachModeOnIlsInsideFourteenNm() {
        val m = R.RunwaySceneModel { _, _ -> true }
        // 8 NM out on the 062 deg localiser course: position = -8 NM along the runway axis
        val c = 62.0 * Math.PI / 180
        val v = m.step(inp(wow = false, alt = 2500.0, cas = 150.0, gs = 150.0, phase = Phase.APPROACH, sitX = -8 * Math.sin(c), sitY = -8 * Math.cos(c), flying = true, navOn = true, om = true), 100.0)!!
        assertEquals(R.Mode.APPROACH, v.mode); assertEquals(8.0, v.dist, 1e-6)
        assertEquals("ILS · 8.0 NM · 0 FT".substring(0, 9), v.banner.substring(0, 9)); assertEquals("ILS final", R.title(v))
        assertTrue(v.keyedOm); assertTrue(v.recvOm); assertFalse(v.recvMm)
        val far = R.RunwaySceneModel { _, _ -> true }.step(inp(wow = false, alt = 5000.0, sitX = -12 * Math.sin(c), sitY = -12 * Math.cos(c), flying = true, navOn = true), 100.0)!!
        assertTrue(far.banner.startsWith("FINAL · 12.0 NM"))
    }

    @Test fun touchdownThenRolloutThenStopped() {
        val m = R.RunwaySceneModel { _, _ -> true }
        val c = 62.0 * Math.PI / 180
        m.step(inp(wow = false, alt = 80.0, cas = 140.0, gs = 140.0, phase = Phase.LAND, sitX = -0.3 * Math.sin(c), sitY = -0.3 * Math.cos(c), flying = true, navOn = true), 100.0)
        val td = m.step(inp(wow = true, alt = 75.0, cas = 135.0, gs = 135.0, phase = Phase.LAND), 200.0)!!
        assertEquals(R.Mode.ROLLOUT, td.mode); assertEquals("TOUCHDOWN", td.banner); assertEquals("landing roll", R.title(td))
        assertEquals("ROLLOUT · 80 KT", m.step(inp(wow = true, alt = 75.0, gs = 80.0, phase = Phase.ROLLOUT), 5000.0)!!.banner)
        assertEquals("STOPPED", m.step(inp(wow = true, alt = 75.0, gs = 0.0, phase = Phase.ROLLOUT), 5100.0)!!.banner)
    }

    @Test fun helpers() {
        assertEquals("12,345", R.fmt(12344.6)); assertEquals("0", R.fmt(0.2)); assertEquals(1.5, R.mod(-0.5, 2.0), 1e-12)
        assertEquals("climb", R.title(R.View(mode = R.Mode.FLIGHT, phase = Phase.CLIMB))); assertEquals("airborne", R.title(R.View(mode = R.Mode.FLIGHT, phase = Phase.READY)))
        assertEquals(0.0, R.pathDeg(0.0, 250.0), 1e-9); assertTrue(R.pathDeg(2000.0, 250.0) > 4.0)
        assertTrue(R.View().keyed(MarkerId.OM).not())
    }
}
