package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class EngineSampleLayerTest {
    @Test fun silentWhileOnlyMotoringOnTheStarter() {
        val m = EngineSampleLayer.mix(eff = 0.1, jet = 0.5)
        assertEquals(0.0, m.idleGain, 0.0)
        assertEquals(0.0, m.runGain, 0.0)
    }

    @Test fun atIdleTheIdleLoopPlaysAtItsRecordedPitch() {
        val m = EngineSampleLayer.mix(eff = 0.32, jet = 0.0)
        assertEquals(1.0, m.idleRate, 1e-9)
        assertEquals(1.0 / 1.9, m.runRate, 1e-9)
    }

    @Test fun atMaxThrustThePowerLoopIsAtItsRecordedRate() {
        val m = EngineSampleLayer.mix(eff = 1.0, jet = 1.0)
        // rise = 2.15 -> the power loop runs at rise / 1.9, idle is capped at 1.85
        assertEquals(2.15 / 1.9, m.runRate, 1e-9)
        assertEquals(1.85, m.idleRate, 1e-9)
    }

    @Test fun lowThrustUsesTheIdleLoopAndHighThrustTheRunLoop() {
        val low = EngineSampleLayer.mix(eff = 0.6, jet = 0.0)
        assertTrue(low.idleGain > 0.0)
        assertEquals(0.0, low.runGain, 1e-9)
        val high = EngineSampleLayer.mix(eff = 0.6, jet = 1.0)
        assertTrue(high.runGain > high.idleGain)
    }

    @Test fun detuneScalesBothRates() {
        val a = EngineSampleLayer.mix(eff = 0.8, jet = 0.5, detune = 1.0)
        val b = EngineSampleLayer.mix(eff = 0.8, jet = 0.5, detune = 1.01)
        assertEquals(a.idleRate * 1.01, b.idleRate, 1e-12)
        assertEquals(a.runRate * 1.01, b.runRate, 1e-12)
    }
}
