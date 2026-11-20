package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Test

class SvgLinesTest {
    @Test fun parsesHvChainAndMultipleSubpaths() {
        val p = SvgLines.parse("M262 43 V22 H14 V275 H36")
        assertEquals(1, p.size)
        assertEquals(listOf(262.0 to 43.0, 262.0 to 22.0, 14.0 to 22.0, 14.0 to 275.0, 36.0 to 275.0), p[0])
        val q = SvgLines.parse("M60 232 V251 M120 232 V251 M180 232 V251")
        assertEquals(3, q.size)
        assertEquals(listOf(120.0 to 232.0, 120.0 to 251.0), q[1])
    }

    @Test fun parsesLettersGluedToNumbers() {
        val p = SvgLines.parse("M262 43V22H14")
        assertEquals(listOf(262.0 to 43.0, 262.0 to 22.0, 14.0 to 22.0), p[0])
    }
}
