package com.oersted.trainer.sim

import com.oersted.trainer.sim.FlowWires.Pt
import com.oersted.trainer.sim.FlowWires.Rect
import com.oersted.trainer.sim.FlowWires.Tone
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AirCondFlowWiresTest {
    private fun flags(flow: Boolean = false, tf: Boolean = false, hot: Boolean = false, man: Boolean = false, purge: Boolean = false, any: Boolean = false) =
        AirCondFlowWires.Flags(flow, false, tf, false, purge, false, hot, false, 0.0, 0.0, man, false, false, false, false, false, any)

    /** Left pack: HOT column on the left (x 0..90), MID (110..190), COOL (210..300). */
    private val geo = mapOf(
        "acl-man" to Rect(0.0, 300.0, 0.0, 20.0),
        "acl-cln" to Rect(110.0, 190.0, 30.0, 50.0),
        "acl-purge" to Rect(210.0, 300.0, 30.0, 50.0),
        "acl-pv" to Rect(110.0, 190.0, 60.0, 80.0),
        "acl-hot" to Rect(0.0, 90.0, 60.0, 80.0),
        "acl-phx" to Rect(110.0, 190.0, 90.0, 110.0),
        "acl-ram" to Rect(210.0, 300.0, 90.0, 170.0),
        "acl-hchk" to Rect(0.0, 90.0, 200.0, 220.0),
        "acl-tfv" to Rect(210.0, 300.0, 180.0, 200.0),
    )

    private fun find(w: List<FlowWires.Wire>, first: Pt, last: Pt? = null) = w.first { it.pts.first() == first && (last == null || it.pts.last() == last) }

    @Test fun emptyGeometryGivesNoWires() {
        assertTrue(AirCondFlowWires.wires(emptyMap(), flags()).isEmpty())
    }

    @Test fun manifoldDropsStraightIntoCleanerAndCleanerPurgeIsHorizontal() {
        val w = AirCondFlowWires.wires(geo, flags(man = true, purge = true))
        val d = find(w, Pt(150.0, 20.0))
        assertEquals(listOf(Pt(150.0, 20.0), Pt(150.0, 30.0)), d.pts)
        assertEquals(Tone.GROUND, d.tone)
        assertTrue(d.active)
        val p = find(w, Pt(190.0, 40.0))
        assertEquals(listOf(Pt(190.0, 40.0), Pt(210.0, 40.0)), p.pts)
        assertEquals(Tone.STANDBY, p.tone)
        assertTrue(p.active)
        assertFalse(find(AirCondFlowWires.wires(geo, flags()), Pt(190.0, 40.0)).active)
    }

    @Test fun hotDuctToHotCheckRunsInTheOuterLaneOfTheLeftPack() {
        val w = AirCondFlowWires.wires(geo, flags(hot = true))
        val lane = find(w, Pt(0.0, 74.0))
        assertEquals(listOf(Pt(0.0, 74.0), Pt(-10.0, 74.0), Pt(-10.0, 210.0), Pt(0.0, 210.0)), lane.pts)
        assertTrue(lane.active)
    }

    @Test fun turbofanLaneRunsOutsideTheCoolSideAndRamMeetsExchangerRow() {
        val w = AirCondFlowWires.wires(geo, flags(flow = true, tf = true))
        val lane = find(w, Pt(300.0, 10.0))
        assertEquals(listOf(Pt(300.0, 10.0), Pt(310.0, 10.0), Pt(310.0, 190.0), Pt(300.0, 190.0)), lane.pts)
        assertTrue(lane.active)
        val ram = find(w, Pt(190.0, 100.0))
        assertEquals(listOf(Pt(190.0, 100.0), Pt(210.0, 100.0)), ram.pts)   // horizontal at the exchanger's row, into the tall ram node
        assertTrue(ram.active)
    }

    @Test fun distributionDropJogsWhenColumnsDoNotOverlapAtTheClampedX() {
        val g = mapOf("acl-out" to Rect(100.0, 200.0, 300.0, 320.0), "ac-lcold" to Rect(0.0, 100.0, 340.0, 360.0))
        val w = AirCondFlowWires.wires(g, flags(flow = true))
        assertEquals(1, w.size)
        assertEquals(listOf(Pt(106.0, 320.0), Pt(106.0, 330.0), Pt(50.0, 330.0), Pt(50.0, 340.0)), w[0].pts)
        assertTrue(w[0].active)
    }

    @Test fun distributionDropIsStraightWhenAligned() {
        val g = mapOf("ac-maindist" to Rect(0.0, 200.0, 0.0, 20.0), "ac-distf" to Rect(0.0, 100.0, 40.0, 60.0))
        val w = AirCondFlowWires.wires(g, flags(any = true))
        assertEquals(1, w.size)
        assertEquals(listOf(Pt(50.0, 20.0), Pt(50.0, 40.0)), w[0].pts)
    }

    @Test fun cabinWiresConnectEveryNode() {
        val g = mapOf(
            "cp-in" to Rect(0.0, 100.0, 0.0, 20.0), "cp-cab" to Rect(0.0, 100.0, 30.0, 50.0), "cp-ctl" to Rect(0.0, 30.0, 60.0, 80.0),
            "cp-out" to Rect(35.0, 65.0, 60.0, 80.0), "cp-rel" to Rect(70.0, 100.0, 60.0, 80.0), "cp-ind" to Rect(0.0, 30.0, 90.0, 100.0),
            "cp-ovb" to Rect(0.0, 100.0, 110.0, 120.0),
        )
        val w = CabinFlowWires.wires(g, CabinFlowWires.Flags(inflow = true, outOpen = true, relOpen = false, ctlOn = true))
        assertEquals(8, w.size)
        assertEquals(listOf(Pt(50.0, 20.0), Pt(50.0, 30.0)), find(w, Pt(50.0, 20.0)).pts)
        assertEquals(Tone.STANDBY, find(w, Pt(15.0, 50.0)).tone)
        assertEquals(listOf(Pt(30.0, 70.0), Pt(35.0, 70.0)), find(w, Pt(30.0, 70.0)).pts)
        assertEquals(listOf(Pt(50.0, 80.0), Pt(50.0, 110.0)), find(w, Pt(50.0, 80.0)).pts)
        val relief = find(w, Pt(85.0, 50.0))
        assertFalse(relief.active)
        assertTrue(find(w, Pt(50.0, 50.0)).active)   // cabin → outflow valve
    }
}
