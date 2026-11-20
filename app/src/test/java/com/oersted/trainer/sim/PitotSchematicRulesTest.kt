package com.oersted.trainer.sim

import com.oersted.trainer.sim.PitotSchematicRules as R
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PitotSchematicRulesTest {
    @Test fun probeStatePriorityIsCoverBlockedIce() {
        assertEquals(R.PState.COVER, R.pState(true, true, true))
        assertEquals(R.PState.BLOCKED, R.pState(false, true, true))
        assertEquals(R.PState.ICE, R.pState(false, false, true))
        assertEquals(R.PState.OK, R.pState(false, false, false))
    }

    @Test fun pitotColourAndFlow() {
        assertEquals(R.GREEN, R.pitotColor(R.PState.OK)); assertEquals(R.ICE, R.pitotColor(R.PState.ICE))
        assertEquals(R.RED, R.pitotColor(R.PState.COVER)); assertEquals(R.RED, R.pitotColor(R.PState.BLOCKED))
        assertEquals(R.Flow.FAST, R.pitotFlow(R.PState.OK, true))
        assertEquals(R.Flow.NONE, R.pitotFlow(R.PState.OK, false))
        assertEquals(R.Flow.NONE, R.pitotFlow(R.PState.ICE, true))
    }

    @Test fun staticColoursFollowSelectorAndPorts() {
        assertEquals(R.GREY, R.mainColor(true, true, true))
        assertEquals(R.RED, R.mainColor(true, true, false))
        assertEquals(R.BLUE, R.mainColor(true, false, false))
        assertEquals(R.RED, R.portColor(true, false)); assertEquals(R.GREY, R.portColor(true, true)); assertEquals(R.BLUE, R.portColor(false, false))
        assertEquals(R.AMBER, R.outColor(true, true)); assertEquals(R.RED, R.outColor(false, true)); assertEquals(R.BLUE, R.outColor(false, false))
        assertTrue(R.trapped(true, true, false)); assertFalse(R.trapped(true, true, true)); assertFalse(R.trapped(true, false, false))
        assertEquals(R.Flow.SLOW, R.portFlow(false, false)); assertEquals(R.Flow.NONE, R.portFlow(true, false)); assertEquals(R.Flow.NONE, R.portFlow(false, true))
        assertEquals(R.Flow.NONE, R.outFlow(true)); assertEquals(R.Flow.SLOW, R.outFlow(false))
    }

    private fun side(ias: Double = 0.0, alt: Double = 0.0, vsi: Double = 0.0, pitot: Boolean = true, stat: Boolean = true, flags: List<String> = emptyList()): PitotStatic.SideAirData {
        val air = PitotStatic.computeAirData(initialSimState(), true, true)
        return air.capt.copy(iasKt = ias, altFt = alt, vsiFpm = vsi, pitotOk = pitot, staticOk = stat, flags = flags)
    }

    @Test fun asiNeedleAndFlag() {
        val m = R.mini(R.Kind.ASI, side(ias = 160.0))
        assertEquals(135 + 135.0, m.angleDeg, 1e-9); assertEquals("160 KT", m.readout); assertFalse(m.fault)
        assertEquals(135 + 270.0, R.mini(R.Kind.ASI, side(ias = 999.0)).angleDeg, 1e-9)
        assertTrue(R.mini(R.Kind.ASI, side(pitot = false)).fault)
        assertTrue(R.mini(R.Kind.ASI, side(stat = false)).fault)
    }

    @Test fun altimeterWrapsPerThousandAndGroupsReadout() {
        val m = R.mini(R.Kind.ALT, side(alt = 12500.0))
        assertEquals(-90 + 500 * 0.36, m.angleDeg, 1e-9); assertEquals("12,500 FT", m.readout)
        val low = R.mini(R.Kind.ALT, side(alt = -2000.0))      // clamps to -1000
        assertEquals("-1,000 FT", low.readout); assertEquals(-90.0, low.angleDeg, 1e-9)
        assertTrue(R.mini(R.Kind.ALT, side(stat = false)).fault); assertFalse(R.mini(R.Kind.ALT, side(pitot = false)).fault)
    }

    @Test fun vsiNeedleSignAndClamp() {
        assertEquals(180.0, R.mini(R.Kind.VSI, side(vsi = 0.0)).angleDeg, 1e-9); assertEquals("0", R.mini(R.Kind.VSI, side()).readout)
        assertEquals("+2000", R.mini(R.Kind.VSI, side(vsi = 2000.0)).readout)
        assertEquals(180 + 150.0, R.mini(R.Kind.VSI, side(vsi = 9000.0)).angleDeg, 1e-9)
        assertEquals("-500", R.mini(R.Kind.VSI, side(vsi = -500.0)).readout)
    }

    @Test fun ticksAndShownAndFlags() {
        assertEquals(-90.0, R.tickAngles(R.Kind.ALT).first(), 0.0); assertEquals(-90.0 + 9 * 36, R.tickAngles(R.Kind.ALT).last(), 0.0)
        assertEquals(135.0 + 9 * 30, R.tickAngles(R.Kind.ASI).last(), 0.0)
        val z = R.shown(side(ias = 200.0, alt = 5000.0, vsi = 100.0), false)
        assertEquals(0.0, z.iasKt, 0.0); assertEquals(0.0, z.altFt, 0.0); assertEquals(0.0, z.vsiFpm, 0.0)
        assertEquals(200.0, R.shown(side(ias = 200.0), true).iasKt, 0.0)
        assertEquals(listOf(R.FlagChip("NORMAL", R.GREEN, 6 * 4.6 + 12)), R.flagChips(emptyList()))
        val c = R.flagChips(listOf("ALT STATIC", "PITOT BLOCKED"))
        assertEquals(R.AMBER, c[0].color); assertEquals(R.RED, c[1].color)
    }
}
