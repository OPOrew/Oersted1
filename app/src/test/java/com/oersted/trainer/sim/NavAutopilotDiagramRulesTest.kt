package com.oersted.trainer.sim

import com.oersted.trainer.sim.NavAutopilotDiagramRules as D
import com.oersted.trainer.sim.NavAutopilotDiagramRules.St
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NavAutopilotDiagramRulesTest {
    private fun build(s: SimState = initialSimState(), d: Derived = Derived(), m: MipLocal.MipState = MipLocal.MipState(), focus: String? = null) = D.build(s, d, m, focus)
    private fun D.Model.node(id: String) = nodes.first { it.id == id }
    private fun D.Model.edge(a: String, b: String) = edges.first { it.a == a && it.b == b }

    @Test fun countsMatchTheWebDrawing() {
        val m = build()
        assertEquals(25, m.nodes.size); assertEquals(33, m.edges.size)
        assertEquals(listOf("stn", "nav1", "nav2", "comp1", "comp2", "gyro1", "gyro2", "gyroaux", "air", "ra", "dc", "hyd"), m.nodes.take(12).map { it.id })
    }

    @Test fun coldAndDarkEverythingIdleExceptLostPowerAndPressure() {
        val m = build()
        assertEquals(St.IDLE, m.node("stn").st); assertEquals("STATION OFF", m.node("stn").lines[0])
        assertEquals("NO POWER", m.node("comp1").lines[0]); assertEquals(St.IDLE, m.node("comp1").st)
        assertEquals(St.FAIL, m.node("dc").st); assertEquals("LOST", m.node("dc").lines[0])
        assertEquals(St.FAIL, m.node("hyd").st); assertEquals("NO PRESSURE", m.node("hyd").lines[0])
        assertEquals(St.IDLE, m.node("ap").st); assertEquals("AIL OFF", m.node("ap").lines[0])
        assertEquals(St.OK, m.node("navsel").st); assertEquals("NORMAL", m.node("navsel").lines[1])
        assertEquals(St.FAIL, m.edge("dc", "ap").st)
    }

    @Test fun poweredWithFailedGyroShowsOnLineAndSourceBox() {
        val d = Derived().apply { dcPower = true; hydB = 3000.0 }
        val mip = MipLocal.MipState(srcFail = Sources.SrcFail(gyro1 = true, gyro2 = false, gyroAux = false, comp1 = false, comp2 = false, nav1 = false, nav2 = false))
        val m = build(d = d, m = mip)
        assertEquals(St.FAIL, m.node("gyro1").st); assertEquals("FAILED", m.node("gyro1").lines[0])
        assertEquals(St.OK, m.node("gyro2").st); assertEquals("ATT VALID", m.node("gyro2").lines[0])
        assertEquals(St.WARN, m.node("csrc").st)                       // captain ATT comes from the failed gyro 1
        assertEquals(St.OK, m.node("fsrc").st)
        assertEquals(St.FAIL, m.edge("csrc", "fd").st)
        assertEquals(St.FAIL, m.node("csrc").chips[2].st)                // ATT chip
        assertEquals("PRESSURE OK", m.node("hyd").lines[0]); assertEquals(St.OK, m.edge("hyd", "servo").st)
    }

    @Test fun engageInterlocksAndWarningText() {
        val d = Derived().apply { dcPower = true; hydB = 3000.0 }
        val on = build(d = d, m = MipLocal.MipState(apAil = true, apElev = true, apNav = 1))
        assertEquals("AIL ENGAGED", on.node("ap").lines[0]); assertEquals("NAV VOR LOC", on.node("ap").lines[2]); assertEquals(St.OK, on.node("ap").st)
        assertEquals("radio mode: no signal", on.node("ap").texts[1].text); assertEquals(D.AMBER, on.node("ap").texts[1].color)
        assertEquals(listOf(St.OK, St.OK, St.OK, St.OK), on.node("ap").chips.map { it.st })
        // hydraulic B lost: switches drop out, chip goes red
        val low = build(d = Derived().apply { dcPower = true; hydB = 0.0 }, m = MipLocal.MipState(apAil = true, apWarn = true))
        assertEquals("AIL OFF", low.node("ap").lines[0]); assertEquals(St.WARN, low.node("ap").st)
        assertEquals(St.FAIL, low.node("ap").chips[1].st); assertEquals("A/P DISCONNECT WARNING", low.node("ap").texts.last().text)
        assertEquals(St.WARN, low.edge("ap", "servo").st)
    }

    @Test fun focusDimsTheOtherHalf() {
        val nav = build(focus = "nav")
        assertTrue(nav.node("ap").dim); assertFalse(nav.node("navsel").dim); assertTrue(nav.edge("air", "ap").dim); assertFalse(nav.edge("nav1", "navsel").dim)
        val ap = build(focus = "ap")
        assertTrue(ap.node("fsrc").dim); assertTrue(ap.edge("fsrc", "fi").dim); assertFalse(ap.node("ap").dim)
        assertEquals("navigation (ATA 34)", D.title("nav")); assertEquals("navigation + autopilot", D.title(null))
    }

    @Test fun routesAreOrthogonalSvgPaths() {
        val m = build()
        for (e in m.edges) assertTrue(e.d, SvgLines.parse(e.d).isNotEmpty())
        assertEquals("M138 80 H160 V84 H185", m.edge("nav1", "navsel").d)
        assertEquals("M411 70 V26 H716 V70 H720", m.edge("csrc", "ci").d)
    }
}
