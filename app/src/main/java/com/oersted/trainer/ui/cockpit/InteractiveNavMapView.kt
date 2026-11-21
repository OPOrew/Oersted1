package com.oersted.trainer.ui.cockpit

import android.content.Context
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.oersted.trainer.platform.LiveWeatherSampler
import com.oersted.trainer.platform.MapTiles
import com.oersted.trainer.platform.NavWeather
import com.oersted.trainer.sim.NavMapRules as M
import com.oersted.trainer.sim.NavMapRules.LatLon
import com.oersted.trainer.sim.NavReceiver
import com.oersted.trainer.sim.NavaidsChangi
import com.oersted.trainer.sim.Pedestal
import com.oersted.trainer.sim.RouteSequence
import com.oersted.trainer.sim.FlightRoute
import com.oersted.trainer.ui.common.Classic737Palette
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.PI
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt

/**
 * Port of InteractiveNavMap.tsx. The web draws a Leaflet map with OpenStreetMap raster tiles; here the same map is drawn natively (Web Mercator tiles,
 * pan / pinch / double-tap zoom, Leaflet-style zoom buttons and popups, attribution). Layers, controls, auto-tune and texts follow the web one for one;
 * the pure rules are in [M] (sim/NavMapRules.kt). The map only DISPLAYS the simulator: it never moves the aircraft. Needs INTERNET for tiles / radar / weather.
 * Compose / Android only; verified on CI, not compiled in the sandbox.
 */
private val AmberC = Color(0xFFF59E0B)

private class MapCam {
    var lat by mutableDoubleStateOf(M.DEFAULT_AC_LAT)
    var lon by mutableDoubleStateOf(M.DEFAULT_AC_LON)
    var zoom by mutableFloatStateOf(M.DEFAULT_ZOOM.toFloat())
    var w by mutableFloatStateOf(0f)
    var h by mutableFloatStateOf(0f)

    fun screen(la: Double, lo: Double): Offset {
        val z = zoom.toDouble()
        return Offset((w / 2 + M.worldX(lo, z) - M.worldX(lon, z)).toFloat(), (h / 2 + M.worldY(la, z) - M.worldY(lat, z)).toFloat())
    }

    /** Zoom about a screen point (Leaflet zoomAnimation without the animation), optionally with a pan. */
    fun transform(centroid: Offset, pan: Offset, zoomDelta: Double) {
        val oldZ = zoom.toDouble()
        val newZ = (oldZ + zoomDelta).coerceIn(0.0, M.MAX_ZOOM.toDouble())
        val cwx = M.worldX(lon, oldZ) + centroid.x - w / 2; val cwy = M.worldY(lat, oldZ) + centroid.y - h / 2
        val lonC = M.lonOf(cwx, oldZ); val latC = M.latOf(cwy, oldZ)
        val ncx = M.worldX(lonC, newZ) - (centroid.x + pan.x - w / 2); val ncy = M.worldY(latC, newZ) - (centroid.y + pan.y - h / 2)
        zoom = newZ.toFloat()
        lon = M.lonOf(ncx, newZ)
        lat = M.latOf(ncy, newZ).coerceIn(-M.MAX_LAT, M.MAX_LAT)
    }

    /** Tiles of one layer at integer zoom [zTile] with the factor that scales them to the fractional map zoom. */
    fun tiles(zTile: Int): Pair<List<M.Tile>, Float> {
        val f = 2.0.pow(zoom.toDouble() - zTile).toFloat()
        return M.tilesFor(lat, lon, zTile, (w / f).toDouble(), (h / f).toDouble()) to f
    }

    fun baseZoom(): Int = floor(zoom + 0.5f).toInt().coerceIn(0, M.MAX_ZOOM)
    fun radarZoom(): Int = min(baseZoom(), M.RADAR_MAX_NATIVE_ZOOM)
}

private class PopupInfo(val lat: Double, val lon: Double, val lines: List<String>)
private class MapMarker(val lat: Double, val lon: Double, val hit: Float, val lines: List<String>)

// ── icons (Leaflet DivIcons of the web) ──
private fun DrawScope.drawWaypoint(c: Offset) {
    drawRoundRect(Color(0xFF263748), Offset(c.x - 7.5f, c.y - 7.5f), Size(15f, 15f), CornerRadius(3f))
    drawRoundRect(Color(0xFF182534), Offset(c.x - 6f, c.y - 6f), Size(12f, 12f), CornerRadius(2f))
    drawRoundRect(Color(0xFFE7EDF4), Offset(c.x - 6f, c.y - 6f), Size(12f, 12f), CornerRadius(2f), style = Stroke(1.5f))
    drawCircle(Color(0xFF5CC8FF), 2f, c)
}

private fun DrawScope.drawVor(c: Offset) {
    drawRoundRect(Color(0xFF263748), Offset(c.x - 8f, c.y - 8f), Size(16f, 16f), CornerRadius(3f))
    drawRoundRect(Color(0xFF182534), Offset(c.x - 7f, c.y - 7f), Size(14f, 14f), CornerRadius(2f))
    drawRoundRect(Color(0xFFE7EDF4), Offset(c.x - 7f, c.y - 7f), Size(14f, 14f), CornerRadius(2f), style = Stroke(1.5f))
    drawCircle(Color(0xFFE7EDF4), 1.5f, c)
}

private fun DrawScope.drawNdb(c: Offset) {
    drawCircle(Color(0xFF263748), 8f, c); drawCircle(Color(0xFF182534), 7f, c); drawCircle(Color(0xFFE7EDF4), 7f, c, style = Stroke(1.5f))
    drawLine(Color(0xFFE7EDF4), Offset(c.x - 4f, c.y), Offset(c.x + 4f, c.y), 1.2f); drawLine(Color(0xFFE7EDF4), Offset(c.x, c.y - 4f), Offset(c.x, c.y + 4f), 1.2f)
}

private fun DrawScope.drawIls(c: Offset) {
    drawRect(Color(0xFF263748), Offset(c.x - 8f, c.y - 5f), Size(16f, 10f))
    drawRect(Color(0xFF182534), Offset(c.x - 7f, c.y - 4f), Size(14f, 8f))
    drawRect(Color(0xFFE7EDF4), Offset(c.x - 7f, c.y - 4f), Size(14f, 8f), style = Stroke(1.5f))
    drawCircle(Color(0xFFE7EDF4), 2f, c)
}

private fun svgPath(d: String): Path {
    val p = Path()
    val tok = Regex("[MLCQZ]|-?\\d*\\.?\\d+").findAll(d).map { it.value }.toList()
    var i = 0
    fun n() = tok[i++].toFloat()
    while (i < tok.size) when (tok[i++]) {
        "M" -> p.moveTo(n(), n())
        "L" -> p.lineTo(n(), n())
        "C" -> p.cubicTo(n(), n(), n(), n(), n(), n())
        "Q" -> p.quadraticBezierTo(n(), n(), n(), n())
        "Z" -> p.close()
    }
    return p
}

// top-down 737-200 silhouette of the web (nose north at 000°), 44 x 44 viewBox
private val AC_WING = svgPath("M19.4 18.8 L4 26.5 L3.3 30.6 L19.2 26.6 L24.8 26.6 L40.7 30.6 L40 26.5 L24.6 18.8 Z")
private val AC_TAIL = svgPath("M20.1 34.1 L12.4 37.9 L11.8 40.4 L20.1 38.4 L23.9 38.4 L32.2 40.4 L31.6 37.9 L23.9 34.1 Z")
private val AC_NAC_L = svgPath("M11.1 22.9 Q9.2 24.1 9.8 27.3 L11.3 30.3 Q13.4 30.6 14.3 27.5 L14.8 24.5 Q13.5 22.4 11.1 22.9 Z")
private val AC_NAC_R = svgPath("M32.9 22.9 Q34.8 24.1 34.2 27.3 L32.7 30.3 Q30.6 30.6 29.7 27.5 L29.2 24.5 Q30.5 22.4 32.9 22.9 Z")
private val AC_BODY = svgPath("M22 2.2 C19.8 5.5 19.4 9.8 19.4 14.4 L19.4 35.1 L17.5 39.1 L22 40.4 L26.5 39.1 L24.6 35.1 L24.6 14.4 C24.6 9.8 24.2 5.5 22 2.2 Z")
private val AC_WINDOW = svgPath("M20.2 8.5 L23.8 8.5 L23.5 11.1 L20.5 11.1 Z")

private fun DrawScope.drawAircraft(c: Offset, deg: Float) {
    val body = Brush.horizontalGradient(0f to Color(0xFFC6A72A), 0.45f to Color(0xFFFFF17A), 1f to Color(0xFFD6B82F), startX = 19.4f, endX = 24.6f)
    withTransform({ translate(c.x - 22f, c.y - 22f); rotate(deg, Offset(22f, 22f)) }) {
        val ink = Color(0xFF10161B)
        drawPath(AC_WING, Color(0xFFFFEB3B)); drawPath(AC_WING, ink, style = Stroke(1.25f, join = StrokeJoin.Round))
        drawPath(AC_TAIL, Color(0xFFF5D94D)); drawPath(AC_TAIL, ink, style = Stroke(1.1f, join = StrokeJoin.Round))
        for (n in listOf(AC_NAC_L, AC_NAC_R)) { drawPath(n, Color(0xFF4C5962)); drawPath(n, Color(0xFF111820), style = Stroke(1f)) }
        drawPath(AC_BODY, body); drawPath(AC_BODY, ink, style = Stroke(1.2f, join = StrokeJoin.Round))
        drawPath(AC_WINDOW, Color(0xFF263C4B)); drawPath(AC_WINDOW, Color(0xFF111820), style = Stroke(0.45f))
        drawLine(Color(0xFF5D6A72), Offset(20.1f, 13.5f), Offset(23.9f, 13.5f), 0.65f)
        drawLine(Color(0xFF65727A), Offset(20.1f, 32.4f), Offset(23.9f, 32.4f), 0.65f)
    }
}

/** CSS filter(brightness(0.4) contrast(1.2) saturate(0.6)) of the web NIGHT mode as one colour matrix (= 0.48 * saturation(0.6), minus 0.1). */
private fun nightFilter(): ColorFilter {
    val s = 0.6f; val k = 0.48f
    val lr = 0.213f; val lg = 0.715f; val lb = 0.072f
    val a = floatArrayOf(
        k * (lr * (1 - s) + s), k * lg * (1 - s), k * lb * (1 - s), 0f, -25.5f,
        k * lr * (1 - s), k * (lg * (1 - s) + s), k * lb * (1 - s), 0f, -25.5f,
        k * lr * (1 - s), k * lg * (1 - s), k * (lb * (1 - s) + s), 0f, -25.5f,
        0f, 0f, 0f, 1f, 0f,
    )
    return ColorFilter.colorMatrix(ColorMatrix(a))
}

private val TIME_FMT get() = SimpleDateFormat("h:mm:ss a", Locale.US)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun InteractiveNavMap(cockpit: CockpitModel, modifier: Modifier = Modifier) {
    val ctx = LocalContext.current
    val prefs = remember { ctx.getSharedPreferences("oersted-nav", Context.MODE_PRIVATE) }
    val scope = rememberCoroutineScope()
    val navState by cockpit.navState.collectAsState()
    val plan by cockpit.activePlan.collectAsState()
    val ped by cockpit.pedestalState.collectAsState()
    val cam = remember { MapCam() }
    val tileVersion = remember { mutableIntStateOf(0) }

    var seqIndex by remember { mutableIntStateOf(0) }
    var status by remember { mutableStateOf(M.NAV_STATUS_WAITING) }
    var follow by remember { mutableStateOf(true) }
    var log by remember { mutableStateOf(listOf<String>()) }
    var manualTune by remember { mutableStateOf(prefs.getString("auto-tune", "on") == "off") }
    var night by remember { mutableStateOf(false) }
    var wxOpen by remember { mutableStateOf(false) }
    var wxData by remember { mutableStateOf<NavWeather.Wx?>(null) }
    var wxLoading by remember { mutableStateOf(false) }
    var radarOn by remember { mutableStateOf(false) }
    var radarTemplate by remember { mutableStateOf<String?>(null) }
    var popup by remember { mutableStateOf<PopupInfo?>(null) }
    var acLat by remember { mutableDoubleStateOf(navState?.latitude ?: M.DEFAULT_AC_LAT) }
    var acLon by remember { mutableDoubleStateOf(navState?.longitude ?: M.DEFAULT_AC_LON) }

    val sequence = remember(plan) { plan?.let { RouteSequence.buildPlanSequence(it) } ?: RouteSequence.RPLL_WSSS_SEQUENCE }
    val planKey = plan?.activatedAt ?: "none"
    val heading = navState?.headingDeg ?: 0.0
    val symbolDeg = M.symbolDeg(navState?.trackTrueDeg, heading, navState?.magVarDeg)

    // A pilot change on the pedestal takes priority over the automatic tuner (web usePedestal.subscribe on navL.act).
    var prevAct by remember { mutableIntStateOf(ped.navL.act) }
    var expectedAutoAct by remember { mutableIntStateOf(-1) }
    LaunchedEffect(ped.navL.act) {
        if (ped.navL.act != prevAct) {
            val own = ped.navL.act == expectedAutoAct
            prevAct = ped.navL.act
            expectedAutoAct = -1
            if (!own) { prefs.edit().putString("auto-tune", "off").apply(); manualTune = true; status = M.MANUAL_STATUS }
        }
    }

    // A newly loaded plan restarts the radio sequence; its first station sets the selected course.
    LaunchedEffect(planKey) {
        seqIndex = 0; log = emptyList()
        val first = sequence.firstOrNull()
        if (plan != null && first?.courseMag != null) cockpit.updateMip { it.copy(selCrs = first.courseMag!!) }
    }

    // Auto-frequency switch logic
    LaunchedEffect(navState, seqIndex, sequence, ped.navL.stby) {
        val st = navState ?: return@LaunchedEffect
        when (val t = M.autoTune(st.latitude, st.longitude, seqIndex, sequence, manualTune)) {
            M.Tune.None -> {}
            is M.Tune.Adf -> {
                cockpit.updatePedestal { it.copy(adf = Pedestal.Pair2(t.kHz, it.adf.r)) }
                status = t.status; log = (listOf("${TIME_FMT.format(Date())} → ${t.logName}") + log).take(8); seqIndex = t.index
            }
            is M.Tune.Nav1 -> {
                val tune = NavReceiver.tuneNav1(t.mhz, ped.navL.stby, powerOn = true)
                expectedAutoAct = tune.navLAct
                cockpit.updatePedestal { it.copy(navL = Pedestal.Freq(tune.navLAct, tune.navLStby)) }
                cockpit.updateMip { m -> m.copy(navFrequencyMHz = tune.mipFrequencyMHz, navTuned = tune.mipNavTuned ?: m.navTuned, navOn = if (tune.mipNavOn) true else m.navOn) }
                status = t.status; log = (listOf("${TIME_FMT.format(Date())} → ${t.logName}") + log).take(8); seqIndex = t.index
            }
        }
    }

    // Sample live precipitation for the weather radar every ~2 minutes once a position is known (feeds the cockpit weather radar / icing).
    val hasPosition = navState != null
    LaunchedEffect(hasPosition) {
        if (!hasPosition) return@LaunchedEffect
        while (true) {
            val st = cockpit.navState.value
            if (st != null) {
                val a = withContext(Dispatchers.IO) { LiveWeatherSampler.sample(st.latitude, st.longitude, NavWeather.lastMetar) }
                if (a != null) cockpit.applyLiveWeather(a)
            }
            delay(120_000)
        }
    }

    fun loadWeather() {
        scope.launch {
            wxLoading = true; wxData = null
            wxData = NavWeather.loadWeather(plan?.departure, plan?.destination)
            wxLoading = false
        }
    }

    // Aircraft: moved every frame (extrapolated along the track between simulator updates); the map follows it when Follow is on.
    val followState = rememberUpdatedState(follow)
    LaunchedEffect(Unit) {
        var baseLat = Double.NaN; var baseLon = Double.NaN; var baseT = 0.0
        while (true) {
            val nowMs = withFrameNanos { it } / 1_000_000.0
            val st = cockpit.navState.value ?: continue
            if (!st.latitude.isFinite() || !st.longitude.isFinite()) continue
            if (st.latitude != baseLat || st.longitude != baseLon) { baseLat = st.latitude; baseLon = st.longitude; baseT = nowMs }
            val p = M.extrapolate(st.latitude, st.longitude, st.groundSpeedKt, st.timeCompression, st.trackTrueDeg, st.headingDeg, st.magVarDeg, (nowMs - baseT) / 1000)
            acLat = p.lat; acLon = p.lon
            if (followState.value) { cam.lat = p.lat; cam.lon = p.lon }
        }
    }

    // Route: departure reference, every waypoint in order, destination (web planRoutePoints), else the fixed sequence.
    val waypoints = plan?.waypoints ?: emptyList()
    val planRoutePoints = remember(plan) {
        plan?.let { p ->
            FlightRoute.planRoutePoints(p).filter { it.latitude.isFinite() && it.longitude.isFinite() && kotlin.math.abs(it.latitude) <= 90 && kotlin.math.abs(it.longitude) <= 180 }.map { LatLon(it.latitude, it.longitude) }
        } ?: emptyList()
    }
    val seqPoints = sequence.map { LatLon(it.lat, it.lon) }
    val routePoints = if (planRoutePoints.size > 1) planRoutePoints else seqPoints
    val fitPoints = routePoints + if (planRoutePoints.isNotEmpty()) emptyList() else seqPoints
    val fitKey = M.fitKey(fitPoints)
    // Fit only when the planned route changes (not on every telemetry refresh).
    LaunchedEffect(fitKey, cam.w > 0f) {
        if (cam.w > 0f && fitPoints.size > 1) M.fitBounds(fitPoints, cam.w.toDouble(), cam.h.toDouble())?.let { cam.lat = it.lat; cam.lon = it.lon; cam.zoom = it.zoom.toFloat() }
    }

    // Tile loading for the visible tiles (base + optional radar).
    LaunchedEffect(radarOn, radarTemplate) {
        snapshotFlow {
            val urls = ArrayList<String>()
            if (cam.w > 0f) {
                cam.tiles(cam.baseZoom()).first.forEach { urls += M.tileUrl(M.OSM_URL, it.z, it.x, it.y) }
                val rt = radarTemplate
                if (radarOn && rt != null && cam.zoom <= M.RADAR_MAX_ZOOM) cam.tiles(cam.radarZoom()).first.forEach { urls += M.tileUrl(rt, it.z, it.x, it.y) }
            }
            urls
        }.distinctUntilChanged().collect { urls ->
            for (u in urls) if (MapTiles.peek(u) == null) launch { if (MapTiles.get(u) != null) tileVersion.intValue++ }
        }
    }

    val currentTarget = sequence.getOrNull(min(seqIndex, sequence.size - 1))
    val nextTarget = sequence.getOrNull(seqIndex + 1)
    val currentRangeNm = if (currentTarget != null && navState != null) M.distanceNmBetween(navState!!.latitude, navState!!.longitude, currentTarget.lat, currentTarget.lon) else null
    val seqTarget = sequence.getOrNull(seqIndex)

    val border = Classic737Palette.Border
    val mono = FontFamily.Monospace
    val btn: @Composable (String, Color, () -> Unit) -> Unit = { label, bg, onClick ->
        Text(label.uppercase(), color = Color.White, fontFamily = mono, fontSize = 9.sp, modifier = Modifier.background(bg, RoundedCornerShape(4.dp)).clickable { onClick() }.padding(horizontal = 8.dp, vertical = 4.dp))
    }
    val mapHeight = min(480, (LocalConfiguration.current.screenHeightDp * 0.52f).toInt()).dp

    Column(
        modifier.fillMaxWidth().clipToBounds().border(1.dp, border, RoundedCornerShape(4.dp)).let { if (night) it.graphicsLayer { colorFilter = nightFilter() } else it },
    ) {
        Column(Modifier.fillMaxWidth().background(Classic737Palette.Panel).padding(8.dp)) {
            Row(Modifier.fillMaxWidth().padding(bottom = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Interactive Navigation Map".uppercase(), color = Classic737Palette.Fg, fontFamily = mono, fontWeight = FontWeight.SemiBold, fontSize = 9.sp, modifier = Modifier.weight(1f))
                Text(M.routeLabel(plan?.departure, plan?.destination), color = Classic737Palette.Subtle, fontFamily = mono, fontSize = 8.sp)
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                btn("Follow ${if (follow) "ON" else "OFF"}", if (follow) Color(0xFF22C55E) else Color(0xFF4B5563)) { follow = !follow }
                btn(if (manualTune) "AUTO TUNE OFF" else "AUTO TUNE ON", if (manualTune) Color(0xFFF59E0B) else Color(0xFF16A34A)) { manualTune = !manualTune; prefs.edit().putString("auto-tune", if (manualTune) "off" else "on").apply() }
                btn(if (night) "NIGHT" else "DAY", if (night) Color(0xFF1E293B) else Color(0xFF64748B)) { night = !night }
                btn("WX ${if (wxOpen) "ON" else "OFF"}", if (wxOpen) Color(0xFF0EA5E9) else Color(0xFF0369A1)) { wxOpen = !wxOpen; if (wxOpen && wxData == null) loadWeather() }
                btn("RADAR ${if (radarOn) "ON" else "OFF"}", if (radarOn) Color(0xFFEF4444) else Color(0xFF7F1D1D)) {
                    radarOn = !radarOn
                    if (radarOn && radarTemplate == null) scope.launch { radarTemplate = NavWeather.loadRadarTemplate() }
                }
                btn("RESET TRACK", Color(0xFF525252)) { seqIndex = 0; log = emptyList(); status = M.RESET_STATUS }
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(border))
        FlowRow(Modifier.fillMaxWidth().background(Color(0xFF0B0F12)).padding(8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp), maxItemsInEachRow = 2) {
            val card: @Composable (String, Color, Color, Color, String, String, String, String, String) -> Unit = { head, headC, bd, bg, name, l1, v1, l2, v2 ->
                Column(Modifier.weight(1f).background(bg, RoundedCornerShape(4.dp)).border(1.dp, bd, RoundedCornerShape(4.dp)).padding(8.dp)) {
                    Text(head, color = headC, fontFamily = mono, fontWeight = FontWeight.Bold, fontSize = 8.sp, letterSpacing = 0.16.em, modifier = Modifier.padding(bottom = 4.dp))
                    Text(name, color = Color(0xFFF5F5F5), fontFamily = mono, fontWeight = FontWeight.SemiBold, fontSize = 10.sp, lineHeight = 13.sp)
                    Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) { Text(l1, color = Color(0xFFA3A3A3), fontFamily = mono, fontSize = 8.sp); Text(v1, color = headC.copy(alpha = 0.85f), fontFamily = mono, fontSize = 8.sp) }
                    Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) { Text(l2, color = Color(0xFFA3A3A3), fontFamily = mono, fontSize = 8.sp); Text(v2, color = Color(0xFFE5E5E5), fontFamily = mono, fontSize = 8.sp) }
                }
            }
            card("CURRENT TRACKING", Color(0xFF6EE7B7), Color(0x5910B981), Color(0x33022C22), M.currentTargetName(currentTarget, plan != null), "RANGE", M.rangeText(currentRangeNm), "TYPE", currentTarget?.kind ?: "—")
            card("NEXT TARGET", Color(0xFFFCD34D), Color(0x59F59E0B), Color(0x33451A03), M.nextTargetName(nextTarget, sequence.size), "FREQUENCY", M.frequencyText(nextTarget), "TYPE", nextTarget?.kind ?: "—")
        }
        Row(Modifier.fillMaxWidth().background(Color(0xFF0A0A0A)).padding(horizontal = 8.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("NAV EVENT", color = Color(0xFF7DD3FC), fontFamily = mono, fontWeight = FontWeight.Bold, fontSize = 8.sp)
            Text(status, color = Color(0xFFD4D4D4), fontFamily = mono, fontSize = 8.sp, lineHeight = 10.sp, modifier = Modifier.weight(1f))
            Text(if (navState != null) "SIM TELEMETRY" else "WAITING", color = if (navState != null) Color(0xFF6EE7B7) else Color(0xFFFCD34D), fontFamily = mono, fontSize = 8.sp)
        }
        if (wxOpen) {
            Column(Modifier.fillMaxWidth().background(Color(0x660C4A6E)).padding(8.dp)) {
                Row(Modifier.fillMaxWidth().padding(bottom = 4.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text("WEATHER — METAR / TAF / PIREP (PH + ENROUTE) + LIVE RADAR", color = Color(0xFF7DD3FC), fontFamily = mono, fontWeight = FontWeight.Bold, fontSize = 8.sp, modifier = Modifier.weight(1f))
                    Text(if (wxLoading) "LOADING…" else "REFRESH", color = Color.White, fontFamily = mono, fontSize = 7.sp, modifier = Modifier.background(Color(0xFF0369A1), RoundedCornerShape(4.dp)).clickable(enabled = !wxLoading) { loadWeather() }.padding(horizontal = 6.dp, vertical = 2.dp))
                }
                val wx = wxData
                if (wx?.error != null) Text(wx.error, color = Color(0xFFFCD34D), fontFamily = mono, fontSize = 8.sp)
                else if (wx != null) {
                    Text("Live radar intensity is fed to the cockpit weather radar. In precipitation the aircraft sees reduced visibility.", color = Color(0xFFFDE68A), fontFamily = mono, fontSize = 7.sp)
                    for ((k, v) in listOf("METAR" to wx.metar, "TAF" to wx.taf, "PIREP" to wx.pirep)) {
                        Text(k, color = Color(0xFF38BDF8), fontFamily = mono, fontSize = 8.sp, modifier = Modifier.padding(top = 6.dp))
                        Text(v, color = Color(0xFFE5E5E5), fontFamily = mono, fontSize = 7.sp, modifier = Modifier.heightIn(max = 140.dp).verticalScroll(rememberScrollState()))
                    }
                } else Text("Click REFRESH to load weather for the flight-plan airports.", color = Color(0xFFA3A3A3), fontFamily = mono, fontSize = 8.sp)
            }
        }

        // ── the map ──
        val density = LocalDensity.current.density
        val pulse = rememberInfiniteTransition(label = "pulse").animateFloat(1f, 1.4f, infiniteRepeatable(tween(600, easing = LinearEasing), RepeatMode.Reverse), label = "p")
        Box(
            Modifier.fillMaxWidth().height(mapHeight).background(Color(0xFF0D1217)).clipToBounds()
                .onSizeChanged { s: IntSize -> cam.w = s.width / density; cam.h = s.height / density }
                .pointerInput(Unit) {
                    detectTransformGestures { centroid, pan, zoomChange, _ ->
                        val c = Offset(centroid.x / density, centroid.y / density); val p = Offset(pan.x / density, pan.y / density)
                        if (p != Offset.Zero) follow = false // dragstart switches Follow off
                        cam.transform(c, p, if (zoomChange > 0f) ln(zoomChange.toDouble()) / ln(2.0) else 0.0)
                    }
                }
                .pointerInput(waypoints, sequence) {
                    detectTapGestures(
                        onDoubleTap = { o -> cam.transform(Offset(o.x / density, o.y / density), Offset.Zero, 1.0) },
                        onTap = { o ->
                            val t = Offset(o.x / density, o.y / density)
                            val list = ArrayList<MapMarker>()
                            waypoints.forEachIndexed { i, w -> list += MapMarker(w.latitude, w.longitude, 10f, M.waypointPopup(i, w.name, w.latitude, w.longitude, w.altitudeFt, w.speedKt)) }
                            sequence.forEach { list += MapMarker(it.lat, it.lon, 11f, M.stationPopup(it)) }
                            NavaidsChangi.CHANGI_NAVAIDS.filter { it.available }.forEach { list += MapMarker(it.lat, it.lon, 11f, M.catalogPopup(it)) }
                            if (wxData != null && wxData?.error == null) M.WX_AIRPORTS.forEach { (id, p) -> list += MapMarker(p.lat, p.lon, 10f, listOf(id, "Weather loaded — see WX panel")) }
                            list += MapMarker(acLat, acLon, 24f, M.aircraftPopup(navState?.headingDeg, M.symbolDeg(navState?.trackTrueDeg, navState?.headingDeg ?: 0.0, navState?.magVarDeg), navState?.altitudeFt))
                            val hit = list.asReversed().firstOrNull { val s = cam.screen(it.lat, it.lon); (s - t).getDistance() <= it.hit }
                            popup = hit?.let { PopupInfo(it.lat, it.lon, it.lines) }
                        },
                    )
                },
        ) {
            Canvas(Modifier.fillMaxWidth().height(mapHeight)) {
                tileVersion.intValue // redraw when a tile arrives
                withTransform({ scale(density, density, Offset.Zero) }) {
                    fun layer(template: String, zTile: Int, alpha: Float) {
                        val (tiles, f) = cam.tiles(zTile)
                        for (t in tiles) {
                            val img = MapTiles.peek(M.tileUrl(template, t.z, t.x, t.y)) ?: continue
                            // +0.5 px overlap hides hairline seams between scaled tiles
                            drawImage(img, dstOffset = androidx.compose.ui.unit.IntOffset((t.left * f * density).roundToInt(), (t.top * f * density).roundToInt()),
                                dstSize = IntSize((256 * f * density).roundToInt() + 1, (256 * f * density).roundToInt() + 1), alpha = alpha)
                        }
                    }
                    // tiles are drawn in device pixels; undo the density scale for them
                    withTransform({ scale(1f / density, 1f / density, Offset.Zero) }) {
                        layer(M.OSM_URL, cam.baseZoom(), 1f)
                        val rt = radarTemplate
                        if (radarOn && rt != null && cam.zoom <= M.RADAR_MAX_ZOOM) layer(rt, cam.radarZoom(), M.RADAR_OPACITY)
                    }
                    // flight plan route
                    if (routePoints.size > 1) {
                        val path = Path()
                        routePoints.forEachIndexed { i, p -> val s = cam.screen(p.lat, p.lon); if (i == 0) path.moveTo(s.x, s.y) else path.lineTo(s.x, s.y) }
                        drawPath(path, Color(0xFF5CC8FF), style = Stroke(2f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 6f))))
                    }
                    // radial / course line from the current station to the aircraft
                    sequence.getOrNull(seqIndex)?.let {
                        drawLine(AmberC, cam.screen(it.lat, it.lon), cam.screen(acLat, acLon), 2f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(4f, 4f)))
                    }
                    waypoints.forEach { drawWaypoint(cam.screen(it.latitude, it.longitude)) }
                    sequence.forEachIndexed { i, s ->
                        val c = cam.screen(s.lat, s.lon)
                        if (i == seqIndex) {
                            drawCircle(Color(0x593B82F6), 20f * pulse.value, c)
                            drawCircle(Color(0xFF3B82F6).copy(alpha = 1.6f - pulse.value * 0.6f), 11f * pulse.value, c)
                        } else when (s.kind) { "NDB" -> drawNdb(c); "ILS" -> drawIls(c); else -> drawVor(c) }
                    }
                    NavaidsChangi.CHANGI_NAVAIDS.filter { it.available }.forEach { n ->
                        val c = cam.screen(n.lat, n.lon)
                        when (n.kind) { NavaidsChangi.NavaidKind.NDB -> drawNdb(c); NavaidsChangi.NavaidKind.ILS, NavaidsChangi.NavaidKind.LOC -> drawIls(c); else -> drawVor(c) }
                    }
                    // aircraft: 12 km circle (yellow, 30 % fill) + symbol
                    val ac = cam.screen(acLat, acLon)
                    val rPx = (M.AC_CIRCLE_RADIUS_M / M.metersPerPixel(acLat, cam.zoom.toDouble())).toFloat()
                    drawCircle(Color(0xFFFFEB3B).copy(alpha = 0.3f), rPx, ac); drawCircle(Color(0xFFFFEB3B), rPx, ac, style = Stroke(3f))
                    if (wxData != null && wxData?.error == null) M.WX_AIRPORTS.forEach { (_, p) -> drawWaypoint(cam.screen(p.lat, p.lon)) }
                    drawAircraft(ac, symbolDeg.toFloat())
                }
            }
            // popup (Leaflet-style bubble above the marker)
            popup?.let { p ->
                val s = cam.screen(p.lat, p.lon)
                Column(
                    Modifier.offset { IntOffset(((s.x - 70f) * density).roundToInt(), ((s.y - 28f) * density).roundToInt() - 90) }.width(140.dp)
                        .background(Color.White, RoundedCornerShape(8.dp)).clickable { popup = null }.padding(8.dp),
                ) {
                    p.lines.forEachIndexed { i, l -> Text(l, color = Color(0xFF222222), fontSize = 10.sp, lineHeight = 12.sp, fontWeight = if (i == 0) FontWeight.Bold else FontWeight.Normal) }
                }
            }
            // Leaflet zoom control + attribution
            Column(Modifier.align(Alignment.TopStart).padding(10.dp).background(Color.White, RoundedCornerShape(4.dp)).border(2.dp, Color(0x33000000), RoundedCornerShape(4.dp))) {
                for ((label, d) in listOf("+" to 1.0, "−" to -1.0)) {
                    Box(Modifier.size(30.dp).clickable { cam.transform(Offset(cam.w / 2, cam.h / 2), Offset.Zero, d) }, contentAlignment = Alignment.Center) { Text(label, color = Color.Black, fontSize = 18.sp, fontWeight = FontWeight.Bold) }
                }
            }
            Text("© OpenStreetMap contributors" + if (radarOn) " · © RainViewer" else "", color = Color(0xFF333333), fontSize = 8.sp, modifier = Modifier.align(Alignment.BottomEnd).background(Color(0xCCFFFFFF)).padding(horizontal = 4.dp))
        }
        FlowRow(Modifier.fillMaxWidth().background(Classic737Palette.Panel).padding(horizontal = 8.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            val t: @Composable (String, Color) -> Unit = { s, c -> Text(s, color = c, fontFamily = mono, fontSize = 9.sp) }
            t("Bearing: ${String.format(Locale.ROOT, "%.0f", heading)}°", Classic737Palette.Subtle)
            t("DME: ${M.rangeText(currentRangeNm)}", Classic737Palette.Subtle)
            t("XTK: ${M.xtkText(heading, seqTarget?.courseMag)} NM", Classic737Palette.Subtle)
            t("GS: ${Math.floor((navState?.groundSpeedKt ?: 0.0) + 0.5).toLong()} kt", Classic737Palette.Subtle)
            t("Status: ${M.statusText(navState != null, navState?.groundSpeedKt ?: 0.0)}", Classic737Palette.Subtle)
            t("Current target: ${seqTarget?.name ?: "—"}", Color(0xFF6EE7B7))
            seqTarget?.note?.let { t("Target note: $it", Color(0xFFFCD34D)) }
        }
        if (log.isNotEmpty()) Column(Modifier.fillMaxWidth().background(Color(0xFF171717)).padding(horizontal = 8.dp, vertical = 4.dp).heightIn(max = 64.dp).verticalScroll(rememberScrollState())) {
            log.forEach { Text(it, color = Color(0xFFA3A3A3), fontFamily = mono, fontSize = 8.sp) }
        }
        Text("Pinch or double-tap to zoom · Drag to pan · Green circle = current auto-tune target (${RouteSequence.SWITCH_DISTANCE_NM.toInt()} NM)", color = Classic737Palette.Muted, fontFamily = mono, fontSize = 8.sp, modifier = Modifier.fillMaxWidth().background(Classic737Palette.Panel).padding(horizontal = 8.dp, vertical = 4.dp))
    }
}
