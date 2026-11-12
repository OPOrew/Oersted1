package com.oersted.trainer.sim

import com.oersted.trainer.sim.PedestalLeversRules as R
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Gate geometry and labels of the flap and speed brake levers (PedestalLevers.tsx). */
class PedestalLeversRulesTest {
    @Test fun gatesAreSpreadBetweenThePaddedEnds() {
        // flap lever: height 300, 9 gates: first at 18, last at 282, 33 apart
        assertEquals(18.0, R.gateY(0, 9, 300.0), 1e-9)
        assertEquals(51.0, R.gateY(1, 9, 300.0), 1e-9)
        assertEquals(282.0, R.gateY(8, 9, 300.0), 1e-9)
        // one gate sits at the top
        assertEquals(18.0, R.gateY(0, 1, 100.0), 1e-9)
    }

    @Test fun pickReturnsTheNearestGateOrNullWhenItIsTheCurrentOne() {
        // speed brake: height 220, 4 gates at 18, 79.33, 140.67, 202
        assertEquals(3, R.pickGate(210.0, 4, 220.0, 0)!!)
        assertEquals(0, R.pickGate(-40.0, 4, 220.0, 2)!!)
        assertTrue(R.pickGate(80.0, 4, 220.0, 1) == null)
    }

    @Test fun flapIndexIsTheNearestDetent() {
        assertEquals(0, R.flapIndex(0.0))
        assertEquals(3, R.flapIndex(5.0))
        assertEquals(4, R.flapIndex(9.0))
        assertEquals(8, R.flapIndex(99.0))
        // equidistant between 0 and 1: the first wins
        assertEquals(0, R.flapIndex(0.5))
    }

    @Test fun flapTextsAndNotes() {
        assertEquals("UP", R.flapLeverText(0.0))
        assertEquals("15", R.flapLeverText(15.0))
        assertEquals("FLAP LEVER UP", R.flapNote(0.0))
        assertEquals("FLAP LEVER 40", R.flapNote(40.0))
        assertEquals("3", R.trailingEdgeText(2.5))
        assertEquals("2", R.trailingEdgeText(2.49))
    }

    @Test fun speedBrakeIndexStatusAndTone() {
        assertEquals(0, R.speedBrakeIndex("DOWN"))
        assertEquals(2, R.speedBrakeIndex("FLIGHT"))
        assertEquals(0, R.speedBrakeIndex("junk"))
        assertEquals("FLIGHT DETENT", R.speedBrakeStatus("FLIGHT"))
        assertEquals("UP", R.speedBrakeStatus("UP"))
        assertEquals("SPEED BRAKE ARMED", R.speedBrakeNote("ARMED"))
        assertEquals(R.StatusTone.OK, R.speedBrakeTone("ARMED"))
        assertEquals(R.StatusTone.NEUTRAL, R.speedBrakeTone("DOWN"))
        assertTrue(R.speedBrakeTone("UP") == R.StatusTone.CAUTION)
    }
}
