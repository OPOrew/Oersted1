package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class SixPackDataTest {
    private fun air(s: SimState) = PitotStatic.computeAirData(s, dcPower = false, acPower = false)
    private val noAtt = MipLocal.Attitude(0.0, 0.0, 0.0)

    @Test fun rollAndPitchAreClampedToTheDialLimits() {
        val s = initialSimState()
        s.attitudeRollDeg = 90.0
        s.attitudePitchDeg = -45.0
        val d = SixPackData.build(s, attLive = false, att = noAtt, air = air(s))
        assertEquals(60.0, d.roll, 1e-9)
        assertEquals(-30.0, d.pitch, 1e-9)
    }

    @Test fun headingWrapsIntoZeroTo360() {
        val s = initialSimState()
        s.attitudeHeadingDeg = -10.0
        assertEquals(350.0, SixPackData.build(s, false, noAtt, air(s)).heading, 1e-9)
        s.attitudeHeadingDeg = 370.0
        assertEquals(10.0, SixPackData.build(s, false, noAtt, air(s)).heading, 1e-9)
    }

    @Test fun liveAttitudeReplacesTheTrainerAttitude() {
        val s = initialSimState()
        s.attitudeRollDeg = 5.0
        s.attitudePitchDeg = 5.0
        s.attitudeHeadingDeg = 5.0
        val live = MipLocal.Attitude(pitch = 2.0, roll = -3.0, hdg = 123.0)
        val d = SixPackData.build(s, attLive = true, att = live, air = air(s))
        assertEquals(-3.0, d.roll, 1e-9)
        assertEquals(2.0, d.pitch, 1e-9)
        assertEquals(123.0, d.heading, 1e-9)
    }

    @Test fun unpoweredAirDataReadsZero() {
        val s = initialSimState()
        val d = SixPackData.build(s, false, noAtt, air(s))
        assertFalse(d.captPowered)
        assertEquals(0.0, d.captIasKt, 1e-9)
        assertEquals(0.0, d.captAltFt, 1e-9)
        assertEquals(0.0, d.captVsiFpm, 1e-9)
    }
}
