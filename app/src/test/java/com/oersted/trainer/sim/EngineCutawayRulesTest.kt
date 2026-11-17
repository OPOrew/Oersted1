package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class EngineCutawayRulesTest {
    private val R = EngineCutawayRules

    @Test
    fun visualRateIsCapped() {
        assertEquals(0.0, R.visualRate(0.4), 0.0)
        assertEquals(0.06 + 50 * 0.0065, R.visualRate(50.0), 1e-12)
        assertEquals(0.6, R.visualRate(100.0), 0.0)
    }

    @Test
    fun stagesAndBands() {
        assertEquals(15, R.STAGES.size)
        assertEquals("lpc0", R.STAGES[0].key)
        assertEquals(26, R.STAGES[0].n)
        val hpc3 = R.STAGES.first { it.key == "hpc3" }
        assertEquals(38, hpc3.n)
        assertEquals(13.0 - 3 * 0.6, hpc3.h, 1e-12)
        assertEquals(1, R.STAGES.first { it.key == "lpt3" }.spool)
        assertEquals(2, R.STAGES.first { it.key == "hpt" }.spool)
        assertEquals(7, R.BANDS.size)
        assertEquals(13, R.RINGS.size)
    }

    @Test
    fun outlines() {
        val pts = R.bandPoints(R.BANDS[0])
        assertEquals(30, pts.size)
        assertEquals(252.0, pts[0][0], 1e-9)
        assertEquals(261.0 - 80.0, pts[0][1], 1e-9)
        assertEquals(17, R.ringPoints(278.0, 261.0, 80.0).size)
    }

    @Test
    fun bladesSplitFarAndNear() {
        val b = R.bladeQuads(R.STAGES[0], 0.0)
        assertEquals(13, b.far.size)
        assertEquals(13, b.near.sumOf { it.size })
        assertEquals(26, b.far.size + b.near.sumOf { it.size })
        assertEquals(8, b.far[0].size)
    }

    @Test
    fun keysAndSlots() {
        assertEquals(5, R.keyLines(R.BANDS[0], 0.0, 0.0).size)
        val k = R.keyLines(R.BANDS[0], 0.0, 1.3)
        assertEquals(k[0][1], 261.0 + 1.3, 1e-9)
        val slots = R.slotEllipses(R.BANDS[1], 0.0)
        assertEquals(3, slots.size)
        assertEquals(3.6, slots[0][3], 1e-12)
        assertEquals(17.0, slots[0][2], 0.0)
    }

    @Test
    fun fan() {
        val t = R.fanTriangles()
        assertEquals(18, t.size)
        assertEquals(190.0, t[0][2], 1e-9)
        assertEquals(0.0, t[0][3], 1e-9)
        val w = 2 * Math.PI / 18 * 0.42
        assertEquals(190.0 * Math.cos(w), t[0][4], 1e-9)
    }

    @Test
    fun liveValues() {
        assertEquals(0.0, R.heat(60.0), 0.0)
        assertEquals(0.5, R.heat(270.0), 1e-12)
        assertEquals(1.0, R.heat(900.0), 0.0)
        assertEquals(0.55, R.fanOpacity(12.0), 1e-12)
        assertEquals(0.275, R.fanOpacity(6.0), 1e-12)
        assertEquals(0.0, R.plume(false, false, 60.0), 0.0)
        assertEquals(0.25, R.plume(true, false, 60.0), 1e-12)
        assertEquals(1.0, R.plume(false, true, 480.0), 0.0)
        assertEquals(0.6, R.plume(false, false, 480.0), 1e-12)
        assertEquals(0.9, R.burnOpacity(480.0, 0.0), 1e-12)
        assertEquals(0.95, R.sparkOpacity(true, 100.0, 38 * Math.PI / 2), 0.0)
        assertEquals(0.15, R.sparkOpacity(true, 100.0, 0.0), 0.0)
        assertEquals(0.0, R.sparkOpacity(false, 100.0, 38 * Math.PI / 2), 0.0)
        assertEquals(0.0, R.sparkOpacity(true, 200.0, 38 * Math.PI / 2), 0.0)
    }

    @Test
    fun descriptionAndTags() {
        assertEquals("Engine 1 cutaway: N1 50%, N2 61%, EGT 300 degrees C, running", R.description(1, 49.6, 60.5, 300.2, true))
        assertEquals("Engine 2 cutaway: N1 0%, N2 0%, EGT 12 degrees C", R.description(2, 0.0, 0.0, 12.0, false))
        val tags = R.tags(10.4, 20.5, 451.0, true, false)
        assertEquals(7, tags.size)
        assertEquals("N1 10%", tags[0].value)
        assertEquals("N2 21%", tags[2].value)
        assertEquals(1, tags[3].tone)
        assertEquals("AIR ON", tags[5].value)
        assertEquals(3, tags[5].tone)
        assertEquals("NO FUEL", tags[6].label)
        assertNull(tags[6].value)
        assertEquals("OFF", R.tags(0.0, 0.0, 12.0, false, true)[5].value)
        assertEquals("FUEL / IGN", R.tags(0.0, 0.0, 12.0, false, true)[6].label)
    }
}
