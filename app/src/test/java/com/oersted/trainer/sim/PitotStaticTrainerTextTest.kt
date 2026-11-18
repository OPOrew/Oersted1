package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PitotStaticTrainerTextTest {
    private val R = PitotStaticRules

    @Test
    fun flagsReadBack() {
        val s = initialSimState()
        assertFalse(R.isSet(s, "psIcing"))
        val (c, next) = R.flip(s, "psIcing")
        assertTrue(next)
        assertTrue(R.isSet(c, "psIcing"))
        assertFalse(R.isSet(s, "psIcing"))
    }

    @Test
    fun cardStates() {
        val s = initialSimState()
        assertEquals("NORMAL SOURCE", R.alternateState(s))
        s.psAltStaticFo = true
        assertEquals("ALTERNATE SELECTED", R.alternateState(s))
        assertEquals("NORMAL", R.testNetworkState(s))
        s.psTestVacuumSource = true
        assertEquals("TEST SOURCE CONNECTED", R.testNetworkState(s))
        assertEquals("NORMAL", R.staticSourcesState(s))
        s.psStaticCaptL = true
        assertEquals("ONE PORT BLOCKED", R.staticSourcesState(s))
        s.psStaticCaptR = true
        assertEquals("NORMAL", R.staticSourcesState(s))
        assertEquals("POWER AVAILABLE", R.heatCardState(true))
        assertEquals("NO DC", R.heatCardState(false))
        assertEquals("POWERED", R.sixPackCardState(true))
        assertEquals("TRAINER DC · OFF", R.dcChip(false))
        assertEquals("ON", R.onOff(true))
    }

    @Test
    fun airDataFaultText() {
        val s = initialSimState()
        val ok = PitotStatic.computeAirData(s, true, true)
        assertFalse(R.anyFault(ok))
        assertEquals("4 COMBINED PROBES", R.plumbingState(ok))
        s.psPitotCaptBlocked = true
        val bad = PitotStatic.computeAirData(s, true, true)
        assertTrue(R.anyFault(bad))
        assertEquals("AIR DATA FAULT", R.plumbingState(bad))
    }

    @Test
    fun sidePanelFlags() {
        assertTrue(R.hardFault(listOf("COVER")))
        assertFalse(R.hardFault(listOf("ALT STATIC")))
        assertTrue(R.flagIsCaution("ONE PORT BLOCKED"))
        assertFalse(R.flagIsCaution("PITOT BLOCKED"))
    }

    @Test
    fun numberText() {
        assertEquals("0", R.groupedRound(0.4))
        assertEquals("1,235", R.groupedRound(1234.5))
        assertEquals("41,000", R.groupedRound(41000.0))
        assertEquals("-1,500", R.groupedRound(-1500.0))
        assertEquals("999", R.groupedRound(999.2))
        assertEquals(500.0, R.stepSnap(520.0, 500.0), 0.0)
        assertEquals(1000.0, R.stepSnap(750.0, 500.0), 0.0)
    }
}
