package com.oersted.trainer.ui.cockpit

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.res.imageResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import com.oersted.trainer.R
import com.oersted.trainer.sim.ApuAnimState
import com.oersted.trainer.sim.ApuDiagramRules as R0
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Port of components/panel/ApuDiagram.tsx: the animated APU cutaway on the supplied diagram art (res/drawable-nodpi/apu_diagram.webp
 * and the grey "cold" twin, cross-faded over the power section by EGT). Geometry, rotor blade quads, flow paths and derived flags are in
 * sim/ApuDiagramRules.kt (tested); the web's requestAnimationFrame loop (rotor phase, gear phase, flow dashes, flame streaks, glow
 * flicker) is a withFrameNanos loop in ApuAnimState whose tick is read only in the draw phase. CSS animate-pulse (door jam, starter
 * engaged, igniter sparks) is an InfiniteTransition. The HTML value tags are drawn on the canvas. Compose only; verify on a device.
 */

private val Neutral500 = Color(0xFF737373)
private val Neutral900 = Color(0xFF171717)
private val Emerald700 = Color(0xFF047857)
private val Red600 = Color(0xFFDC2626)
private val Amber600 = Color(0xFFD97706)

private fun O(x: Double, y: Double) = Offset(x.toFloat(), y.toFloat())
private fun C(v: Long) = Color(v)

/** SVG stroke-dashoffset d == Compose phase d; keep it positive for Skia. */
private fun dash(a: Float, b: Float, offset: Double): PathEffect {
    val period = (a + b).toDouble()
    val ph = (((offset % period) + period) % period).toFloat()
    return PathEffect.dashPathEffect(floatArrayOf(a, b), ph)
}

private fun flowPath(p: DoubleArray): Path = Path().apply {
    moveTo(p[0].toFloat(), p[1].toFloat())
    if (p.size == 8) cubicTo(p[2].toFloat(), p[3].toFloat(), p[4].toFloat(), p[5].toFloat(), p[6].toFloat(), p[7].toFloat())
    else lineTo(p[2].toFloat(), p[3].toFloat())
}

private fun polyPath(p: DoubleArray): Path = Path().apply {
    for (i in 0 until p.size / 2) if (i == 0) moveTo(p[0].toFloat(), p[1].toFloat()) else lineTo(p[2 * i].toFloat(), p[2 * i + 1].toFloat())
    close()
}

private fun DrawScope.spokePath(cx: Double, cy: Double, r: Double, n: Int, phi: Double, color: Color, w: Float) {
    for (e in R0.spokes(cx, cy, r, n, phi)) drawLine(color, O(cx, cy), O(e[0], e[1]), strokeWidth = w, cap = StrokeCap.Round)
}

@Composable
fun ApuDiagram(
    door: Double, fuel: Double, starter: Boolean, rpm: Double, egt: Double, oilPsi: Double, bleed: Double,
    genOnBus: Boolean, masterOff: Boolean, jam: Boolean, modifier: Modifier = Modifier,
) {
    val tm = rememberTextMeasurer(cacheSize = 256)
    val base = ImageBitmap.imageResource(R.drawable.apu_diagram)
    val cold = ImageBitmap.imageResource(R.drawable.apu_diagram_cold)
    val v = R0.view(door, fuel, rpm, egt, oilPsi, masterOff, jam)

    val anim = remember { ApuAnimState() }
    var tick by remember { mutableLongStateOf(0L) }
    val liveRpm by rememberUpdatedState(rpm)
    LaunchedEffect(Unit) {
        var last = androidx.compose.runtime.withFrameNanos { it }
        while (true) {
            val now = androidx.compose.runtime.withFrameNanos { it }
            val dt = min(0.1, (now - last) / 1e9)
            last = now
            anim.step(dt, liveRpm)
            tick = now
        }
    }
    val tr = rememberInfiniteTransition(label = "apu-pulse")
    val pulse by tr.animateFloat(1f, 0.5f, infiniteRepeatable(tween(1000, easing = LinearEasing), RepeatMode.Reverse), label = "pulse")

    val desc = "APU: ${rpm.roundToInt()}% RPM, EGT ${egt.roundToInt()} degrees C, inlet door ${(door * 100).roundToInt()}% open"
    Canvas(
        modifier.fillMaxWidth().aspectRatio((R0.IMG_W / R0.IMG_H).toFloat()).clip(RoundedCornerShape(8.dp))
            .background(Color.White).border(1.dp, Color(0xFF343A42), RoundedCornerShape(8.dp)).semantics { contentDescription = desc },
    ) {
        val sc = size.width / R0.IMG_W.toFloat()
        val nowMs = tick / 1e6   // read here, so the loop invalidates only the draw phase
        withTransform({ scale(sc, sc, Offset.Zero); translate(-R0.IMG_X.toFloat(), -R0.IMG_Y.toFloat()) }) {
            drawApu(tm, base, cold, v, anim, nowMs, pulse, door, fuel, starter, rpm, egt, bleed, genOnBus, masterOff, jam)
        }
    }
}

private fun DrawScope.drawApu(
    tm: TextMeasurer, base: ImageBitmap, cold: ImageBitmap, v: R0.View, an: ApuAnimState, nowMs: Double, pulse: Float,
    door: Double, fuel: Double, starter: Boolean, rpm: Double, egt: Double, bleed: Double, genOnBus: Boolean, masterOff: Boolean, jam: Boolean,
) {
    val dst = IntSize(R0.IMG_W.toInt(), R0.IMG_H.toInt())
    val at = IntOffset(R0.IMG_X.toInt(), R0.IMG_Y.toInt())
    // base art + cold twin cross-faded over the power section
    drawImage(base, dstOffset = at, dstSize = dst)
    val hr = R0.HOT_REGION
    clipRect(hr[0].toFloat(), hr[1].toFloat(), hr[2].toFloat(), hr[3].toFloat()) {
        drawImage(cold, dstOffset = at, dstSize = dst, alpha = (1 - v.heat).toFloat().coerceIn(0f, 1f))
    }

    // inlet door: louvres over the air-inlet plenum, edge-on when open
    val lh = R0.louvreHeight(door)
    if (lh > 0.6) for (i in 0 until 9) {
        drawRoundRect(if (jam) Color(0xFF7A2A26) else Color(0xFF24303C), O(520.0, R0.louvreCentre(i) - lh / 2), Size(122f, lh.toFloat()), CornerRadius(2f), alpha = 0.82f)
    }
    val doorA = (if (masterOff && door < 0.02) 0.3f else 0.95f) * (if (jam) pulse else 1f)
    drawRoundRect(C(v.doorTone), O(517.0, 124.0), Size(128f, 322f), CornerRadius(4f), style = Stroke(3f), alpha = doorA)

    // fuel: control unit tint, line and flow
    val fuelCol = if (v.fuelOpen) C(R0.GREEN) else if (v.fuelMoving) C(R0.AMBER) else null
    if (fuelCol != null) drawRect(fuelCol, O(36.0, 286.0), Size(128f, 44f), alpha = 0.28f)
    val fp = R0.FUEL_PATH
    val fuelLine = Path().apply { moveTo(fp[0].toFloat(), fp[1].toFloat()); for (i in 1 until fp.size / 2) lineTo(fp[2 * i].toFloat(), fp[2 * i + 1].toFloat()) }
    if (fuelCol != null) drawPath(fuelLine, fuelCol, alpha = 0.85f, style = Stroke(4f, cap = StrokeCap.Round))
    if (v.fuelOpen) drawPath(fuelLine, Color(0xFFEAFFEF), alpha = 0.9f, style = Stroke(1.6f, cap = StrokeCap.Butt, pathEffect = dash(6f, 12f, -an.dash * 0.6)))

    // lube unit + oil tank fill with oil pressure
    drawRect(Color(0xFF2C7FD9), O(166.0, 286.0), Size(132f, 44f), alpha = (0.3 * v.oil).toFloat())
    drawRect(Color(0xFF2C7FD9), O(322.0, 508 - 90 * v.oil), Size(54f, (90 * v.oil).toFloat()), alpha = 0.28f)

    // airflow (cold) and hot-gas flow
    if (v.airOn) for (p in R0.AIR_PATHS) drawPath(flowPath(p), Color(0xFF1F7FE0), alpha = 0.9f, style = Stroke(3.2f, cap = StrokeCap.Round, pathEffect = dash(7f, 11f, -an.dash)))
    if (v.gasOn) for (p in R0.GAS_PATHS) drawPath(flowPath(p), Color(0xFFFFF6C8), alpha = min(1.0, v.heat + 0.2).toFloat(), style = Stroke(3.2f, cap = StrokeCap.Round, pathEffect = dash(8f, 12f, -an.dash)))

    // shaft (turns with the spool)
    for (y in R0.shaftLines(an.phi, 1.2)) drawLine(Color.White.copy(alpha = 0.85f), O(402.0, y), O(880.0, y), strokeWidth = 1.1f)
    for (y in R0.shaftLines(an.phi, 0.0)) drawLine(Color(0xFF0A2846).copy(alpha = 0.7f), O(402.0, y), O(880.0, y), strokeWidth = 1.4f)

    // rotor blades: load compressor, engine compressor, two turbine wheels
    for (ro in R0.ROTORS) {
        val blades = Path()
        for (q in R0.bladeQuads(ro, an.phi)) {
            blades.moveTo(q[0].toFloat(), q[1].toFloat()); blades.lineTo(q[2].toFloat(), q[3].toFloat())
            blades.lineTo(q[4].toFloat(), q[5].toFloat()); blades.lineTo(q[6].toFloat(), q[7].toFloat()); blades.close()
        }
        drawPath(blades, C(ro.fill), alpha = 0.82f)
        drawPath(blades, Color(0xFF26323F), style = Stroke(0.7f, join = StrokeJoin.Round))
    }

    // accessory drive: gears, generator rotor, cooling fan, starter
    val gray = Color(0xFF3A3F47)
    val stCol = if (starter) Color(0xFFE08A00) else gray
    drawCircle(gray, 12f, O(352.0, 385.0), style = Stroke(1.4f)); drawCircle(gray, 9f, O(352.0, 412.0), style = Stroke(1.4f))
    spokePath(352.0, 385.0, 11.0, 8, an.gear, gray, 2f)
    spokePath(352.0, 412.0, 8.0, 6, -an.gear * 1.4 + 0.3, gray, 2f)
    drawCircle(gray, 12f, O(52.0, 271.0), style = Stroke(1.4f)); spokePath(52.0, 271.0, 11.0, 4, an.phi * 1.3, gray, 2f)
    drawCircle(gray, 13f, O(172.0, 236.0), style = Stroke(1.4f)); spokePath(172.0, 236.0, 12.0, 4, an.gear * 2.2, gray, 2f)
    drawCircle(stCol, 13f, O(172.0, 196.0), style = Stroke(1.4f)); spokePath(172.0, 196.0, 11.0, 3, if (starter) an.phi * 1.2 else an.gear * 0.3, stCol, 2f)
    if (starter) {
        drawRoundRect(Color(0xFFFFB020), O(152.0, 178.0), Size(168f, 36f), CornerRadius(4f), alpha = 0.3f * pulse)
        drawRoundRect(Color(0xFFE08A00), O(152.0, 178.0), Size(168f, 36f), CornerRadius(4f), style = Stroke(3f), alpha = pulse)
    }
    if (genOnBus) {
        drawRoundRect(Color(0xFF2EA86A), O(25.0, 258.0), Size(276f, 26f), CornerRadius(3f), alpha = 0.28f)
        drawRoundRect(Color(0xFF2EA86A), O(25.0, 258.0), Size(276f, 26f), CornerRadius(3f), style = Stroke(2.5f))
    }

    // combustor glow (follows EGT)
    val glowA = R0.glowOpacity(v.heat, nowMs).toFloat().coerceIn(0f, 1f)
    if (glowA > 0f) {
        val glow = Brush.radialGradient(0f to Color(0xFFFFF6A8).copy(alpha = 0.95f), 0.45f to Color(0xFFFFC21F).copy(alpha = 0.6f), 1f to Color(0xFFFF6A00).copy(alpha = 0f), center = Offset.Zero, radius = 74f)
        for ((cy, ry) in listOf(180.0 to 34.0, 404.0 to 38.0)) {
            withTransform({ translate(772f, cy.toFloat()); scale(1f, (ry / 74.0).toFloat(), Offset.Zero) }) { drawCircle(glow, 74f, Offset.Zero, alpha = glowA) }
        }
    }
    // exhaust flame streaks shift right
    if (v.gasOn) {
        val exh = Path().apply { fillType = PathFillType.NonZero; addPath(polyPath(R0.EXH_TOP)); addPath(polyPath(R0.EXH_BOT)) }
        clipPath(exh) {
            withTransform({ translate((an.flame % 60).toFloat(), 0f) }) {
                for (o in listOf(-120, -60, 0, 60, 120)) {
                    for ((x, y) in listOf((840 + o).toFloat() to 205f, (840 + o + 24).toFloat() to 336f)) {
                        val streak = Brush.horizontalGradient(0f to Color(0xFFFFF2A8).copy(alpha = 0f), 0.5f to Color(0xFFFFF2A8).copy(alpha = 0.75f), 1f to Color(0xFFFFF2A8).copy(alpha = 0f), startX = x, endX = x + 46f)
                        drawRect(streak, Offset(x, y), Size(46f, 44f), alpha = (v.heat * 0.9).toFloat())
                    }
                }
            }
        }
    }
    if (bleed > 0.05) {
        val b = Path().apply { moveTo(695f, 168f); lineTo(695f, 136f); lineTo(640f, 136f) }
        drawPath(b, Color(0xFF1F9D62), alpha = bleed.toFloat().coerceIn(0f, 1f), style = Stroke(4f, cap = StrokeCap.Round))
    }
    // igniter sparks at light-off (green plug at the combustor lower right)
    if (v.lightOff) {
        val spark = Brush.radialGradient(0f to Color.White, 0.4f to Color(0xFF7CC4FF).copy(alpha = 0.9f), 1f to Color(0xFF3B8CFF).copy(alpha = 0f), center = O(818.0, 408.0), radius = 26f)
        drawCircle(spark, 26f, O(818.0, 408.0), alpha = pulse)
    }

    // value tags (HTML overlay in the web)
    fun pct(x: Double) = "${x.roundToInt()}%"
    tag(tm, 580.0, 90.0, "INLET DOOR", pct(door * 100), if (v.doorOpen) Emerald700 else if (jam) Red600 else Amber600)
    tag(tm, 640.0, 45.0, "COMPRESSOR", pct(rpm), Neutral900)
    tag(tm, 770.0, 450.0, "COMBUSTOR", "${egt.roundToInt()}°C", if (egt > 520) Red600 else Neutral900)
    tag(tm, 106.0, 345.0, "FUEL VLV", if (v.fuelOpen) "OPEN" else if (v.fuelMoving) "OPENING" else "CLOSED", if (v.fuelOpen) Emerald700 else if (v.fuelMoving) Amber600 else Neutral500)
    tag(tm, 236.0, 165.0, "STARTER", if (starter) "ENGAGED" else "OFF", if (starter) Amber600 else Neutral500)
}

private fun DrawScope.tag(tm: TextMeasurer, x: Double, y: Double, label: String, value: String, tone: Color) {
    val fs = 11f
    val lab = tm.measure(label, TextStyle(color = Neutral500, fontSize = fs.toSp(), fontFamily = FontFamily.Monospace))
    val valL = tm.measure(value, TextStyle(color = tone, fontSize = fs.toSp(), fontFamily = FontFamily.Monospace, fontWeight = FontWeight.SemiBold))
    val pad = 5f; val gap = 5f
    val w = pad * 2 + lab.size.width + gap + valL.size.width
    val h = lab.size.height + 2f
    val left = x.toFloat() - w / 2; val top = y.toFloat() - h / 2
    drawRoundRect(Color.White.copy(alpha = 0.85f), Offset(left, top), Size(w, h), CornerRadius(2f))
    drawRoundRect(Color.Black.copy(alpha = 0.25f), Offset(left, top), Size(w, h), CornerRadius(2f), style = Stroke(1f))
    drawText(lab, topLeft = Offset(left + pad, top + 1f))
    drawText(valL, topLeft = Offset(left + pad + lab.size.width + gap, top + 1f))
}
