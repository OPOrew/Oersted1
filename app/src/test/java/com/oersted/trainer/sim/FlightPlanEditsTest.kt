package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FlightPlanEditsTest {
    private val base = FlightPlanDraft()

    @Test fun altitudeAndSpeedBoxesClampAndTreatBlankAsZero() {
        assertEquals(0.0, FlightPlanEdits.altitudeFromText(""), 0.0)
        assertEquals(12000.0, FlightPlanEdits.altitudeFromText(" 12000 "), 0.0)
        assertEquals(45000.0, FlightPlanEdits.altitudeFromText("50000"), 0.0)
        assertEquals(0.0, FlightPlanEdits.altitudeFromText("-5"), 0.0)
        assertEquals(0.0, FlightPlanEdits.altitudeFromText("abc"), 0.0)
        assertEquals(400.0, FlightPlanEdits.speedFromText("500"), 0.0)
        assertEquals(210.0, FlightPlanEdits.speedFromText("210"), 0.0)
    }

    @Test fun coordinatesNeedBothAndInRange() {
        assertEquals(-1.5 to 103.9, FlightPlanEdits.parseCoordinates("-1.5", "103.9"))
        assertEquals(null, FlightPlanEdits.parseCoordinates("", "103.9"))
        assertEquals(null, FlightPlanEdits.parseCoordinates("91", "0"))
        assertEquals(null, FlightPlanEdits.parseCoordinates("0", "181"))
        assertEquals(null, FlightPlanEdits.parseCoordinates("abc", "1"))
    }

    @Test fun userWaypointIsUpperCasedAndAppended() {
        val r = FlightPlanEdits.addUserWaypoint(base, " ab12 ", "1.0", "103.0", "8000", "250", "id-1")
        assertTrue(r is FlightPlanEdits.Result.Added)
        val added = r as FlightPlanEdits.Result.Added
        assertEquals("user", added.source)
        val wp = added.draft.waypoints.single()
        assertEquals("AB12", wp.name)
        assertEquals("id-1", wp.id)
        assertEquals(8000.0, wp.altitudeFt, 0.0)
        assertEquals(250.0, wp.speedKt, 0.0)
    }

    @Test fun userWaypointRefusesBlankNameBadCoordsAndDuplicates() {
        assertEquals("Enter a waypoint identifier before adding it.",
            (FlightPlanEdits.addUserWaypoint(base, "  ", "1", "1", "0", "0", "x") as FlightPlanEdits.Result.Refused).reason)
        assertTrue(FlightPlanEdits.addUserWaypoint(base, "AB", "", "1", "0", "0", "x") is FlightPlanEdits.Result.Refused)
        val once = (FlightPlanEdits.addUserWaypoint(base, "AB", "1", "1", "0", "0", "x1") as FlightPlanEdits.Result.Added).draft
        val twice = FlightPlanEdits.addUserWaypoint(once, "ab", "2", "2", "0", "0", "x2")
        assertEquals("AB is already in the route.", (twice as FlightPlanEdits.Result.Refused).reason)
    }

    @Test fun navaidIsAddedOnceWithItsIdentAndSource() {
        val station = NavaidsChangi.CHANGI_NAVAIDS.first()
        val added = FlightPlanEdits.addNavaid(base, station, "5000", "180") as FlightPlanEdits.Result.Added
        val wp = added.draft.waypoints.single()
        assertEquals(station.id, wp.id)
        assertEquals(station.ident, wp.name)
        assertEquals(5000.0, wp.altitudeFt, 0.0)
        assertEquals(180.0, wp.speedKt, 0.0)
        assertEquals(if (station.source.contains("CAAS AIP")) "charted" else "user", added.source)
        val again = FlightPlanEdits.addNavaid(added.draft, station, "0", "0")
        assertEquals("${station.ident} is already in the route.", (again as FlightPlanEdits.Result.Refused).reason)
    }

    @Test fun headingBugUsesMagneticVariationAndJsRounding() {
        assertEquals(89, FlightPlanEdits.headingBugTarget(90.0, 1.4))   // round(88.6) = 89
        assertEquals(350, FlightPlanEdits.headingBugTarget(10.0, 20.0)) // round(-10) = -10 -> 350
        assertEquals(0, FlightPlanEdits.headingBugTarget(359.6, 0.0))   // round(359.6) = 360 -> 0
        assertEquals(0, FlightPlanEdits.headingBugTarget(0.0, 0.0))
    }
}
