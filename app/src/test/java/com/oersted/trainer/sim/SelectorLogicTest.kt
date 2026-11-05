package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SelectorLogicTest {
    @Test fun knobAngleIsFortyTwoDegreesPerDetentCentredOnOne() {
        assertEquals(-42.0, SelectorLogic.knobAngleDeg(0), 0.0)
        assertEquals(0.0, SelectorLogic.knobAngleDeg(1), 0.0)
        assertEquals(42.0, SelectorLogic.knobAngleDeg(2), 0.0)
    }

    @Test fun pressStepsOneDetentAndClampsAtTheEnds() {
        assertEquals(0, SelectorLogic.stepFromPress(1, pressLeftOfCentre = true))
        assertEquals(2, SelectorLogic.stepFromPress(1, pressLeftOfCentre = false))
        assertEquals(0, SelectorLogic.stepFromPress(0, pressLeftOfCentre = true))
        assertEquals(2, SelectorLogic.stepFromPress(2, pressLeftOfCentre = false))
    }

    @Test fun eprShowsTwoDecimalsOnlyWhenPowered() {
        assertEquals("1.50", SelectorLogic.eprText(1.5, powered = true))
        assertTrue(SelectorLogic.eprText(1.5, powered = false) == null)
    }
}
