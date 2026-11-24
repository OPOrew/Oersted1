package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** engFx: reverb IR normalisation, the ping-pong echo timing, tail decay, chunk-size independence and the sleep/reset. */
class EngineSpaceTest {
    private val sr = 44100

    private fun run(space: EngineSpace, seconds: Double, chunk: Int, impulse: Boolean = true, left: Boolean = true): Pair<FloatArray, FloatArray> {
        val total = (seconds * sr).toInt()
        val inL = FloatArray(total); val inR = FloatArray(total)
        if (impulse) (if (left) inL else inR)[0] = 1f
        val oL = FloatArray(total); val oR = FloatArray(total)
        var pos = 0
        while (pos < total) {
            val m = minOf(chunk, total - pos)
            val a = inL.copyOfRange(pos, pos + m); val b = inR.copyOfRange(pos, pos + m)
            val ol = FloatArray(m); val orr = FloatArray(m)
            space.process(a, b, ol, orr, m)
            System.arraycopy(ol, 0, oL, pos, m); System.arraycopy(orr, 0, oR, pos, m)
            pos += m
        }
        return oL to oR
    }

    private fun energy(x: FloatArray, from: Double, to: Double): Double {
        var e = 0.0
        for (i in (from * sr).toInt() until minOf(x.size, (to * sr).toInt())) e += x[i].toDouble() * x[i]
        return e
    }

    @Test fun impulseResponseIsNormalisedLikeTheConvolverNode() {
        val ir = EngineSpace.buildImpulseResponse(sr)
        assertEquals(2, ir.size)
        assertEquals((sr * 1.3).toInt(), ir[0].size)
        // after normalisation the mean power per sample is (10^(-58/20))^2 = 1.59e-6
        var sum = 0.0
        for (c in 0..1) for (v in ir[c]) sum += v * v
        assertEquals(1.585e-6, sum / (2.0 * ir[0].size), 1e-7)
    }

    @Test fun silenceInSilenceOut() {
        val (l, r) = run(EngineSpace(sr), 1.0, 1024, impulse = false)
        assertEquals(0.0, energy(l, 0.0, 1.0), 0.0)
        assertEquals(0.0, energy(r, 0.0, 1.0), 0.0)
    }

    @Test fun echoPingPongsLeftThenRight() {
        val (l, r) = run(EngineSpace(sr), 1.0, 1024)
        fun peak(x: FloatArray, a: Double, b: Double): Float {
            var m = 0f
            for (i in (a * sr).toInt() until (b * sr).toInt()) m = maxOf(m, Math.abs(x[i]))
            return m
        }
        // the left echo lands 190 ms after the impulse, the right one 190 + 270 = 460 ms
        assertTrue("left echo", peak(l, 0.19, 0.21) > 0.005f)
        assertTrue("right echo", peak(r, 0.46, 0.48) > 0.003f)
        // the echo is mono-summed, so a left-only impulse also reaches the right output, and nothing arrives before the pre-delay
        assertEquals(0.0, energy(l, 0.0, 0.025), 1e-12)
    }

    @Test fun reverbTailDecays() {
        val (l, _) = run(EngineSpace(sr), 1.6, 1024)
        val early = energy(l, 0.05, 0.4)
        val late = energy(l, 1.0, 1.3)
        assertTrue("early $early late $late", early > late * 5)
        assertTrue(early > 1e-6)
    }

    @Test fun chunkSizeDoesNotChangeTheSound() {
        val (a, _) = run(EngineSpace(sr), 0.8, 1024)
        val (b, _) = run(EngineSpace(sr), 0.8, 333)
        var maxDiff = 0f
        for (i in a.indices) maxDiff = maxOf(maxDiff, Math.abs(a[i] - b[i]))
        assertTrue("diff $maxDiff", maxDiff < 1e-5f)
    }

    @Test fun goesToSleepAfterTheTailsDieAndWakesCleanly() {
        val space = EngineSpace(sr)
        run(space, 6.0, 1024)                       // impulse, then 6 s of silence: asleep
        val (l, r) = run(space, 1.0, 1024, impulse = false)
        assertEquals(0.0, energy(l, 0.0, 1.0), 0.0)
        assertEquals(0.0, energy(r, 0.0, 1.0), 0.0)
        val (l2, _) = run(space, 0.6, 1024)         // a new impulse works again
        assertTrue(energy(l2, 0.19, 0.21) > 1e-7)
    }
}
