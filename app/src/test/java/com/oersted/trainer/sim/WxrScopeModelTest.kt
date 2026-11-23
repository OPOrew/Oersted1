package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WxrScopeModelTest {
    private val M = WxrScopeModel
    private val nav0 = WxrWorld.WxrNav(0.0, 0.0, 0.0)

    @Test fun projectionAndLabels() {
        val ahead = M.pt(130.0, 0.0)
        assertEquals(100.0, ahead.first, 1e-9); assertEquals(16.0, ahead.second, 1e-9)
        val right = M.pt(130.0, 90.0)
        assertEquals(230.0, right.first, 1e-9); assertEquals(146.0, right.second, 1e-9)
        assertEquals("20", M.fmt(20.0)); assertEquals("2.5", M.fmt(2.5)); assertEquals("60", M.fmt(300.0 / 5))
        assertEquals(100.0, M.rangeNm(0), 0.0); assertEquals(25.0, M.rangeNm(2), 0.0); assertEquals(300.0, M.rangeNm(6), 0.0)
        assertEquals(40.0, M.halfAngle(true), 0.0); assertEquals(80.0, M.halfAngle(false), 0.0)
        assertEquals(0.35 + 0.6 * 0.65, M.intensity(0.6), 1e-12)
        assertEquals(2.1, M.period(true), 0.0); assertEquals(4.3, M.period(false), 0.0)
    }

    @Test fun warmUpIs70Seconds() {
        assertFalse(M.warm(0.0, 1e9))
        assertFalse(M.warm(1000.0, 70_999.0))
        assertTrue(M.warm(1000.0, 71_000.0))
    }

    @Test fun fieldText() {
        assertEquals("PUSH", M.field("PUSH", false, false))
        assertEquals("PUSH", M.field("PUSH", true, true))
        assertEquals("WAIT", M.field("WX", false, false))
        assertEquals("WAIT", M.field("STBY", false, true))
        assertEquals("STBY", M.field("STBY", true, true))
        assertEquals("TEST", M.field("WX", true, true))
        assertEquals("MAP", M.field("MAP", true, false))
    }

    @Test fun liveAndVariable() {
        assertTrue(M.live(true, true, "CYC")); assertFalse(M.live(true, true, "STBY")); assertFalse(M.live(false, true, "WX")); assertFalse(M.live(true, false, "WX"))
        assertTrue(M.variable(0.5, "WX", false)); assertTrue(M.variable(0.5, "MAP", false))
        assertFalse(M.variable(0.5, "CYC", false)); assertFalse(M.variable(0.02, "WX", false)); assertFalse(M.variable(0.5, "WX", true))
    }

    @Test fun relativeBearing() {
        assertEquals(0.0, M.rel(0.0, 10.0, 0.0), 1e-9)
        assertEquals(90.0, M.rel(10.0, 0.0, 0.0), 1e-9)
        assertEquals(-90.0, M.rel(10.0, 0.0, 180.0), 1e-9)
        assertEquals(10.0, M.rel(0.0, 10.0, 350.0), 1e-9)
    }

    @Test fun contourLevels() {
        assertEquals(3, M.shown(0.86)); assertEquals(2, M.shown(0.85)); assertEquals(2, M.shown(0.56)); assertEquals(1, M.shown(0.55)); assertEquals(1, M.shown(0.21)); assertEquals(0, M.shown(0.2))
    }

    @Test fun cellDrawsFollowRangeTiltAndHeading() {
        val cell = WxrWorld.WxCell(0.0, 40.0, 10.0, 2.0, 30.0)
        val d = M.cellDraws(listOf(cell), nav0, 50.0, 0.0, 20500.0, 0.0, "WX")
        assertEquals(1, d.size)
        val c = d[0]
        assertEquals(100.0, c.px, 1e-9)
        assertEquals(146.0 - 40.0 / 50.0 * 130.0, c.py, 1e-9)
        assertEquals(10.0 / 50.0 * 130.0 * 2.0, c.rx, 1e-9); assertEquals(10.0 / 50.0 * 130.0 / 2.0, c.ry, 1e-9)
        assertEquals(30.0, c.rot, 1e-9)
        // beyond 1.3 x range
        assertEquals(0, M.cellDraws(listOf(cell), nav0, 10.0, 0.0, 20500.0, 0.0, "WX").size)
        // beam far above the storm
        assertEquals(0, M.cellDraws(listOf(cell), nav0, 50.0, 0.0, 60000.0, 0.0, "WX").size)
        // heading rotates the cell
        assertEquals(30.0 - 90.0, M.cellDraws(listOf(WxrWorld.WxCell(40.0, 0.0, 10.0, 2.0, 30.0)), WxrWorld.WxrNav(0.0, 0.0, 90.0), 50.0, 0.0, 20500.0, 0.0, "WX")[0].rot, 1e-9)
    }

    @Test fun targetAlert() {
        val ahead = WxrWorld.WxCell(0.0, 100.0, 10.0, 1.0, 0.0)
        assertTrue(M.targetHit(true, true, false, listOf(ahead), nav0, 0.0, 20500.0))
        assertFalse(M.targetHit(true, false, false, listOf(ahead), nav0, 0.0, 20500.0))
        assertFalse(M.targetHit(true, true, true, listOf(ahead), nav0, 0.0, 20500.0))
        assertFalse(M.targetHit(false, true, false, listOf(ahead), nav0, 0.0, 20500.0))
        assertFalse(M.targetHit(true, true, false, listOf(WxrWorld.WxCell(0.0, 60.0, 10.0, 1.0, 0.0)), nav0, 0.0, 20500.0))
        assertFalse(M.targetHit(true, true, false, listOf(WxrWorld.WxCell(60.0, 100.0, 10.0, 1.0, 0.0)), nav0, 0.0, 20500.0))
    }

    @Test fun noiseSpecksStayInTheSector() {
        val full = M.noise(80.0, false, 0.0)
        assertEquals(70, full.size)
        assertEquals(-80.0 + 0.0, full[0].first, 1e-9)           // i = 0: azimuth -80
        assertEquals(4.0, full[0].second, 1e-9)
        assertEquals(-80.0 + 137.5, full[1].first, 1e-9)         // i = 1
        assertEquals(4.0 + 0.53 * 10, full[1].second, 1e-9)
        assertTrue(M.noise(40.0, false, 0.0).size < 70)
        assertTrue(M.noise(40.0, false, 0.0).all { kotlin.math.abs(it.first) <= 40.0 })
        assertEquals(4.0 + 0.53 * 26 * 3, M.noise(80.0, true, 1.0)[1].second, 1e-9)
    }

    @Test fun mapPointAndColors() {
        val p = M.mapPoint(0.0, 50.0, nav0, 100.0)
        assertEquals(100.0, p.first, 1e-9); assertEquals(146.0 - 65.0, p.second, 1e-9)
        assertEquals(listOf(0x3DDC84L, 0xF2D84AL, 0xFF3B30L), M.levelColors(false))
        assertEquals(listOf(0x35D0E0L, 0xF2D84AL, 0xE040C8L), M.levelColors(true))
    }
}
