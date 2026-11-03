package com.oersted.trainer.sim

import com.oersted.trainer.sim.FlightPhasePresets.groundReadyPatch
import com.oersted.trainer.sim.FlightPhasePresets.parkSimPatch
import com.oersted.trainer.sim.FlightPhasePresets.planNavArmPatch
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FlightPhasePresetsTest {
    @Test fun groundPresetParksWithGearDownAndTakeoffFlaps() {
        val p = groundReadyPatch(75.0)
        assertEquals("DN", p["gear"])
        assertEquals(5.0, p["flaps"] as Double, 1e-9)
        assertEquals("ARMED", p["speedBrake"])
        assertEquals(4.0, p["autobrake"] as Double, 1e-9)
        assertEquals(75.0, p["psFlightAltFt"] as Double, 1e-9)
        assertEquals("IDLE", p["rwyPhase"])
        assertTrue(p["wow"] == true)
    }

    @Test fun groundPresetDoesNotTouchEnginesOrApu() {
        val p = groundReadyPatch(0.0)
        assertFalse(p.keys.any { it.startsWith("n1") || it.startsWith("n2") || it.startsWith("apu") || it.startsWith("fuel") })
        assertFalse(p.containsKey("throttle_eng"))
    }

    @Test fun parkPatchKeepsSystemsOut() {
        val p = parkSimPatch(22.0)
        assertEquals(22.0, p["psFlightTargetAltFt"] as Double, 1e-9)
        assertFalse(p.containsKey("flaps"))
        assertFalse(p.containsKey("autobrake"))
    }

    @Test fun planNavArmSetsHeadingWhenRunwayKnown() {
        val p = planNavArmPatch(navResetN = 3, attHdgReqN = 7, rwyHdgMag = 22.6)
        assertEquals(23.0, p["selHdg"] as Double, 1e-9)
        assertEquals(23.0, p["selCrs"] as Double, 1e-9)
        assertEquals(4.0, p["navResetN"] as Double, 1e-9)
        assertEquals(false, p["apAil"])
        val req = p["attHdgReq"] as Map<*, *>
        assertEquals(8.0, req["n"] as Double, 1e-9)
        assertEquals(22.6, req["hdg"] as Double, 1e-9)
    }

    @Test fun planNavArmLeavesHeadingAloneWhenRunwayUnknown() {
        val p = planNavArmPatch(navResetN = 0, attHdgReqN = 0, rwyHdgMag = null)
        assertFalse(p.containsKey("selHdg"))
        assertFalse(p.containsKey("attHdgReq"))
        assertEquals(true, p["planNav"])
    }
}
