package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** flightLevelCap.ts + FlightLevelInput commit rule. */
class FlightLevelCapTest {
    @Test fun validFlRoundsAndRejectsOutOfRange() {
        assertEquals(350, FlightLevelCap.validFl(350.0))
        assertEquals(350, FlightLevelCap.validFl(349.6))
        assertEquals(10, FlightLevelCap.validFl(10.0))
        assertEquals(410, FlightLevelCap.validFl(410.0))
        assertNull(FlightLevelCap.validFl(9.0))
        assertNull(FlightLevelCap.validFl(411.0))
        assertNull(FlightLevelCap.validFl(Double.NaN))
        assertNull(FlightLevelCap.validFl(null))
    }

    @Test fun capFtIsFlTimes100() {
        assertEquals(35000.0, FlightLevelCap.capFt(350)!!, 1e-9)
        assertNull(FlightLevelCap.capFt(null))
        assertNull(FlightLevelCap.capFt(5))
    }

    @Test fun commitParsesTheTypedText() {
        assertEquals(FlightLevelCap.Commit.Clear, FlightLevelCap.commit(""))
        assertEquals(FlightLevelCap.Commit.Clear, FlightLevelCap.commit("   "))
        assertEquals(FlightLevelCap.Commit.Set(350), FlightLevelCap.commit("350"))
        assertEquals(FlightLevelCap.Commit.Set(350), FlightLevelCap.commit(" FL350 "))
        assertEquals(FlightLevelCap.Commit.Set(280), FlightLevelCap.commit("fl280"))
        assertEquals(FlightLevelCap.Commit.Ignore, FlightLevelCap.commit("abc"))
        assertEquals(FlightLevelCap.Commit.Ignore, FlightLevelCap.commit("500"))
        assertEquals(FlightLevelCap.Commit.Ignore, FlightLevelCap.commit("5"))
    }

    @Test fun capHoldsCruiseAndWaypointsAtTheCeiling() {
        val wp = { alt: Double -> ActiveFlightWaypoint("A", "A", 0.0, 0.0, alt, 250.0) }
        val plan = ActiveFlightPlan(
            version = 1, activatedAt = "t", callsign = "", departure = "RPLL", destination = "WSSS", alternate = "",
            departureRunway = "", arrivalRunway = "", cruiseAltitudeFt = 37000.0, cruiseSpeedKt = 440.0, sid = "", enrouteRoute = "",
            star = "", approach = "", procedureStatus = "unverified", waypoints = listOf(wp(37000.0), wp(0.0), wp(20000.0)),
        )
        val capped = ActiveFlightPlanLogic.applyFlightLevelCap(plan, FlightLevelCap.capFt(350))
        assertEquals(35000.0, capped.cruiseAltitudeFt, 1e-9)
        assertEquals(listOf(35000.0, 0.0, 20000.0), capped.waypoints.map { it.altitudeFt })
        assertTrue(plan === ActiveFlightPlanLogic.applyFlightLevelCap(plan, null))
        assertTrue(plan === ActiveFlightPlanLogic.applyFlightLevelCap(plan, 40000.0))
    }
}
