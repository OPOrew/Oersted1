package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AirConditioningRulesTest {
    private val rules = AirConditioningRules

    @Test fun packsAndTripResetsAreIndependent() {
        val s = initialSimState()
        assertTrue(rules.togglePack(s, left = true).packL)
        assertFalse(rules.togglePack(s, left = true).packR)
        val tripped = initialSimState().apply { packTripL = true; packTripR = true }
        assertFalse(rules.resetPackTrip(tripped, left = true).packTripL)
        assertTrue(rules.resetPackTrip(tripped, left = true).packTripR)
    }

    @Test fun missingTempModeReadsAsAuto() {
        val s = initialSimState()
        s.tempModeL = null
        assertEquals("AUTO", rules.tempMode(s, left = true))
        assertTrue(rules.selectorEnabled(s, left = true))
        assertFalse(rules.mixEnabled(s, left = true))
    }

    @Test fun manualCoolHighlightsForManual() {
        assertTrue(rules.modeButtonLit("MANUAL", "MANUAL_COOL"))
        assertFalse(rules.modeButtonLit("MANUAL", "MANUAL_WARM"))
    }

    @Test fun movingTheMixPutsTheSelectorInManual() {
        val s = initialSimState()
        s.tempModeR = "MANUAL_WARM"
        assertTrue(rules.mixEnabled(s, left = false))
        val m = rules.setMix(s, left = false, value = 0.7)
        assertEquals(0.7, m.mixPass, 0.0)
        assertEquals("MANUAL", m.tempModeR)
    }

    @Test fun selectorValueAndFaultSet() {
        val s = initialSimState()
        assertEquals(72.0, rules.setTempSelector(s, left = true, valueF = 72.0).tempSelectL!!, 0.0)
        assertEquals("STUCK_COLD", rules.setTempControlFault(s, left = false, value = "STUCK_COLD").tempControlFaultR)
    }

    @Test fun outflowStepsAndClamps() {
        val s = initialSimState()
        s.pressMode = "MAN_AC"
        s.outflow = 0.95
        assertEquals(1.0, rules.stepOutflow(s, open = true).outflow, 0.0)
        s.outflow = 0.05
        assertEquals(0.0, rules.stepOutflow(s, open = false).outflow, 0.0)
        s.pressMode = "AUTO"
        assertTrue(rules.stepOutflow(s, open = true) === s)
    }

    @Test fun pressModesSet() {
        assertEquals("MAN_DC", rules.setPressMode(initialSimState(), "MAN_DC").pressMode)
        assertEquals(4, rules.PRESS_MODES.size)
        assertEquals(4, rules.TEMP_MODES.size)
    }

    @Test fun tempFaultOptionsMatchTheWebList() {
        assertEquals(12, rules.TEMP_FAULT_OPTIONS.size)
        assertEquals("NONE" to "NORMAL", rules.TEMP_FAULT_OPTIONS.first())
        assertEquals("F35_VALVE_FAIL", rules.TEMP_FAULT_OPTIONS.last().first)
    }

    @Test fun faultAndSelectorDefaultsAndSetters() {
        val s = initialSimState()
        assertEquals("NONE", rules.tempControlFault(s, true))
        assertEquals(75.0, rules.tempSelector(s, false), 0.0)
        val n = rules.setTempControlFault(rules.setTempSelector(s, false, 70.0), true, "STUCK_HOT")
        assertEquals("STUCK_HOT", rules.tempControlFault(n, true))
        assertEquals("NONE", rules.tempControlFault(n, false))
        assertEquals(70.0, rules.tempSelector(n, false), 0.0)
        assertEquals(75.0, rules.tempSelector(n, true), 0.0)
    }

    @Test fun airMixCaptionRoundsAndNamesTheMode() {
        val d = Derived().apply { packLAirMixValve = 0.456; packRAirMixValve = 0.0 }
        assertEquals("AIR MIX VALVE 46% HOT · MANUAL COOL", rules.airMixCaption(d, "MANUAL_COOL", true))
        assertEquals("AIR MIX VALVE 0% HOT · MANUAL", rules.airMixCaption(d, "MANUAL", false))
        assertEquals("AIR MIX VALVE 46% HOT · AUTO", rules.airMixCaption(d, "AUTO", true))
    }
}
