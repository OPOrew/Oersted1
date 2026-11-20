package com.oersted.trainer.sim

import com.oersted.trainer.sim.ExteriorLightsData as D
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ExteriorLightsDataTest {
    private fun light(id: String, lit: Boolean, level: Double = 1.0, reason: String = "", commanded: Double = 1.0) =
        LightStatus().apply { this.id = id; this.lit = lit; this.level = level; this.reason = reason; this.commanded = commanded; color = "white" }

    @Test fun viewTablesHaveTheExpectedMarkerCounts() {
        assertEquals(4, D.VIEWS.size)
        assertEquals(24, D.VIEWS.getValue("aerial").marks.size)
        assertEquals(17, D.VIEWS.getValue("side").marks.size)
        assertEquals(15, D.VIEWS.getValue("front").marks.size)
        assertEquals(9, D.VIEWS.getValue("rear").marks.size)
        assertEquals(listOf(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15), D.numbers(D.VIEWS.getValue("aerial")))
        assertTrue(D.VIEWS.values.all { v -> v.marks.all { D.NAMES.containsKey(it.n) } })
    }

    @Test fun lensShapesByLightType() {
        assertEquals(D.Lens("dome", 9.0, 6.0), D.lensFor("beacon-top"))
        assertEquals("rect", D.lensFor("ldg-fix-l").shape); assertEquals("rect", D.lensFor("taxi").shape)
        assertEquals("oval", D.lensFor("logo").shape); assertEquals(8.0, D.lensFor("emer-exit").h, 0.0)
        assertEquals("round", D.lensFor("strobe-t").shape)
    }

    @Test fun leaderStartsAtLensEdgeAndEndsShortOfBadge() {
        val mk = D.Mk(1, "beacon-top", 583.0, 339.0, 14.0, -12.0)
        val l = D.leader(mk)
        assertEquals(583 + 14 * 1.35, l.lx, 1e-9); assertEquals(339 - 12 * 1.35, l.ly, 1e-9)
        val len = Math.hypot(14 * 1.35, -12 * 1.35)
        assertEquals(583 + 14 * 1.35 / len * 6.5, l.sx, 1e-9)          // dome: max(rx 4.5, ry 3) + 2
        assertEquals(l.lx - 14 * 1.35 / len * 9, l.ex, 1e-9)
        val zero = D.leader(D.Mk(9, "wing", 10.0, 10.0, 0.0, 0.0))
        assertEquals(10.0, zero.lx, 0.0); assertEquals(10.0, zero.sx, 0.0)
    }

    @Test fun legendStatusText() {
        val v = D.VIEWS.getValue("aerial")
        val on = listOf(light("wing", true), light("beacon-top", false, reason = "NO AC", commanded = 1.0), light("pos-l", true, 0.5), light("strobe-l", false), light("strobe-r", false))
        assertEquals("LIT", D.statusText(D.rowStatus(v, 9, on)))
        assertEquals("NO AC", D.statusText(D.rowStatus(v, 1, on)))
        assertEquals("50%", D.statusText(D.rowStatus(v, 3, on)))
        assertEquals("OFF", D.statusText(D.rowStatus(v, 5, on)))
        val both = listOf(light("strobe-l", true), light("strobe-r", false))
        assertEquals("1/2 LIT", D.statusText(D.rowStatus(v, 5, both)))
        assertEquals("OFF", D.statusText(D.rowStatus(v, 11, emptyList())))
        // a reason only counts when the light was commanded on
        assertEquals("OFF", D.statusText(D.rowStatus(v, 1, listOf(light("beacon-top", false, reason = "CB OUT", commanded = 0.0)))))
    }

    @Test fun glowScalesWithLevel() {
        assertEquals(1.0, D.glowAlpha(1.0), 1e-9); assertEquals(0.45, D.glowAlpha(0.0), 1e-9)
        assertEquals(30.0, D.glowRadius(1.0), 1e-9); assertEquals(10.0, D.glowRadius(0.0), 1e-9)
    }

    @Test fun hitTestFindsMarkersAndBadges() {
        val v = D.VIEWS.getValue("rear")
        assertEquals(1, D.hitNumber(v, 583.0, 324.0))               // beacon lens
        assertEquals(15, D.hitNumber(v, 505.0, 410.0))
        assertEquals(null, D.hitNumber(v, 300.0, 100.0))
        val badge = D.leader(v.marks.first { it.n == 6 })
        assertEquals(6, D.hitNumber(v, badge.lx + 5, badge.ly))      // badge, away from the lens
    }
}
