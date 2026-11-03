package com.oersted.trainer.sim

import com.oersted.trainer.sim.WsssRunways.WSSS_RUNWAYS
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class WsssRunwaysTest {
    @Test fun allSixRunwaysPresent() {
        assertEquals(6, WSSS_RUNWAYS.size)
        assertTrue(listOf("02L", "20R", "02C", "20C", "02R", "20L").all { WSSS_RUNWAYS.containsKey(it) })
    }

    @Test fun reciprocalPairsDifferByOneEightyDegrees() {
        assertEquals(180.0, WSSS_RUNWAYS["20R"]!!.trueBrg - WSSS_RUNWAYS["02L"]!!.trueBrg, 0.001)
        assertEquals(180.0, WSSS_RUNWAYS["20C"]!!.trueBrg - WSSS_RUNWAYS["02C"]!!.trueBrg, 0.001)
        assertEquals(180.0, WSSS_RUNWAYS["20L"]!!.trueBrg - WSSS_RUNWAYS["02R"]!!.trueBrg, 0.001)
    }

    @Test fun only20RHasDisplacedThreshold() {
        assertEquals(740.0, WSSS_RUNWAYS["20R"]!!.displacedM!!, 1e-9)
        assertTrue(WSSS_RUNWAYS.filterKeys { it != "20R" }.values.all { it.displacedM == null })
    }

    @Test fun thresholdLatitudeMatchesDmsConversion() {
        // 1 deg 20' 56.27" N = 1 + 20/60 + 56.27/3600
        assertEquals(1.0 + 20.0 / 60.0 + 56.27 / 3600.0, WSSS_RUNWAYS["02L"]!!.thrLat, 1e-9)
        assertEquals(4000.0, WSSS_RUNWAYS["02L"]!!.lengthM, 1e-9)
    }
}
