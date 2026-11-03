package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Hand-written checks for NavData (navData.ts). */
class NavDataTest {
    @Test fun aipCoordinatesParseWithHemisphere() {
        // 14 deg 02 min 48.9 s N
        assertEquals(14.0 + 2.0 / 60 + 48.9 / 3600, NavData.parseAipCoord("140248.9N"), 1e-9)
        // 121 deg 01 min 34.9 s E
        assertEquals(121.0 + 1.0 / 60 + 34.9 / 3600, NavData.parseAipCoord("1210134.9E"), 1e-9)
        // South and west are negative.
        assertTrue(NavData.parseAipCoord("100000.0S") < 0)
        assertTrue(NavData.parseAipCoord("1000000.0W") < 0)
    }

    @Test fun badAipCoordinateThrows() {
        var threw = false
        try { NavData.parseAipCoord("not-a-coord") } catch (e: IllegalArgumentException) { threw = true }
        assertTrue(threw)
    }

    @Test fun magneticVariationInterpolatesBetweenEndpoints() {
        assertEquals(-2.5, NavData.magVarAt(14.5), 1e-9)
        assertEquals(0.38, NavData.magVarAt(1.35), 1e-9)
        // Beyond the endpoints it is clamped.
        assertEquals(-2.5, NavData.magVarAt(40.0), 1e-9)
        assertEquals(0.38, NavData.magVarAt(-10.0), 1e-9)
        // Midpoint of the latitude range.
        assertEquals((-2.5 + 0.38) / 2, NavData.magVarAt((14.5 + 1.35) / 2), 1e-9)
    }

    @Test fun sidProcedureNamesByRunway() {
        assertEquals("VERDE2A", NavData.sidProcedureName("VERDE", "06"))
        assertEquals("SIRCA2F", NavData.sidProcedureName("SIRCA", "13"))
        assertEquals(null, NavData.sidProcedureName("VERDE", "99"))
        assertEquals(null, NavData.sidProcedureName("NOPE", "06"))
    }

    @Test fun sidWaypointsUseChartedAltitudes() {
        val wps = NavData.buildSidWaypoints("VERDE")
        assertEquals(listOf("TAALA", "VERDE"), wps.map { it.name })
        assertEquals(8000.0, wps[0].altitudeFt, 0.0)
        assertEquals("charted", wps[0].source)
        // A fix with no minimum altitude defaults to 0.
        assertEquals(0.0, NavData.buildSidWaypoints("BETEL").last().altitudeFt, 0.0)
        assertTrue(NavData.buildSidWaypoints("UNKNOWN").isEmpty())
    }

    @Test fun destPointNorthOneDegreeIsSixtyNm() {
        val p = NavData.destPoint(0.0, 0.0, 0.0, 60.0)
        assertEquals(1.0, p.lat, 0.01)
        assertEquals(0.0, p.lon, 1e-9)
    }

    @Test fun wsssArrivalSceneIdsAcceptBothSpellings() {
        assertTrue(NavData.isWsssArrivalSceneId("WSSS-02L"))
        assertTrue(NavData.isWsssArrivalSceneId("WSSS02L"))
        assertTrue(!NavData.isWsssArrivalSceneId("RPLL-06"))
        assertTrue(!NavData.isWsssArrivalSceneId(null))
    }

    @Test fun vectorArrivalBuildsThreeFixesOnOneSide() {
        val (wps, side) = NavData.buildVectorArrival(NavData.WSSS_ILS_02L, 1.5, 104.5)
        assertEquals(listOf("VCT-A", "VCT-B", "VCT-C"), wps.map { it.name })
        assertEquals(listOf(5000.0, 4000.0, 3500.0), wps.map { it.altitudeFt })
        assertTrue(side == 1 || side == -1)
        assertTrue(wps.all { it.source == "vector" })
    }
}
