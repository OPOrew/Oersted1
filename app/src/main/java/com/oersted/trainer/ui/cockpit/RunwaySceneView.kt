package com.oersted.trainer.ui.cockpit

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.oersted.trainer.sim.MarkerBeacons
import com.oersted.trainer.sim.MarkerBeacons.MarkerId
import com.oersted.trainer.sim.RadioNav
import com.oersted.trainer.sim.RunwaySceneRules as R
import com.oersted.trainer.sim.RunwaySceneRules.Mode
import com.oersted.trainer.ui.common.Classic737Palette
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.tan

/**
 * Port of RunwayScene.tsx: the runway view (side elevation) shown by the Navigation and Autopilot training tabs. All numbers come from
 * [R.RunwaySceneModel] (the port of the rAF state machine), stepped by a frame loop here; the drawing is the web SVG in its 640 x 214 viewBox.
 * It only reads the live simulation. Horizontal and vertical scales differ (schematic, not to scale).
 */
private val GrassC = Color(0xFF14301F)
private val RwyC = Color(0xFF2F343A)
private val LineW = Color(0xFFD8DDE2)
private val DimC = Color(0xFF7B8794)
private val TxtC = Color(0xFFC5CDD5)
private val GreenC = Color(0xFF3DD68C)
private val StrokeBox = Color(0xFF2A323A)

private fun O(x: Double, y: Double) = Offset(x.toFloat(), y.toFloat())
private fun hexColor(s: String): Color = Color(("FF" + s.removePrefix("#")).toLong(16))

/** Absolute M / L / C / H / V / Z path strings (all the aircraft silhouette needs). */
private fun svgD(d: String): Path {
    val p = Path()
    val tok = Regex("[MLCHVZ]|-?\\d*\\.?\\d+").findAll(d).map { it.value }.toList()
    var i = 0
    var cx = 0f; var cy = 0f
    fun n() = tok[i++].toFloat()
    while (i < tok.size) {
        when (tok[i++]) {
            "M" -> { cx = n(); cy = n(); p.moveTo(cx, cy) }
            "L" -> { cx = n(); cy = n(); p.lineTo(cx, cy) }
            "H" -> { cx = n(); p.lineTo(cx, cy) }
            "V" -> { cy = n(); p.lineTo(cx, cy) }
            "C" -> { val a = n(); val b = n(); val c = n(); val e = n(); cx = n(); cy = n(); p.cubicTo(a, b, c, e, cx, cy) }
            "Z" -> p.close()
        }
    }
    return p
}

private val P_TAILPLANE = svgD("M-48 -1.6 L-34 0 L-34 1.5 L-49 -0.2 Z")
private val P_WING = svgD("M10 3.8 L-6 3.8 L-27 9.4 L-19 9.4 Z")
private val P_FUSELAGE = svgD("M-50 -1.5 C-44 -4 -38 -6.1 -30 -6.1 L30 -6.1 C40 -6.1 47 -3.5 50 1 C47 4.5 41 6.1 33 6.1 L-22 6.1 C-33 6.1 -43 2 -50 -1.5 Z")
private val P_STRIPE = svgD("M-45 1.4 L38 0.4 L38 2.1 L-44 3.1 Z")
private val P_WINDSCREEN = svgD("M37 -4 L43.2 -3.3 L44.5 -1.5 L37.6 -1.7 Z")
private val P_FIN = svgD("M-27 -6.1 L-42 -24 L-48.5 -24 L-46 -6.1 Z")
private val P_INTAKE = svgD("M3 7.2 L0.4 8.2 L3 9.4 Z")

private fun DrawScope.txt(
    tm: TextMeasurer, text: String, x: Double, baseline: Double, size: Double, color: Color,
    anchor: Int = 0, bold: Boolean = false, mono: Boolean = false, alpha: Float = 1f,
) {
    val lay = tm.measure(
        text,
        TextStyle(color = color.copy(alpha = color.alpha * alpha), fontSize = size.toFloat().toSp(), fontFamily = if (mono) FontFamily.Monospace else FontFamily.SansSerif, fontWeight = if (bold) FontWeight.Bold else FontWeight.Normal),
    )
    val left = when (anchor) { 1 -> x.toFloat() - lay.size.width / 2f; 2 -> x.toFloat() - lay.size.width; else -> x.toFloat() }
    drawText(lay, topLeft = Offset(left, baseline.toFloat() - lay.firstBaseline))
}

private fun DrawScope.line(x1: Double, y1: Double, x2: Double, y2: Double, c: Color, w: Double, alpha: Float = 1f, dash: FloatArray? = null) =
    drawLine(c.copy(alpha = c.alpha * alpha), O(x1, y1), O(x2, y2), w.toFloat(), pathEffect = dash?.let { PathEffect.dashPathEffect(it, 0f) })

/** Flap position transmitter: needle = trailing-edge flap position (0-40 units), the lever detent is shown beside it. */
private fun DrawScope.flapGauge(tm: TextMeasurer, pos: Double, lever: Double, x: Double, y: Double) {
    val rr = 22.0; val cx = 28.0; val cy = 30.0
    fun pt(u: Double, r: Double): Pair<Double, Double> {
        val th = PI - (max(0.0, min(40.0, u)) / 40) * PI
        return Pair(cx + r * cos(th), cy - r * sin(th))
    }
    val moving = kotlin.math.abs(pos - lever) > 0.6
    withTransform({ translate(x.toFloat(), y.toFloat()) }) {
        drawRoundRect(Color(0xFF0B0F13).copy(alpha = 0.92f), Offset.Zero, Size(56f, 46f), androidx.compose.ui.geometry.CornerRadius(4f))
        drawRoundRect(StrokeBox.copy(alpha = 0.92f), Offset.Zero, Size(56f, 46f), androidx.compose.ui.geometry.CornerRadius(4f), style = Stroke(1f))
        drawArc(Color(0xFF3D4650), 180f, 180f, false, O(cx - rr, cy - rr), Size((2 * rr).toFloat(), (2 * rr).toFloat()), style = Stroke(1f))
        val major = listOf(0, 5, 15, 30, 40)
        for (u in listOf(0, 1, 2, 5, 10, 15, 25, 30, 40)) {
            val a = pt(u.toDouble(), rr); val b = pt(u.toDouble(), rr - if (u in major) 5 else 3)
            line(a.first, a.second, b.first, b.second, Color(0xFF9AA6B2), 0.8)
            if (u in major) { val l = pt(u.toDouble(), rr - 9); txt(tm, u.toString(), l.first, l.second + 1.5, 4.5, Color(0xFF9AA6B2), anchor = 1, mono = true) }
        }
        val (nx, ny) = pt(pos, rr - 3)
        drawLine(if (moving) Color(0xFFF2B84B) else Color(0xFFE8EEF4), O(cx, cy), O(nx, ny), 1.4f, cap = StrokeCap.Round)
        drawCircle(Color(0xFFE8EEF4), 2f, O(cx, cy))
        txt(tm, "FLAPS", cx, cy + 8, 5.0, Color(0xFF9AA6B2), anchor = 1, mono = true)
        txt(tm, "%.1f".format(java.util.Locale.ROOT, pos) + if (moving) " ▸ " + R.jsRound(lever) else "", cx, cy + 15, 6.0, if (moving) Color(0xFFF2B84B) else Color(0xFFE8EEF4), anchor = 1, mono = true)
    }
}

/**
 * Side view of a 737-200 (nose to the right), drawn to scale from the real proportions (length 30.5 m = 100 units, fuselage 3.76 m = 12.3 units).
 * Origin = ground contact of the main wheels; the whole aircraft pitches about them. Gear scales into the belly as it retracts.
 */
private fun DrawScope.airliner(gear: Double, pitch: Double, flaps: Double, spin: Double) {
    val g = max(0.0, min(1.0, gear))
    val f = min(5.0, flaps * 0.13)
    val body = Brush.verticalGradient(0f to Color(0xFFF6F8FA), 0.55f to Color(0xFFDDE3E8), 1f to Color(0xFFA9B3BD), startY = -6.1f, endY = 6.1f)
    val pod = Brush.verticalGradient(listOf(Color(0xFFC3CAD1), Color(0xFF7D8791)), startY = 6.3f, endY = 10.4f)
    withTransform({ scale(1.35f, 1.35f, Offset.Zero); translate(0f, -12f); rotate((-pitch).toFloat(), Offset(-2f, 12f)) }) {
        if (g > 0.04) {
            withTransform({ translate(0f, 6.1f); scale(1f, g.toFloat(), Offset.Zero); translate(0f, -6.1f) }) {
                drawRect(Color(0xFF8C969F), O(-2.6, 6.0), Size(1.2f, 4.4f))
                drawRect(Color(0xFF8C969F), O(33.4, 6.0), Size(1.2f, 4.2f))
                val wheels = listOf(Triple(-3.1, 10.1, 1.9), Triple(-1.0, 10.1, 1.9), Triple(34.0, 10.3, 1.7))
                val fills = listOf(Color(0xFF15181B), Color(0xFF1B1F23), Color(0xFF15181B))
                wheels.forEachIndexed { i, (wx, wy, wr) ->
                    drawCircle(fills[i], wr.toFloat(), O(wx, wy))
                    drawCircle(Color(0xFF6D7780), wr.toFloat(), O(wx, wy), style = Stroke(0.5f))
                    withTransform({ rotate((spin + i * 40).toFloat(), O(wx, wy)) }) {
                        drawLine(Color(0xFF9AA6B2), O(wx - wr * 0.75, wy), O(wx + wr * 0.75, wy), 0.45f)
                        drawCircle(Color(0xFFD8DEE4), 0.28f, O(wx + wr * 0.55, wy))
                    }
                }
            }
        }
        // tailplane (edge-on) and wing seen from slightly below, behind the fuselage
        drawPath(P_TAILPLANE, Color(0xFFB9C2CA)); drawPath(P_TAILPLANE, Color(0xFF7D8790), style = Stroke(0.3f))
        drawPath(P_WING, Color(0xFFC9D0D7)); drawPath(P_WING, Color(0xFF7D8790), style = Stroke(0.4f))
        if (f > 0) drawPath(Path().apply { moveTo(-8f, 4.6f); lineTo(-25f, 9f); lineTo(-25f, (9 + f).toFloat()); lineTo(-8f, (4.6 + f * 0.5).toFloat()); close() }, Color(0xFF8D97A1))
        // fuselage
        drawPath(P_FUSELAGE, body); drawPath(P_FUSELAGE, Color(0xFF8A949D), style = Stroke(0.5f))
        drawPath(P_STRIPE, Color(0xFF1F6FB5).copy(alpha = 0.95f))
        for (k in 0 until 21) drawRoundRect(Color(0xFF25303A), O(-26 + k * 2.55, -3.3), Size(1.1f, 1.6f), androidx.compose.ui.geometry.CornerRadius(0.3f))
        drawPath(P_WINDSCREEN, Color(0xFF1A2530))
        drawLine(Color(0xFF7D8790), O(40.3, -3.7), O(41.0, -1.6), 0.4f)
        drawRoundRect(Color(0xFF9AA4AD), O(28.5, -4.6), Size(3.2f, 6.8f), androidx.compose.ui.geometry.CornerRadius(0.5f), style = Stroke(0.4f))
        // fin with rudder line, and the engine pod hung under the wing leading edge
        drawPath(P_FIN, Color(0xFF1F6FB5)); drawPath(P_FIN, Color(0xFF16507F), style = Stroke(0.4f))
        drawLine(Color(0xFF3B8FD0), O(-44.5, -22.0), O(-43.2, -7.0), 0.4f)
        drawRoundRect(pod, O(3.0, 6.3), Size(20.5f, 4.1f), androidx.compose.ui.geometry.CornerRadius(2f))
        drawRoundRect(Color(0xFF6F7983), O(3.0, 6.3), Size(20.5f, 4.1f), androidx.compose.ui.geometry.CornerRadius(2f), style = Stroke(0.5f))
        drawOval(Color(0xFF2A3138), O(23.3 - 0.9, 8.35 - 1.9), Size(1.8f, 3.8f))
        drawPath(P_INTAKE, Color(0xFF7C868F))
    }
}

private fun DrawScope.runway(tm: TextMeasurer, x0: Double, y: Double, pxPerFt: Double, lenFt: Double, label: String) {
    val w = lenFt * pxPerFt
    val ticks = floor(lenFt / 2000).toInt()
    drawRect(RwyC, O(x0, y), Size(w.toFloat(), 9f))
    drawRect(Color(0xFF4D555D), O(x0, y), Size(w.toFloat(), 1.2f))
    for (k in 0 until floor(lenFt / 400).toInt()) drawRect(LineW.copy(alpha = 0.8f), O(x0 + 90 * pxPerFt + k * 400 * pxPerFt, y + 4), Size((200 * pxPerFt).toFloat(), 1.2f))
    for (k in 0 until 7) drawRect(LineW, O(x0 + 14 * pxPerFt + k * 24 * pxPerFt, y + 1.5), Size(1.6f, 6f))
    if (pxPerFt >= 0.03) {
        for (k in 0..floor(lenFt / 150).toInt()) drawCircle(Color(0xFFFFEAA8).copy(alpha = 0.95f), 0.75f, O(x0 + k * 150 * pxPerFt, y - 0.8))
        for (k in 0 until floor(lenFt / 1000).toInt() - 1) {
            val bx = x0 + (k + 1) * 1000 * pxPerFt
            line(bx, y - 1, bx, y - 4, Color(0xFF6D7780), 0.5)
            drawRoundRect(Color(0xFF0B0F13), O(bx - 4, y - 12), Size(8f, 8f), androidx.compose.ui.geometry.CornerRadius(0.8f))
            drawRoundRect(Color(0xFFCFD6DC), O(bx - 4, y - 12), Size(8f, 8f), androidx.compose.ui.geometry.CornerRadius(0.8f), style = Stroke(0.5f))
            txt(tm, R.jsRound((lenFt - (k + 1) * 1000) / 1000).toString(), bx, y - 6, 5.5, Color(0xFFFFD84A), anchor = 1, bold = true)
        }
    }
    txt(tm, label, x0 + 130 * pxPerFt, y + 8, 7.0, LineW, alpha = 0.85f)
    for (k in 0..ticks) {
        line(x0 + k * 2000 * pxPerFt, y + 9, x0 + k * 2000 * pxPerFt, y + 13, DimC, 0.8)
        txt(tm, (k * 2).toString(), x0 + k * 2000 * pxPerFt, y + 23, 8.0, DimC, anchor = 1)
    }
    txt(tm, " ×1000 ft", x0 + w, y + 23, 8.0, DimC, anchor = 2)
}

private fun DrawScope.drawScene(tm: TextMeasurer, v: R.View) {
    val vbw = R.VBW; val vbh = R.VBH; val gy = R.GY
    val sc = (size.width / vbw).toFloat()
    withTransform({ scale(sc, sc, Offset.Zero) }) {
        clipRect(0f, 0f, vbw.toFloat(), vbh.toFloat()) {
            // ── geometry ──
            val pxPerFt = v.zoom
            val x0 = 74.0
            val vs = 0.045 // px per ft, vertical
            val w2 = vbw + 240
            val followX = 230 / pxPerFt
            val camX = max(0.0, v.xFt - followX)
            val vsg = if (v.mode == Mode.FLIGHT && v.fromRoll) pxPerFt else vs
            val camAlt = max(0.0, v.agl - 80 / vsg)
            val groundY = gy + camAlt * vsg
            val acX = x0 + (v.xFt - camX) * pxPerFt
            val acY = groundY - v.agl * vsg
            val hi = min(1.0, v.alt / 42000)
            fun mix(c1: IntArray, c2: IntArray, k: Double) = Color(R.lerp(c1[0].toDouble(), c2[0].toDouble(), k).roundToInt(), R.lerp(c1[1].toDouble(), c2[1].toDouble(), k).roundToInt(), R.lerp(c1[2].toDouble(), c2[2].toDouble(), k).roundToInt())
            val skyTop = mix(intArrayOf(23, 50, 75), intArrayOf(4, 8, 14), hi)
            val skyLow = mix(intArrayOf(44, 78, 106), intArrayOf(10, 18, 32), hi)
            val showGround = groundY < vbh + 4
            val showRunway = v.mode == Mode.TAKEOFF || v.mode == Mode.ROLLOUT || (v.mode == Mode.FLIGHT && v.fromRoll && v.xFt < R.RWY_FT + 3000)

            val dMax = 13.0
            val pxPerNm = 520 / dMax
            val thrX = 556.0
            val ax = thrX - v.dist * pxPerNm
            fun gsPx(nm: Double) = tan(RadioNav.RWY_GS_DEG * PI / 180) * nm * R.NM_FT * 0.028
            val aglApp = min(130.0, v.agl * 0.028)

            drawRect(Brush.verticalGradient(listOf(skyTop, skyLow), startY = 0f, endY = vbh.toFloat()), Offset.Zero, Size(vbw.toFloat(), vbh.toFloat()))
            if (v.mode != Mode.APPROACH && hi > 0.35) {
                for (i in 0 until 26) drawCircle(Color(0xFFCFE3FF).copy(alpha = min(1.0, (hi - 0.35) * 1.2).toFloat()), (0.5 + (i % 3) * 0.35).toFloat(), O((i * 97.3) % vbw, (i * 41.7) % 120))
            }

            if (v.mode != Mode.APPROACH) {
                for (i in 0 until 44) {
                    val a = 1100 + i * 900 + ((i * 197) % 420)
                    val base = (i * 211.3) % w2
                    val par = 2 + (i % 4) * 0.7
                    val sx = R.mod(base - v.xFt * pxPerFt * par, w2) - 120
                    val sy = groundY - a * vsg
                    if (!(sy > -30 && sy < vbh + 10)) continue
                    val s = 0.7 + (i % 5) * 0.18
                    val o = (max(0.08, 0.3 - a / 160000.0) + 0.1).toFloat()
                    val cc = Color(0xFFE8EEF4).copy(alpha = o)
                    withTransform({ translate(sx.toFloat(), sy.toFloat()); scale(s.toFloat(), s.toFloat(), Offset.Zero) }) {
                        drawOval(cc, O(-34.0, -8.0), Size(68f, 16f)); drawOval(cc, O(-38.0, -5.0), Size(40f, 14f)); drawOval(cc, O(-6.0, -11.0), Size(44f, 16f))
                    }
                }
                if (v.flying && v.cas > 120) {
                    for (i in 0 until 6) {
                        val sx = R.mod(i * 131 - v.xFt * pxPerFt * 5, w2) - 100; val y = 30 + ((i * 53) % 110)
                        line(sx, y.toDouble(), sx + 18, y.toDouble(), Color(0xFFCFE0F0), 0.8, alpha = 0.12f)
                    }
                }
                if (showGround) {
                    drawRect(GrassC, O(0.0, groundY), Size(vbw.toFloat(), max(0.0, vbh - groundY).toFloat()))
                    for (k in 0 until 22) {
                        val gx = R.mod(k * 1000 * pxPerFt * 2 - camX * pxPerFt, 22 * 1000 * pxPerFt * 2)
                        line(gx, groundY, gx, min(vbh, groundY + 60), Color(0xFF1B4129), 0.8)
                    }
                    if (showRunway) runway(tm, x0 - camX * pxPerFt, groundY, pxPerFt, R.RWY_FT, if (v.mode == Mode.ROLLOUT) "RWY 06" else "RWY 06 →")
                }
                if (camAlt > 0) {
                    val rulerStep = if (v.mode == Mode.FLIGHT && v.fromRoll) 500 else 1000
                    val rulerLo = floor(max(0.0, camAlt - 200) / rulerStep).toInt() * rulerStep
                    val count = kotlin.math.ceil(vbh / vsg / rulerStep).toInt() + 2
                    for (i in 0 until count) {
                        val a = rulerLo + i * rulerStep
                        val yy = groundY - a * vsg
                        if (!(yy > 4 && yy < vbh - 4 && a > 0)) continue
                        line(4.0, yy, 13.0, yy, DimC, 0.8); txt(tm, R.fmt(a.toDouble()), 16.0, yy + 3, 8.0, DimC)
                    }
                }
                if (showRunway && camAlt == 0.0 && v.agl < 700) {
                    val rx = max(10.0, 40 - v.agl * 0.045)
                    drawOval(Color.Black.copy(alpha = max(0.0, 0.38 * (1 - v.agl / 700)).toFloat()), O(acX + v.agl * 0.1 - rx, groundY - 1 - 1.8), Size((2 * rx).toFloat(), 3.6f))
                }
                withTransform({ translate(acX.toFloat(), acY.toFloat()) }) { airliner(v.gear, v.pitch, v.flapPos, v.spin) }
                if (v.mode == Mode.FLIGHT && v.fromRoll && v.agl > 20)
                    txt(tm, "PITCH ${R.jsRound(v.pitch)}° · PATH ${"%.0f".format(java.util.Locale.ROOT, R.pathDeg(v.vsFpm, v.cas))}°", vbw - 8, vbh - 8, 9.0, TxtC, anchor = 2)
                if (v.flying && camAlt == 0.0) line(acX - 2, acY + 2, acX - 2, groundY, DimC, 0.8, dash = floatArrayOf(2f, 3f))
                if (v.flying && camAlt == 0.0 && v.agl > 40) txt(tm, R.fmt(v.agl) + " ft", acX + 8, (acY + groundY) / 2, 9.0, TxtC)
                if (v.mode == Mode.TAKEOFF && !v.flying && v.gs > 2) for (k in 0 until 5)
                    line(acX - 76 - k * 9, groundY - 8 - (k % 2) * 3, acX - 86 - k * 9, groundY - 8 - (k % 2) * 3, Color(0xFF9FB0BF), 1.0, alpha = (0.5 - k * 0.08).toFloat())
            }

            if (v.mode == Mode.APPROACH) {
                drawRect(GrassC, O(0.0, gy), Size(vbw.toFloat(), (vbh - gy).toFloat()))
                runway(tm, thrX, gy, 0.0042, R.RWY_FT, "RWY 06")
                txt(tm, "threshold", thrX, gy + 34, 8.0, TxtC, anchor = 1)
                for (nm in listOf(2, 4, 6, 8, 10, 12)) {
                    line(thrX - nm * pxPerNm, gy, thrX - nm * pxPerNm, gy + 4, DimC, 1.0)
                    txt(tm, nm.toString(), thrX - nm * pxPerNm, gy + 14, 8.0, DimC, anchor = 1)
                }
                // glide slope beam, valid inside 10 NM in this trainer
                drawLine(GreenC.copy(alpha = 0.35f), O(thrX, gy), O(thrX - dMax * pxPerNm, gy - gsPx(dMax)), 1.2f)
                drawLine(GreenC, O(thrX, gy), O(thrX - 10 * pxPerNm, gy - gsPx(10.0)), 1.6f)
                txt(tm, "G/S 3° · signal from 10 NM", thrX - 10 * pxPerNm + 2, gy - gsPx(10.0) - 5, 8.0, GreenC)
                // marker beacons: post, fan beam and name
                for (mk in MarkerBeacons.MARKERS) {
                    val mx = thrX - mk.distNm * pxPerNm
                    val col = hexColor(mk.color)
                    val lit = v.keyed(mk.id)
                    drawPath(Path().apply { moveTo(mx.toFloat(), gy.toFloat()); lineTo((mx - 11).toFloat(), (gy - 74).toFloat()); lineTo((mx + 11).toFloat(), (gy - 74).toFloat()); close() }, col.copy(alpha = if (v.recv(mk.id)) 0.28f else 0.1f))
                    drawRect(col, O(mx - 1.5, gy - 6), Size(3f, 6f))
                    drawCircle(if (lit) col else Color(0xFF12171C), 5.5f, O(mx, gy - 82))
                    drawCircle(col, 5.5f, O(mx, gy - 82), style = Stroke(1.2f))
                    txt(tm, when (mk.id) { MarkerId.OM -> "OM"; MarkerId.MM -> "MM"; MarkerId.IM -> "IM" }, mx, gy - 93, 8.0, col, anchor = 1)
                }
                withTransform({ translate(ax.toFloat(), (gy - aglApp).toFloat()) }) { airliner(v.gear, v.pitch, v.flapPos, 0.0) }
                txt(tm, R.jsRound(v.agl).toString() + " ft", ax, gy - aglApp - 74, 9.0, TxtC, anchor = 1)
                // marker receiver panel
                withTransform({ translate((vbw - 3 * 62 - 4).toFloat(), 8f) }) {
                    MarkerBeacons.MARKERS.reversed().forEachIndexed { k, mk ->
                        val col = hexColor(mk.color)
                        withTransform({ translate((k * 62).toFloat(), 0f) }) {
                            drawRoundRect(Color(0xFF0D1217), Offset.Zero, Size(56f, 20f), androidx.compose.ui.geometry.CornerRadius(3f))
                            drawRoundRect(StrokeBox, Offset.Zero, Size(56f, 20f), androidx.compose.ui.geometry.CornerRadius(3f), style = Stroke(1f))
                            drawCircle(if (v.keyed(mk.id)) col else Color(0xFF1B232B), 5f, O(11.0, 10.0))
                            drawCircle(col, 5f, O(11.0, 10.0), style = Stroke(1f))
                            txt(tm, mk.lamp, 21.0, 13.0, 9.0, if (v.recv(mk.id)) col else DimC)
                        }
                    }
                }
                if (v.recvOm || v.recvMm || v.recvIm)
                    txt(tm, MarkerBeacons.MARKERS.filter { v.recv(it.id) }.joinToString("") { "${it.name} · ${R.jsRound(it.hz)} Hz ${it.morse}" }, vbw - 12, 42.0, 9.0, TxtC, anchor = 2)
            }
            if ((v.mode == Mode.TAKEOFF || (v.mode == Mode.FLIGHT && v.fromRoll)) && v.agl < 12 && v.pitch > 11)
                txt(tm, "TAIL STRIKE LIMIT · PITCH ${R.jsRound(v.pitch)}°", vbw / 2, 20.0, 10.0, Color(0xFFFF4D4D), anchor = 1, bold = true)
            flapGauge(tm, v.flapPos, v.flaps, if (v.mode == Mode.APPROACH) 6.0 else vbw - 62, 6.0)
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun RunwayScene(cockpit: CockpitModel, modifier: Modifier = Modifier) {
    val model = remember { R.RunwaySceneModel() }
    var v by remember { mutableStateOf(R.View()) }
    LaunchedEffect(model) {
        while (true) {
            val nowMs = androidx.compose.runtime.withFrameNanos { it } / 1_000_000.0
            val sim = cockpit.simState.value
            val mip = cockpit.mipState.value
            val sit = cockpit.situationSample()
            val mk = mip.markers
            val i = R.Inputs(
                wow = sim.wow, altFt = sim.psFlightAltFt, casKt = sim.psFlightCasKt, gsKt = sim.groundSpeedKt, flaps = sim.flaps, flapPos = sim.flapPos,
                gearLever = sim.gear, vsCmdFpm = sim.psFlightVsFpm, sitX = sit.x, sitY = sit.y, sitFlying = sit.flying, navOn = mip.navOn, navTuned = mip.navTuned,
                navSceneIsRpll06 = mip.navScene == RadioNav.NavSceneId.RPLL06, phase = cockpit.phaseView.value.phase, attPitchDeg = mip.attCapt.pitch,
                markerOm = mk.om, markerMm = mk.mm, markerIm = mk.im,
            )
            model.step(i, nowMs)?.let { v = it }
        }
    }
    val tm = rememberTextMeasurer()
    val border = Classic737Palette.Border
    Column(modifier.fillMaxWidth().padding(top = 8.dp).background(Classic737Palette.Panel, RoundedCornerShape(4.dp)).border(1.dp, border, RoundedCornerShape(4.dp)).padding(8.dp)) {
        FlowRow(Modifier.fillMaxWidth().padding(bottom = 4.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("RUNWAY VIEW · ${R.title(v).uppercase()}", color = Classic737Palette.Subtle, fontSize = 9.sp, letterSpacing = 0.14.em)
            val amber = R.bannerIsAmber(v.banner)
            Text(
                v.banner.uppercase(), color = if (amber) Color(0xFFFDE68A) else Classic737Palette.Fg, fontFamily = FontFamily.Monospace, fontSize = 9.sp,
                modifier = Modifier.background(if (amber) Color(0x4D451A03) else Color.Transparent, RoundedCornerShape(4.dp))
                    .border(1.dp, if (amber) Color(0x99F59E0B) else border, RoundedCornerShape(4.dp)).padding(horizontal = 8.dp, vertical = 2.dp),
            )
        }
        Canvas(Modifier.fillMaxWidth().aspectRatio((R.VBW / R.VBH).toFloat()).clip(RoundedCornerShape(4.dp)).border(1.dp, StrokeBox, RoundedCornerShape(4.dp))) { drawScene(tm, v) }
        Text(
            "Live from the simulation: ground speed → distance flown, altitude, pitch, gear and flaps; the camera follows the aircraft up and along the route. " +
                "Horizontal and vertical scales differ (schematic). Marker tones (OM 400 Hz · MM 1300 Hz · IM 3000 Hz) play when the page SOUND switch is on; " +
                "marker lamps are on the instrument panel (OUTER · MIDDLE · AIRWAYS).",
            color = Classic737Palette.Subtle, fontSize = 8.sp, lineHeight = 10.sp, modifier = Modifier.padding(top = 4.dp),
        )
    }
}
