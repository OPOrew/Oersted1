package com.oersted.trainer.sim

import com.oersted.trainer.sim.MipLocal.MipState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GlareshieldReducerTest {
    private val R = GlareshieldReducer

    @Test fun captainAndFirstOfficerWriteSeparateFields() {
        val s = R.setFdMode(MipState(), second = false, mode = 2)
        assertEquals(2, s.fdMode)
        assertEquals(1, s.fdMode2)
        val t = R.setFdMode(s, second = true, mode = 3)
        assertEquals(3, t.fdMode2)
        assertEquals(2, t.fdMode)
    }

    @Test fun altHoldRespectsTheFdRule() {
        val base = MipState(fdMode = 2, fdAlt = false)
        assertTrue(R.setFdAltHold(base, second = false, on = true, fdUp = true).fdAlt)
        assertFalse(R.setFdAltHold(base, second = false, on = true, fdUp = false).fdAlt)
        val off = MipState(fdMode = 1, fdAlt = false)
        assertFalse(R.setFdAltHold(off, second = false, on = true, fdUp = true).fdAlt)
    }

    @Test fun headingAndCourseWrap() {
        assertEquals(10.0, R.stepSelHdg(MipState(selHdg = 355.0), 15.0).selHdg, 1e-9)
        assertEquals(350.0, R.stepSelCrs(MipState(selCrs = 5.0), -15.0).selCrs, 1e-9)
    }

    @Test fun hdgSwitchToggles() {
        assertEquals(2, R.toggleHdgSwitch(MipState(apHdgSw = 1)).apHdgSw)
        assertEquals(1, R.toggleHdgSwitch(MipState(apHdgSw = 2)).apHdgSw)
    }

    @Test fun engageNeedsInterlocksOnly() {
        assertFalse(R.setEngage(MipState(), aileron = true, engaged = true, interlocksMet = false).apAil)
        assertTrue(R.setEngage(MipState(), aileron = true, engaged = true, interlocksMet = true).apAil)
        val engaged = MipState(apElev = true)
        assertFalse(R.setEngage(engaged, aileron = false, engaged = false, interlocksMet = false).apElev)
    }

    @Test fun apDiscResets() {
        assertFalse(R.resetApDisc(MipState(apWarn = true)).apWarn)
    }
}
