package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Hand-written checks for the pure helpers in FlightNavigation (flightNavigation.ts). */
class FlightNavigationTest {
    @Test fun compressionIsOneOnGroundOrWhenDisabled() {
        assertEquals(1.0, FlightNavigation.enrouteCompression(15.0, true, 35000.0, 35000.0, 200.0, null), 0.0)
        assertEquals(1.0, FlightNavigation.enrouteCompression(1.0, false, 35000.0, 35000.0, 200.0, null), 0.0)
    }

    @Test fun compressionFullWhenCruisingFarFromTod() {
        // At cruise altitude, 200 NM before top of descent: both gates full.
        assertEquals(15.0, FlightNavigation.enrouteCompression(15.0, false, 35000.0, 35000.0, 200.0, null), 1e-9)
    }

    @Test fun compressionZeroGateNearTodAndWithoutRemainingDistance() {
        // 5 NM before TOD: distance gate closed.
        assertEquals(1.0, FlightNavigation.enrouteCompression(15.0, false, 35000.0, 35000.0, 5.0, null), 1e-9)
        // No TOD and no destination distance: distance gate closed.
        assertEquals(1.0, FlightNavigation.enrouteCompression(15.0, false, 35000.0, 35000.0, null, null), 1e-9)
    }

    @Test fun compressionStaysBetweenOneAndMax() {
        val c = FlightNavigation.enrouteCompression(15.0, false, 33500.0, 35000.0, 40.0, null) // altitude gate ~0.9, distance gate ~0.65
        assertTrue(c > 1.0 && c < 15.0)
    }

    @Test fun blendTakesShorterArc() {
        assertEquals(5.0, FlightNavigation.blendDeg(350.0, 20.0, 0.5), 1e-9) // shortest arc is +30, midpoint 365 -> 5
        assertEquals(55.0, FlightNavigation.blendDeg(10.0, 100.0, 0.5), 1e-9) // unambiguous arc; a 180 deg arc is ambiguous and the TS takes -180
    }

    @Test fun distanceAndBearingBasics() {
        assertEquals(60.0, FlightNavigation.distanceNm(0.0, 0.0, 1.0, 0.0), 0.05)
        assertEquals(0.0, FlightNavigation.bearingDeg(0.0, 0.0, 1.0, 0.0), 1e-9)
        assertEquals(90.0, FlightNavigation.bearingDeg(0.0, 0.0, 0.0, 1.0), 1e-9)
    }

    @Test fun routeGuidanceOnTrackHasZeroCrossTrack() {
        // Eastbound leg along the equator; aircraft on the leg.
        val g = FlightNavigation.routeGuidance(0.0, 0.5, 90.0, 0.0, 0.0, 0.0, 1.0)
        assertEquals(90.0, g.desiredTrackDeg!!, 1e-9)
        assertEquals(0.0, g.crossTrackNm!!, 1e-6)
        assertEquals(0.0, g.trackErrorDeg!!, 1e-9)
    }

    @Test fun routeGuidanceRightOfTrackIsPositive() {
        // Eastbound leg; aircraft south of the leg is right of track.
        val g = FlightNavigation.routeGuidance(-1.0 / 60, 0.5, 90.0, 0.0, 0.0, 0.0, 1.0)
        assertTrue(g.crossTrackNm!! > 0.0)
    }

    @Test fun routeGuidanceMissingLegGivesNulls() {
        val g = FlightNavigation.routeGuidance(0.0, 0.5, 90.0, null, null, 0.0, 1.0)
        assertTrue(g.desiredTrackDeg == null && g.crossTrackNm == null && g.trackErrorDeg == null)
    }
}
