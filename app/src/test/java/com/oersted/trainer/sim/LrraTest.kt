package com.oersted.trainer.sim

import com.oersted.trainer.sim.Lrra.resolveLrra
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LrraTest {
    private fun res(
        agl: Double?,
        vs: Double = 0.0,
        dc: Boolean = true,
        cb1: Boolean = true,
        cb2: Boolean = true,
        fail1: Boolean = false,
        fail2: Boolean = false,
        test1: Boolean = false,
        test2: Boolean = false,
    ) = resolveLrra(agl, vs, dc, cb1, cb2, fail1, fail2, 200.0, 200.0, test1, test2)

    @Test fun channelOneSubtractsAntennaOffset() {
        val r = res(100.0)
        assertTrue(r.ch1.valid)
        assertEquals(93.0, r.ch1.heightFt!!, 1e-9)
        assertTrue(r.ch1.dhLight) // 93 <= 200
    }

    @Test fun channelTwoHasDualBias() {
        val r = res(100.0)
        assertEquals(96.0, r.ch2.heightFt!!, 1e-9)
    }

    @Test fun roundsHalfUp() {
        assertEquals(43.0, res(50.4).ch1.heightFt!!, 1e-9)
        assertEquals(44.0, res(50.6).ch1.heightFt!!, 1e-9)
    }

    @Test fun dhLightOnlyAtOrBelowDh() {
        val r = resolveLrra(100.0, 0.0, true, true, true, false, false, 50.0, 50.0)
        assertTrue(!r.ch1.dhLight) // 93 > 50
    }

    @Test fun rateBlanksAboveSixThousandFpm() {
        val r = res(100.0, vs = 7000.0)
        assertTrue(!r.ch1.valid && r.ch1.heightFt == null)
        assertTrue(!r.ch2.valid)
    }

    @Test fun outOfRangeAndMissingInvalid() {
        assertTrue(!res(3000.0).ch1.valid)
        assertTrue(res(null).ch1.heightFt == null)
        assertTrue(!res(Double.NaN).ch1.valid)
    }

    @Test fun failureAndPowerLoss() {
        val failed = res(100.0, fail1 = true)
        assertTrue(failed.ch1.powered && !failed.ch1.valid)
        val dead = res(100.0, dc = false)
        assertTrue(!dead.ch1.powered && !dead.ch1.valid && !dead.ch2.powered)
    }

    @Test fun selfTestShowsOneHundredFeet() {
        val r = res(null, test1 = true)
        assertEquals(100.0, r.ch1.heightFt!!, 1e-9)
        assertTrue(r.ch1.testing && r.ch1.valid)
        assertTrue(r.ch1.dhLight) // 100 <= 200
    }
}
