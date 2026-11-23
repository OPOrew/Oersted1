@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package com.oersted.trainer.ui.flightplan

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.oersted.trainer.platform.MapTiles
import com.oersted.trainer.sim.AirportCoords
import com.oersted.trainer.sim.FlightPlanIls
import com.oersted.trainer.sim.FlightPlanPageRules as R
import com.oersted.trainer.sim.NavMapRules as M
import com.oersted.trainer.sim.NavaidsChangi
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch
import kotlin.math.ln
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt

/**
 * Port of components/panel/NavaidStationPicker.tsx. The web draws a Leaflet map (centre 10.5, 114.5, zoom 4, min 2, max 12);
 * here the same view is drawn natively with the OpenStreetMap raster tiles of [MapTiles]: DEP / DEST airport tags,
 * VOR / NDB / ILS-LOC symbols with the white ring on the selected one, popups with "Use as departure / destination / ILS",
 * the filter chips (VOR, NDB, ILS/LOC, VOR only, NDB only, All) and the selected-station bar. Needs INTERNET for tiles.
 * Compose / Android only; verified on CI.
 */
private val Border = Color(0xFFE7EDF4)
private val Dark = Color(0xFF182534)
private val Amber = Color(0xFFFBBF24)
private val Sky = Color(0xFF38BDF8)
private val Rose = Color(0xFFFB7185)
private val Violet = Color(0xFFA78BFA)

private class PickerCam {
    var lat by mutableDoubleStateOf(10.5)
    var lon by mutableDoubleStateOf(114.5)
    var zoom by mutableFloatStateOf(4f)
    var w by mutableFloatStateOf(0f)
    var h by mutableFloatStateOf(0f)

    fun screen(la: Double, lo: Double): Offset {
        val z = zoom.toDouble()
        return Offset((w / 2 + M.worldX(lo, z) - M.worldX(lon, z)).toFloat(), (h / 2 + M.worldY(la, z) - M.worldY(lat, z)).toFloat())
    }

    /** Zoom about a screen point with an optional pan; minZoom 2, maxZoom 12 as the Leaflet map. */
    fun transform(centroid: Offset, pan: Offset, zoomDelta: Double) {
        val oldZ = zoom.toDouble()
        val newZ = (oldZ + zoomDelta).coerceIn(2.0, 12.0)
        val cwx = M.worldX(lon, oldZ) + centroid.x - w / 2; val cwy = M.worldY(lat, oldZ) + centroid.y - h / 2
        val lonC = M.lonOf(cwx, oldZ); val latC = M.latOf(cwy, oldZ)
        val ncx = M.worldX(lonC, newZ) - (centroid.x + pan.x - w / 2); val ncy = M.worldY(latC, newZ) - (centroid.y + pan.y - h / 2)
        zoom = newZ.toFloat()
        lon = M.lonOf(ncx, newZ)
        lat = M.latOf(ncy, newZ).coerceIn(-M.MAX_LAT, M.MAX_LAT)
    }

    fun baseZoom(): Int = kotlin.math.floor(zoom + 0.5f).toInt().coerceIn(0, 12)
    fun tiles(zTile: Int): Pair<List<M.Tile>, Float> {
        val f = 2.0.pow(zoom.toDouble() - zTile).toFloat()
        return M.tilesFor(lat, lon, zTile, (w / f).toDouble(), (h / f).toDouble()) to f
    }
}

private class AirportTag(val role: String, val code: String, val color: Color, val point: AirportCoords.Coord)

private sealed class Popup(val lat: Double, val lon: Double) {
    class Airport(val tag: AirportTag) : Popup(tag.point.lat, tag.point.lon)
    class Station(val n: NavaidsChangi.Navaid) : Popup(n.lat, n.lon)
}

private fun DrawScope.drawStation(n: NavaidsChangi.Navaid, c: Offset, chosen: Boolean) {
    val k = 14f / 24f
    val border = if (chosen) Amber else Border
    if (chosen) drawCircle(Color(0xFFF8FAFC), 11f * k, c, style = Stroke(1.5f * k))
    when (R.kindLabel(n.kind)) {
        "VOR" -> {
            drawRoundRect(Dark, Offset(c.x - 8f * k, c.y - 8f * k), Size(16f * k, 16f * k), CornerRadius(2f * k))
            drawRoundRect(border, Offset(c.x - 8f * k, c.y - 8f * k), Size(16f * k, 16f * k), CornerRadius(2f * k), style = Stroke(2f * k))
            drawCircle(Border, 3f * k, c)
        }
        "NDB" -> {
            drawCircle(Dark, 8f * k, c); drawCircle(border, 8f * k, c, style = Stroke(2f * k))
            drawLine(Border, Offset(c.x, c.y - 5f * k), Offset(c.x, c.y + 5f * k), 1.5f * k)
            drawLine(Border, Offset(c.x - 5f * k, c.y), Offset(c.x + 5f * k, c.y), 1.5f * k)
        }
        else -> {
            drawRoundRect(Dark, Offset(c.x - 9f * k, c.y - 5f * k), Size(18f * k, 10f * k), CornerRadius(1f * k))
            drawRoundRect(border, Offset(c.x - 9f * k, c.y - 5f * k), Size(18f * k, 10f * k), CornerRadius(1f * k), style = Stroke(2f * k))
            drawCircle(Border, 2f * k, c)
        }
    }
}

private fun DrawScope.drawAirportTag(tm: TextMeasurer, tag: AirportTag, c: Offset) {
    drawCircle(Color(0xFF101820), 5.5f, c); drawCircle(tag.color, 3.5f, c); drawCircle(Color.White, 3.5f, c, style = Stroke(1f))
    val lay = tm.measure("${tag.role} ${tag.code}", TextStyle(color = Color(0xFFF8FAFC), fontSize = 9f.toSp(), fontWeight = FontWeight.Bold))
    val x = c.x + 8f; val y = c.y - lay.size.height / 2f - 2f
    drawRoundRect(Color(0xDD101820), Offset(x, y), Size(lay.size.width + 6f, lay.size.height + 4f), CornerRadius(3f))
    drawRoundRect(tag.color, Offset(x, y), Size(lay.size.width + 6f, lay.size.height + 4f), CornerRadius(3f), style = Stroke(1f))
    drawText(lay, topLeft = Offset(x + 3f, y + 2f))
}

@Composable
fun NavaidStationPicker(
    departure: String,
    destination: String,
    selectedId: String,
    ilsId: String?,
    onSelect: (NavaidsChangi.Navaid) -> Unit,
    onSetDeparture: (String) -> Unit,
    onSetDestination: (String) -> Unit,
    onSetIls: (NavaidsChangi.Navaid) -> Unit,
) {
    val density = LocalDensity.current.density
    val tm = rememberTextMeasurer()
    val cam = remember { PickerCam() }
    val tileVersion = remember { mutableIntStateOf(0) }
    var kinds by remember { mutableStateOf(R.Kinds()) }
    var popup by remember { mutableStateOf<Popup?>(null) }
    val stations = R.pickerStations(kinds)
    val selected = stations.firstOrNull { it.id == selectedId }
    val tags = listOf(
        Triple("DEP", departure.trim().uppercase(), Sky), Triple("DEST", destination.trim().uppercase(), Amber),
    ).mapNotNull { (role, code, color) -> AirportCoords.AIRPORT_COORDS[code]?.let { AirportTag(role, code, color, it) } }
    val mapHeight = min(440, (LocalConfiguration.current.screenHeightDp * 0.48f).toInt()).coerceAtLeast(260).dp

    // Visible tiles load in the background; a redraw is requested when one arrives.
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    LaunchedEffect(Unit) {
        snapshotFlow {
            val urls = ArrayList<String>()
            if (cam.w > 0f) cam.tiles(cam.baseZoom()).first.forEach { urls += M.tileUrl(M.OSM_URL, it.z, it.x, it.y) }
            urls
        }.distinctUntilChanged().collect { urls ->
            for (u in urls) if (MapTiles.peek(u) == null) scope.launch { if (MapTiles.get(u) != null) tileVersion.intValue++ }
        }
    }

    val border = planBorder()
    Column(Modifier.fillMaxWidth().padding(top = 12.dp).background(Color(0xFF0B1118), RoundedCornerShape(8.dp)).border(1.dp, border, RoundedCornerShape(8.dp)).clipToBounds()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Select a station on the map", color = Color(0xFFE7EDF4), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            Text("Pan and zoom the chart; tap a station symbol to select", color = Color(0xFF8D9CAB), fontSize = 10.sp)
        }
        Box(
            Modifier.fillMaxWidth().height(mapHeight).background(Color(0xFF0D1217)).clipToBounds()
                .onSizeChanged { s: IntSize -> cam.w = s.width / density; cam.h = s.height / density }
                .pointerInput(Unit) {
                    detectTransformGestures { centroid, pan, zoomChange, _ ->
                        cam.transform(Offset(centroid.x / density, centroid.y / density), Offset(pan.x / density, pan.y / density), if (zoomChange > 0f) ln(zoomChange.toDouble()) / ln(2.0) else 0.0)
                    }
                }
                .pointerInput(stations, tags) {
                    detectTapGestures(
                        onDoubleTap = { o -> cam.transform(Offset(o.x / density, o.y / density), Offset.Zero, 1.0) },
                        onTap = { o ->
                            val t = Offset(o.x / density, o.y / density)
                            // top-most marker wins: stations are drawn after the airport tags
                            val st = stations.asReversed().firstOrNull { (cam.screen(it.lat, it.lon) - t).getDistance() <= 12f }
                            if (st != null) { onSelect(st); popup = Popup.Station(st); return@detectTapGestures }
                            val ap = tags.firstOrNull { (cam.screen(it.point.lat, it.point.lon) - t).getDistance() <= 14f }
                            popup = ap?.let { Popup.Airport(it) }
                        },
                    )
                },
        ) {
            Canvas(Modifier.fillMaxWidth().height(mapHeight)) {
                tileVersion.intValue // redraw when a tile arrives
                val z = cam.baseZoom()
                val (tiles, f) = cam.tiles(z)
                for (t in tiles) {
                    val img = MapTiles.peek(M.tileUrl(M.OSM_URL, t.z, t.x, t.y)) ?: continue
                    drawImage(img, dstOffset = IntOffset((t.left * f * density).roundToInt(), (t.top * f * density).roundToInt()),
                        dstSize = IntSize((256 * f * density).roundToInt() + 1, (256 * f * density).roundToInt() + 1))
                }
                withTransform({ scale(density, density, Offset.Zero) }) {
                    tags.forEach { drawAirportTag(tm, it, cam.screen(it.point.lat, it.point.lon)) }
                    stations.forEach { drawStation(it, cam.screen(it.lat, it.lon), selectedId == it.id) }
                }
            }
            popup?.let { p ->
                val s = cam.screen(p.lat, p.lon)
                Column(
                    Modifier.offset { IntOffset(((s.x - 100f) * density).roundToInt(), ((s.y - 14f) * density).roundToInt() - 150) }.width(200.dp)
                        .background(Color.White, RoundedCornerShape(8.dp)).padding(10.dp),
                ) {
                    val ink = Color(0xFF222222)
                    when (p) {
                        is Popup.Airport -> {
                            Text("${p.tag.role} · ${p.tag.code}", color = ink, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            Text(p.tag.point.label, color = ink, fontSize = 11.sp)
                            Text("Airport endpoint (not a radio-navigation station).", color = ink, fontSize = 11.sp)
                            PopupButton(if (p.tag.role == "DEP") "Use as departure" else "Use as destination", if (p.tag.role == "DEP") Sky else Amber) {
                                if (p.tag.role == "DEP") onSetDeparture(p.tag.code) else onSetDestination(p.tag.code); popup = null
                            }
                        }
                        is Popup.Station -> {
                            val n = p.n
                            Text("${n.ident} · ${n.name}", color = ink, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            Text("${R.freqPlain(n)} ${if (n.kind == NavaidsChangi.NavaidKind.NDB) "kHz" else "MHz"} · ${R.stationKindText(n)}", color = ink, fontSize = 11.sp)
                            Text(n.source, color = ink, fontSize = 11.sp)
                            if (FlightPlanIls.isIlsNavaid(n)) PopupButton(if (ilsId == n.id) "ILS selected ✓" else "Use as ILS", Rose) { onSetIls(n); popup = null }
                        }
                    }
                }
            }
            // Leaflet zoom control and attribution
            Column(Modifier.align(Alignment.TopStart).padding(10.dp).background(Color.White, RoundedCornerShape(4.dp)).border(2.dp, Color(0x33000000), RoundedCornerShape(4.dp))) {
                for ((label, d) in listOf("+" to 1.0, "−" to -1.0)) {
                    Box(Modifier.size(30.dp).clickable { cam.transform(Offset(cam.w / 2, cam.h / 2), Offset.Zero, d) }, contentAlignment = Alignment.Center) { Text(label, color = Color.Black, fontSize = 18.sp, fontWeight = FontWeight.Bold) }
                }
            }
            Text("© OpenStreetMap contributors", color = Color(0xFF333333), fontSize = 8.sp, modifier = Modifier.align(Alignment.BottomEnd).background(Color(0xCCFFFFFF)).padding(horizontal = 4.dp))
        }
        // filter chips
        FlowRow(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            KindChip("VOR", kinds.vor, Sky) { kinds = kinds.copy(vor = !kinds.vor) }
            KindChip("NDB", kinds.ndb, Violet) { kinds = kinds.copy(ndb = !kinds.ndb) }
            KindChip("ILS/LOC", kinds.ils, Rose) { kinds = kinds.copy(ils = !kinds.ils) }
            PlainChip("VOR only") { kinds = R.Kinds(vor = true, ndb = false, ils = false) }
            PlainChip("NDB only") { kinds = R.Kinds(vor = false, ndb = true, ils = false) }
            PlainChip("All") { kinds = R.Kinds(vor = true, ndb = true, ils = true) }
            Text("Selected station has a white ring.", color = Color(0xFF8D9CAB), fontSize = 9.sp, modifier = Modifier.fillMaxWidth().padding(horizontal = 2.dp))
        }
        if (selected != null) {
            Column(Modifier.fillMaxWidth().background(Color(0xFF14212D)).padding(12.dp)) {
                Text("${selected.ident} · ${selected.name}", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                Text("${R.freqPlain(selected)} ${if (selected.kind == NavaidsChangi.NavaidKind.NDB) "kHz" else "MHz"} · ${R.stationKindText(selected)} · ${R.toFixed(selected.lat, 5)}, ${R.toFixed(selected.lon, 5)}", color = Color(0xFFCBD5E1), fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp))
                Text(selected.source, color = Color(0xFF94A3B8), fontSize = 10.sp, modifier = Modifier.padding(top = 4.dp))
                Box(Modifier.padding(top = 8.dp)) {
                    if (FlightPlanIls.isIlsNavaid(selected)) {
                        Text(
                            if (ilsId == selected.id) "ILS selected ✓" else "Use as ILS", color = Color(0xFFFFE4E6), fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.background(Rose.copy(alpha = 0.10f), RoundedCornerShape(4.dp)).border(1.dp, Rose, RoundedCornerShape(4.dp)).clickable { onSetIls(selected) }.padding(horizontal = 12.dp, vertical = 6.dp),
                        )
                    } else Text("AVAILABLE IN PLANNER", color = Color(0xFFE2E8F0), fontSize = 10.sp, modifier = Modifier.border(1.dp, border, RoundedCornerShape(4.dp)).padding(horizontal = 8.dp, vertical = 4.dp))
                }
            }
        }
    }
}

@Composable
private fun PopupButton(text: String, color: Color, onClick: () -> Unit) {
    Text(
        text, color = Color(0xFFF8FAFC), fontSize = 11.sp,
        modifier = Modifier.padding(top = 8.dp).background(Color(0xFF101820), RoundedCornerShape(5.dp)).border(1.dp, color, RoundedCornerShape(5.dp)).clickable(onClick = onClick).padding(horizontal = 7.dp, vertical = 5.dp),
    )
}

@Composable
private fun KindChip(label: String, on: Boolean, color: Color, onClick: () -> Unit) {
    val shape = RoundedCornerShape(4.dp)
    Text(
        label, color = if (on) color.copy(alpha = 0.85f) else Color(0xFF8D9CAB), fontSize = 8.sp,
        modifier = Modifier.then(if (on) Modifier.background(color.copy(alpha = 0.10f), shape).border(1.dp, color.copy(alpha = 0.6f), shape) else Modifier.border(1.dp, Color(0x558D9CAB), shape))
            .clickable(onClick = onClick).padding(horizontal = 6.dp, vertical = 4.dp),
    )
}

@Composable
private fun PlainChip(label: String, onClick: () -> Unit) {
    Text(label, color = Color(0xFFCBD5E1), fontSize = 8.sp, modifier = Modifier.border(1.dp, Color(0x558D9CAB), RoundedCornerShape(4.dp)).clickable(onClick = onClick).padding(horizontal = 6.dp, vertical = 4.dp))
}
