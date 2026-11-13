package com.oersted.trainer.sim

import com.oersted.trainer.sim.PedestalStandRules as R
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Control stand rules of CenterPedestal.tsx. */
class PedestalStandRulesTest {
    @Test fun thrustLeverHandleTravelsBetweenIdleAndFullThrust() {
        assertEquals(566.0, R.thrustY(0.0), 1e-9)
        assertEquals(430.0, R.thrustY(1.0), 1e-9)
        assertEquals(498.0, R.thrustY(0.5), 1e-9)
    }

    @Test fun thrustDragSnapsToOneHundredthAndStaysInRange() {
        // dragging up the full travel (-136) from idle gives full thrust
        assertEquals(1.0, R.thrustDrag(0.0, -136.0), 1e-9)
        assertEquals(0.0, R.thrustDrag(0.0, 40.0), 1e-9)
        assertEquals(0.5, R.thrustDrag(0.0, -68.0), 1e-9)
        assertEquals(0.25, R.thrustDrag(0.5, 34.0), 1e-9)
        assertEquals(1.0, R.thrustDrag(0.9, -50.0), 1e-9)
    }

    @Test fun linkedLeversMoveTogether() {
        assertEquals(Pair(true, true), R.thrustTargets(true, 1))
        assertEquals(Pair(true, false), R.thrustTargets(false, 1))
        assertEquals(Pair(false, true), R.thrustTargets(false, 2))
    }

    @Test fun reverserDeployNeedsIdleAndTheGroundInterlock() {
        assertEquals(R.ReverserAction.STOW, R.reverserToggle(1, true, 0.9, false, false, true, 0.0).action)
        assertEquals("ENG 2 REVERSER STOW", R.reverserToggle(2, true, 0.0, true, true, false, 3000.0).note)
        val hot = R.reverserToggle(1, false, 0.06, true, true, false, 3000.0)
        assertEquals(R.ReverserAction.INHIBIT_THROTTLE, hot.action)
        assertEquals("ENG 1 REVERSER DEPLOY INHIBITED — thrust lever must be at idle.", hot.note)
        assertEquals(R.ReverserAction.INHIBIT_INTERLOCK, R.reverserToggle(1, false, 0.0, false, true, false, 3000.0).action)
        assertEquals(R.ReverserAction.INHIBIT_INTERLOCK, R.reverserToggle(1, false, 0.0, true, false, false, 3000.0).action)
        assertEquals(R.ReverserAction.INHIBIT_INTERLOCK, R.reverserToggle(1, false, 0.0, true, true, true, 3000.0).action)
        assertEquals(R.ReverserAction.INHIBIT_INTERLOCK, R.reverserToggle(1, false, 0.0, true, true, false, 1500.0).action)
        val ok = R.reverserToggle(2, false, 0.05, true, true, false, 1501.0)
        assertEquals(R.ReverserAction.DEPLOY, ok.action)
        assertEquals("ENG 2 REVERSER DEPLOY", ok.note)
        assertEquals(380, R.reverserForkY(true))
        assertEquals(320, R.reverserForkY(false))
    }

    @Test fun startLeverNotesAndDetent2() {
        assertEquals("ENG 1 START LEVER → IDLE", R.startLeverNote(1, true))
        assertEquals("ENG 2 START LEVER → CUTOFF", R.startLeverNote(2, false))
        // track 64 high: the top half is the upper position
        assertEquals(true, R.detent2Pick(10.0, 64.0, false)!!)
        assertEquals(false, R.detent2Pick(50.0, 64.0, true)!!)
        assertTrue(R.detent2Pick(10.0, 64.0, true) == null)
        assertEquals(3.0, R.detent2HandleTop(true, 64.0, 26.0), 1e-9)
        assertEquals(35.0, R.detent2HandleTop(false, 64.0, 26.0), 1e-9)
    }

    @Test fun flapGatesFollowThePhotoCoordinates() {
        // relY is below the quadrant top (340): gate 0 is at photo y 362, so relY 22
        assertEquals(0, R.flapGate(22.0))
        assertEquals(4, R.flapGate(457.0 - 340))
        assertEquals(8, R.flapGate(400.0))
        assertEquals(0, R.flapGate(-50.0))
        // between gate 1 (380) and 2 (397): 388 is 8 from 380 and 9 from 397
        assertEquals(1, R.flapGate(48.0))
    }

    @Test fun speedBrakeGatesFollowTheLeverCentres() {
        assertEquals(0, R.speedBrakeGate(0.0))
        assertEquals(1, R.speedBrakeGate(58.0))
        assertEquals(2, R.speedBrakeGate(120.0))
        assertEquals(3, R.speedBrakeGate(200.0))
        // 88 is 30 from 58 and 30 from 118: the first wins the tie
        assertEquals(1, R.speedBrakeGate(88.0))
    }

    @Test fun trimInterlockStepAndScale() {
        assertTrue(R.trimCut(true, false, false))
        assertTrue(R.trimCut(false, true, false))
        assertFalse(R.trimCut(true, true, true))
        assertFalse(R.trimCut(false, false, false))
        assertEquals(5.03, R.trimNext(5.0, 0.03), 1e-9)
        assertEquals(15.0, R.trimNext(14.99, 0.5), 1e-9)
        assertEquals(0.0, R.trimNext(0.01, -0.5), 1e-9)
        assertEquals(-0.3, R.trimDragUnits(10.0), 1e-9)
        assertEquals(180.0, R.trimWheelOffset(5.0), 1e-9)
        assertEquals(16.0, R.stabScaleY(0.0), 1e-9)
        assertEquals(166.0, R.stabScaleY(15.0), 1e-9)
    }

    @Test fun lightsFollowPowerAndTheirTriggers() {
        assertTrue(R.stabTrimLight(true, true, false))
        assertTrue(R.stabTrimLight(true, false, true))
        assertFalse(R.stabTrimLight(false, true, true))
        assertFalse(R.stabTrimLight(true, false, false))
        assertTrue(R.lampTest(true, Pedestal.FireTest.FAULT))
        assertFalse(R.lampTest(true, Pedestal.FireTest.OFF))
        assertFalse(R.lampTest(false, Pedestal.FireTest.OVHT_FIRE))
        assertTrue(R.parkBrakeLight(true, true))
        assertFalse(R.parkBrakeLight(true, false))
    }

    @Test fun parkingBrakeHandleLatchesPastHalfTravel() {
        assertEquals(44.0, R.parkHandleTop(0.0), 1e-9)
        assertEquals(4.0, R.parkHandleTop(1.0), 1e-9)
        // stowed: dragging up 30 px pulls 0.75
        assertEquals(0.75, R.parkDragFrac(0.0, -30.0), 1e-9)
        assertEquals(1.0, R.parkDragFrac(0.0, -80.0), 1e-9)
        assertEquals(0.0, R.parkDragFrac(1.0, 80.0), 1e-9)
        assertFalse(R.parkMoved(3.0))
        assertTrue(R.parkMoved(-3.1))
        assertTrue(R.parkRelease(true, 0.75, false))
        assertFalse(R.parkRelease(true, 0.4, true))
        assertFalse(R.parkRelease(true, null, true))
        assertTrue(R.parkRelease(false, null, false))
        assertFalse(R.parkRelease(false, null, true))
        assertEquals("PARKING BRAKE SET — handle pulled.", R.parkNote(true))
        assertEquals("PARKING BRAKE RELEASED — handle stowed.", R.parkNote(false))
    }
}
