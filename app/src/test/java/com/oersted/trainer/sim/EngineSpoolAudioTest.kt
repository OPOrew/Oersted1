package com.oersted.trainer.sim

import com.oersted.trainer.sim.EngineSpoolAudio.newAcousticSpool
import com.oersted.trainer.sim.EngineSpoolAudio.stepAcousticSpool
import com.oersted.trainer.sim.EngineSpoolAudio.thrustFromN1
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class EngineSpoolAudioTest {
    @Test fun thrustMapsIdleToZeroAndTakeoffToOne() {
        assertEquals(0.0, thrustFromN1(20.0), 1e-9)
        assertEquals(0.5, thrustFromN1(62.0), 1e-9)
        assertEquals(1.0, thrustFromN1(120.0), 1e-9)
    }

    @Test fun firstUpdateSnapsToTargets() {
        val s = stepAcousticSpool(newAcousticSpool(), 90.0, 80.0, 0.1)
        assertTrue(s.ready)
        assertEquals(90.0, s.n1, 1e-9)
        assertEquals(80.0, s.n2, 1e-9)
        assertEquals(0.0, s.v1, 1e-9)
    }

    @Test fun spoolUpIsRateLimitedAndNeverOvershoots() {
        var s = stepAcousticSpool(newAcousticSpool(), 32.0, 32.0, 0.0)
        var last = s.n1
        for (i in 0 until 12) {
            s = stepAcousticSpool(s, 92.0, 90.0, 1.0)
            assertTrue(s.n1 >= last)
            assertTrue(s.n1 <= 92.0 + 1e-9)
            last = s.n1
        }
        assertTrue(s.n1 > 88.0)
        assertTrue(s.jet > 0.9)
    }

    @Test fun spoolDownNeverUndershoots() {
        var s = stepAcousticSpool(newAcousticSpool(), 92.0, 90.0, 0.0)
        for (i in 0 until 25) {
            s = stepAcousticSpool(s, 32.0, 30.0, 1.0)
            assertTrue(s.n1 >= 32.0 - 1e-9)
        }
        assertTrue(s.n1 < 36.0)
    }

    @Test fun smallTimeStepGivesSmallChange() {
        val s0 = stepAcousticSpool(newAcousticSpool(), 50.0, 50.0, 0.0)
        val s1 = stepAcousticSpool(s0, 90.0, 90.0, 0.001)
        assertTrue(Math.abs(s1.n1 - s0.n1) < 0.1)
    }

    @Test fun timeStepIsClampedToOneSecond() {
        val s0 = stepAcousticSpool(newAcousticSpool(), 50.0, 50.0, 0.0)
        val big = stepAcousticSpool(s0, 90.0, 90.0, 5.0)
        val one = stepAcousticSpool(s0, 90.0, 90.0, 1.0)
        assertEquals(one.n1, big.n1, 1e-9)
    }
}
