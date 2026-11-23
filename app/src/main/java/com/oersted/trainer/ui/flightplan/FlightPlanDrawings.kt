@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package com.oersted.trainer.ui.flightplan

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.oersted.trainer.sim.ActiveFlightWaypoint
import com.oersted.trainer.sim.FlightNavigationState
import com.oersted.trainer.sim.FlightPlanPageRules as R
import com.oersted.trainer.ui.common.Classic737Palette

/**
 * The three SVG drawings of routes/flight-plan.tsx, in web viewBox units: GeographicRouteMap (600 x 270),
 * the cruise profile (600 x 310) and the landing profile (600 x 180). The numbers come from [R] (FlightPlanPageRules).
 */
private val PanelBg = Color(0xFF111820)
private val Grid = Color(0xFF44505C)
private val AxisText = Color(0xFFA6B2C0)
private val LabelText = Color(0xFFEDF5F7)
private val Teal = Color(0xFF55C7B3)
private val Gold = Color(0xFFE9B86C)

private fun O(x: Double, y: Double) = Offset(x.toFloat(), y.toFloat())

/** SVG <text>: anchor 0 = start, 1 = middle, 2 = end; y is the baseline. */
private fun DrawScope.svgText(tm: TextMeasurer, text: String, x: Double, y: Double, size: Float, color: Color, anchor: Int = 0) {
    val lay = tm.measure(text, TextStyle(color = color, fontSize = size.toSp()))
    val left = x.toFloat() - (if (anchor == 1) lay.size.width / 2f else if (anchor == 2) lay.size.width.toFloat() else 0f)
    drawText(lay, topLeft = Offset(left, y.toFloat() - lay.firstBaseline))
}

private fun dashed(a: Float, b: Float) = PathEffect.dashPathEffect(floatArrayOf(a, b))

/** `rounded-lg border bg-[#111820] p-2` frame around an SVG. */
@Composable
private fun SvgFrame(content: @Composable () -> Unit) {
    Column(Modifier.fillMaxWidth().background(PanelBg, RoundedCornerShape(8.dp)).border(1.dp, planBorder(), RoundedCornerShape(8.dp)).padding(8.dp)) { content() }
}

@Composable
fun GeographicRouteMapView(
    departure: String,
    destination: String,
    alternate: String,
    waypoints: List<ActiveFlightWaypoint>,
    nav: FlightNavigationState?,
) {
    val tm = rememberTextMeasurer()
    val map = R.routeMap(departure, destination, waypoints, nav)
    val air = R.hasAircraft(nav)
    SvgFrame {
        Canvas(Modifier.fillMaxWidth().aspectRatio(600f / 270f)) {
            val sc = size.width / 600f
            withTransform({ scale(sc, sc, Offset.Zero) }) {
                // geoGrid pattern: 30 px cells, hairline strokes
                val g = Color(0xFF35414E)
                var k = 0f
                while (k <= 600f) { drawLine(g, Offset(k, 0f), Offset(k, 270f), 0.7f); k += 30f }
                k = 0f
                while (k <= 270f) { drawLine(g, Offset(0f, k), Offset(600f, k), 0.7f); k += 30f }
                for (i in 0..5) {
                    val x = 42.0 + i * 103
                    drawLine(Color(0xFF45515D), O(x, 18.0), O(x, 238.0), 1f, pathEffect = dashed(2f, 6f))
                    svgText(tm, R.lonGridLabel(map, i), x, 254.0, 9f, Color(0xFF8D9CAB), 1)
                }
                val path = Path()
                map.points.forEachIndexed { i, p -> if (i == 0) path.moveTo(p.x.toFloat(), p.y.toFloat()) else path.lineTo(p.x.toFloat(), p.y.toFloat()) }
                drawPath(path, Teal, style = Stroke(2.5f, pathEffect = dashed(6f, 4f)))
                map.points.forEach { p ->
                    val airport = p.kind == "airport"
                    drawCircle(Color(0xFF101820), (if (airport) 6f else 4.5f) + 1f, O(p.x, p.y))
                    drawCircle(if (airport) Gold else Teal, (if (airport) 6f else 4.5f) - 1f, O(p.x, p.y))
                    svgText(tm, p.name, p.x, p.y + (if (p.y < 42) 16 else -10), 10f, LabelText, 1)
                }
                map.aircraft?.let { (ax, ay) ->
                    drawCircle(Color(0xFFE5F5FF).copy(alpha = 0.16f), 9f, O(ax, ay))
                    drawCircle(Color(0xFF8BD5FF), 9f, O(ax, ay), style = Stroke(1.5f))
                    val ac = Path().apply {
                        moveTo(ax.toFloat(), (ay - 7).toFloat()); lineTo((ax + 5).toFloat(), (ay + 5).toFloat())
                        lineTo(ax.toFloat(), (ay + 2).toFloat()); lineTo((ax - 5).toFloat(), (ay + 5).toFloat()); close()
                    }
                    drawPath(ac, Color(0xFF8BD5FF)); drawPath(ac, Color(0xFF10202C), style = Stroke(1f))
                    svgText(tm, "AIRCRAFT", ax + 10, ay - 9, 10f, Color(0xFF8BD5FF))
                }
                svgText(tm, "ROUTE GEOMETRY + SIMULATED POSITION · NOT A CHARTED ATS ROUTE", 12.0, 266.0, 9f, AxisText)
            }
        }
        Column(Modifier.padding(top = 8.dp)) {
            PlanMetricGrid(
                listOf(
                    "$departure reference" to R.coordText(map.start),
                    "$destination reference" to R.coordText(map.end),
                ),
            )
            val muted = MaterialTheme.colorScheme.onSurfaceVariant
            map.distanceNm?.let { Text(R.greatCircleText(it), color = muted, fontSize = 12.sp, lineHeight = 16.sp, modifier = Modifier.padding(top = 8.dp)) }
            if (air && nav != null) Text("Aircraft position: ${R.toFixed(nav.latitude, 4)}, ${R.toFixed(nav.longitude, 4)} · ${nav.positionMode.label.lowercase()}.", color = muted, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp))
            if (alternate.isNotEmpty()) Text(R.alternateText(alternate), color = muted, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp))
        }
    }
}

@Composable
fun CruiseProfileView(cruiseAltitudeFt: Double) {
    val tm = rememberTextMeasurer()
    val profile = R.makeProfile(cruiseAltitudeFt)
    val labels = R.profileAltitudeLabels(cruiseAltitudeFt)
    SvgFrame {
        Canvas(Modifier.fillMaxWidth().aspectRatio(600f / 310f)) {
            val sc = size.width / 600f
            withTransform({ scale(sc, sc, Offset.Zero) }) {
                for (i in 0..5) {
                    drawLine(Grid, O(54.0, 26.0 + i * 45), O(578.0, 26.0 + i * 45), 1f, pathEffect = dashed(4f, 5f))
                    svgText(tm, labels[i], 45.0, 30.0 + i * 45, 11f, AxisText, 2)
                }
                withTransform({ rotate(-90f, Offset(14f, 160f)) }) { svgText(tm, "Altitude (ft)", 14.0, 160.0, 11f, AxisText) }
                val line = Path()
                profile.raw.forEachIndexed { i, p -> if (i == 0) line.moveTo(p.x.toFloat(), p.y.toFloat()) else line.lineTo(p.x.toFloat(), p.y.toFloat()) }
                val fill = Path().apply { addPath(line); lineTo(578f, 251f); lineTo(54f, 251f); close() }
                val top = profile.raw.minOf { it.y }.toFloat()
                drawPath(fill, Brush.verticalGradient(listOf(Teal.copy(alpha = 0.32f), Teal.copy(alpha = 0.02f)), startY = top, endY = 251f))
                drawPath(line, Teal, style = Stroke(3f, cap = StrokeCap.Round, join = StrokeJoin.Round))
                profile.points.forEach { p ->
                    drawCircle(Color(0xFFD5FFF5), 4f, O(p.x, p.y)); drawCircle(Teal, 4f, O(p.x, p.y), style = Stroke(2f))
                    svgText(tm, p.label, p.x, maxOf(15.0, p.y - 12), 10f, LabelText, 1)
                }
                listOf(54.0 to "DEP", 150.0 to "CLB", 270.0 to "CRZ", 390.0 to "DSC", 490.0 to "APP", 578.0 to "ARR").forEach { (x, l) -> svgText(tm, l, x, 278.0, 10f, AxisText, 1) }
                svgText(tm, "Flight phase (schematic, not to scale)", 316.0, 300.0, 11f, AxisText, 1)
            }
        }
    }
}

@Composable
fun LandingProfileView(approachAltitudeFt: Double) {
    val tm = rememberTextMeasurer()
    val ay = R.landingApproachY(approachAltitudeFt).toFloat()
    SvgFrame {
        Canvas(Modifier.fillMaxWidth().aspectRatio(600f / 180f)) {
            val sc = size.width / 600f
            withTransform({ scale(sc, sc, Offset.Zero) }) {
                for (i in 0..3) drawLine(Grid, O(44.0, 20.0 + i * 38), O(580.0, 20.0 + i * 38), 1f, pathEffect = dashed(4f, 5f))
                val line = Path().apply { moveTo(48f, 30f); lineTo(210f, 45f); lineTo(345f, ay); lineTo(500f, 145f); lineTo(580f, 145f) }
                val fill = Path().apply { addPath(line); lineTo(580f, 160f); lineTo(48f, 160f); close() }
                drawPath(fill, Brush.verticalGradient(listOf(Gold.copy(alpha = 0.30f), Gold.copy(alpha = 0.02f)), startY = 30f, endY = 160f))
                drawPath(line, Gold, style = Stroke(3f, join = StrokeJoin.Round))
                svgText(tm, "DESCENT", 48.0, 18.0, 10f, LabelText)
                svgText(tm, "APPROACH ${R.fmt(approachAltitudeFt)} ft", 345.0, 65.0, 10f, LabelText, 1)
                svgText(tm, "RWY", 550.0, 132.0, 10f, LabelText, 1)
                svgText(tm, "Schematic only · chart constraints not loaded", 300.0, 175.0, 10f, AxisText, 1)
            }
        }
    }
}
