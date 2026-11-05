package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TrainingConsoleRulesTest {
    private val rules = TrainingConsoleRules

    @Test fun sectionsMatchTheWebOrder() {
        assertEquals(19, rules.SECTIONS.size)
        assertEquals("Flight Controls", rules.SECTIONS.first())
        assertEquals("Component / System Flow", rules.SECTIONS.last())
        assertTrue(rules.SECTIONS.contains(rules.DEFAULT_SECTION))
    }

    @Test fun flightControlTogglesFlipOnlyTheirFlag() {
        val s = initialSimState() // web defaults: FLT CTRL A/B and SPOILER A/B are ON
        assertTrue(s.fltCtrlA)
        val a = rules.toggleFltCtrlA(s)
        assertFalse(a.fltCtrlA)
        assertTrue(a.fltCtrlB)
        assertTrue(s.fltCtrlA) // original untouched
        assertTrue(rules.toggleFltCtrlA(a).fltCtrlA)
        assertFalse(rules.toggleFltCtrlB(s).fltCtrlB)
        assertFalse(rules.toggleSpoilerA(s).spoilerA)
        assertFalse(rules.toggleSpoilerB(s).spoilerB)
    }

    @Test fun centerFlightControlsZeroesAllFour() {
        val s = initialSimState()
        s.yokePitch = 0.4
        s.yokeRoll = -0.3
        s.rudderPedal = 0.5
        s.tiller = 0.2
        val c = rules.centerFlightControls(s)
        assertEquals(0.0, c.yokePitch, 0.0)
        assertEquals(0.0, c.yokeRoll, 0.0)
        assertEquals(0.0, c.rudderPedal, 0.0)
        assertEquals(0.0, c.tiller, 0.0)
        assertEquals(0.4, s.yokePitch, 0.0)
    }

    @Test fun centerTillerAndPedalsLeavesYoke() {
        val s = initialSimState()
        s.yokePitch = 0.4
        s.tiller = 0.2
        s.rudderPedal = 0.5
        val c = rules.centerTillerAndPedals(s)
        assertEquals(0.0, c.tiller, 0.0)
        assertEquals(0.0, c.rudderPedal, 0.0)
        assertEquals(0.4, c.yokePitch, 0.0)
    }

    @Test fun servicingTogglesFlip() {
        val s = initialSimState()
        assertTrue(rules.toggleGroundSenseTest(s).groundSenseTest)
        assertTrue(rules.toggleAirborneTest(s).airborneTest)
        assertTrue(rules.toggleHydServicingConnected(s).hydServicingConnected)
        assertTrue(rules.toggleExternalPowerConnected(s).externalPowerConnected)
        assertFalse(rules.toggleParkingBrake(s).parkingBrake) // default is SET (on)
        assertTrue(rules.toggleParkingBrake(rules.toggleParkingBrake(s)).parkingBrake)
    }

    @Test fun antiskidTogglesFlipEachSide() {
        val s = initialSimState()
        val i = rules.toggleAntiskidInbd(s) // default is ON
        assertFalse(i.antiskidInbd)
        assertTrue(i.antiskidOutbd)
        assertFalse(rules.toggleAntiskidOutbd(s).antiskidOutbd)
    }

    @Test fun autobrakeLevelsAndRange() {
        val s = initialSimState()
        assertEquals(3.0, rules.setAutobrake(s, 3).autobrake, 0.0)
        assertEquals(4.0, rules.setAutobrake(s, 4).autobrake, 0.0)
        assertEquals(listOf("OFF", "MIN", "MED", "MAX", "RTO"), rules.AUTOBRAKE_LABELS.map { it.second })
        var refused = false
        try {
            rules.setAutobrake(s, 5)
        } catch (e: IllegalArgumentException) {
            refused = true
        }
        assertTrue(refused)
    }

    @Test fun onOffLabels() {
        assertEquals("ON", rules.onOff(true))
        assertEquals("OFF", rules.onOff(false))
    }
}
