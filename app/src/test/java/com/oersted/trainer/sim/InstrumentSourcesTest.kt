package com.oersted.trainer.sim

import com.oersted.trainer.sim.InstrumentSources.CompassSync
import com.oersted.trainer.sim.InstrumentSources.ERECT_ERECTED
import com.oersted.trainer.sim.InstrumentSources.ERECT_ERECTING
import com.oersted.trainer.sim.InstrumentSources.ERECT_OFF
import com.oersted.trainer.sim.InstrumentSources.ErectTimers
import com.oersted.trainer.sim.InstrumentSources.resolveInstrumentSources
import com.oersted.trainer.sim.InstrumentSources.stepErect
import com.oersted.trainer.sim.Sources
import com.oersted.trainer.sim.Sources.NO_SRC_FAIL
import com.oersted.trainer.sim.Sources.SourceSelect
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class InstrumentSourcesTest {
    private val normal = SourceSelect(navSel = 1, compSel = 1, gyroSel = 1)
    private val erected = ErectTimers(-1.0, -1.0, -1.0)

    private fun resolve(
        dc: Boolean = true,
        ac: Boolean = true,
        fail: Sources.SrcFail = NO_SRC_FAIL,
        sel: SourceSelect = normal,
        timers: ErectTimers = erected,
        pitchRate: Double = 0.0,
        sync: CompassSync = CompassSync(),
    ) = resolveInstrumentSources(
        truePitch = 5.0, trueRoll = 2.0, trueHdg = 90.0,
        acPower = ac, dcPower = dc, srcFail = fail, srcPower = InstrumentSources.DEFAULT_SRC_POWER,
        sel = sel, erectTimers = timers, pitchRate = pitchRate, compSyncFlag = sync,
    )

    @Test fun stepErectSequence() {
        assertTrue(stepErect(ERECT_OFF, powered = false, failed = false, fast = false, dtSec = 0.1, erectTimer = 0.0).erect == ERECT_OFF)
        val first = stepErect(ERECT_OFF, true, false, false, 0.1, 0.0)
        assertTrue(first.erect == ERECT_ERECTING && first.timer > 0.09)
        assertTrue(stepErect(ERECT_ERECTING, true, false, false, 0.1, 59.95).erect == ERECT_ERECTED)
        assertTrue(stepErect(ERECT_ERECTED, true, false, false, 0.1, 0.0).erect == ERECT_ERECTED)
    }

    @Test fun cutoutHoldsAndForcedReerectRestarts() {
        val held = stepErect(ERECT_ERECTING, true, false, false, 0.1, 5.0, cutout = true)
        assertTrue(held.erect == ERECT_ERECTING && held.timer == 5.0)
        val reerect = stepErect(ERECT_ERECTED, true, false, false, 0.1, 0.0, forceReerect = true)
        assertTrue(reerect.erect == ERECT_ERECTING && reerect.timer == 0.0)
    }

    @Test fun fastErectTakesTwoAndAHalfSeconds() {
        assertTrue(stepErect(ERECT_ERECTING, true, false, fast = true, dtSec = 2.5, erectTimer = 0.0).erect == ERECT_ERECTED)
        assertTrue(stepErect(ERECT_ERECTING, true, false, fast = false, dtSec = 2.5, erectTimer = 0.0).erect == ERECT_ERECTING)
    }

    @Test fun erectedGyroIsValidNearTruePitch() {
        val r = resolve()
        assertTrue(r.gyros.gyro1.valid)
        assertEquals(5.0, r.gyros.gyro1.pitch, 0.01)
        assertTrue(r.capt.attValid && r.capt.hdgValid)
        assertEquals(90.0, r.capt.hdg, 1e-9)
    }

    @Test fun failedGyroInvalidatesSelectedSide() {
        val r = resolve(fail = NO_SRC_FAIL.copy(gyro1 = true))
        assertTrue(r.gyros.gyro1.failed && !r.gyros.gyro1.valid)
        assertTrue(!r.capt.attValid)
        assertTrue(r.fo.attValid) // fo uses gyro 2
    }

    @Test fun auxGyroSelectionUsesAuxBias() {
        val r = resolve(sel = normal.copy(gyroSel = 0))
        assertTrue(r.capt.attValid)
        assertEquals(5.4, r.capt.pitch, 0.01)
    }

    @Test fun powerLossDropsGyroAndRadio() {
        val r = resolve(dc = false)
        assertTrue(!r.gyros.gyro1.powered && !r.gyros.gyro1.valid)
        assertEquals(0, r.gyros.gyro1.erect)
        assertTrue(!r.radioPower.nav1Vor)
    }

    @Test fun tumbleFreezesGyro() {
        val r = resolve(pitchRate = 50.0)
        assertTrue(r.gyros.gyro1.tumbled && !r.gyros.gyro1.valid)
        assertTrue(r.gyros.gyro1.frozen)
    }

    @Test fun unerectedGyroStartsErecting() {
        val r = resolve(timers = ErectTimers(0.0, 0.0, 0.0))
        assertTrue(r.gyros.gyro1.erect == ERECT_ERECTING && !r.gyros.gyro1.valid)
    }

    @Test fun compassSyncInvalidatesButKeepsHeading() {
        val r = resolve(sync = CompassSync(c1 = true))
        assertTrue(!r.compass.comp1.valid)
        assertEquals(90.0, r.compass.comp1.hdg, 1e-9)
        assertTrue(!r.capt.hdgValid)
    }
}
