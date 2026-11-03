package com.oersted.trainer.sim

import com.oersted.trainer.sim.RouteSequence.RPLL_WSSS_SEQUENCE
import com.oersted.trainer.sim.RouteSequence.buildPlanSequence
import com.oersted.trainer.sim.RouteSequence.findNextSequenceItem
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RouteSequenceTest {
    private fun plan(waypoints: List<ActiveFlightWaypoint>, ils: ActiveIls?) = ActiveFlightPlan(
        activatedAt = "2026-11-02T00:00:00Z", callsign = "TEST", departure = "RPLL", destination = "WSSS",
        alternate = "WMKK", departureRunway = "06", arrivalRunway = "02L", cruiseAltitudeFt = 33000.0, cruiseSpeedKt = 250.0,
        sid = "", enrouteRoute = "", star = "", approach = "", procedureStatus = "unverified",
        waypoints = waypoints, ils = ils,
    )

    @Test fun reachingTargetAdvancesToFollowing() {
        val mia = RPLL_WSSS_SEQUENCE[0]
        val r = findNextSequenceItem(mia.lat, mia.lon, 0)
        assertEquals(1, r.index)
        assertTrue(r.next?.id == "VTK")
    }

    @Test fun farAwayStaysOnCurrentTarget() {
        val r = findNextSequenceItem(0.0, 0.0, 0)
        assertEquals(0, r.index)
        assertTrue(r.next?.id == "MIA")
        assertTrue(r.distanceNm > 100)
    }

    @Test fun ilsWithin30NmIsTunedEarly() {
        val icw = RPLL_WSSS_SEQUENCE[2]
        // at the localizer itself while still on the VTK leg
        val r = findNextSequenceItem(icw.lat, icw.lon, 1)
        assertEquals(2, r.index)
        assertTrue(r.next?.id == "ICW")
    }

    @Test fun endOfSequenceHasNoNext() {
        val r = findNextSequenceItem(0.0, 0.0, RPLL_WSSS_SEQUENCE.size)
        assertTrue(r.next == null)
    }

    @Test fun nullPlanGivesEmptySequence() {
        assertTrue(buildPlanSequence(null).isEmpty())
    }

    @Test fun planWaypointsMatchCatalogueAndDeduplicate() {
        val mia = NavaidsChangi.CHANGI_NAVAIDS.first { it.ident == "MIA" }
        val wp = ActiveFlightWaypoint(id = mia.id, name = "MIA", latitude = mia.lat, longitude = mia.lon, altitudeFt = 0.0, speedKt = 0.0)
        val items = buildPlanSequence(plan(listOf(wp, wp), null))
        assertEquals(1, items.size)
        assertEquals("VOR", items[0].kind)
    }

    @Test fun planIlsIsLastTarget() {
        val icwCat = NavaidsChangi.CHANGI_NAVAIDS.first { it.id == "WSSS-ILS-02L" }
        val ils = ActiveIls(
            id = "WSSS-ILS-02L", ident = "ICW", name = "x", airport = "WSSS", runway = "02L",
            frequencyMHz = 110.9, courseMag = 23.0, latitude = icwCat.lat, longitude = icwCat.lon,
        )
        val items = buildPlanSequence(plan(emptyList(), ils))
        assertEquals(1, items.size)
        assertEquals("ILS", items[0].kind)
        assertEquals("Changi ILS/DME RWY 02L", items[0].name)
        assertTrue(items[0].note!!.contains("course 023°"))
    }
}
