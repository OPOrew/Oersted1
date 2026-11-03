package com.oersted.trainer.sim

import com.oersted.trainer.sim.HfModel.IDLE_HF
import com.oersted.trainer.sim.HfModel.hfUsability
import com.oersted.trainer.sim.HfModel.stepHfChannel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class HfModelTest {
    @Test fun usabilityTableDayAndNight() {
        assertEquals(0, hfUsability(1000, true))
        assertEquals(0, hfUsability(30000, false))
        assertEquals(0, hfUsability(3000, true))
        assertEquals(2, hfUsability(3000, false))
        assertEquals(1, hfUsability(6000, true))
        assertEquals(2, hfUsability(10000, true))
        assertEquals(1, hfUsability(10000, false))
        assertEquals(2, hfUsability(15000, true))
        assertEquals(0, hfUsability(15000, false))
        assertEquals(1, hfUsability(25000, true))
        assertEquals(0, hfUsability(25000, false))
    }

    @Test fun unpoweredOrOffIsIdleAndUnusable() {
        val s = stepHfChannel(IDLE_HF, HfModel.MODE_USB, 8942, 5628, powered = false, retune = false, isDay = true, dtSec = 1.0)
        assertTrue(!s.powered && s.usability == 0 && !s.tuning)
        val off = stepHfChannel(IDLE_HF, HfModel.MODE_OFF, 8942, 5628, powered = true, retune = false, isDay = true, dtSec = 1.0)
        assertTrue(!off.powered)
    }

    @Test fun retuneRunsCouplerThenSettles() {
        val powered = IDLE_HF.copy(mode = HfModel.MODE_USB, powered = true)
        var s = stepHfChannel(powered, HfModel.MODE_USB, 5628, 8942, true, retune = true, isDay = true, dtSec = 1.0)
        assertTrue(s.tuning)
        assertEquals(1.0, s.tuneT, 1e-9)
        assertEquals(0, s.usability)
        repeat(3) { s = stepHfChannel(s, HfModel.MODE_USB, 5628, 8942, true, retune = false, isDay = true, dtSec = 1.0) }
        assertTrue(!s.tuning)
        assertEquals(3.5, s.tuneT, 1e-9)
        assertEquals(hfUsability(5628, true), s.usability)
    }

    @Test fun frequencyChangeStartsRetune() {
        val prev = IDLE_HF.copy(mode = HfModel.MODE_USB, powered = true)
        val s = stepHfChannel(prev, HfModel.MODE_USB, 8942, 5628, true, retune = false, isDay = false, dtSec = 0.5)
        assertTrue(s.tuning)
    }
}
