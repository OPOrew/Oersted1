package com.oersted.trainer.sim

import com.oersted.trainer.sim.ApuDiagramRules as R
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ApuDiagramRulesTest {
    @Test fun visualRateIsZeroBelowHalfPercentAndCapped() {
        assertEquals(0.0, R.visualRate(0.4), 0.0)
        assertEquals(0.05 + 50 * 0.0065, R.visualRate(50.0), 1e-9)
        assertEquals(0.6, R.visualRate(100.0), 1e-9)
    }

    @Test fun bladesBehindTheHubAreHidden() {
        val lc = R.ROTORS[0]
        val q = R.bladeQuads(lc, 0.0)
        val expected = (0 until lc.n).count { Math.cos(lc.phase + it * R.TAU / lc.n) > 0.02 }
        assertEquals(expected, q.size)
        assertTrue(q.size in 1 until lc.n)
        // first drawn blade at phi=0: i=0 has theta=0.1 -> cos>0.02
        val th = 0.1; val beta = 28 * Math.PI / 180; val hc = 11.0
        val dx = hc * Math.cos(beta); val tr = hc * Math.sin(beta) * Math.cos(th)
        val ry = R.AXIS_Y + 26 * Math.sin(th)
        assertEquals(468 + dx, q[0][0], 1e-9); assertEquals(ry + tr, q[0][1], 1e-9)
        assertEquals(468 - dx * 0.7, q[0][4], 1e-9)
        assertEquals(R.AXIS_Y + 78 * Math.sin(th) - tr * 0.7, q[0][5], 1e-9)
    }

    @Test fun shaftSpokesAndRotorsTurnWithPhase() {
        val a = R.shaftLines(0.0, 0.0)
        assertTrue(a.size in 1..6)
        assertEquals(R.AXIS_Y + 8 * Math.sin(0.0), a[0], 1e-9)       // k=0: cos 0 = 1 >= 0.15
        assertEquals(R.AXIS_Y + 8 * Math.sin(0.0) + 1.2, R.shaftLines(0.0, 1.2)[0], 1e-9)
        val sp = R.spokes(52.0, 271.0, 11.0, 4, 0.0)
        assertEquals(4, sp.size); assertEquals(63.0, sp[0][0], 1e-9); assertEquals(271.0, sp[0][1], 1e-9)
        assertEquals(52.0, sp[1][0], 1e-9); assertEquals(282.0, sp[1][1], 1e-9)
    }

    @Test fun derivedFlags() {
        val cold = R.view(0.0, 0.0, 0.0, 20.0, 0.0, true, false)
        assertEquals(0.0, cold.heat, 0.0); assertFalse(cold.airOn); assertFalse(cold.gasOn); assertFalse(cold.lightOff)
        assertEquals(R.AMBER, cold.doorTone)
        val starting = R.view(0.6, 0.5, 30.0, 150.0, 40.0, false, false)
        assertTrue(starting.lightOff); assertTrue(starting.airOn); assertTrue(starting.fuelMoving); assertFalse(starting.fuelOpen)
        assertEquals((150 - 60) / 260.0, starting.heat, 1e-9); assertEquals(0.4, starting.oil, 1e-9)
        assertTrue(starting.gasOn)
        val run = R.view(1.0, 1.0, 100.0, 600.0, 120.0, false, false)
        assertEquals(1.0, run.heat, 0.0); assertEquals(1.0, run.oil, 0.0); assertTrue(run.doorOpen); assertTrue(run.fuelOpen)
        assertFalse(run.lightOff); assertEquals(R.GREEN, run.doorTone)
        assertEquals(R.RED, R.view(0.5, 1.0, 0.0, 20.0, 0.0, false, true).doorTone)
    }

    @Test fun louvresAndGlow() {
        assertEquals(30.0, R.louvreHeight(0.0), 1e-9); assertEquals(0.0, R.louvreHeight(1.0), 1e-9)
        assertEquals(141.0, R.louvreCentre(0), 0.0); assertEquals(421.0, R.louvreCentre(8), 0.0)
        assertEquals(0.0, R.glowOpacity(0.0, 1234.0), 0.0)
        assertTrue(R.glowOpacity(1.0, 1000.0) in 0.7..1.0)
    }

    @Test fun animationStateAdvances() {
        val a = ApuAnimState()
        a.step(0.1, 0.0)
        assertEquals(0.0, a.phi, 0.0); assertEquals(0.0, a.dash, 0.0); assertEquals(3.0, a.flame, 1e-9)
        a.step(0.1, 100.0)
        assertEquals(0.6 * R.TAU * 0.1, a.phi, 1e-9)
        assertEquals((18 + 140) * 0.1, a.dash, 1e-9)
        assertTrue(a.gear < 0)
    }
}
