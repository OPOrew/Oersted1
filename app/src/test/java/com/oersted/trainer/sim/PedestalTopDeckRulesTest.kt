package com.oersted.trainer.sim

import com.oersted.trainer.sim.PedestalTopDeckRules as R
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Pure rules of the pedestal top deck units. */
class PedestalTopDeckRulesTest {
    private fun plan(alt: String = "", status: String = "unverified", wps: List<ActiveFlightWaypoint> = emptyList()) = ActiveFlightPlan(
        activatedAt = "t", callsign = "C", departure = "RPLL", destination = "WSSS", alternate = alt,
        departureRunway = "06", arrivalRunway = "20", cruiseAltitudeFt = 30000.0, cruiseSpeedKt = 450.0,
        sid = "", enrouteRoute = "", star = "", approach = "", procedureStatus = status, waypoints = wps,
    )

    private fun nav(
        leg: String = "LACO1", brg: Double? = 129.4, dist: Double? = 12.34, dtk: Double? = 7.0, xtk: Double? = -0.26,
        err: Double? = 3.0, dest: Double? = 99.95, mode: PositionMode = PositionMode.MOVING_WITH_SIMULATED_AIRCRAFT,
    ) = FlightNavigationState(
        planActivatedAt = "t", latitude = 14.5123, longitude = 121.0199, headingDeg = 5.0, altitudeFt = 1234.5,
        groundSpeedKt = 250.4, activeLegIndex = 1, activeLegName = leg, distanceToNextNm = dist, bearingToNextDeg = brg,
        desiredTrackDeg = dtk, crossTrackNm = xtk, trackErrorDeg = err, distanceToDestinationNm = dest,
        phase = FlightPhase.CRUISE, positionMode = mode, updatedAt = "t",
    )

    @Test fun toFixedRoundsHalfAwayFromZeroLikeJs() {
        assertEquals("1", R.toFixed(0.5, 0))
        assertEquals("3", R.toFixed(2.5, 0))
        assertEquals("-3", R.toFixed(-2.5, 0))
        assertEquals("-0", R.toFixed(-0.4, 0))
        assertEquals("12.3", R.toFixed(12.34, 1))
        assertEquals("121.020", R.toFixed(121.0199, 3))
        assertEquals("0.00", R.toFixed(0.0, 2))
    }

    @Test fun jsNumDropsTheTrailingZeroOfWholeNumbers() {
        assertEquals("5", R.jsNum(5.0))
        assertEquals("-3", R.jsNum(-3.0))
        assertEquals("0", R.jsNum(0.0))
        assertEquals("2.5", R.jsNum(2.5))
    }

    @Test fun gpsWithoutAPlanShowsTheDefaultText() {
        assertEquals(listOf("NAV  NO ACTIVE WPT"), R.gpsLines(null, null, "NAV"))
        assertEquals(listOf("FPL 0  EMPTY"), R.gpsLines(null, nav(), "FPL"))
        assertEquals("NAV", R.gpsPage("JUNK"))
        assertEquals("MSG", R.gpsPage("MSG"))
    }

    @Test fun gpsNavAndWptPagesUseTheNavigatorState() {
        val p = plan()
        assertEquals(listOf("NAV RPLL > WSSS", "CRUISE · HDG 005"), R.gpsLines(p, nav(), "NAV"))
        assertEquals(listOf("NAV RPLL > WSSS", "PLAN ACTIVE · HDG 000"), R.gpsLines(p, null, "NAV"))
        assertEquals(
            listOf("TO LACO1", "BRG 129 · 12.3NM", "DTK 007 · XTK L0.3NM"),
            R.gpsLines(p, nav(), "WPT"),
        )
        assertEquals(
            listOf("TO WSSS", "BRG --- · ---.-NM", "DTK --- · XTK ---NM"),
            R.gpsLines(p, null, "WPT"),
        )
        val wp = ActiveFlightWaypoint("1", "VAMPS", 0.0, 0.0, 0.0, 0.0)
        assertEquals("TO VAMPS", R.gpsLines(plan(wps = listOf(wp)), null, "WPT")[0])
        assertEquals("DTK 007 · XTK R1.0NM", R.gpsLines(p, nav(xtk = 0.96), "WPT")[2])
    }

    @Test fun gpsOtherPages() {
        val p = plan(alt = "RPLC", status = "chart-checked")
        assertEquals(listOf("RPLL > WSSS", "ALT RPLC"), R.gpsLines(p, nav(), "APT/VOR"))
        assertEquals("ALT ----", R.gpsLines(plan(), nav(), "APT/VOR")[1])
        assertEquals(listOf("DEST WSSS", "RNG 100.0NM"), R.gpsLines(p, nav(), "D→"))
        assertEquals(listOf("FPL RPLL > WSSS", "LEG 2 · 0 FIX", "PROC USER CHECKED"), R.gpsLines(p, nav(), "FPL"))
        assertEquals("PROC UNVERIFIED", R.gpsLines(plan(), nav(), "FPL")[2])
        assertEquals(listOf("GS 250 KT · HDG 005", "ALT 1235 FT", "TRK ERR +3°"), R.gpsLines(p, nav(), "CALC"))
        assertEquals("TRK ERR -4°", R.gpsLines(p, nav(err = -3.6), "CALC")[2])
        assertEquals("TRK ERR ---°", R.gpsLines(p, nav(err = null), "CALC")[2])
        assertEquals(listOf("AIRCRAFT POSITION", "14.512, 121.020"), R.gpsLines(p, nav(), "AUX"))
        assertEquals(listOf("USER MARKED CHECKED", "POS TRACKING ACTIVE"), R.gpsLines(p, nav(), "MSG"))
        assertEquals(
            listOf("PROCEDURES UNVERIFIED", "POSITION NOT MOVING"),
            R.gpsLines(plan(), nav(mode = PositionMode.INITIALIZED_AT_DEPARTURE), "MSG"),
        )
    }

    @Test fun vhfWindowsAndSteps() {
        assertEquals("119.00", R.rf(11900))
        assertEquals("135.95", R.vhfWin(135955))
        assertEquals("118.00", R.vhfWin(118000))
        assertEquals("---.--", R.vhfWindowText(11900, false))
        assertEquals("119.00", R.vhfWindowText(11900, true))
        assertEquals(11905, R.vhfStep(11900, 1))
        assertEquals(11800, R.vhfStep(11800, -1))
        assertEquals(13595, R.vhfStep(13595, 1))
    }

    @Test fun transponderPairsStepAsOctalAndWrap() {
        // the first pair 12 (octal, 10 decimal) steps to 13
        assertEquals("1300", R.xpdrPair("1200", 0, 1))
        // the second pair 77 wraps to 00
        assertEquals("1200", R.xpdrPair("1277", 2, 1))
        // and 00 wraps back to 77
        assertEquals("1277", R.xpdrPair("1200", 2, -1))
        // a short code is padded
        assertEquals("0001", R.xpdrPair("1", 2, 0))
        assertTrue(R.xpdrFail(true, 3))
        assertFalse(R.xpdrFail(false, 3))
        assertFalse(R.xpdrFail(true, 2))
    }

    @Test fun radarHelpers() {
        assertEquals(0, R.radarModeToggle(2, 2))
        assertEquals(3, R.radarModeToggle(2, 3))
        assertEquals(0.0, R.radarGain(0.05), 1e-9)
        assertEquals(0.5, R.radarGain(0.5), 1e-9)
        assertEquals("TILT +5", R.radarTiltLabel(5.0))
        assertEquals("TILT 0", R.radarTiltLabel(0.0))
        assertEquals("TILT -3", R.radarTiltLabel(-3.0))
    }

    @Test fun cvrEraseInterlockAndHoldTime() {
        assertTrue(R.cvrEraseAllowed(true, true, true, true, false))
        assertFalse(R.cvrEraseAllowed(true, true, false, true, false))
        assertFalse(R.cvrEraseAllowed(true, true, true, false, false))
        assertFalse(R.cvrEraseAllowed(true, true, true, true, true))
        assertEquals(R.EraseOutcome.NOT_ALLOWED, R.cvrEraseOutcome(false, 5000))
        assertEquals(R.EraseOutcome.TOO_SHORT, R.cvrEraseOutcome(true, 1999))
        assertEquals(R.EraseOutcome.START, R.cvrEraseOutcome(true, 2000))
        assertEquals(40, R.cvrNeedleDeg(true, true))
        assertEquals(-45, R.cvrNeedleDeg(true, false))
    }
}
