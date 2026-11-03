package com.oersted.trainer.sim

import com.oersted.trainer.sim.MarkerBeacons.MarkerId
import com.oersted.trainer.sim.MarkerBeacons.MarkerState
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MarkerLampsTest {
    private val outerOnly = MarkerState(om = true, mm = false, im = false)

    @Test fun notReceivedNeverLights() {
        for (k in 0 until 20) assertFalse(MarkerLamps.lampLit(MarkerState(false, false, false), MarkerId.OM, true, k * 0.05))
    }

    @Test fun unpoweredNeverLights() {
        for (k in 0 until 20) assertFalse(MarkerLamps.lampLit(outerOnly, MarkerId.OM, false, k * 0.05))
    }

    @Test fun receivedAndPoweredFollowsKeying() {
        // OM keying: ON while t mod 0.5 < 0.36. t = 0.1 is ON, t = 0.4 is OFF.
        assertTrue(MarkerLamps.lampLit(outerOnly, MarkerId.OM, true, 0.1))
        assertFalse(MarkerLamps.lampLit(outerOnly, MarkerId.OM, true, 0.4))
    }

    @Test fun lampOnlyFollowsItsOwnMarker() {
        // Middle marker received, outer lamp must stay dark even at an ON moment.
        val mmOnly = MarkerState(om = false, mm = true, im = false)
        assertFalse(MarkerLamps.lampLit(mmOnly, MarkerId.OM, true, 0.1))
    }

    @Test fun refreshPeriodMatchesWeb() {
        assertTrue(MarkerLamps.REFRESH_MS == 40L)
    }
}
