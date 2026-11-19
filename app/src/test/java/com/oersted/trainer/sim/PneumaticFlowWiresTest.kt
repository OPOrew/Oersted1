package com.oersted.trainer.sim

import com.oersted.trainer.sim.FlowWires.Pt
import com.oersted.trainer.sim.FlowWires.Rect
import com.oersted.trainer.sim.FlowWires.Tone
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PneumaticFlowWiresTest {
    private fun flags(
        open1: Boolean = false, open2: Boolean = false, isoOpen: Boolean = false, apuOn: Boolean = false, groundOn: Boolean = false,
        packL: Boolean = false, leftLive: Boolean = false,
    ) = PneumaticFlowWires.Flags(
        run1 = open1, run2 = open2, open1 = open1, open2 = open2, trip1 = false, trip2 = false, bleed13_1 = false, bleed13_2 = false,
        leftLive = leftLive, rightLive = false, isoOpen = isoOpen, apuOn = apuOn, groundOn = groundOn, packL = packL, packR = false,
        turn1 = false, turn2 = false, prv1 = false, prv2 = false, ovr1 = false, ovr2 = false,
    )

    /** Centre column: manifolds at the sides, iso valve between them on the same row. */
    private val geo = mapOf(
        "pn-lm" to Rect(0.0, 100.0, 0.0, 40.0),
        "pn-iso" to Rect(110.0, 190.0, 10.0, 30.0),
        "pn-rm" to Rect(200.0, 300.0, 0.0, 40.0),
        "pn-gc" to Rect(110.0, 190.0, 50.0, 70.0),
        "pn-gk" to Rect(110.0, 190.0, 80.0, 100.0),
    )

    @Test fun emptyGeometryGivesNoWires() {
        assertTrue(PneumaticFlowWires.wires(emptyMap(), flags()).isEmpty())
    }

    @Test fun isolationClosedDrawsTwoDimStubsWithoutArrows() {
        val w = PneumaticFlowWires.wires(geo, flags()).filter { it.pts.first().y == 20.0 }
        assertEquals(2, w.size)
        assertTrue(w.all { !it.active && !it.arrow && it.tone == Tone.GROUND })
    }

    @Test fun isolationOpenLeftSourceFlowsLeftToRightInLeftTone() {
        val w = PneumaticFlowWires.wires(geo, flags(open1 = true, isoOpen = true)).filter { it.pts.first().y == 20.0 }
        assertEquals(2, w.size)
        assertTrue(w.all { it.active && it.arrow && it.tone == Tone.A })
        assertEquals(Pt(100.0, 20.0), w[0].pts.first())   // left manifold edge → iso
        assertEquals(Pt(110.0, 20.0), w[0].pts.last())
    }

    @Test fun groundCartFeedsRightManifoldAndFlowsRightToLeftInGroundTone() {
        val w = PneumaticFlowWires.wires(geo, flags(groundOn = true, isoOpen = true))
        val iso = w.filter { it.pts.first().y == 20.0 }
        assertTrue(iso.all { it.tone == Tone.GROUND && it.active })
        assertEquals(Pt(200.0, 20.0), iso[0].pts.first())   // right manifold → iso → left
        val gk = w.first { it.pts.first() == Pt(190.0, 90.0) }   // connector → right manifold
        assertEquals(Pt(200.0, 90.0), gk.pts.last())
        assertTrue(gk.active)
    }

    @Test fun isolationOpenWithNoSourceStaysDim() {
        val w = PneumaticFlowWires.wires(geo, flags(isoOpen = true)).filter { it.pts.first().y == 20.0 }
        assertTrue(w.all { !it.active && !it.arrow })
    }

    @Test fun apuChainWiredToLeftManifold() {
        val g = geo + mapOf(
            "pn-av" to Rect(110.0, 190.0, 110.0, 120.0), "pn-ad" to Rect(110.0, 190.0, 130.0, 140.0), "pn-ac" to Rect(110.0, 190.0, 150.0, 160.0),
        )
        val w = PneumaticFlowWires.wires(g, flags(apuOn = true))
        val last = w.first { it.pts.first() == Pt(110.0, 155.0) }
        assertEquals(Pt(100.0, 155.0), last.pts.last())
        assertEquals(Tone.STANDBY, last.tone)
        assertTrue(last.active)
        assertFalse(PneumaticFlowWires.wires(g, flags(apuOn = false)).first { it.pts.first() == Pt(110.0, 155.0) }.active)
    }

    @Test fun usersSpineAndPackElbowOnLeftSide() {
        // 2 columns x 3 rows of chips: left chips x 0..40, right chips x 60..100; spine at x = 50.
        val ids = (0..5).associate { i ->
            val col = i % 2; val row = i / 2
            "ul-$i" to Rect(col * 60.0, col * 60.0 + 40.0, 200.0 + row * 30.0, 220.0 + row * 30.0)
        }
        val g = geo + ids + ("pn-cab" to Rect(120.0, 180.0, 230.0, 250.0))
        val w = PneumaticFlowWires.wires(g, flags(leftLive = true, packL = true))
        val spine = w.first { !it.arrow && it.dots.isNotEmpty() }
        assertEquals(Pt(50.0, 40.0), spine.pts.first())          // from manifold bottom at the gutter centre
        assertEquals(5, spine.dots.size)                          // taps to all chips but the pack
        // left layout: pack = index 5 (right column, last row, cy 270); elbow runs to the cabin node's left edge at its centre height
        val elbow = w.first { it.pts.last() == Pt(120.0, 240.0) }
        assertEquals(listOf(Pt(100.0, 270.0), Pt(110.0, 270.0), Pt(110.0, 240.0), Pt(120.0, 240.0)), elbow.pts)
        assertTrue(elbow.active)
        // pack-valve (index 3) drops straight onto the pack (index 5), both in the right column
        val drop = w.first { it.pts.size == 2 && it.pts[0].x == 80.0 && it.pts[0].y == 250.0 }
        assertEquals(Pt(80.0, 260.0), drop.pts.last())
    }
}
