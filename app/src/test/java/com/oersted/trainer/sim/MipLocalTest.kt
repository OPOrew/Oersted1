package com.oersted.trainer.sim

import com.oersted.trainer.sim.MipLocal.Holder
import com.oersted.trainer.sim.MipLocal.MipState
import com.oersted.trainer.sim.MipLocal.afPanelOwnedMirror
import com.oersted.trainer.sim.RadioNav.NavSceneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class MipLocalTest {
    @Test fun defaultsMatchTsInitialValues() {
        val s = MipState()
        assertEquals(1, s.fdMode)
        assertEquals(52.0, s.selCrs, 1e-9)
        assertEquals(109.1, s.navFrequencyMHz, 1e-9)
        assertTrue(s.navTuned == "ILS" && s.navScene == NavSceneId.RPLL06)
        assertEquals(11900, s.comAct)
        assertEquals("1200", s.xpdrCode)
        assertTrue(s.gyroMem.g1.wasPowered)
        assertTrue(s.attCapt.attValid && s.attCapt.hdgValid)
    }

    @Test fun setMergesOnlyNamedFields() {
        val h = Holder()
        h.set { it.copy(apNav = 2, apAil = true) }
        assertEquals(2, h.state.apNav)
        assertTrue(h.state.apAil)
        assertEquals(1, h.state.fdMode)
    }

    @Test fun mirrorWritesOnlyWhenFlagDiffers() {
        val live = MipState(attLive = true)
        assertTrue(afPanelOwnedMirror(live, simAfPanelOwned = false) == true)
        assertTrue(afPanelOwnedMirror(live, simAfPanelOwned = true) == null)
        assertTrue(afPanelOwnedMirror(MipState(attLive = false), simAfPanelOwned = true) == false)
    }

    @Test fun onChangeRunsAfterEachSet() {
        var calls = 0
        val h = Holder(onChange = { calls++ })
        h.set { it.copy(attLive = true) }
        h.set { it.copy(radarMode = 2) }
        assertEquals(2, calls)
    }
}
