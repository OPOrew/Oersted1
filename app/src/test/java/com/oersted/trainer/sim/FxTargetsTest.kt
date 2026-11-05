package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FxTargetsTest {
    @Test fun gearBusAndRampsFollowHydraulicAndWind() {
        val g = FxTargets.gear(hyd = 1.0, free = 0.0, wind = 0.5)
        assertTrue(g.busOn)
        assertEquals(200.0, g.motorFreq.target, 1e-9)
        assertEquals(0.016, g.motorGain.target, 1e-9)
        assertEquals(0.1 * 0.7, g.rumbleGain.target, 1e-9)
        assertEquals(750.0, g.windFreq.target, 1e-9)
        assertEquals(0.06 * 0.5, g.windGain.target, 1e-9)
        assertEquals(0.15, g.windFreq.timeConstant, 0.0)
        assertFalse(FxTargets.gear(0.0, 0.0, 0.0).busOn)
    }

    @Test fun flapsMotorRisesWithLevel() {
        val f = FxTargets.flap(1.0)
        assertTrue(f.busOn)
        assertEquals(120.0, f.motorFreq.target, 1e-9)
        assertEquals(240.0, f.motor2Freq.target, 1e-9)
        assertEquals(0.045, f.whirGain.target, 1e-9)
        assertFalse(FxTargets.flap(0.005).busOn)
    }

    @Test fun doorAndSpoilerScaleWithLevel() {
        val d = FxTargets.door(0.5)
        assertEquals(0.006, d.motorGain.target, 1e-9)
        assertEquals(0.015, d.whirGain.target, 1e-9)
        val s = FxTargets.spoiler(1.0)
        assertTrue(s.busOn)
        assertEquals(0.07, s.hissGain.target, 1e-9)
        assertEquals(0.08, s.rumbleGain.target, 1e-9)
    }

    @Test fun hydraulicPumpsNeedPressureAndAPump() {
        val h = FxTargets.hyd(press = 3000.0, pumps = 1.0, elec = true)
        assertTrue(h.busOn)
        assertEquals(350.0, h.engFreq.target, 1e-9)
        assertEquals(0.012, h.engGain.target, 1e-9)
        assertEquals(0.007, h.elecGain.target, 1e-9)
        val low = FxTargets.hyd(press = 300.0, pumps = 1.0, elec = true)
        assertFalse(low.busOn)
        assertEquals(0.0, low.engGain.target, 0.0)
        val noElec = FxTargets.hyd(press = 3000.0, pumps = 1.0, elec = false)
        assertEquals(0.0, noElec.elecGain.target, 0.0)
    }

    @Test fun grassRollIsLouderAndDeeperThanRunway() {
        val runway = FxTargets.roll(r = 1.0, grass = false)
        val grass = FxTargets.roll(r = 1.0, grass = true)
        assertEquals(780.0, runway.rumbleFreq.target, 1e-9)
        assertEquals(390.0, grass.rumbleFreq.target, 1e-9)
        assertEquals(0.1, runway.rumbleGain.target, 1e-9)
        assertEquals(0.16 * 1.3, grass.rumbleGain.target, 1e-9)
        assertEquals(10.0, runway.bumpRate.target, 1e-9)
        assertEquals(6.0, grass.bumpRate.target, 1e-9)
        assertFalse(FxTargets.roll(0.004, false).busOn)
    }

    @Test fun skidSquealTracksPitchAndChatter() {
        val k = FxTargets.skid(squeal = 1.0, pitchHz = 1500.0, chatter = 0.0)
        assertTrue(k.busOn)
        assertEquals(1500.0, k.squealFreq.target, 1e-9)
        assertEquals(220.0, k.squealLfoDepth.target, 1e-9)
        assertEquals(0.0, k.chatterGain.target, 0.0)
        assertTrue(FxTargets.skid(0.0, 1300.0, 0.02).busOn)
    }

    @Test fun brakeGroanIsSquareOfPressure() {
        val b = FxTargets.brake(0.5)
        assertEquals(750.0, b.hissFreq.target, 1e-9)
        assertEquals(0.025, b.hissGain.target, 1e-9)
        assertEquals(0.014 * 0.25, b.groanGain.target, 1e-9)
    }

    @Test fun reverserRoarOpensWithLevel() {
        val r = FxTargets.rev(1.0)
        assertTrue(r.busOn)
        assertEquals(2000.0, r.roarFreq.target, 1e-9)
        assertEquals(0.2, r.roarGain.target, 1e-9)
        assertEquals(0.14, r.lowGain.target, 1e-9)
        assertFalse(FxTargets.rev(0.0).busOn)
    }

    @Test fun ambienceFollowsSystemsAndCapsFuelPumpGain() {
        val a = FxTargets.amb(ac = true, dc = false, packs = 2.0, fuel = 5.0)
        assertTrue(a.busOn)
        assertEquals(0.005, a.humGain.target, 0.0)
        assertEquals(0.0, a.fanGain.target, 0.0)
        assertEquals(0.022, a.packGain.target, 1e-9)
        assertEquals(0.004 + 0.006, a.fuelGain.target, 1e-9)
        assertFalse(FxTargets.amb(false, false, 0.0, 0.0).busOn)
    }

    @Test fun gateVoicesUseTheirOwnTimeConstants() {
        assertEquals(0.1, FxTargets.horn(true).second.target, 0.0)
        assertEquals(0.02, FxTargets.horn(true).second.timeConstant, 0.0)
        assertEquals(0.0, FxTargets.wailer(false).second.target, 0.0)
        assertEquals(0.17, FxTargets.clacker(true).second.target, 0.0)
        assertEquals(0.01, FxTargets.clacker(true).second.timeConstant, 0.0)
    }

    @Test fun shakerSpinsUpFromSlowAndCoastsDownToAFloor() {
        val up = FxTargets.shaker(on = true, currentRate = 0.9)
        assertTrue(up.busOn)
        assertEquals(0.35, up.enableGain.target, 0.0)
        assertEquals(0.5, up.rateRamp.start, 0.0)
        assertEquals(1.0, up.rateRamp.end, 0.0)
        assertEquals(0.45, up.rateRamp.durationS, 0.0)
        val down = FxTargets.shaker(on = false, currentRate = 0.4)
        assertFalse(down.busOn)
        assertEquals(0.6, down.rateRamp.start, 0.0)
        assertEquals(0.55, down.rateRamp.end, 0.0)
        assertEquals(0.4, down.rateRamp.durationS, 0.0)
        assertEquals(0.12, down.enableGain.timeConstant, 0.0)
    }
}
