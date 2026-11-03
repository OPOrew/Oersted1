package com.oersted.trainer.sim

import com.oersted.trainer.sim.Pedestal.Holder
import com.oersted.trainer.sim.Pedestal.PedestalState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PedestalTest {
    @Test fun defaultsMatchWebFresh() {
        val s = PedestalState()
        assertEquals(121950, s.commL.act)
        assertEquals(121800, s.commL.stby)
        assertEquals(109950, s.navL.act)
        assertEquals(112500, s.navL.stby)
        assertEquals(353, s.adf.l)
        assertEquals(316, s.adf.r)
        assertEquals(Pedestal.XpdrMode.SBY, s.xpdrMode)
        assertEquals(Pedestal.TcasMode.TA, s.tcasMode)
        assertEquals(5.0, s.stabTrim, 1e-9)
        assertEquals(Pedestal.WxrMode.STBY, s.wxrMode)
        assertEquals(Pedestal.FireTest.OFF, s.fireTest)
        assertEquals(Pedestal.ExtTest.OFF, s.extTest)
    }

    @Test fun cduInitialPagesAreCrzAndLegs() {
        val s = PedestalState()
        assertEquals("CRZ", s.cduL.page)
        assertEquals("LEGS", s.cduR.page)
        assertFalse(s.cduL.exec)
    }

    @Test fun allTwentyEightAudioSelectorsStartOn() {
        assertEquals(28, Pedestal.MIC_DEFAULT.size)
        assertTrue(Pedestal.MIC_DEFAULT.values.all { it })
        assertTrue(Pedestal.MIC_DEFAULT["L:rx:ADF-2"] == true)
        assertTrue(Pedestal.MIC_DEFAULT["R:vol:PA"] == true)
    }

    @Test fun setMergesWithoutTouchingOtherFields() {
        val h = Holder()
        h.set { it.copy(xpdrCode = "7700") }
        assertEquals("7700", h.state.xpdrCode)
        assertEquals(353, h.state.adf.l)
    }

    @Test fun setCduUpdatesOnlyTheChosenSide() {
        val h = Holder()
        h.setCdu(left = true) { it.copy(exec = true, msg = "OK") }
        assertTrue(h.state.cduL.exec)
        assertEquals("OK", h.state.cduL.msg)
        assertFalse(h.state.cduR.exec)
        assertEquals("", h.state.cduR.msg)
    }

    @Test fun resetRestoresDefaults() {
        val h = Holder()
        h.set { it.copy(xpdrCode = "1200", stabTrim = 9.0) }
        h.setCdu(left = false) { it.copy(page = "DATA") }
        h.reset()
        assertEquals("0000", h.state.xpdrCode)
        assertEquals(5.0, h.state.stabTrim, 1e-9)
        assertEquals("LEGS", h.state.cduR.page)
    }

    @Test fun onChangeIsCalledOnEverySet() {
        var calls = 0
        val h = Holder(onChange = { calls++ })
        h.set { it.copy(ptt = true) }
        h.reset()
        assertEquals(2, calls)
    }
}
