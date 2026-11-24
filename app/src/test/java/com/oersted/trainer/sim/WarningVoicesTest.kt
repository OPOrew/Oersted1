package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Synth fallbacks of the horn, the A/P wailer and the stick shakers (audio.ts buildFx). */
class WarningVoicesTest {
    private val sr = 44100

    /** Renders [seconds] of the voice through a mixer and returns the mono left channel at full scale. */
    private fun render(setup: (WarningVoices, Double) -> Unit, seconds: Double, mid: ((WarningVoices, Double) -> Unit)? = null, midAt: Double = 0.0): FloatArray {
        val mixer = AudioMixer(sr)
        val v = WarningVoices(sr)
        mixer.add(v)
        setup(v, 0.0)
        val total = (seconds * sr).toInt()
        val out = FloatArray(total)
        val buf = ShortArray(2048)
        var pos = 0
        var done = mid == null
        while (pos < total) {
            val n = minOf(1024, total - pos)
            if (!done && pos >= midAt * sr) { mid!!(v, mixer.time); done = true }
            mixer.render(buf, n)
            for (i in 0 until n) out[pos + i] = buf[2 * i] / 32767f
            pos += n
        }
        return out
    }

    private fun rms(x: FloatArray, from: Double, to: Double): Double {
        var s = 0.0
        val a = (from * sr).toInt(); val b = minOf(x.size, (to * sr).toInt())
        for (i in a until b) s += x[i].toDouble() * x[i]
        return Math.sqrt(s / (b - a))
    }

    @Test fun silentUntilSwitchedOn() {
        val x = render({ _, _ -> }, 0.5)
        assertEquals(0.0, rms(x, 0.0, 0.5), 0.0)
    }

    @Test fun hornIsAnIntermittentTone() {
        val x = render({ v, t -> v.horn(true, t) }, 2.0)
        // the 2.2 Hz square chops it: blocks of ~0.23 s alternate between sound and (near) silence
        val blocks = (0 until 8).map { rms(x, 0.5 + it * 0.1, 0.6 + it * 0.1) }
        assertTrue("loud ${blocks.max()}", blocks.max() > 0.01)
        assertTrue("gaps ${blocks.min()}", blocks.min() < blocks.max() * 0.2)
    }

    @Test fun hornFadesOutAndItsBusClosesAfterTheGraceTime() {
        val x = render({ v, t -> v.horn(true, t) }, 3.0, mid = { v, t -> v.horn(false, t) }, midAt = 1.0)
        assertTrue(rms(x, 0.5, 1.0) > 0.01)
        assertEquals(0.0, rms(x, 2.8, 3.0), 1e-9)
    }

    @Test fun wailerSweepsLikeASiren() {
        val x = render({ v, t -> v.wailer(true, t) }, 2.0)
        assertTrue(rms(x, 0.5, 2.0) > 0.01)
        // zero-crossings per 50 ms window move between a low and a high pitch over the 1.5 Hz sweep
        fun crossings(a: Double): Int {
            var c = 0
            val s = (a * sr).toInt(); val e = ((a + 0.05) * sr).toInt()
            for (i in s + 1 until e) if ((x[i - 1] < 0) != (x[i] < 0)) c++
            return c
        }
        val cs = (0 until 12).map { crossings(0.5 + it * 0.05) }
        assertTrue("sweep $cs", cs.max() > cs.min() * 1.3)
    }

    @Test fun shakerRumblesAndTheMotorsSpinUp() {
        val x = render({ v, t -> v.shaker(true, t) }, 2.0)
        assertTrue(rms(x, 1.0, 2.0) > 0.005)
        val off = render({ v, t -> v.shaker(true, t) }, 3.5, mid = { v, t -> v.shaker(false, t) }, midAt = 1.0)
        assertTrue(rms(off, 0.8, 1.0) > 0.005)
        assertEquals(0.0, rms(off, 3.3, 3.5), 1e-9)
    }

    @Test fun peakingFilterBoostsItsCentreFrequency() {
        fun gain(freq: Double): Double {
            val f = WarningVoices.Peaking(sr.toDouble(), 1500.0, 0.9, 5.0)
            var peak = 0.0
            for (i in 0 until 4000) {
                val y = f.process(Math.sin(2 * Math.PI * freq * i / sr))
                if (i > 2000) peak = maxOf(peak, Math.abs(y))
            }
            return peak
        }
        assertEquals(Math.pow(10.0, 5.0 / 20.0), gain(1500.0), 0.05)   // +5 dB at the centre
        assertEquals(1.0, gain(100.0), 0.05)
        assertFalse(gain(1500.0) < 1.5)
    }
}
