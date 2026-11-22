package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FlightControlsComponentRulesTest {
    private val R = FlightControlsComponentRules

    @Test fun flapAngleSweepsAcross120Degrees() {
        assertEquals(150.0, R.flapAngle(0.0), 1e-9)
        assertEquals(30.0, R.flapAngle(40.0), 1e-9)
        assertEquals(90.0, R.flapAngle(20.0), 1e-9)
        assertEquals(150.0, R.flapAngle(-5.0), 1e-9)
        assertEquals(30.0, R.flapAngle(99.0), 1e-9)
    }

    @Test fun polarPointsUp() {
        val p = R.polar(100.0, 100.0, 10.0, 90.0)
        assertEquals(100.0, p.first, 1e-9)
        assertEquals(90.0, p.second, 1e-9)
    }

    @Test fun directionWordsAndPercent() {
        assertEquals(" (TE UP)", R.dirWord(0.5))
        assertEquals(" (TE DN)", R.dirWord(-0.5))
        assertEquals("", R.dirWord(0.04))
        assertEquals("50", R.pct0(0.5))
        assertEquals("0", R.pct0(-0.001))
        assertEquals("(RIGHT)", R.rudderReadout(0.5).substringAfter("% "))
        assertEquals("0% ", R.rudderReadout(0.0))
        assertEquals("50 (TE UP) / -50 (TE DN)", R.aileronReadout(0.5, -0.5))
    }

    @Test fun groundSpoilersInterlockedUntilWowAndHydA() {
        val s = initialSimState(); val d = Derived()
        s.wow = false; d.hydA = 3000.0
        var m = R.model(s, d)
        assertTrue(m.gndSpoilerLocked); assertEquals(0.0, m.gndDeploy, 0.0)
        assertEquals("LOCKED (AIRBORNE)", R.gndSpoilerReadout(m, s.wow))
        s.wow = true; d.hydA = 500.0
        m = R.model(s, d)
        assertEquals("LOCKED (NO HYD A)", R.gndSpoilerReadout(m, s.wow))
        d.hydA = 3000.0; d.controlSurfaces.spoiler = 0.8
        m = R.model(s, d)
        assertFalse(m.gndSpoilerLocked)
        assertEquals("80% DEPLOYED", R.gndSpoilerReadout(m, s.wow))
        d.controlSurfaces.spoiler = 0.0
        assertEquals("STOWED", R.gndSpoilerReadout(R.model(s, d), s.wow))
    }

    @Test fun flightSpoilersGatedBySystemAndSwitch() {
        val s = initialSimState(); val d = Derived()
        d.hydA = 3000.0; d.hydB = 3000.0; d.flightControlAAvailable = true; d.flightControlBAvailable = false
        d.controlSurfaces.spoilerL = 0.6; d.controlSurfaces.spoilerR = 0.4
        s.spoilerA = true; s.spoilerB = true
        val m = R.model(s, d)
        assertEquals(0.6, m.spoiler3, 1e-9); assertEquals(0.0, m.spoiler2, 1e-9)
        assertEquals(0.4, m.spoiler6, 1e-9); assertEquals(0.0, m.spoiler7, 1e-9)
        assertTrue(m.a); assertFalse(m.b)
        d.standbyRudderPowered = true
        assertTrue(R.model(s, d).rud)
    }

    @Test fun readoutListMatchesWebOrder() {
        val labels = R.readouts(initialSimState(), Derived()).map { it.first }
        assertEquals(listOf("ELEVATOR", "RUDDER", "AILERON L / R", "FLT SPOILERS", "GND SPOILERS", "HYD A", "HYD B"), labels)
    }
}
