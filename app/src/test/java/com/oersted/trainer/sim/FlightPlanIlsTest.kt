package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FlightPlanIlsTest {
    private val icw = NavaidsChangi.CHANGI_NAVAIDS.first { it.id == "WSSS-ILS-02L" }
    private val otherIls = NavaidsChangi.CHANGI_NAVAIDS.first { it.kind == NavaidsChangi.NavaidKind.ILS && it.id != "WSSS-ILS-02L" }
    private val vor = NavaidsChangi.CHANGI_NAVAIDS.first { it.kind == NavaidsChangi.NavaidKind.VOR_DME }

    @Test fun icwIsTheCatalogLocalizer() {
        val ils = FlightPlanIls.icw()!!
        assertEquals("WSSS-ILS-02L", ils.id)
        assertEquals("02L", ils.runway)
        assertEquals(110.9, ils.frequencyMHz, 0.0)
        assertEquals(23.0, ils.courseMag, 0.0)
    }

    @Test fun choosingAnIlsSetsTheApproachText() {
        val r = FlightPlanIls.set(FlightPlanDraft(), icw)
        assertEquals("WSSS-ILS-02L", r.ils!!.id)
        assertEquals("02L", r.arrivalRunway)
        assertTrue(r.approach.startsWith("ILS ICW 110.90 MHz RWY 02L, course 023°"))
    }

    @Test fun nonIlsStationIsRefused() {
        val d = FlightPlanDraft()
        assertEquals(d, FlightPlanIls.set(d, vor))
    }

    @Test fun keepsTheVectoredArrivalOnlyForIls02L() {
        val withVectors = FlightPlanDraft().withVectoredArrival(1.3, 103.9)
        assertTrue(FlightPlanIls.set(withVectors, icw).arrival != null)
        val dropped = FlightPlanIls.set(withVectors, otherIls)
        assertTrue(dropped.arrival == null)
        assertTrue(dropped.waypoints.none { it.id.startsWith("VCT-") })
    }

    @Test fun clearRemovesOnlyTheIls() {
        val set = FlightPlanIls.set(FlightPlanDraft(), icw)
        val cleared = FlightPlanIls.clear(set)
        assertTrue(cleared.ils == null)
        assertEquals(set.approach, cleared.approach)
    }
}
