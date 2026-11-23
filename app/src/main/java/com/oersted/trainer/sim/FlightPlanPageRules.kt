package com.oersted.trainer.sim

import java.math.BigDecimal
import java.math.RoundingMode
import java.util.Locale
import kotlin.math.PI
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Pure helpers of routes/flight-plan.tsx: JS-style number formatting, makeProfile, haversineNm, the GeographicRouteMap
 * projection, the route-sequence / waypoint-list texts, the ILS select list and the "Aircraft navigation state" metrics.
 * The Compose drawing is ui/flightplan/FlightPlanScreen.kt and its helper files.
 */
object FlightPlanPageRules {
    /** JS Number.prototype.toFixed: exact-decimal half-up rounding, sign kept for negatives that round to zero. */
    fun toFixed(v: Double, digits: Int): String {
        if (v.isNaN()) return "NaN"
        val s = BigDecimal(v).setScale(digits, RoundingMode.HALF_UP).toPlainString()
        return if (v < 0 && !s.startsWith("-")) "-$s" else s
    }

    /** JS Math.round */
    fun jsRound(x: Double): Long = floor(x + 0.5).toLong()

    /** String(Math.round(x)).padStart(3, "0") */
    fun pad3(x: Double): String = String.format(Locale.ROOT, "%03d", jsRound(x))

    /** web fmt = Intl.NumberFormat("en-US").format: grouping, at most three fraction digits. */
    fun fmt(n: Double): String {
        val s = BigDecimal(n).setScale(3, RoundingMode.HALF_UP).stripTrailingZeros()
        val plain = if (s.scale() < 0) s.setScale(0) else s
        val str = plain.toPlainString()
        val neg = str.startsWith("-")
        val body = if (neg) str.substring(1) else str
        val intPart = body.substringBefore('.')
        val frac = if (body.contains('.')) "." + body.substringAfter('.') else ""
        val grouped = intPart.reversed().chunked(3).joinToString(",").reversed()
        return (if (neg) "-" else "") + grouped + frac
    }

    fun fmt(n: Int): String = fmt(n.toDouble())

    /** A number as the web would print it with String(n) / template literal. */
    fun jsNum(x: Double): String = if (x == Math.rint(x) && kotlin.math.abs(x) < 1e15) x.toLong().toString() else x.toString()

    fun clamp(v: Double, lo: Double, hi: Double): Double = max(lo, min(hi, v))

    /** Number(text) || fallback, then clamp: the numeric input boxes of the planner. */
    fun numberFromText(text: String, fallback: Double, lo: Double, hi: Double): Double {
        val t = text.trim()
        val v = if (t.isEmpty()) 0.0 else t.toDoubleOrNull() ?: 0.0
        return clamp(if (v == 0.0 || v.isNaN()) fallback else v, lo, hi)
    }

    // ── cruise profile (makeProfile) ──
    data class ProfilePoint(val x: Double, val y: Double, val label: String)
    data class Profile(val points: List<ProfilePoint>, val raw: List<ProfilePoint>) {
        /** SVG path "M54 251 L100 .. " built from the raw points. */
        val path: String get() = raw.mapIndexed { i, p -> "${if (i == 0) "M" else "L"}${jsNum(p.x)} ${jsNum(p.y)}" }.joinToString(" ")
    }

    fun makeProfile(cruiseAltitude: Double): Profile {
        val a = max(0.0, min(41000.0, cruiseAltitude))
        val raw = listOf(
            ProfilePoint(54.0, 251.0, ""),
            ProfilePoint(100.0, 251 - a / 41000 * 190, "TO"),
            ProfilePoint(170.0, 251 - a / 41000 * 220, "CLB"),
            ProfilePoint(270.0, 251 - a / 41000 * 220, "CRZ"),
            ProfilePoint(365.0, 251 - a / 41000 * 175, "DSC"),
            ProfilePoint(465.0, 251 - a / 41000 * 65, "APP"),
            ProfilePoint(578.0, 251.0, ""),
        )
        return Profile(raw.filter { it.label.isNotEmpty() }, raw)
    }

    /** Altitude gridline labels of the cruise profile: fmt(Math.round((5 - i) * cruise / 5)), i = 0..5. */
    fun profileAltitudeLabels(cruiseAltitude: Double): List<String> = (0..5).map { fmt(jsRound((5 - it) * cruiseAltitude / 5).toDouble()) }

    /** Y of the landing-profile approach point: Math.max(75, 130 - alt / 20000 * 35). */
    fun landingApproachY(approachAltitudeFt: Double): Double = max(75.0, 130 - approachAltitudeFt / 20000 * 35)

    // ── geographic route map ──
    fun haversineNm(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val r = 3440.065
        fun rad(v: Double) = v * PI / 180
        val dLat = rad(lat2 - lat1); val dLon = rad(lon2 - lon1)
        val a = sin(dLat / 2).pow(2) + cos(rad(lat1)) * cos(rad(lat2)) * sin(dLon / 2).pow(2)
        return 2 * r * asin(sqrt(a))
    }

    data class MapPoint(val name: String, val lat: Double, val lon: Double, val kind: String, val x: Double = 0.0, val y: Double = 0.0)
    data class RouteMap(
        val points: List<MapPoint>,
        val minLon: Double,
        val maxLon: Double,
        val aircraft: Pair<Double, Double>?,
        val distanceNm: Double?,
        val start: AirportCoords.Coord?,
        val end: AirportCoords.Coord?,
    )

    /** Whether the aircraft is shown: positionMode is not NO GEOGRAPHIC REFERENCE and the position is finite. */
    fun hasAircraft(nav: FlightNavigationState?): Boolean =
        nav != null && nav.positionMode != PositionMode.NO_GEOGRAPHIC_REFERENCE && nav.latitude.isFinite() && nav.longitude.isFinite()

    /** GeographicRouteMap: route coordinates, bounds (+-1 deg) and the 600 x 270 projection. */
    fun routeMap(departure: String, destination: String, waypoints: List<ActiveFlightWaypoint>, nav: FlightNavigationState?): RouteMap {
        val start = AirportCoords.AIRPORT_COORDS[departure]
        val end = AirportCoords.AIRPORT_COORDS[destination]
        val coords = buildList {
            if (start != null) add(MapPoint(departure, start.lat, start.lon, "airport"))
            waypoints.filter { it.latitude.isFinite() && it.longitude.isFinite() && (it.latitude != 0.0 || it.longitude != 0.0) }
                .forEach { add(MapPoint(it.name, it.latitude, it.longitude, "waypoint")) }
            if (end != null) add(MapPoint(destination, end.lat, end.lon, "airport"))
        }
        val routeCoords = coords.ifEmpty {
            listOf(MapPoint(departure, 14.5086, 121.0198, "airport"), MapPoint(destination, 1.3502, 103.9940, "airport"))
        }
        val air = hasAircraft(nav)
        val bLat = routeCoords.map { it.lat } + if (air) listOf(nav!!.latitude) else emptyList()
        val bLon = routeCoords.map { it.lon } + if (air) listOf(nav!!.longitude) else emptyList()
        val minLat = bLat.min() - 1.0; val maxLat = bLat.max() + 1.0
        val minLon = bLon.min() - 1.0; val maxLon = bLon.max() + 1.0
        fun project(lat: Double, lon: Double) = Pair(
            42 + (lon - minLon) / max(0.1, maxLon - minLon) * 516,
            25 + (maxLat - lat) / max(0.1, maxLat - minLat) * 205,
        )
        val pts = routeCoords.map { val (x, y) = project(it.lat, it.lon); it.copy(x = x, y = y) }
        val acPt = if (air) project(nav!!.latitude, nav.longitude) else null
        val dist = if (start != null && end != null) haversineNm(start.lat, start.lon, end.lat, end.lon) else null
        return RouteMap(pts, minLon, maxLon, acPt, dist, start, end)
    }

    /** (minLon + (maxLon - minLon) * i / 5).toFixed(1) + "°E" */
    fun lonGridLabel(map: RouteMap, i: Int): String = toFixed(map.minLon + (map.maxLon - map.minLon) * i / 5, 1) + "°E"

    /** "Great-circle reference: approximately N NM. ..." */
    fun greatCircleText(distanceNm: Double): String =
        "Great-circle reference: approximately ${fmt(jsRound(distanceNm).toDouble())} NM. Straight-line reference only; the actual route depends on charted procedures, airways, clearances and restrictions."

    fun coordText(c: AirportCoords.Coord?): String = if (c == null) "Coordinates not in local airport table" else "${toFixed(c.lat, 4)}, ${toFixed(c.lon, 4)}"

    fun alternateText(alternate: String): String {
        val c = AirportCoords.AIRPORT_COORDS[alternate]
        return "Alternate $alternate: ${if (c != null) "${toFixed(c.lat, 4)}, ${toFixed(c.lon, 4)}" else "not plotted (add airport coordinates to local table)"}."
    }

    // ── route sequence and waypoint list ──
    fun airportLabel(code: String): String = AirportCoords.AIRPORT_COORDS[code]?.label ?: "Airport reference not available in local coordinate table"

    /** Source tag the web stores on each waypoint, derived from the id: SID fixes are charted, VCT fixes are vectors, catalogue stations by their source text. */
    fun waypointSource(wp: ActiveFlightWaypoint): String = when {
        wp.id.startsWith("SID-") -> "charted"
        wp.id.startsWith("VCT-") -> "vector"
        else -> {
            val n = NavaidsChangi.CHANGI_NAVAIDS.firstOrNull { it.id == wp.id }
            if (n != null && n.source.contains("CAAS AIP")) "charted" else "user"
        }
    }

    fun sourceLabel(source: String): String = when (source) {
        "charted" -> "Chart/AIP catalog"
        "vector" -> "Synthetic vector"
        else -> "User/screenshot-derived"
    }

    fun latLonText(wp: ActiveFlightWaypoint): String = "${toFixed(wp.latitude, 5)}, ${toFixed(wp.longitude, 5)}"

    /** "lat, lon · Plan N ft · speed · source" */
    fun waypointMeta(wp: ActiveFlightWaypoint): String =
        "${latLonText(wp)} · Plan ${fmt(wp.altitudeFt)} ft · ${if (wp.speedKt != 0.0) "${jsNum(wp.speedKt)} kt" else "No speed constraint"} · ${sourceLabel(waypointSource(wp))}"

    /** The ILS row of the route sequence: first line and second line. */
    fun ilsRowTitle(ils: ActiveIls) = "${ils.ident} · RWY ${ils.runway}"
    fun ilsRowDetail(ils: ActiveIls) = "${ils.name} · ${toFixed(ils.frequencyMHz, 2)} MHz · course ${pad3(ils.courseMag)}°"

    /** Move waypoint [index] by [delta] (-1 up, +1 down); unchanged when out of range. */
    fun moveWaypoint(list: List<ActiveFlightWaypoint>, index: Int, delta: Int): List<ActiveFlightWaypoint> {
        val j = index + delta
        if (index !in list.indices || j !in list.indices) return list
        return list.toMutableList().also { val t = it[index]; it[index] = it[j]; it[j] = t }
    }

    /** Remove by id (the web filters every waypoint with the same id). */
    fun removeWaypoint(list: List<ActiveFlightWaypoint>, id: String): List<ActiveFlightWaypoint> = list.filter { it.id != id }

    // ── ILS select ──
    /** ILS / localizer stations of the catalogue; those of the destination airport first (stable sort, as the web). */
    fun ilsOptions(destination: String): List<NavaidsChangi.Navaid> {
        val dest = destination.trim().uppercase()
        return NavaidsChangi.CHANGI_NAVAIDS.filter { it.available && FlightPlanIls.isIlsNavaid(it) }
            .sortedBy { if (it.airport == dest) 0 else 1 }
    }

    fun ilsOptionLabel(n: NavaidsChangi.Navaid): String =
        "${n.airport} RWY ${n.runway ?: "?"} · ${n.ident} ${toFixed(n.frequency, 2)} MHz · ${pad3(n.courseMag ?: 0.0)}°"

    fun ilsSelectedText(ils: ActiveIls): String = "${ils.ident} · ${ils.name} · ${toFixed(ils.frequencyMHz, 2)} MHz · course ${pad3(ils.courseMag)}°"

    /** The notice shown after setIls (flight-plan.tsx). */
    fun ilsSetNotice(station: NavaidsChangi.Navaid, ils: ActiveIls, dest: String, keepsVectors: Boolean): String {
        val mismatch = if (station.airport.isNotEmpty() && dest.isNotEmpty() && station.airport != dest) " Note: this ILS belongs to ${station.airport}, but the destination is $dest." else ""
        return "${station.ident} (${station.name}, ${toFixed(station.frequency, 2)} MHz, course ${pad3(ils.courseMag)}°) set as the ILS for the approach. The destination airport is unchanged; the Navigation map tunes this ILS as the last radio target." +
            (if (keepsVectors) "" else " The synthetic vectored arrival was removed because it only applies to ILS 02L.") + mismatch
    }

    fun stationFreqText(n: NavaidsChangi.Navaid): String = "${toFixed(n.frequency, if (n.kind == NavaidsChangi.NavaidKind.NDB) 0 else 2)} ${if (n.kind == NavaidsChangi.NavaidKind.NDB) "kHz" else "MHz"}"

    fun stationSelectedNotice(n: NavaidsChangi.Navaid): String = "${n.ident} selected · ${n.name} · ${stationFreqText(n)}. Add it to insert it into the route."

    fun navaidAddedNotice(n: NavaidsChangi.Navaid): String =
        "${n.ident} added to the route (${stationFreqText(n)}). " +
            if (n.source.contains("approximate map coordinates") || n.source.contains("screenshot")) "This station is screenshot-derived and its current CAAP AIP data is not yet verified." else "Verify station and route details against current official charts."

    // ── station picker ──
    /** JS Number.toString of the catalogue frequency: 110.9 -> "110.9", 112 -> "112". */
    fun freqPlain(n: NavaidsChangi.Navaid): String = jsNum(n.frequency)

    fun kindLabel(k: NavaidsChangi.NavaidKind): String = when (k) {
        NavaidsChangi.NavaidKind.VOR, NavaidsChangi.NavaidKind.VOR_DME -> "VOR"
        NavaidsChangi.NavaidKind.NDB -> "NDB"
        else -> "ILS/LOC"
    }

    data class Kinds(val vor: Boolean = true, val ndb: Boolean = true, val ils: Boolean = true)

    /** Stations visible with the filter chips: only available VOR / NDB / ILS-LOC stations (DME-only is never shown). */
    fun pickerStations(kinds: Kinds): List<NavaidsChangi.Navaid> = NavaidsChangi.CHANGI_NAVAIDS.filter { n ->
        if (!n.available) false else when (n.kind) {
            NavaidsChangi.NavaidKind.VOR, NavaidsChangi.NavaidKind.VOR_DME -> kinds.vor
            NavaidsChangi.NavaidKind.NDB -> kinds.ndb
            NavaidsChangi.NavaidKind.ILS, NavaidsChangi.NavaidKind.LOC -> kinds.ils
            else -> false
        }
    }

    fun stationKindText(n: NavaidsChangi.Navaid): String = n.kind.name.replace("_", "/")

    // ── Aircraft navigation state metrics ──
    private fun deg0(v: Double?): String = if (v == null) "---" else toFixed(v, 0) + "°"

    /** The ten Metric cards of the "Aircraft navigation state" card, in web order. */
    fun navMetrics(a: FlightNavigationState): List<Pair<String, String>> = listOf(
        "Current position" to "${toFixed(a.latitude, 4)}, ${toFixed(a.longitude, 4)}",
        "Heading / GS" to "${toFixed(a.headingDeg, 0)}° / ${toFixed(a.groundSpeedKt, 0)} kt",
        "Next leg" to a.activeLegName.ifEmpty { "—" },
        "Bearing / range" to "${deg0(a.bearingToNextDeg)} / ${if (a.distanceToNextNm == null) "---" else toFixed(a.distanceToNextNm, 1) + " NM"}",
        "Desired leg track" to if (a.desiredTrackDeg == null) "---" else "${toFixed(a.desiredTrackDeg, 0)}° TRUE",
        "Cross-track error" to if (a.crossTrackNm == null) "---" else "${if (a.crossTrackNm >= 0) "R" else "L"} ${toFixed(kotlin.math.abs(a.crossTrackNm), 2)} NM",
        "Track / heading error" to if (a.trackErrorDeg == null) "---" else "${if (a.trackErrorDeg >= 0) "+" else ""}${toFixed(a.trackErrorDeg, 0)}°",
        "PLAN NAV heading / altitude" to "${if (a.guidanceHeadingMagDeg == null) "---" else pad3(a.guidanceHeadingMagDeg) + "° M"} / ${if (a.guidanceTargetAltFt == null) "---" else fmt(a.guidanceTargetAltFt) + " ft"}",
        "Vertical mode / speed advisory" to "${a.guidanceVertMode?.name ?: "---"} / ${if (a.guidanceSpeedKt == null) "---" else jsNum(a.guidanceSpeedKt) + " kt IAS"}",
        "Descent starts in" to when {
            a.guidanceDistToTodNm == null -> "---"
            a.guidanceDistToTodNm <= 0 -> "Descending"
            else -> toFixed(a.guidanceDistToTodNm, 0) + " NM"
        },
    )

    fun navFootnote(a: FlightNavigationState, updatedClock: String): String =
        "Route guidance is a training calculation. The button copies the current bearing to the existing heading selector as a one-time update; PLAN NAV is the switch that follows the route. Position source: ${a.positionMode.label}. Updated $updatedClock."

    fun headingBugNotice(target: Int, legName: String): String =
        "Heading selector set to ${String.format(Locale.ROOT, "%03d", target)}° from the current bearing to ${legName.ifEmpty { "the next waypoint" }}. This is a one-time magnetic heading-bug update: engage HDG SEL on the modeled autopilot panel if desired. Use PLAN NAV to follow the whole route."

    const val NO_BEARING_NOTICE = "No active waypoint bearing is available. Load a plan with a geographic destination or waypoint first."

    fun planNavNotice(next: Boolean): String =
        if (next) "PLAN NAV armed. Engage AIL on the autopilot to steer along the plan; engage ELEV with the pitch switch OFF to follow its altitudes."
        else "PLAN NAV off. The autopilot flies the heading bug and ALT HOLD as before."

    // ── buttons / notices ──
    /** canSave: both airport codes are four letters / digits. */
    fun canSave(departure: String, destination: String): Boolean {
        val re = Regex("^[A-Z0-9]{4}$")
        return re.matches(departure.trim().uppercase()) && re.matches(destination.trim().uppercase())
    }

    const val INITIAL_NOTICE = "Planning workspace ready. No route has been loaded into the aircraft model."
    const val INVALID_AIRPORTS_NOTICE = "Enter valid four-character departure and destination airport identifiers before loading the route."

    fun loadedNotice(plan: FlightPlanDraft, hdg: Double?): String =
        "Flight plan ${plan.departure} → ${plan.destination} loaded." +
            (if (hdg != null) " Aircraft lined up on RWY ${plan.departureRunway} (${pad3(hdg)}° magnetic)." else "") +
            " Aircraft is parked and PLAN NAV is armed: nothing moves until you press TAKEOFF in Navigation. PLAN NAV then steers only while the autopilot AIL (and ELEV for altitude) is engaged; the HDG SEL switch or ALT HOLD always overrides it."

    const val PRESET_NOTICE = "Manila → Singapore loaded: RWY 24 VERDE2B with published fixes, then vectors to ILS RWY 02L. The aircraft is parked and lined up on RWY 24 with PLAN NAV armed. Nothing moves until you press TAKEOFF in Navigation; PLAN NAV then steers only while the autopilot AIL (and ELEV for altitude, pitch switch OFF) is engaged. Procedures stay marked unverified; check them against current charts."

    const val SAVED_NOTICE = "Flight plan saved on this device. The map and profiles use this plan, and PLAN NAV on the trainer autopilot uses it for guidance when activated."
    const val RESET_NOTICE = "Plan reset to the default flight-planning template."
    const val ILS_CLEARED_NOTICE = "ILS removed from the plan."
    const val NO_STATION_NOTICE = "Select an active VOR, NDB, or ILS station on the map first."

    fun addedCustomNotice(name: String) = "$name added and plotted using the coordinates you entered. Confirm coordinates against an official chart before use."

    fun procedureStatusText(status: String): String =
        if (status == "chart-checked") "User marked chart-checked (not independently verified by Oersted)." else "Unverified — procedure names and runway selections are not confirmed."

    /** Departure SID select rows: (value, label, enabled). */
    fun sidOptions(departureRunway: String): List<Triple<String, String, Boolean>> =
        NavData.RPLL_SIDS.keys.map { base ->
            val name = NavData.sidProcedureName(base, departureRunway)
            Triple(base, name ?: "$base (RWY ${departureRunway.ifEmpty { "?" }} not encoded)", name != null)
        }
}
