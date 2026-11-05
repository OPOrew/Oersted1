package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GlareshieldLogicTest {
    @Test fun altHoldCanAlwaysBeTurnedOff() {
        assertTrue(GlareshieldLogic.canToggleAltHold(altHoldOn = true, fdUp = false, fdMode = 1))
    }

    @Test fun altHoldCanBeTurnedOnOnlyWithFdUpAndNotOff() {
        assertTrue(GlareshieldLogic.canToggleAltHold(altHoldOn = false, fdUp = true, fdMode = 2))
        assertFalse(GlareshieldLogic.canToggleAltHold(altHoldOn = false, fdUp = true, fdMode = 1))
        assertFalse(GlareshieldLogic.canToggleAltHold(altHoldOn = false, fdUp = false, fdMode = 2))
    }

    @Test fun altHoldLampNeedsPower() {
        assertTrue(GlareshieldLogic.altHoldLampLit(on = true, powered = true))
        assertFalse(GlareshieldLogic.altHoldLampLit(on = true, powered = false))
    }

    @Test fun paddleSwingsUpWhenEngaged() {
        assertEquals(-90.0, GlareshieldLogic.paddleAngleDeg(true), 0.0)
        assertEquals(0.0, GlareshieldLogic.paddleAngleDeg(false), 0.0)
        assertTrue(GlareshieldLogic.nextPaddle(false))
        assertFalse(GlareshieldLogic.nextPaddle(true))
    }

    @Test fun pitchKnobOffsetRoundTrips() {
        assertEquals(10.0, GlareshieldLogic.pitchKnobValue(0.0), 0.0)
        assertEquals(-3.0, GlareshieldLogic.pitchFromKnob(GlareshieldLogic.pitchKnobValue(-3.0)), 0.0)
    }

    @Test fun engageNeedsInterlocksButDisengageIsAlwaysAllowed() {
        assertTrue(GlareshieldLogic.canSetEngaged(requested = true, interlocksMet = true))
        assertFalse(GlareshieldLogic.canSetEngaged(requested = true, interlocksMet = false))
        assertTrue(GlareshieldLogic.canSetEngaged(requested = false, interlocksMet = false))
    }

    @Test fun hdgSwitchToggles() {
        assertEquals(1, GlareshieldLogic.nextHdgSwitch(2))
        assertEquals(2, GlareshieldLogic.nextHdgSwitch(1))
    }

    @Test fun headingStepWrapsAndKeepsFractions() {
        assertEquals(10.0, GlareshieldLogic.stepHeading(355.0, 15.0), 1e-9)
        assertEquals(350.0, GlareshieldLogic.stepHeading(5.0, -15.0), 1e-9)
        assertEquals(12.5, GlareshieldLogic.stepHeading(12.5, 0.0), 1e-9)
    }

    @Test fun inopBoxesFollowPowerFaultsAndInterlocks() {
        assertTrue(GlareshieldLogic.inopLeftLit(true, fdFail = true, attFail = false))
        assertFalse(GlareshieldLogic.inopLeftLit(false, fdFail = true, attFail = true))
        assertTrue(GlareshieldLogic.inopRightLit(true, interlocksMet = false))
        assertFalse(GlareshieldLogic.inopRightLit(true, interlocksMet = true))
    }

    @Test fun centreMarkAnglesHaveTheWebCounts() {
        assertEquals(4, GlareshieldLogic.AP_NAV_ANGLES.size)
        assertEquals(3, GlareshieldLogic.AP_PITCH_ANGLES.size)
    }
}
