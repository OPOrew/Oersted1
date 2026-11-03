package com.oersted.trainer.sim

import com.oersted.trainer.sim.MarkerBeacons.MarkerId
import com.oersted.trainer.sim.RadioNav.NavSceneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.PI

class MarkerBeaconsTest {
    @Test fun outerMarkerHeardAtFourPointSixNmOnApproach() {
        val c = RadioNav.RWY_CRS * PI / 180
        val p = MarkerBeacons.Pos(-4.6 * kotlin.math.sin(c), -4.6 * kotlin.math.cos(c))
        val m = MarkerBeacons.markerCoverage(NavSceneId.RPLL06, p, 1000.0, false)
        assertTrue(m.om)
        assertTrue(!m.mm)
        assertTrue(!m.im)
    }

    @Test fun markerKeyingPatterns() {
        assertTrue(MarkerBeacons.markerKeyed(MarkerId.OM, 0.0))
        assertTrue(!MarkerBeacons.markerKeyed(MarkerId.OM, 0.4))
        assertTrue(MarkerBeacons.markerKeyed(MarkerId.IM, 0.0))
    }

    @Test fun activeMarkerPrefersInner() {
        assertEquals(MarkerId.IM, MarkerBeacons.activeMarker(MarkerBeacons.MarkerState(om = true, mm = true, im = true)))
        assertTrue(MarkerBeacons.activeMarker(MarkerBeacons.NO_MARKERS) == null)
    }
}
