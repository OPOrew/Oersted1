package com.oersted.trainer.ui.cockpit

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.oersted.trainer.R
import com.oersted.trainer.sim.EngineCutawayRules as C

/**
 * Port of EngineCutaway.tsx: the animated JT8D cutaway of the Engine Start trainer. The photo is the base layer; the
 * compressor and turbine rotors are drawn as vector geometry on top (rules in [C]), turning with N1 / N2 at a capped visual
 * speed, with the fan face, burner glow, igniter spark, exhaust plume and pneumatic starter highlight.
 * Differences from the web: the soft blur on the exhaust plume is left out, and the starter pulse is a plain alpha pulse.
 * Compose only; verify on CI.
 */

private val NEAR_FILL = listOf(Color(0xFF565A5F), Color(0xFFA3A6A4), Color(0xFFF1F2EE))

private fun poly(pts: List<DoubleArray>, close: Boolean = true): Path {
    val p = Path()
    pts.forEachIndexed { i, a -> if (i == 0) p.moveTo(a[0].toFloat(), a[1].toFloat()) else p.lineTo(a[0].toFloat(), a[1].toFloat()) }
    if (close) p.close()
    return p
}

private fun quadsPath(quads: List<DoubleArray>): Path {
    val p = Path()
    for (q in quads) {
        p.moveTo(q[0].toFloat(), q[1].toFloat())
        p.lineTo(q[2].toFloat(), q[3].toFloat())
        p.lineTo(q[4].toFloat(), q[5].toFloat())
        p.lineTo(q[6].toFloat(), q[7].toFloat())
        p.close()
    }
    return p
}

/** A circle gradient squashed into an ellipse (web radialGradient on an ellipse). */
private fun DrawScope.glow(cx: Float, cy: Float, rx: Float, ry: Float, stops: List<Pair<Float, Color>>, alpha: Float) {
    withTransform({
        translate(cx, cy)
        scale(1f, ry / rx, pivot = Offset.Zero)
    }) {
        drawCircle(
            Brush.radialGradient(*stops.toTypedArray(), center = Offset.Zero, radius = rx),
            radius = rx, center = Offset.Zero, alpha = alpha, blendMode = BlendMode.Screen,
        )
    }
}

@Composable
fun EngineCutaway(side: Int, n1: Double, n2: Double, egt: Double, starterOn: Boolean, fuelOn: Boolean, running: Boolean, modifier: Modifier = Modifier) {
    val live by rememberUpdatedState(doubleArrayOf(n1, n2, egt, if (fuelOn) 1.0 else 0.0))
    var phi1 by remember { mutableStateOf(0.0) }
    var phi2 by remember { mutableStateOf(0.0) }
    var fanAngle by remember { mutableStateOf(0.0) }
    var nowMs by remember { mutableLongStateOf(0L) }

    LaunchedEffect(Unit) {
        var last = 0L
        while (true) {
            androidx.compose.runtime.withFrameNanos { t ->
                val dt = if (last == 0L) 0.0 else minOf(0.1, (t - last) / 1.0e9)
                last = t
                val l = live
                phi1 = (phi1 + C.visualRate(l[0]) * C.TAU * dt) % C.TAU
                phi2 = (phi2 + C.visualRate(l[1]) * C.TAU * dt) % C.TAU
                fanAngle = (fanAngle + C.visualRate(l[0]) * 360 * dt) % 360
                nowMs = t / 1_000_000L
            }
        }
    }

    val heat = C.heat(egt)
    val plume = C.plume(fuelOn, running, egt)
    val shape = RoundedCornerShape(8.dp)
    val label = C.description(side, n1, n2, egt, running)

    BoxWithConstraints(
        modifier.fillMaxWidth().aspectRatio((C.W / C.H).toFloat()).clip(shape).background(Color(0xFF0B0D10)).border(1.dp, Color(0xFF343A42), shape)
            .semantics { contentDescription = label },
    ) {
        Image(painterResource(R.drawable.jt8d_cutaway), contentDescription = null, contentScale = ContentScale.FillBounds, modifier = Modifier.fillMaxSize())
        Canvas(Modifier.fillMaxSize()) {
            val sc = this.size.width / C.W.toFloat()
            scale(sc, this.size.height / C.H.toFloat(), pivot = Offset.Zero) {
                drawCutaway(phi1, phi2, fanAngle, nowMs.toDouble(), n1, egt, starterOn, fuelOn, plume, heat)
            }
        }
        // overlay tags
        val wDp = maxWidth
        val hDp = maxHeight
        for (t in C.tags(n1, n2, egt, starterOn, fuelOn)) {
            val x = wDp * (t.x / C.W).toFloat()
            val y = hDp * (t.y / C.H).toFloat()
            Row(
                Modifier
                    .offset(x, y)
                    .graphicsLayer { translationX = -size.width / 2f; translationY = -size.height / 2f }
                    .background(Color(0x99000000), RoundedCornerShape(2.dp))
                    .border(1.dp, Color(0x26FFFFFF), RoundedCornerShape(2.dp))
                    .padding(horizontal = 3.dp),
            ) {
                Text(t.label, color = Color(0xFF8F9AA5), fontFamily = FontFamily.Monospace, fontSize = 7.sp)
                if (t.value != null) {
                    val tone = when (t.tone) {
                        1 -> Color(0xFFE0A42E)
                        2 -> Color(0xFF65C798)
                        3 -> Color(0xFFFFB020)
                        4 -> Color(0xFF8F9AA5)
                        else -> Color(0xFFE6E1D2)
                    }
                    Text(" " + t.value, color = tone, fontFamily = FontFamily.Monospace, fontSize = 7.sp)
                }
            }
        }
    }
}

private fun DrawScope.drawCutaway(
    phi1: Double, phi2: Double, fanAngle: Double, nowMs: Double,
    n1: Double, egt: Double, starterOn: Boolean, fuelOn: Boolean, plume: Double, heat: Double,
) {
    // fan face (N1)
    val fanClip = Path().apply { addOval(Rect(C.FAN_CX.toFloat() - C.FAN_RX.toFloat(), C.FAN_CY.toFloat() - C.FAN_RY.toFloat(), C.FAN_CX.toFloat() + C.FAN_RX.toFloat(), C.FAN_CY.toFloat() + C.FAN_RY.toFloat())) }
    val fanOp = C.fanOpacity(n1).toFloat()
    if (fanOp > 0f) {
        clipPath(fanClip) {
            withTransform({
                translate(C.FAN_CX.toFloat(), C.FAN_CY.toFloat())
                scale((C.FAN_RX / C.FAN_RY).toFloat(), 1f, pivot = Offset.Zero)
                rotate(fanAngle.toFloat(), pivot = Offset.Zero)
            }) {
                val p = Path()
                for (t in C.fanTriangles()) {
                    p.moveTo(0f, 0f); p.lineTo(t[2].toFloat(), t[3].toFloat()); p.lineTo(t[4].toFloat(), t[5].toFloat()); p.close()
                }
                drawPath(p, Color(0xFFDFE8FF), alpha = 0.5f * fanOp, blendMode = BlendMode.Screen)
            }
        }
    }

    // compressor rotor
    val compClip = Path().apply { addRect(Rect(250f, 163f, 622f, 360f)) }
    clipPath(compClip) {
        drawRect(
            Brush.verticalGradient(0f to Color(0xFF07080A), 0.5f to Color(0xFF15181B), 1f to Color(0xFF07080A), startY = 163f, endY = 360f),
            topLeft = Offset(250f, 163f), size = androidx.compose.ui.geometry.Size(372f, 197f),
        )
        val compStages = C.STAGES.filter { it.cy == C.COMP_CY }
        val blades = compStages.map { it to C.bladeQuads(it, if (it.spool == 1) phi1 else phi2) }
        for ((_, b) in blades) drawPath(quadsPath(b.far), Color(0xFF34373A))
        val drum = Brush.verticalGradient(
            0f to Color(0xFF222427), 0.16f to Color(0xFF70736F), 0.34f to Color(0xFFC4C5C0), 0.52f to Color(0xFF8F918E), 0.78f to Color(0xFF4C4E50), 1f to Color(0xFF1C1E20),
            startY = (C.COMP_CY - 90).toFloat(), endY = (C.COMP_CY + 90).toFloat(),
        )
        for (b in C.BANDS.filter { it.cy == C.COMP_CY }) drawPath(poly(C.bandPoints(b)), drum)
        for (r in C.RINGS) drawPath(poly(C.ringPoints(r[0], r[1], r[2]), close = false), Color(0xFF111315), alpha = 0.85f, style = Stroke(1.6f))
        for (b in C.BANDS.filter { it.marks > 0 && it.cy == C.COMP_CY }) {
            val phi = if (b.spool == 1) phi1 else phi2
            for (l in C.keyLines(b, phi, 1.3)) drawLine(Color(0x47FFFFFF), Offset(l[0].toFloat(), l[1].toFloat()), Offset(l[2].toFloat(), l[3].toFloat()), 1f)
            for (l in C.keyLines(b, phi, 0.0)) drawLine(Color(0x6B000000), Offset(l[0].toFloat(), l[1].toFloat()), Offset(l[2].toFloat(), l[3].toFloat()), 1.3f)
        }
        for (e in C.slotEllipses(C.BANDS[1], phi2)) {
            val r = Rect((e[0] - e[2]).toFloat(), (e[1] - e[3]).toFloat(), (e[0] + e[2]).toFloat(), (e[1] + e[3]).toFloat())
            drawOval(Color(0xFF15171A), r.topLeft, r.size)
            drawOval(Color(0x8CFFFFFF), r.topLeft, r.size, style = Stroke(0.8f))
        }
        for ((_, b) in blades) b.near.forEachIndexed { i, q -> drawPath(quadsPath(q), NEAR_FILL[i]) }
    }

    // turbine rotor
    val turbClip = Path().apply { moveTo(992f, 152f); lineTo(1166f, 150f); lineTo(1166f, 398f); lineTo(992f, 398f); close() }
    clipPath(turbClip) {
        drawPath(turbClip, Brush.verticalGradient(0f to Color(0xFF07080A), 0.5f to Color(0xFF181A1D), 1f to Color(0xFF07080A), startY = 150f, endY = 398f))
        val turbStages = C.STAGES.filter { it.cy == C.TURB_CY }
        val blades = turbStages.map { it to C.bladeQuads(it, if (it.spool == 1) phi1 else phi2) }
        for ((_, b) in blades) drawPath(quadsPath(b.far), Color(0xFF2E3033))
        val disc = Brush.verticalGradient(
            0f to Color(0xFF1A1815), 0.2f to Color(0xFF6B5B3D), 0.42f to Color(0xFFC0A566), 0.7f to Color(0xFF725F3B), 1f to Color(0xFF181613),
            startY = (C.TURB_CY - 110).toFloat(), endY = (C.TURB_CY + 110).toFloat(),
        )
        for (b in C.BANDS.filter { it.turbine }) {
            val p = poly(C.bandPoints(b))
            drawPath(p, disc)
            drawPath(p, Color(0xFF14120F), style = Stroke(1f))
        }
        for ((_, b) in blades) b.near.forEachIndexed { i, q -> drawPath(quadsPath(q), NEAR_FILL[i]) }
    }

    // combustion: burner cans, core and turbine heat
    val burn = C.burnOpacity(egt, nowMs).toFloat()
    if (burn > 0f) {
        val burnStops = listOf(0f to Color(0xF2FFF0B0), 0.35f to Color(0xD9FF9A1F), 1f to Color(0x00E02A00))
        val hotStops = listOf(0f to Color(0xCCFF7A2A), 0.6f to Color(0x73D8360A), 1f to Color(0x00A01A00))
        glow(835f, 168f, 105f, 34f, burnStops, burn)
        glow(835f, 356f, 105f, 40f, burnStops, burn)
        glow(830f, 260f, 110f, 70f, hotStops, 0.7f * burn)
        glow(960f, 254f, 70f, 95f, hotStops, 0.85f * burn)
        glow(1065f, 252f, 95f, 120f, hotStops, 0.5f * burn)
        glow(1235f, 258f, 95f, 65f, hotStops, 0.55f * burn)
    }
    val spark = C.sparkOpacity(fuelOn, egt, nowMs).toFloat()
    if (spark > 0f) {
        val sparkStops = listOf(0f to Color.White, 0.4f to Color(0xD99BD0FF), 1f to Color(0x004AA0FF))
        glow(768f, 170f, 26f, 26f, sparkStops, spark)
        glow(764f, 350f, 26f, 26f, sparkStops, spark)
    }

    // exhaust plume beyond the cone tip
    if (plume > 0.05) {
        val pl = plume.toFloat()
        val path = Path().apply {
            moveTo(1398f, 258f)
            cubicTo(1440f, 258f - 34f * pl, 1495f, 258f - 24f * pl, 1425f + 150f * pl, 258f)
            cubicTo(1495f, 258f + 24f * pl, 1440f, 258f + 34f * pl, 1398f, 258f)
            close()
        }
        drawPath(
            path,
            Brush.horizontalGradient(0f to Color(0xE6FFD27A), 0.4f to Color(0x99FF7A1F), 1f to Color(0x00FF3A00), startX = 1398f, endX = 1575f),
            blendMode = BlendMode.Screen,
        )
    }

    // pneumatic starter on the accessory gearbox
    if (starterOn) {
        val pulse = (0.6 + 0.4 * Math.sin(nowMs / 400.0)).toFloat()
        drawRoundRect(Color(0xFFFFB020).copy(alpha = 0.22f * pulse), Offset(243f, 430f), androidx.compose.ui.geometry.Size(334f, 70f), androidx.compose.ui.geometry.CornerRadius(14f))
        drawRoundRect(Color(0xFFFFB020).copy(alpha = pulse), Offset(243f, 430f), androidx.compose.ui.geometry.Size(334f, 70f), androidx.compose.ui.geometry.CornerRadius(14f), style = Stroke(5f))
    }
}
