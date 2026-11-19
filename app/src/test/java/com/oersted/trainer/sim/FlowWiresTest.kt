package com.oersted.trainer.sim

import com.oersted.trainer.sim.FlowWires.Cmd
import com.oersted.trainer.sim.FlowWires.Pt
import com.oersted.trainer.sim.FlowWires.Rect
import com.oersted.trainer.sim.FlowWires.Tone
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FlowWiresTest {
    private val flags = FlowWires.HydFlags(
        aLive = true, bLive = false, stbyLive = false, bleed1On = true, bleed2On = false, resAir = true, groundAirLive = false,
        groundServiceLive = false, groundPowerHydLive = false, interconnectActual = false,
        aP1 = true, aP2 = false, bP1 = false, bP2 = false, stbyPump = false, parkingBrakeSet = false,
    )

    @Test fun rectCentresAreMidpoints() {
        val r = Rect(10.0, 30.0, 100.0, 140.0)
        assertEquals(20.0, r.cx, 1e-9)
        assertEquals(120.0, r.cy, 1e-9)
    }

    @Test fun arrowHeadPointsAlongLastSegment() {
        val h = FlowWires.arrowHead(listOf(Pt(0.0, 0.0), Pt(0.0, 10.0)))!!
        assertEquals(Pt(0.0, 10.0), h[0])
        assertEquals(5.5, h[1].y, 1e-9)   // base is 4.5 back from the tip
        assertEquals(-h[1].x, h[2].x, 1e-9) // symmetric about the wire
    }

    @Test fun arrowHeadSkipsDegenerateTailAndHandlesSinglePoint() {
        val h = FlowWires.arrowHead(listOf(Pt(0.0, 0.0), Pt(10.0, 0.0), Pt(10.0, 0.0)))!!
        assertEquals(Pt(10.0, 0.0), h[0])
        assertNull(FlowWires.arrowHead(listOf(Pt(1.0, 1.0), Pt(1.0, 1.0))))
    }

    @Test fun emptyGeometryGivesNoWires() {
        assertTrue(FlowWires.hydraulic(emptyMap(), flags).isEmpty())
    }

    @Test fun supplyChainDropsConnectReservoirPumpAndModuleWithPerPumpLiveness() {
        val geo = mapOf(
            "b-res" to Rect(0.0, 100.0, 0.0, 20.0),
            "b-p1" to Rect(0.0, 40.0, 40.0, 60.0),
            "b-p2" to Rect(60.0, 100.0, 40.0, 60.0),
            "b-mod" to Rect(0.0, 100.0, 80.0, 100.0),
            "b-users" to Rect(0.0, 100.0, 120.0, 160.0),
            "b-u0" to Rect(0.0, 40.0, 120.0, 140.0),
        )
        val wires = FlowWires.hydraulic(geo, flags.copy(bP1 = true))
        val drops = wires.filter { it.tone == Tone.B && it.pts.size == 2 && it.pts[0].x == it.pts[1].x && it.pts[0].y < 100 }
        // res→p1, p1→mod, res→p2, p2→mod
        assertEquals(4, drops.size)
        assertEquals(2, drops.count { it.active })
        assertEquals(20.0, drops[0].pts[0].y, 1e-9)
        assertEquals(40.0, drops[0].pts[1].y, 1e-9)
    }

    @Test fun userSpineHasADotPerUserAndNoArrow() {
        val geo = mapOf(
            "s-res" to Rect(0.0, 100.0, 0.0, 20.0), "s-pump" to Rect(0.0, 100.0, 30.0, 50.0), "s-mod" to Rect(0.0, 100.0, 60.0, 80.0),
            "s-users" to Rect(0.0, 100.0, 100.0, 120.0),
            "s-u0" to Rect(0.0, 40.0, 100.0, 120.0), "s-u1" to Rect(60.0, 100.0, 100.0, 120.0),
        )
        val spine = FlowWires.hydraulic(geo, flags.copy(stbyLive = true)).first { !it.arrow && it.dots.size == 2 }
        assertEquals(50.0, spine.pts[2].x, 1e-9)        // gutter between the two chips
        assertEquals(listOf(Pt(50.0, 110.0), Pt(50.0, 110.0)), spine.dots)
    }

    @Test fun horizontalRunHopsOverCrossingVerticalWire() {
        val h = listOf(Pt(0.0, 50.0), Pt(100.0, 50.0))
        val v = listOf(Pt(40.0, 0.0), Pt(40.0, 100.0))
        val cmds = FlowWires.pathCmds(h, listOf(v))
        assertEquals(Cmd.Move(0.0, 50.0), cmds[0])
        assertEquals(Cmd.Line(37.0, 50.0), cmds[1])
        assertEquals(Cmd.Hop(43.0, 50.0, 3.0, 1), cmds[2])
        assertEquals(Cmd.Line(100.0, 50.0), cmds[3])
    }

    @Test fun rightToLeftHopUsesNegativeDirection() {
        val cmds = FlowWires.pathCmds(listOf(Pt(100.0, 50.0), Pt(0.0, 50.0)), listOf(listOf(Pt(40.0, 0.0), Pt(40.0, 100.0))))
        assertEquals(Cmd.Line(43.0, 50.0), cmds[1])
        assertEquals(Cmd.Hop(37.0, 50.0, 3.0, -1), cmds[2])
    }

    @Test fun noHopNearEndsOrForEndpointsOnTheCrossing() {
        val cmds = FlowWires.pathCmds(listOf(Pt(0.0, 50.0), Pt(100.0, 50.0)), listOf(listOf(Pt(2.0, 0.0), Pt(2.0, 100.0)), listOf(Pt(50.0, 50.0), Pt(50.0, 100.0))))
        assertEquals(2, cmds.size)   // Move + Line only
        assertNotNull(cmds[1] as? Cmd.Line)
    }

    @Test fun interconnectWiresUseGutterLanes() {
        val geo = mapOf(
            "a-sec" to Rect(0.0, 100.0, 0.0, 400.0), "b-sec" to Rect(130.0, 230.0, 0.0, 400.0),
            "a-mod" to Rect(10.0, 90.0, 100.0, 120.0), "b-mod" to Rect(140.0, 220.0, 100.0, 120.0), "b-rf" to Rect(140.0, 220.0, 300.0, 320.0),
            "i-ext" to Rect(0.0, 50.0, 420.0, 450.0), "i-gp" to Rect(60.0, 110.0, 420.0, 450.0), "i-valve" to Rect(120.0, 170.0, 420.0, 450.0), "i-park" to Rect(180.0, 230.0, 420.0, 450.0),
        )
        val wires = FlowWires.hydraulic(geo, flags.copy(interconnectActual = true))
        val gx = 115.0
        // B module pressure → interconnect valve rides xB = gx + 10 down to the valve top
        assertTrue(wires.any { w -> w.active && w.pts.size == 3 && w.pts[1].x == gx + 10 && w.pts[2].y == 420.0 })
        // valve → A module rides xG = gx + 19 and ends on the A module's right edge
        assertTrue(wires.any { w -> w.active && w.pts.size == 3 && w.pts[0].x == gx + 19 && w.pts[2].x == 90.0 })
    }
}
