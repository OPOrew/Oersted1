package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FlightPlanProceduresTest {
    @Test fun sidReplacesEarlierSidFixesAndKeepsTheRest() {
        val seed = FlightPlanDraft(waypoints = listOf(
            ActiveFlightWaypoint("SID-OLD", "OLD", 1.0, 1.0, 0.0, 0.0),
            ActiveFlightWaypoint("USER-1", "KEEP", 2.0, 2.0, 0.0, 0.0),
        ))
        val r = FlightPlanProcedures.applySid(seed, "VERDE", "24") as FlightPlanProcedures.Result.Applied
        val sidCount = NavData.buildSidWaypoints("VERDE").size
        assertEquals(sidCount + 1, r.draft.waypoints.size)
        assertEquals("USER-1", r.draft.waypoints.last().id)
        assertTrue(r.draft.waypoints.none { it.id == "SID-OLD" })
        assertTrue(r.draft.sid.startsWith("VERDE2B (RWY 24: "))
        assertTrue(r.draft.sid.contains("track out MIA R182"))
        assertTrue(r.draft.sid.endsWith(". " + NavData.RPLL_SIDS.getValue("VERDE").remarks!!))
        assertTrue(r.notice.endsWith("Check against the current chart."))
    }

    @Test fun unknownSidOrRunwayIsRefusedWithTheWebMessage() {
        val bad = FlightPlanProcedures.applySid(FlightPlanDraft(), "NOPE", "24") as FlightPlanProcedures.Result.Refused
        assertEquals("No SID data for NOPE on RWY 24. Published data is encoded for RWY 06, 24 and 13.", bad.reason)
        val noRwy = FlightPlanProcedures.applySid(FlightPlanDraft(), "VERDE", "") as FlightPlanProcedures.Result.Refused
        assertEquals("No SID data for VERDE on RWY ?. Published data is encoded for RWY 06, 24 and 13.", noRwy.reason)
    }

    @Test fun vectorArrivalFromDepartureWhenRouteIsEmpty() {
        val r = FlightPlanProcedures.applyVectorArrival(FlightPlanDraft(departure = "RPLL")) as FlightPlanProcedures.Result.Applied
        val d = r.draft
        assertEquals("WSSS", d.destination)
        assertEquals("02L", d.arrivalRunway)
        assertEquals(NavData.WSSS_ILS_02L.thrLat, d.destinationLat!!, 0.0)
        assertEquals(NavData.WSSS_ILS_02L.thrLon, d.destinationLon!!, 0.0)
        assertEquals(3500.0, d.approachAltitudeFt, 0.0)
        assertTrue(d.approach.startsWith("ILS/DME RWY 02L (ICW "))
        assertTrue(d.star.startsWith("NONE - radar vectors"))
        assertTrue(d.arrival != null)
        assertTrue(d.waypoints.isNotEmpty())
    }

    @Test fun vectorArrivalRefusedWithoutAnyPoint() {
        val r = FlightPlanProcedures.applyVectorArrival(FlightPlanDraft(departure = "ZZZZ"))
        assertTrue(r is FlightPlanProcedures.Result.Refused)
    }
}
