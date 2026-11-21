package com.oersted.trainer.sim

import com.oersted.trainer.sim.RouteSequence.SequenceItem
import java.util.Locale
import kotlin.math.PI
import kotlin.math.atan
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sinh
import kotlin.math.sqrt
import kotlin.math.tan

/**
 * Pure logic behind InteractiveNavMap.tsx (Leaflet on the web). Android draws the same map natively (OpenStreetMap raster tiles, Web Mercator,
 * 256 px tiles, Leaflet's zoom model with integer zoom levels); this object holds the projection / fit / smooth-aircraft / auto-tune / text rules
 * so they can be tested without a device. The map only DISPLAYS the simulator: it never moves the aircraft.
 */
object NavMapRules {
    const val TILE = 256.0
    const val MAX_LAT = 85.0511287798
    const val DEFAULT_ZOOM = 6
    /** Leaflet default for the OSM layer here (maxZoom 19). */
    const val MAX_ZOOM = 19
    const val RADAR_MAX_NATIVE_ZOOM = 7
    const val RADAR_MAX_ZOOM = 12
    const val RADAR_OPACITY = 0.6f
    const val AC_CIRCLE_RADIUS_M = 12000.0
    const val DEFAULT_AC_LAT = 14.5085
    const val DEFAULT_AC_LON = 121.0195
    const val FIT_PADDING_PX = 30.0
    const val FIT_MAX_ZOOM = 8
    const val OSM_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
    const val NAV_STATUS_WAITING = "Waiting for aircraft position…"
    const val MANUAL_STATUS = "Manual NAV1 tuning · automatic handoff paused"
    const val RESET_STATUS = "Navigation display reset · aircraft position unchanged"

    data class LatLon(val lat: Double, val lon: Double)

    // ── Web Mercator (EPSG:3857, as Leaflet) ──
    fun scale(zoom: Double): Double = TILE * 2.0.pow(zoom)
    fun worldX(lon: Double, zoom: Double): Double = (lon + 180) / 360 * scale(zoom)
    fun worldY(lat: Double, zoom: Double): Double {
        val l = max(-MAX_LAT, min(MAX_LAT, lat)) * PI / 180
        return (1 - ln(tan(l) + 1 / cos(l)) / PI) / 2 * scale(zoom)
    }
    fun lonOf(x: Double, zoom: Double): Double = x / scale(zoom) * 360 - 180
    fun latOf(y: Double, zoom: Double): Double {
        val n = PI - 2 * PI * y / scale(zoom)
        return 180 / PI * atan(sinh(n))
    }

    data class View(val lat: Double, val lon: Double, val zoom: Int)

    /** Leaflet fitBounds(points, { padding: [30, 30], maxZoom: 8 }) with zoomSnap = 1: the largest integer zoom that fits, capped; centred on the bounds. */
    fun fitBounds(points: List<LatLon>, widthPx: Double, heightPx: Double, padding: Double = FIT_PADDING_PX, maxZoom: Int = FIT_MAX_ZOOM): View? {
        if (points.isEmpty()) return null
        val xs = points.map { worldX(it.lon, 0.0) }; val ys = points.map { worldY(it.lat, 0.0) }
        val bw = xs.max() - xs.min(); val bh = ys.max() - ys.min()
        val availW = max(1.0, widthPx - 2 * padding); val availH = max(1.0, heightPx - 2 * padding)
        val sx = if (bw > 0) availW / bw else Double.POSITIVE_INFINITY
        val sy = if (bh > 0) availH / bh else Double.POSITIVE_INFINITY
        val s = min(sx, sy)
        val z = if (s.isInfinite()) maxZoom else min(maxZoom, max(0, floor(ln(s) / ln(2.0)).toInt()))
        val cx = (xs.min() + xs.max()) / 2; val cy = (ys.min() + ys.max()) / 2
        return View(latOf(cy, 0.0), lonOf(cx, 0.0), z)
    }

    /** web AutoFit key: the list of points to 5 decimals, so the map refits only when the route changes. */
    fun fitKey(points: List<LatLon>): String = points.joinToString("|") { String.format(Locale.ROOT, "%.5f,%.5f", it.lat, it.lon) }

    /** Metres per pixel at a latitude and (fractional) zoom. */
    fun metersPerPixel(lat: Double, zoom: Double): Double = 40075016.686 * cos(lat * PI / 180) / scale(zoom)

    data class Tile(val z: Int, val x: Int, val y: Int, val left: Double, val top: Double)

    /** Tiles covering a viewport (size w x h) centred on [centerLat]/[centerLon] at integer [z]; screen offsets in px. */
    fun tilesFor(centerLat: Double, centerLon: Double, z: Int, w: Double, h: Double, tileSize: Double = TILE): List<Tile> {
        val cx = worldX(centerLon, z.toDouble()); val cy = worldY(centerLat, z.toDouble())
        val n = 1 shl z
        val x0 = floor((cx - w / 2) / tileSize).toInt(); val x1 = floor((cx + w / 2) / tileSize).toInt()
        val y0 = floor((cy - h / 2) / tileSize).toInt(); val y1 = floor((cy + h / 2) / tileSize).toInt()
        val out = ArrayList<Tile>()
        for (ty in max(0, y0)..min(n - 1, y1)) for (tx in x0..x1) {
            val wrapped = ((tx % n) + n) % n
            out += Tile(z, wrapped, ty, tx * tileSize - (cx - w / 2), ty * tileSize - (cy - h / 2))
        }
        return out
    }

    fun tileUrl(template: String, z: Int, x: Int, y: Int): String = template.replace("{z}", z.toString()).replace("{x}", x.toString()).replace("{y}", y.toString())

    // ── aircraft ──
    fun distanceNmBetween(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val p1 = lat1 * PI / 180; val p2 = lat2 * PI / 180
        val dp = (lat2 - lat1) * PI / 180; val dl = (lon2 - lon1) * PI / 180
        val a = sin(dp / 2).pow(2) + cos(p1) * cos(p2) * sin(dl / 2).pow(2)
        return 3440.065 * 2 * atan2(sqrt(a), sqrt(1 - a))
    }

    const val MPS_PER_KT = 0.514444
    const val M_PER_DEG = 111320.0

    /**
     * SmoothAircraft loop body: the simulator publishes a few times a second; between updates the position is extrapolated along the true track at the
     * current effective speed (including the en-route time compression) and never more than 0.5 s ahead of a stalled simulator.
     */
    fun extrapolate(lat: Double, lon: Double, gsKt: Double, timeCompression: Double?, trackTrueDeg: Double?, headingDeg: Double, magVarDeg: Double?, dtSecRaw: Double): LatLon {
        val dt = min(0.5, dtSecRaw)
        val speed = gsKt * MPS_PER_KT * (timeCompression ?: 1.0)
        if (speed <= 0.5) return LatLon(lat, lon)
        val trk = (((trackTrueDeg ?: (headingDeg + (magVarDeg ?: 0.0))) % 360) * PI) / 180
        val nlat = lat + speed * dt * cos(trk) / M_PER_DEG
        val nlon = lon + speed * dt * sin(trk) / (M_PER_DEG * max(0.01, cos(nlat * PI / 180)))
        return LatLon(nlat, nlon)
    }

    /** Symbol rotation: the true track, else magnetic heading + variation (web symbolDeg). */
    fun symbolDeg(trackTrueDeg: Double?, headingDeg: Double, magVarDeg: Double?): Double = trackTrueDeg ?: ((headingDeg + (magVarDeg ?: 0.0) + 360) % 360)

    // ── auto-tune ──
    sealed class Tune {
        object None : Tune()
        data class Adf(val kHz: Int, val index: Int, val status: String, val logName: String) : Tune()
        data class Nav1(val mhz: Double, val index: Int, val status: String, val logName: String) : Tune()
    }

    /** Auto-frequency switch effect: when the next sequence item is reached (or an ILS is near), tune ADF (NDB) or NAV 1 (VOR / ILS). */
    fun autoTune(lat: Double, lon: Double, seqIndex: Int, sequence: List<SequenceItem>, manualTune: Boolean): Tune {
        val r = RouteSequence.findNextSequenceItem(lat, lon, seqIndex, sequence)
        val next = r.next ?: return Tune.None
        if (r.index == seqIndex || manualTune) return Tune.None
        val d = String.format(Locale.ROOT, "%.1f", r.distanceNm)
        return if (next.kind == "NDB") {
            val k = Math.floor(next.frequency + 0.5).toInt()
            Tune.Adf(k, r.index, "Auto-tuned ADF to $k kHz (${next.name}) · $d NM", next.name)
        } else {
            Tune.Nav1(next.frequency, r.index, "Auto-tuned NAV1 to ${String.format(Locale.ROOT, "%.2f", next.frequency)} (${next.name}) · $d NM", next.name)
        }
    }

    // ── text ──
    fun frequencyText(item: SequenceItem?): String = when {
        item == null -> "—"
        item.kind == "NDB" -> "${Math.floor(item.frequency + 0.5).toLong()} kHz"
        else -> String.format(Locale.ROOT, "%.2f MHz", item.frequency)
    }

    fun routeLabel(dep: String?, dest: String?): String = if (dep != null && dest != null) "$dep → $dest" else "RPLL → WSSS"

    fun rangeText(nm: Double?): String = if (nm == null) "—" else String.format(Locale.ROOT, "%.1f NM", nm)

    fun currentTargetName(target: SequenceItem?, hasPlan: Boolean): String = target?.name ?: if (hasPlan) "No VOR / NDB / ILS in plan" else "Awaiting route"
    fun nextTargetName(next: SequenceItem?, sequenceSize: Int): String = next?.name ?: if (sequenceSize > 0) "END OF SEQUENCE" else "—"

    /** Footer XTK: ((heading - course) * 0.5) NM, one decimal (web expression, kept as is). */
    fun xtkText(headingDeg: Double, courseMag: Double?): String = String.format(Locale.ROOT, "%.1f", (headingDeg - (courseMag ?: headingDeg)) * 0.5)

    fun statusText(hasNav: Boolean, gsKt: Double): String = if (!hasNav) "WAITING FOR TELEMETRY" else if (gsKt > 1) "MOVING WITH SIM" else "PARKED · WAITING FOR TAKEOFF"

    fun waypointPopup(index: Int, name: String, lat: Double, lon: Double, altFt: Double, speedKt: Double): List<String> = listOf(
        "WP ${index + 1} · $name",
        String.format(Locale.ROOT, "%.5f, %.5f", lat, lon),
        "${jsNum(altFt)} ft · ${if (speedKt != 0.0) "${jsNum(speedKt)} kt" else "No speed constraint"}",
    )

    fun stationPopup(s: SequenceItem): List<String> = listOf(s.name, "${jsNum(s.frequency)} ${if (s.kind == "NDB") "kHz" else "MHz"} · ${s.kind}")

    fun catalogPopup(n: NavaidsChangi.Navaid): List<String> = listOf(
        n.name,
        "${n.ident} · ${jsNum(n.frequency)} ${if (n.kind == NavaidsChangi.NavaidKind.NDB) "kHz" else "MHz"}",
        n.kind.name + (n.runway?.let { " · RWY $it" } ?: ""),
        if (n.source.lowercase().contains("approximate")) "Approximate coordinates; AIP verification pending" else n.source,
    )

    fun aircraftPopup(headingDeg: Double?, symbolDeg: Double, altFt: Double?): List<String> = listOf(
        "Aircraft",
        "HDG ${headingDeg?.let { String.format(Locale.ROOT, "%.0f", it) } ?: "---"}° · TRK ${String.format(Locale.ROOT, "%.0f", symbolDeg)}°T",
        "ALT ${altFt?.let { String.format(Locale.ROOT, "%.0f", it) } ?: "---"} ft",
    )

    /** JS number-to-string for the numbers shown in popups: 110.9 -> "110.9", 353.0 -> "353". */
    fun jsNum(x: Double): String = if (x == Math.rint(x) && kotlin.math.abs(x) < 1e15) x.toLong().toString() else x.toString()

    // ── weather ──
    val WX_AIRPORTS: List<Pair<String, LatLon>> = listOf(
        "RPLL" to LatLon(14.5086, 121.0194), "RPLC" to LatLon(15.1860, 120.5600), "RPVM" to LatLon(10.3075, 123.9794),
        "RPVP" to LatLon(9.7421, 118.7587), "WSSS" to LatLon(1.3644, 103.9915), "WMKK" to LatLon(2.7456, 101.7099),
    )
    val WX_ENROUTE = listOf("RPLL", "RPLC", "RPVM", "RPVP", "RPSP", "RPVB", "WSSS", "WMKK", "VTBS", "VVTS")

    /** Comma-joined unique station ids: departure, destination, then the Philippine / regional list. */
    fun weatherIds(dep: String?, dest: String?): String = (listOf(dep ?: "RPLL", dest ?: "WSSS") + WX_ENROUTE).filter { it.isNotEmpty() }.distinct().joinToString(",")

    fun radarTileTemplate(host: String, framePath: String): String = "$host$framePath/256/{z}/{x}/{y}/2/1_1.png"

}
