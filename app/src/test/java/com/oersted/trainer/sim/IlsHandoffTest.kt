package com.oersted.trainer.sim

import com.oersted.trainer.sim.IlsHandoff.Inputs
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class IlsHandoffTest {
    private fun base() = Inputs(
        planNav = true, guideActive = true, ilsArm = true, sceneIsWsss02L = true, hasLiveArrival = true,
        ilsFreqMHz = 109.9, ilsCourseMag = 25.0, navOn = false, captFreqMHz = 108.0, selCrs = 10.0,
        navLStby = 0, navRStby = 0, locValid = false, fdMode = 2, apNav = 0,
        ailOn = true, elevOn = true, cwsR = false, ga = false,
    )

    @Test fun noHandoffOutsideWsss02LOrWithoutArm() {
        val r = IlsHandoff.evaluate(base().copy(sceneIsWsss02L = false))
        assertFalse(r.handoff)
        assertTrue(r.nav1Tune == null)
        assertTrue(r.navRAct == null)
        assertFalse(IlsHandoff.evaluate(base().copy(ilsArm = false)).handoff)
        assertFalse(IlsHandoff.evaluate(base().copy(hasLiveArrival = false)).handoff)
    }

    @Test fun retunesNav1WhenNotTunedAndSetsNav2Active() {
        val r = IlsHandoff.evaluate(base())
        assertTrue(r.handoff)
        assertEquals(109.9, r.nav1Tune!!.mipFrequencyMHz, 0.0)
        assertEquals(true, r.navOn)
        assertEquals(NavReceiver.pedestalRawFromMhz(109.9), r.navRAct)
    }

    @Test fun noNav1RetuneWhenAlreadyTunedToIls() {
        val r = IlsHandoff.evaluate(base().copy(navOn = true, captFreqMHz = 109.9))
        assertTrue(r.handoff)
        assertTrue(r.nav1Tune == null)
        assertTrue(r.navOn == null)
    }

    @Test fun courseSetsOnlyWhenOffByMoreThanHalfDegree() {
        assertEquals(25.0, IlsHandoff.evaluate(base()).selCrs!!, 0.0)
        assertTrue(IlsHandoff.evaluate(base().copy(selCrs = 25.2)).selCrs == null)
    }

    @Test fun autoAppSelectedOnceLocalizerValid() {
        assertEquals(4, IlsHandoff.evaluate(base().copy(locValid = true, fdMode = 2)).fdMode)
        assertTrue(IlsHandoff.evaluate(base().copy(locValid = true, fdMode = 1)).fdMode == null)
        assertTrue(IlsHandoff.evaluate(base().copy(locValid = true, fdMode = 4)).fdMode == null)
        assertTrue(IlsHandoff.evaluate(base().copy(locValid = false)).fdMode == null)
    }

    @Test fun approachEngagesAsApOrLocDependingOnElevator() {
        val withElev = base().copy(locValid = true, apNav = 0)
        assertEquals(2, IlsHandoff.evaluate(withElev).apNav)
        assertEquals(1, IlsHandoff.evaluate(withElev.copy(elevOn = false)).apNav)
        assertTrue(IlsHandoff.evaluate(withElev.copy(cwsR = true)).apNav == null)
        assertTrue(IlsHandoff.evaluate(withElev.copy(ga = true)).apNav == null)
        assertTrue(IlsHandoff.evaluate(withElev.copy(apNav = 2)).apNav == null)
    }
}
