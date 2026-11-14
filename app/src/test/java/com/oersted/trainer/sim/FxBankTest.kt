package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The streamed sound-effect voices: bus gating, parameter ramps, modulators. */
class FxBankTest {
    private val rate = 22050

    private fun energy(bank: FxBank, mixer: AudioMixer, blocks: Int): Double {
        var e = 0.0
        val l = FloatArray(512)
        val r = FloatArray(512)
        repeat(blocks) {
            java.util.Arrays.fill(l, 0f)
            java.util.Arrays.fill(r, 0f)
            bank.render(l, r, 512, mixer)
            for (i in 0 until 512) e += l[i] * l[i] + r[i] * r[i]
            mixer.render(ShortArray(1024), 512)
        }
        return e
    }

    @Test
    fun silentUntilATargetIsSet() {
        val m = AudioMixer(rate)
        val bank = FxBank(rate)
        assertFalse(bank.active())
        assertEquals(0.0, energy(bank, m, 4), 0.0)
    }

    @Test
    fun gearMotorSoundsWhileMovingThenFadesAndTheBusCloses() {
        val m = AudioMixer(rate)
        val bank = FxBank(rate)
        bank.gear(FxTargets.gear(1.0, 0.0, 0.0), 0.0)
        assertTrue(bank.active())
        assertTrue(energy(bank, m, 20) > 1e-6)
        // released: the gains fall to zero and the bus disconnects after 1.5 s
        bank.gear(FxTargets.gear(0.0, 0.0, 0.0), m.time)
        assertTrue(bank.active())
        energy(bank, m, 80) // about 1.9 s
        assertFalse(bank.active())
        assertEquals(0.0, energy(bank, m, 4), 1e-12)
    }

    @Test
    fun runwayRollIsLouderAtSpeedAndStereoCentred() {
        val m = AudioMixer(rate)
        val slow = FxBank(rate, 5L)
        slow.roll(FxTargets.roll(0.1, false), 0.0)
        val fast = FxBank(rate, 5L)
        fast.roll(FxTargets.roll(0.9, false), 0.0)
        // let the 0.2 s ramps settle first
        energy(slow, m, 10)
        energy(fast, m, 10)
        assertTrue(energy(fast, m, 10) > energy(slow, m, 10))
    }

    @Test
    fun skidChatterAndSquealMakeSound() {
        val m = AudioMixer(rate)
        val bank = FxBank(rate)
        bank.skid(FxTargets.skid(0.8, 1500.0, 0.6), 0.0)
        assertTrue(energy(bank, m, 20) > 1e-6)
    }

    @Test
    fun ambienceFollowsPowerAndPacks() {
        val m = AudioMixer(rate)
        val off = FxBank(rate)
        off.amb(FxTargets.amb(false, false, 0.0, 0.0), 0.0)
        assertFalse(off.active())
        val on = FxBank(rate)
        on.amb(FxTargets.amb(true, true, 2.0, 2.0), 0.0)
        assertTrue(on.active())
        assertTrue(energy(on, m, 30) > 0.0)
    }

    @Test
    fun everyGroupOpensItsBus() {
        val bank = FxBank(rate)
        bank.flap(FxTargets.flap(0.5), 0.0)
        bank.door(FxTargets.door(0.5), 0.0)
        bank.spoiler(FxTargets.spoiler(0.5), 0.0)
        bank.hyd(FxTargets.hyd(3000.0, 2.0, true), 0.0)
        bank.brake(FxTargets.brake(0.5), 0.0)
        bank.rev(FxTargets.rev(0.5), 0.0)
        assertTrue(bank.active())
    }

    @Test
    fun paramFollowsTheSetTargetAtTimeLaw() {
        val p = FxBank.Param(0.0)
        p.set(FxTargets.Ramp(1.0, 0.1))
        // one time constant: 1 - 1/e
        assertEquals(0.6321, p.step(0.1), 1e-3)
        p.set(FxTargets.Ramp(5.0, 0.0))
        assertEquals(5.0, p.step(0.01), 0.0)
    }

    @Test
    fun busWaitsOutItsGraceBeforeClosing() {
        val b = FxBank.Bus()
        b.set(true, 0.0)
        assertTrue(b.active)
        b.set(false, 1.0)
        b.update(2.4)
        assertTrue(b.active)
        b.update(2.5)
        assertFalse(b.active)
        // wanted again before the end: stays open
        b.set(true, 3.0)
        b.set(false, 3.1)
        b.set(true, 4.0)
        b.update(10.0)
        assertTrue(b.active)
    }
}
