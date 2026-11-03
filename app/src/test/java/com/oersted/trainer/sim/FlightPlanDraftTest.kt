package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FlightPlanDraftTest {
    @Test fun defaultsMatchTheWebDefaultPlan() {
        val d = FlightPlanDraft()
        assertEquals("OERSTED 01", d.callsign)
        assertEquals("RPLL", d.departure)
        assertEquals("WSSS", d.destination)
        assertEquals("06", d.departureRunway)
        assertEquals(25000.0, d.cruiseAltitudeFt, 1e-9)
        assertEquals(250.0, d.cruiseSpeedKt, 1e-9)
        assertTrue(d.problem() == null)
    }

    @Test fun toActiveCopiesTheFieldsAndAppliesWebDefaults() {
        val a = FlightPlanDraft(callsign = "TEST", arrivalRunway = "02L").toActive("2026-11-03T04:00:00Z")
        assertEquals(1, a.version)
        assertEquals("2026-11-03T04:00:00Z", a.activatedAt)
        assertEquals("TEST", a.callsign)
        assertEquals("02L", a.arrivalRunway)
        assertEquals("unverified", a.procedureStatus)
        assertTrue(a.waypoints.isEmpty())
        assertEquals(15.0, a.timeCompression!!, 1e-9)
    }

    @Test fun problemsBlockActivation() {
        assertTrue(FlightPlanDraft(callsign = " ").problem() != null)
        assertTrue(FlightPlanDraft(destination = "").problem() != null)
        assertTrue(FlightPlanDraft(cruiseAltitudeFt = 0.0).problem() != null)
        assertTrue(FlightPlanDraft(cruiseSpeedKt = -1.0).problem() != null)
    }

    @Test fun vectoredArrivalAddsThreeFixesAndTheArrival() {
        val dep = FlightRoute.AIRPORTS.getValue("RPLL")
        val d = FlightPlanDraft().withVectoredArrival(dep.lat, dep.lon)
        assertEquals("02L", d.arrivalRunway)
        assertEquals("WSSS", d.destination)
        assertEquals(3, d.waypoints.size)
        val arr = d.arrival!!
        assertEquals("WSSS", arr.airport)
        assertEquals("VCT-A", arr.firstFixName)
        assertEquals("VCT-C", arr.lastFixName)
        assertEquals(NavData.WSSS_ILS_02L.id, arr.sceneId)
        val active = d.toActive("2026-11-03T04:00:00Z")
        assertEquals(3, active.waypoints.size)
        assertTrue(active.arrival != null)
    }

    @Test fun reapplyingReplacesVectorFixesAndKeepsOtherFixes() {
        val dep = FlightRoute.AIRPORTS.getValue("RPLL")
        val user = ActiveFlightWaypoint(id = "WP1", name = "WP1", latitude = 5.0, longitude = 103.0, altitudeFt = 10000.0, speedKt = 250.0)
        val once = FlightPlanDraft(waypoints = listOf(user)).withVectoredArrival(dep.lat, dep.lon)
        val twice = once.withVectoredArrival(dep.lat, dep.lon)
        assertEquals(4, twice.waypoints.size)
        assertEquals("WP1", twice.waypoints.first().id)
    }

    @Test fun procedureAndPlanningDefaultsMatchTheWeb() {
        val d = FlightPlanDraft()
        assertEquals("", d.sid)
        assertEquals("", d.star)
        assertEquals("unverified", d.procedureStatus)
        assertEquals(3000.0, d.reserveFuelLb, 0.0)
        assertEquals(30.0, d.cruiseTopOfClimbNm, 0.0)
        assertEquals(180.0, d.descentStartNm, 0.0)
        assertEquals(3000.0, d.approachAltitudeFt, 0.0)
    }

    @Test fun procedureFieldsCarryIntoTheActivePlan() {
        val a = FlightPlanDraft(sid = "SID1", star = "STAR1", approach = "ILS 02L", procedureStatus = "chart-checked")
            .toActive("2026-11-03T15:00:00Z")
        assertEquals("SID1", a.sid)
        assertEquals("STAR1", a.star)
        assertEquals("ILS 02L", a.approach)
        assertEquals("chart-checked", a.procedureStatus)
    }
}
