package com.oersted.trainer.sim

import com.oersted.trainer.sim.InstrumentSources.SrcPower
import com.oersted.trainer.sim.MainPanelRules as R
import com.oersted.trainer.sim.MipLocal.AttitudeSide
import com.oersted.trainer.sim.MipLocal.MipFail
import com.oersted.trainer.sim.Sources.SrcFail
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Pure rules of the main instrument panel (source transfers, flag sets, derived values, face scales). */
class MainPanelRulesTest {
    private val ok = AttitudeSide(0.0, 0.0, 0.0, attValid = true, hdgValid = true)
    private val normal = R.Display(1, null, 1, 1)

    @Test
    fun displayFollowsSwitchesUnlessTransferred() {
        assertEquals(R.Display(1, null, 1, 1), R.display("NORMAL", "NORMAL", 1, 1, 1))
        assertEquals(0, R.display("BOTH ON 1", "NORMAL", 2, 1, 1).navSel)
        assertEquals(2, R.display("BOTH ON 2", "NORMAL", 0, 1, 1).navSel)
        val l = R.display("NORMAL", "BOTH ON L", 2, 2, 2)
        assertEquals(0, l.efiSide!!)
        assertEquals(0, l.compSel)
        assertEquals(0, l.gyroSel)
        assertEquals(2, R.display("NORMAL", "BOTH ON R", 0, 0, 0).efiSide!!)
    }

    @Test
    fun irsNormalOverrideUsesTheSelectedSideSources() {
        val f = SrcFail(gyro1 = true, gyro2 = false, gyroAux = false, comp1 = false, comp2 = true, nav1 = false, nav2 = false)
        val left = R.sources(R.Display(1, 0, 0, 0), "NORMAL", f)
        assertTrue(left.capt.att && left.fo.att)
        assertFalse(left.capt.hdg || left.fo.hdg)
        val right = R.sources(R.Display(1, 2, 2, 2), "NORMAL", f)
        assertFalse(right.capt.att || right.fo.att)
        assertTrue(right.capt.hdg && right.fo.hdg)
        // without IRS NORMAL the plain source select applies: capt on gyro1 (failed), fo on gyro2 (ok)
        val plain = R.sources(R.Display(1, 0, 1, 1), "OFF", f)
        assertTrue(plain.capt.att)
        assertFalse(plain.fo.att)
    }

    @Test
    fun failFlagsCombineSourceBreakerAndValidity() {
        val src = Sources.sourcesOf(Sources.SourceSelect(1, 1, 1), Sources.NO_SRC_FAIL)
        val sp = SrcPower()
        val c = R.failCapt(MipFail(), src, sp, ok, normal)
        assertFalse(c.att || c.hdg || c.loc || c.gs || c.dme1 || c.dme2 || c.adf)
        // gyro 1 breaker open affects the captain, not the F/O
        val sp1 = sp.copy(gyro1Cb = false)
        assertTrue(R.failCapt(MipFail(), src, sp1, ok, normal).att)
        assertFalse(R.failFo(MipFail(), src, sp1, ok, normal).att)
        // an invalid attitude on the captain's side only
        val bad = ok.copy(attValid = false)
        assertTrue(R.failCapt(MipFail(), src, sp, bad, normal).att)
        assertFalse(R.failFo(MipFail(), src, sp, ok, normal).att)
        // NORMAL nav: the captain's LOC needs nav1Cb, the F/O's nav2Cb; BOTH ON 2 puts both on nav2Cb
        val spN = sp.copy(nav1Cb = false)
        assertTrue(R.failCapt(MipFail(), src, spN, ok, normal).loc)
        assertFalse(R.failFo(MipFail(), src, spN, ok, normal).loc)
        val both2 = R.Display(2, null, 1, 1)
        assertFalse(R.failCapt(MipFail(), src, spN, ok, both2).loc)
        assertTrue(R.failFo(MipFail(), src, sp.copy(nav2Cb = false), ok, both2).loc)
        // ADF fails only when both ADF breakers are open
        assertFalse(R.failCapt(MipFail(), src, sp.copy(adf1Cb = false), ok, normal).adf)
        assertTrue(R.failCapt(MipFail(), src, sp.copy(adf1Cb = false, adf2Cb = false), ok, normal).adf)
        // the injected failure carries through
        assertTrue(R.failFo(MipFail(vsi = true), src, sp, ok, normal).vsi)
    }

    @Test
    fun derivedValues() {
        assertEquals(250.0 * (1 + 10 * 0.016), R.tasKt(250.0, 10000.0), 1e-9)
        assertEquals(12.0, R.gsKt(true, 12.0, 300.0), 0.0)
        assertEquals(300.0, R.gsKt(false, 12.0, 300.0), 0.0)
        assertEquals(0.0, R.ra(true, 50.0), 0.0)
        assertEquals(50.0, R.ra(false, 50.0), 0.0)
        assertEquals(9999.0, R.ra(false, null), 0.0)
        assertTrue(R.test(true, false, false, 2))
        assertFalse(R.test(false, true, true, 2))
        assertEquals(15.0, R.tatC(59.0), 1e-9)
        assertEquals(15.0, R.tatC(null), 1e-9)
        assertEquals("+15.0°C", R.tatText(true, 15.0))
        assertEquals("-5.0°C", R.tatText(true, -5.0))
        assertEquals("", R.tatText(false, 15.0))
        assertTrue(R.dhOn(false, true, false, 150.0, 200.0))
        assertFalse(R.dhOn(false, true, true, 150.0, 200.0))
        assertTrue(R.dhOn(true, false, true, 9999.0, 0.0))
        assertEquals(-1.0, R.heightFt(9999.0), 0.0)
        assertEquals(300.0, R.heightFt(300.0), 0.0)
        assertTrue(R.heightPowered(true, false, true, 10.0))
        assertFalse(R.heightPowered(true, false, true, null))
    }

    @Test
    fun dmeAndRmiSources() {
        val dme = MipLocal.DmeChannels(
            DmeModel.DmeChannelState(12.3, false, true, 0.0, 0.0, 12.3),
            DmeModel.DmeChannelState(null, false, false, 0.0, 0.0, null),
        )
        assertEquals(12.3, R.dmeDisplayNm(0, false, dme)!!, 0.0)
        assertTrue(R.dmeDisplayNm(1, false, dme) == null)
        assertTrue(R.dmeDisplayNm(0, true, dme) == null)
        assertEquals(-60.0, R.rmiBearing(0, true, true, 30.0, 90.0, 5.0)!!, 1e-9)
        assertEquals(5.0, R.rmiBearing(1, true, true, 30.0, 90.0, 5.0)!!, 0.0)
        assertEquals(5.0, R.rmiBearing(0, false, true, 30.0, 90.0, 5.0)!!, 0.0)
        assertTrue(R.rmiBearing(0, true, false, 30.0, 90.0, null) == null)
    }

    @Test
    fun lightingOverlay() {
        val dark = R.lightOverlay(false, 1.0, 1.0)
        assertEquals(0.0, dark.floodOuter, 0.0)
        assertEquals(0.42, dark.dark, 1e-9)
        val full = R.lightOverlay(true, 1.0, 1.0)
        assertEquals(0.28, full.floodOuter, 1e-9)
        assertEquals(0.1, full.floodMid, 1e-9)
        assertEquals(0.0, full.dark, 1e-9)
        assertEquals(0.21, R.lightOverlay(true, 0.5, 0.0).dark, 1e-9)
        assertEquals(0.42, R.lightOverlay(true, -3.0, 0.0).dark, 1e-9)
    }

    @Test
    fun asiScale() {
        assertEquals(-8.0, R.asiAng(0.0), 1e-9)
        assertEquals(0.0, R.asiAng(60.0), 1e-9)
        assertEquals(55.0, R.asiAng(100.0), 1e-9)
        assertEquals(40.0, R.asiAng(90.0), 1e-9)
        assertEquals(332.0, R.asiAng(400.0), 1e-9)
        assertEquals(332.0, R.asiAng(999.0), 1e-9)
        assertEquals(-4.0, R.asiAng(30.0), 1e-9)
    }

    @Test
    fun readoutText() {
        assertEquals(" 12.3", R.dmeText(12.34))
        assertEquals("  100", R.dmeText(100.0))
        assertEquals("  200", R.dmeText(500.0)) // 199.9 clamps, then toFixed(0) as in the web
        assertEquals("05000", R.altDigits(5000.0))
        assertEquals("00000", R.altDigits(-300.0))
        assertEquals("2992", R.hgText(29.92))
        assertEquals(".82", R.machText(0.82))
        assertTrue(R.machText(0.3) == null)
        assertEquals("+500", R.vsiText(500.0))
        assertEquals("-500", R.vsiText(-500.0))
        assertEquals("0", R.vsiText(0.0))
        assertEquals("360", R.hsiWindowDeg(0.0))
        assertEquals("090", R.hsiWindowDeg(90.0))
        assertEquals("05:07", R.elapsedText(307.0))
        assertEquals("003", R.pad(2.5, 3))
    }

    @Test
    fun altitudeHandsAndVsi() {
        val (tenK, k) = R.altHandAngles(5500.0)
        assertEquals(198.0, tenK, 1e-9)
        assertEquals(180.0, k, 1e-9)
        assertEquals(-90.0, R.vsiAngle(0.0), 1e-9)
        assertEquals(-2.0, R.vsiAngle(6000.0), 1e-9)
        assertEquals(-178.0, R.vsiAngle(-6000.0), 1e-9)
        assertEquals(-2.0, R.vsiAngle(9000.0), 1e-9)
    }

    @Test
    fun deviationScales() {
        assertEquals(2.4, R.adiLocX(10.0), 1e-9)
        assertEquals(-1.0, R.adiLocX(-1.25), 1e-9)
        assertEquals(1.0, R.adiGsY(0.35), 1e-9)
        assertEquals(0.5, R.hsiDev(true, 5.0, 0.0), 1e-9)
        assertEquals(1.0, R.hsiDev(false, 0.0, 2.5), 1e-9)
    }
}
