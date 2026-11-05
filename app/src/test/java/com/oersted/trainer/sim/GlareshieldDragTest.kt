package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GlareshieldDragTest {
    @Test fun headingTextWrapsAndPadsLikeTheWeb() {
        assertEquals("090", GlareshieldDrag.headingText(90.0))
        assertEquals("000", GlareshieldDrag.headingText(360.0))
        assertEquals("359", GlareshieldDrag.headingText(-1.0))
        assertEquals("001", GlareshieldDrag.headingText(0.6))
    }

    @Test fun angleDeltaWrapsAcrossZero() {
        assertEquals(10.0, GlareshieldDrag.wrapAngleDelta(355.0, 345.0), 1e-9)
        assertEquals(-10.0, GlareshieldDrag.wrapAngleDelta(5.0, 15.0), 1e-9)
        assertEquals(5.0, GlareshieldDrag.wrapAngleDelta(20.0, 15.0), 1e-9)
    }

    @Test fun courseStepsTakeWholeSixDegreeSteps() {
        val (steps, acc) = GlareshieldDrag.courseSteps(0.0, 13.0)
        assertEquals(2, steps)
        assertEquals(1.0, acc, 1e-9)
        val (back, accBack) = GlareshieldDrag.courseSteps(0.0, -7.0)
        assertEquals(-1, back)
        assertEquals(-1.0, accBack, 1e-9)
        val (none, kept) = GlareshieldDrag.courseSteps(2.0, 3.0)
        assertEquals(0, none)
        assertEquals(5.0, kept, 1e-9)
    }

    @Test fun shortPressIsATapNotADrag() {
        val s = GlareshieldDrag.HdgDrag.start(100.0)
        val (after, steps) = GlareshieldDrag.hdgMove(s, 102.0)
        assertEquals(0, steps)
        assertFalse(after.moved)
        assertTrue(GlareshieldDrag.isTap(after))
    }

    @Test fun upwardDragStepsOnceBeyondTheThreshold() {
        val s = GlareshieldDrag.HdgDrag.start(100.0)
        val (a, stepsA) = GlareshieldDrag.hdgMove(s, 96.0) // dy = 4 -> moved, one step, leftover 1
        assertEquals(1, stepsA)
        assertTrue(a.moved)
        assertEquals(1.0, a.acc, 1e-9)
        assertFalse(GlareshieldDrag.isTap(a))
    }

    @Test fun downwardDragGivesNegativeSteps() {
        val s = GlareshieldDrag.HdgDrag.start(100.0)
        val (_, steps) = GlareshieldDrag.hdgMove(s, 110.0) // dy = -10 -> trunc(-10/3) = -3
        assertEquals(-3, steps)
    }
}
