package com.oersted.trainer.sim

import com.oersted.trainer.sim.FlightModes.flightModePatch
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FlightModesTest {
    @Test fun airborneWithGearUpAndHydraulics() {
        val p = flightModePatch(5000.0)
        assertTrue(p["wow"] == false)
        assertEquals("UP", p["gear"])
        assertEquals(3000.0, p["hydAPress"] as Double, 1e-9)
        assertEquals(160.0, p["psFlightCasKt"] as Double, 1e-9)
    }

    @Test fun zeroAltitudeFallsBackToFiveThousand() {
        assertEquals(5000.0, flightModePatch(0.0)["psFlightAltFt"] as Double, 1e-9)
        assertEquals(9000.0, flightModePatch(9000.0)["psFlightTargetAltFt"] as Double, 1e-9)
    }
}
