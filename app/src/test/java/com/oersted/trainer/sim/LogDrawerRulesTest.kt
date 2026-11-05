package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LogDrawerRulesTest {
    private fun entry(control: String?, before: String? = null, after: String? = null): LogEntry {
        val e = LogEntry()
        e.control = control
        e.before = before
        e.after = after
        return e
    }

    @Test fun rowTitleFallsBackToSystem() {
        assertEquals("SYSTEM", LogDrawerRules.rowTitle(null))
        assertEquals("BATTERY", LogDrawerRules.rowTitle("BATTERY"))
        assertEquals("", LogDrawerRules.rowTitle(""))
    }

    @Test fun causeLineOnlyForControlActions() {
        assertTrue(LogDrawerRules.causeLine(entry(null, "OFF", "ON")) == null)
        assertEquals(
            "CAUSE: OFF \u2192 COMMAND: ON",
            LogDrawerRules.causeLine(entry("BATTERY", "OFF", "ON")),
        )
    }

    @Test fun missingBeforeAfterReadAsDash() {
        assertEquals(
            "CAUSE: \u2014 \u2192 COMMAND: \u2014",
            LogDrawerRules.causeLine(entry("GEN 1")),
        )
        assertEquals(
            "CAUSE: OFF \u2192 COMMAND: \u2014",
            LogDrawerRules.causeLine(entry("GEN 1", before = "OFF")),
        )
    }

    @Test fun emptyStateWhenNoEntries() {
        assertTrue(LogDrawerRules.isEmpty(emptyList()))
        assertTrue(!LogDrawerRules.isEmpty(listOf(entry(null))))
        assertEquals("No events recorded yet. Operate a cockpit or training control.", LogDrawerRules.EMPTY_TEXT)
    }
}
