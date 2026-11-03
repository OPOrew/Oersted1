package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FlightPlanPresetsTest {
    private val preset = FlightPlanPresets.manilaSingapore()

    @Test fun plannedValuesMatchTheWebPreset() {
        assertEquals("OERSTED 01", preset.callsign)
        assertEquals("RPLL", preset.departure)
        assertEquals("WSSS", preset.destination)
        assertEquals("WMKK", preset.alternate)
        assertEquals("24", preset.departureRunway)
        assertEquals("02L", preset.arrivalRunway)
        assertEquals(31000.0, preset.cruiseAltitudeFt, 0.0)
        assertEquals(430.0, preset.cruiseSpeedKt, 0.0)
        assertEquals(6000.0, preset.reserveFuelLb, 0.0)
        assertEquals(3500.0, preset.approachAltitudeFt, 0.0)
        assertEquals("unverified", preset.procedureStatus)
    }

    @Test fun proceduresNameTheSidAndIlsWithChartEditions() {
        assertTrue(preset.sid.startsWith("VERDE2B (RWY 24: "))
        assertTrue(preset.sid.endsWith(NavData.Editions.RPLL_SID))
        assertTrue(preset.approach.contains("ICW 110.9"))
        assertTrue(preset.approach.contains("course 023 deg"))
        assertTrue(preset.star.startsWith("NONE"))
    }

    @Test fun routeIsSidFixesThenVectorsToTheIls() {
        val sidCount = NavData.buildSidWaypoints("VERDE").size
        assertTrue(sidCount > 0)
        assertTrue(preset.waypoints.size > sidCount)
        assertEquals(sidCount, preset.waypoints.count { !it.id.startsWith("VCT-") })
        val arrival = preset.arrival!!
        assertEquals("02L", arrival.runway)
        assertEquals(110.9, arrival.ilsFrequencyMHz, 0.0)
    }

    @Test fun presetSetsTheIcwApproachIls() {
        val ils = preset.ils!!
        assertEquals("WSSS-ILS-02L", ils.id)
        assertEquals("02L", ils.runway)
    }
}
