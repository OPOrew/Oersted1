package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FlightPlanPageRulesTest {
    private val R = FlightPlanPageRules

    @Test fun toFixedAndFmtFollowJs() {
        assertTrue(R.toFixed(14.50864, 4) == "14.5086")
        assertTrue(R.toFixed(2.5, 0) == "3")
        assertTrue(R.toFixed(-0.0001, 2) == "-0.00")
        assertTrue(R.toFixed(0.0, 2) == "0.00")
        assertTrue(R.fmt(25000.0) == "25,000")
        assertTrue(R.fmt(1234567.0) == "1,234,567")
        assertTrue(R.fmt(0.0) == "0")
        assertTrue(R.fmt(12.5) == "12.5")
        assertTrue(R.pad3(23.4) == "023")
        assertTrue(R.pad3(359.6) == "360")
    }

    @Test fun numberBoxesClampAndFallBack() {
        assertEquals(41000.0, R.numberFromText("99999", 0.0, 0.0, 41000.0), 0.0)
        assertEquals(100.0, R.numberFromText("", 100.0, 100.0, 400.0), 0.0)
        assertEquals(100.0, R.numberFromText("abc", 100.0, 100.0, 400.0), 0.0)
        assertEquals(250.0, R.numberFromText("250", 100.0, 100.0, 400.0), 0.0)
        assertEquals(0.0, R.numberFromText("-5", 0.0, 0.0, 50000.0), 0.0)
    }

    @Test fun profileMatchesWeb() {
        val p = R.makeProfile(41000.0)
        assertEquals(7, p.raw.size)
        assertEquals(5, p.points.size)
        assertEquals(61.0, p.points[0].y, 1e-9)       // TO: 251 - 190
        assertEquals(31.0, p.points[1].y, 1e-9)       // CLB: 251 - 220
        assertTrue(p.path.startsWith("M54 251 L100 61 L170 31"))
        assertTrue(p.path.endsWith("L578 251"))
        assertEquals(251.0, R.makeProfile(0.0).points[0].y, 1e-9)
        assertEquals(31.0, R.makeProfile(99999.0).points[1].y, 1e-9)
        assertTrue(R.profileAltitudeLabels(25000.0) == listOf("25,000", "20,000", "15,000", "10,000", "5,000", "0"))
    }

    @Test fun landingProfileY() {
        assertEquals(130 - 3000.0 / 20000 * 35, R.landingApproachY(3000.0), 1e-9)
        assertEquals(95.0, R.landingApproachY(20000.0), 1e-9)
        assertEquals(130.0, R.landingApproachY(0.0), 1e-9)
    }

    @Test fun haversineRplLWsss() {
        val a = AirportCoords.AIRPORT_COORDS.getValue("RPLL"); val b = AirportCoords.AIRPORT_COORDS.getValue("WSSS")
        val d = R.haversineNm(a.lat, a.lon, b.lat, b.lon)
        assertEquals(1282.3079, d, 0.001)
        assertEquals(0.0, R.haversineNm(1.0, 2.0, 1.0, 2.0), 1e-9)
    }

    @Test fun routeMapProjection() {
        val m = R.routeMap("RPLL", "WSSS", emptyList(), null)
        assertEquals(2, m.points.size)
        assertEquals(103.994 - 1.0, m.minLon, 1e-9)
        assertEquals(121.0198 + 1.0, m.maxLon, 1e-9)
        // RPLL is the north-east corner: x near the right edge, y near the top
        assertEquals(42 + (121.0198 - m.minLon) / (m.maxLon - m.minLon) * 516, m.points[0].x, 1e-9)
        assertEquals(25 + 1.0 / (14.5086 - 1.3502 + 2.0) * 205, m.points[0].y, 1e-9)
        assertTrue(m.distanceNm != null)
        assertTrue(R.lonGridLabel(m, 0) == "103.0°E")
        // unknown airports fall back to the fixed two-point route
        val u = R.routeMap("ZZZZ", "YYYY", emptyList(), null)
        assertEquals(2, u.points.size)
        assertTrue(u.distanceNm == null)
        // (0, 0) waypoints are skipped
        val w = R.routeMap("RPLL", "WSSS", listOf(ActiveFlightWaypoint("a", "A", 0.0, 0.0, 0.0, 0.0), ActiveFlightWaypoint("b", "B", 8.0, 112.0, 0.0, 0.0)), null)
        assertEquals(3, w.points.size)
        assertTrue(w.points[1].name == "B")
    }

    @Test fun waypointTexts() {
        val vec = ActiveFlightWaypoint("VCT-A", "VCT-A", 1.5, 104.2, 3500.0, 210.0)
        assertTrue(R.waypointSource(vec) == "vector")
        assertTrue(R.waypointSource(ActiveFlightWaypoint("SID-ATMIG", "ATMIG", 14.4, 120.4, 0.0, 0.0)) == "charted")
        assertTrue(R.waypointSource(ActiveFlightWaypoint("123-FOO", "FOO", 1.0, 1.0, 0.0, 0.0)) == "user")
        assertTrue(R.waypointMeta(vec) == "1.50000, 104.20000 · Plan 3,500 ft · 210 kt · Synthetic vector")
        assertTrue(R.waypointMeta(ActiveFlightWaypoint("x", "X", 1.0, 2.0, 0.0, 0.0)).endsWith("· Plan 0 ft · No speed constraint · User/screenshot-derived"))
        val catalog = NavaidsChangi.CHANGI_NAVAIDS.first { it.available && it.source.contains("CAAS AIP") }
        assertTrue(R.waypointSource(ActiveFlightWaypoint(catalog.id, catalog.ident, catalog.lat, catalog.lon, 0.0, 0.0)) == "charted")
        assertTrue(R.airportLabel("RPLL") == "Manila / NAIA")
        assertTrue(R.airportLabel("XXXX").startsWith("Airport reference not available"))
    }

    @Test fun moveAndRemove() {
        val l = listOf("a", "b", "c").map { ActiveFlightWaypoint(it, it, 1.0, 1.0, 0.0, 0.0) }
        assertTrue(R.moveWaypoint(l, 1, -1).map { it.id } == listOf("b", "a", "c"))
        assertTrue(R.moveWaypoint(l, 1, 1).map { it.id } == listOf("a", "c", "b"))
        assertTrue(R.moveWaypoint(l, 0, -1) == l)
        assertTrue(R.moveWaypoint(l, 2, 1) == l)
        assertTrue(R.removeWaypoint(l, "b").map { it.id } == listOf("a", "c"))
    }

    @Test fun ilsOptionsPutDestinationFirst() {
        val all = R.ilsOptions("")
        assertTrue(all.isNotEmpty())
        assertTrue(all.all { FlightPlanIls.isIlsNavaid(it) && it.available })
        val first = R.ilsOptions("wsss")
        assertTrue(first.first().airport == "WSSS")
        val seenOther = first.indexOfFirst { it.airport != "WSSS" }
        assertTrue(seenOther == -1 || first.drop(seenOther).none { it.airport == "WSSS" })
        val label = R.ilsOptionLabel(NavaidsChangi.CHANGI_NAVAIDS.first { it.id == "WSSS-ILS-02L" })
        assertTrue(label.startsWith("WSSS RWY 02L · "))
        assertTrue(label.endsWith("MHz · 023°"))
    }

    @Test fun pickerFiltersAndKinds() {
        val all = R.pickerStations(FlightPlanPageRules.Kinds())
        assertTrue(all.all { it.available && it.kind != NavaidsChangi.NavaidKind.DME })
        val vor = R.pickerStations(FlightPlanPageRules.Kinds(vor = true, ndb = false, ils = false))
        assertTrue(vor.all { R.kindLabel(it.kind) == "VOR" })
        assertTrue(R.pickerStations(FlightPlanPageRules.Kinds(false, false, false)).isEmpty())
        assertTrue(R.kindLabel(NavaidsChangi.NavaidKind.LOC) == "ILS/LOC")
        assertTrue(NavaidsChangi.CHANGI_NAVAIDS.filter { it.kind == NavaidsChangi.NavaidKind.VOR_DME }.all { R.stationKindText(it) == "VOR/DME" })
    }

    @Test fun canSaveNeedsFourCharCodes() {
        assertTrue(R.canSave("rpll", "wsss"))
        assertFalse(R.canSave("RPL", "WSSS"))
        assertFalse(R.canSave("RPLL", ""))
        assertFalse(R.canSave("RP-L", "WSSS"))
    }

    @Test fun sidOptionsForRunway() {
        val o = R.sidOptions("24")
        assertTrue(o.isNotEmpty())
        assertTrue(o.any { it.third })
        val none = R.sidOptions("99")
        assertTrue(none.all { !it.third && it.second.contains("RWY 99 not encoded") })
        assertTrue(R.sidOptions("").first().second.contains("RWY ?") || R.sidOptions("").first().third.not())
    }

    @Test fun navMetricsPlaceholders() {
        val a = FlightNavigationState(
            planActivatedAt = "x", latitude = 14.50864, longitude = 121.0198, headingDeg = 60.4, altitudeFt = 0.0, groundSpeedKt = 0.0,
            activeLegIndex = 0, activeLegName = "", distanceToNextNm = null, bearingToNextDeg = null, desiredTrackDeg = null,
            crossTrackNm = null, trackErrorDeg = null, distanceToDestinationNm = null, phase = FlightPhase.PARKED,
            positionMode = PositionMode.INITIALIZED_AT_DEPARTURE, updatedAt = "t",
        )
        val m = R.navMetrics(a)
        assertEquals(10, m.size)
        assertTrue(m[0].second == "14.5086, 121.0198")
        assertTrue(m[1].second == "60° / 0 kt")
        assertTrue(m[2].second == "—")
        assertTrue(m[3].second == "--- / ---")
        assertTrue(m[7].second == "--- / ---")
        assertTrue(m[8].second == "--- / ---")
        assertTrue(m[9].second == "---")
        val b = a.copy(activeLegName = "VERDE", distanceToNextNm = 12.34, bearingToNextDeg = 45.5, desiredTrackDeg = 46.0, crossTrackNm = -0.456, trackErrorDeg = 3.2,
            guidanceHeadingMagDeg = 45.0, guidanceTargetAltFt = 10000.0, guidanceVertMode = VertMode.CLIMB, guidanceSpeedKt = 250.0, guidanceDistToTodNm = 0.0)
        val n = R.navMetrics(b)
        assertTrue(n[3].second == "46° / 12.3 NM")
        assertTrue(n[4].second == "46° TRUE")
        assertTrue(n[5].second == "L 0.46 NM")
        assertTrue(n[6].second == "+3°")
        assertTrue(n[7].second == "045° M / 10,000 ft")
        assertTrue(n[8].second == "CLIMB / 250 kt IAS")
        assertTrue(n[9].second == "Descending")
        assertTrue(R.navMetrics(b.copy(guidanceDistToTodNm = 87.4))[9].second == "87 NM")
    }

    @Test fun noticesMatchWeb() {
        val p = FlightPlanDraft()
        assertTrue(R.loadedNotice(p, 60.3).contains("Aircraft lined up on RWY 06 (060° magnetic)."))
        assertFalse(R.loadedNotice(p, null).contains("lined up"))
        assertTrue(R.headingBugNotice(7, "").startsWith("Heading selector set to 007° from the current bearing to the next waypoint."))
        assertTrue(R.procedureStatusText("chart-checked").startsWith("User marked"))
        assertTrue(R.procedureStatusText("unverified").startsWith("Unverified"))
        assertTrue(R.greatCircleText(1334.4).contains("approximately 1,334 NM"))
        assertTrue(R.coordText(null) == "Coordinates not in local airport table")
        assertTrue(R.alternateText("WMKK") == "Alternate WMKK: 2.7456, 101.7072.")
        assertTrue(R.alternateText("XXXX").contains("not plotted"))
    }

    @Test fun draftDefaultsMatchDefaultPlan() {
        val d = FlightPlanDraft()
        assertEquals(NavData.WSSS_ILS_02L.thrLat, d.destinationLat!!, 0.0)
        assertEquals(NavData.WSSS_ILS_02L.thrLon, d.destinationLon!!, 0.0)
        val r = FlightPlanEdits.addUserWaypoint(d, "abc", "99", "10", "1000", "200", "id")
        assertTrue(r is FlightPlanEdits.Result.Refused && r.reason.endsWith("so it can be plotted geographically."))
    }
}
