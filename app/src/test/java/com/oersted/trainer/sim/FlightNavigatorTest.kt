package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Hand-written checks for FlightRoute and FlightNavigator (flightNavigation.ts). */
class FlightNavigatorTest {
    private fun plan(
        departure: String = "RPLL",
        destination: String = "WSSS",
        depRunway: String = "06",
        waypoints: List<ActiveFlightWaypoint> = emptyList(),
        arrival: ActiveArrival? = null,
        timeCompression: Double? = null,
    ) = ActiveFlightPlan(
        activatedAt = "2026-11-02T00:00:00Z", callsign = "TEST", departure = departure, destination = destination,
        alternate = "", departureRunway = depRunway, arrivalRunway = "02L", cruiseAltitudeFt = 35000.0, cruiseSpeedKt = 250.0,
        sid = "", enrouteRoute = "", star = "", approach = "", procedureStatus = "unverified",
        waypoints = waypoints, arrival = arrival, timeCompression = timeCompression,
    )

    private fun telemetry(dt: Double = 1.0, gs: Double = 0.0, heading: Double = 0.0, alt: Double = 0.0, wow: Boolean = true) =
        NavigationTelemetry(dt, gs, heading, alt, wow)

    @Test fun departurePointUsesRunwayThresholdWhenKnown() {
        val p = FlightRoute.departurePoint(plan(depRunway = "06"))!!
        assertEquals(NavData.AIRPORT_DATA.getValue("RPLL").runways.getValue("06").thrLat, p.lat, 0.0)
        // Unknown runway falls back to the aerodrome reference point.
        val fallback = FlightRoute.departurePoint(plan(depRunway = "99"))!!
        assertEquals(NavData.AIRPORT_DATA.getValue("RPLL").arpLat, fallback.lat, 0.0)
    }

    @Test fun departureRunwayHeadingIsMagnetic() {
        // RWY 06 true bearing 60.3, variation -2.5 => magnetic 62.8.
        assertEquals(62.8, FlightRoute.departureRunwayHeadingMag(plan(depRunway = "06"))!!, 1e-9)
        assertTrue(FlightRoute.departureRunwayHeadingMag(plan(depRunway = "99")) == null)
    }

    @Test fun targetListAppendsDestinationAndDropsInvalidFixes() {
        val wps = listOf(
            ActiveFlightWaypoint("1", "GOOD", 10.0, 110.0, 5000.0, 250.0),
            ActiveFlightWaypoint("2", "BAD", 95.0, 110.0, 5000.0, 250.0), // latitude out of range
        )
        val targets = FlightRoute.targetList(plan(waypoints = wps))
        assertEquals(listOf("GOOD", "WSSS"), targets.map { it.name })
    }

    @Test fun routePointsStartWithDepartureAndEndWithDestination() {
        val pts = FlightRoute.planRoutePoints(plan())
        assertEquals("RPLL", pts.first().name)
        assertEquals(FlightRoute.RoutePointKind.DEP, pts.first().kind)
        assertEquals(FlightRoute.RoutePointKind.DEST, pts.last().kind)
        assertEquals("WSSS", pts.last().name)
    }

    @Test fun resetPublishesAndInitializesAtDeparture() {
        val published = mutableListOf<FlightNavigationState>()
        val nav = FlightNavigator(clock = { "T0" }, onPublish = { published.add(it) })
        val s = nav.reset(plan(), telemetry())
        assertEquals(PositionMode.INITIALIZED_AT_DEPARTURE, s.positionMode)
        assertEquals(FlightPhase.PARKED, s.phase)
        assertEquals("T0", s.updatedAt)
        assertEquals(1, published.size)
        assertTrue(nav.liveGuidance() === INACTIVE_GUIDANCE)
    }

    @Test fun noPlanClearsGuidance() {
        val nav = FlightNavigator()
        nav.advance(null, telemetry(gs = 200.0))
        assertTrue(!nav.liveGuidance().active)
        assertEquals(null, nav.liveArrival())
    }

    @Test fun ignoresBadTimeStep() {
        val nav = FlightNavigator()
        nav.reset(plan(), telemetry())
        val before = nav.liveState()!!
        nav.advance(plan(), telemetry(dt = 0.0, gs = 200.0, wow = false))
        assertTrue(nav.liveState() === before)
    }

    @Test fun movingAtSpeedCoversSpeedTimesTimeAlongHeading() {
        // Airborne, no compression (altitude gate closed), 250 kt for 10 s => 0.6944 NM.
        val nav = FlightNavigator()
        val p = plan(timeCompression = 1.0)
        nav.reset(p, telemetry())
        val start = nav.liveState()!!
        // Magnetic heading 92.5 => true heading 90 at the departure (variation -2.5).
        nav.advance(p, NavigationTelemetry(dt = 1.0, groundSpeedKt = 250.0, headingDeg = 92.5, altitudeFt = 0.0, wow = false))
        val s = nav.liveState()!!
        // Accumulate 10 ticks of 1 s.
        var cur = s
        repeat(9) {
            nav.advance(p, NavigationTelemetry(dt = 1.0, groundSpeedKt = 250.0, headingDeg = 92.5, altitudeFt = 0.0, wow = false))
            cur = nav.liveState()!!
        }
        val moved = FlightNavigation.distanceNm(start.latitude, start.longitude, cur.latitude, cur.longitude)
        assertEquals(250.0 * 10 / 3600, moved, 0.01)
        // Moved east, so longitude increased on an eastbound heading.
        assertTrue(cur.longitude > start.longitude)
        assertEquals(PositionMode.MOVING_WITH_SIMULATED_AIRCRAFT, cur.positionMode)
    }

    @Test fun groundMovementWhileOnGround() {
        val nav = FlightNavigator()
        val p = plan()
        nav.reset(p, telemetry())
        nav.advance(p, telemetry(dt = 1.0, gs = 30.0, heading = 60.0, wow = true))
        assertEquals(FlightPhase.GROUND_MOVEMENT, nav.liveState()!!.phase)
    }

    @Test fun reportsStateForLoadedRouteAfterAdvance() {
        val nav = FlightNavigator()
        val p = plan()
        nav.reset(p, telemetry())
        nav.advance(p, telemetry(dt = 1.0, gs = 0.0, wow = true))
        val s = nav.liveState()!!
        assertEquals(p.activatedAt, s.planActivatedAt)
        assertEquals(1, s.version)
    }
}
