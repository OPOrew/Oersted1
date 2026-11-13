package com.oersted.trainer.sim

import com.oersted.trainer.sim.PedestalPartsRules as R
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** CDU key handling and knob geometry of PedestalParts.tsx. */
class PedestalPartsRulesTest {
    private fun cdu(page: String = "CRZ") = Pedestal.CduSide(page = page)
    private fun fld(page: String, id: String) = R.PAGES.getValue(page).fields.first { it.id == id }

    @Test fun typingAppendsToTheScratchpadUpToTwentyFourCharacters() {
        var s = cdu()
        repeat(30) { s = R.key(s, true, "A") }
        assertEquals(24, s.pad.length)
    }

    @Test fun unpoweredKeysDoNothing() {
        val s = cdu()
        assertEquals(s, R.key(s, false, "A"))
        assertEquals(s, R.funcKey(s, false, "LEGS"))
        assertEquals(s, R.plusMinus(s, false))
    }

    @Test fun deleteThenTypeReplacesTheScratchpad() {
        var s = R.key(cdu(), true, "DEL")
        assertEquals("DELETE", s.pad)
        s = R.key(s, true, "B")
        assertEquals("B", s.pad)
    }

    @Test fun clearRemovesOneCharacterThenTheMessage() {
        var s = cdu().copy(pad = "AB", msg = "")
        s = R.key(s, true, "CLR")
        assertEquals("A", s.pad)
        s = cdu().copy(pad = "AB", msg = "ERR")
        s = R.key(s, true, "CLR")
        assertEquals("", s.msg)
        assertEquals("AB", s.pad)
        assertEquals("", R.key(cdu().copy(pad = "DELETE"), true, "CLR").pad)
    }

    @Test fun lineKeyCopiesTheFieldToTheScratchpadThenWritesItBack() {
        var s = R.lsk(cdu(), true, fld("CRZ", "alt"))
        assertEquals("FL310", s.pad)
        s = s.copy(pad = "FL350")
        s = R.lsk(s, true, fld("CRZ", "alt"))
        assertEquals("", s.pad)
        assertTrue(s.exec)
        assertEquals("FL350", R.fieldVal(s, fld("CRZ", "alt")))
    }

    @Test fun lineKeyWithDeleteRestoresTheDefault() {
        var s = R.lsk(cdu().copy(pad = "FL350"), true, fld("CRZ", "alt"))
        s = R.lsk(s.copy(pad = "DELETE"), true, fld("CRZ", "alt"))
        assertEquals("FL310", R.fieldVal(s, fld("CRZ", "alt")))
        assertEquals("", s.pad)
    }

    @Test fun promptFieldsDoNotTouchTheScratchpadAndActivateReturnsToCruise() {
        val rte = cdu("RTE").copy(pad = "XYZ")
        val s = R.lsk(rte, true, fld("RTE", "act"))
        assertEquals("CRZ", s.page)
        assertTrue(s.exec)
        assertEquals("XYZ", s.pad)
        val p = R.lsk(cdu("CRZ"), true, fld("CRZ", "lrc"))
        assertEquals("CRZ", p.page)
        assertFalse(p.exec)
    }

    @Test fun functionKeyOpensKnownPagesAndClearsTheMessage() {
        val s = R.funcKey(cdu().copy(msg = "X"), true, "LEGS")
        assertEquals("LEGS", s.page)
        assertEquals("", s.msg)
        assertEquals("CRZ", R.funcKey(cdu(), true, "NOPE").page)
    }

    @Test fun plusMinusTogglesTheLeadingSign() {
        var s = R.plusMinus(cdu().copy(pad = "5"), true)
        assertEquals("-5", s.pad)
        s = R.plusMinus(s, true)
        assertEquals("5", s.pad)
    }

    @Test fun knobAngleAndValueRoundTripAcrossTheRange() {
        assertEquals(-135.0, R.knobAngle(0.0), 1e-9)
        assertEquals(135.0, R.knobAngle(1.0), 1e-9)
        assertEquals(0.0, R.knobAngle(5.0, 0.0, 10.0), 1e-9)
        assertEquals(5.0, R.knobValue(0.0, 0.0, 10.0), 1e-9)
        assertEquals(10.0, R.knobValue(200.0, 0.0, 10.0), 1e-9)
        assertEquals(0.0, R.knobValue(-200.0, 0.0, 10.0), 1e-9)
    }

    @Test fun knobValueSnapsToTheStep() {
        // angle 0 is the middle: 50 on 0..100, snapped to 25 steps stays 50; 63 snaps to 75
        assertEquals(50.0, R.knobValue(0.0, 0.0, 100.0, 25.0), 1e-9)
        assertEquals(75.0, R.knobValue(R.knobAngle(63.0, 0.0, 100.0), 0.0, 100.0, 25.0), 1e-9)
    }

    @Test fun tickAnglesSpreadFromMinus135To135AndTheNearestOneIsActive() {
        assertEquals(-135.0, R.tickAngle(0, 4), 1e-9)
        assertEquals(135.0, R.tickAngle(3, 4), 1e-9)
        assertEquals(-135.0, R.tickAngle(0, 1), 1e-9)
        assertEquals(2, R.activeTick(4, 60.0))
        assertEquals(-1, R.activeTick(0, 0.0))
    }

    @Test fun selectorAnglesAreCentredWithAnEvenSpread() {
        assertEquals(0.0, R.selectorAngle(0, 1), 1e-9)
        // three options: span 90, so -45, 0, 45
        assertEquals(-45.0, R.selectorAngle(0, 3), 1e-9)
        assertEquals(0.0, R.selectorAngle(1, 3), 1e-9)
        assertEquals(45.0, R.selectorAngle(2, 3), 1e-9)
        // four options: span capped at 120, so the last is at 60
        assertEquals(60.0, R.selectorAngle(3, 4), 1e-9)
    }

    @Test fun angleFromIsClockwiseFromTwelveOClock() {
        assertEquals(0.0, R.angleFrom(0.0, 0.0, 0.0, -10.0), 1e-9)
        assertEquals(90.0, R.angleFrom(0.0, 0.0, 10.0, 0.0), 1e-9)
        assertEquals(180.0, R.angleFrom(0.0, 0.0, 0.0, 10.0), 1e-9)
    }

    @Test fun tuneKnobEmitsOneStepPerTwentyDegreesAndTakesTheShortWayRound() {
        val a = R.tuneAccumulate(0.0, 45.0)
        assertEquals(listOf(1, 1), a.steps)
        assertEquals(5.0, a.acc, 1e-9)
        // -5 - 30 = -35: one -1 step leaves -15
        val b = R.tuneAccumulate(-5.0, -30.0)
        assertEquals(listOf(-1), b.steps)
        assertEquals(-15.0, b.acc, 1e-9)
        assertEquals(20.0, R.tuneDelta(170.0, -170.0), 1e-9)
        assertEquals(-20.0, R.tuneDelta(-170.0, 170.0), 1e-9)
    }

    @Test fun knobAndSwitchStateIsPersistedByKey() {
        var s = Pedestal.PedestalState()
        assertEquals(0.3, R.knobOf(s, "panel", 0.3), 1e-9)
        s = R.withKnob(s, "panel", 0.8)
        assertEquals(0.8, R.knobOf(s, "panel", 0.3), 1e-9)
        assertEquals(0.3, R.knobOf(s, "flood", 0.3), 1e-9)
        assertFalse(R.swOf(s, "mic", false))
        s = R.withSw(s, "mic", true)
        assertTrue(R.swOf(s, "mic", false))
    }

    @Test fun bat3HasThreeLeverAnglesAndShortLegends() {
        val o = listOf("A", "NORM", "B")
        assertEquals(-42, R.bat3Rotation(o, "A"))
        assertEquals(0, R.bat3Rotation(o, "NORM"))
        assertEquals(42, R.bat3Rotation(o, "B"))
        assertEquals(-42, R.bat3Rotation(o, "junk"))
        assertEquals("N", R.bat3Legend("NORMAL"))
        assertEquals("N", R.bat3Legend("NORM"))
        assertEquals("A", R.bat3Legend("A"))
    }
}

