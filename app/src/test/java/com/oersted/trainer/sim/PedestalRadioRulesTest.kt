package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Pedestal radio stack rules (CenterPedestal.tsx VhfUnit / NavUnit / AdfUnit / HfUnit / DataDisplay). */
class PedestalRadioRulesTest {
    private val R = PedestalRadioRules

    @Test
    fun vhfWrapsAtBothEnds() {
        assertEquals(121950 + 25, R.tuneVhf(121950, 25))
        assertEquals(118000, R.tuneVhf(135975, 25))
        assertEquals(118999, R.tuneVhf(135975, 1024))
        assertEquals(135975, R.tuneVhf(118000, -25))
        assertEquals(135000, R.tuneVhf(118000, -1000))
        assertEquals(118000, R.tuneVhf(119000, -1000))
    }

    @Test
    fun navWrapsAtBothEnds() {
        assertEquals(108000, R.tuneNav(117950, 50))
        assertEquals(117950, R.tuneNav(108000, -50))
        assertEquals(117000, R.tuneNav(108000, -1000))
        assertEquals(109950, R.tuneNav(108950, 1000))
        assertEquals("109.95", R.navWin(109950))
        assertEquals("112.50", R.navWin(112500))
    }

    @Test
    fun hfWrapsAndAdfClamps() {
        assertEquals(2000, R.tuneHf(29999, 1))
        assertEquals(29999, R.tuneHf(2000, -1))
        assertEquals(5728, R.tuneHf(5628, 100))
        assertEquals(1750, R.adjAdf(1745, 10))
        assertEquals(190, R.adjAdf(195, -10))
        assertEquals(354, R.adjAdf(353, 1))
    }

    @Test
    fun adfTestPositionShows1888() {
        assertEquals("1888", R.adfText(353, 3))
        assertEquals("353", R.adfText(353, 2))
    }

    @Test
    fun litRules() {
        assertTrue(R.navLit(true, 1))
        assertFalse(R.navLit(true, 0))
        assertFalse(R.navLit(false, 2))
        assertTrue(R.hfLit(true, true, 2))
        assertFalse(R.hfLit(true, null, 2))
        assertFalse(R.hfLit(true, false, 2))
        assertFalse(R.hfLit(true, true, 0))
    }

    @Test
    fun adfModeSetsTheAntFlagOnlyForAnt() {
        val (m, a) = R.adfSetMode(Pair(2, 2), Pair(false, false), 0, 1)
        assertEquals(Pair(1, 2), m)
        assertEquals(Pair(true, false), a)
        val (m2, a2) = R.adfSetMode(m, a, 1, 4)
        assertEquals(Pair(1, 4), m2)
        assertEquals(Pair(true, false), a2)
        val (_, a3) = R.adfSetMode(m2, a2, 0, 2)
        assertEquals(Pair(false, false), a3)
    }

    @Test
    fun dataDisplayLines() {
        val p = Pedestal.PedestalState()
        val lines = R.dataLines(p, 11900)
        assertEquals(
            listOf("COM1  121.95", "COM2  131.55", "COM3  119.00", "NAV1  109.95", "NAV2  109.95", "ADF1  353", "ADF2  316"),
            lines,
        )
        assertEquals("121.95", R.dataF(121950))
    }

    @Test
    fun setPairReplacesOneSide() {
        assertEquals(Pair(true, false), R.setPair(Pair(false, false), 0, true))
        assertEquals(Pair(false, true), R.setPair(Pair(false, false), 1, true))
    }
}
