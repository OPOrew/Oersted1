package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Engine voice: shelves, synth layers, recorded layer, panning and the bus. */
class EngineVoiceTest {
    private val rate = 22050
    private fun spool(n1: Double, n2: Double, jet: Double) = EngineSpoolAudio.AcousticSpool(n1, n2, 0.0, 0.0, jet, true)

    /** Renders [blocks] blocks and returns left and right energy. */
    private fun energy(v: EngineVoice, m: AudioMixer, blocks: Int): Pair<Double, Double> {
        var el = 0.0
        var er = 0.0
        val l = FloatArray(512)
        val r = FloatArray(512)
        repeat(blocks) {
            java.util.Arrays.fill(l, 0f)
            java.util.Arrays.fill(r, 0f)
            v.render(l, r, 512, m)
            for (i in 0 until 512) {
                el += l[i] * l[i]
                er += r[i] * r[i]
            }
            m.render(ShortArray(1024), 512)
        }
        return el to er
    }

    @Test
    fun lowShelfBoostsDcByItsGainAndHighShelfBoostsNyquist() {
        val low = EngineVoice.Shelf(low = true, sr = 44100, freq = 180.0, gainDb = 9.0)
        var y = 0.0
        repeat(20000) { y = low.process(1.0) }
        assertEquals(Math.pow(10.0, 9.0 / 20), y, 1e-3)
        val high = EngineVoice.Shelf(low = false, sr = 44100, freq = 3000.0, gainDb = 3.0)
        var z = 0.0
        repeat(20000) { z = high.process(if (it % 2 == 0) 1.0 else -1.0) }
        assertEquals(Math.pow(10.0, 3.0 / 20), Math.abs(z), 1e-2)
        // and it leaves DC alone
        var d = 0.0
        repeat(20000) { d = high.process(1.0) }
        assertEquals(1.0, d, 1e-3)
    }

    @Test
    fun silentWhenTheEngineIsStopped() {
        val m = AudioMixer(rate)
        val v = EngineVoice(rate, 0)
        v.update(spool(0.0, 0.0, 0.0), false, 0.0, true)
        assertFalse(v.active())
        val (l, r) = energy(v, m, 4)
        assertEquals(0.0, l + r, 0.0)
    }

    @Test
    fun runningEngineMakesSoundAndTheBusClosesAfterShutdown() {
        val m = AudioMixer(rate)
        val v = EngineVoice(rate, 0, 3L)
        v.update(spool(60.0, 80.0, 0.5), false, 0.0, true)
        assertTrue(v.active())
        val (l, r) = energy(v, m, 10)
        assertTrue(l + r > 1e-6)
        v.update(spool(0.0, 0.0, 0.0), false, m.time, false)
        energy(v, m, 80) // about 1.9 s
        assertFalse(v.active())
    }

    @Test
    fun firstEngineIsLeftAndSecondIsRight() {
        val m0 = AudioMixer(rate)
        val a = EngineVoice(rate, 0, 3L)
        a.update(spool(60.0, 80.0, 0.5), false, 0.0, true)
        val (al, ar) = energy(a, m0, 10)
        assertTrue(al > ar)
        val m1 = AudioMixer(rate)
        val b = EngineVoice(rate, 1, 3L)
        b.update(spool(60.0, 80.0, 0.5), false, 0.0, true)
        val (bl, br) = energy(b, m1, 10)
        assertTrue(br > bl)
    }

    @Test
    fun morePowerIsLouder() {
        val m = AudioMixer(rate)
        val idle = EngineVoice(rate, 0, 3L)
        idle.update(spool(32.0, 55.0, 0.0), false, 0.0, true)
        val high = EngineVoice(rate, 0, 3L)
        high.update(spool(92.0, 95.0, 1.0), false, 0.0, true)
        val (il, ir) = energy(idle, m, 10)
        val (hl, hr) = energy(high, m, 10)
        assertTrue(hl + hr > il + ir)
    }

    @Test
    fun starterRushPlaysOnTheValveEvenBeforeTheEngineTurns() {
        val m = AudioMixer(rate)
        val v = EngineVoice(rate, 1, 3L)
        v.update(spool(0.0, 3.0, 0.0), true, 0.0, true)
        assertTrue(v.active())
        val (l, r) = energy(v, m, 10)
        assertTrue(l + r > 1e-8)
    }

    @Test
    fun recordedLayerAddsToTheSynth() {
        val mA = AudioMixer(rate)
        val synthOnly = EngineVoice(rate, 0, 3L)
        synthOnly.update(spool(60.0, 80.0, 0.5), false, 0.0, true)
        val mB = AudioMixer(rate)
        val withSmp = EngineVoice(rate, 0, 3L)
        val idle = mB.SampleLoop(FloatArray(2000) { if (it % 2 == 0) 1f else -1f }, rate)
        val run = mB.SampleLoop(FloatArray(2000) { if (it % 3 == 0) 1f else -0.5f }, rate)
        withSmp.attach(idle, run)
        withSmp.update(spool(60.0, 80.0, 0.5), false, 0.0, true)
        assertEquals(idle.targetGain, idle.currentGain, 0f)
        val (sl, sr2) = energy(synthOnly, mA, 10)
        val (wl, wr) = energy(withSmp, mB, 10)
        assertTrue(wl + wr > sl + sr2)
    }
}
