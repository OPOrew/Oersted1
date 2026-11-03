package com.oersted.trainer.sim

import com.oersted.trainer.sim.OverheadLocal.DomeMode
import com.oersted.trainer.sim.OverheadLocal.Holder
import com.oersted.trainer.sim.OverheadLocal.IrsMode
import com.oersted.trainer.sim.OverheadLocal.OverheadLocalState
import com.oersted.trainer.sim.OverheadLocal.DsplSel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class OverheadLocalTest {
    @Test fun defaultsMatchWebInitialValues() {
        val s = OverheadLocalState()
        assertTrue(s.irsL == IrsMode.OFF && s.irsR == IrsMode.OFF)
        assertTrue(s.irsDsplSel == DsplSel.PPOS)
        assertTrue(s.dome == DomeMode.OFF)
        assertEquals(1850.0, s.oxyPsi, 1e-9)
        assertEquals(0.5, s.cbBright, 1e-9)
        assertEquals(0, s.machWarn)
        assertTrue(s.reverserTest == Pair(false, false))
        assertTrue(s.audioRx.isEmpty())
    }

    @Test fun setMergesOnlyTheChangedFields() {
        val h = Holder()
        h.set { it.copy(irsL = IrsMode.ALIGN, irsAlignL = 0.4) }
        assertTrue(h.state.irsL == IrsMode.ALIGN)
        assertEquals(0.4, h.state.irsAlignL, 1e-9)
        assertTrue(h.state.irsR == IrsMode.OFF)
        h.set { it.copy(dome = DomeMode.BRIGHT) }
        assertTrue(h.state.dome == DomeMode.BRIGHT && h.state.irsL == IrsMode.ALIGN)
    }
}
