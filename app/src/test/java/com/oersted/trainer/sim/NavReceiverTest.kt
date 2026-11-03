package com.oersted.trainer.sim

import com.oersted.trainer.sim.NavReceiver.findTrainingNavStation
import com.oersted.trainer.sim.NavReceiver.navSideForPilot
import com.oersted.trainer.sim.NavReceiver.pedestalRawFromMhz
import com.oersted.trainer.sim.NavReceiver.resolveNavReceiver
import com.oersted.trainer.sim.NavReceiver.syncMipNavFromPedestal
import com.oersted.trainer.sim.NavReceiver.tuneNav1
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NavReceiverTest {
    @Test fun pedestalRawRoundsToKiloHertz() {
        assertEquals(110900, pedestalRawFromMhz(110.9))
        assertEquals(109950, pedestalRawFromMhz(109.95))
    }

    @Test fun trainingStationsFoundWithinTolerance() {
        assertEquals("SIM-VOR-1", findTrainingNavStation(112.0)!!.id)
        assertEquals("SIM-RPLL-ILS-06", findTrainingNavStation(109.1)!!.id)
        assertTrue(findTrainingNavStation(111.0) == null)
    }

    @Test fun navSourceFollowsTransferSwitch() {
        assertEquals('L', navSideForPilot(pilotCapt = false, navSel = 0))
        assertEquals('R', navSideForPilot(pilotCapt = true, navSel = 2))
        assertEquals('L', navSideForPilot(pilotCapt = true, navSel = 1))
        assertEquals('R', navSideForPilot(pilotCapt = false, navSel = 1))
    }

    @Test fun resolveReadsTheSideThePilotIsOn() {
        val r = resolveNavReceiver(pilotCapt = true, navSel = 1, navLActRaw = 112000, navRActRaw = 109100)
        assertEquals('L', r.side)
        assertEquals("SIM-VOR-1", r.stationId)
        assertEquals("VOR", r.kind)
    }

    @Test fun tuneNav1KeepsStandbyUnlessGiven() {
        val t = tuneNav1(109.1, currentNavLStby = 112500, powerOn = true)
        assertEquals(109100, t.navLAct)
        assertEquals(112500, t.navLStby)
        assertEquals("ILS", t.mipNavTuned)
        assertTrue(t.mipNavOn)
        val u = tuneNav1(112.0, currentNavLStby = 112500, stbyMhz = 113.2)
        assertEquals(113200, u.navLStby)
        assertFalse(u.mipNavOn)
    }

    @Test fun tuneNav1OffStationLeavesKindUnset() {
        val t = tuneNav1(115.0, currentNavLStby = 112500)
        assertTrue(t.mipNavTuned == null)
    }

    @Test fun syncOnlyReportsChangeWhenDifferent() {
        val same = syncMipNavFromPedestal(112000, mipNavFrequencyMHz = 112.0, mipNavTuned = "VOR")
        assertFalse(same.changed)
        val diff = syncMipNavFromPedestal(109100, mipNavFrequencyMHz = 112.0, mipNavTuned = "VOR")
        assertTrue(diff.changed)
        assertEquals("ILS", diff.kind)
    }
}
