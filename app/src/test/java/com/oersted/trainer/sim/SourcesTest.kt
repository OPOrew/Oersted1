package com.oersted.trainer.sim

import com.oersted.trainer.sim.Sources.NO_SRC_FAIL
import com.oersted.trainer.sim.Sources.SourceSelect
import com.oersted.trainer.sim.Sources.SrcFail
import com.oersted.trainer.sim.Sources.sourcesOf
import org.junit.Assert.assertTrue
import org.junit.Test

class SourcesTest {
    @Test fun normalSelectionUsesSystemOneForCaptainAndTwoForFo() {
        val f = SrcFail(gyro1 = true, gyro2 = false, gyroAux = false, comp1 = true, comp2 = false, nav1 = true, nav2 = false)
        val s = sourcesOf(SourceSelect(navSel = 1, compSel = 1, gyroSel = 1), f)
        assertTrue(s.capt.att && s.capt.hdg && s.capt.nav)
        assertTrue(!s.fo.att && !s.fo.hdg && !s.fo.nav)
    }

    @Test fun auxGyroSelectionSwitchesTheCaptainSource() {
        val f = SrcFail(gyro1 = true, gyro2 = false, gyroAux = true, comp1 = false, comp2 = false, nav1 = false, nav2 = false)
        val onAux = sourcesOf(SourceSelect(navSel = 1, compSel = 1, gyroSel = 0), f)
        assertTrue(onAux.capt.att)
        val fo = sourcesOf(SourceSelect(navSel = 1, compSel = 1, gyroSel = 2), f)
        assertTrue(fo.fo.att)
    }

    @Test fun noFailureMeansNothingFlagged() {
        val s = sourcesOf(SourceSelect(1, 1, 1), NO_SRC_FAIL)
        assertTrue(!s.capt.att && !s.capt.hdg && !s.capt.nav && !s.fo.att && !s.fo.hdg && !s.fo.nav)
    }
}
