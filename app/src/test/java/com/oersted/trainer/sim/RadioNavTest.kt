package com.oersted.trainer.sim

import com.oersted.trainer.sim.RadioNav.NavSceneId
import com.oersted.trainer.sim.RadioNav.NavStationKind
import com.oersted.trainer.sim.RadioNav.Point
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.PI
import kotlin.math.tan

/** Hand-written checks for RadioNav. */
class RadioNavTest {
    @Test fun angDiffWrapsBothWays() {
        assertEquals(20.0, RadioNav.angDiff(10.0, 350.0), 1e-9)
        assertEquals(-20.0, RadioNav.angDiff(350.0, 10.0), 1e-9)
    }

    @Test fun unknownFrequencyGivesNoNav() {
        val r = RadioNav.radioNav(Point(0.0, 0.0), 0.0, NavStationKind.ILS, 999.0)
        assertTrue(!r.locValid && !r.gsValid && !r.vorValid)
    }

    @Test fun localizerAndGlideSlopeOnCentrelineOnApproach() {
        // 8 NM out on the 62 degree course, flying the 3.01 degree glide path.
        val c = RadioNav.RWY_CRS * PI / 180
        val p = Point(-8 * kotlin.math.sin(c), -8 * kotlin.math.cos(c))
        val alt = 8 * 6076.12 * tan(RadioNav.RWY_GS_DEG * PI / 180)
        val r = RadioNav.radioNav(p, alt, NavStationKind.ILS, 109.1)
        assertTrue(r.locValid)
        assertTrue(r.gsValid)
        assertEquals(0.0, r.locDev, 1e-6)
        assertEquals(0.0, r.gsErr, 1e-6)
    }

    @Test fun vorValidOnlyInRange() {
        val near = RadioNav.radioNav(Point(1.0, 1.0), 0.0, NavStationKind.VOR, 112.0)
        assertTrue(near.vorValid)
        val far = RadioNav.radioNav(Point(90.0, 0.0), 0.0, NavStationKind.VOR, 112.0)
        assertTrue(!far.vorValid)
    }

    @Test fun vorDeviationFromAndTo() {
        val fromTheStation = RadioNav.vorDevOf(90.0, 90.0)
        assertEquals(0.0, fromTheStation.dev, 1e-9)
        assertTrue(!fromTheStation.to)
        val toTheStation = RadioNav.vorDevOf(90.0, 270.0)
        assertTrue(toTheStation.to)
    }





}
