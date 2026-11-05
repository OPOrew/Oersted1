package com.oersted.trainer.sim

import com.oersted.trainer.sim.EngineSpoolAudio.AcousticSpool
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class EngineSynthTargetsTest {
    private fun spool(n1: Double, n2: Double, jet: Double) = AcousticSpool(n1 = n1, n2 = n2, v1 = 0.0, v2 = 0.0, jet = jet, ready = true)

    @Test fun shutDownEngineIsSilentExceptTheBodyBaseline() {
        val t = EngineSynthTargets.compute(spool(0.0, 0.0, 0.0), valve = false, detune = 1.0, sampleLayer = false)
        assertFalse(t.busOn)
        assertEquals(0.0, t.fanGain, 0.0)
        assertEquals(0.0, t.cmpGain, 0.0)
        assertEquals(0.0, t.roarGain, 0.0)
        assertEquals(0.0, t.lfoDepth, 0.0)
        assertEquals(0.0, t.bodyGain, 0.0)
        assertEquals(0.0, t.rushGain, 0.0)
        assertEquals(700.0, t.cmpFreq, 0.0)
        assertEquals(300.0, t.roarLpFreq, 0.0)
        assertEquals(180.0, t.bodyFreq, 0.0)
        assertEquals(9.0, t.lowShelfGain, 0.0)
    }

    @Test fun fullSpoolWithoutRecordingUsesTheSynthLayers() {
        // eff = 1, r2 = 0.57 (the idle / full boundary), jet = 1 so the roar base is 0.02 + 0.045 + 0.18
        val t = EngineSynthTargets.compute(spool(100.0, 57.0, 1.0), valve = false, detune = 1.0, sampleLayer = false)
        assertEquals(500.0, t.fanFreq, 1e-9)
        assertEquals(1005.0, t.fanBFreq, 1e-9)
        assertEquals(0.058, t.fanGain, 1e-9)
        assertEquals(2000.0, t.cmpFreq, 1e-9)
        assertEquals(3020.0, t.cmpBFreq, 1e-9)
        assertEquals(0.004 + 0.03 * 0.57 * 0.57, t.cmpGain, 1e-9)
        assertEquals(2500.0, t.roarLpFreq, 1e-9)
        assertEquals(0.245, t.roarGain, 1e-9)
        assertEquals(0.245 * 0.22, t.lfoDepth, 1e-9)
        assertEquals(380.0, t.bodyFreq, 1e-9)
        assertEquals(0.6 * 0.09, t.bodyGain, 1e-9)
        assertTrue(t.busOn)
    }

    @Test fun recordedLayerScalesTheSynthDown() {
        // same spool, recording attached and starting amount 0 at full speed: synth scaled to 0.3 / 0.9, low shelf 9 dB
        val t = EngineSynthTargets.compute(spool(100.0, 57.0, 1.0), valve = false, detune = 1.0, sampleLayer = true)
        assertEquals(0.3 * 0.058, t.fanGain, 1e-9)
        assertEquals(0.9 * (0.004 + 0.03 * 0.57 * 0.57), t.cmpGain, 1e-9)
        assertEquals(0.18 * 0.09, t.bodyGain, 1e-9)
        assertEquals(9.0, t.lowShelfGain, 0.0)
    }

    @Test fun startingAddsLowShelfBoostAndBodyWhileMotoring() {
        // n2 = 20 on the starter gives eff = 0.1 (startAmt = 1): body gets the starting share, shelf +5 dB
        val t = EngineSynthTargets.compute(spool(0.0, 20.0, 0.0), valve = false, detune = 1.0, sampleLayer = true)
        assertEquals(14.0, t.lowShelfGain, 1e-9)
        assertEquals((0.3 * 0.6 + 0.4) * (0.03 + 0.06 * 0.1), t.bodyGain, 1e-9)
    }

    @Test fun starterAirRushOnlyWithValveBelowFiftyPercent() {
        // n1 = 40 gives eff = 0.4; n2 = 20: rush = 0.02 + 0.05 * (1 - 20 / 50) = 0.05
        val open = EngineSynthTargets.compute(spool(40.0, 20.0, 0.0), valve = true, detune = 1.0, sampleLayer = false)
        assertEquals(0.05, open.rushGain, 1e-9)
        val shut = EngineSynthTargets.compute(spool(40.0, 20.0, 0.0), valve = false, detune = 1.0, sampleLayer = false)
        assertEquals(0.0, shut.rushGain, 0.0)
        val fast = EngineSynthTargets.compute(spool(90.0, 50.0, 0.0), valve = true, detune = 1.0, sampleLayer = false)
        assertEquals(0.0, fast.rushGain, 0.0)
    }

    @Test fun busFollowsN2AndValveAndDetuneSplitsTheTwins() {
        assertTrue(EngineSynthTargets.compute(spool(0.0, 3.0, 0.0), false, 1.0, false).busOn)
        assertFalse(EngineSynthTargets.compute(spool(0.0, 2.0, 0.0), false, 1.0, false).busOn)
        assertTrue(EngineSynthTargets.compute(spool(0.0, 0.0, 0.0), true, 1.0, false).busOn)
        val a = EngineSynthTargets.compute(spool(100.0, 57.0, 1.0), false, 0.992, false)
        assertEquals(500.0 * 0.992, a.fanFreq, 1e-9)
        assertEquals(2000.0 * 0.992, a.cmpFreq, 1e-9)
    }
}
