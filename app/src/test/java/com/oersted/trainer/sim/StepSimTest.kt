package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Hand-written checks for the non-trajectory helpers in StepSim (controlLabel, pushLog). */
class StepSimTest {
    @Test fun controlLabelUsesTableThenFallsBackToSpacedUpperCase() {
        assertEquals("BATTERY", StepSim.controlLabel("battery"))
        assertEquals("ENG 1 FIRE", StepSim.controlLabel("engine1FirePulled"))
        // Unknown keys: camelCase split into words, upper-cased.
        assertEquals("FOO BAR BAZ", StepSim.controlLabel("fooBarBaz"))
    }

    @Test fun pushLogPrependsAndSkipsRepeatedNewestText() {
        val s0 = initialSimState()
        val base = s0.log.size // the initial state already carries log entries
        val s1 = StepSim.pushLog(s0, "first", "info", nowMs = 1.0)
        assertEquals(base + 1, s1.log.size)
        assertEquals("first", s1.log[0].text)
        assertEquals(1.0, s1.log[0].t, 0.0)
        // Same text as the newest entry returns the very same state object.
        assertTrue(s1 === StepSim.pushLog(s1, "first", "info", nowMs = 2.0))
        val s2 = StepSim.pushLog(s1, "second", "warn", control = "battery", nowMs = 3.0)
        assertEquals(listOf("second", "first"), s2.log.take(2).map { it.text })
        assertEquals("battery", s2.log[0].control)
        assertFalse(s1 === s2)
    }

    @Test fun pushLogKeepsAtMostOneHundredEntries() {
        var s = initialSimState()
        for (i in 0 until 105) s = StepSim.pushLog(s, "entry $i", "info", nowMs = i.toDouble())
        assertEquals(100, s.log.size)
        assertEquals("entry 104", s.log[0].text)
        assertEquals("entry 5", s.log[99].text)
    }
}
